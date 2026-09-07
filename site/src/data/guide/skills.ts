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
    unlocks: "Picos y armadura temáticos por tier (Onix, Rhydon, Regirock), y el accesorio Pico Encantado/Lente del Prospector.",
  },
  {
    id: "combat",
    name: "Combate",
    icon: "combate",
    grantsXpFrom: "Vencer combates Pokémon reales.",
    unlocks: "Espadas y armadura temáticas por tier (Machop, Machoke, Machamp), y los accesorios de Crítico/EV Pokémon.",
  },
  {
    id: "farming",
    name: "Agricultura",
    icon: "agricultura",
    grantsXpFrom: "Cultivar y cosechar cultivos.",
    unlocks: "Azadas y armadura temáticas por tier (Oddish, Tangela, Shaymin), y el accesorio Semilla Fértil.",
  },
  {
    id: "foraging",
    name: "Tala y Recolección",
    icon: "recoleccion",
    grantsXpFrom: "Talar árboles y recolectar recursos del bosque.",
    unlocks: "Hachas y armadura temáticas por tier (Sudowoodo, Trevenant, Torterra), y el accesorio Amuleto del Bosque.",
  },
  {
    id: "pokemon_catching",
    name: "Captura Pokémon",
    icon: "captura",
    grantsXpFrom: "Capturar Pokémon salvajes.",
    unlocks: "Armadura de Captura por tier (Ariados, Noctowl, Absol) y los 4 Amuletos de Captura (Meowth, Persian, Chansey, Blissey).",
  },
  {
    id: "pokemon_breeding",
    name: "Cría Pokémon",
    icon: "cria",
    grantsXpFrom: "Criar Pokémon con el sistema de Cría propio del servidor.",
    unlocks: "Progreso de Cría propio de CobbleCraft.",
  },
  {
    id: "slayer",
    name: "Cazador (Slayer)",
    icon: "slayer",
    grantsXpFrom: "Completar Cacerías contra los Jefes Slayer.",
    unlocks: "Acceso a Cacerías de tier superior, armadura/arma de Slayer Combat (Cazador, Veterano, Maestro), y es uno de los dos requisitos (junto a Pesca) para el equipo de Maestría.",
  },
];
