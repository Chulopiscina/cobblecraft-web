import { describe, expect, it, vi, afterEach } from "vitest";
import { TebexPaymentProvider } from "../src/lib/payment/TebexPaymentProvider";

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("TebexPaymentProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a Headless basket, adds the configured Tebex package, and returns a hosted checkout URL", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/accounts/public-token/baskets")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as { username: string; ip_address: string; custom: { orderPublicId: string; playerName: string; playerUuid: string } };
        expect(body.username).toBe("Notch");
        expect(body.ip_address).toBe("203.0.113.10");
        expect(body.custom).toEqual({ orderPublicId: "ord_abc", playerName: "Notch", playerUuid: "uuid" });
        return new Response(JSON.stringify({ data: { ident: "basket_123" } }), { status: 200 });
      }
      if (url.endsWith("/baskets/basket_123/packages")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ package_id: 12345, quantity: 1 });
        return new Response(JSON.stringify({ data: { ident: "basket_123", links: { checkout: "https://checkout.tebex.io/checkout/basket_123" } } }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TebexPaymentProvider("public-token", "webhook-secret");
    const session = await provider.createCheckout({
      orderPublicId: "ord_abc",
      productName: "Producto real",
      priceCents: 100,
      currency: "EUR",
      successUrl: "https://site/tienda/gracias?order=ord_abc",
      cancelUrl: "https://site/tienda/producto",
      playerName: "Notch",
      playerUuid: "uuid",
      customerIp: "203.0.113.10",
      providerPackageId: "12345",
    });

    expect(session).toEqual({ checkoutUrl: "https://checkout.tebex.io/checkout/basket_123", providerPaymentId: "basket_123" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects checkout creation if the product has no Tebex package id", async () => {
    const provider = new TebexPaymentProvider("public-token", "webhook-secret");
    await expect(
      provider.createCheckout({
        orderPublicId: "ord_abc",
        productName: "Producto",
        priceCents: 100,
        currency: "EUR",
        successUrl: "https://site/ok",
        cancelUrl: "https://site/cancel",
        playerName: "Notch",
        playerUuid: "uuid",
      }),
    ).rejects.toThrow(/tebexPackageId/);
  });

  it("verifies Tebex X-Signature and extracts the order id from custom data", async () => {
    const provider = new TebexPaymentProvider("public-token", "webhook-secret");
    const rawBody = JSON.stringify({
      id: "evt_1",
      type: "payment.completed",
      subject: {
        transaction_id: "tbx_txn_1",
        basket: { ident: "basket_123" },
        custom: { orderPublicId: "ord_abc" },
      },
    });
    const bodyHash = await sha256Hex(rawBody);
    const signature = await hmacHex("webhook-secret", bodyHash);

    const event = await provider.verifyWebhook(rawBody, new Headers({ "X-Signature": signature }));
    expect(event).toEqual({ eventId: "evt_1", providerPaymentId: "basket_123", orderPublicId: "ord_abc", status: "paid" });
  });

  it("rejects forged Tebex signatures", async () => {
    const provider = new TebexPaymentProvider("public-token", "webhook-secret");
    const event = await provider.verifyWebhook(JSON.stringify({ id: "evt_1", type: "payment.completed" }), new Headers({ "X-Signature": "forged" }));
    expect(event).toBeNull();
  });
});
