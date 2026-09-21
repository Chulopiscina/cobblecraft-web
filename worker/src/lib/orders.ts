import type { Env } from "../types";
import { generateOrderPublicId } from "./ids";

export type OrderStatus = "CREATED" | "PENDING_PAYMENT" | "PAID" | "CLAIMED" | "DELIVERED" | "FAILED" | "REFUNDED";

export interface OrderRow {
  id: number;
  public_id: string;
  player_uuid: string;
  player_name: string;
  product_id: string;
  price_cents: number;
  currency: string;
  payment_provider: string;
  provider_payment_id: string | null;
  status: OrderStatus;
  created_at: number;
  paid_at: number | null;
  claimed_at: number | null;
  delivered_at: number | null;
  failed_at: number | null;
  claim_token: string | null;
  delivery_attempts: number;
  review_required: number;
  review_reason: string | null;
}

async function logEvent(db: D1Database, orderId: number, eventType: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await db
    .prepare("INSERT INTO order_events (order_id, event_type, created_at, metadata) VALUES (?, ?, ?, ?)")
    .bind(orderId, eventType, Date.now(), JSON.stringify(metadata))
    .run();
}

export async function createOrder(
  env: Env,
  params: { playerUuid: string; playerName: string; productId: string; priceCents: number; currency: string; paymentProvider: string },
): Promise<OrderRow> {
  const publicId = generateOrderPublicId();
  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO orders (public_id, player_uuid, player_name, product_id, price_cents, currency, payment_provider, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', ?) RETURNING *`,
  )
    .bind(publicId, params.playerUuid, params.playerName, params.productId, params.priceCents, params.currency, params.paymentProvider, now)
    .first<OrderRow>();
  if (!result) throw new Error("No se pudo crear el pedido");
  await logEvent(env.DB, result.id, "CREATED", { productId: params.productId });
  return result;
}

export async function getOrderByPublicId(env: Env, publicId: string): Promise<OrderRow | null> {
  return env.DB.prepare("SELECT * FROM orders WHERE public_id = ?").bind(publicId).first<OrderRow>();
}

export async function markPendingPayment(env: Env, publicId: string, providerPaymentId: string): Promise<void> {
  const order = await getOrderByPublicId(env, publicId);
  if (!order) throw new Error("Pedido no encontrado");
  await env.DB.prepare("UPDATE orders SET status = 'PENDING_PAYMENT', provider_payment_id = ? WHERE public_id = ? AND status = 'CREATED'")
    .bind(providerPaymentId, publicId)
    .run();
  await logEvent(env.DB, order.id, "CHECKOUT_STARTED", { providerPaymentId });
}

export type MarkPaidResult = "PAID" | "ALREADY_PAID" | "ORDER_NOT_FOUND" | "PAYMENT_ALREADY_USED";

/**
 * Idempotencia real (Parte D/Q): un `providerPaymentId` SOLO puede marcar UN pedido como PAID -
 * el índice único `idx_orders_provider_payment` es la garantía real a nivel de base de datos
 * (nunca solo lógica de aplicación), un segundo intento con el mismo pago falla la UPDATE y se
 * detecta aquí sin lanzar una excepción no controlada.
 */
export async function markPaid(env: Env, providerPaymentId: string, expectedPublicId?: string): Promise<MarkPaidResult> {
  const order = expectedPublicId
    ? await getOrderByPublicId(env, expectedPublicId)
    : await env.DB.prepare("SELECT * FROM orders WHERE provider_payment_id = ?").bind(providerPaymentId).first<OrderRow>();
  if (!order) return "ORDER_NOT_FOUND";
  if (order.status === "PAID" || order.status === "CLAIMED" || order.status === "DELIVERED") return "ALREADY_PAID";

  const now = Date.now();
  const res = await env.DB.prepare(
    "UPDATE orders SET status = 'PAID', paid_at = ?, provider_payment_id = ? WHERE public_id = ? AND status IN ('CREATED','PENDING_PAYMENT')",
  )
    .bind(now, providerPaymentId, order.public_id)
    .run();
  if ((res.meta.changes ?? 0) === 0) return "ALREADY_PAID";
  await logEvent(env.DB, order.id, "PAID", { providerPaymentId });
  return "PAID";
}

