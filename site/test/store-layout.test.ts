import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import skins from "../../store/skins.json";
import catalog from "../../store/catalog.json";

const source=(file:string)=>readFileSync(resolve(import.meta.dirname,"../src",file),"utf8");
it("keeps ranks before skins and explicitly separates armor from Pokemon",()=>{
  const page=source("pages/tienda/index.astro");
  expect(page.indexOf('id="rangos"')).toBeLessThan(page.indexOf('<SkinsCollection />'));
  const collection=source("components/SkinsCollection.astro");
  expect(collection).toContain('id="skins-armadura"');expect(collection).toContain('id="skins-pokemon"');
  expect(skins.skins.filter(s=>s.kind==="Armadura")).toHaveLength(6);
  expect(skins.skins.filter(s=>s.kind==="Pokémon")).toHaveLength(5);
});
it("warns next to purchase that the Pokemon is not included and the skin stays on that specimen",()=>{
  const details=source("components/SkinProductDetails.astro");
  expect(details).toContain('Compras únicamente la skin, NO el Pokémon.');
  expect(details).toContain('Necesitas tener un ${skin.title} propio para aplicarla.');
  expect(details).toContain('no puede extraerse, quitarse ni transferirse a otro Pokémon');
  expect(details).toContain('vender o intercambiar el Pokémon con skin');
  expect(details.indexOf('{pokemon && <p class="purchase-pending"><strong>{warning}</strong></p>}')).toBeLessThan(details.indexOf('<button type="submit"'));
});
it("never renders compiled prices as current and keeps acquisition pending where game has no source",()=>{
  for(const file of ["components/SkinCard.astro","components/SkinProductDetails.astro","components/ProductCard.astro","pages/tienda/[slug].astro"]){
    const text=source(file);expect(text).toContain('<LivePrice productId={product.productId}');expect(text).not.toContain('product.priceCents');
  }
  expect(skins.skins.filter(s=>"gameplayAvailability" in s&&s.gameplayAvailability==="pending")).toHaveLength(8);
  expect(catalog.products.filter(p=>p.category==="skins").every(p=>p.checkoutEnabled===false)).toBe(true);
});
