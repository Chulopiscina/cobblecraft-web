import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, timingSafeEqual, ErrorCode } from "../lib/security";
import { listDeliverable, claimOrder, ackDelivered, ackFailed } from "../lib/orders";
import { recordServiceHealth } from "../lib/operations";

/**
 * Parte F - autenticación Worker <-> Minecraft. NUNCA se acepta ninguna petición de este
 * archivo sin un `Authorization: Bearer <STORE_SERVER_TOKEN>` válido - comparación en tiempo
 * constante (`timingSafeEqual`, lib/security.ts) para evitar timing attacks triviales.
 */
export function requireServerAuth(request: Request, env: Env): Response | null {
  const header = request.headers.get("Authorization") ?? "";
  const expected = env.STORE_SERVER_TOKEN;
  if (!expected) return errorResponse(env, request, 500, "STORE_SERVER_TOKEN no configurado en el Worker.");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !timingSafeEqual(token, expected)) {
    return errorResponse(env, request, 401, "Token de servidor inválido.");
  }
  return null;
}

/**
 * GET /api/delivery/pending - lista de pedidos entregables (PAID sin reclamar, o CLAIMED cuyo
 * timeout expiró). Deliberadamente NO incluye ninguna instrucción de entrega ("DeliveryAction")
 * - solo `productId`, que `progression_core` traduce usando SU PROPIA copia del catálogo
 * (whitelist real del lado Minecraft, ver web/docs/MINECRAFT_DELIVERY.md) - la web nunca decide
 * qué comando ejecutar.
 */
export async function handleListPending(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env);
  if (authError) return authError;

  const orders = await listDeliverable(env);
  await recordServiceHealth(env, "delivery", null);
  return jsonResponse(
    env,
    request,
    orders.map((o) => ({
      orderId: o.public_id,
      productId: o.product_id,
      playerUuid: o.player_uuid,
      playerName: o.player_name,
      priceCents: o.price_cents,
      currency: o.currency,
    })),
  );
}

const ClaimBody = z.object({ orderId: z.string().min(1) });

/**
 * POST /api/delivery/claim - claim atómico CON LEASE (Fase B), ver `lib/orders.ts` `claimOrder`.
 * Devuelve `claimToken` - progression_core DEBE guardarlo y reenviarlo en `/api/delivery/ack`
 * para esa entrega concreta (ver web/docs/DELIVERY_FAILURE_RECOVERY.md).
 */
export async function handleClaim(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env);
  if (authError) return authError;

  let body: z.infer<typeof ClaimBody>;
  try {
    body = ClaimBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  const outcome = await claimOrder(env, body.orderId);
  if (outcome.status === "NOT_FOUND") return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  if (outcome.status === "ALREADY_CLAIMED") {
    return jsonResponse(env, request, { claimed: false, reason: "already_claimed", code: ErrorCode.ALREADY_CLAIMED }, 409);
  }
  return jsonResponse(env, request, { claimed: true, claimToken: outcome.claimToken });
}

const AckBody = z.object({
  orderId: z.string().min(1),
  result: z.enum(["delivered", "failed"]),
  claimToken: z.string().min(1),
});

/**
 * POST /api/delivery/ack - confirma entrega real (idempotente) o libera el claim en caso de
 * fallo real (ej. LuckPerms no disponible en ese instante) para que otro intento pueda
 * reclamarlo sin esperar el timeout completo. `claimToken` (Fase B) debe ser el MISMO devuelto
 * por el `claim` que originó esta entrega - un token que no coincide (`STALE_CLAIM`) indica que
 * el claim ya fue superado por otra generación; se responde 409 en vez de confirmar en silencio.
 */
export async function handleAck(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env);
  if (authError) return authError;

  let body: z.infer<typeof AckBody>;
  try {
    body = AckBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  if (body.result === "failed") {
    const outcome = await ackFailed(env, body.orderId, body.claimToken);
    if (outcome === "NOT_FOUND") return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);
    if (outcome === "STALE_CLAIM") return errorResponse(env, request, 409, "Claim no vigente; fallo no registrado.", ErrorCode.STALE_CLAIM);
    return jsonResponse(env, request, { acked: true, willRetry: true });
  }

  const result = await ackDelivered(env, body.orderId, body.claimToken);
  if (result === "NOT_FOUND") return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  if (result === "STALE_CLAIM") {
    return errorResponse(env, request, 409, "El claim de este pedido ya fue superado por otra generación - entrega no confirmada contra el estado actual.", ErrorCode.STALE_CLAIM);
  }
  return jsonResponse(env, request, { acked: true, alreadyDelivered: result === "ALREADY_DELIVERED" });
}
