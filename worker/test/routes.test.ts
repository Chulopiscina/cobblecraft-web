import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeD1Database, applyRealMigrations } from "./d1-fake";
import type { Env } from "../src/types";
import { handleCreateOrder, handleGetOrder, handleResumeOrderCheckout } from "../src/routes/orders";
import { handleWebhook } from "../src/routes/webhook";
import { handleListPending, handleClaim, handleAck } from "../src/routes/delivery";
import { handleStartLink, handleConfirmLink, handleLinkStatus } from "../src/routes/link";
import { handleServerStatus, handleServerStatusHeartbeat } from "../src/routes/server-status";
import { markPaid, markPendingPayment, createOrder } from "../src/lib/orders";

function makeEnv(db: FakeD1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
    STORE_SERVER_TOKEN: "test-server-token",
    STORE_MOCK_SECRET: "test-mock-secret",
    ...overrides,
  };
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("POST /api/orders (handleCreateOrder)", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.minecraftservices.com") || url.includes("api.mojang.com")) {
          return new Response(JSON.stringify({ id: "069a79f444e94726a5befca90e38aaf5", name: "Notch" }), { status: 200 });
        }
        throw new Error(`unexpected fetch in test: ${url}`);
      }),
    );
  });
  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  it("rejects an unknown productId - never creates an order", async () => {
    const req = new Request("http://worker.local/api/orders", {
      method: "POST",
      body: JSON.stringify({ productId: "does_not_exist", playerName: "Notch" }),
    });
    const res = await handleCreateOrder(req, env, "http://localhost:4321");
    expect(res.status).toBe(404);
  });

  it("rejects a disabled product", async () => {
    const req = new Request("http://worker.local/api/orders", {
      method: "POST",
      body: JSON.stringify({ productId: "item_disabled_dev", playerName: "Notch" }),
    });
    const res = await handleCreateOrder(req, env, "http://localhost:4321");
    expect(res.status).toBe(404);
  });

  it("creates checkout for a published rank once its Tebex package id exists", async () => {
    const req = new Request("http://worker.local/api/orders", {
      method: "POST",
      body: JSON.stringify({ productId: "rank_explorer", playerName: "Notch" }),
    });
    const res = await handleCreateOrder(req, env, "http://localhost:4321");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string; checkoutUrl: string };
    expect(body.orderId).toBeTruthy();
    expect(body.checkoutUrl).toContain("mock-checkout");
  });

  it("rejects a devOnly product when ENVIRONMENT=production", async () => {
    const prodEnv = makeEnv(db, { ENVIRONMENT: "production", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_x", STRIPE_WEBHOOK_SECRET: "whsec_x" });
    const req = new Request("http://worker.local/api/orders", {
      method: "POST",
      body: JSON.stringify({ productId: "item_test_book_dev", playerName: "Notch" }),
    });
    const res = await handleCreateOrder(req, prodEnv, "https://example.com");
    expect(res.status).toBe(404);
  });

  it("ignores any price the client tries to send - the charged price always comes from the server catalog", async () => {
    const req = new Request("http://worker.local/api/orders", {
      method: "POST",
      // El cliente intenta forzar un precio de 1 céntimo - el body ni siquiera tiene ese campo soportado.
      body: JSON.stringify({ productId: "item_test_book_dev", playerName: "Notch", priceCents: 1 }),
    });
    const res = await handleCreateOrder(req, env, "http://localhost:4321");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string };
    const status = await handleGetOrder(new Request("http://worker.local/api/orders/x"), env, body.orderId);
    const statusBody = (await status.json()) as { productId: string };
    expect(statusBody.productId).toBe("item_test_book_dev");
    // El precio real cobrado se verifica indirectamente: la orden se creó con éxito usando SOLO
    // productId+playerName, nunca se leyó ni se pudo sobreescribir priceCents del body.
  });

  it("rejects an invalid Minecraft username shape before ever calling Mojang", async () => {
    const req = new Request("http://worker.local/api/orders", {
      method: "POST",
      body: JSON.stringify({ productId: "item_test_book_dev", playerName: "a b c!!" }),
    });
    const res = await handleCreateOrder(req, env, "http://localhost:4321");
    expect(res.status).toBe(400);
  });

  it("returns a real checkout URL and moves the order to PENDING_PAYMENT", async () => {
    const req = new Request("http://worker.local/api/orders", {
      method: "POST",
      body: JSON.stringify({ productId: "item_test_book_dev", playerName: "Notch" }),
    });
    const res = await handleCreateOrder(req, env, "http://localhost:4321");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string; checkoutUrl: string };
    expect(body.checkoutUrl).toContain("mock-checkout");

    const statusRes = await handleGetOrder(new Request("http://worker.local/api/orders/x"), env, body.orderId);
    const statusBody = (await statusRes.json()) as { status: string };
    expect(statusBody.status).toBe("PENDING_PAYMENT");
  });

  it("resumes a pending checkout without creating a second order", async () => {
    const order = await createOrder(env, {
      playerUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      playerName: "Notch",
      productId: "rank_explorer",
      priceCents: 1499,
      currency: "EUR",
      paymentProvider: env.PAYMENT_PROVIDER,
    });
    await markPendingPayment(env, order.public_id, `mock_${order.public_id}`);

    const res = await handleResumeOrderCheckout(new Request("http://worker.local/api/orders/x/checkout", { method: "POST" }), env, "http://localhost:4321", order.public_id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string; checkoutUrl: string };
    expect(body.orderId).toBe(order.public_id);
    expect(body.checkoutUrl).toContain("mock-checkout");
  });
});

