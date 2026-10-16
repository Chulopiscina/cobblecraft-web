import type { GuideRecipe } from "./types";

/**
 * Recetas reales (crafting_shapeless, 3x3) de `gear/recipe/SlayerGearRecipeConfig.kt` -
 * MAESTRIA_RECIPES (las recetas de Accesorios se retiraron con el sistema en 0.18.11.41) (solo la pieza
 * "helmet" de cada tier como representativa; chestplate/leggings/boots usan exactamente los
 * mismos ingredientes, se indica en la propia página). Ingredientes y cantidades verificados
 * contra `slayer-gear-recipes.properties`/`SlayerGearRecipeConfig.kt` (2026-09-06) - nunca
 * inventados.
 */
export const recipes: GuideRecipe[] = [
  {
    slug: "maestria-i-helmet",
    outputId: "progression:maestria_1/helmet",
    outputSlug: "maestria-i-helmet",
    outputName: "Yelmo de Maestría I",
    outputAmount: 1,
    system: "Maestría",
    requirement: "Cazador (Slayer) nivel 30 + Pesca nivel 30",
    ingredients: [
      { itemSlug: "esencia-de-gengar", label: "Esencia de Gengar", amount: 3 },
      { itemSlug: "perla-de-las-mareas", label: "Perla de las Mareas", amount: 2 },
      { itemSlug: "perla-del-comodoro", label: "Perla del Comodoro Abisal", amount: 2 },
      { itemSlug: null, label: "Diamante", amount: 1 },
    ],
  },
  {
    slug: "maestria-ii-helmet",
    outputId: "progression:maestria_2/helmet",
    outputSlug: "maestria-ii-helmet",
    outputName: "Yelmo de Maestría II",
    outputAmount: 1,
    system: "Maestría",
    requirement: "Cazador (Slayer) nivel 50 + Pesca nivel 50",
    ingredients: [
      { itemSlug: "maestria-i-helmet", label: "Yelmo de Maestría I (ya fabricado)", amount: 1 },
      { itemSlug: "escama-de-gyarados", label: "Escama de Gyarados", amount: 3 },
      { itemSlug: "fragmento-abisal", label: "Fragmento Abisal", amount: 2 },
      { itemSlug: "semilla-del-guardabosques", label: "Semilla del Guardabosques Sylvana", amount: 2 },
    ],
  },
  {
    slug: "maestria-iii-helmet",
    outputId: "progression:maestria_3/helmet",
    outputSlug: "maestria-iii-helmet",
    outputName: "Yelmo de Maestría III",
    outputAmount: 1,
    system: "Maestría",
    requirement: "Cazador (Slayer) nivel 50 + Pesca nivel 70",
    ingredients: [
      { itemSlug: "maestria-ii-helmet", label: "Yelmo de Maestría II (ya fabricado)", amount: 1 },
      { itemSlug: "colmillo-de-garchomp", label: "Colmillo de Garchomp", amount: 2 },
      { itemSlug: "corazon-del-leviatan", label: "Corazón del Leviatán", amount: 1 },
      { itemSlug: "escama-del-archimago", label: "Escama del Archimago Draconis", amount: 2 },
    ],
  },
];

export function getRecipe(slug: string): GuideRecipe | undefined {
  return recipes.find((r) => r.slug === slug);
}

export function recipeForOutput(outputSlug: string): GuideRecipe | undefined {
  return recipes.find((r) => r.outputSlug === outputSlug);
}
