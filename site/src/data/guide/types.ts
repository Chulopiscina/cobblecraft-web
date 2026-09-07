/**
 * Esquema único del dataset de la Guía CobbleCraft. Todo el contenido de `/guia` se deriva de
 * estos archivos de datos (generados a mano a partir del estado REAL de `progression_core` -
 * configs/catálogos verificados uno a uno, nunca inventado) en vez de escribirse repetido
 * dentro de decenas de páginas `.astro`. Para añadir un ítem/receta nuevo: añade una entrada
 * aquí, nunca una página nueva.
 */

export type Rarity = "Común" | "Poco Común" | "Rara" | "Épica" | "Legendaria" | "Mítica";

/**
 * Etapa de progresión de un Accesorio (Accesorios V3, 2026-09-06) - refleja el campo real
 * `accessoryStage`/`AccessoryStage` de `AccessoryItemCatalog.kt`/`CatchingProgressionItemCatalog.kt`.
 * Única fuente de verdad de "a qué etapa pertenece este ítem" - nunca se deriva de otro dato
 * (ej. la receta), se declara explícitamente por ítem igual que `rarity`.
 */
export type ProgressionStage = "early" | "mid" | "late" | "hyper_late";

export type ItemCategory =
  | "accesorios"
  | "cofres-llaves"
  | "slayer"
  | "liga"
  | "maestria"
  | "pesca"
  | "encantamientos"
  | "investigaciones";

export interface GuideItem {
  /** Slug único, usado en /guia/items/<slug>. */
  slug: string;
  /** customItemId real (o item vanilla real) - para que el dato sea auditable contra el código. */
  realId: string;
  name: string;
  category: ItemCategory;
  rarity?: Rarity;
  /** Solo Accesorios (Accesorios V3): a qué etapa de la colección de 27 pertenece este ítem. */
  progressionStage?: ProgressionStage;
  /** Nombre de archivo dentro de src/assets/guide/items/, o null si no existe arte propio todavía. */
  image: string | null;
  description: string;
  obtainedFrom: string;
  usedFor: string;
  tradable: boolean;
  craftable: boolean;
  requirements?: string;
  /** Slugs de otros GuideItem relacionados (ingredientes/resultados/misma familia). */
  relatedItems?: string[];
  /** Slugs de RecipeEntry en las que este item es INGREDIENTE. */
  usedInRecipes?: string[];
  /** Slug de la RecipeEntry que PRODUCE este item, si es crafteable. */
  producedByRecipe?: string;
  /** Ruta /guia/<seccion> a la que pertenece este item conceptualmente. */
  relatedGuideSection?: string;
}

export interface RecipeIngredientRef {
  /** Slug de un GuideItem si tiene ficha propia, o null si es un material vanilla sin ficha. */
  itemSlug: string | null;
  /** Nombre a mostrar siempre (incluso si itemSlug es null). */
  label: string;
  amount: number;
}

export interface GuideRecipe {
  slug: string;
  /** customItemId real del resultado. */
  outputId: string;
  outputSlug: string;
  outputName: string;
  outputAmount: number;
  ingredients: RecipeIngredientRef[];
  /** Texto de requisito legible (skill/nivel), si existe. */
  requirement?: string;
  /** Sistema al que pertenece (Accesorios, Maestría, ...). */
  system: string;
}
