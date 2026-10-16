import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import skins from "../../store/skins.json";
import products from "../../store/catalog.json";

const web = resolve(import.meta.dirname,"../..");
describe("real skin previews",()=>{
  it("uses real game animation frames for the four ceremonial Pokemon, not a collapsed bind pose",()=>{
    for(const [name,animation] of [["gyarados-celestial","battle_idle"],["crobat-prisma","air_idle"],["arcanine-solar","ground_idle"],["luxray-emperador","ground_idle"]]) {
      const mesh=JSON.parse(readFileSync(resolve(web,"site/public/models/skins",name+".json"),"utf8"));
      expect(mesh.pose.animation).toMatch(new RegExp(`^animation\\..+\\.${animation}$`));
      expect(mesh.pose.source).toContain("/animations/");
      const source=Object.keys(mesh.sources).find(file=>file.endsWith(".geo.json"));
      expect(source).toBeTruthy();
      const geometry=JSON.parse(readFileSync(resolve(web,"..",source!),"utf8"))["minecraft:geometry"][0];
      expect(mesh.uvSize).toEqual([geometry.description.texture_width,geometry.description.texture_height]);
      // These four textures are 2x upscaled; using their pixel size hides the wing/ornament UVs.
      expect(mesh.uv.some((n:number,i:number)=>i%2===0&&n>.75)).toBe(true);
    }
  });
  for(const skin of skins.skins) it(`${skin.title} has complete source-matching geometry, textures and a visible fallback`,()=>{
    expect(products.products.some(p=>p.productId===skin.productId&&p.category==="skins")).toBe(true);
    for(const path of [skin.model,skin.texture,skin.glow,skin.fallback])expect(existsSync(resolve(web,"site/public"+path))).toBe(true);
    const mesh = JSON.parse(readFileSync(resolve(web,"site/public"+skin.model),"utf8"));
    expect(mesh.format).toBe("cobblecraft-mesh-v1");
    expect(mesh.positions.length%9).toBe(0);expect(mesh.positions.length).toBeGreaterThan(900);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.uv.length).toBe(mesh.positions.length/3*2);
    expect(mesh.uv.every((n:number)=>Number.isFinite(n)&&n>=0&&n<=1)).toBe(true);
    for(const [file,sha] of Object.entries(mesh.sources)) {
      const actual=createHash("sha256").update(readFileSync(resolve(web,"..",file))).digest("hex");
      expect(actual).toBe(sha);
    }
  });
});
