import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {getTebexPrice} from "../src/lib/tebex-prices";
import {handleStorePrices} from "../src/routes/store-prices";
import {getAuthoritativeProduct} from "../src/lib/catalog";
import type {Env} from "../src/types";

const env={ENVIRONMENT:"production",TEBEX_PUBLIC_TOKEN:"private-to-worker-test-token",CORS_ALLOWED_ORIGIN:"https://site.test"} as Env;
const product=getAuthoritativeProduct(env,"skin_armor_mewtwo")!;
const response=(change={})=>Response.json({data:{id:7742868,base_price:12.99,currency:"EUR",type:"single",disabled:true,...change}});
let records:Map<string,Response>;
beforeEach(()=>{
  records=new Map();
  vi.stubGlobal("caches",{default:{match:async(key:string)=>records.get(key)?.clone(),put:async(key:string,r:Response)=>{records.set(key,r.clone());}}});
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

it("reads the official price without credentials in responses and never changes disabled flags",async()=>{
  const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{expect(init?.redirect).toBe("manual");return response();});vi.stubGlobal("fetch",fetcher);
  const quote=await getTebexPrice(env,product);
  expect(quote).toMatchObject({available:true,priceCents:1299,currency:"EUR",billing:"one_time",disabled:true});
  expect(JSON.stringify(quote)).not.toContain(env.TEBEX_PUBLIC_TOKEN);
  expect([...records.keys()].some(k=>k.includes(env.TEBEX_PUBLIC_TOKEN!))).toBe(false);
  expect(getAuthoritativeProduct(env,product.productId)?.checkoutEnabled).toBe(false);
  expect(await getTebexPrice(env,product)).toEqual(quote);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.length).toBeGreaterThan(0);
});
it("refreshes after TTL and clears expired values on upstream failure instead of serving stale",async()=>{
  vi.useFakeTimers();vi.stubGlobal("fetch",async()=>response());
  const first=await getTebexPrice(env,product);
  vi.setSystemTime(first.expiresAt+1);vi.stubGlobal("fetch",async()=>new Response("unavailable",{status:503}));
  expect(await getTebexPrice(env,product)).toMatchObject({available:false,priceCents:null,currency:null,reason:"upstream_unavailable"});
});
it("forces an uncached quote before checkout and picks up subsequent price changes",async()=>{
  vi.stubGlobal("fetch",async()=>response());await getTebexPrice(env,product);
  vi.stubGlobal("fetch",async()=>response({base_price:14.99}));
  expect((await getTebexPrice(env,product,true)).priceCents).toBe(1499);
});
it.each([{id:1},{currency:"USD"},{base_price:-1},{base_price:12.999},{type:"invalid"}])("rejects wrong package, currency or invalid price/billing %j",async change=>{
  vi.stubGlobal("fetch",async()=>response(change));
  expect(await getTebexPrice(env,product)).toMatchObject({available:false,priceCents:null,reason:"invalid_package"});
});
it("requires actual API access and never falls back to compiled catalogue prices",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect(await getTebexPrice({...env,TEBEX_PUBLIC_TOKEN:undefined},product)).toMatchObject({available:false,priceCents:null});
  expect(fetcher).not.toHaveBeenCalled();
});
it("public endpoint is no-store, reports partial availability and contains no secrets",async()=>{
  vi.stubGlobal("fetch",async(url:string)=>url.endsWith("/7742868")?response():new Response("disabled",{status:404}));
  const r=await handleStorePrices(new Request("https://store.test/api/store/prices"),env);
  expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");
  const body=await r.json() as {prices:Array<{available:boolean;productId:string;priceCents:number|null}>};
  expect(body.prices.find(p=>p.productId===product.productId)).toMatchObject({available:true,priceCents:1299});
  expect(body.prices.filter(p=>p.productId!==product.productId).every(p=>!p.available&&p.priceCents===null)).toBe(true);
  expect(JSON.stringify(body)).not.toContain(env.TEBEX_PUBLIC_TOKEN);
});
