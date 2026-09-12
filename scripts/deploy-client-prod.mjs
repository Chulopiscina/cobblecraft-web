import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const config = Object.freeze({
  project: 'cobblemon-server-site',
  account: 'b8d7ba6cd04e09b3df85cfe40182bd8e',
  origin: 'https://cobblemon-server-site.pages.dev',
  gitRemote: 'https://github.com/Chulopiscina/cobblecraft-web.git',
  branch: 'main',
});
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = 'launcher/pack-manifest.json';
const supportFiles = ['scripts/deploy-client-prod.mjs', 'scripts/deploy-client-prod.test.mjs', 'docs/CLIENT_PROD_DEPLOY.md'];
// These non-public Pages controls belong to the verified production build, not dirty public/.
const controls = {
  _headers: '15f1078e41cdf381a4a8db135a0e5abab95dcb903c1828f457f41818029e63eb',
  _redirects: '998b895ae87de2ee73edcccfc71332e2b9330c7a7bf8476d13948158a6b86877',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const list = value => value.split('\0').filter(Boolean);

export function safePath(value) {
  assert(typeof value === 'string' && value.length > 0 && !/[\\:%?#\x00-\x1f]/.test(value)
    && value.split('/').every(p => p && p !== '.' && p !== '..'), `Ruta no segura: ${value}`);
  return value;
}

export function validateManifest(manifest) {
  assert(manifest.environment === 'PROD', 'Solo se permiten manifests PROD.');
  assert(/^\d+\.\d+\.\d+-beta\.\d+-rp\d+\.\d+\.\d+$/.test(manifest.packVersion), 'packVersion PROD no valida.');
  assert(manifest.server?.address && !/^(localhost|127\.|0\.|::1$)/i.test(manifest.server.address)
    && Number.isInteger(manifest.server.port) && manifest.server.port > 0 && manifest.server.port <= 65535,
  'El manifest PROD debe mantener un servidor publico.');
  assert(Array.isArray(manifest.requiredFiles) && Array.isArray(manifest.optionalFiles), 'Listas de archivos no validas.');
  const ids = new Set(), paths = new Set(), urls = new Set();
  for (const file of [...manifest.requiredFiles, ...manifest.optionalFiles]) {
    safePath(file.relativePath);
    assert(/^(mods|config|resourcepacks)\//.test(file.relativePath), `Destino cliente no permitido: ${file.relativePath}`);
    const url = new URL(file.url);
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && [config.origin, 'https://cdn.modrinth.com'].includes(url.origin), `URL no permitida para ${file.id}`);
    assert(typeof file.id === 'string' && file.id && /^[a-f0-9]{64}$/.test(file.sha256)
      && Number.isSafeInteger(file.size) && file.size > 0, `Metadatos invalidos: ${file.id}`);
    assert(!ids.has(file.id) && !paths.has(file.relativePath.toLowerCase()) && !urls.has(file.url), `Entrada duplicada: ${file.id}`);
    ids.add(file.id); paths.add(file.relativePath.toLowerCase()); urls.add(file.url);
    if (url.origin === config.origin) {
      const path = safePath(decodeURIComponent(url.pathname.slice(1)));
      assert(/^launcher\/files\/[^/]+$/.test(path), `Asset web no permitido: ${path}`);
    }
  }
  for (const id of ['cobblecraft-client', 'cobblecraft-resourcepack', 'xaeros-minimap', 'hub-map-final', 'yunque-arcano-guia']) {
    assert(manifest.requiredFiles.some(f => f.id === id), `Falta archivo obligatorio: ${id}`);
  }
  assert(![...ids].some(id => /map.?atlases|moonlight/i.test(id)), 'No reintroducir Map Atlases/Moonlight.');
  return manifest;
}

export function assertNotDowngrade(previous, next) {
  const left = previous.match(/\d+/g)?.map(Number);
  const right = next.match(/\d+/g)?.map(Number);
  assert(left?.length === 7 && right?.length === 7, 'No se pueden comparar las versiones PROD.');
  const first = left.findIndex((value, index) => value !== right[index]);
  assert(first < 0 || right[first] > left[first], `Se rechaza downgrade de ${previous} a ${next}.`);
}

export async function files(root, prefix = '') {
  assert(!(await lstat(root)).isSymbolicLink(), `No se permiten enlaces simbolicos: ${root}`);
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const name = safePath(prefix + entry.name);
    if (entry.isDirectory()) result.push(...await files(join(root, entry.name), `${name}/`));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`No se permiten enlaces ni entradas especiales: ${name}`);
  }
  return result.sort();
}

