import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, rateLimit, clientKey, ErrorCode } from "../lib/security";
import { getAuthoritativeProduct, getProviderPackageId } from "../lib/catalog";
import { resolveMojangProfile } from "../lib/mojang";
import { createOrder, markPendingPayment, markFailed, getOrderByPublicId } from "../lib/orders";
import { createPaymentProvider } from "../lib/payment/factory";
import { checkoutAvailable } from "../lib/store-readiness";
import { recordServiceHealth } from "../lib/operations";

const CreateOrderBody = z.object({
  productId: z.string().min(1).max(64),
  playerName: z.string().regex(/^[A-Za-z0-9_]{3,16}$/, "Nombre de jugador Minecraft inválido"),
});

function errorSummary(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

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
  if (!product.checkoutEnabled || !checkoutAvailable(env)) {
    return errorResponse(env, request, 409, "Este producto esta preparado, pero el checkout Tebex aun no esta activado.", ErrorCode.CHECKOUT_DISABLED);
  }

  let profile;
  try {
    profile = await resolveMojangProfile(parsed.playerName);
  } catch (err) {
    console.error(`Mojang profile lookup failed for ${parsed.playerName}: ${errorSummary(err)}`);
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
      cancelUrl: `${siteBaseUrl}/tienda/cancelado?order=${order.public_id}`,
      playerName: profile.name,
      playerUuid: profile.uuid,
      customerIp: request.headers.get("CF-Connecting-IP") ?? undefined,
      providerPackageId: getProviderPackageId(product.productId),
    });
    await markPendingPayment(env, order.public_id, session.providerPaymentId);
    await recordServiceHealth(env, "tebex", null, { checkoutCreatedAt: Date.now() });
    return jsonResponse(env, request, { orderId: order.public_id, checkoutUrl: session.checkoutUrl });
  } catch (err) {
    console.error(`No se pudo iniciar el checkout para el pedido ${order.public_id}:`, err);
    await recordServiceHealth(env, "tebex", "CHECKOUT_CREATION_FAILED");
    await markFailed(env, order.public_id, "checkout_creation_failed");
    return errorResponse(env, request, 502, "No se pudo iniciar el pago ahora mismo. Inténtalo de nuevo en unos segundos.", ErrorCode.UPSTREAM_UNAVAILABLE);
  }
}

export async function handleResumeOrderCheckout(request: Request, env: Env, siteBaseUrl: string, publicId: string): Promise<Response> {
  if (!rateLimit(`resume-checkout:${clientKey(request)}`, 12, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes, inténtalo de nuevo en un minuto.");
  }

  const order = await getOrderByPublicId(env, publicId);
  if (!order) return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  if (order.status !== "PENDING_PAYMENT" || !order.provider_payment_id) {
    return errorResponse(env, request, 409, "Este pedido no tiene un checkout pendiente.", ErrorCode.CHECKOUT_DISABLED);
  }

  const product = getAuthoritativeProduct(env, order.product_id);
  if (!product || !product.checkoutEnabled || !checkoutAvailable(env)) {
    return errorResponse(env, request, 404, "Producto no encontrado o no disponible.", ErrorCode.PRODUCT_NOT_FOUND);
  }

  try {
    const provider = createPaymentProvider(env, siteBaseUrl);
    if (!provider.resumeCheckout) throw new Error(`El proveedor ${provider.id} no permite reanudar checkout.`);
    const session = await provider.resumeCheckout({
      orderPublicId: order.public_id,
      providerPaymentId: order.provider_payment_id,
      productName: product.name,
      priceCents: product.priceCents,
      currency: product.currency,
      successUrl: `${siteBaseUrl}/tienda/gracias?order=${order.public_id}`,
      cancelUrl: `${siteBaseUrl}/tienda/cancelado?order=${order.public_id}`,
      playerName: order.player_name,
      playerUuid: order.player_uuid,
      customerIp: request.headers.get("CF-Connecting-IP") ?? undefined,
      providerPackageId: getProviderPackageId(product.productId),
    });
    return jsonResponse(env, request, { orderId: order.public_id, checkoutUrl: session.checkoutUrl });
  } catch (err) {
    console.error(`No se pudo reanudar el checkout para el pedido ${order.public_id}:`, err);
    return errorResponse(env, request, 502, "No se pudo reanudar el pago ahora mismo. Inténtalo de nuevo en unos segundos.", ErrorCode.UPSTREAM_UNAVAILABLE);
  }
}

/** GET /api/orders/:publicId - lectura pública de solo estado (nunca dispara ninguna entrega). */
export async function handleGetOrder(request: Request, env: Env, publicId: string): Promise<Response> {
  if (!/^ord_[A-Z2-9]{20}$/.test(publicId)) return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  if (!rateLimit(`order-status:${clientKey(request)}`, 60, 60_000)) return errorResponse(env, request, 429, "Demasiadas consultas.");
  const order = await getOrderByPublicId(env, publicId);
  if (!order) return errorResponse(env, request, 404, "Pedido no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  return jsonResponse(env, request, {
    orderId: order.public_id,
    status: order.status,
    productId: order.product_id,
    productName: getAuthoritativeProduct(env, order.product_id)?.name ?? "Producto de CobbleCraft",
    productSlug: getAuthoritativeProduct(env, order.product_id)?.slug ?? null,
    playerName: order.player_name,
    reviewRequired: order.review_required === 1,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at,
  });
}
