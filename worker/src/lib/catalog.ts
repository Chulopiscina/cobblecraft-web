import catalogRaw from "../../../store/catalog.json";
import tebexPackageRaw from "../../../store/tebex-packages.json";
import { CatalogSchema, validateCatalog, visibleProducts, type Product } from "../../../shared/catalog-schema";
import { TebexPackageConfigSchema, tebexPackageIdFor, validateTebexPackageConfig, withEffectiveTebexCheckout } from "../../../shared/tebex-packages";
import type { Env } from "../types";

const rawCatalog = CatalogSchema.parse(catalogRaw);
const tebexPackageConfig = TebexPackageConfigSchema.parse(tebexPackageRaw);
const tebexIssues = validateTebexPackageConfig(tebexPackageConfig, rawCatalog);
if (tebexIssues.length > 0) {
  throw new Error(`web/store/tebex-packages.json inválido:\n${tebexIssues.join("\n")}`);
}
const catalog = withEffectiveTebexCheckout(rawCatalog, tebexPackageConfig);
const issues = validateCatalog(catalog);
if (issues.length > 0) {
  throw new Error(`web/store/catalog.json inválido:\n${issues.join("\n")}`);
}

/**
 * Whitelist de producto/entrega y bloqueos locales. El precio compilado es solo una referencia:
 * `getTebexPrice` verifica el importe oficial antes de crear un checkout. El navegador nunca
 * decide el precio ni habilita un producto mediante la sincronizacion.
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

export function getProviderPackageId(productId: string): string | undefined {
  return tebexPackageIdFor(tebexPackageConfig, productId);
}
