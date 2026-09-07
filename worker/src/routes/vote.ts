import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, rateLimit, clientKey, ErrorCode } from "../lib/security";
import { verifyVoteToken } from "../lib/vote-token";
import { recordVoteSession, consumeNonce, hasVotedInPeriod, insertVote, listPendingVoteRewards, claimVoteReward, ackVoteReward, releaseVoteRewardClaim } from "../lib/votes";
import { votePeriodId, nextVotePeriodResetAt, votePeriodConfigFromEnv } from "../lib/vote-period";
import { requireServerAuth } from "./delivery";

/**
 * Sistema `/vote` (Web CobbleCraft V1/V2) - endpoints publicos (llamados por la pagina estatica
 * `/vote/[token]`) mas los 3 endpoints de entrega de recompensa (Bearer-auth, llamados SOLO por
 * progression_core, mismo patron exacto que `routes/delivery.ts`). Ver web/docs/VOTE_ARCHITECTURE.md.
 *
 * Identificador principal SIEMPRE el UUID del token firmado (nunca localStorage, nunca solo IP -
 * pedido explicito, seccion 10). V2 (2026-09-11): "1 voto por DÍA de CobbleCraft" (ventana GLOBAL
 * diaria, ver `lib/vote-period.ts`) - NUNCA "último voto + N horas rolling". El voto se evalúa
 * contra `votes` (persistencia durable, `UNIQUE(player_uuid, vote_period_id)`), y el nonce del
 * token contra `vote_sessions` (protección anti-replay en profundidad).
 */

type TokenEvalResult =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "already_voted"; nextResetAt: number; playerName: string }
  | { state: "used"; playerName: string }
  | { state: "ready"; playerName: string; uuid: string };

/** Evaluacion PURA del estado real de un token, reutilizada tanto por el status (GET, informativo) como por el submit (POST, autoritativo) - el submit SIEMPRE re-evalua desde cero, nunca confia en un estado leido antes. */
async function evaluateToken(env: Env, token: string): Promise<TokenEvalResult> {
  const secret = env.VOTE_SIGNING_SECRET;
  if (!secret) return { state: "invalid" };

  const verified = await verifyVoteToken(token, secret);
  if (!verified.ok) return verified.reason === "EXPIRED" ? { state: "expired" } : { state: "invalid" };

  const { uuid, playerName, nonce } = verified.payload;

  const sessionSeen = await env.DB.prepare("SELECT consumed_at FROM vote_sessions WHERE nonce = ?").bind(nonce).first<{ consumed_at: number | null }>();
  if (sessionSeen?.consumed_at) return { state: "used", playerName };

  const now = Date.now();
  const periodConfig = votePeriodConfigFromEnv(env);
  const currentPeriod = votePeriodId(now, periodConfig);
  if (await hasVotedInPeriod(env, uuid, currentPeriod)) {
    return { state: "already_voted", nextResetAt: nextVotePeriodResetAt(now, periodConfig), playerName };
  }

  return { state: "ready", playerName, uuid };
}

