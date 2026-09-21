import type { Env } from "../types";
import type { PaymentProvider } from "./payment/PaymentProvider";
import { isWebhookAlreadyProcessed, recordWebhookProcessed, getOrderByPublicId, type OrderRow } from "./orders";
import { getProviderPackageId } from "./catalog";

export type ProcessWebhookResult =
  | { ok: true; result: "paid" | "already_processed" | "ignored" | "failed" }
  | { ok: true; result: "validation"; validationId: string }
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

  if (event.status === "validation") {
    return { ok: true, result: "validation", validationId: event.eventId };
  }

  const alreadyProcessed = await isWebhookAlreadyProcessed(env, provider.id, event.eventId);
  if (alreadyProcessed) return { ok: true, result: "already_processed" };
  if (event.status === "ignored" || (event.status === "failed" && !event.reversal)) {
    await recordWebhookProcessed(env, provider.id, event.eventId);
    return { ok: true, result: event.status === "ignored" ? "ignored" : "failed" };
  }
  if (event.reversal) {
    const now = Date.now();
    // Persist reversals even if they arrive before payment.completed (out-of-order webhooks).
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO payment_reversals (provider, transaction_id, event_id, event_type, received_at) VALUES (?, ?, ?, ?, ?)")
        .bind(provider.id, event.providerPaymentId, event.eventId, event.eventType ?? "payment.reversed", now),
      env.DB.prepare(`UPDATE orders SET status = 'REFUNDED',
        review_required = CASE WHEN status IN ('CLAIMED','DELIVERED') OR review_required = 1 THEN 1 ELSE 0 END,
        review_reason = ? WHERE payment_provider = ? AND provider_payment_id = ?
        AND NOT EXISTS (SELECT 1 FROM processed_webhooks WHERE provider = ? AND event_id = ?)`)
        .bind(event.eventType ?? "payment.reversed", provider.id, event.providerPaymentId, provider.id, event.eventId),
      env.DB.prepare(`INSERT INTO order_events (order_id, event_type, created_at, metadata)
        SELECT id, 'PAYMENT_REVERSED', ?, ? FROM orders WHERE payment_provider = ? AND provider_payment_id = ? AND changes() > 0`)
        .bind(now, JSON.stringify({ eventId: event.eventId, transactionId: event.providerPaymentId, eventType: event.eventType ?? "payment.reversed" }), provider.id, event.providerPaymentId),
      env.DB.prepare("INSERT OR IGNORE INTO processed_webhooks (provider, event_id, received_at) VALUES (?, ?, ?)").bind(provider.id, event.eventId, now),
    ]);
    return { ok: true, result: "failed" };
  }
  const order = event.orderPublicId ? await getOrderByPublicId(env, event.orderPublicId)
    : await env.DB.prepare("SELECT * FROM orders WHERE provider_payment_id = ?").bind(event.providerPaymentId).first<OrderRow>();
  // Unknown orders must be retried, not permanently acknowledged as processed.
  if (!order || order.payment_provider !== provider.id) throw new Error("Webhook: pedido/proveedor no encontrado.");
  if (provider.id === "tebex" && event.status === "paid") {
    const p = event.purchase;
    const compact = (value: string) => value.replace(/-/g, "").toLowerCase();
    if (!p || getProviderPackageId(order.product_id) !== p.packageId || p.currency !== order.currency ||
        p.basePriceCents !== order.price_cents || p.playerName.toLowerCase() !== order.player_name.toLowerCase() ||
        compact(p.playerUuid) !== compact(order.player_uuid) ||
        (/^[a-f0-9]{32}$/i.test(compact(p.recipientId)) && compact(p.recipientId) !== compact(order.player_uuid))) {
      throw new Error("Webhook: producto, importe o destinatario no coincide con el pedido.");
    }
  }
  // D1 batch is transactional: a crash/error cannot consume the event without recording PAID.
  // The provider-payment UNIQUE index prevents one transaction from paying multiple orders.
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status = CASE WHEN EXISTS (SELECT 1 FROM payment_reversals WHERE provider = ? AND transaction_id = ?) THEN 'REFUNDED' ELSE 'PAID' END,
      paid_at = ?, provider_payment_id = ?
      WHERE public_id = ? AND review_required = 0 AND status IN ('CREATED','PENDING_PAYMENT','FAILED')
      AND NOT EXISTS (SELECT 1 FROM processed_webhooks WHERE provider = ? AND event_id = ?)`)
      .bind(provider.id, event.providerPaymentId, Date.now(), event.providerPaymentId, order.public_id, provider.id, event.eventId),
    env.DB.prepare(`INSERT INTO order_events (order_id, event_type, created_at, metadata)
      SELECT id, CASE WHEN status = 'REFUNDED' THEN 'PAYMENT_BLOCKED_REVERSAL' ELSE 'PAID' END, ?, ? FROM orders WHERE public_id = ? AND changes() > 0`)
      .bind(Date.now(), JSON.stringify({ providerPaymentId: event.providerPaymentId, eventId: event.eventId,
        packageId: event.purchase?.packageId ?? null, eventType: event.eventType ?? "payment.completed" }), order.public_id),
    env.DB.prepare("INSERT OR IGNORE INTO processed_webhooks (provider, event_id, received_at) VALUES (?, ?, ?)")
      .bind(provider.id, event.eventId, Date.now()),
  ]);
  return { ok: true, result: result[0].meta.changes ? "paid" : "already_processed" };
}