export function verifyBytes(bytes, file) {
  assert(bytes.length === file.size && hash(bytes) === file.sha256, `Hash/tamano incorrecto: ${file.relativePath}`);
  if (/\.(jar|zip)$/.test(file.relativePath)) assert(bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])), `ZIP/JAR no valido: ${file.id}`);
  if (file.relativePath.endsWith('.png')) assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `PNG no valido: ${file.id}`);
}

export async function prepareRelease(release) {
  const source = join(resolve(release), 'web');
  const manifest = validateManifest(await json(join(source, manifestPath)));
  const entries = new Map([...manifest.requiredFiles, ...manifest.optionalFiles]
    .filter(f => new URL(f.url).origin === config.origin)
    .map(f => [decodeURIComponent(new URL(f.url).pathname.slice(1)), f]));
  const names = await files(source);
  for (const name of names) {
    assert(name === manifestPath || entries.has(name), `Archivo ajeno en la actualizacion: ${name}`);
    if (name !== manifestPath) verifyBytes(await readFile(join(source, name)), entries.get(name));
  }
  return { source, manifest, names };
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
}

export function assertEmptyIndex(repo) {
  assert(!git(repo, ['diff', '--cached', '--name-only', '-z']), 'Hay cambios staged previos. No se modificara el index.');
}

export function commitFiles(repo, paths, version) {
  assertEmptyIndex(repo);
  for (const path of paths) safePath(path);
  git(repo, ['add', '--', ...paths]);
  const staged = list(git(repo, ['diff', '--cached', '--name-only', '-z']));
  assert(staged.every(path => paths.includes(path)), 'El index contiene archivos ajenos; no se hara commit.');
  if (staged.length) git(repo, ['commit', '-m', `Deploy client pack ${version}`, '--only', '--', ...staged]);
  return git(repo, ['rev-parse', 'HEAD']);
}

async function get(url, { allow404 = false, redirect = 'follow' } = {}) {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(url, { redirect, cache: 'no-store', signal: AbortSignal.timeout(120000) });
      if (response.status < 500 && response.status !== 429) break;
    } catch { /* Retry transient network failures without logging request credentials. */ }
    if (attempt < 2) await sleep(1500 * (attempt + 1));
  }
  assert(response && (response.ok || (allow404 && response.status === 404)
    || (redirect === 'manual' && [301, 302, 307, 308].includes(response.status))), `HTTP ${response?.status ?? 'sin respuesta'}: ${url}`);
  return response;
}

async function downloadHash(url, allow404 = false) {
  const r = await get(url, { allow404 });
  const digest = createHash('sha256');
  let size = 0;
  for await (const chunk of r.body) { digest.update(chunk); size += chunk.length; }
  return { sha256: digest.digest('hex'), size };
}

async function verifyRequired(manifest, releaseSource, releaseNames = []) {
  const verified = [];
  for (const file of [...manifest.requiredFiles, ...manifest.optionalFiles]) {
    const path = decodeURIComponent(new URL(file.url).pathname.slice(1));
    if (releaseSource && new URL(file.url).origin === config.origin && releaseNames.includes(path)) {
      verifyBytes(await readFile(join(releaseSource, path)), file);
    } else {
      const remote = await downloadHash(file.url);
      assert(remote.sha256 === file.sha256 && remote.size === file.size, `Descarga publica incorrecta: ${file.id}`);
    }
    verified.push({ id: file.id, url: file.url, sha256: file.sha256, size: file.size });
  }
  console.log(`Verificados ${verified.length} archivos del manifest (SHA256 y tamano).`);
  return verified;
}

