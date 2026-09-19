import { z } from "zod";
import type { Catalog, Product } from "./catalog-schema";

const RankId = z.enum(["explorer", "master", "legend"]);
const TebexPackageId = z.preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().regex(/^\d+$/).nullable());

export const TebexPackageEntrySchema = z.object({
  productId: z.string().regex(/^[a-z0-9_]+$/),
  product: z.string().min(1),
  packageId: TebexPackageId,
  action: z.literal("rank"),
  rankId: RankId,
});

export const TebexPackageConfigSchema = z.object({
  version: z.number().int().positive(),
  packages: z.array(TebexPackageEntrySchema),
});

export type TebexPackageEntry = z.infer<typeof TebexPackageEntrySchema>;
export type TebexPackageConfig = z.infer<typeof TebexPackageConfigSchema>;

export function tebexPackageByProduct(config: TebexPackageConfig): Map<string, TebexPackageEntry> {
  return new Map(config.packages.map((entry) => [entry.productId, entry]));
}

export function tebexPackageIdFor(config: TebexPackageConfig, productId: string): string | undefined {
  return tebexPackageByProduct(config).get(productId)?.packageId ?? undefined;
}

export function withEffectiveTebexCheckout(catalog: Catalog, config: TebexPackageConfig): Catalog {
  const byProduct = tebexPackageByProduct(config);
  const products: Product[] = catalog.products.map((product) => {
    if (product.devOnly) return product;
    const packageId = byProduct.get(product.productId)?.packageId;
    if (!packageId) return { ...product, checkoutEnabled: false };
    return { ...product, checkoutEnabled: true };
  });
  return { ...catalog, products };
}

export function validateTebexPackageConfig(config: TebexPackageConfig, catalog: Catalog): string[] {
  const issues: string[] = [];
  const productsById = new Map(catalog.products.map((product) => [product.productId, product]));
  const seen = new Set<string>();
  for (const entry of config.packages) {
    if (seen.has(entry.productId)) issues.push(`productId duplicado en tebex-packages: ${entry.productId}`);
    seen.add(entry.productId);
    const product = productsById.get(entry.productId);
    if (!product) {
      issues.push(`${entry.productId}: no existe en catalog.json`);
      continue;
    }
    if (product.delivery.type !== "RANK") {
      issues.push(`${entry.productId}: solo se admiten productos RANK en el mapping Tebex actual`);
    }
    if (product.delivery.rankId !== entry.rankId) {
      issues.push(`${entry.productId}: rankId Tebex (${entry.rankId}) no coincide con delivery.rankId (${product.delivery.rankId ?? "sin rankId"})`);
    }
  }

  const required = catalog.products.filter((product) => !product.devOnly && product.category === "rangos");
  for (const product of required) {
    if (!seen.has(product.productId)) issues.push(`${product.productId}: falta en tebex-packages.json`);
  }
  return issues;
}
