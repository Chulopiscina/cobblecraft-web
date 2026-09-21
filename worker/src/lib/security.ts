import type { Env } from "../types";

/** Parte J - CORS restrictivo: solo el origen real de la web (nunca `*`), configurable por entorno. */
export function corsHeaders(env: Env, request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = env.CORS_ALLOWED_ORIGIN;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Mock-Signature, Stripe-Signature, X-Signature",
    Vary: "Origin",
  };
  if (origin && origin === allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** Cabeceras de seguridad reales - CSP restrictiva para respuestas JSON (nunca se sirve HTML desde este Worker). */
export function securityHeaders(): HeadersInit {
  return {
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  };
}

export function jsonResponse(env: Env, request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(env, request),
      ...securityHeaders(),
    },
  });
}

/**
 * Códigos de error consistentes (Production Hardening V1, Fase K) - el frontend puede mostrar un
 * mensaje humano por código sin parsear texto libre, y los logs quedan grepeables. `errorResponse`
 * acepta un código explícito para los casos importantes; si se omite, se deriva uno genérico
 * razonable a partir del status HTTP (nunca deja la respuesta sin código).
 */
export const ErrorCode = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  CHECKOUT_DISABLED: "CHECKOUT_DISABLED",
  INVALID_PLAYER_NAME: "INVALID_PLAYER_NAME",
  PLAYER_NOT_FOUND: "PLAYER_NOT_FOUND",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  ALREADY_CLAIMED: "ALREADY_CLAIMED",
  STALE_CLAIM: "STALE_CLAIM",
  LINK_CODE_NOT_FOUND: "LINK_CODE_NOT_FOUND",
  LINK_CODE_EXPIRED: "LINK_CODE_EXPIRED",
  LINK_CODE_ALREADY_USED: "LINK_CODE_ALREADY_USED",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

function genericCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.INVALID_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.ORDER_NOT_FOUND;
    case 409:
      return ErrorCode.ALREADY_CLAIMED;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 502:
      return ErrorCode.UPSTREAM_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}

export function errorResponse(env: Env, request: Request, status: number, message: string, code?: ErrorCode): Response {
  return jsonResponse(env, request, { error: message, code: code ?? genericCodeForStatus(status) }, status);
}

/**
 * Rate limiting razonable (Parte J/K - "no montar sistema enterprise, solo medidas razonables").
 * Ventana fija en memoria del Worker por IP+ruta - suficiente para frenar spam de checkout/
 * fuerza bruta de códigos sin depender de un servicio externo de pago (Durable Objects). Se
 * reinicia si el Worker recicla la instancia - aceptable para V1, documentado en SECURITY.md.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > RATE_LIMIT_SWEEP_THRESHOLD) sweepExpiredBuckets(now);

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function sweepExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

export function clientKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "unknown";
}

/** Nunca loguear ni devolver un secret real - usado en logs de diagnóstico. */
export function redactSecret(value: string | undefined | null): string {
  if (!value) return "(no configurado)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Comparación en tiempo constante (Production Hardening V1, Fase A - auditoría de seguridad).
 * `a !== b` normal en JS/V8 compara byte a byte y retorna en cuanto encuentra la primera
 * diferencia - un atacante que pueda medir la latencia de la respuesta (firma de webhook, Bearer
 * token) podría, en teoría, reconstruir el secreto byte a byte. Usada para CUALQUIER comparación
 * de un secreto/firma real (Bearer token del servidor Minecraft, HMAC de MockPaymentProvider,
 * HMAC de Stripe/Tebex) - nunca `===`/`!==` directo sobre esos valores.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Limpieza oportunista del mapa de rate-limit (Fase A/I - auditoría: `buckets` crecía sin límite
 * mientras la instancia del Worker viviera, ya que las entradas expiradas nunca se eliminaban,
 * solo se ignoraban). Se ejecuta dentro de `rateLimit()` cuando el mapa supera un umbral barato de
 * comprobar - suficiente para un Worker de esta escala, nunca un cron/Durable Object aparte.
 */
const RATE_LIMIT_SWEEP_THRESHOLD = 500;
