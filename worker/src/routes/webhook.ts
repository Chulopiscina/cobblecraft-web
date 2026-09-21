import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/security";
import { createPaymentProvider } from "../lib/payment/factory";
import { processProviderWebhook } from "../lib/webhook-processing";
import { recordServiceHealth } from "../lib/operations";

/**
 * Webhook real del proveedor de pago (Parte D) - la ÚNICA vía por la que un pedido puede llegar a
 * PAID. "Payment Provider -> webhook firmado -> Worker verifica firma -> pedido PAID" - nunca al
 * revés, nunca porque el navegador diga que pagó.
 */
export async function handleWebhook(request: Request, env: Env, siteBaseUrl: string, providerKind: Env["PAYMENT_PROVIDER"] = env.PAYMENT_PROVIDER): Promise<Response> {
  const rawBody = await request.text();
  const provider = createPaymentProvider(env, siteBaseUrl, providerKind, "webhook");
  let result;
  try { result = await processProviderWebhook(env, provider, rawBody, request.headers); }
  catch {
    await recordServiceHealth(env, "tebex", "WEBHOOK_PROCESSING_FAILED");
    console.error("[ERROR] WEBHOOK_PROCESSING_FAILED: proveedor reintentara; revisar diagnostico.");
    return errorResponse(env, request, 500, "No se pudo procesar el webhook.");
  }
  if (!result.ok) {
    await recordServiceHealth(env, "tebex", "INVALID_WEBHOOK_SIGNATURE");
    return errorResponse(env, request, 400, "Firma de webhook inválida.");
  }
  await recordServiceHealth(env, "tebex", null, { lastWebhookAt: Date.now(), result: result.result });
  if (result.result === "validation") {
    return jsonResponse(env, request, { id: result.validationId });
  }
  return jsonResponse(env, request, { received: true, result: result.result });
}
