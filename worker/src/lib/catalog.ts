import catalogRaw from "../../../store/catalog.json";
import { CatalogSchema, validateCatalog, visibleProducts, type Product } from "../../../shared/catalog-schema";
import type { Env } from "../types";

const catalog = CatalogSchema.parse(catalogRaw);
const issues = validateCatalog(catalog);
if (issues.length > 0) {
  throw new Error(`web/store/catalog.json inválido:\n${issues.join("\n")}`);
}

/**
 * AUTORIDAD REAL de producto/precio - el Worker NUNCA confía en lo que envía el navegador.
 * "PRODUCT ID WHITELIST" + "PRICE AUTHORITY SERVER-SIDE" (Parte J del encargo) se resuelven
 * exactamente aquí: `getAuthoritativeProduct` es la ÚNICA función que decide si un productId es
 * válido y cuál es su precio real.
 */
export function getAuthoritativeProduct(env: Env, productId: string): Product | null {
  const runtimeEnv = env.ENVIRONMENT === "production" ? "prod" : "dev";
  const product = visibleProducts(catalog, runtimeEnv).find((p) => p.productId === productId);
  return product ?? null;
}

export function allVisibleProducts(env: Env): Product[] {
  const runtimeEnv = env.ENVIRONMENT === "production" ? "prod" : "dev";
  return visibleProducts(catalog, runtimeEnv);
}
