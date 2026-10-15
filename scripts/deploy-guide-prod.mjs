import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { config, cfClient, assertProject, files, verifySnapshot, assertEmptyIndex } from './deploy-client-prod.mjs';
import { sources, updateGuideSource, renameShinyText } from './shiny-guide-content.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '.wrangler/guide-prod');
const stateFile = join(root, 'prepared.json');
const clientState = join(web, '.wrangler/client-prod/last-success.json');
const hash = b => createHash('sha256').update(b).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const git = (args, input) => execFileSync('git', args, { cwd: web, input, encoding: 'utf8', maxBuffer: 64*1024*1024, stdio: ['pipe','pipe','pipe'] }).trimEnd();
const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
const controls = ['scripts/deploy-client-prod.mjs','scripts/deploy-guide-prod.mjs','scripts/shiny-guide-content.mjs','scripts/shiny-guide-content.test.mjs'];
async function copy(from, to) { await mkdir(dirname(to), { recursive: true }); await copyFile(from, to); }

export function cardRange(html) {
  let found;
  const visit = node => {
    if (node.attrs?.some(a => a.name === 'id' && a.value === 'armor') &&
        node.attrs.some(a => a.name === 'class' && a.value.split(/\s/).includes('crate-card'))) {
      assert(!found, 'Tarjeta armor duplicada'); found = node.sourceCodeLocation;
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parse(html, { sourceCodeLocationInfo: true }));
  assert(found?.startOffset >= 0 && found.endOffset > found.startOffset, 'No existe tarjeta armor verificable');
  return found;
}

export function replaceCrateCard(published, built) {
  const old = cardRange(published), next = cardRange(built);
  const card = built.slice(next.startOffset, next.endOffset);
  assert(card.includes('Cofre Shiny') && card.includes('70%') && card.includes('25%') && card.includes('5%'));
  return published.slice(0, old.startOffset) + card + published.slice(old.endOffset);
}

async function commitSources() {
  assertEmptyIndex(web);
  const reference = git(['rev-parse', 'HEAD']);
  for (const path of sources) {
    const old = git(['show', `${reference}:${path}`]) + '\n';
    const next = updateGuideSource(path, old);
    assert.notEqual(next, old, `Ya migrada o fuente inesperada: ${path}`);
    // Partial index: do not stage unrelated edits already present in items.ts/home.
    const work = await readFile(join(web, path), 'utf8');
    assert.equal(updateGuideSource(path, work), work, `Falta aplicar cambio al worktree: ${path}`);
    const oid = git(['hash-object', '-w', '--stdin'], next);
    git(['update-index', '--add', '--cacheinfo', `100644,${oid},${path}`]);
  }
  git(['add', '--', ...controls]);
  const staged = git(['diff', '--cached', '--name-only']).split('\n');
  assert(staged.every(path => [...sources, ...controls].includes(path)), 'Index con cambios ajenos');
  git(['commit', '-m', 'Correct Shiny crate guide and preserve isolated production snapshots']);
  console.log(`GUIDE_COMMIT ${git(['rev-parse', 'HEAD'])} reference=${reference}`);
}

async function buildSource(commit, target) {
  await mkdir(target, { recursive: true });
  const names = git(['ls-tree', '-r', '--name-only', commit, '--', 'site/src', 'shared', 'store',
    'site/astro.config.mjs', 'site/tsconfig.json', 'site/package.json']).split('\n');
  for (const name of names) {
    const out = join(target, name);
    await mkdir(dirname(out), { recursive: true });
    const bytes = execFileSync('git', ['show', `${commit}:${name}`], { cwd: web, maxBuffer: 64*1024*1024 });
    await writeFile(out, bytes);
  }
  await symlink(join(web, 'node_modules'), join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  try {
    execFileSync(process.execPath, [join(web, 'node_modules/astro/astro.js'), 'build', '--root', join(target, 'site')], {
      cwd: target, env: { ...env, PUBLIC_STORE_ENV: 'prod', PUBLIC_SITE_URL: config.origin,
        PUBLIC_API_BASE_URL: 'https://cobblemon-server-store.cobblemon-server.workers.dev' },
      stdio: 'pipe', maxBuffer: 32*1024*1024,
    });
  } catch (error) { throw new Error(`Build Astro fallo: ${String(error.stdout || '').slice(-4000)} ${String(error.stderr || '').slice(-4000)}`); }
  return join(target, 'site/dist');
}

async function prepare(getProject) {
  const deployment = assertProject(await getProject());
  const previous = await json(clientState);
  assert.equal(previous.deploymentId, deployment.id, 'Baseline no corresponde a PROD');
  const baseline = resolve(previous.stage);
  assert(baseline.startsWith(join(web, '.wrangler') + '\\') || baseline.startsWith(join(web, '.wrangler') + '/'));
  const inventory = await verifySnapshot(baseline, deployment.url);
  const commit = git(['rev-parse', 'HEAD']);
  const reference = git(['rev-parse', 'HEAD^']);
  const changed = git(['diff', '--name-only', reference, commit]).split('\n');
  assert(changed.every(path => [...sources, ...controls].includes(path)), 'Commit con fuentes ajenas');
  for (const path of sources) {
    assert.equal(git(['show', `${commit}:${path}`]), updateGuideSource(path, git(['show', `${reference}:${path}`])));
  }
  await mkdir(root, { recursive: true });
  const run = await mkdtemp(join(root, 'release-'));
  console.log('Clean builds aislados de la guia antes/despues; no se compila el worktree sucio.');
  const before = await buildSource(reference, join(run, 'before'));
  const after = await buildSource(commit, join(run, 'after'));
  const js = async dir => {
    const out = [];
    for (const name of await files(join(dir, '_astro'))) if (name.endsWith('.js')) {
      const bytes = await readFile(join(dir, '_astro', name));
      if (/Cofre (?:de Armaduras|Shiny)/.test(bytes.toString())) out.push({ name: `_astro/${name}`, bytes });
    }
    return out;
  };
  const oldJs = await js(before), newJs = await js(after);
  assert.equal(oldJs.length, 1, 'Indice de busqueda previo ambiguo');
  assert.equal(newJs.length, 1, 'Indice de busqueda nuevo ambiguo');
  const oldAsset = oldJs[0], newAsset = newJs[0];
  assert.equal(hash(await readFile(join(baseline, oldAsset.name))), hash(oldAsset.bytes),
    'El indice publico contiene otros cambios; no se reemplazara por un indice distinto');
  assert.notEqual(oldAsset.name, newAsset.name, 'El asset inmutable debe cambiar de URL');
  assert(!/Cofre de Armaduras|Llave de Armaduras/.test(newAsset.bytes.toString()));
  const stage = join(run, 'site'), managed = [];
  const builtCrates = await readFile(join(after, 'guia/cofres/index.html'), 'utf8');
  for (const item of inventory) {
    const original = await readFile(join(baseline, item.path));
    let bytes = original;
    if (item.path.endsWith('.html')) {
      let html = original.toString();
      if (item.path === 'guia/cofres/index.html') html = replaceCrateCard(html, builtCrates);
      html = renameShinyText(html).replaceAll(oldAsset.name, newAsset.name);
      bytes = Buffer.from(html);
    }
    const output = join(stage, item.path);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
    if (hash(bytes) !== item.sha256) managed.push(item.path);
  }
  await copy(join(after, newAsset.name), join(stage, newAsset.name));
  managed.push(newAsset.name);
  assert(managed.includes('guia/cofres/index.html') && managed.includes('index.html'));
  const manifest = [];
  for (const name of await files(stage)) {
    const bytes = await readFile(join(stage, name));
    const prior = inventory.find(p => p.path === name);
    if (!managed.includes(name)) assert.equal(hash(bytes), prior.sha256, `Cambio ajeno: ${name}`);
    if (name.endsWith('.html')) assert(!/Cofre de Armaduras|Llave de Armaduras|Voto, Suministros, Armaduras/.test(bytes.toString()), `Referencia vieja: ${name}`);
    manifest.push({ path: name, sha256: hash(bytes), size: bytes.length });
  }
  assert.equal(hash(await readFile(join(stage, 'launcher/pack-manifest.json'))),
    hash(await readFile(join(baseline, 'launcher/pack-manifest.json'))), 'Pack cambiado');
  const state = { commit, reference, previous, previousDeploymentId: deployment.id, stage, managed, manifest };
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  console.log(`GUIA PREPARADA: ${managed.length} archivos; tienda, launcher, RP y resto intactos. ${stage}`);
}

async function deploy(getProject) {
  const state = await json(stateFile);
  assert.equal(assertProject(await getProject()).id, state.previousDeploymentId, 'PROD cambio; repetir prepare');
  assert.equal(git(['rev-parse', 'HEAD']), state.commit, 'HEAD cambio');
  assert.equal(git(['remote', 'get-url', 'origin']), config.gitRemote);
  git(['fetch', '--no-tags', 'origin', config.branch]);
  const remote = git(['rev-parse', 'FETCH_HEAD']);
  assert.equal(git(['merge-base', 'HEAD', remote]), remote, 'Remote divergente');
  assert(git(['diff', '--name-only', remote, 'HEAD']).split('\n').filter(Boolean).every(p => [...sources, ...controls].includes(p)), 'Push con cambios ajenos');
  git(['push', 'origin', `HEAD:refs/heads/${config.branch}`]);
  for (const file of state.manifest) assert.equal(hash(await readFile(join(state.stage, file.path))), file.sha256);
  execFileSync(process.execPath, [join(web, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'deploy', state.stage,
    '--project-name', config.project, '--branch', config.branch, '--commit-hash', state.commit,
    '--commit-message', 'Shiny crate guide only', '--commit-dirty=false'], { cwd: web, env, stdio: 'inherit' });
  let published;
  for (let attempt = 0; attempt < 60; attempt++) {
    published = assertProject(await getProject());
    if (published.id !== state.previousDeploymentId && published.deployment_trigger?.metadata?.commit_hash === state.commit) break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  assert(published.id !== state.previousDeploymentId && published.deployment_trigger?.metadata?.commit_hash === state.commit);
  await verifySnapshot(state.stage, published.url);
  const checks = [];
  for (const path of state.managed) {
    const url = `${config.origin}/${path.replace(/index\.html$/, '')}`;
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, url);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), state.manifest.find(p => p.path === path).sha256, url);
    checks.push({ url, http: response.status });
  }
  await writeFile(clientState, JSON.stringify({ ...state.previous, stage: state.stage, deploymentId: published.id,
    deploymentUrl: published.url, commit: state.commit, status: 'OK' }, null, 2));
  await writeFile(join(root, 'last-success.json'), JSON.stringify({ commit: state.commit, deploymentId: published.id,
    deploymentUrl: published.url, stage: state.stage, checks }, null, 2));
  console.log(`GUIA PUBLICADA ${published.url}; ${checks.length} HTTP 200/SHA verificados; pack conservado.`);
}

export async function main(argv) {
  if (argv.includes('--commit-sources')) return commitSources();
  const api = await cfClient();
  if (argv.includes('--prepare')) return prepare(api);
  if (argv.includes('--deploy')) return deploy(api);
  throw new Error('Uso: --commit-sources | --prepare | --deploy');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
