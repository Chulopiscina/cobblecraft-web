import test from 'node:test';
import assert from 'node:assert/strict';
import { renameShinyText, updateGuideSource } from './shiny-guide-content.mjs';
import { replaceCrateCard } from './deploy-guide-prod.mjs';

test('names change but real IDs and legacy URLs remain intact', () => {
  const old = 'Llave de Armaduras; Cofre de Armaduras; progression:crate_key/armor; /guia/items/llave-de-armaduras';
  const next = renameShinyText(old);
  assert.equal(next, 'Llave Shiny; Cofre Shiny; progression:crate_key/armor; /guia/items/llave-de-armaduras');
  assert.equal(renameShinyText(next), next);
});
test('obsolete epic-key drop is removed instead of inventing a drop in the Shiny crate', () => {
  const next = renameShinyText('Método de obtención directo: próximamente / aún no definido. Puede aparecer como premio poco frecuente del Cofre de Armaduras.');
  assert.equal(next, 'Método de obtención directo: próximamente / aún no definido.');
});
test('source patch refuses unrelated paths and preserves unrelated edits', () => {
  assert.throws(() => updateGuideSource('site/src/pages/tienda/index.astro', 'anything'));
  assert.equal(updateGuideSource('site/src/data/guide/items.ts', 'PERSONALIZADO\nname: "Llave de Armaduras"\n'),
    'PERSONALIZADO\nname: "Llave Shiny"\n');
});
test('crate card replacement preserves all surrounding live HTML, including unrelated store/launcher controls', () => {
  const before = '<header>DOWNLOAD LAUNCHER</header><div class="card crate-card" id="armor"><h2>old</h2></div><footer>LIVE STORE</footer>';
  const built = '<div class="card crate-card" id="armor"><h2>Cofre Shiny</h2><p>70% 25% 5%</p></div>';
  assert.equal(replaceCrateCard(before, built), '<header>DOWNLOAD LAUNCHER</header>'+built+'<footer>LIVE STORE</footer>');
  assert.throws(() => replaceCrateCard('no matching card', built));
});
