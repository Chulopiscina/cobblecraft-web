import type { Env } from "../types";
import { jsonResponse } from "../lib/security";

/**
 * GET /api/health - diagnóstico básico (Production Hardening V1, Fase K - "poder diagnosticar
 * problemas en producción sin pagar servicios externos"). Nunca expone secretos ni estadísticas
 * sensibles (recuento de pedidos, ingresos, etc.) - solo si el propio Worker y D1 responden.
 */
export async function handleHealth(request: Request, env: Env): Promise<Response> {
  let dbReachable = true;
  try {
    await env.DB.prepare("SELECT 1").first();
  } catch {
    dbReachable = false;
  }
  const ok = dbReachable;
  return jsonResponse(env, request, { ok, environment: env.ENVIRONMENT, dbReachable, timestamp: Date.now() }, ok ? 200 : 503);
}