async function cfClient() {
  const wrangler = join(web, 'node_modules/wrangler/bin/wrangler.js');
  try {
    execFileSync(process.execPath, [wrangler, 'whoami'], {
      cwd: web, stdio: 'pipe', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
  } catch { throw new Error('Autenticacion Cloudflare necesaria: ejecutar wrangler login en web.'); }
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const candidates = [join(homedir(), '.wrangler/config/default.toml')];
    if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'));
    candidates.push(join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), '.wrangler/config/default.toml'));
    const path = candidates.find(existsSync);
    assert(path, 'No se encuentra la autenticacion de Wrangler.');
    try {
      const { experimental_readRawConfig } = await import('wrangler');
      const { rawConfig } = experimental_readRawConfig({ config: path });
      token = rawConfig.oauth_token || rawConfig.api_token;
    } catch { throw new Error('No se pudo leer la autenticacion de Wrangler.'); }
  }
  assert(token, 'Falta autenticacion Cloudflare.');
  return async (suffix = '') => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account}/pages/projects/${config.project}${suffix}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    assert(response.ok && data.success, `Cloudflare HTTP ${response.status}; codigos: ${data.errors?.map(e => e.code).join(',')}`);
    return data.result;
  };
}

function assertProject(project) {
  assert(project.name === config.project && project.production_branch === config.branch && !project.source,
    'Se esperaba el proyecto Direct Upload PROD/main; no se cambiara su configuracion.');
  const deployment = project.canonical_deployment;
  assert(deployment?.environment === 'production' && deployment.latest_stage?.status === 'success'
    && !deployment.uses_functions, 'Se requiere un despliegue estatico PROD correcto, sin Functions.');
  const url = new URL(deployment.url);
  assert(url.protocol === 'https:' && url.hostname.endsWith(`.${config.project}.pages.dev`), 'URL inmutable no valida.');
  return deployment;
}

export async function verifySnapshot(source, base, fetchHash = downloadHash) {
  const inventory = [];
  for (const name of await files(source)) {
    assert(!name.split('/').some(p => p.startsWith('.') || p === 'functions') && !name.startsWith('_worker'), `Archivo no estatico: ${name}`);
    const bytes = await readFile(join(source, name));
    const local = { path: name, sha256: hash(bytes), size: bytes.length };
    if (name in controls) {
      assert(local.sha256 === controls[name], `Control Pages diferente al validado: ${name}`);
    } else {
      const remote = await fetchHash(new URL(name, `${base}/`), name === '404.html');
      assert(remote.sha256 === local.sha256 && remote.size === local.size, `Build local distinto al publicado: ${name}. No se desplegara.`);
    }
    inventory.push(local);
  }
  assert(inventory.some(f => f.path === 'index.html') && inventory.some(f => f.path === manifestPath), 'Build incompleto.');
  for (const name of Object.keys(controls)) assert(inventory.some(f => f.path === name), `Falta control Pages: ${name}`);
  return inventory;
}

async function verifyControls(base) {
  const response = await get(`${base}/${manifestPath}`);
  assert(response.headers.get('cache-control')?.includes('no-cache'), 'El manifest debe revalidarse, no quedar cacheado.');
  await response.body.cancel();
  const redirect = await get(`${base}/downloads/CobbleCraft-Launcher-latest.zip`, { redirect: 'manual' });
  assert(redirect.status === 302 && redirect.headers.get('location') === `${config.gitRemote.replace(/\.git$/, '')}/releases/latest/download/CobbleCraft-Launcher-latest.zip`, 'El redirect estable del launcher ha cambiado.');
  await redirect.body.cancel();
}

