export interface GuideCategory {
  slug: string;
  title: string;
  description: string;
  icon: string;
  href: string;
}

/** Índice visual de /guia - solo sistemas REALES del servidor. */
export const categories: GuideCategory[] = [
  { slug: "primeros-pasos", title: "Primeros Pasos", description: "Por dónde empezar en CobbleCraft, paso a paso.", icon: "hub", href: "/guia/primeros-pasos" },
  { slug: "investigaciones", title: "Investigaciones Pokémon", description: "Laboratorio, fósiles, leyendas, Ultraentes y rutas especiales.", icon: "cristal", href: "/guia/investigaciones" },
  { slug: "items", title: "Ítems", description: "Catálogo de objetos propios de CobbleCraft.", icon: "material", href: "/guia/items" },
  { slug: "crafteos", title: "Crafteos", description: "Recetas reales, ingrediente a ingrediente.", icon: "altar", href: "/guia/crafteos" },
  { slug: "objetos", title: "Atlas de Objetos", description: "Cadenas de progresión: de dónde sale cada objeto y a dónde te lleva.", icon: "coleccion", href: "/guia/objetos" },
  { slug: "accesorios", title: "Accesorios", description: "27 accesorios, 27 espacios en la Bolsa - colecciónalos todos.", icon: "accesorio", href: "/guia/accesorios" },
  { slug: "cofres", title: "Cofres y Llaves", description: "5 cofres, cada uno con su propia llave.", icon: "cofre", href: "/guia/cofres" },
  { slug: "cosmeticos", title: "Cosméticos", description: "Colección puramente visual - nunca dan ventaja de combate, economía o progresión.", icon: "cosmetico", href: "/guia/cosmeticos" },
  { slug: "pesca", title: "Pesca", description: "Minijuego, rarezas y materiales del Hub.", icon: "pesca", href: "/guia/pesca" },
  { slug: "slayer", title: "Slayer", description: "4 Cacerías contra Jefes cada vez más difíciles.", icon: "slayer", href: "/guia/slayer" },
  { slug: "liga", title: "Liga Pokémon", description: "5 entrenadores reales, de Nv.120 a Nv.160.", icon: "medalla", href: "/guia/liga" },
  { slug: "skills", title: "Skills", description: "Las 8 habilidades del servidor.", icon: "cristal", href: "/guia/skills" },
  { slug: "economia", title: "Economía", description: "De dónde sale y a dónde va el dinero.", icon: "moneda", href: "/guia/economia" },
  { slug: "claims", title: "Claims", description: "Protege tu terreno con el Topógrafo.", icon: "escudo", href: "/guia/claims" },
  { slug: "encantamientos", title: "Encantamientos", description: "9 familias reales, Nivel I a VI.", icon: "libro", href: "/guia/encantamientos" },
  { slug: "maestria", title: "Maestría", description: "El equipo endgame definitivo.", icon: "jefe", href: "/guia/maestria" },
  { slug: "mercado", title: "Mercado", description: "Compra y vende con otros jugadores.", icon: "mercado", href: "/guia/mercado" },
];
