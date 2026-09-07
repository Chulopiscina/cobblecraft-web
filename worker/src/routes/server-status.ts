import type { Env } from "../types";
import { jsonResponse } from "../lib/security";

/**
 * GET /api/server/status - preparado (Parte 3 del encargo, `ServerStatusProvider`). Pedido
 * explícito: "no montar scraping raro" y "si no hay endpoint fiable todavía, mostrar el
 * componente desactivado en PROD" - devuelve `{state:"disabled"}` mientras
 * `MC_STATUS_HOST`/`MC_STATUS_PORT` no estén configurados. La implementación real (Server List
 * Ping estándar de Minecraft vía la Workers TCP Sockets API) queda documentada como próximo paso
 * en web/docs/PRODUCTION_CHECKLIST.md - deliberadamente no implementada esta pasada para no
 * introducir un socket TCP sin probar contra un servidor público real.
 */
export async function handleServerStatus(request: Request, env: Env): Promise<Response> {
  if (!env.MC_STATUS_HOST || !env.MC_STATUS_PORT) {
    return jsonResponse(env, request, { state: "disabled" });
  }
  // Placeholder intencional: sin implementación real todavía, ver doc de la función.
  return jsonResponse(env, request, { state: "disabled" });
}
