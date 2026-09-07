import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, rateLimit, clientKey, ErrorCode } from "../lib/security";
import { generateLinkCode, isValidUuid } from "../lib/ids";
import { requireServerAuth } from "./delivery";

const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos - suficiente para escribir el comando en el juego

/**
 * Parte C - vinculación más segura (opcional, "SI puede implementarse limpiamente: HAZLO"). La
 * web genera un código corto; el jugador lo confirma DENTRO del servidor con `/web link AB12CD`
 * (comando nuevo en progression_core, ver web/docs/MINECRAFT_DELIVERY.md); el servidor llama a
 * `handleConfirmLink` con el UUID REAL del jugador que ejecutó el comando (nunca un UUID que
 * pueda inventarse desde la web). Un código es de un solo uso y expira a los 10 minutos.
 */
export async function handleStartLink(request: Request, env: Env): Promise<Response> {
  if (!rateLimit(`link-start:${clientKey(request)}`, 10, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes.");
  }
  const code = generateLinkCode();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO link_codes (code, created_at, expires_at) VALUES (?, ?, ?)").bind(code, now, now + LINK_CODE_TTL_MS).run();
  return jsonResponse(env, request, { code, expiresAt: now + LINK_CODE_TTL_MS });
}

/**
 * GET /api/link/status/:code - endpoint PÚBLICO (lo consulta la propia web mientras espera la
 * confirmación). Rate limit por IP (Fase A/I - "no enumeración fácil") además del espacio de
 * códigos ya grande (32^6 ≈ mil millones) - defensa en profundidad contra fuerza bruta.
 */
export async function handleLinkStatus(request: Request, env: Env, code: string): Promise<Response> {
  if (!rateLimit(`link-status:${clientKey(request)}`, 20, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes.");
  }
  const row = await env.DB.prepare("SELECT * FROM link_codes WHERE code = ?").bind(code.toUpperCase()).first<{
    code: string;
    player_uuid: string | null;
    player_name: string | null;
    expires_at: number;
    confirmed_at: number | null;
  }>();
  if (!row) return errorResponse(env, request, 404, "Código no encontrado.", ErrorCode.LINK_CODE_NOT_FOUND);
  if (!row.confirmed_at && Date.now() > row.expires_at) {
    return jsonResponse(env, request, { confirmed: false, expired: true });
  }
  return jsonResponse(env, request, {
    confirmed: row.confirmed_at !== null,
    expired: false,
    playerUuid: row.confirmed_at ? row.player_uuid : null,
    playerName: row.confirmed_at ? row.player_name : null,
  });
}

const ConfirmBody = z.object({
  code: z.string().length(6),
  playerUuid: z.string().refine(isValidUuid, "UUID inválido"),
  playerName: z.string().regex(/^[A-Za-z0-9_]{3,16}$/),
});

/**
 * POST /api/link/confirm - llamado SOLO por el servidor Minecraft (mismo Bearer token que la
 * entrega). Rate limit por IP como defensa en profundidad adicional (Fase A) - aunque ya está
 * gateado por `requireServerAuth`, un token comprometido no debería poder usarse para saturar
 * este endpoint sin límite.
 */
export async function handleConfirmLink(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env);
  if (authError) return authError;
  if (!rateLimit(`link-confirm:${clientKey(request)}`, 60, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes.");
  }

  let body: z.infer<typeof ConfirmBody>;
  try {
    body = ConfirmBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  const code = body.code.toUpperCase();
  const row = await env.DB.prepare("SELECT * FROM link_codes WHERE code = ?").bind(code).first<{ expires_at: number; confirmed_at: number | null }>();
  if (!row) return errorResponse(env, request, 404, "Código no encontrado.", ErrorCode.LINK_CODE_NOT_FOUND);
  if (row.confirmed_at) return errorResponse(env, request, 409, "Código ya utilizado.", ErrorCode.LINK_CODE_ALREADY_USED);
  if (Date.now() > row.expires_at) return errorResponse(env, request, 410, "Código expirado.", ErrorCode.LINK_CODE_EXPIRED);

  await env.DB.prepare("UPDATE link_codes SET player_uuid = ?, player_name = ?, confirmed_at = ? WHERE code = ? AND confirmed_at IS NULL")
    .bind(body.playerUuid, body.playerName, Date.now(), code)
    .run();
  return jsonResponse(env, request, { confirmed: true });
}
