import type { ItemCategory, ProgressionStage, Rarity } from "../data/guide/types";

/** Etiqueta visible de cada `ItemCategory` real - única definición (antes duplicada a mano en
 * `/guia/items/index.astro` y `/guia/items/[slug].astro`; el Atlas de Objetos la reutiliza
 * también en vez de declarar una tercera copia). */
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  accesorios: "Accesorios",
  "cofres-llaves": "Cofres y Llaves",
  slayer: "Slayer",
  liga: "Liga",
  maestria: "Maestría",
  pesca: "Pesca",
  encantamientos: "Encantamientos",
  investigaciones: "Investigaciones",
};

/** Clase `.badge--*` para cada rareza real (6 tonos: Común..Mítica). */
export function rarityBadgeClass(rarity?: Rarity): string {
  switch (rarity) {
    case "Poco Común":
      return "badge badge--grass";
    case "Rara":
      return "badge";
    case "Épica":
      return "badge badge--purple";
    case "Legendaria":
      return "badge badge--gold";
    case "Mítica":
      return "badge badge--sky";
    default:
      return "badge badge--muted";
  }
}

/** Etiqueta visible de cada `ProgressionStage` real de Accesorios V3 (orden = orden de
 * adquisición esperado: Early -> Mid -> Late -> Hyper Late). */
export const PROGRESSION_STAGE_LABELS: Record<ProgressionStage, string> = {
  early: "Early Game",
  mid: "Mid Game",
  late: "Late Game",
  hyper_late: "Hyper Late Game",
};

export const PROGRESSION_STAGE_ORDER: ProgressionStage[] = ["early", "mid", "late", "hyper_late"];

/** Clase `.badge--*` para cada etapa de progresión - mismo criterio visual que `rarityBadgeClass`. */
export function progressionStageBadgeClass(stage?: ProgressionStage): string {
  switch (stage) {
    case "early":
      return "badge badge--grass";
    case "mid":
      return "badge";
    case "late":
      return "badge badge--purple";
    case "hyper_late":
      return "badge badge--gold";
    default:
      return "badge badge--muted";
  }
}

const IMAGE_MODULES = import.meta.glob<{ default: import("astro").ImageMetadata }>("../assets/guide/items/*.png", { eager: true });

/** Resuelve el import de Astro para un nombre de archivo de src/assets/guide/items/, o null si no existe todavía (placeholder). */
export function resolveItemImage(filename: string | null): import("astro").ImageMetadata | null {
  if (!filename) return null;
  const mod = IMAGE_MODULES[`../assets/guide/items/${filename}`];
  return mod?.default ?? null;
}
