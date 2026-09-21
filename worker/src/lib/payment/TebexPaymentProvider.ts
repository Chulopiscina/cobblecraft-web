import { z } from "zod";
import type { CheckoutRequest, CheckoutSession, PaymentProvider, ResumeCheckoutRequest, WebhookEvent } from "./PaymentProvider";
import { timingSafeEqual } from "../security";

const API = "https://headless.tebex.io/api";
const Basket = z.object({
  ident: z.string().min(1), complete: z.boolean().optional(),
  username: z.string().nullable().optional(),
  base_price: z.number().nonnegative().optional(), currency: z.string().optional(),
  custom: z.object({ orderPublicId: z.string(), playerUuid: z.string() }).passthrough().nullable().optional(),
  packages: z.array(z.object({ id: z.coerce.string(), in_basket: z.object({ quantity: z.number() }) })).optional(),
  links: z.object({ checkout: z.string().optional() }).optional(),
});
type BasketData = z.infer<typeof Basket>;
const Username = z.object({ id: z.union([z.string(), z.number()]).optional(), username: z.string() });
const PaidSubject = z.object({
  transaction_id: z.string().min(1),
  custom: z.object({ orderPublicId: z.string(), playerUuid: z.string() }),
  products: z.array(z.object({
    id: z.coerce.string(), quantity: z.literal(1), username: Username,
    base_price: z.object({ amount: z.number().nonnegative(), currency: z.string() }),
  })).length(1),
});

export function safeTebexCheckoutUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "checkout.tebex.io" || url.username || url.password ||
      url.port || !url.pathname.startsWith("/checkout/")) throw new Error("URL de checkout Tebex invalida.");
  return url.href;
}

async function signatureFor(secret: string, body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(hex(digest))));
}

/** Minecraft Headless: server-side identity, one basket/package, hosted checkout only. */
export class TebexPaymentProvider implements PaymentProvider {
  readonly id = "tebex" as const;
  constructor(private readonly publicToken: string | undefined, private readonly webhookSecret: string, private readonly privateKey?: string) {}

  private async request(path: string, operation: string, body?: unknown, method = "POST", authenticated = false): Promise<unknown> {
    try {
      const res = await fetch(`${API}${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json", "Content-Type": "application/json",
          ...(authenticated ? { Authorization: `Basic ${btoa(`${this.publicToken}:${this.privateKey}`)}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
      if (res.status === 204) return null;
      return await res.json();
    } catch (e) {
      // Never log an upstream body, URL containing credentials, basket contents or customer IP.
      const reason = e instanceof Error && /^HTTP \d{3}$/.test(e.message) ? e.message : "timeout/red/formato";
      throw new Error(`Tebex ${operation}: ${reason}`);
    }
  }
  private check(req: CheckoutRequest): void {
    if (!req.providerPackageId || !/^\d+$/.test(req.providerPackageId)) throw new Error("Producto sin packageId valido en web/store/tebex-packages.json.");
    if (!this.publicToken) throw new Error("TEBEX_PUBLIC_TOKEN no configurado.");
    if (!this.privateKey) throw new Error("TEBEX_PRIVATE_KEY no configurado para checkout Minecraft server-side.");
  }
  private unwrap(raw: unknown): BasketData {
    const record = raw as { data?: unknown } | null;
    return Basket.parse(record?.data ?? raw);
  }
  private accountPath(): string { return `/accounts/${encodeURIComponent(this.publicToken!)}`; }
  private verifyIdentity(basket: BasketData, req: CheckoutRequest): void {
    if (basket.complete) throw new Error("El basket ya esta completado.");
    if (basket.username?.toLowerCase() !== req.playerName.toLowerCase() ||
        basket.custom?.orderPublicId !== req.orderPublicId ||
        basket.custom?.playerUuid !== req.playerUuid) throw new Error("La identidad del basket no coincide con el pedido.");
  }
  private session(basket: BasketData, req: CheckoutRequest): CheckoutSession {
    this.verifyIdentity(basket, req);
    if (basket.packages?.length !== 1 || basket.packages[0]?.id !== req.providerPackageId || basket.packages[0].in_basket.quantity !== 1) {
      throw new Error("El basket debe contener exactamente el paquete solicitado, cantidad 1.");
    }
    if (!basket.links?.checkout) throw new Error("Tebex no devolvio links.checkout.");
    if (basket.currency !== req.currency || Math.round((basket.base_price ?? -1) * 100) !== req.priceCents) {
      throw new Error("El precio base o moneda de Tebex no coincide con el catalogo.");
    }
    return { checkoutUrl: safeTebexCheckoutUrl(basket.links.checkout), providerPaymentId: basket.ident };
  }
  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    this.check(req);
    if (!z.string().ip().safeParse(req.customerIp).success) throw new Error("Falta IP real del cliente para Tebex.");
    const basket = this.unwrap(await this.request(`${this.accountPath()}/baskets`, "crear basket", {
      username: req.playerName, ip_address: req.customerIp,
      complete_url: req.successUrl, cancel_url: req.cancelUrl, complete_auto_redirect: true,
      custom: { orderPublicId: req.orderPublicId, playerName: req.playerName, playerUuid: req.playerUuid },
    }, "POST", true));
    this.verifyIdentity(basket, req);
    const updated = this.unwrap(await this.request(`/baskets/${encodeURIComponent(basket.ident)}/packages`, "anadir paquete", {
      package_id: req.providerPackageId, quantity: 1,
    }));
    if (updated.ident !== basket.ident) throw new Error("Basket inesperado al anadir paquete.");
    return this.session(updated, req);
  }
  async resumeCheckout(req: ResumeCheckoutRequest): Promise<CheckoutSession> {
    this.check(req);
    // Resume is read-only: POST add increments quantity when a basket is reused.
    const basket = this.unwrap(await this.request(`${this.accountPath()}/baskets/${encodeURIComponent(req.providerPaymentId)}`, "consultar basket", undefined, "GET", true));
    if (basket.ident !== req.providerPaymentId) throw new Error("Basket inesperado al reanudar.");
    return this.session(basket, req);
  }
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null> {
    const signature = headers.get("X-Signature");
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || !timingSafeEqual(signature.toLowerCase(), await signatureFor(this.webhookSecret, rawBody))) return null;
    try {
      const payload = z.object({ id: z.string().min(1).max(200), type: z.string(), subject: z.unknown().optional() }).parse(JSON.parse(rawBody));
      if (payload.type === "validation.webhook") return { eventId: payload.id, providerPaymentId: payload.id, status: "validation" };
      if (payload.type === "payment.completed") {
        const subject = PaidSubject.parse(payload.subject);
        const product = subject.products[0]!;
        return {
          eventId: payload.id, eventType: payload.type, providerPaymentId: subject.transaction_id, orderPublicId: subject.custom.orderPublicId, status: "paid",
          purchase: { packageId: product.id, playerName: product.username.username, playerUuid: subject.custom.playerUuid,
            recipientId: String(product.username.id ?? ""), basePriceCents: Math.round(product.base_price.amount * 100), currency: product.base_price.currency },
        };
      }
      if (["payment.refunded", "payment.dispute.opened", "payment.dispute.lost"].includes(payload.type)) {
        const subject = z.object({ transaction_id: z.string().min(1) }).parse(payload.subject);
        return { eventId: payload.id, eventType: payload.type, providerPaymentId: subject.transaction_id, status: "failed", reversal: true };
      }
      // A decline is not final for a basket. Only payment.completed can queue delivery.
      return { eventId: payload.id, providerPaymentId: payload.id, status: "ignored" };
    } catch { return null; }
  }
}