/** GET /api/vote/status?token=... - informativo, llamado al cargar la pagina /vote/[token]. */
export async function handleVoteStatus(request: Request, env: Env): Promise<Response> {
  if (!rateLimit(`vote-status:${clientKey(request)}`, 30, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes.");
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return errorResponse(env, request, 400, "Falta el token.");

  const result = await evaluateToken(env, token);
  return jsonResponse(env, request, result);
}

const SubmitBody = z.object({ token: z.string().min(1) });

/** POST /api/vote/submit - autoritativo. Registra el nonce (anti-replay), vuelve a comprobar cooldown de forma atomica, y crea el voto. Idempotente: un segundo submit con el MISMO token nunca vota dos veces (el nonce ya esta consumido). */
export async function handleVoteSubmit(request: Request, env: Env): Promise<Response> {
  if (!rateLimit(`vote-submit:${clientKey(request)}`, 10, 60_000)) {
    return errorResponse(env, request, 429, "Demasiadas solicitudes.");
  }

  let body: z.infer<typeof SubmitBody>;
  try {
    body = SubmitBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  const secret = env.VOTE_SIGNING_SECRET;
  if (!secret) return errorResponse(env, request, 500, "VOTE_SIGNING_SECRET no configurado en el Worker.");

  const verified = await verifyVoteToken(body.token, secret);
  if (!verified.ok) {
    return jsonResponse(env, request, { state: verified.reason === "EXPIRED" ? "expired" : "invalid" });
  }
  const { uuid, playerName, nonce, issuedAt, expiresAt } = verified.payload;

  // Registra la sesion (primera vez que se ve este nonce) - defensa en profundidad anti-replay.
  const sessionOutcome = await recordVoteSession(env, { nonce, playerUuid: uuid, playerName, issuedAt, expiresAt });

  // Si este MISMO token ya se canjeo antes (reintento/doble click/refresh tras un voto ya
  // registrado), se reporta "used" directamente - SIN volver a evaluar el cooldown, que de lo
  // contrario ensombreceria el motivo real (el propio voto anterior de este token es lo que
  // activo el cooldown) con un mensaje generico y menos preciso.
  if (sessionOutcome === "ALREADY_SEEN") {
    const existingSession = await env.DB.prepare("SELECT consumed_at FROM vote_sessions WHERE nonce = ?").bind(nonce).first<{ consumed_at: number | null }>();
    if (existingSession?.consumed_at) return jsonResponse(env, request, { state: "used", playerName });
  }

  // Comprobación del período ANTES de canjear el nonce, contra los votos reales persistidos.
  const now = Date.now();
  const periodConfig = votePeriodConfigFromEnv(env);
  const currentPeriod = votePeriodId(now, periodConfig);
  if (await hasVotedInPeriod(env, uuid, currentPeriod)) {
    return jsonResponse(env, request, { state: "already_voted", nextResetAt: nextVotePeriodResetAt(now, periodConfig), playerName });
  }

  // Canjeo atomico del nonce - una UNICA UPDATE condicional gana la carrera ante doble click/doble request/refresh/concurrencia.
  const consumeResult = await consumeNonce(env, nonce);
  if (consumeResult !== "CONSUMED") {
    // Ya consumido por una peticion concurrente/anterior con el MISMO token - nunca se vota dos veces.
    return jsonResponse(env, request, { state: "used", playerName });
  }

  // Última defensa real (sección M/W: "Unique: UUID + vote_period_id") - una condición de carrera
  // genuina entre la comprobación de arriba y este INSERT la resuelve el índice ÚNICO de la BD
  // (migrations/0004_vote_period.sql), nunca solo la comprobación de aplicación.
  const insertResult = await insertVote(env, { playerUuid: uuid, playerName, nonce, votePeriodId: currentPeriod });
  if (insertResult.status === "ALREADY_VOTED_THIS_PERIOD") {
    return jsonResponse(env, request, { state: "already_voted", nextResetAt: nextVotePeriodResetAt(now, periodConfig), playerName });
  }
  return jsonResponse(env, request, { state: "success", playerName });
}

// ---- Entrega de recompensa (Bearer-auth, SOLO progression_core) - mismo patron que routes/delivery.ts ----

/** GET /api/vote/reward/pending - votos con recompensa entregable ahora mismo. */
export async function handleVoteRewardPending(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env);
  if (authError) return authError;

  const votes = await listPendingVoteRewards(env);
  return jsonResponse(
    env,
    request,
    votes.map((v) => ({ voteId: v.id, playerUuid: v.player_uuid, playerName: v.player_name, votedAt: v.voted_at })),
  );
}

const VoteClaimBody = z.object({ voteId: z.number().int().positive() });

export async function handleVoteRewardClaim(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env);
  if (authError) return authError;

  let body: z.infer<typeof VoteClaimBody>;
  try {
    body = VoteClaimBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  const outcome = await claimVoteReward(env, body.voteId);
  if (outcome.status === "NOT_FOUND") return errorResponse(env, request, 404, "Voto no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  if (outcome.status === "ALREADY_CLAIMED") {
    return jsonResponse(env, request, { claimed: false, reason: "already_claimed", code: ErrorCode.ALREADY_CLAIMED }, 409);
  }
  return jsonResponse(env, request, { claimed: true, claimToken: outcome.claimToken });
}

const VoteAckBody = z.object({
  voteId: z.number().int().positive(),
  result: z.enum(["delivered", "failed"]),
  claimToken: z.string().min(1),
});

export async function handleVoteRewardAck(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env);
  if (authError) return authError;

  let body: z.infer<typeof VoteAckBody>;
  try {
    body = VoteAckBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Petición inválida.");
  }

  if (body.result === "failed") {
    await releaseVoteRewardClaim(env, body.voteId, body.claimToken);
    return jsonResponse(env, request, { acked: true, willRetry: true });
  }

  const result = await ackVoteReward(env, body.voteId, body.claimToken);
  if (result === "NOT_FOUND") return errorResponse(env, request, 404, "Voto no encontrado.", ErrorCode.ORDER_NOT_FOUND);
  if (result === "STALE_CLAIM") {
    return errorResponse(env, request, 409, "El claim de este voto ya fue superado por otra generación.", ErrorCode.STALE_CLAIM);
  }
  return jsonResponse(env, request, { acked: true, alreadyDelivered: result === "ALREADY_DELIVERED" });
}
