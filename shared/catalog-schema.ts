import { z } from "zod";

/**
 * Web Oficial V1 (2026-08-25) - esquema REAL del catálogo (`web/store/catalog.json`), usado tanto
 * por el frontend (Astro, para renderizar la Tienda en build time) como por el Worker (para
 * validar cada pedido server-side - "el navegador NUNCA decide el precio", ver
 * `web/docs/SECURITY.md`). UNA sola autoridad: nunca un segundo catálogo hardcodeado en el
 * frontend, nunca un precio distinto entre lo que se muestra y lo que se cobra.
 */
export const ProductCategory = z.enum(["rangos", "upgrades", "skins", "kits", "ventajas", "cosmeticos", "items", "otros"]);
export type ProductCategory = z.infer<typeof ProductCategory>;

/**
 * DeliveryAction: mapping SERVER-SIDE de qué hace realmente la entrega - la web NUNCA envía un
 * comando arbitrario. Cada tipo tiene sus propios parámetros seguros y auditables:
 * - RANK: `rankId` se traduce a un grupo real de LuckPerms (whitelist en el propio servidor).
 * - CUSTOM_ITEM: `customItemId` debe ser una identidad real ya registrada en
 *   `items.CustomItemRegistry` (nunca un vanilla renombrado, ver MINECRAFT_DELIVERY.md).
 * - CURRENCY: preparado para el futuro, DESACTIVADO por defecto (`enabled=false` a nivel de
 *   producto) - pedido explícito "si en el futuro se permite".
 * - COSMETIC: mismo mecanismo que CUSTOM_ITEM pero categoría cosmética (Skin System V1).
 * - BUNDLE: lista de sub-entregas (cada una de los 4 tipos de arriba), aplicadas todas o ninguna.
 */
export const DeliveryType = z.enum(["RANK", "CUSTOM_ITEM", "CURRENCY", "COSMETIC", "BUNDLE"]);
export type DeliveryType = z.infer<typeof DeliveryType>;

export interface DeliveryAction {
  type: DeliveryType;
  rankId?: string;
  durationDays?: number; // undefined = permanente
  customItemId?: string;
  amount?: number;
  currencyAmount?: number;
  bundle?: DeliveryAction[];
}

// Tipo recursivo: se anota `DeliveryActionSchema` explícitamente ANTES de construirlo (patrón
// oficial de Zod para z.lazy recursivo) para romper la inferencia circular de TypeScript.
export const DeliveryActionSchema: z.ZodType<DeliveryAction> = z.lazy(() =>
  z.object({
    type: DeliveryType,
    rankId: z.string().min(1).optional(),
    durationDays: z.number().int().positive().optional(),
    customItemId: z.string().min(1).optional(),
    amount: z.number().int().positive().optional(),
    currencyAmount: z.number().int().positive().optional(),
    bundle: z.array(DeliveryActionSchema).optional(),
  }),
);

export const ProductSchema = z.object({
  productId: z
    .string()
    .regex(/^[a-z0-9_]+$/, "productId debe ser snake_case ascii - es la clave whitelist real"),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  category: ProductCategory,
  icon: z.string().min(1), // ruta relativa dentro de web/site/public/images/store/
  priceCents: z.number().int().nonnegative(), // SIEMPRE en centimos - nunca floats de moneda
  currency: z.literal("EUR"),
  active: z.boolean(),
  /**
   * `active=true` significa visible. `checkoutEnabled=true` significa comprable.
   * Permite publicar fichas/precios reales sin aceptar dinero hasta que existan los IDs reales
   * de Tebex y la cuenta/payout esten verificados.
   */
  checkoutEnabled: z.boolean().default(true),
  /**
   * true = producto de PRUEBA/placeholder (pedido explícito: "no inventes productos comerciales
   * reales ahora... crea productos DEV/placeholder que NO estén publicados en producción").
   * Filtrado incondicionalmente en PROD por `visibleProducts()`, independientemente de `active` -
   * dos guardas distintas para dos preguntas distintas ("¿existe ya el producto real?" vs. "¿es
   * seguro mostrar esto a un jugador pagando dinero real?").
   */
  devOnly: z.boolean().default(true),
  delivery: DeliveryActionSchema,
  limits: z.object({
    maxPerPlayer: z.number().int().positive().nullable().default(null),
  }),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type Product = z.infer<typeof ProductSchema>;

export const CatalogSchema = z.object({
  version: z.number().int().positive(),
  products: z.array(ProductSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;

/** Validación de consistencia adicional (no expresable solo con Zod) - productId/slug únicos. */
export function validateCatalog(catalog: Catalog): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const p of catalog.products) {
    if (seenIds.has(p.productId)) issues.push(`productId duplicado: ${p.productId}`);
    seenIds.add(p.productId);
    if (seenSlugs.has(p.slug)) issues.push(`slug duplicado: ${p.slug}`);
    seenSlugs.add(p.slug);
    if (p.delivery.type === "RANK" && !p.delivery.rankId) {
      issues.push(`${p.productId}: delivery RANK requiere rankId`);
    }
    if ((p.delivery.type === "CUSTOM_ITEM" || p.delivery.type === "COSMETIC") && !p.delivery.customItemId) {
      issues.push(`${p.productId}: delivery ${p.delivery.type} requiere customItemId`);
    }
    if (p.delivery.type === "BUNDLE" && (!p.delivery.bundle || p.delivery.bundle.length === 0)) {
      issues.push(`${p.productId}: delivery BUNDLE requiere al menos 1 sub-entrega`);
    }
  }
  return issues;
}

/**
 * La ÚNICA función que decide "qué producto puede verse/comprarse ahora mismo". `env="prod"`
 * excluye SIEMPRE los productos `devOnly` sin importar su `active` - ver doc de [devOnly] arriba.
 */
export function visibleProducts(catalog: Catalog, env: "dev" | "prod"): Product[] {
  return catalog.products.filter((p) => p.active && (env === "dev" || !p.devOnly));
}

export function visibleCategories(catalog: Catalog, env: "dev" | "prod"): ProductCategory[] {
  const cats = new Set(visibleProducts(catalog, env).map((p) => p.category));
  return (["rangos", "upgrades", "skins", "kits", "ventajas", "cosmeticos", "items", "otros"] as const).filter((c) => cats.has(c));
}
