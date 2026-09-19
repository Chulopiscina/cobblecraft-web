import type { CheckoutRequest, CheckoutSession, PaymentProvider, ResumeCheckoutRequest, WebhookEvent } from "./PaymentProvider";
import { timingSafeEqual } from "../security";

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * MockPaymentProvider (Parte D) - SOLO para desarrollo/testing local. Sigue el MISMO contrato
 * real que un proveedor de verdad (checkout hospedado + webhook firmado) para que el flujo E2E
 * (Parte Q) ejercite exactamente el mismo código que se usará con Tebex - nunca un atajo que
 * marque un pedido PAID sin pasar por `verifyWebhook`.
 *
 * La "firma" es un HMAC-SHA256 real sobre `orderPublicId` con `STORE_MOCK_SECRET` (nunca
 * comparación de texto plano) - construida server-side en
 * `routes/payments-mock.ts` (`/api/payments/mock/simulate`, endpoint SOLO de desarrollo) y
 * verificada aquí exactamente igual que se verificaría una firma real.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock" as const;

  constructor(
    private readonly secret: string,
    private readonly siteBaseUrl: string,
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const providerPaymentId = `mock_${req.orderPublicId}`;
    const checkoutUrl = `${this.siteBaseUrl}/tienda/mock-checkout?order=${encodeURIComponent(req.orderPublicId)}`;
    return { checkoutUrl, providerPaymentId };
  }

  async resumeCheckout(req: ResumeCheckoutRequest): Promise<CheckoutSession> {
    const checkoutUrl = `${this.siteBaseUrl}/tienda/mock-checkout?order=${encodeURIComponent(req.orderPublicId)}`;
    return { checkoutUrl, providerPaymentId: req.providerPaymentId };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null> {
    const signature = headers.get("X-Mock-Signature");
    if (!signature) return null;
    const expected = await hmacHex(this.secret, rawBody);
    // Comparación en tiempo constante (Production Hardening V1, Fase A) - `!==` normal filtra en
    // cuanto encuentra el primer byte distinto, un canal de temporización teórico contra la firma.
    if (!timingSafeEqual(signature, expected)) return null;
    let payload: { eventId: string; orderPublicId: string; status: "paid" | "failed" };
    try {
      payload = JSON.parse(rawBody) as { eventId: string; orderPublicId: string; status: "paid" | "failed" };
    } catch {
      // JSON malformado tras una firma válida no debería poder ocurrir en el uso real (el propio
      // simulador construye el body), pero un body corrupto/truncado nunca debe tumbar el Worker
      // con una excepción no controlada - se trata igual que una firma inválida.
      return null;
    }
    return {
      eventId: payload.eventId,
      providerPaymentId: `mock_${payload.orderPublicId}`,
      status: payload.status,
      orderPublicId: payload.orderPublicId,
    };
  }

  static async sign(secret: string, rawBody: string): Promise<string> {
    return hmacHex(secret, rawBody);
  }
}
