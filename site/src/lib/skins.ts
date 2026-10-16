import { z } from "zod";
import raw from "@store/skins.json";
import { getVisibleProducts } from "./catalog";

const asset = z.string().regex(/^\/models\/skins\/[a-z0-9.-]+$/);
export const SkinPreviewSchema = z.object({
  productId: z.string(), kind: z.enum(["Armadura", "Pokémon"]), title: z.string(), edition: z.string(),
  accent: z.string().regex(/^#[a-f\d]{6}$/i), model: asset, texture: asset, glow: asset, fallback: asset,
  detail: z.string(), receipt: z.string(),
  gameplayAvailability: z.enum(["pending","available"]).optional(),
});
export type SkinPreview = z.infer<typeof SkinPreviewSchema>;
const previews = z.object({ version: z.number(), skins: z.array(SkinPreviewSchema) }).parse(raw).skins;
export function getSkins() {
  return getVisibleProducts().filter(p => p.category === "skins").map(product => {
    const preview = previews.find(s => s.productId === product.productId);
    if (!preview) throw new Error(`Skin sin preview: ${product.productId}`);
    return { product, preview };
  });
}
export function getSkinPreview(productId: string) { return previews.find(s => s.productId === productId); }