export async function markFailed(env: Env, publicId: string, reason: string): Promise<void> {
  const order = await getOrderByPublicId(env, publicId);
  if (!order) return;
  await env.DB.prepare("UPDATE orders SET status = 'FAILED', failed_at = ? WHERE public_id = ? AND status IN ('CREATED','PENDING_PAYMENT')")
    .bind(Date.now(), publicId)
    .run();
  await logEvent(env.DB, order.id, "FAILED", { reason });
}

/** Webhook replay real: un `eventId` de proveedor ya visto nunca se reprocesa. */
export async function isWebhookAlreadyProcessed(env: Env, provider: string, eventId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 FROM processed_webhooks WHERE provider = ? AND event_id = ?").bind(provider, eventId).first();
  return row !== null;
}

export async function recordWebhookProcessed(env: Env, provider: string, eventId: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO processed_webhooks (provider, event_id, received_at) VALUES (?, ?, ?)")
    .bind(provider, eventId, Date.now())
    .run();
}

function claimTimeoutMs(env: Env): number {
  return Number(env.CLAIM_TIMEOUT_SECONDS ?? "120") * 1000;
}

/**
 * Pedidos entregables ahora mismo: PAID sin reclamar, o CLAIMED cuyo timeout ya expiró (auto-
 * recuperación sin necesitar un cron aparte, ver `web/docs/MINECRAFT_DELIVERY.md` "Fallo de
 * entrega").
 */
export async function listDeliverable(env: Env, limit = 20): Promise<OrderRow[]> {
  const cutoff = Date.now() - claimTimeoutMs(env);
  const res = await env.DB.prepare(
    `SELECT * FROM orders WHERE review_required = 0 AND (status = 'PAID' OR (status = 'CLAIMED' AND claimed_at < ?)) ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(cutoff, limit)
    .all<OrderRow>();
  return res.results ?? [];
}

export type ClaimOutcome =
  | { status: "CLAIMED"; claimToken: string }
  | { status: "ALREADY_CLAIMED" }
  | { status: "NOT_FOUND" };

/**
 * Claim atómico CON LEASE (Production Hardening V1, Fase B) - UNA sola UPDATE condicional
 * (D1/SQLite garantiza que solo un llamador concurrente puede ganarla) que además genera un
 * `claim_token` nuevo por cada "generación" del claim. `ackDelivered` exige ese mismo token -
 * un ACK que corresponde a una generación YA SUPERADA (el claim expiró y fue reclamado de nuevo)
 * se detecta y rechaza explícitamente en vez de confirmarse contra el estado equivocado en
 * silencio. Ver web/docs/DELIVERY_FAILURE_RECOVERY.md para el protocolo completo - esto es
 * defensa en profundidad: la protección real contra reentrega duplicada la da `processed_ops`
 * en progression_core, este token solo AÑADE detección explícita de la anomalía.
 */
export async function claimOrder(env: Env, publicId: string): Promise<ClaimOutcome> {
  const order = await getOrderByPublicId(env, publicId);
  if (!order) return { status: "NOT_FOUND" };
  const cutoff = Date.now() - claimTimeoutMs(env);
  const claimToken = crypto.randomUUID();
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status = 'CLAIMED', claimed_at = ?, claim_token = ?, delivery_attempts = delivery_attempts + 1
      WHERE public_id = ? AND review_required = 0 AND (status = 'PAID' OR (status = 'CLAIMED' AND claimed_at < ?))`)
      .bind(Date.now(), claimToken, publicId, cutoff),
    env.DB.prepare(`INSERT INTO order_events (order_id, event_type, created_at, metadata)
      SELECT id, 'CLAIMED', ?, json_object('attempt', delivery_attempts) FROM orders WHERE public_id = ? AND changes() > 0`)
      .bind(Date.now(), publicId),
  ]);
  if ((res[0].meta.changes ?? 0) === 0) return { status: "ALREADY_CLAIMED" };
  return { status: "CLAIMED", claimToken };
}

