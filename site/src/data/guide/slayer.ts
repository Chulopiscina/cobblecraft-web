/** Datos reales de `slayer.properties` (verificado 2026-09-06; niveles de jefe de progression_core 0.18.11.73: 35 / 55 / 80 / 100). */
export interface SlayerTier {
  tier: number;
  id: string;
  name: string;
  boss: string;
  species: string;
  bossLevel: number;
  requiredSlayerLevel: number;
  requiredKills: number;
  rewardMoney: number;
  rewardItemSlug: string;
  rewardItemName: string;
  rewardAmount: number;
  contractSlug: string;
}

export const slayerTiers: SlayerTier[] = [
  {
    tier: 1,
    id: "espectral",
    name: "Cacería Espectral",
    boss: "Espectro Voraz",
    species: "Gengar",
    bossLevel: 35,
    requiredSlayerLevel: 0,
    requiredKills: 12,
    rewardMoney: 300,
    rewardItemSlug: "esencia-de-gengar",
    rewardItemName: "Esencia de Gengar",
    rewardAmount: 3,
    contractSlug: "contrato-de-caceria-i",
  },
  {
    tier: 2,
    id: "abisal",
    name: "Cacería Abisal",
    boss: "Leviatán Furioso",
    species: "Gyarados",
    bossLevel: 55,
    requiredSlayerLevel: 5,
    requiredKills: 20,
    rewardMoney: 650,
    rewardItemSlug: "escama-de-gyarados",
    rewardItemName: "Escama de Gyarados",
    rewardAmount: 3,
    contractSlug: "contrato-de-caceria-ii",
  },
  {
    tier: 3,
    id: "carmesi",
    name: "Cacería Carmesí",
    boss: "Cuchilla Carmesí",
    species: "Scizor",
    bossLevel: 80,
    requiredSlayerLevel: 15,
    requiredKills: 30,
    rewardMoney: 1400,
    rewardItemSlug: "coraza-de-scizor",
    rewardItemName: "Coraza de Scizor",
    rewardAmount: 2,
    contractSlug: "contrato-de-caceria-iii",
  },
  {
    tier: 4,
    id: "draconico",
    name: "Cacería Dracónica",
    boss: "Depredador Dracónico",
    species: "Garchomp",
    bossLevel: 100,
    requiredSlayerLevel: 30,
    requiredKills: 40,
    rewardMoney: 2900,
    rewardItemSlug: "colmillo-de-garchomp",
    rewardItemName: "Colmillo de Garchomp",
    rewardAmount: 1,
    contractSlug: "contrato-de-caceria-iv",
  },
];
