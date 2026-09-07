import type { CheckoutRequest, CheckoutSession, PaymentProvider, WebhookEvent } from "./PaymentProvider";
import { timingSafeEqual } from "../security";

const TEBEX_API_BASE = "https://headless.tebex.io/api";

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function findString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.length > 0) return direct;
    if (typeof direct === "number") return String(direct);
  }
  for (const child of Object.values(record)) {
    const found = findString(child, keys);
    if (found) return found;
  }
  return undefined;
}

/**
 * Adapter Tebex Headless preparado para produccion, sin credenciales hardcodeadas.
 *
 * Flujo esperado:
 * 1. Crear basket en Headless API con usuario Minecraft, IP, URLs y `custom.orderPublicId`.
 * 2. Anadir exactamente un paquete Tebex whitelisteado desde `metadata.tebexPackageId`.
 * 3. Redirigir al checkout hospedado por Tebex.
 * 4. Aceptar solo webhooks Tebex con `X-Signature` valida.
 */
export class TebexPaymentProvider implements PaymentProvider {
  readonly id = "tebex" as const;

  constructor(
    private readonly publicToken: string,
    private readonly webhookSecret: string,
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    if (!req.providerPackageId) {
      throw new Error("Producto sin metadata.tebexPackageId: no se puede crear checkout Tebex.");
    }

    const basketRes = await fetch(`${TEBEX_API_BASE}/accounts/${encodeURIComponent(this.publicToken)}/baskets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        username: req.playerName,
        ip_address: req.customerIp ?? "127.0.0.1",
        complete_url: req.successUrl,
        cancel_url: req.cancelUrl,
        complete_auto_redirect: true,
        custom: {
          orderPublicId: req.orderPublicId,
          playerName: req.playerName,
          playerUuid: req.playerUuid,
        },
      }),
    });
    if (!basketRes.ok) {
      throw new Error(`Tebex create basket respondio ${basketRes.status}`);
    }
    const basket = (await basketRes.json()) as Record<string, unknown>;
    const basketIdent = findString(basket, ["ident", "basket_ident", "basketIdent"]);
    if (!basketIdent) throw new Error("Tebex create basket no devolvio ident.");

    const packageRes = await fetch(`${TEBEX_API_BASE}/baskets/${encodeURIComponent(basketIdent)}/packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        package_id: Number(req.providerPackageId),
        quantity: 1,
      }),
    });
    if (!packageRes.ok) {
      throw new Error(`Tebex add package respondio ${packageRes.status}`);
    }
    const updatedBasket = (await packageRes.json()) as Record<string, unknown>;
    const checkoutUrl =
      findString(updatedBasket, ["checkout_url", "checkoutUrl"]) ??
      findString(updatedBasket, ["checkout"]) ??
      findString(updatedBasket, ["url"]) ??
      `https://checkout.tebex.io/checkout/${encodeURIComponent(basketIdent)}`;

    return { checkoutUrl, providerPaymentId: basketIdent };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null> {
    const signature = headers.get("X-Signature");
    if (!signature) return null;
    const bodyHash = await sha256Hex(rawBody);
    const expected = await hmacHex(this.webhookSecret, bodyHash);
    if (!timingSafeEqual(signature, expected)) return null;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }

    const type = findString(payload, ["type", "event_type", "event"])?.toLowerCase() ?? "";
    const eventId = findString(payload, ["id", "event_id", "transaction_id"]) ?? crypto.randomUUID();
    const orderPublicId = findString(payload, ["orderPublicId", "order_public_id"]);
    const providerPaymentId =
      findString(payload, ["basket_ident", "basketIdent", "ident"]) ??
      findString(payload, ["transaction_id", "payment_id"]) ??
      "unknown";
    const statusText = findString(payload, ["status", "payment_status"])?.toLowerCase() ?? "";
    const isPaid =
      type === "payment.completed" ||
      type === "payment.complete" ||
      type === "payment.paid" ||
      statusText === "complete" ||
      statusText === "completed" ||
      statusText === "paid";
    const isFailed =
      type === "payment.declined" ||
      type === "payment.refunded" ||
      type === "payment.chargeback" ||
      statusText === "declined" ||
      statusText === "failed" ||
      statusText === "refunded" ||
      statusText === "chargeback";

    return {
      eventId,
      providerPaymentId,
      orderPublicId,
      status: isPaid ? "paid" : isFailed ? "failed" : "ignored",
    };
  }
}
