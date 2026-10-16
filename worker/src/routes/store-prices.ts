import type { Env } from "../types";
import { allVisibleProducts } from "../lib/catalog";
import { getTebexPrice } from "../lib/tebex-prices";
import { jsonResponse } from "../lib/security";

export async function handleStorePrices(request: Request, env: Env): Promise<Response> {
  const products=allVisibleProducts(env).filter(p=>!p.devOnly && ["rangos","skins"].includes(p.category));
  const prices=await Promise.all(products.map(p=>getTebexPrice(env,p)));
  const response=jsonResponse(env,request,{serverTime:Date.now(),prices});
  response.headers.set("Cache-Control","no-store");
  return response;
}
