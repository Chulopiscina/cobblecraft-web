import { it, expect, beforeEach, afterEach } from "vitest";
import { FakeD1Database, applyRealMigrations } from "./d1-fake";
import { createOrder, markPendingPayment, getOrderByPublicId } from "../src/lib/orders";
import { processProviderWebhook } from "../src/lib/webhook-processing";
import { checkoutAvailable } from "../src/lib/store-readiness";
import type { Env } from "../src/types";
import type { PaymentProvider, WebhookEvent } from "../src/lib/payment/PaymentProvider";

let db: FakeD1Database; let env: Env;
beforeEach(() => { db = new FakeD1Database(); applyRealMigrations(db); env = { DB: db as unknown as D1Database, ENVIRONMENT: "production", PAYMENT_PROVIDER: "tebex", CORS_ALLOWED_ORIGIN: "https://site.test", CLAIM_TIMEOUT_SECONDS: "120" }; });
afterEach(() => db.close());
async function orderAndEvent() {
  const order = await createOrder(env, { playerName: "Jugador", playerUuid: "u1", productId: "rank_explorer", priceCents: 1499, currency: "EUR", paymentProvider: "tebex" });
  await markPendingPayment(env, order.public_id, "basket");
  const event: WebhookEvent = { eventId: "e1", providerPaymentId: "tbx-one", orderPublicId: order.public_id, status: "paid",
    purchase: { packageId: "7664019", playerName: "Jugador", playerUuid: "u1", recipientId: "1", basePriceCents: 1499, currency: "EUR" } };
  return { order, event };
}
function process(event: WebhookEvent) {
  return processProviderWebhook(env, { id: "tebex", verifyWebhook: async () => event, createCheckout: async () => { throw new Error("unused"); } } satisfies PaymentProvider, "", new Headers());
}
it("atomic rollback preserves retry after D1 failure, duplicate event/transaction never delivers twice", async () => {
  const { order, event } = await orderAndEvent();
  db.raw.exec("CREATE TRIGGER fail_event BEFORE INSERT ON processed_webhooks BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  await expect(process(event)).rejects.toThrow();
  expect((await getOrderByPublicId(env, order.public_id))?.status).toBe("PENDING_PAYMENT");
  expect(db.raw.prepare("SELECT count(*) AS n FROM processed_webhooks").get()?.n).toBe(0);
  db.raw.exec("DROP TRIGGER fail_event");
  expect(await process(event)).toEqual({ ok: true, result: "paid" });
  expect(await process(event)).toEqual({ ok: true, result: "already_processed" });
  expect(await process({ ...event, eventId: "second" })).toEqual({ ok: true, result: "already_processed" });
  expect(db.raw.prepare("SELECT count(*) AS n FROM order_events WHERE event_type = 'PAID'").get()?.n).toBe(1);
});
it.each([{ playerName: "Otro" }, { playerUuid: "u2" }, { packageId: "7664026" }, { basePriceCents: 1 }, { currency: "USD" }])("rejects signed-but-mismatched purchase %j", async change => {
  const { order, event } = await orderAndEvent();
  await expect(process({ ...event, purchase: { ...event.purchase!, ...change } })).rejects.toThrow(/no coincide/);
  expect((await getOrderByPublicId(env, order.public_id))?.status).toBe("PENDING_PAYMENT");
});
it("unknown order is retryable and transaction cannot pay two orders", async () => {
  const { event } = await orderAndEvent();
  await expect(process({ ...event, orderPublicId: "missing" })).rejects.toThrow(/no encontrado/);
  await process(event);
  const second = await createOrder(env, { playerName: "Jugador", playerUuid: "u1", productId: "rank_explorer", priceCents: 1499, currency: "EUR", paymentProvider: "tebex" });
  await expect(process({ ...event, eventId: "second", orderPublicId: second.public_id })).rejects.toThrow();
  expect((await getOrderByPublicId(env, second.public_id))?.status).toBe("CREATED");
});
it("refund removes undelivered order from the queue; late paid event never requeues it", async () => {
  const { order, event } = await orderAndEvent(); await process(event);
  await process({ eventId: "refund", providerPaymentId: event.providerPaymentId, status: "failed", reversal: true });
  await process({ ...event, eventId: "late" });
  expect((await getOrderByPublicId(env, order.public_id))?.status).toBe("REFUNDED");
});
it("checkout stays closed until explicitly enabled with all actual credentials", () => {
  expect(checkoutAvailable(env)).toBe(false);
  const keys = { ...env, TEBEX_PUBLIC_TOKEN: "test", TEBEX_PRIVATE_KEY: "test", TEBEX_WEBHOOK_SECRET: "test" };
  expect(checkoutAvailable(keys)).toBe(false);
  expect(checkoutAvailable({ ...keys, TEBEX_CHECKOUT_ENABLED: "true" })).toBe(true);
});