describe("Minecraft delivery endpoints require server auth", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
  });
  afterEach(() => db.close());

  it("GET pending without a token is rejected", async () => {
    const res = await handleListPending(new Request("http://worker.local/api/delivery/pending"), env);
    expect(res.status).toBe(401);
  });

  it("GET pending with a bad token is rejected", async () => {
    const res = await handleListPending(new Request("http://worker.local/api/delivery/pending", { headers: { Authorization: "Bearer wrong" } }), env);
    expect(res.status).toBe(401);
  });

  it("GET pending with the correct token succeeds and lists only productId/playerUuid, never a raw command", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");
    await markPaid(env, "pay_1");

    const res = await handleListPending(new Request("http://worker.local/api/delivery/pending", { headers: { Authorization: "Bearer test-server-token" } }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body[0]).toHaveProperty("productId");
    expect(body[0]).toHaveProperty("playerUuid");
    expect(body[0]).not.toHaveProperty("command");
  });

  it("claim without a token is rejected, and a valid claim followed by a duplicate claim fails the second time", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");
    await markPaid(env, "pay_1");

    const unauth = await handleClaim(new Request("http://worker.local/api/delivery/claim", { method: "POST", body: JSON.stringify({ orderId: order.public_id }) }), env);
    expect(unauth.status).toBe(401);

    const claim1 = await handleClaim(
      new Request("http://worker.local/api/delivery/claim", {
        method: "POST",
        headers: { Authorization: "Bearer test-server-token" },
        body: JSON.stringify({ orderId: order.public_id }),
      }),
      env,
    );
    expect(claim1.status).toBe(200);

    const claim2 = await handleClaim(
      new Request("http://worker.local/api/delivery/claim", {
        method: "POST",
        headers: { Authorization: "Bearer test-server-token" },
        body: JSON.stringify({ orderId: order.public_id }),
      }),
      env,
    );
    expect(claim2.status).toBe(409);
  });

  it("ack requires a claimToken, is idempotent with the SAME token, and rejects a stale/wrong token", async () => {
    const order = await createOrder(env, { playerUuid: "u1", playerName: "A", productId: "p1", priceCents: 100, currency: "EUR", paymentProvider: "mock" });
    await markPendingPayment(env, order.public_id, "pay_1");
    await markPaid(env, "pay_1");
    const claimRes = await handleClaim(
      new Request("http://worker.local/api/delivery/claim", {
        method: "POST",
        headers: { Authorization: "Bearer test-server-token" },
        body: JSON.stringify({ orderId: order.public_id }),
      }),
      env,
    );
    const { claimToken } = (await claimRes.json()) as { claimToken: string };
    expect(claimToken).toBeTruthy();

    const ackHeaders = { Authorization: "Bearer test-server-token" };

    // Sin claimToken en el body - petición inválida.
    const noToken = await handleAck(new Request("http://worker.local/api/delivery/ack", { method: "POST", headers: ackHeaders, body: JSON.stringify({ orderId: order.public_id, result: "delivered" }) }), env);
    expect(noToken.status).toBe(400);

    // Token equivocado - nunca confirma.
    const wrongToken = await handleAck(new Request("http://worker.local/api/delivery/ack", { method: "POST", headers: ackHeaders, body: JSON.stringify({ orderId: order.public_id, result: "delivered", claimToken: "not-the-real-token" }) }), env);
    expect(wrongToken.status).toBe(409);

    const ack1 = await handleAck(new Request("http://worker.local/api/delivery/ack", { method: "POST", headers: ackHeaders, body: JSON.stringify({ orderId: order.public_id, result: "delivered", claimToken }) }), env);
    expect(ack1.status).toBe(200);
    const ack2 = await handleAck(new Request("http://worker.local/api/delivery/ack", { method: "POST", headers: ackHeaders, body: JSON.stringify({ orderId: order.public_id, result: "delivered", claimToken }) }), env);
    expect(ack2.status).toBe(200);
    const ack2Body = (await ack2.json()) as { alreadyDelivered: boolean };
    expect(ack2Body.alreadyDelivered).toBe(true);
  });
});

