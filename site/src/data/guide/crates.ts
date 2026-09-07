/** Los 5 cofres reales (`crates/CrateConfig.kt` DEFAULTS, verificado 2026-09-05). Probabilidades reales, redondeadas. */
export interface CrateInfo {
  id: string;
  name: string;
  keySlug: string;
  keyName: string;
  description: string;
  rewardTypes: string[];
  rarityBreakdown: { rarity: string; percent: number }[];
  howToGetKey: string;
}

export const crates: CrateInfo[] = [
  {
    id: "vote",
    name: "Cofre de Voto",
    keySlug: "llave-de-voto",
    keyName: "Llave de Voto",
    description: "El cofre más accesible - sencillo pero variado.",
    rewardTypes: ["Dinero (100-700)", "Poké/Gran Balls", "Pociones", "Caramelo Raro", "Libros de encantamiento Tier I", "Llave de Suministros (poco frecuente)", "Vale de Skin: Armadura Abisal (real, muy poco frecuente)"],
    rarityBreakdown: [
      { rarity: "Común", percent: 67.6 },
      { rarity: "Poco Común", percent: 25.1 },
      { rarity: "Rara", percent: 5.8 },
      { rarity: "Muy Rara", percent: 1.5 },
    ],
    howToGetKey: "Votar por CobbleCraft: escribe /vote en el juego, sigue el enlace seguro a esta web y confirma tu voto. 1 voto = 1 Llave de Voto.",
  },
  {
    id: "supplies",
    name: "Cofre de Suministros",
    keySlug: "llave-de-suministros",
    keyName: "Llave de Suministros",
    description: "Materiales, consumibles y algún objeto útil para tu progresión.",
    rewardTypes: ["Dinero (150-350)", "Pociones", "Poké Balls", "Superpoción", "Gran Balls", "Libro Fortuna de Minería/Agricultura", "Caramelo Raro", "Llave de Armaduras (poco frecuente)", "Cosmético (futuro, muy poco frecuente)"],
    rarityBreakdown: [
      { rarity: "Común", percent: 63.6 },
      { rarity: "Poco Común", percent: 27.1 },
      { rarity: "Rara", percent: 8.4 },
      { rarity: "Muy Rara", percent: 0.9 },
    ],
    howToGetKey: "Método de obtención directo: próximamente / aún no definido.",
  },
  {
    id: "armor",
    name: "Cofre de Armaduras",
    keySlug: "llave-de-armaduras",
    keyName: "Llave de Armaduras",
    description: "Piezas de equipamiento real de progresión temprana/media - nunca endgame.",
    rewardTypes: ["Dinero (100-250)", "Lingotes de Hierro", "Pociones", "Yelmo de Onix (Minería I)", "Coraza de Ariados (Captura I)", "Grebas de Machop (Combate I)", "Botas de Onix (Minería I)", "Diamantes", "Llave Épica (poco frecuente)", "Cosmético (futuro, muy poco frecuente)"],
    rarityBreakdown: [
      { rarity: "Común", percent: 45.4 },
      { rarity: "Poco Común", percent: 37.5 },
      { rarity: "Rara", percent: 14.1 },
      { rarity: "Muy Rara", percent: 3.0 },
    ],
    howToGetKey: "Método de obtención directo: próximamente / aún no definido.",
  },
  {
    id: "cosmetics",
    name: "Cofre de Cosméticos",
    keySlug: "llave-de-cosmeticos",
    keyName: "Llave de Cosméticos",
    description: "100% cosmético - Skins de Pokémon, Skins de Armadura y Títulos reales, sin dinero ni objetos de gameplay (ver /guia/cosmeticos).",
    rewardTypes: ["Skin Pokémon: Gengar Espectral (objeto físico)", "Título: Coleccionista (real)", "Vale de Skin: Armadura del Explorador (real)", "Vale de Skin: Armadura Ígnea (real)", "Vale de Skin: Armadura Arcana (real)", "Cosmético futuro - Suministros", "Cosmético futuro - Colección", "Cosmético épico futuro"],
    rarityBreakdown: [
      { rarity: "Poco Común", percent: 33.0 },
      { rarity: "Rara", percent: 54.0 },
      { rarity: "Muy Rara", percent: 13.0 },
    ],
    howToGetKey: "Método de obtención directo: próximamente / aún no definido.",
  },
  {
    id: "epic",
    name: "Cofre Épico",
    keySlug: "llave-epica",
    keyName: "Llave Épica",
    description: "El cofre más difícil de conseguir - mejor contenido, pero nunca endgame completo. Sin P2W.",
    rewardTypes: ["Dinero (500-1500)", "Caramelo Raro", "Poción Máxima", "Yelmo de Rhydon (Minería II)", "Coraza de Machoke (Combate II)", "Libro Poder de Cacería I", "2x Llave de Voto", "1x Llave de Armaduras", "Cosmético épico futuro", "Vale de Skin: Armadura Real de Diamante (real)"],
    rarityBreakdown: [
      { rarity: "Común", percent: 36.1 },
      { rarity: "Poco Común", percent: 38.2 },
      { rarity: "Rara", percent: 19.6 },
      { rarity: "Muy Rara", percent: 6.2 },
    ],
    howToGetKey: "Método de obtención directo: próximamente / aún no definido.",
  },
];
