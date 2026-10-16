export interface ResearchHighlight {
  title: string;
  summary: string;
  details: string[];
}

export interface ResearchPokémonRoute {
  name: string;
  category: string;
  status: "Disponible" | "Reservado";
  route: string;
  requirements?: string;
}

export const researchHighlights: ResearchHighlight[] = [
  {
    title: "Investigaciones Pokémon",
    summary: "Sistema general para consultar cómo se obtienen los Pokémon especiales del servidor.",
    details: [
      "Disponible desde el menu de Investigaciones y desde NPCs especializados.",
      "Las fichas enlazan materiales, Máquinas, NPCs y requisitos relevantes.",
      "No sustituye los spawns naturales: solo documenta rutas especiales."
    ]
  },
  {
    title: "Laboratorio",
    summary: "Proyectos repetibles para Mewtwo y Genesect con el Científico.",
    details: [
      "Mewtwo: 3 Estrellas del Nether, 5 Gemas Psíquicas y 1 Bloque de Diamante.",
      "Genesect: 1 Dome Fossil, 1 Disco Extraño y 3 Fragmentos de Netherita.",
      "Type: Null está retirado del Científico; no existe ese proyecto de laboratorio. Silvally conserva su misión del Cronista."
    ]
  },
  {
    title: "Fósiles",
    summary: "Usa el multibloque real de Cobblemon: Fossil Analyzer, Data Monitor y Restoration Tank.",
    details: [
      "Dracozolt: Fossilized Bird + Fossilized Drake.",
      "Arctozolt: Fossilized Dino + Fossilized Bird.",
      "Dracovish: Fossilized Fish + Fossilized Drake.",
      "Arctovish: Fossilized Fish + Fossilized Dino."
    ]
  },
  {
    title: "Cronista de Leyendas",
    summary: "Misiones reales para legendarios y míticos.",
    details: [
      "Cada misión tiene objetivos y tier propio.",
      "El encuentro se desbloquea tras completar la misión.",
      "El sistema evita depender de spawns aleatorios para Pokémon especiales."
    ]
  },
  {
    title: "Explorador de Anomalías",
    summary: "Misiones reales para Ultraentes y Necrozma tras retirar Ultra Space del servidor.",
    details: [
      "Ultra Space fue eliminado definitivamente: ya no hay dimension paralela que explorar.",
      "Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Poipole, Stakataka y Blacephalon usan misiones.",
      "Necrozma es la misión mas exigente del Explorador de Anomalías."
    ]
  }
];

export const researchPokémonRoutes: ResearchPokémonRoute[] = [
  {
    name: "Mewtwo",
    category: "Laboratorio",
    status: "Disponible",
    route: "Proyecto de Laboratorio con entrega de materiales.",
    requirements: "Contenido de final de partida: Estrellas del Nether, Gemas Psíquicas y Bloque de Diamante."
  },
  {
    name: "Genesect",
    category: "Laboratorio",
    status: "Disponible",
    route: "Proyecto de Laboratorio con materiales de Fósil y tecnología.",
    requirements: "Dome Fossil, Disco Extraño y Fragmentos de Netherita."
  },
  {
    name: "Type: Null",
    category: "Laboratorio",
    status: "Reservado",
    route: "Retirado del Científico. No se ofrece como proyecto ni recompensa de Laboratorio.",
    requirements: "Los ejemplares ya obtenidos no se borran. Silvally tiene su propia ruta de misión."
  },
  {
    name: "Legendarios y Miticos",
    category: "Cronista de Leyendas",
    status: "Disponible",
    route: "Misiones por tiers con objetivos y encuentro capturable al completarlas."
  },
  {
    name: "Ultraentes",
    category: "Explorador de Anomalías",
    status: "Disponible",
    route: "Misiones independientes por Ultraente; Naganadel evoluciona desde Poipole con Pulso Dragón."
  },
  {
    name: "Necrozma",
    category: "Explorador de Anomalías",
    status: "Disponible",
    route: "misión propia de Tier IV, separada de Ultra Space.",
    requirements: "Requiere progresion avanzada; no aparece como spawn salvaje sin completar su misión."
  },
  {
    name: "Paradox",
    category: "Investigaciones",
    status: "Reservado",
    route: "Reservado para un futuro sistema de Anomalías temporales."
  }
];
