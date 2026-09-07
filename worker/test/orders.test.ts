import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FakeD1Database, applyRealMigrations } from "./d1-fake";
import type { Env } from "../src/types";
import {
  createOrder,
  markPendingPayment,
  markPaid,
  getOrderByPublicId,
  listDeliverable,
  claimOrder,
  ackDelivered,
  isWebhookAlreadyProcessed,
  recordWebhookProcessed,
} from "../src/lib/orders";

function makeEnv(db: FakeD1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
    ...overrides,
  };
}

describe("orders (real SQLite semantics)", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
  });

  afterEach(() => db.close());

  it("creates an order in CREATED status with an opaque public_id", async () => {
    const order = await createOrder(env, {
      playerUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      playerName: "Notch",
      productId: "item_test_book_dev",
      priceCents: 150,
      currency: "EUR",
      paymentProvider: "mock",
    });
    expect(order.status).toBe("CREATED");
    expect(order.public_id).toMatch(/^ord_/);
  });

  it("markPendingPayment moves CREATED -> PENDING_PAYMENT and records the provider payment id", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "mock_pay_1");
    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("PENDING_PAYMENT");
    expect(reloaded?.provider_payment_id).toBe("mock_pay_1");
  });

  it("markPaid moves the order to PAID exactly once - a second call with the same providerPaymentId is a no-op (idempotent)", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "mock_pay_1");

    const first = await markPaid(env, "mock_pay_1");
    expect(first).toBe("PAID");

    const second = await markPaid(env, "mock_pay_1");
    expect(second).toBe("ALREADY_PAID");

    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("PAID");
  });

  it("a provider_payment_id can never be attached to two different orders (real UNIQUE constraint, exactly-once payment)", async () => {
    const orderA = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    const orderB = await createOrder(env, { playerUuid: "u2", playerName: "B", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, orderA.public_id, "shared_payment_id");
    await markPaid(env, "shared_payment_id");

    // Un segundo pedido intentando usar el MISMO provider_payment_id nunca debe poder marcarse PAID.
    await expect(markPendingPayment(env, orderB.public_id, "shared_payment_id")).rejects.toThrow();
  });

  it("listDeliverable returns PAID orders and excludes CREATED", async () => {
    const created = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    const paid = await createOrder(env, { playerUuid: "u2", playerName: "B", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, paid.public_id, "pay_paid");
    await markPaid(env, "pay_paid");

    const deliverable = await listDeliverable(env);
    const ids = deliverable.map((o) => o.public_id);
    expect(ids).toContain(paid.public_id);
    expect(ids).not.toContain(created.public_id);
  });

  it("claimOrder is atomic - claiming an already-CLAIMED order (within the timeout window) fails", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");
    await markPaid(env, "pay_1");

    const firstClaim = await claimOrder(env, order.public_id);
    expect(firstClaim.status).toBe("CLAIMED");

    const secondClaim = await claimOrder(env, order.public_id);
    expect(secondClaim.status).toBe("ALREADY_CLAIMED");
  });

  it("claimOrder on an unknown order returns NOT_FOUND", async () => {
    const result = await claimOrder(env, "ord_does_not_exist");
    expect(result.status).toBe("NOT_FOUND");
  });

  it("claimOrder returns a fresh, non-empty claimToken on every successful claim (lease identity)", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");
    await markPaid(env, "pay_1");

    const claim = await claimOrder(env, order.public_id);
    expect(claim.status).toBe("CLAIMED");
    if (claim.status === "CLAIMED") {
      expect(claim.claimToken.length).toBeGreaterThan(10);
    }
  });

  it("a stale CLAIMED order past the timeout becomes claimable again with a NEW claimToken (self-healing retry)", async () => {
    const shortTimeoutEnv = makeEnv(db, { CLAIM_TIMEOUT_SECONDS: "0" });
    const order = await createOrder(shortTimeoutEnv, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(shortTimeoutEnv, order.public_id, "pay_1");
    await markPaid(shortTimeoutEnv, "pay_1");
    const firstClaim = await claimOrder(shortTimeoutEnv, order.public_id);

    // Con CLAIM_TIMEOUT_SECONDS=0, cualquier CLAIMED anterior ya cuenta como "vencido".
    await new Promise((r) => setTimeout(r, 5));
    const reclaimed = await claimOrder(shortTimeoutEnv, order.public_id);
    expect(reclaimed.status).toBe("CLAIMED");
    if (firstClaim.status === "CLAIMED" && reclaimed.status === "CLAIMED") {
      expect(reclaimed.claimToken).not.toBe(firstClaim.claimToken);
    }
  });

  it("ackDelivered marks DELIVERED and is idempotent on a second call with the SAME claimToken", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");
    await markPaid(env, "pay_1");
    const claim = await claimOrder(env, order.public_id);
    if (claim.status !== "CLAIMED") throw new Error("expected CLAIMED");

    const first = await ackDelivered(env, order.public_id, claim.claimToken);
    expect(first).toBe("DELIVERED");
    const second = await ackDelivered(env, order.public_id, claim.claimToken);
    expect(second).toBe("ALREADY_DELIVERED");

    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("DELIVERED");
  });

  it("ackDelivered on an order that was never claimed does not deliver it", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    const result = await ackDelivered(env, order.public_id, "some-token");
    expect(result).toBe("ALREADY_DELIVERED"); // 0 filas afectadas - nunca se entregó nada
    const reloaded = await getOrderByPublicId(env, order.public_id);
    expect(reloaded?.status).toBe("CREATED");
  });

  it("ackDelivered with a claimToken from a SUPERSEDED claim generation is rejected as STALE_CLAIM, never confirmed", async () => {
    const shortTimeoutEnv = makeEnv(db, { CLAIM_TIMEOUT_SECONDS: "0" });
    const order = await createOrder(shortTimeoutEnv, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(shortTimeoutEnv, order.public_id, "pay_1");
    await markPaid(shortTimeoutEnv, "pay_1");
    const staleClaim = await claimOrder(shortTimeoutEnv, order.public_id);
    if (staleClaim.status !== "CLAIMED") throw new Error("expected CLAIMED");

    // El timeout expira y OTRO ciclo reclama el pedido (nueva generación, nuevo token).
    await new Promise((r) => setTimeout(r, 5));
    const freshClaim = await claimOrder(shortTimeoutEnv, order.public_id);
    if (freshClaim.status !== "CLAIMED") throw new Error("expected CLAIMED");

    // Un ACK muy tardío de la generación VIEJA nunca debe confirmar el pedido.
    const staleAck = await ackDelivered(shortTimeoutEnv, order.public_id, staleClaim.claimToken);
    expect(staleAck).toBe("STALE_CLAIM");
    const reloaded = await getOrderByPublicId(shortTimeoutEnv, order.public_id);
    expect(reloaded?.status).toBe("CLAIMED"); // sigue reclamado por la generación fresca, no DELIVERED por el token viejo

    // El ACK correcto (token fresco) sí confirma.
    const freshAck = await ackDelivered(shortTimeoutEnv, order.public_id, freshClaim.claimToken);
    expect(freshAck).toBe("DELIVERED");
  });

  it("webhook replay: the same eventId is never processed twice", async () => {
    expect(await isWebhookAlreadyProcessed(env, "mock", "evt_1")).toBe(false);
    await recordWebhookProcessed(env, "mock", "evt_1");
    expect(await isWebhookAlreadyProcessed(env, "mock", "evt_1")).toBe(true);
    // Segunda escritura del mismo evento nunca lanza (INSERT OR IGNORE real).
    await expect(recordWebhookProcessed(env, "mock", "evt_1")).resolves.not.toThrow();
  });
});
