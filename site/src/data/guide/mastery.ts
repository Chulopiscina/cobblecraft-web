/** Los 3 tiers reales de Maestría (`gear-sets.properties`, verificado 2026-09-05). */
export interface MasteryTier {
  tier: number;
  name: string;
  base: string;
  requiredSlayerLevel: number;
  requiredFishingLevel: number;
  fourPieceAttackEv: number;
  fourPieceDefenceEv: number;
  helmetSlug: string;
}

export const masteryTiers: MasteryTier[] = [
  { tier: 1, name: "Conjunto de Maestría I", base: "Diamante", requiredSlayerLevel: 30, requiredFishingLevel: 30, fourPieceAttackEv: 32, fourPieceDefenceEv: 32, helmetSlug: "maestria-i-helmet" },
  { tier: 2, name: "Conjunto de Maestría II", base: "Netherite", requiredSlayerLevel: 50, requiredFishingLevel: 50, fourPieceAttackEv: 64, fourPieceDefenceEv: 64, helmetSlug: "maestria-ii-helmet" },
  { tier: 3, name: "Conjunto de Maestría III", base: "Netherite", requiredSlayerLevel: 70, requiredFishingLevel: 70, fourPieceAttackEv: 96, fourPieceDefenceEv: 96, helmetSlug: "maestria-iii-helmet" },
];