export async function main(argv) {
  const { values } = parseArgs({ args: argv, options: {
    release: { type: 'string' }, baseline: { type: 'string' },
    'check-only': { type: 'boolean', default: false }, 'verify-only': { type: 'boolean', default: false },
  } });
  assert(values.release, 'Uso: node web/scripts/deploy-client-prod.mjs --release dist/client-update/0.11.6 [--check-only|--verify-only]');
  assert(!(values['check-only'] && values['verify-only']), 'Elegir un solo modo.');
  const release = await prepareRelease(values.release);
  const manifestBytes = await readFile(join(release.source, manifestPath));
  if (values['verify-only']) {
    const publicBytes = Buffer.from(await (await get(`${config.origin}/${manifestPath}`)).arrayBuffer());
    assert(hash(publicBytes) === hash(manifestBytes), 'Manifest publico diferente del preparado.');
    await verifyRequired(release.manifest);
    await verifyControls(config.origin);
    console.log(`PROD OK: ${release.manifest.packVersion}`);
    return;
  }
  const managed = release.names.map(name => `site/public/${name}`);
  const allowed = [...managed, ...supportFiles];
  assert(git(web, ['rev-parse', '--show-toplevel']).replaceAll('\\', '/').toLowerCase() === web.replaceAll('\\', '/').toLowerCase(), 'Raiz Git incorrecta.');
  assert(git(web, ['branch', '--show-current']) === config.branch, 'La rama web debe ser main.');
  assert(git(web, ['remote', 'get-url', 'origin']) === config.gitRemote, 'Remote Git inesperado.');
  assert(git(web, ['remote', 'get-url', '--push', 'origin']) === config.gitRemote, 'Remote de push inesperado.');
  assertEmptyIndex(web);
  git(web, ['fetch', '--no-tags', 'origin', config.branch]);
  const remoteHead = git(web, ['rev-parse', 'FETCH_HEAD']);
  assert(git(web, ['merge-base', 'HEAD', remoteHead]) === remoteHead, 'main remota ha avanzado o diverge; no se hara force-push.');
  // Inspect every unpushed commit, including changes later reverted, not just the net diff.
  for (const commit of git(web, ['rev-list', `${remoteHead}..HEAD`]).split('\n').filter(Boolean)) {
    const changed = list(git(web, ['diff-tree', '--no-commit-id', '--name-only', '-z', '-r', '-m', commit]));
    assert(changed.every(path => allowed.includes(path)), `Commit ajeno sin publicar: ${commit}. No se hara push.`);
  }
  for (const path of managed) {
    if (git(web, ['status', '--porcelain', '--', path]) && existsSync(join(web, path))) {
      assert(hash(await readFile(join(web, path))) === hash(await readFile(join(release.source, path.slice('site/public/'.length)))), `Cambio local ajeno: ${path}`);
    }
  }
  const api = await cfClient();
  const deployment = assertProject(await api());
  const stateRoot = join(web, '.wrangler/client-prod');
  const stateFile = join(stateRoot, 'last-success.json');
  const previous = existsSync(stateFile) ? await json(stateFile) : null;
  const baseline = values.baseline ? resolve(values.baseline)
    : previous?.deploymentId === deployment.id ? previous.stage : join(web, 'site/dist');
  const before = await verifySnapshot(baseline, deployment.url);
  await verifyControls(deployment.url);
  const oldManifest = validateManifestForBaseline(await json(join(baseline, manifestPath)));
  assertNotDowngrade(oldManifest.packVersion, release.manifest.packVersion);
  assert(JSON.stringify(oldManifest.server) === JSON.stringify(release.manifest.server), 'Esta actualizacion no puede cambiar el servidor PROD.');
  await verifyRequired(release.manifest, release.source, release.names);
  console.log(`Direct Upload: ${deployment.id}; build verificado: ${before.length} archivos; actualizacion: ${release.names.length} archivos.`);
  if (values['check-only']) { console.log('CHECK OK. Sin copiar, stage, commit, push ni deploy.'); return; }
  await mkdir(stateRoot, { recursive: true });
  const run = await mkdtemp(join(stateRoot, `${release.manifest.packVersion}-`));
  const stage = join(run, 'site');
  await mkdir(stage);
  for (const file of before) {
    await mkdir(dirname(join(stage, file.path)), { recursive: true });
    await copyFile(join(baseline, file.path), join(stage, file.path));
    assert(hash(await readFile(join(stage, file.path))) === file.sha256, `Build modificado durante la copia: ${file.path}`);
  }
  for (const name of release.names) {
    const bytes = await readFile(join(release.source, name));
    if (name === manifestPath) assert(hash(bytes) === hash(manifestBytes), 'Manifest modificado durante el despliegue.');
    else verifyBytes(bytes, release.manifest.requiredFiles.concat(release.manifest.optionalFiles).find(f => new URL(f.url).origin === config.origin && decodeURIComponent(new URL(f.url).pathname.slice(1)) === name));
    await mkdir(dirname(join(stage, name)), { recursive: true });
    await writeFile(join(stage, name), bytes);
    await mkdir(dirname(join(web, 'site/public', name)), { recursive: true });
    await writeFile(join(web, 'site/public', name), bytes);
  }
  const commit = commitFiles(web, managed, release.manifest.packVersion);
  git(web, ['push', 'origin', `HEAD:refs/heads/${config.branch}`]);
  assert(git(web, ['ls-remote', 'origin', `refs/heads/${config.branch}`]).split(/\s/)[0] === commit, 'GitHub no confirma el commit.');
  assert(assertProject(await api()).id === deployment.id, 'Produccion cambio durante la preparacion. No se desplegara sobre ella.');
  const audit = { packVersion: release.manifest.packVersion, commit, previousDeployment: deployment.url,
    previousDeploymentId: deployment.id, stage, changed: release.names, previousFiles: before };
  await writeFile(join(run, 'deployment.json'), JSON.stringify(audit, null, 2));
  const identical = (await downloadHash(`${config.origin}/${manifestPath}`)).sha256 === hash(manifestBytes);
  let finalDeployment = deployment;
  if (!identical) {
    console.log(`Publicando solo el cliente en Pages PROD/main (${commit.slice(0, 7)})...`);
    try {
      execFileSync(process.execPath, [join(web, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'deploy', stage,
        '--project-name', config.project, '--branch', config.branch, '--commit-hash', commit,
        '--commit-message', `Client pack ${release.manifest.packVersion}`, '--commit-dirty=true'], {
        cwd: run, stdio: 'pipe', timeout: 600000,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.account, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
      });
    } catch { throw new Error(`Wrangler no confirmo el deploy. Revisar Pages antes de reintentar. Informe: ${join(run, 'deployment.json')}`); }
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const current = (await api()).canonical_deployment;
      if (current?.deployment_trigger?.metadata?.commit_hash === commit && current.latest_stage?.status === 'success') {
        const remote = await downloadHash(`${config.origin}/${manifestPath}`);
        if (remote.sha256 === hash(manifestBytes)) { finalDeployment = current; ready = true; break; }
      }
      await sleep(5000);
    }
    assert(ready, 'El deploy no se ha confirmado publicamente dentro de 5 minutos.');
  }
  // Verify the entire published site: unrelated HTML, store, routes and assets must stay byte-identical.
  const finalFiles = await verifySnapshot(stage, config.origin);
  const verified = await verifyRequired(release.manifest);
  await verifyControls(config.origin);
  assert(assertProject(await api()).id === finalDeployment.id, 'Otro despliegue ha sustituido la verificacion.');
  const result = { ...audit, deploymentId: finalDeployment.id, deploymentUrl: finalDeployment.url,
    checkedAt: new Date().toISOString(), finalFiles, verified, status: 'OK' };
  await writeFile(join(run, 'verification.json'), JSON.stringify(result, null, 2));
  await writeFile(stateFile, JSON.stringify(result, null, 2));
  console.log(`DESPLIEGUE OK: ${release.manifest.packVersion}\nCommit: ${commit}\nURL: ${finalDeployment.url}\nInforme: ${join(run, 'verification.json')}`);
}

function validateManifestForBaseline(manifest) {
  assert(manifest.environment === 'PROD' && manifest.server && manifest.packVersion, 'El build base no es PROD.');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(`DESPLIEGUE BLOQUEADO: ${error.message}`); process.exitCode = 1; });
}
