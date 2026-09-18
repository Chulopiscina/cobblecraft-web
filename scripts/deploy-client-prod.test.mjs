import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allPublished, assertEmptyIndex, assertNotDowngrade, commitFiles, config, prepareRelease, safePath, validateManifest, verifyBytes, verifySnapshot } from './deploy-client-prod.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const zip = Buffer.from([80, 75, 3, 4, 1, 2]);
function fixture() {
  const ids = ['cobblecraft-client', 'cobblecraft-resourcepack', 'xaeros-minimap', 'hub-map-final', 'yunque-arcano-guia'];
  return { environment: 'PROD', packVersion: '1.6.4-beta.1-rp1.4.6', server: { address: 'prod.example.org', port: 25565 },
    requiredFiles: ids.map(id => ({ id, relativePath: `mods/${id}.jar`, url: `${config.origin}/launcher/files/${id}.jar`, sha256: sha(zip), size: zip.length })), optionalFiles: [] };
}
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'cc-client-deploy-test-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Deployment tests');
  git(root, 'config', 'user.email', 'test@example.invalid');
  await writeFile(join(root, 'unrelated.txt'), 'original');
  await writeFile(join(root, 'asset.txt'), 'old');
  git(root, 'add', '--', 'unrelated.txt', 'asset.txt');
  git(root, 'commit', '-m', 'fixture');
  return root;
}

test('accepts PROD and rejects DEV/local addresses', () => {
  assert.equal(validateManifest(fixture()).packVersion, '1.6.4-beta.1-rp1.4.6');
  for (const address of ['127.0.0.1', 'localhost', '::1']) {
    const m = fixture(); m.server.address = address;
    assert.throws(() => validateManifest(m), /publico/);
  }
  const m = fixture(); m.environment = 'DEV';
  assert.throws(() => validateManifest(m), /PROD/);
});

test('allows forward releases and idempotent repeats, rejects downgrades', () => {
  assertNotDowngrade('1.6.3-beta.1-rp1.4.5', '1.6.4-beta.1-rp1.4.6');
  assertNotDowngrade('1.6.4-beta.1-rp1.4.6', '1.6.4-beta.1-rp1.4.6');
  assert.throws(() => assertNotDowngrade('1.6.4-beta.1-rp1.4.6', '1.6.3-beta.1-rp1.4.5'), /downgrade/);
});

test('rejects path traversal, Windows paths, encoded paths and duplicate destinations', () => {
  for (const path of ['../bad', '/bad', 'C:/bad', 'a\\bad', 'a/../b', 'a//b', 'a/%2e%2e', 'x?secret']) {
    assert.throws(() => safePath(path));
  }
  const m = fixture(); m.requiredFiles[1].relativePath = m.requiredFiles[0].relativePath.toUpperCase();
  assert.throws(() => validateManifest(m));
});

test('rejects missing mandatory assets, duplicate IDs, invalid hashes and foreign URLs', () => {
  const mutations = [
    m => m.requiredFiles.pop(),
    m => { m.requiredFiles[1].id = m.requiredFiles[0].id; },
    m => { m.requiredFiles[0].sha256 = 'wrong'; },
    m => { m.requiredFiles[0].url = 'https://other.example.org/a.jar'; },
    m => { m.requiredFiles[0].url = `${config.origin}/unrelated/page.jar`; },
    m => { m.requiredFiles[0].url += '?secret=test'; },
  ];
  for (const mutate of mutations) { const m = fixture(); mutate(m); assert.throws(() => validateManifest(m)); }
});

test('checks artifact hashes, sizes and binary signatures', () => {
  const file = fixture().requiredFiles[0];
  verifyBytes(zip, file);
  assert.throws(() => verifyBytes(Buffer.from('wrong!'), file), /Hash/);
  const html = Buffer.from('<html>');
  assert.throws(() => verifyBytes(html, { ...file, sha256: sha(html), size: html.length }), /ZIP/);
  assert.throws(() => verifyBytes(zip, { ...file, relativePath: 'config/x.png' }), /PNG/);
});

