import { items } from "../data/guide/items";
import { recipes } from "../data/guide/recipes";
import { categories } from "../data/guide/categories";
import { crates } from "../data/guide/crates";

export interface SearchHit {
  kind: string;
  label: string;
  href: string;
  haystack: string;
}

/**
 * Índice de búsqueda 100% client-side (pedido explícito: "preferiblemente client-side si el
 * catálogo no es enorme... no añadir backend innecesario") - el catálogo real (ítems, recetas,
 * recetas, 14 categorías, 5 cofres) es pequeño de sobra para un filtro por substring en el
 * navegador, sin ninguna librería de búsqueda externa.
 */
const index: SearchHit[] = [
  ...items.map((i) => ({
    kind: "Ítem",
    label: i.name,
    href: `/guia/items/${i.slug}`,
    haystack: `${i.name} ${i.realId} ${i.category} ${i.rarity ?? ""} ${i.description} ${i.obtainedFrom} ${i.usedFor}`.toLowerCase(),
  })),
  ...recipes.map((r) => ({
    kind: "Receta",
    label: r.outputName,
    href: `/guia/crafteos#${r.slug}`,
    haystack: `${r.outputName} ${r.system} ${r.ingredients.map((i) => i.label).join(" ")}`.toLowerCase(),
  })),
  ...categories.map((c) => ({
    kind: "Sistema",
    label: c.title,
    href: c.href,
    haystack: `${c.title} ${c.description}`.toLowerCase(),
  })),
  ...crates.map((c) => ({
    kind: "Cofre",
    label: c.name,
    href: `/guia/cofres#${c.id}`,
    haystack: `${c.name} ${c.keyName} ${c.description}`.toLowerCase(),
  })),
];

export function searchGuide(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return index.filter((entry) => entry.haystack.includes(q));
}
