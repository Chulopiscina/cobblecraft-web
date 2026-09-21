import type { Env } from "../types";
import { errorResponse, timingSafeEqual } from "./security";

export interface ServiceHealthRow {
  component: string; checked_at: number; last_success_at: number | null;
  last_error_at: number | null; last_error_code: string | null; details: string;
}
export async function recordServiceHealth(env: Env, component: "tebex" | "delivery" | "bot", error: string | null, details: object = {}): Promise<void> {
  const now = Date.now();
  try {
    await env.DB.prepare(`INSERT INTO service_health (component, checked_at, last_success_at, last_error_at, last_error_code, details)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(component) DO UPDATE SET checked_at = excluded.checked_at,
      last_success_at = COALESCE(excluded.last_success_at, service_health.last_success_at),
      last_error_at = COALESCE(excluded.last_error_at, service_health.last_error_at),
      last_error_code = excluded.last_error_code, details = excluded.details`)
      .bind(component, now, error ? null : now, error ? now : null, error, JSON.stringify(details)).run();
  } catch { console.error(`[ERROR] OPERATIONS_PERSIST_FAILED component=${component}`); }
}
export function requireOperationsAuth(request: Request, env: Env): Response | null {
  if (!env.OPERATIONS_TOKEN) return errorResponse(env, request, 503, "Diagnóstico no configurado.");
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token && timingSafeEqual(token, env.OPERATIONS_TOKEN) ? null : errorResponse(env, request, 401, "No autorizado.");
}
