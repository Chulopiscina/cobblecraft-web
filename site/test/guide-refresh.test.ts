import { describe,it,expect } from "vitest";
import { existsSync,readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fortuneExample } from "../src/lib/fortune-example";
import { enchantFamilies } from "../src/data/guide/enchantments";
import { items } from "../src/data/guide/items";
import { recipes } from "../src/data/guide/recipes";
import { categories } from "../src/data/guide/categories";
import { masteryTiers } from "../src/data/guide/mastery";
import { searchGuide } from "../src/lib/guide-search";
import { darkVariants } from "../src/data/guide/dark-market";
const root=resolve(import.meta.dirname,"../../..");
const serverTemplate=resolve(root,".hotfix-src/progression_core-0.18.11.31/build/prepared/dark-market.defaults.json");
describe("audited guide refresh",()=>{
  it.each([[0,0,0],[90,0,90],[190,1,90],[225,2,25],[315,3,15],[350,3,50],[1200,12,0]])("+%i percent means %i extras and %i percent",(percent,guaranteed,chance)=>{
    expect(fortuneExample(percent)).toMatchObject({guaranteed,chance,minimumTotal:1+guaranteed});
  });
  it("all fourteen real enchant families have six values and actual compatibility",()=>{
    expect(enchantFamilies).toHaveLength(14);
    for(const f of enchantFamilies){expect(f.tiers).toHaveLength(6);expect(f.appliesTo).toBeTruthy();expect(items.find(i=>i.realId===`progression:enchant/${f.id}_1`)).toBeTruthy();}
    expect(enchantFamilies.find(f=>f.id==="mining_fortune")!.tiers![0]).toBe("+12,5 %");
    expect(enchantFamilies.find(f=>f.id==="crit_chance")!.appliesTo).toContain("Maestría");
  });
  it("retired accessories and retired recipes are not advertised",()=>{
    expect(items.some(i=>i.category==="accesorios")).toBe(false);
    expect(categories.some(c=>c.slug==="accesorios")).toBe(false);
    expect(recipes.some(r=>/accessor|master_ball|crown|corona|voucher/.test(r.outputId))).toBe(false);
    expect(masteryTiers[2].requiredSlayerLevel).toBe(50);
  });
  it("guide navigation and recipe links resolve to real local content",()=>{
    for(const c of categories)expect(existsSync(resolve(root,"web/site/src/pages",c.href.slice(1),"index.astro")),c.href).toBe(true);
    for(const r of recipes){expect(items.find(i=>i.slug===r.outputSlug)).toBeTruthy();for(const i of r.ingredients)if(i.itemSlug)expect(items.find(x=>x.slug===i.itemSlug),i.itemSlug).toBeTruthy();}
  });
  it("search finds accented skill names, new books and Dark Market",()=>{
    expect(searchGuide("mineria").length).toBeGreaterThan(0);
    expect(searchGuide("ataque especial").length).toBeGreaterThan(0);
    expect(searchGuide("mercado oscuro").some(x=>x.href==="/guia/mercado-oscuro")).toBe(true);
  });
  it.skipIf(!existsSync(serverTemplate))("web dark templates match the actual exported server configuration",()=>{
    const config=JSON.parse(readFileSync(serverTemplate,"utf8"));
    expect(config.rotation).toEqual(darkVariants.map(v=>v.species));
    for(const v of darkVariants){const actual=config.catalog.find((c:{species:string})=>c.species===v.species);expect(actual.baseStats).toEqual(v.dark);expect(actual.ivs).toEqual(v.ivs);expect(actual.level).toBe(v.level);expect(v.dark.reduce((a,b)=>a+b,0)).toBe(v.normal.reduce((a,b)=>a+b,0));}
  });
});
