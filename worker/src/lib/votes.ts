import type { Env } from "../types";

/**
 * Sistema `/vote` (Web CobbleCraft V1/V2) - capa de acceso a `vote_sessions`/`votes`. Mismo estilo
 * que `lib/orders.ts`: SQL directo sobre D1, sin ORM, condiciones atomicas expresadas como UPDATE
 * condicional + `meta.changes` (D1/SQLite garantiza que solo un llamador concurrente gana una
 * fila). Ver migrations/0003_vote.sql + 0004_vote_period.sql para el esquema completo.
 *
 * V2 (2026-09-11): "1 voto cada X horas" (rolling) fue reemplazado por "1 voto por
 * `vote_period_id`" (ventana diaria FIJA, ver `lib/vote-period.ts`) - la pregunta ya no es
 * "¿cuándo fue tu último voto?" sino "¿ya votaste en ESTE período de calendario?".
 */

export type ConsumeNonceResult = "CONSUMED" | "ALREADY_CONSUMED" | "NOT_FOUND";

/** Inserta la sesion de voto la PRIMERA vez que se ve un nonce valido - proteccion anti-replay en profundidad (la firma/expiracion ya se verifican antes de llegar aqui, sin tocar la BD). */
export async function recordVoteSession(env: Env, params: { nonce: string; playerUuid: string; playerName: string; issuedAt: number; expiresAt: number }): Promise<"NEW" | "ALREADY_SEEN"> {
  const res = await env.DB.prepare(
    "INSERT OR IGNORE INTO vote_sessions (nonce, player_uuid, player_name, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(params.nonce, params.playerUuid, params.playerName, params.issuedAt, params.expiresAt)
    .run();
  return (res.meta.changes ?? 0) > 0 ? "NEW" : "ALREADY_SEEN";
}

/** Canjea el nonce de forma atomica - un nonce ya `consumed_at` nunca puede volver a canjearse (doble click/doble request/refresh). */
export async function consumeNonce(env: Env, nonce: string): Promise<ConsumeNonceResult> {
  const row = await env.DB.prepare("SELECT consumed_at FROM vote_sessions WHERE nonce = ?").bind(nonce).first<{ consumed_at: number | null }>();
  if (!row) return "NOT_FOUND";
  const res = await env.DB.prepare("UPDATE vote_sessions SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL").bind(Date.now(), nonce).run();
  return (res.meta.changes ?? 0) > 0 ? "CONSUMED" : "ALREADY_CONSUMED";
}

/**
 * /vote V2 (2026-09-11) - true si [playerUuid] YA tiene un voto real persistido para
 * [votePeriodId] (identificador principal SIEMPRE el UUID, nunca IP/localStorage). Reemplaza al
 * antiguo `getLastVote`/cooldown-por-horas - la pregunta ya no es "¿cuándo fue tu último voto?"
 * sino "¿votaste YA en este período de calendario concreto?".
 */
export async function hasVotedInPeriod(env: Env, playerUuid: string, votePeriodId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 FROM votes WHERE player_uuid = ? AND vote_period_id = ? LIMIT 1").bind(playerUuid, votePeriodId).first<{ 1: number }>();
  return row != null;
}

export interface VoteRow {
  id: number;
  player_uuid: string;
  player_name: string;
  voted_at: number;
  nonce: string;
  reward_status: "pending" | "claimed" | "delivered";
  claim_token: string | null;
  claimed_at: number | null;
  delivered_at: number | null;
}

export type InsertVoteResult = { status: "INSERTED"; row: VoteRow } | { status: "ALREADY_VOTED_THIS_PERIOD" };

/**
 * /vote V2 (2026-09-11) - incluye `vote_period_id` (defensa en profundidad REAL a nivel de BD,
 * ver migrations/0004_vote_period.sql: `UNIQUE(player_uuid, vote_period_id)`). La comprobación de
 * aplicación (`hasVotedInPeriod`, ya hecha por el llamador antes de llegar aquí) es la que decide
 * el mensaje normal de "ya has votado hoy"; esta restricción de BD es el último cinturón de
 * seguridad ante una condición de carrera real que la comprobación de aplicación no alcanzara a
 * cubrir - nunca se trata como un error fatal, siempre como "ya votó este período".
 */
export async function insertVote(env: Env, params: { playerUuid: string; playerName: string; nonce: string; votePeriodId: string }): Promise<InsertVoteResult> {
  const now = Date.now();
  try {
    const row = await env.DB.prepare(
      "INSERT INTO votes (player_uuid, player_name, voted_at, nonce, reward_status, vote_period_id) VALUES (?, ?, ?, ?, 'pending', ?) RETURNING *",
    )
      .bind(params.playerUuid, params.playerName, now, params.nonce, params.votePeriodId)
      .first<VoteRow>();
    if (!row) throw new Error("No se pudo registrar el voto");
    return { status: "INSERTED", row };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.toUpperCase().includes("UNIQUE")) return { status: "ALREADY_VOTED_THIS_PERIOD" };
    throw e;
  }
}

