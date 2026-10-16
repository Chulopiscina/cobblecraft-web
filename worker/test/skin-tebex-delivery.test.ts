import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "../../store/catalog.json";
import mapping from "../../store/tebex-packages.json";
import { TebexPaymentProvider } from "../src/lib/payment/TebexPaymentProvider";
import { processProviderWebhook } from "../src/lib/webhook-processing";
import { createOrder, getOrderByPublicId, markPendingPayment } from "../src/lib/orders";
import { handleAck, handleClaim, handleListPending } from "../src/routes/delivery";
import type { Env } from "../src/types";
import { applyRealMigrations, FakeD1Database } from "./d1-fake";

const uuid = "00000000-0000-4000-8000-000000000001";
const secret = "local-test-webhook-secret";
const serverToken = "local-test-server-token";
const provider = new TebexPaymentProvider(undefined, secret);
const skins = mapping.packages.filter(p => p.action === "skin");
let db: FakeD1Database;
let env: Env;

beforeEach(() => {
  db = new FakeD1Database();
  applyRealMigrations(db);
  env = { DB: db as unknown as D1Database, ENVIRONMENT: "production", PAYMENT_PROVIDER: "tebex",
    CORS_ALLOWED_ORIGIN: "https://site.test", CLAIM_TIMEOUT_SECONDS: "120", STORE_SERVER_TOKEN: serverToken };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network in delivery tests"); }));
});
afterEach(() => { db.close(); vi.unstubAllGlobals(); });

function signed(payload: unknown) {
  const raw = JSON.stringify(payload);
  return { raw, headers: new Headers({ "X-Signature": createHmac("sha256", secret)
    .update(createHash("sha256").update(raw).digest("hex")).digest("hex") }) };
}
function serverRequest(path: string, body?: unknown, token = serverToken) {
  return new Request(`https://store.test/api/delivery/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function fixture(skin: typeof skins[number]) {
  const product = catalog.products.find(p => p.productId === skin.productId)!;
  // An in-memory pre-existing order, not a bypass of the production checkout gate.
  const order = await createOrder(env, { playerName: "JugadorQA", playerUuid: uuid,
    productId: product.productId, priceCents: product.priceCents, currency: "EUR", paymentProvider: "tebex" });
  await markPendingPayment(env, order.public_id, "local-basket");
  const payload = { id: "local-event", type: "payment.completed", subject: {
    transaction_id: "local-transaction", custom: { orderPublicId: order.public_id, playerUuid: uuid },
    products: [{ id: Number(skin.packageId), quantity: 1,
      username: { id: uuid.replace(/-/g, ""), username: "JugadorQA" },
      base_price: { amount: product.priceCents / 100, currency: "EUR" } }],
  } };
  return { order, payload };
}
async function deliverEvent(payload: unknown) {
  const {raw, headers} = signed(payload);
  return processProviderWebhook(env, provider, raw, headers);
}

describe.each(skins)("Tebex skin $productId / $packageId (local only)", skin => {
  it("verifies signature, queues the exact reward identity, claims and acknowledges once", async () => {
    const {order, payload} = await fixture(skin);
    const {raw, headers} = signed(payload);
    expect(await processProviderWebhook(env, provider, raw + " ", headers)).toEqual({ok:false,reason:"invalid_signature"});
    expect((await getOrderByPublicId(env, order.public_id))?.status).toBe("PENDING_PAYMENT");
    expect(await deliverEvent(payload)).toEqual({ok:true,result:"paid"});
    expect(await deliverEvent(payload)).toEqual({ok:true,result:"already_processed"});
    expect(await deliverEvent({...payload,id:"local-retry"})).toEqual({ok:true,result:"already_processed"});
    expect((await handleListPending(serverRequest("pending",undefined,"wrong"),env)).status).toBe(401);
    expect(await (await handleListPending(serverRequest("pending"),env)).json()).toEqual([
      {orderId:order.public_id,productId:skin.productId,playerUuid:uuid,playerName:"JugadorQA",priceCents:order.price_cents,currency:"EUR"},
    ]);
    const claim = await (await handleClaim(serverRequest("claim",{orderId:order.public_id}),env)).json() as {claimed:boolean;claimToken:string};
    expect(claim.claimed).toBe(true);
    expect((await handleClaim(serverRequest("claim",{orderId:order.public_id}),env)).status).toBe(409);
    const ack = () => handleAck(serverRequest("ack",{orderId:order.public_id,claimToken:claim.claimToken,result:"delivered"}),env);
    expect(await (await ack()).json()).toMatchObject({acked:true,alreadyDelivered:false});
    expect(await (await ack()).json()).toMatchObject({acked:true,alreadyDelivered:true});
    expect(await (await handleListPending(serverRequest("pending"),env)).json()).toEqual([]);
    expect(db.raw.prepare("SELECT count(*) AS n FROM order_events WHERE event_type='PAID'").get()?.n).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["package", "price", "recipient"])("rejects a signed webhook with a wrong %s", async mismatch => {
    const {order,payload} = await fixture(skin);
    const product = payload.subject.products[0]!;
    if (mismatch === "package") product.id = 1;
    if (mismatch === "price") product.base_price.amount = 0.01;
    if (mismatch === "recipient") product.username.username = "OtroJugador";
    await expect(deliverEvent(payload)).rejects.toThrow(/no coincide/);
    expect((await getOrderByPublicId(env,order.public_id))?.status).toBe("PENDING_PAYMENT");
  });
});
