/** Las 8 Skills reales del servidor (`skills.properties`, orden real: fishing, mining, combat, farming, foraging, pokemon_catching, pokemon_breeding, slayer). */
export interface SkillInfo {
  id: string;
  name: string;
  icon: string;
  grantsXpFrom: string;
  unlocks: string;
}

export const skills: SkillInfo[] = [
  {
    id: "fishing",
    name: "Pesca",
    icon: "pesca",
    grantsXpFrom: "Pescar en la zona de Pesca especial del Hub, completando el minijuego de tensión del sedal.",
    unlocks: "Cañas y armadura de Pesca por tier, acceso a materiales de loot más raros, y es uno de los dos requisitos (junto a Cazador) para el equipo de Maestría.",
  },
  {
    id: "mining",
    name: "Minería",
    icon: "mineria",
    grantsXpFrom: "Minar bloques minerales reales en el mundo.",
    unlocks: "Picos Diglett → Dugtrio → Drilbur → Excadrill, y armaduras de Onix, Rhydon y Regirock. La Fortuna compatible suma sobre el drop base.",
  },
  {
    id: "combat",
    name: "Combate",
    icon: "combate",
    grantsXpFrom: "Vencer combates Pokémon reales.",
    unlocks: "Espadas y armadura temáticas por tier (Machop, Machoke, Machamp).",
  },
  {
    id: "farming",
    name: "Agricultura",
    icon: "agricultura",
    grantsXpFrom: "Recolectar cultivos maduros y cosechar Bonguris/Apricorns de verdad; se conserva la protección contra ciclos artificiales de colocar/romper.",
    unlocks: "Azadas y armadura temáticas por tier (Oddish, Tangela, Shaymin).",
  },
  {
    id: "foraging",
    name: "Tala y Recolección",
    icon: "recoleccion",
    grantsXpFrom: "Talar árboles y recolectar recursos del bosque.",
    unlocks: "Hachas Applin → Appletun → Seedot → Shiftry, y armaduras de Sudowoodo, Trevenant y Torterra.",
  },
  {
    id: "pokemon_catching",
    name: "Captura Pokémon",
    icon: "captura",
    grantsXpFrom: "Capturar Pokémon salvajes.",
    unlocks: "Armadura de Captura por tier (Ariados, Noctowl, Absol). El bonus sale del equipo y sus encantamientos: los antiguos amuletos y accesorios están retirados.",
  },
  {
    id: "pokemon_breeding",
    name: "Cría Pokémon",
    icon: "cria",
    grantsXpFrom: "Eclosionar huevos reales de Daycare+, la guardería actual en los pastos de Cobblemon.",
    unlocks: "Progreso de Cría de CobbleCraft. Las sesiones antiguas siguen reclamables o cancelables; no se abren nuevas en el sistema retirado.",
  },
  {
    id: "slayer",
    name: "Cazador (Slayer)",
    icon: "slayer",
    grantsXpFrom: "Completar Cacerías contra los Jefes Slayer.",
    unlocks: "Acceso a Cacerías de tier superior, armadura/arma de Slayer Combat (Cazador, Veterano, Maestro), y es uno de los dos requisitos (junto a Pesca) para el equipo de Maestría.",
  },
];
