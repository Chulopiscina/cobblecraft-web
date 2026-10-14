import { it,expect,beforeEach,afterEach } from "vitest";
import { FakeD1Database,applyRealMigrations } from "./d1-fake";
import { reduceSubscription,subscriptionsSince } from "../src/lib/subscriptions";
import { createOrder } from "../src/lib/orders";
import { processProviderWebhook } from "../src/lib/webhook-processing";
import type { Env } from "../src/types";
import type { PaymentProvider,SubscriptionEvent } from "../src/lib/payment/PaymentProvider";
let db:FakeD1Database, env:Env;
const uuid="12345678-1234-1234-1234-1234567890ab";
const base:SubscriptionEvent & {tier:string}={reference:"tbx-r-a",kind:"paid",at:100,startsAt:100,expiresAt:200,transactionId:"p1",orderPublicId:"o",packageId:"7664019",playerUuid:uuid,playerName:"Jugador",priceCents:399,currency:"EUR",tier:"explorer"};
const row=(seq:number,change:Partial<typeof base>={})=>({seq,payload:JSON.stringify({...base,...change})});
beforeEach(()=>{db=new FakeD1Database();applyRealMigrations(db);env={DB:db as unknown as D1Database,ENVIRONMENT:"production",PAYMENT_PROVIDER:"tebex",CORS_ALLOWED_ORIGIN:"https://site.test",CLAIM_TIMEOUT_SECONDS:"120"};});
afterEach(()=>db.close());
it("renewal uses absolute paid expiry and duplicate events never extend twice",()=>{
  const s=reduceSubscription([row(1),row(2,{at:200,startsAt:200,expiresAt:300,transactionId:"p2"}),row(3,{at:200,startsAt:200,expiresAt:300,transactionId:"p2"})]);
  expect(s.expiresAt).toBe(300);expect(s.startsAt).toBe(200);
});
it("cancel preserves paid time, ended revokes, reordered renewal cannot resurrect",()=>{
  expect(reduceSubscription([row(1),row(2,{kind:"cancel",at:150})]).expiresAt).toBe(200);
  expect(reduceSubscription([row(1),row(2,{kind:"ended",at:200}),row(3)]).expiresAt).toBe(200);
});
it("refund of old cycle does not cancel a later correctly paid cycle",()=>{
  expect(reduceSubscription([row(1),row(2,{startsAt:200,expiresAt:300,transactionId:"p2"}),row(3,{kind:"refund",at:250})]).expiresAt).toBe(300);
  expect(reduceSubscription([row(1),row(2,{kind:"refund",at:150})]).expiresAt).toBe(150);
});
it("atomic journal retries after failure, survives restart and yields one effective snapshot",async()=>{
  const o=await createOrder(env,{playerUuid:uuid,playerName:"Jugador",productId:"rank_explorer",priceCents:399,currency:"EUR",paymentProvider:"tebex"});
  const event={eventId:"s1",providerPaymentId:"p1",status:"paid" as const,subscription:{...base,orderPublicId:o.public_id}};
  const provider:PaymentProvider={id:"tebex",createCheckout:async()=>{throw Error("unused")},verifyWebhook:async()=>event};
  db.raw.exec("CREATE TRIGGER fail_sub BEFORE INSERT ON processed_webhooks BEGIN SELECT RAISE(ABORT,'crash'); END");
  await expect(processProviderWebhook(env,provider,"",new Headers())).rejects.toThrow();
  expect(await subscriptionsSince(env,0)).toEqual([]);db.raw.exec("DROP TRIGGER fail_sub");
  await processProviderWebhook(env,provider,"",new Headers());await processProviderWebhook(env,provider,"",new Headers());
  const state=await subscriptionsSince(env,0);expect(state).toHaveLength(1);expect(state[0]?.expiresAt).toBe(200);
  expect(await subscriptionsSince(env,state[0]!.revision)).toEqual([]);
});
