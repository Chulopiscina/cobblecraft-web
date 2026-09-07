/** Datos reales de `claim-tiers.properties` + `ProtectionRockTier.kt` + `claims-vendor.properties` (verificado 2026-09-05). */
export interface ClaimTierRow {
  skillsRequired: number;
  minSkillLevel: number;
  limit: number;
}

/** Tramos de límite de chunks reclamables - sube con el progreso REAL de tus Skills, nunca una barra separada. */
export const claimTiers: ClaimTierRow[] = [
  { skillsRequired: 0, minSkillLevel: 0, limit: 4 },
  { skillsRequired: 1, minSkillLevel: 10, limit: 8 },
  { skillsRequired: 1, minSkillLevel: 20, limit: 12 },
  { skillsRequired: 2, minSkillLevel: 20, limit: 16 },
  { skillsRequired: 2, minSkillLevel: 35, limit: 24 },
  { skillsRequired: 3, minSkillLevel: 40, limit: 32 },
  { skillsRequired: 3, minSkillLevel: 60, limit: 48 },
  { skillsRequired: 4, minSkillLevel: 75, limit: 64 },
  { skillsRequired: 4, minSkillLevel: 90, limit: 80 },
];

export interface ProtectionRock {
  name: string;
  sideBlocks: number;
  price: number;
}

/** Rocas de Protección vendidas por el Topógrafo - crean un área protegida real al colocarse. */
export const protectionRocks: ProtectionRock[] = [
  { name: "Roca de Protección de Carbón", sideBlocks: 16, price: 100 },
  { name: "Roca de Protección de Hierro", sideBlocks: 32, price: 500 },
  { name: "Roca de Protección de Oro", sideBlocks: 64, price: 2500 },
  { name: "Roca de Protección de Diamante", sideBlocks: 96, price: 10000 },
];
