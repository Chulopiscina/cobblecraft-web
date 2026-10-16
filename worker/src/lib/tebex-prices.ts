import { z } from "zod";
import { StorePriceSchema, type StorePrice } from "../../../shared/store-prices";
import rawMapping from "../../../store/tebex-packages.json";
import { TebexPackageConfigSchema } from "../../../shared/tebex-packages";
import type { Product } from "../../../shared/catalog-schema";
import type { Env } from "../types";

const mapping = TebexPackageConfigSchema.parse(rawMapping);
const pending = new Map<string,Promise<StorePrice>>();
let lastFailureLog = 0;
const Package = z.object({id:z.coerce.string(),base_price:z.coerce.number().finite().nonnegative(),
  currency:z.string().regex(/^[A-Z]{3}$/),type:z.enum(["single","subscription","both"]),disabled:z.boolean().optional()});

export async function getTebexPrice(env: Env, product: Product, fresh = false): Promise<StorePrice> {
  const packageId = mapping.packages.find(p=>p.productId===product.productId)?.packageId ?? "";
  const token = env.TEBEX_PUBLIC_TOKEN;
  const unavailable = (reason: StorePrice["reason"]): StorePrice => ({productId:product.productId,packageId,source:"tebex",
    available:false,priceCents:null,currency:null,billing:null,disabled:null,checkedAt:Date.now(),expiresAt:Date.now()+30000,reason});
  if (!token || !packageId) return unavailable("credentials_missing");
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${token}:${mapping.version}:${packageId}:${product.currency}`));
  const key = `https://prices.cobblecraft.invalid/v2/${Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("")}`;
  const cache = typeof caches === "undefined" ? undefined : caches.default;
  if (!fresh && cache) {
    try {
      const cached = await cache.match(key);
      const parsed = cached && StorePriceSchema.safeParse(await cached.json());
      if (parsed && parsed.success && parsed.data.expiresAt > Date.now()) return parsed.data;
    } catch { /* A broken cache is never a reason to trust an old price. */ }
  }
  const flightKey = `${key}:${fresh}`;
  if (pending.has(flightKey)) return pending.get(flightKey)!;
  const load = async (): Promise<StorePrice> => {
    let result: StorePrice;
    let upstreamStatus: number | undefined;
    try {
      const response = await fetch(`https://headless.tebex.io/api/accounts/${encodeURIComponent(token)}/packages/${packageId}`,{
        headers:{Accept:"application/json","Cache-Control":"no-cache"},redirect:"manual",signal:AbortSignal.timeout(7000),
      });
      if (!response.ok) { upstreamStatus=response.status; await response.body?.cancel(); throw new Error("upstream"); }
      const body = await response.json() as {data?:unknown};
      const values = Array.isArray(body.data) ? body.data : [body.data];
      const parsed = Package.safeParse(values.length===1 ? values[0] : null);
      if (!parsed.success || parsed.data.id!==packageId || parsed.data.currency!==product.currency || !Number.isSafeInteger(Math.round(parsed.data.base_price*100)) ||
          Math.abs(parsed.data.base_price*100-Math.round(parsed.data.base_price*100))>0.00001) {
        result = unavailable("invalid_package");
      } else {
        const p=parsed.data, now=Date.now();
        result = {productId:product.productId,packageId,source:"tebex",available:true,priceCents:Math.round(p.base_price*100),
          currency:p.currency,billing:p.type==="single"?"one_time":p.type,disabled:p.disabled??null,checkedAt:now,expiresAt:now+120000};
      }
    } catch (error) {
      result={...unavailable("upstream_unavailable"),...(upstreamStatus?{upstreamStatus}:{})};
      if (Date.now()-lastFailureLog>60000) {
        lastFailureLog=Date.now();
        const detail=error instanceof Error?`${error.name}: ${error.message}`:"network failure";
        console.warn("TEBEX_PRICE_SYNC",detail.replaceAll(token,"[REDACTADO]").replace(/https?:\/\/\S+/g,"[URL]").slice(0,160));
      }
    }
    if (cache) try {
      await cache.put(key,Response.json(result,{headers:{"Cache-Control":`public,max-age=${result.available?120:30}`}}));
    } catch { /* Cache writes are optional; never log upstream URLs or credentials. */ }
    return result;
  };
  const promise=load(); pending.set(flightKey,promise);
  try { return await promise; } finally { pending.delete(flightKey); }
}
