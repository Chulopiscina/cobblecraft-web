/** Las 9 familias reales de EnchantFamily + precios Tier I del Encantador (`enchant-vendor.properties`, verificado 2026-09-05). */
export interface EnchantFamilyInfo {
  id: string;
  name: string;
  effect: string;
  tier1Price: number;
  itemSlug: string | null;
}

export const enchantFamilies: EnchantFamilyInfo[] = [
  { id: "fishing_luck", name: "Suerte de Pesca", effect: "Mejora la Suerte de Pesca al equipar la caña/armadura de Pesca correspondiente.", tier1Price: 150, itemSlug: "libro-suerte-de-pesca" },
  { id: "capture_luck", name: "Suerte de Captura", effect: "Mejora la probabilidad de captura de Pokémon salvajes.", tier1Price: 200, itemSlug: "libro-suerte-de-captura" },
  { id: "mining_fortune", name: "Fortuna de Minería", effect: "Mejora el rendimiento al minar.", tier1Price: 150, itemSlug: "libro-fortuna-de-mineria" },
  { id: "farming_fortune", name: "Fortuna de Agricultura", effect: "Mejora el rendimiento al cultivar.", tier1Price: 150, itemSlug: "libro-fortuna-de-agricultura" },
  { id: "foraging_fortune", name: "Fortuna de Recolección", effect: "Mejora el rendimiento al talar/recolectar.", tier1Price: 150, itemSlug: "libro-fortuna-de-recoleccion" },
  { id: "crit_chance", name: "Probabilidad Crítica", effect: "Mejora la probabilidad de golpe crítico en combate Pokémon.", tier1Price: 250, itemSlug: "libro-probabilidad-critica" },
  { id: "crit_damage", name: "Daño Crítico", effect: "Mejora el daño de los golpes críticos en combate Pokémon.", tier1Price: 250, itemSlug: "libro-dano-critico" },
  { id: "slayer_power", name: "Poder de Cacería", effect: "Mejora el daño contra Jefes Slayer (solo en armadura de Slayer Combat).", tier1Price: 300, itemSlug: "libro-poder-de-caceria" },
  { id: "slayer_resistance", name: "Resistencia de Cacería", effect: "Mejora la resistencia al daño de Jefes Slayer (solo en armadura de Slayer Combat).", tier1Price: 300, itemSlug: "libro-resistencia-de-caceria" },
];
