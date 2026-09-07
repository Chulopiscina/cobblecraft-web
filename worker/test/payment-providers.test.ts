import { describe, it, expect } from "vitest";
import { MockPaymentProvider } from "../src/lib/payment/MockPaymentProvider";
import { StripePaymentProvider } from "../src/lib/payment/StripePaymentProvider";

describe("MockPaymentProvider", () => {
  const provider = new MockPaymentProvider("test-secret", "http://localhost:4321");

  it("createCheckout returns a URL on the site domain, never a provider-hosted domain", async () => {
    const session = await provider.createCheckout({
      orderPublicId: "ord_abc",
      productName: "Test",
      priceCents: 100,
      currency: "EUR",
      successUrl: "http://localhost:4321/ok",
      cancelUrl: "http://localhost:4321/cancel",
      playerName: "Notch",
      playerUuid: "uuid",
    });
    expect(session.checkoutUrl).toContain("http://localhost:4321/tienda/mock-checkout");
    expect(session.checkoutUrl).toContain("ord_abc");
  });

  it("verifyWebhook accepts a correctly signed payload", async () => {
    const rawBody = JSON.stringify({ eventId: "evt_1", orderPublicId: "ord_abc", status: "paid" });
    const signature = await MockPaymentProvider.sign("test-secret", rawBody);
    const event = await provider.verifyWebhook(rawBody, new Headers({ "X-Mock-Signature": signature }));
    expect(event).toEqual({ eventId: "evt_1", providerPaymentId: "mock_ord_abc", status: "paid", orderPublicId: "ord_abc" });
  });

  it("verifyWebhook rejects a missing signature", async () => {
    const rawBody = JSON.stringify({ eventId: "evt_1", orderPublicId: "ord_abc", status: "paid" });
    const event = await provider.verifyWebhook(rawBody, new Headers());
    expect(event).toBeNull();
  });

  it("verifyWebhook rejects a forged/incorrect signature", async () => {
    const rawBody = JSON.stringify({ eventId: "evt_1", orderPublicId: "ord_abc", status: "paid" });
    const event = await provider.verifyWebhook(rawBody, new Headers({ "X-Mock-Signature": "0000forged0000" }));
    expect(event).toBeNull();
  });

  it("verifyWebhook rejects a signature computed with the wrong secret", async () => {
    const rawBody = JSON.stringify({ eventId: "evt_1", orderPublicId: "ord_abc", status: "paid" });
    const wrongSignature = await MockPaymentProvider.sign("wrong-secret", rawBody);
    const event = await provider.verifyWebhook(rawBody, new Headers({ "X-Mock-Signature": wrongSignature }));
    expect(event).toBeNull();
  });

  it("a tampered body (different from what was signed) is rejected even with a previously valid signature", async () => {
    const originalBody = JSON.stringify({ eventId: "evt_1", orderPublicId: "ord_abc", status: "paid" });
    const signature = await MockPaymentProvider.sign("test-secret", originalBody);
    const tamperedBody = JSON.stringify({ eventId: "evt_1", orderPublicId: "ord_abc", status: "paid", priceCents: 1 });
    const event = await provider.verifyWebhook(tamperedBody, new Headers({ "X-Mock-Signature": signature }));
    expect(event).toBeNull();
  });

  it("a malformed JSON body with an otherwise-valid signature never throws, returns null", async () => {
    const body = "{not valid json";
    const signature = await MockPaymentProvider.sign("test-secret", body);
    const event = await provider.verifyWebhook(body, new Headers({ "X-Mock-Signature": signature }));
    expect(event).toBeNull();
  });
});

describe("StripePaymentProvider webhook signature verification (pure crypto, no live API call)", () => {
  const provider = new StripePaymentProvider("sk_test_unused", "whsec_test_secret");

  async function hmacHex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  it("accepts a validly signed checkout.session.completed event and reports status=paid", async () => {
    const body = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", client_reference_id: "ord_abc", payment_status: "paid" } },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacHex("whsec_test_secret", `${timestamp}.${body}`);
    const event = await provider.verifyWebhook(body, new Headers({ "Stripe-Signature": `t=${timestamp},v1=${signature}` }));
    expect(event).toEqual({ eventId: "evt_1", providerPaymentId: "cs_test_1", status: "paid", orderPublicId: "ord_abc" });
  });

  it("rejects a forged signature", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid" } } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const event = await provider.verifyWebhook(body, new Headers({ "Stripe-Signature": `t=${timestamp},v1=forged` }));
    expect(event).toBeNull();
  });

  it("rejects a missing Stripe-Signature header", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });
    const event = await provider.verifyWebhook(body, new Headers());
    expect(event).toBeNull();
  });

  it("non-payment event types are reported as ignored, never marked paid", async () => {
    const body = JSON.stringify({ id: "evt_2", type: "customer.created", data: { object: { id: "cus_1" } } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacHex("whsec_test_secret", `${timestamp}.${body}`);
    const event = await provider.verifyWebhook(body, new Headers({ "Stripe-Signature": `t=${timestamp},v1=${signature}` }));
    expect(event?.status).toBe("ignored");
  });

  it("rejects a validly-signed webhook whose timestamp is far outside the tolerance window (Production Hardening V1, Fase A)", async () => {
    const body = JSON.stringify({ id: "evt_3", type: "checkout.session.completed", data: { object: { id: "cs_old", payment_status: "paid" } } });
    const veryOldTimestamp = "1700000000"; // 2023 - muy fuera de la ventana de tolerancia real
    const signature = await hmacHex("whsec_test_secret", `${veryOldTimestamp}.${body}`);
    const event = await provider.verifyWebhook(body, new Headers({ "Stripe-Signature": `t=${veryOldTimestamp},v1=${signature}` }));
    expect(event).toBeNull();
  });

  it("rejects a webhook whose signature body was tampered with, even with a fresh timestamp and the base signature reused", async () => {
    const originalBody = JSON.stringify({ id: "evt_4", type: "checkout.session.completed", data: { object: { id: "cs_4", payment_status: "paid" } } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacHex("whsec_test_secret", `${timestamp}.${originalBody}`);
    const tamperedBody = JSON.stringify({ id: "evt_4", type: "checkout.session.completed", data: { object: { id: "cs_4", payment_status: "paid", extra: "injected" } } });
    const event = await provider.verifyWebhook(tamperedBody, new Headers({ "Stripe-Signature": `t=${timestamp},v1=${signature}` }));
    expect(event).toBeNull();
  });

  it("a malformed JSON body with an otherwise-valid signature never throws, returns null", async () => {
    const body = "{not valid json";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacHex("whsec_test_secret", `${timestamp}.${body}`);
    const event = await provider.verifyWebhook(body, new Headers({ "Stripe-Signature": `t=${timestamp},v1=${signature}` }));
    expect(event).toBeNull();
  });
});