test('JourneyMap replacement requires icons and rejects two minimaps or retired mods', () => {
  const m = fixture();
  const old = m.requiredFiles.find(f => f.id === 'xaeros-minimap');
  const jm = { ...old, id: 'journeymap', relativePath: 'mods/journeymap.jar', url: 'https://cdn.modrinth.com/journeymap.jar' };
  m.requiredFiles = m.requiredFiles.filter(f => f.id !== old.id).concat(jm);
  assert.throws(() => validateManifest(m), /iconos/);
  m.requiredFiles.push({ ...old, id: 'cobblemon-minimap-icons', relativePath: 'resourcepacks/CobbleCraft-Pokemon-Minimap-Icons-U11.zip', url: 'https://cdn.modrinth.com/icons.zip' });
  assert.equal(validateManifest(m), m);
  m.requiredFiles.push(old);
  assert.throws(() => validateManifest(m), /exactamente un minimapa/);
  m.requiredFiles.pop();
  m.optionalFiles.push(old);
  assert.throws(() => validateManifest(m), /segundo minimapa/);
  m.optionalFiles = [{ ...old, id: 'unrelated-id', relativePath: 'mods/moonlight.jar' }];
  assert.throws(() => validateManifest(m), /Moonlight/);
});

test('release allowlist rejects unrelated web files and corrupt artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc-release-test-'));
  await mkdir(join(root, 'web/launcher/files'), { recursive: true });
  await writeFile(join(root, 'web/launcher/pack-manifest.json'), JSON.stringify(fixture()));
  await writeFile(join(root, 'web/launcher/files/cobblecraft-client.jar'), zip);
  assert.equal((await prepareRelease(root)).names.length, 2);
  await writeFile(join(root, 'web/index.html'), 'unrelated');
  await assert.rejects(prepareRelease(root), /ajeno/);
  const corrupted = await mkdtemp(join(tmpdir(), 'cc-corrupt-test-'));
  await mkdir(join(corrupted, 'web/launcher/files'), { recursive: true });
  await writeFile(join(corrupted, 'web/launcher/pack-manifest.json'), JSON.stringify(fixture()));
  await writeFile(join(corrupted, 'web/launcher/files/cobblecraft-client.jar'), 'broken');
  await assert.rejects(prepareRelease(corrupted), /Hash/);
});

test('selective commit preserves unrelated unstaged changes; repeat creates no commit', async () => {
  const repo = await repository();
  await writeFile(join(repo, 'unrelated.txt'), 'user work');
  await writeFile(join(repo, 'asset.txt'), 'new');
  const commit = commitFiles(repo, ['asset.txt'], 'test');
  assert.equal(git(repo, 'show', '--format=', '--name-only', commit), 'asset.txt');
  assert.equal(git(repo, 'status', '--porcelain'), 'M unrelated.txt');
  assert.equal(await readFile(join(repo, 'unrelated.txt'), 'utf8'), 'user work');
  assert.equal(commitFiles(repo, ['asset.txt'], 'test'), commit);
});

test('preexisting staging is preserved and blocks the operation', async () => {
  const repo = await repository();
  await writeFile(join(repo, 'unrelated.txt'), 'staged user work');
  git(repo, 'add', '--', 'unrelated.txt');
  assert.throws(() => assertEmptyIndex(repo), /staged/);
  assert.throws(() => commitFiles(repo, ['asset.txt'], 'test'), /staged/);
  assert.equal(git(repo, 'diff', '--cached', '--name-only'), 'unrelated.txt');
});

test('snapshot mismatch prevents deploying unrelated local build changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc-snapshot-test-'));
  await writeFile(join(root, 'index.html'), 'dirty local build');
  await assert.rejects(verifySnapshot(root, config.origin, async () => ({ sha256: sha('published build'), size: 15 })), /distinto al publicado/);
});

test('a release that only changes the launcher manifest is not treated as already published', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc-published-test-'));
  await mkdir(join(root, 'web/launcher'), { recursive: true });
  const pack = Buffer.from('{"packVersion":"1.8.6-beta.1-rp1.4.9"}');
  const launcher = Buffer.from('{"version":"1.3.0"}');
  await writeFile(join(root, 'web/launcher/pack-manifest.json'), pack);
  await writeFile(join(root, 'web/launcher/launcher-manifest.json'), launcher);
  const release = { source: join(root, 'web'), names: ['launcher/pack-manifest.json', 'launcher/launcher-manifest.json'] };
  const production = new Map([['pack', pack], ['launcher', launcher]]);
  const read = async url => production.get(url.includes('launcher-manifest') ? 'launcher' : 'pack');
  assert.equal(await allPublished(release, read), true);
  production.set('launcher', Buffer.from('{"version":"1.2.0"}'));
  assert.equal(await allPublished(release, read), false);
  production.set('launcher', null);
  assert.equal(await allPublished(release, read), false);
  production.set('launcher', launcher);
  production.set('pack', Buffer.from('{"packVersion":"1.8.5-beta.1-rp1.4.8"}'));
  assert.equal(await allPublished(release, read), false);
});
