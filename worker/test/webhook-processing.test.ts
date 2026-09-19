import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FakeD1Database, applyRealMigrations } from "./d1-fake";
import type { Env } from "../src/types";
import { createOrder, markPendingPayment, getOrderByPublicId } from "../src/lib/orders";
import { processProviderWebhook } from "../src/lib/webhook-processing";
import type { CheckoutRequest, CheckoutSession, PaymentProvider, WebhookEvent } from "../src/lib/payment/PaymentProvider";

class FakeProvider implements PaymentProvider {
  readonly id = "mock" as const;
  constructor(private readonly event: WebhookEvent | null) {}
  async createCheckout(_req: CheckoutRequest): Promise<CheckoutSession> {
    throw new Error("not used in this test");
  }
  async verifyWebhook(): Promise<WebhookEvent | null> {
    return this.event;
  }
}

function makeEnv(db: FakeD1Database): Env {
  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
  };
}

describe("processProviderWebhook", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
  });
  afterEach(() => db.close());

  it("an invalid signature never touches the order - returns ok:false", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");

    const result = await processProviderWebhook(env, new FakeProvider(null), "{}", new Headers());
    expect(result.ok).toBe(false);

    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("PENDING_PAYMENT");
  });

  it("a valid paid event marks the order PAID exactly once, even if the SAME event is replayed", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");

    const provider = new FakeProvider({ eventId: "evt_1", providerPaymentId: "pay_1", status: "paid" });
    const first = await processProviderWebhook(env, provider, "{}", new Headers());
    expect(first).toEqual({ ok: true, result: "paid" });

    const replay = await processProviderWebhook(env, provider, "{}", new Headers());
    expect(replay).toEqual({ ok: true, result: "already_processed" });

    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("PAID");
  });

  it("an ignored event type never touches order status", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");

    const provider = new FakeProvider({ eventId: "evt_ignored", providerPaymentId: "pay_1", status: "ignored" });
    const result = await processProviderWebhook(env, provider, "{}", new Headers());
    expect(result).toEqual({ ok: true, result: "ignored" });

    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("PENDING_PAYMENT");
  });

  it("a validation event returns the validation id without touching orders", async () => {
    const result = await processProviderWebhook(env, new FakeProvider({ eventId: "validation_123", providerPaymentId: "validation_123", status: "validation" }), "{}", new Headers());
    expect(result).toEqual({ ok: true, result: "validation", validationId: "validation_123" });
  });

  it("a failed payment event is recorded but never marks the order PAID", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");

    const provider = new FakeProvider({ eventId: "evt_failed", providerPaymentId: "pay_1", status: "failed" });
    const result = await processProviderWebhook(env, provider, "{}", new Headers());
    expect(result).toEqual({ ok: true, result: "failed" });

    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("PENDING_PAYMENT");
  });
});
