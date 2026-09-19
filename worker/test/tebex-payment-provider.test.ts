import { describe, expect, it, vi, afterEach } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { TebexPaymentProvider, safeTebexCheckoutUrl } from "../src/lib/payment/TebexPaymentProvider";
import type { CheckoutRequest } from "../src/lib/payment/PaymentProvider";

const req: CheckoutRequest = { orderPublicId: "ord_test", productName: "Explorador", priceCents: 1499, currency: "EUR",
  successUrl: "https://site.test/tienda/gracias?order=ord_test", cancelUrl: "https://site.test/tienda/rango-explorador",
  playerName: "Notch", playerUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", customerIp: "203.0.113.10", providerPackageId: "7664019" };
const basket = { ident: "basket_test", complete: false, username: req.playerName,
  base_price: 14.99, currency: "EUR",
  custom: { orderPublicId: req.orderPublicId, playerUuid: req.playerUuid },
  packages: [{ id: 7664019, in_basket: { quantity: 1 } }], links: { checkout: "https://checkout.tebex.io/checkout/basket_test" } };
const provider = () => new TebexPaymentProvider("public-token", "test-secret", "private-key");
function signed(payload: unknown) {
  const raw = JSON.stringify(payload);
  return { raw, headers: new Headers({ "X-Signature": createHmac("sha256", "test-secret").update(createHash("sha256").update(raw).digest("hex")).digest("hex") }) };
}
export function paidPayload() {
  return { id: "evt-paid", type: "payment.completed", subject: {
    transaction_id: "tbx-paid", custom: { orderPublicId: req.orderPublicId, playerUuid: req.playerUuid },
    products: [{ id: 7664019, quantity: 1, username: { id: req.playerUuid.replace(/-/g, ""), username: "Notch" }, base_price: { amount: 14.99, currency: "EUR" } }],
  } };
}
describe("Tebex Minecraft Headless", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("creates attributed basket and one official package, never client-side card handling", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal); expect(init?.redirect).toBe("error");
      if (url.endsWith("/accounts/public-token/baskets")) {
        expect(new Headers(init?.headers).get("Authorization")).toBe(`Basic ${btoa("public-token:private-key")}`);
        expect(JSON.parse(String(init?.body))).toMatchObject({ username: "Notch", ip_address: req.customerIp, complete_url: req.successUrl, cancel_url: req.cancelUrl, custom: basket.custom });
        return Response.json({ data: { ...basket, packages: [] } });
      }
      expect(url).toBe("https://headless.tebex.io/api/baskets/basket_test/packages");
      expect(JSON.parse(String(init?.body))).toEqual({ package_id: "7664019", quantity: 1 });
      return Response.json({ data: basket });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await provider().createCheckout(req)).toEqual({ checkoutUrl: basket.links.checkout, providerPaymentId: basket.ident });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("resume is GET only and repeated resume never adds another package", async () => {
    const fetcher = vi.fn(async (_url, init) => { expect(init.method).toBe("GET"); return Response.json({ data: basket }); });
    vi.stubGlobal("fetch", fetcher);
    const resume = { ...req, providerPaymentId: basket.ident };
    expect(await provider().resumeCheckout(resume)).toEqual(await provider().resumeCheckout(resume));
  });
  it.each([
    { ...basket, username: "Otro" }, { ...basket, complete: true }, { ...basket, custom: { ...basket.custom, orderPublicId: "other" } },
    { ...basket, packages: [{ id: 7664019, in_basket: { quantity: 2 } }] }, { ...basket, links: {} },
    { ...basket, base_price: 1 }, { ...basket, currency: "USD" },
  ])("rejects wrong identity, completed basket, quantity or missing checkout", async value => {
    vi.stubGlobal("fetch", async () => Response.json({ data: value }));
    await expect(provider().resumeCheckout({ ...req, providerPaymentId: basket.ident })).rejects.toThrow();
  });
  it("fails before network without private key, valid package or real customer IP", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(new TebexPaymentProvider("public", "secret").createCheckout(req)).rejects.toThrow(/TEBEX_PRIVATE_KEY/);
    await expect(provider().createCheckout({ ...req, providerPackageId: undefined })).rejects.toThrow(/tebex-packages/);
    await expect(provider().createCheckout({ ...req, customerIp: "unknown" })).rejects.toThrow(/IP real/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not reflect upstream credentials, PII or error bodies", async () => {
    vi.stubGlobal("fetch", async () => new Response("private-key personal-data", { status: 401 }));
    await expect(provider().createCheckout(req)).rejects.toThrow("Tebex crear basket: HTTP 401");
  });
  it.each(["http://checkout.tebex.io/checkout/test", "https://evil.test/checkout/test", "https://checkout.tebex.io.evil.test/checkout/test", "javascript:alert(1)", "https://user:pass@checkout.tebex.io/checkout/test"])("rejects unsafe redirect %s", value => {
    expect(() => safeTebexCheckoutUrl(value)).toThrow();
  });
  it("verifies official HMAC, transaction, package, recipient and price", async () => {
    const s = signed(paidPayload());
    expect(await provider().verifyWebhook(s.raw, s.headers)).toMatchObject({ eventId: "evt-paid", providerPaymentId: "tbx-paid", status: "paid",
      purchase: { packageId: "7664019", playerName: "Notch", basePriceCents: 1499, currency: "EUR" } });
    expect(await provider().verifyWebhook(s.raw + " ", s.headers)).toBeNull();
    expect(await provider().verifyWebhook(s.raw, new Headers({ "X-Signature": "forged" }))).toBeNull();
  });
  it("rejects malformed paid payload or missing stable event ID even with valid signature", async () => {
    for (const payload of [{ ...paidPayload(), id: undefined }, { id: "evt", type: "payment.completed", subject: { transaction_id: "tbx" } }]) {
      const s = signed(payload); expect(await provider().verifyWebhook(s.raw, s.headers)).toBeNull();
    }
  });
  it("validation works without checkout credentials", async () => {
    const s = signed({ id: "validation", type: "validation.webhook" });
    expect(await new TebexPaymentProvider(undefined, "test-secret").verifyWebhook(s.raw, s.headers)).toEqual({ eventId: "validation", providerPaymentId: "validation", status: "validation" });
  });
  it("a refund containing completed status is NEVER classified as paid", async () => {
    const payload = paidPayload(); payload.type = "payment.refunded";
    const s = signed({ ...payload, subject: { ...payload.subject, status: { description: "Complete" } } });
    expect(await provider().verifyWebhook(s.raw, s.headers)).toMatchObject({ status: "failed", reversal: true });
  });
});
