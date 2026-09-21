import type { Env } from "../types";
import { requireOperationsAuth, type ServiceHealthRow } from "../lib/operations";
import { errorResponse, jsonResponse } from "../lib/security";
import { checkoutAvailable } from "../lib/store-readiness";
import { getOrderByPublicId } from "../lib/orders";
import { getProviderPackageId } from "../lib/catalog";

export async function handleOperations(request: Request, env: Env): Promise<Response> {
  const denied = requireOperationsAuth(request, env); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("order");
  if (id) {
    if (!/^ord_[A-Z2-9]{20}$/.test(id)) return errorResponse(env, request, 400, "Pedido inválido.");
    const order = await getOrderByPublicId(env, id);
    if (!order) return errorResponse(env, request, 404, "Pedido no encontrado.");
    const events = await env.DB.prepare("SELECT event_type, created_at, metadata FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT 100").bind(order.id).all();
    const { claim_token: _lease, id: _internalId, ...safe } = order;
    return jsonResponse(env, request, { order: safe, packageId: getProviderPackageId(order.product_id), events: events.results });
  }
  const checks = await env.DB.prepare("SELECT * FROM service_health").all<ServiceHealthRow>();
  const components = Object.fromEntries(checks.results.map(row => [row.component, { ...row, details: JSON.parse(row.details) }]));
  const counts = await env.DB.prepare("SELECT status, COUNT(*) AS count FROM orders GROUP BY status").all();
  const reviews = await env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE review_required = 1").first();
  const pending = await env.DB.prepare(`SELECT public_id, status, product_id, created_at, paid_at, delivered_at,
    delivery_attempts, review_required, review_reason FROM orders
    WHERE status IN ('PAID','CLAIMED','FAILED') OR review_required = 1 ORDER BY created_at LIMIT 50`).all();
  const reversals = await env.DB.prepare("SELECT event_type, COUNT(*) AS count FROM payment_reversals GROUP BY event_type").all();
  const heartbeat = await env.DB.prepare("SELECT state, players_online, max_players, updated_at FROM server_status_heartbeat WHERE id = 1").first();
  const lastWebhook = await env.DB.prepare("SELECT MAX(received_at) AS receivedAt FROM processed_webhooks WHERE provider = 'tebex'").first();
  const bot = components.bot;
  const fresh = !!bot && Date.now() - bot.checked_at <= 90_000;
  return jsonResponse(env, request, {
    checkedAt: Date.now(), worker: { version: env.WORKER_VERSION?.id ?? "development", environment: env.ENVIRONMENT },
    d1: { reachable: true, counts: counts.results, reviewRequired: reviews, pending: pending.results, reversals: reversals.results },
    minecraft: { ...heartbeat, heartbeatFresh: fresh, version: fresh ? bot.details.version ?? null : null, latencyMs: fresh ? bot.details.latencyMs ?? null : null },
    discord: { ...(bot?.details.diagnostics?.discord ?? {}), heartbeatFresh: fresh, online: fresh && bot.details.diagnostics?.discord?.online === true },
    pebble: { ...(bot?.details.diagnostics?.pebble ?? {}), heartbeatFresh: fresh, bridge: bot?.details.diagnostics?.bridge ?? "unknown" },
    tebex: { credentialsConfigured: Boolean(env.TEBEX_PRIVATE_KEY && env.TEBEX_PUBLIC_TOKEN && env.TEBEX_WEBHOOK_SECRET),
      checkoutEnabled: checkoutAvailable(env), lastWebhook, health: components.tebex ?? null },
    delivery: components.delivery ?? null,
  });
}
