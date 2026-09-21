import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv as parse } from 'node:util';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const secretFile = resolve(web, '.wrangler/operations.env');
let env = {};
try { env = parse(await readFile(secretFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (process.argv.includes('--configure')) {
  execFileSync('git', ['check-ignore', '--quiet', secretFile], { cwd: web });
  const token = env.OPERATIONS_TOKEN || randomBytes(32).toString('hex');
  try {
    execFileSync(process.execPath, [resolve(web, 'node_modules/wrangler/bin/wrangler.js'), 'secret', 'put', 'OPERATIONS_TOKEN', '--name', 'cobblemon-server-store'], {
      cwd: resolve(web, 'worker'), input: token, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
  } catch { throw new Error('No se pudo configurar el secreto de diagnostico en Cloudflare.'); }
  await mkdir(dirname(secretFile), { recursive: true });
  await writeFile(secretFile, `OPERATIONS_TOKEN=${token}\n`, { mode: 0o600 });
  console.log('Diagnostico configurado. Token solo en archivo ignorado y secret del Worker.');
} else {
  const token = process.env.OPERATIONS_TOKEN || env.OPERATIONS_TOKEN;
  if (!token) throw new Error('Ejecutar primero node scripts/production-health.mjs --configure');
  const orderIndex = process.argv.indexOf('--order');
  const order = orderIndex >= 0 ? process.argv[orderIndex + 1] : undefined;
  if (orderIndex >= 0 && !/^ord_[A-Z2-9]{20}$/.test(order ?? '')) throw new Error('Referencia de pedido invalida.');
  const base = 'https://cobblemon-server-store.cobblemon-server.workers.dev';
  const response = await fetch(`${base}/api/admin/diagnostics${order ? '?order=' + encodeURIComponent(order) : ''}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Diagnostico HTTP ${response.status}`);
  const data = await response.json();
  if (order || process.argv.includes('--json')) console.log(JSON.stringify(data, null, 2));
  else {
    let webOk = false;
    try { webOk = (await fetch('https://cobblemon-server-site.pages.dev/estado/', { signal: AbortSignal.timeout(10000) })).ok; } catch {}
    console.log(`WEB ${webOk ? 'OK' : 'NO DISPONIBLE'}`);
    console.log(`WORKER OK ${data.worker.version}`);
    console.log(`D1 ${data.d1.reachable ? 'OK' : 'ERROR'}`);
    console.log(`MINECRAFT ${data.minecraft.heartbeatFresh ? String(data.minecraft.state).toUpperCase() : 'SIN DATOS ACTUALES'}`);
    console.log(`DISCORD ${data.discord.online ? 'ONLINE' : 'SIN CONEXION VERIFICADA'}`);
    console.log(`PEBBLEHOST ${!data.pebble.configured ? 'FALTA API KEY' : data.pebble.lastError || (data.pebble.verified && data.pebble.heartbeatFresh ? 'VERIFICADO' : 'NO VERIFICADO')}`);
    console.log(`TEBEX ${data.tebex.credentialsConfigured ? 'CLAVES CONFIGURADAS; QA REAL POR VERIFICAR' : 'FALTAN CREDENCIALES'}; checkout ${data.tebex.checkoutEnabled ? 'ACTIVO' : 'DESACTIVADO'}`);
    console.log(`ENTREGAS ${data.delivery?.last_success_at ? 'ULTIMO POLLING ' + new Date(data.delivery.last_success_at).toISOString() : 'SIN POLLING VERIFICADO'}`);
    console.log('PEDIDOS ' + JSON.stringify(data.d1.counts));
    console.log('REVISION ' + JSON.stringify(data.d1.reviewRequired));
  }
}
