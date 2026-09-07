import type { GuideItem, GuideRecipe } from "../data/guide/types";
import { getItem } from "../data/guide/items";
import { recipes, getRecipe } from "../data/guide/recipes";
import { slayerTiers } from "../data/guide/slayer";
import { leagueTrainers } from "../data/guide/league";
import { crates } from "../data/guide/crates";
import { protectionRocks } from "../data/guide/claims";
import { enchantFamilies } from "../data/guide/enchantments";
import { CATEGORY_LABELS } from "./guide-helpers";

/**
 * Motor de "cadenas de progresión" del Atlas de Objetos (`/guia/objetos`) y de la sección
 * "Cadena de progresión" de `/guia/items/[slug].astro`. TODO se deriva en tiempo de build a
 * partir de los datasets ya existentes (`items.ts`, `recipes.ts`, `slayer.ts`, `league.ts`,
 * `crates.ts`, `claims.ts`, `enchantments.ts`) - este fichero NO añade ningún dato nuevo, solo
 * lógica de lectura/cruce, para que una receta/relación siga viviendo en un único sitio.
 */

export interface ChainNode {
  label: string;
  sublabel?: string;
  href?: string;
  /** Nombre de archivo en src/assets/guide/items/, o null/undefined para un nodo "de texto"
   * (sistema/origen/NPC) sin ficha propia - se renderiza como píldora en vez de ItemImage. */
  image?: string | null;
  /** true = este es el ítem "actual" de la ficha que se está viendo (se resalta). */
  current?: boolean;
  /** true = nodo de texto puro (sin ficha /guia/items/<slug> real detrás). */
  plain?: boolean;
}

function itemNode(item: GuideItem, current = false): ChainNode {
  return { label: item.name, href: `/guia/items/${item.slug}`, image: item.image, sublabel: item.rarity, current };
}

function textNode(label: string, sublabel?: string, href?: string): ChainNode {
  return { label, sublabel, href, plain: true };
}

/** Todas las recetas reales (recipes.ts) que consumen `slug` como ingrediente - calculado
 * siempre desde `recipes.ts` (nunca desde el campo `usedInRecipes` de items.ts, que en la
 * práctica no está mantenido al 100% para las cadenas de Maestría I->II->III). */
export function recipesUsingIngredient(slug: string): GuideRecipe[] {
  return recipes.filter((r) => r.ingredients.some((ing) => ing.itemSlug === slug));
}

/** Origen real de un item con el detalle más específico disponible en datos estructurados
 * (Slayer/Liga/Cofres) - nunca inventa una fuente que no exista en el dataset, cae al texto
 * libre `obtainedFrom` para el resto de casos. */
export function originSummary(item: GuideItem): { system: string; detail: string } {
  const slayerHit = slayerTiers.find((t) => t.rewardItemSlug === item.slug);
  if (slayerHit) {
    return {
      system: "Slayer",
      detail: `Dropeado por ${slayerHit.boss} (${slayerHit.species}) - Cacería T${slayerHit.tier} ${slayerHit.name}, ${slayerHit.rewardAmount}x por victoria.`,
    };
  }
  const leagueHit = leagueTrainers.find((t) => t.tokenSlug === item.slug);
  if (leagueHit) {
    return {
      system: "Liga",
      detail: `Recompensa de derrotar a ${leagueHit.name} (tipo ${leagueHit.type}, Nv.${leagueHit.level}) - entrenador repetible.`,
    };
  }
  const crateHit = crates.find((c) => c.keySlug === item.slug);
  if (crateHit) {
    return { system: "Cofres y Llaves", detail: crateHit.howToGetKey };
  }
  return { system: CATEGORY_LABELS[item.category] ?? item.category, detail: item.obtainedFrom };
}

/**
 * Cadena de progresión completa de UN item: [origen o ingredientes de su receta] -> ESTE ITEM
 * -> [recetas reales que lo consumen, o si no consume ninguna, a qué cofre abre / para qué
 * sirve]. Usada tanto por la ficha individual como por el Atlas de Objetos.
 */
