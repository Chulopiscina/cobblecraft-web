import catalogRaw from "@store/catalog.json";
import { CatalogSchema, validateCatalog, visibleProducts, visibleCategories, type Product, type ProductCategory } from "@shared/catalog-schema";

const catalog = CatalogSchema.parse(catalogRaw);
const issues = validateCatalog(catalog);
if (issues.length > 0) {
  throw new Error(`web/store/catalog.json inválido:\n${issues.join("\n")}`);
}

/**
 * `PUBLIC_STORE_ENV` decide si se muestran también los productos `devOnly` - por defecto "dev"
 * (nunca se publican productos DEV en un build de producción real sin fijar esta variable
 * explícitamente a "prod", ver web/docs/PRODUCTION_CHECKLIST.md).
 */
const env: "dev" | "prod" = import.meta.env.PUBLIC_STORE_ENV === "prod" ? "prod" : "dev";

export function getVisibleProducts(): Product[] {
  return visibleProducts(catalog, env);
}

export function getVisibleCategories(): ProductCategory[] {
  return visibleCategories(catalog, env);
}

export function getProductBySlug(slug: string): Product | undefined {
  return getVisibleProducts().find((p) => p.slug === slug);
}

export const categoryLabels: Record<ProductCategory, string> = {
  rangos: "Rangos",
  kits: "Kits",
  ventajas: "Ventajas",
  cosmeticos: "Cosméticos",
  items: "Items",
  otros: "Otros",
};
