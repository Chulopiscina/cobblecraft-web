import { describe, it, expect, vi, afterEach } from "vitest";
import raw from "../../store/catalog.json";
import mappingRaw from "../../store/tebex-packages.json";
import { CatalogSchema, validateCatalog } from "../../shared/catalog-schema";
import { TebexPackageConfigSchema, validateTebexPackageConfig, withEffectiveTebexCheckout } from "../../shared/tebex-packages";
import { handleCreateOrder } from "../src/routes/orders";
import type { Env } from "../src/types";

const catalog = CatalogSchema.parse(raw), mapping = TebexPackageConfigSchema.parse(mappingRaw);
const ids = ["skin_armor_mewtwo", "skin_armor_gyarados", "skin_pokemon_charizard_draconico"];
afterEach(() => vi.unstubAllGlobals());
describe("direct skin sales", () => {
  it("has exactly the three approved products, real deliveries and approved EUR prices", () => {
    const skins = catalog.products.filter(p => p.category === "skins");
    expect(skins.map(p => p.productId)).toEqual(ids);
    expect(skins.map(p => p.priceCents)).toEqual([499,499,399]);
    expect(skins.map(p => p.delivery)).toEqual([
      {type:"ACCOUNT_COSMETIC",cosmeticId:"armor_overlay_mewtwo"},
      {type:"ACCOUNT_COSMETIC",cosmeticId:"armor_overlay_gyarados"},
      {type:"COSMETIC",customItemId:"progression:cosmetics/skin_charizard_draconico",amount:1},
    ]);
    expect(validateCatalog(catalog)).toEqual([]);
    expect(validateTebexPackageConfig(mapping,catalog)).toEqual([]);
    expect(skins.every(p => p.metadata.billing === "one_time" && !p.devOnly)).toBe(true);
  });
  it("requires real package AND explicit verification of the installed server delivery", () => {
    for(const packageId of [null,"123456"]) for(const serverDeliveryVerified of [false,true]) {
      const next = {...mapping,packages:mapping.packages.map(p=>p.action==="skin"?{...p,packageId,serverDeliveryVerified}:p)};
      const effective = withEffectiveTebexCheckout(catalog,next);
      expect(effective.products.filter(p=>ids.includes(p.productId)).every(p=>p.checkoutEnabled===(!!packageId&&serverDeliveryVerified))).toBe(true);
    }
  });
  it.each(ids)("HTTP rejects %s before identity, orders, payment or delivery", async id => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch",fetchSpy);
    const response = await handleCreateOrder(new Request("https://store.test/api/orders",{method:"POST",headers:{"Content-Type":"application/json","CF-Connecting-IP":"192.0.2.7"},body:JSON.stringify({productId:id,playerName:"Chulopiscina"})}),{
      ENVIRONMENT:"production",PAYMENT_PROVIDER:"tebex",TEBEX_CHECKOUT_ENABLED:"true",TEBEX_PUBLIC_TOKEN:"test",TEBEX_PRIVATE_KEY:"test",TEBEX_WEBHOOK_SECRET:"test",CORS_ALLOWED_ORIGIN:"https://site.test",
      DB:new Proxy({}, {get(){throw new Error("Must not access orders database for disabled skin");}}),
    } as unknown as Env,"https://site.test");
    expect(response.status).toBe(409);expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("rejects a mapping to the wrong cosmetic or an old equipment skin", () => {
    const changed = structuredClone(mapping);
    changed.packages[0].cosmeticId="dev_mewtwo_helmet";
    expect(validateTebexPackageConfig(changed,catalog).length).toBeGreaterThan(0);
    const broken = structuredClone(catalog);
    delete broken.products[0].delivery.cosmeticId;
    expect(validateCatalog(broken)).toContain("skin_armor_mewtwo: delivery ACCOUNT_COSMETIC requiere cosmeticId");
  });
});
