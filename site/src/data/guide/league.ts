/** Datos reales de `league.properties` (los 5 entrenadores reales, verificado 2026-09-05). Presentados en orden ascendente de nivel (el orden que ve el jugador de forma natural). Composiciones de equipo NO reveladas a propósito. */
export interface LeagueTrainer {
  id: string;
  name: string;
  type: string;
  level: number;
  rewardMoney: number;
  tokenSlug: string;
  tokenName: string;
  repeatable: boolean;
}

export const leagueTrainers: LeagueTrainer[] = [
  { id: "league_water", name: "Comodoro Abisal", type: "Agua", level: 120, rewardMoney: 300, tokenSlug: "perla-del-comodoro", tokenName: "Perla del Comodoro Abisal", repeatable: true },
  { id: "league_fire", name: "Piromante Vulcanis", type: "Fuego", level: 130, rewardMoney: 450, tokenSlug: "insignia-del-piromante", tokenName: "Ascua del Piromante Vulcanis", repeatable: true },
  { id: "league_ghost", name: "Nigromante Penumbra", type: "Fantasma", level: 140, rewardMoney: 650, tokenSlug: "reliquia-del-nigromante", tokenName: "Reliquia del Nigromante Penumbra", repeatable: true },
  { id: "league_grass", name: "Guardabosques Sylvana", type: "Planta", level: 150, rewardMoney: 900, tokenSlug: "semilla-del-guardabosques", tokenName: "Semilla del Guardabosques Sylvana", repeatable: true },
  { id: "league_dragon", name: "Archimago Draconis", type: "Dragón", level: 160, rewardMoney: 1500, tokenSlug: "escama-del-archimago", tokenName: "Escama del Archimago Draconis", repeatable: true },
];
