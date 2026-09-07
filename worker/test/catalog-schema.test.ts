import { describe, it, expect } from "vitest";
import catalogRaw from "../../store/catalog.json";
import { CatalogSchema, validateCatalog, visibleProducts, visibleCategories } from "../../shared/catalog-schema";

describe("web/store/catalog.json (real file)", () => {
  it("parses against the schema without throwing", () => {
    expect(() => CatalogSchema.parse(catalogRaw)).not.toThrow();
  });

  it("has no duplicate productId or slug, and every delivery mapping is well-formed", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it("every product declares a positive integer price in cents (never a float)", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    for (const p of catalog.products) {
      expect(Number.isInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThanOrEqual(0);
    }
  });

  it("dev-only products are excluded from prod visibility even if active=true", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    const prodVisible = visibleProducts(catalog, "prod");
    expect(prodVisible.every((p) => !p.devOnly)).toBe(true);
  });

  it("an inactive product is never visible in dev nor prod", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    const disabled = catalog.products.find((p) => p.productId === "item_disabled_dev");
    expect(disabled?.active).toBe(false);
    expect(visibleProducts(catalog, "dev").some((p) => p.productId === "item_disabled_dev")).toBe(false);
  });

  it("visibleCategories never returns a category with zero visible products", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    for (const env of ["dev", "prod"] as const) {
      const cats = visibleCategories(catalog, env);
      const products = visibleProducts(catalog, env);
      for (const cat of cats) {
        expect(products.some((p) => p.category === cat)).toBe(true);
      }
    }
  });
});

describe("validateCatalog rejects malformed catalogs", () => {
  it("rejects a duplicate productId", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    const dup = { ...catalog, products: [catalog.products[0], { ...catalog.products[0], slug: "different-slug" }] };
    const issues = validateCatalog(dup);
    expect(issues.some((i) => i.includes("productId duplicado"))).toBe(true);
  });

  it("rejects a duplicate slug", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    const dup = { ...catalog, products: [catalog.products[0], { ...catalog.products[0], productId: "different_id" }] };
    const issues = validateCatalog(dup);
    expect(issues.some((i) => i.includes("slug duplicado"))).toBe(true);
  });

  it("rejects a RANK delivery without rankId", () => {
    const catalog = CatalogSchema.parse(catalogRaw);
    const broken = { ...catalog, products: [{ ...catalog.products[0], delivery: { type: "RANK" as const } }] };
    const issues = validateCatalog(broken);
    expect(issues.some((i) => i.includes("delivery RANK requiere rankId"))).toBe(true);
  });
});