export function buildItemChain(item: GuideItem): ChainNode[] {
  const nodes: ChainNode[] = [];

  const recipe = item.producedByRecipe ? getRecipe(item.producedByRecipe) : undefined;
  if (recipe) {
    const seen = new Set<string>();
    for (const ing of recipe.ingredients) {
      const key = ing.itemSlug ?? ing.label;
      if (seen.has(key)) continue;
      seen.add(key);
      const ingItem = ing.itemSlug ? getItem(ing.itemSlug) : undefined;
      nodes.push(ingItem ? itemNode(ingItem) : textNode(ing.label));
    }
  } else {
    const origin = originSummary(item);
    nodes.push(textNode(origin.system, origin.detail));
  }

  nodes.push(itemNode(item, true));

  const consumers = recipesUsingIngredient(item.slug);
  if (consumers.length > 0) {
    const seen = new Set<string>();
    for (const r of consumers) {
      if (seen.has(r.outputSlug)) continue;
      seen.add(r.outputSlug);
      const out = getItem(r.outputSlug);
      if (out) nodes.push(itemNode(out));
    }
  } else {
    const crateHit = crates.find((c) => c.keySlug === item.slug);
    if (crateHit) {
      nodes.push(textNode(crateHit.name, "Cofre real - contenido variado (dinero, objetos y equipo)", `/guia/cofres#${crateHit.id}`));
    } else if (item.usedFor) {
      nodes.push(textNode("Para qué sirve", item.usedFor));
    }
  }

  return nodes;
}

/** Cadena de Claims (no tiene fichas de ítem individuales - `protectionRocks`/`claimTiers` de
 * `claims.ts` son la única fuente real, sin slugs propios). */
export function buildClaimsChain(): ChainNode[] {
  const nodes: ChainNode[] = [
    textNode("Topógrafo (NPC del Hub)", "Vende las Rocas de Protección a cambio de dinero del servidor.", "/guia/claims"),
  ];
  for (const rock of protectionRocks) {
    nodes.push(textNode(rock.name, `Protege un área de ${rock.sideBlocks}x${rock.sideBlocks} bloques - ${rock.price} monedas.`, "/guia/claims"));
  }
  nodes.push(textNode("Terreno protegido", "Bloques y construcciones a salvo de otros jugadores dentro del área.", "/guia/claims"));
  return nodes;
}

/** Cadena de una familia de Encantamiento (Encantador -> Libro Tier I con ficha propia ->
 * Yunque). Solo añade contexto (precio real / mecánica real de tiers) a partir de
 * `enchantments.ts`, no datos nuevos. */
export function buildEnchantChain(familyId: string): ChainNode[] | null {
  const family = enchantFamilies.find((f) => f.id === familyId);
  if (!family || !family.itemSlug) return null;
  const item = getItem(family.itemSlug);
  if (!item) return null;
  return [
    textNode("Encantador (Hub)", `Tier I por ${family.tier1Price} monedas.`, "/guia/encantamientos"),
    itemNode(item),
    textNode("Yunque", "Combina 2 copias del mismo tier para subir de nivel, hasta Tier VI.", "/guia/encantamientos"),
  ];
}

export interface MaterialHub {
  label: string;
  recipeCount: number;
  recipesList: GuideRecipe[];
}

/**
 * Materiales "puente" (sin ficha propia, `itemSlug: null` en recipes.ts) que alimentan 2 o más
 * recetas reales - base de la sección CRAFTING del Atlas. Se calcula siempre desde
 * `recipes.ts`, nunca se declara a mano.
 */
export function craftingMaterialHubs(): MaterialHub[] {
  const map = new Map<string, GuideRecipe[]>();
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      if (ing.itemSlug) continue;
      if (!map.has(ing.label)) map.set(ing.label, []);
      map.get(ing.label)!.push(r);
    }
  }
  return Array.from(map.entries())
    .filter(([, list]) => list.length >= 2)
    .map(([label, list]) => ({ label, recipeCount: list.length, recipesList: list }))
    .sort((a, b) => b.recipeCount - a.recipeCount);
}
