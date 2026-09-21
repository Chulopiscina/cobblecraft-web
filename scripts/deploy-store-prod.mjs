import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, readdir, copyFile, symlink, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, verifySnapshot } from './deploy-client-prod.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(web, 'node_modules/wrangler/bin/wrangler.js');
const root = join(web, '.wrangler/store-prod');
const statePath = join(root, 'prepared.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const git = args => execFileSync('git', args, { cwd: web, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const runtimeEnv = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
async function api() {
  try { execFileSync(process.execPath, [wrangler, 'whoami'], { cwd: web, stdio: 'pipe', env: runtimeEnv }); }
  catch { throw new Error('Autenticacion Cloudflare necesaria.'); }
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const candidates = [join(homedir(), '.wrangler/config/default.toml'),
      join(process.env.APPDATA || homedir(), 'xdg.config/.wrangler/config/default.toml'),
      join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), '.wrangler/config/default.toml')];
    const file = candidates.find(existsSync);
    assert(file, 'No se encuentra la autenticacion Wrangler.');
    const { experimental_readRawConfig } = await import('wrangler');
    const { rawConfig } = experimental_readRawConfig({ config: file });
    token = rawConfig.oauth_token || rawConfig.api_token;
  }
  assert(token, 'Falta autenticacion.');
  return async () => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account}/pages/projects/${config.project}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
    });
    const value = await r.json();
    assert(r.ok && value.success, `Cloudflare HTTP ${r.status}`);
    const project = value.result;
    assert(project.production_branch === 'main' && !project.source, 'Se esperaba Pages Direct Upload/main.');
    assert(project.canonical_deployment?.environment === 'production' && project.canonical_deployment?.latest_stage?.status === 'success'
      && !project.canonical_deployment.uses_functions, 'El despliegue PROD no es un snapshot estatico valido.');
    return project.canonical_deployment;
  };
}
async function files(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'No se admiten enlaces en el snapshot.');
    const name = prefix + entry.name;
    if (entry.isDirectory()) out.push(...await files(join(dir, entry.name), `${name}/`));
    else out.push(name);
  }
  return out;
}
async function copy(from, to) { await mkdir(dirname(to), { recursive: true }); await copyFile(from, to); }
const getProject = await api();
const deployment = await getProject();
if (process.argv.includes('--prepare')) {
  const commit = git(['rev-parse', 'HEAD']);
  assert(!git(['diff', '--cached', '--name-only']), 'El index debe estar limpio.');
  const previous = await json(join(web, '.wrangler/client-prod/last-success.json'));
  assert(previous.deploymentId === deployment.id, 'El snapshot local no corresponde al PROD actual. No se publicara.');
  const baseline = resolve(previous.stage);
  assert(baseline.startsWith(join(web, '.wrangler') + '\\') || baseline.startsWith(join(web, '.wrangler') + '/'), 'Snapshot fuera del workspace.');
  console.log('Validando snapshot PROD antes de preparar SOLO tienda...');
  const before = await verifySnapshot(baseline, deployment.url);
  await mkdir(root, { recursive: true });
  const run = await mkdtemp(join(root, 'release-'));
  const source = join(run, 'source');
  const stage = join(run, 'site');
  await mkdir(source, { recursive: true });
  for (const item of before) await copy(join(baseline, item.path), join(stage, item.path));
  // Build committed store sources, never the unrelated dirty worktree or public/ artifacts.
  const tracked = git(['ls-tree', '-r', '--name-only', commit, '--', 'site/src', 'shared', 'store', 'site/astro.config.mjs', 'site/tsconfig.json', 'site/package.json']).split('\n');
  for (const name of tracked) {
    if (name.startsWith('site/src/pages/') && !name.startsWith('site/src/pages/tienda/') && name !== 'site/src/pages/estado.astro') continue;
    const target = join(source, name);
    await mkdir(dirname(target), { recursive: true });
    const bytes = execFileSync('git', ['show', `${commit}:${name}`], { cwd: web, maxBuffer: 16 * 1024 * 1024 });
    await writeFile(target, bytes);
  }
  await symlink(join(web, 'node_modules'), join(source, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  execFileSync(process.execPath, [join(web, 'node_modules/astro/astro.js'), 'build', '--root', join(source, 'site')], {
    cwd: source, stdio: 'inherit', env: { ...runtimeEnv, PUBLIC_STORE_ENV: 'prod', PUBLIC_SITE_URL: config.origin,
      PUBLIC_API_BASE_URL: 'https://cobblemon-server-store.cobblemon-server.workers.dev' },
  });
  const built = join(source, 'site/dist');
  const pages = ['tienda/index.html', 'tienda/rango-explorador/index.html', 'tienda/rango-maestro/index.html', 'tienda/rango-leyenda/index.html', 'tienda/gracias/index.html', 'tienda/cancelado/index.html', 'estado/index.html'];
  const managed = [...pages, ...(await files(join(built, '_astro'))).map(p => `_astro/${p}`)];
  for (const name of managed) {
    const bytes = await readFile(join(built, name));
    const prior = before.find(f => f.path === name);
    if (name.startsWith('_astro/') && prior) assert(prior.sha256 === sha(bytes), `Colision de asset existente: ${name}`);
    await copy(join(built, name), join(stage, name));
  }
  const manifest = [];
  for (const name of await files(stage)) {
    const bytes = await readFile(join(stage, name));
    const prior = before.find(f => f.path === name);
    if (!managed.includes(name)) assert(prior?.sha256 === sha(bytes), `Archivo ajeno modificado: ${name}`);
    manifest.push({ path: name, sha256: sha(bytes), size: bytes.length });
  }
  const state = { commit, previousDeploymentId: deployment.id, previous, stage, managed, manifest };
  await writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(`PREPARADO: ${stage}. Solo ${pages.length} paginas de tienda y sus assets; resto identico a PROD.`);
} else if (process.argv.includes('--deploy')) {
  const state = await json(statePath);
  assert(state.previousDeploymentId === deployment.id, 'PROD cambio desde la preparacion. Repetir --prepare.');
  assert(git(['rev-parse', 'HEAD']) === state.commit, 'HEAD cambio desde la preparacion.');
  assert(git(['remote', 'get-url', 'origin']) === config.gitRemote, 'Remote inesperado.');
  assert(git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] === state.commit, 'Publicar primero el commit validado en main.');
  for (const item of state.manifest) assert(sha(await readFile(join(state.stage, item.path))) === item.sha256, `Snapshot alterado: ${item.path}`);
  execFileSync(process.execPath, [wrangler, 'pages', 'deploy', state.stage, '--project-name', config.project, '--branch', 'main', '--commit-hash', state.commit, '--commit-dirty=false'], {
    cwd: web, stdio: 'inherit', env: runtimeEnv,
  });
  let published;
  for (let attempt = 0; attempt < 30; attempt++) {
    published = await getProject();
    if (published.deployment_trigger?.metadata?.commit_hash === state.commit && published.id !== state.previousDeploymentId) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert(published?.deployment_trigger?.metadata?.commit_hash === state.commit && published.id !== state.previousDeploymentId, 'No se confirma el nuevo despliegue.');
  await verifySnapshot(state.stage, published.url);
  for (const name of state.managed.filter(p => p.endsWith('.html'))) {
    const url = `${config.origin}/${name.replace(/index\.html$/, '')}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    assert(response.ok && sha(Buffer.from(await response.arrayBuffer())) === state.manifest.find(f => f.path === name).sha256, `URL publica diferente: ${url}`);
    console.log(`VERIFICADO ${url}`);
  }
  // Keep the verified baseline pointer usable for subsequent official Direct Uploads.
  await writeFile(join(web, '.wrangler/client-prod/last-success.json'), JSON.stringify({ ...state.previous, stage: state.stage,
    deploymentId: published.id, deploymentUrl: published.url, commit: state.commit, status: 'OK' }, null, 2));
  await writeFile(join(root, 'last-success.json'), JSON.stringify({ commit: state.commit, deploymentId: published.id, deploymentUrl: published.url, stage: state.stage }, null, 2));
  console.log(`PAGES OK ${published.url}`);
} else throw new Error('Uso: node scripts/deploy-store-prod.mjs --prepare | --deploy');
