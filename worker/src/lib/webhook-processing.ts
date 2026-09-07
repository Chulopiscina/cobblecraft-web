import type { Env } from "../types";
import type { PaymentProvider } from "./payment/PaymentProvider";
import { isWebhookAlreadyProcessed, recordWebhookProcessed, markPaid, type MarkPaidResult } from "./orders";

export type ProcessWebhookResult =
  | { ok: true; result: "paid" | "already_processed" | "ignored" | "failed" }
  | { ok: false; reason: "invalid_signature" };

/**
 * Punto ÚNICO de procesamiento de webhook (Parte D) - usado tanto por la ruta HTTP real
 * (`/api/webhook/mock`, `/api/webhook/stripe`, `/api/webhook/tebex`) como por el simulador de desarrollo
 * (`/api/payments/mock/simulate`), para que AMBOS caminos pasen por la MISMA verificación de
 * firma y la MISMA idempotencia real (nunca un atajo que salte `verifyWebhook`).
 */
export async function processProviderWebhook(env: Env, provider: PaymentProvider, rawBody: string, headers: Headers): Promise<ProcessWebhookResult> {
  const event = await provider.verifyWebhook(rawBody, headers);
  if (!event) return { ok: false, reason: "invalid_signature" };

  const alreadyProcessed = await isWebhookAlreadyProcessed(env, provider.id, event.eventId);
  if (alreadyProcessed) return { ok: true, result: "already_processed" };
  await recordWebhookProcessed(env, provider.id, event.eventId);

  if (event.status === "ignored") return { ok: true, result: "ignored" };

  if (event.status === "failed") {
    return { ok: true, result: "failed" };
  }

  const result: MarkPaidResult = await markPaid(env, event.providerPaymentId, event.orderPublicId);
  if (result === "PAID") return { ok: true, result: "paid" };
  return { ok: true, result: "already_processed" };
}
