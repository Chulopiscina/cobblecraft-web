import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, ErrorCode } from "../lib/security";
import { requireServerAuth } from "./delivery";

const HeartbeatBody = z.object({
  state: z.enum(["online", "offline"]).default("online"),
  playersOnline: z.number().int().min(0).optional(),
  maxPlayers: z.number().int().min(0).optional(),
  description: z.string().trim().max(120).optional(),
});

interface HeartbeatRow {
  state: "online" | "offline";
  players_online: number | null;
  max_players: number | null;
  description: string | null;
  updated_at: number;
}

function ttlMs(env: Env): number {
  const configured = Number.parseInt(env.SERVER_STATUS_TTL_SECONDS ?? "90", 10);
  const seconds = Number.isFinite(configured) ? configured : 90;
  return Math.min(900, Math.max(15, seconds)) * 1000;
}

function offlinePayload(row?: HeartbeatRow | null) {
  return {
    state: "offline",
    online: false,
    playersOnline: 0,
    maxPlayers: row?.max_players ?? 0,
    description: row?.description ?? null,
    lastSeenAt: row?.updated_at ?? null,
  };
}

export async function handleServerStatus(request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT state, players_online, max_players, description, updated_at FROM server_status_heartbeat WHERE id = 1",
  ).first<HeartbeatRow>();

  if (!row || row.state !== "online" || Date.now() - row.updated_at > ttlMs(env)) {
    return jsonResponse(env, request, offlinePayload(row));
  }

  return jsonResponse(env, request, {
    state: "online",
    online: true,
    playersOnline: row.players_online ?? 0,
    maxPlayers: row.max_players ?? 0,
    description: row.description,
    lastSeenAt: row.updated_at,
  });
}

export async function handleServerStatusHeartbeat(request: Request, env: Env): Promise<Response> {
  const authError = requireServerAuth(request, env.SERVER_STATUS_TOKEN ? { ...env, STORE_SERVER_TOKEN: env.SERVER_STATUS_TOKEN } : env);
  if (authError) return authError;

  let body: z.infer<typeof HeartbeatBody>;
  try {
    body = HeartbeatBody.parse(await request.json());
  } catch {
    return errorResponse(env, request, 400, "Payload de estado inválido.", ErrorCode.INVALID_REQUEST);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO server_status_heartbeat (id, state, players_online, max_players, description, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       state = excluded.state,
       players_online = excluded.players_online,
       max_players = excluded.max_players,
       description = excluded.description,
       updated_at = excluded.updated_at`,
  )
    .bind(body.state, body.playersOnline ?? null, body.maxPlayers ?? null, body.description ?? null, now)
    .run();

  return jsonResponse(env, request, {
    ok: true,
    state: body.state,
    playersOnline: body.playersOnline ?? 0,
    maxPlayers: body.maxPlayers ?? 0,
    updatedAt: now,
  });
}
