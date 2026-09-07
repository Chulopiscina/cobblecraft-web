import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, rateLimit, clientKey, ErrorCode } from "../lib/security";
import { getOrderByPublicId } from "../lib/orders";
import { MockPaymentProvider } from "../lib/payment/MockPaymentProvider";
import { processProviderWebhook } from "../lib/webhook-processing";
import { createPaymentProvider } from "../lib/payment/factory";

const SimulateBody = z.object({
  orderPublicId: z.string().min(1),
  outcome: z.enum(["paid", "failed"]).default("paid"),
});

/**
 * POST /api/payments/mock/simulate - SOLO development (Parte Q, E2E local sin dinero real). La
 * página `tienda/mock-checkout` llama a este endpoint cuando el jugador pulsa "Simular pago
 * exitoso". Construye un webhook FIRMADO real (mismo HMAC que verificaría un webhook entrante de
 * verdad) y lo procesa por el MISMO camino que `/api/webhook/mock` - nunca marca PAID
 * directamente, para que el flujo de prueba ejercite la verificación de firma real.
 */
export async function handleSimulateMockPayment(request: Request, env: Env, siteBaseUrl: string): Promise<Response> {
  if (env.ENVIRONMENT === "production") {
    return errorResponse(env, request, 403, "MockPaymentProvider deshabilitado en producción.");
  }
  if (!env.STORE_MOCK_SECRET) {
    return errorResponse(env, request, 500, "STORE_MOCK_SECRET no configurado.");
  }
  if (!rateLimit(`payments-mock:${clientKey(request)}`, 20, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes.");
  }

  let parsed: z.infer<typeof SimulateBody>;
  try {
    parsed = SimulateBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  const order = await getOrderByPublicId(env, parsed.orderPublicId);
  if (!order) return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);

  const rawBody = JSON.stringify({
    eventId: `evt_mock_${crypto.randomUUID()}`,
    orderPublicId: order.public_id,
    status: parsed.outcome,
  });
  const signature = await MockPaymentProvider.sign(env.STORE_MOCK_SECRET, rawBody);
  const headers = new Headers({ "X-Mock-Signature": signature });

  const provider = createPaymentProvider(env, siteBaseUrl);
  const result = await processProviderWebhook(env, provider, rawBody, headers);
  if (!result.ok) return errorResponse(env, request, 400, "Firma simulada inválida (bug interno).");
  return jsonResponse(env, request, { simulated: true, result: result.result });
}