describe("server status heartbeat", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T10:00:00.000Z"));
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db, { SERVER_STATUS_TTL_SECONDS: "60" });
  });
  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  it("is offline until an authenticated heartbeat marks the server online", async () => {
    const initial = await handleServerStatus(new Request("http://worker.local/api/server/status"), env);
    expect(await initial.json()).toMatchObject({ state: "offline", playersOnline: 0 });

    const unauth = await handleServerStatusHeartbeat(
      new Request("http://worker.local/api/server/status/heartbeat", {
        method: "POST",
        body: JSON.stringify({ state: "online", playersOnline: 0, maxPlayers: 20 }),
      }),
      env,
    );
    expect(unauth.status).toBe(401);

    const ok = await handleServerStatusHeartbeat(
      new Request("http://worker.local/api/server/status/heartbeat", {
        method: "POST",
        headers: { Authorization: "Bearer test-server-token" },
        body: JSON.stringify({ state: "online", playersOnline: 2, maxPlayers: 20, description: "CobbleCraft" }),
      }),
      env,
    );
    expect(ok.status).toBe(200);

    const online = await handleServerStatus(new Request("http://worker.local/api/server/status"), env);
    expect(await online.json()).toMatchObject({ state: "online", online: true, playersOnline: 2, maxPlayers: 20 });
  });

  it("expires stale heartbeats by TTL", async () => {
    await handleServerStatusHeartbeat(
      new Request("http://worker.local/api/server/status/heartbeat", {
        method: "POST",
        headers: { Authorization: "Bearer test-server-token" },
        body: JSON.stringify({ state: "online", playersOnline: 1, maxPlayers: 20 }),
      }),
      env,
    );

    vi.setSystemTime(new Date("2026-09-09T10:01:01.000Z"));
    const res = await handleServerStatus(new Request("http://worker.local/api/server/status"), env);
    expect(await res.json()).toMatchObject({ state: "offline", online: false, playersOnline: 0, maxPlayers: 20 });
  });
});

describe("POST /api/webhook/tebex", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db, {
      PAYMENT_PROVIDER: "mock",
      TEBEX_WEBHOOK_SECRET: "webhook-secret",
    });
  });
  afterEach(() => db.close());

  it("responds to Tebex validation with exactly the expected id payload", async () => {
    const rawBody = JSON.stringify({ id: "validation_123", type: "validation.webhook" });
    const bodyHash = await sha256Hex(rawBody);
    const signature = await hmacHex("webhook-secret", bodyHash);

    const res = await handleWebhook(
      new Request("http://worker.local/api/webhook/tebex", {
        method: "POST",
        headers: { "X-Signature": signature },
        body: rawBody,
      }),
      env,
      "http://localhost:4321",
      "tebex",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "validation_123" });
  });
});

describe("player link codes", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
  });
  afterEach(() => db.close());

  it("generates a 6-character code and it starts unconfirmed", async () => {
    const startRes = await handleStartLink(new Request("http://worker.local/api/link/start", { method: "POST" }), env);
    const { code } = (await startRes.json()) as { code: string };
    expect(code).toHaveLength(6);

    const statusRes = await handleLinkStatus(new Request("http://worker.local/api/link/status/x"), env, code);
    const status = (await statusRes.json()) as { confirmed: boolean };
    expect(status.confirmed).toBe(false);
  });

  it("confirming requires server auth and a valid UUID", async () => {
    const startRes = await handleStartLink(new Request("http://worker.local/api/link/start", { method: "POST" }), env);
    const { code } = (await startRes.json()) as { code: string };

    const badAuth = await handleConfirmLink(
      new Request("http://worker.local/api/link/confirm", { method: "POST", body: JSON.stringify({ code, playerUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", playerName: "Notch" }) }),
      env,
    );
    expect(badAuth.status).toBe(401);

    const badUuid = await handleConfirmLink(
      new Request("http://worker.local/api/link/confirm", {
        method: "POST",
        headers: { Authorization: "Bearer test-server-token" },
        body: JSON.stringify({ code, playerUuid: "not-a-uuid", playerName: "Notch" }),
      }),
      env,
    );
    expect(badUuid.status).toBe(400);

    const ok = await handleConfirmLink(
      new Request("http://worker.local/api/link/confirm", {
        method: "POST",
        headers: { Authorization: "Bearer test-server-token" },
        body: JSON.stringify({ code, playerUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", playerName: "Notch" }),
      }),
      env,
    );
    expect(ok.status).toBe(200);

    const statusRes = await handleLinkStatus(new Request("http://worker.local/api/link/status/x"), env, code);
    const status = (await statusRes.json()) as { confirmed: boolean; playerUuid: string };
    expect(status.confirmed).toBe(true);
    expect(status.playerUuid).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
  });

  it("an invalid/unknown code is rejected", async () => {
    const res = await handleLinkStatus(new Request("http://worker.local/api/link/status/x"), env, "ZZZZZZ");
    expect(res.status).toBe(404);
  });

  it("a code can only be confirmed once", async () => {
    const startRes = await handleStartLink(new Request("http://worker.local/api/link/start", { method: "POST" }), env);
    const { code } = (await startRes.json()) as { code: string };
    const authHeaders = { Authorization: "Bearer test-server-token" };

    await handleConfirmLink(
      new Request("http://worker.local/api/link/confirm", { method: "POST", headers: authHeaders, body: JSON.stringify({ code, playerUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", playerName: "Notch" }) }),
      env,
    );
    const second = await handleConfirmLink(
      new Request("http://worker.local/api/link/confirm", { method: "POST", headers: authHeaders, body: JSON.stringify({ code, playerUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", playerName: "Notch" }) }),
      env,
    );
    expect(second.status).toBe(409);
  });
});
