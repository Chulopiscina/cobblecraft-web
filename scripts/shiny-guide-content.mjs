// Exact content migration shared by isolated source preparation and published HTML.
// Legacy slugs/real item IDs intentionally stay unchanged, preserving existing links/keys.
export const sources = ['site/src/data/guide/crates.ts', 'site/src/data/guide/items.ts', 'site/src/pages/index.astro'];
const oldEpicOrigin = 'Método de obtención directo: próximamente / aún no definido. Puede aparecer como premio poco frecuente del Cofre de Armaduras.';
const oldKeyDescription = 'Llave exclusiva del Cofre de Armaduras.';
const oldFaq = '5 cofres distintos (Voto, Suministros, Armaduras, Cosméticos y Épico), cada uno con su propia llave y sus propias recompensas - dinero, objetos, equipo y futuros cosméticos, con probabilidades visibles dentro del juego.';
const newFaq = '5 cofres distintos (Voto, Suministros, Shiny, Cosméticos y Épico), cada uno con su propia llave y sus propias recompensas. El Cofre Shiny entrega un Pokémon siempre shiny. Las probabilidades son visibles dentro del juego.';

export function renameShinyText(text) {
  return text.replaceAll(oldEpicOrigin, 'Método de obtención directo: próximamente / aún no definido.')
    .replaceAll(oldKeyDescription, 'Llave exclusiva del Cofre Shiny: entrega un Pokémon siempre shiny entre 50 especies.')
    .replaceAll(oldFaq, newFaq)
    .replaceAll('Cofre de Armaduras', 'Cofre Shiny').replaceAll('Llave de Armaduras', 'Llave Shiny');
}

export function updateGuideSource(path, text) {
  if (!sources.includes(path)) throw new Error(`Fuente no autorizada: ${path}`);
  let result = renameShinyText(text);
  if (path.endsWith('/crates.ts')) {
    result = result.replace('Piezas de equipamiento real de progresión temprana/media - nunca endgame.',
      'Un Pokémon siempre shiny entre 50 especies distintas, sin legendarios ni singulares.')
      .replace('["Dinero (100-250)", "Lingotes de Hierro", "Pociones", "Yelmo de Onix (Minería I)", "Coraza de Ariados (Captura I)", "Grebas de Machop (Combate I)", "Botas de Onix (Minería I)", "Diamantes", "Llave Épica (poco frecuente)", "Cosmético (futuro, muy poco frecuente)"]',
        '["1 Pokémon shiny garantizado", "50 especies posibles", "20 especies comunes, 20 raras y 10 de jackpot", "Sin premios de armadura, dinero ni llaves"]')
      .replace('{ rarity: "Común", percent: 45.4 },', '{ rarity: "Común", percent: 70 },')
      .replace('      { rarity: "Poco Común", percent: 37.5 },\r\n', '')
      .replace('      { rarity: "Poco Común", percent: 37.5 },\n', '')
      .replace('{ rarity: "Rara", percent: 14.1 },', '{ rarity: "Rara", percent: 25 },')
      .replace('{ rarity: "Muy Rara", percent: 3.0 },', '{ rarity: "Jackpot", percent: 5 },');
  }
  return result;
}