function claimTimeoutMs(env: Env): number {
  return Number(env.CLAIM_TIMEOUT_SECONDS ?? "120") * 1000;
}

/** Votos con recompensa entregable ahora mismo: pending, o claimed cuyo timeout expiro (mismo auto-heal que `listDeliverable` de la Tienda). */
export async function listPendingVoteRewards(env: Env, limit = 50): Promise<VoteRow[]> {
  const cutoff = Date.now() - claimTimeoutMs(env);
  const res = await env.DB.prepare(
    "SELECT * FROM votes WHERE reward_status = 'pending' OR (reward_status = 'claimed' AND claimed_at < ?) ORDER BY voted_at ASC LIMIT ?",
  )
    .bind(cutoff, limit)
    .all<VoteRow>();
  return res.results ?? [];
}

export type VoteClaimOutcome = { status: "CLAIMED"; claimToken: string } | { status: "ALREADY_CLAIMED" } | { status: "NOT_FOUND" };

/** Claim atomico con lease, identico en espiritu a `claimOrder` (Tienda) - ver DELIVERY_FAILURE_RECOVERY.md. */
export async function claimVoteReward(env: Env, voteId: number): Promise<VoteClaimOutcome> {
  const row = await env.DB.prepare("SELECT * FROM votes WHERE id = ?").bind(voteId).first<VoteRow>();
  if (!row) return { status: "NOT_FOUND" };
  const cutoff = Date.now() - claimTimeoutMs(env);
  const claimToken = crypto.randomUUID();
  const res = await env.DB.prepare(
    "UPDATE votes SET reward_status = 'claimed', claimed_at = ?, claim_token = ? WHERE id = ? AND (reward_status = 'pending' OR (reward_status = 'claimed' AND claimed_at < ?))",
  )
    .bind(Date.now(), claimToken, voteId, cutoff)
    .run();
  if ((res.meta.changes ?? 0) === 0) return { status: "ALREADY_CLAIMED" };
  return { status: "CLAIMED", claimToken };
}

export type VoteAckResult = "DELIVERED" | "ALREADY_DELIVERED" | "NOT_FOUND" | "STALE_CLAIM";

export async function ackVoteReward(env: Env, voteId: number, claimToken: string): Promise<VoteAckResult> {
  const row = await env.DB.prepare("SELECT * FROM votes WHERE id = ?").bind(voteId).first<VoteRow>();
  if (!row) return "NOT_FOUND";
  if (row.reward_status === "delivered") return "ALREADY_DELIVERED";
  if (row.reward_status !== "claimed") return "ALREADY_DELIVERED";
  if (row.claim_token !== claimToken) return "STALE_CLAIM";
  const res = await env.DB.prepare("UPDATE votes SET reward_status = 'delivered', delivered_at = ? WHERE id = ? AND reward_status = 'claimed' AND claim_token = ?")
    .bind(Date.now(), voteId, claimToken)
    .run();
  if ((res.meta.changes ?? 0) === 0) return "ALREADY_DELIVERED";
  return "DELIVERED";
}

/** `result: "failed"` (fallo real en Minecraft, ej. jugador offline sin buzon disponible) - vuelve a `pending` para reintento, sin esperar el timeout completo. Mismo espiritu que el ACK de la Tienda, que deja el pedido CLAIMED para auto-heal; aqui se libera ya mismo porque no hay motivo para retener el lease. */
export async function releaseVoteRewardClaim(env: Env, voteId: number, claimToken: string): Promise<void> {
  await env.DB.prepare("UPDATE votes SET reward_status = 'pending', claim_token = NULL WHERE id = ? AND reward_status = 'claimed' AND claim_token = ?")
    .bind(voteId, claimToken)
    .run();
}
