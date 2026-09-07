import type { CheckoutRequest, CheckoutSession, PaymentProvider, WebhookEvent } from "./PaymentProvider";
import { timingSafeEqual } from "../security";

/** Tolerancia recomendada por Stripe para la cabecera `Stripe-Signature` - un webhook firmado hace mucho más tiempo que esto se rechaza, incluso con una firma criptográficamente válida. */
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * StripePaymentProvider (Parte D) - adapter PREPARADO, nunca activado sin credenciales reales
 * (ver `payment/factory.ts` - el factory rechaza construirlo si falta `STRIPE_SECRET_KEY`).
 * Usa Checkout Sessions hospedado por Stripe vía `fetch` directo a su API REST (sin SDK - evita
 * añadir una dependencia pesada solo para 2 llamadas HTTP, "no 40 dependencias"). NUNCA
 * almacenamos tarjeta/CVV/datos bancarios - el formulario de pago vive enteramente en el dominio
 * de Stripe.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": req.currency.toLowerCase(),
      "line_items[0][price_data][product_data][name]": req.productName,
      "line_items[0][price_data][unit_amount]": String(req.priceCents),
      "line_items[0][quantity]": "1",
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      client_reference_id: req.orderPublicId,
      "metadata[order_public_id]": req.orderPublicId,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Stripe Checkout Sessions respondió ${res.status}`);
    }
    const session = (await res.json()) as { id: string; url: string };
    return { checkoutUrl: session.url, providerPaymentId: session.id };
  }

  /**
   * Verificación REAL de firma Stripe (esquema documentado públicamente: cabecera
   * `Stripe-Signature: t=<timestamp>,v1=<hmac>`, HMAC-SHA256 de `"<timestamp>.<rawBody>"` con el
   * webhook secret). Implementada sin el SDK de Stripe (que no corre tal cual en el runtime de
   * Workers sin adaptación) - criptografía nativa `crypto.subtle`, testeable sin red real.
   */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null> {
    const sigHeader = headers.get("Stripe-Signature");
    if (!sigHeader) return null;
    const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=") as [string, string]));
    const timestamp = parts.t;
    const v1 = parts.v1;
    if (!timestamp || !v1) return null;

    // Tolerancia de timestamp (Production Hardening V1, Fase A) - defensa adicional recomendada
    // por el propio esquema de Stripe. `processed_webhooks` (idempotencia real) ya bloquea el
    // replay EXACTO del mismo evento incluso sin esto; esta comprobación cierra además el caso de
    // un payload+firma capturados hace mucho tiempo reenviados como petición HTTP nueva.
    const timestampNum = Number(timestamp);
    if (!Number.isFinite(timestampNum)) return null;
    const ageSeconds = Math.abs(Date.now() / 1000 - timestampNum);
    if (ageSeconds > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return null;

    const expected = await hmacHex(this.webhookSecret, `${timestamp}.${rawBody}`);
    // Comparación en tiempo constante - ver MockPaymentProvider.verifyWebhook para el mismo motivo.
    if (!timingSafeEqual(expected, v1)) return null;

    let event: {
      id: string;
      type: string;
      data: { object: { client_reference_id?: string; id?: string; payment_status?: string } };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      // Firma válida pero cuerpo corrupto/truncado no debería ocurrir en la práctica (la propia
      // firma ya cubre la integridad del body) - de todas formas nunca debe lanzar sin controlar.
      return null;
    }

    if (event.type !== "checkout.session.completed") {
      return { eventId: event.id, providerPaymentId: event.data.object.id ?? "unknown", status: "ignored" };
    }
    const paid = event.data.object.payment_status === "paid";
    return {
      eventId: event.id,
      providerPaymentId: event.data.object.id ?? "unknown",
      status: paid ? "paid" : "failed",
      orderPublicId: event.data.object.client_reference_id,
    };
  }
}