export type AckResult = "DELIVERED" | "ALREADY_DELIVERED" | "NOT_FOUND" | "STALE_CLAIM";

/**
 * ACK idempotente CON LEASE (Parte F/Q + Fase B) - un segundo ACK del mismo pedido con el MISMO
 * `claimToken` nunca es un error, solo confirma el estado ya alcanzado (`"ALREADY_DELIVERED"`).
 * `"STALE_CLAIM"` es un caso DISTINTO y más grave: el token no coincide con el claim vigente -
 * significa que esta entrega corresponde a una generación de claim ya superada (p. ej. el
 * servidor Minecraft tardó más que el timeout y el pedido fue reclamado de nuevo mientras tanto).
 * `progression_core` debe tratarlo como una señal de alerta real (logueada en rojo) - la entrega
 * en Minecraft ya pudo haber ocurrido físicamente y no puede deshacerse desde aquí; este código
 * existe para que la anomalía se DETECTE y quede en logs, nunca para que pase desapercibida.
 */
export async function ackDelivered(env: Env, publicId: string, claimToken: string): Promise<AckResult> {
  const order = await getOrderByPublicId(env, publicId);
  if (!order) return "NOT_FOUND";
  if (order.claim_token !== claimToken) return "STALE_CLAIM";
  if (order.status === "DELIVERED" && !order.review_required) return "ALREADY_DELIVERED";
  if (order.status !== "CLAIMED" || order.review_required) return "STALE_CLAIM";
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'DELIVERED', delivered_at = ? WHERE public_id = ? AND status = 'CLAIMED' AND claim_token = ? AND review_required = 0")
      .bind(Date.now(), publicId, claimToken),
    env.DB.prepare(`INSERT INTO order_events (order_id, event_type, created_at, metadata)
      SELECT id, 'DELIVERED', ?, json_object('attempt', delivery_attempts) FROM orders WHERE public_id = ? AND changes() > 0`)
      .bind(Date.now(), publicId),
  ]);
  if ((res[0].meta.changes ?? 0) === 0) {
    const current = await getOrderByPublicId(env, publicId);
    return current?.status === "DELIVERED" && current.claim_token === claimToken && !current.review_required ? "ALREADY_DELIVERED" : "STALE_CLAIM";
  }
  return "DELIVERED";
}

export async function ackFailed(env: Env, publicId: string, token: string): Promise<"RETRY" | "NOT_FOUND" | "STALE_CLAIM"> {
  const order = await getOrderByPublicId(env, publicId);
  if (!order) return "NOT_FOUND";
  if (order.status !== "CLAIMED" || order.claim_token !== token || order.review_required) return "STALE_CLAIM";
  // Keep the lease until expiry. A repeated failure ACK cannot accelerate retries or spam audit.
  const result = await env.DB.prepare(`INSERT INTO order_events (order_id, event_type, created_at, metadata)
    SELECT id, 'DELIVERY_FAILED_RETRY', ?, json_object('attempt', delivery_attempts, 'reason', 'server_reported_failure') FROM orders o
    WHERE public_id = ? AND status = 'CLAIMED' AND claim_token = ? AND review_required = 0
    AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'DELIVERY_FAILED_RETRY'
      AND json_extract(e.metadata, '$.attempt') = o.delivery_attempts)`)
    .bind(Date.now(), publicId, token).run();
  if (!result.meta.changes) {
    const current = await getOrderByPublicId(env, publicId);
    if (current?.status !== "CLAIMED" || current.claim_token !== token || current.review_required) return "STALE_CLAIM";
  }
  return "RETRY";
}
