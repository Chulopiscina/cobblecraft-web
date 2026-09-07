import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, rateLimit, clientKey, ErrorCode } from "../lib/security";
import { getAuthoritativeProduct } from "../lib/catalog";
import { resolveMojangProfile } from "../lib/mojang";
import { createOrder, markPendingPayment, markFailed, getOrderByPublicId } from "../lib/orders";
import { createPaymentProvider } from "../lib/payment/factory";

const CreateOrderBody = z.object({
  productId: z.string().min(1).max(64),
  playerName: z.string().regex(/^[A-Za-z0-9_]{3,16}$/, "Nombre de jugador Minecraft inválido"),
});

/**
 * POST /api/orders - crea un pedido Y su sesión de pago en una sola llamada. Parte J/D: el precio
 * SIEMPRE se lee del catálogo autoritativo server-side (`getAuthoritativeProduct`) - el body de
 * la petición nunca contiene un precio, solo `productId` (whitelist real).
 */
export async function handleCreateOrder(request: Request, env: Env, siteBaseUrl: string): Promise<Response> {
  if (!rateLimit(`create-order:${clientKey(request)}`, 8, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes, inténtalo de nuevo en un minuto.");
  }

  let parsed: z.infer<typeof CreateOrderBody>;
  try {
    parsed = CreateOrderBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  const product = getAuthoritativeProduct(env, parsed.productId);
  if (!product) {
    return errorResponse(env, request, 404, "Producto no encontrado o no disponible.", ErrorCode.PRODUCT_NOT_FOUND);
  }

  let profile;
  try {
    profile = await resolveMojangProfile(parsed.playerName);
  } catch {
    return errorResponse(env, request, 502, "No se pudo verificar el nombre de jugador ahora mismo. Inténtalo de nuevo en unos segundos.", ErrorCode.UPSTREAM_UNAVAILABLE);
  }
  if (!profile) {
    return errorResponse(env, request, 404, "No existe ninguna cuenta Minecraft Java con ese nombre.", ErrorCode.PLAYER_NOT_FOUND);
  }

  const order = await createOrder(env, {
    playerUuid: profile.uuid,
    playerName: profile.name,
    productId: product.productId,
    priceCents: product.priceCents,
    currency: product.currency,
    paymentProvider: env.PAYMENT_PROVIDER,
  });

  // El pedido ya existe en CREATED en este punto - si algo falla a partir de aquí (proveedor de
  // pago caído, escritura de D1 fallida) nunca debe quedar huérfano en CREATED para siempre
  // (Production Hardening V1, Fase A/B: "pedido perdido"/"pedido bloqueado"). Se marca FAILED de
  // forma explícita y se responde con un error claro - el jugador puede reintentar sin ambigüedad
  // (un reintento crea un pedido NUEVO, nunca duplica el viejo). Caso residual documentado en
  // web/docs/DELIVERY_FAILURE_RECOVERY.md: si el checkout llegó a crearse en el proveedor pero
  // `markPendingPayment` falla justo después, el `public_id` viaja como custom data del basket
  // Tebex - recuperable a mano buscando ese ID en el dashboard del proveedor.
  try {
    const provider = createPaymentProvider(env, siteBaseUrl);
    const session = await provider.createCheckout({
      orderPublicId: order.public_id,
      productName: product.name,
      priceCents: product.priceCents,
      currency: product.currency,
      successUrl: `${siteBaseUrl}/tienda/gracias?order=${order.public_id}`,
      cancelUrl: `${siteBaseUrl}/tienda/${product.slug}`,
      playerName: profile.name,
      playerUuid: profile.uuid,
      providerPackageId: product.metadata.tebexPackageId,
    });
    await markPendingPayment(env, order.public_id, session.providerPaymentId);
    return jsonResponse(env, request, { orderId: order.public_id, checkoutUrl: session.checkoutUrl });
  } catch (err) {
    console.error(`No se pudo iniciar el checkout para el pedido ${order.public_id}:`, err);
    await markFailed(env, order.public_id, "checkout_creation_failed");
    return errorResponse(env, request, 502, "No se pudo iniciar el pago ahora mismo. Inténtalo de nuevo en unos segundos.", ErrorCode.UPSTREAM_UNAVAILABLE);
  }
}

/** GET /api/orders/:publicId - lectura pública de solo estado (nunca dispara ninguna entrega). */
export async function handleGetOrder(request: Request, env: Env, publicId: string): Promise<Response> {
  const order = await getOrderByPublicId(env, publicId);
  if (!order) return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  return jsonResponse(env, request, {
    orderId: order.public_id,
    status: order.status,
    productId: order.product_id,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at,
  });
}
