/**
 * Web Oficial V1 - abstracción real de pago (Parte D del encargo). Ningún endpoint de la Tienda
 * llama directamente a un SDK de proveedor - siempre a través de esta interfaz, para poder
 * cambiar de proveedor sin tocar la lógica de pedidos.
 */
export interface CheckoutRequest {
  orderPublicId: string;
  productName: string;
  priceCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  playerName: string;
  playerUuid: string;
  customerIp?: string;
  providerPackageId?: string;
}

export interface CheckoutSession {
  checkoutUrl: string;
  providerPaymentId: string;
}

export interface ResumeCheckoutRequest extends CheckoutRequest {
  providerPaymentId: string;
}

export type WebhookEventStatus = "paid" | "failed" | "ignored" | "validation";

export interface WebhookEvent {
  /** Identificador ÚNICO del evento en el proveedor - usado para idempotencia real (processed_webhooks). */
  eventId: string;
  providerPaymentId: string;
  status: WebhookEventStatus;
  orderPublicId?: string;
  purchase?: { packageId: string; playerName: string; playerUuid: string; recipientId: string; basePriceCents: number; currency: string };
  reversal?: boolean;
}

export interface PaymentProvider {
  readonly id: "mock" | "stripe" | "tebex";
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  resumeCheckout?(req: ResumeCheckoutRequest): Promise<CheckoutSession>;
  /**
   * Verifica la AUTENTICIDAD real del webhook (firma) antes de confiar en su contenido - nunca
   * "el navegador dice que pagó". Devuelve `null` si la firma no es válida (el llamador debe
   * responder 400 sin tocar ningún pedido).
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null>;
}
