import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse, errorResponse, ErrorCode } from "../lib/security";
import { requireServerAuth } from "./delivery";
import { recordServiceHealth, type ServiceHealthRow } from "../lib/operations";

const time = z.number().int().nonnegative().nullable();
const code = z.string().regex(/^[A-Z0-9_]{1,60}$/).nullable();
const Diagnostics = z.object({
  profile: z.enum(["PROD", "DEV"]),
  discord: z.object({ online: z.boolean(), lastConnectedAt: time, lastErrorAt: time, lastError: code }),
  pebble: z.object({ configured: z.boolean(), verified: z.boolean(), lastQueryAt: time, lastSuccessAt: time,
    lastError: code, retryAt: z.number().nonnegative(), resources: z.object({ memoryBytes: z.number().nonnegative(), cpuPercent: z.number().nonnegative(), uptimeMs: z.number().nonnegative() }).nullable() }),
  bridge: z.enum(["fresh", "disabled", "stale", "unavailable"]),
});

const HeartbeatBody = z.object({
  state: z.enum(["online", "offline"]).default("online"),
  playersOnline: z.number().int().min(0).nullable().optional(),
  maxPlayers: z.number().int().min(0).nullable().optional(),
  description: z.string().trim().max(120).optional(),
  version: z.string().max(100).nullable().optional(),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  diagnostics: Diagnostics.optional(),
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
    playersOnline: null,
    maxPlayers: null,
    description: row?.description ?? null,
    lastSeenAt: row?.updated_at ?? null,
    version: null, latencyMs: null,
  };
}

export async function handleServerStatus(request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT state, players_online, max_players, description, updated_at FROM server_status_heartbeat WHERE id = 1",
  ).first<HeartbeatRow>();

  if (!row || row.state !== "online" || Date.now() - row.updated_at > ttlMs(env)) {
    return jsonResponse(env, request, offlinePayload(row));
  }

  const telemetry = await env.DB.prepare("SELECT * FROM service_health WHERE component = 'bot'").first<ServiceHealthRow>();
  const extra = telemetry && Date.now() - telemetry.checked_at <= ttlMs(env) ? JSON.parse(telemetry.details) : {};
  return jsonResponse(env, request, {
    state: "online",
    online: true,
    playersOnline: row.players_online,
    maxPlayers: row.max_players,
    description: row.description,
    lastSeenAt: row.updated_at,
    version: extra.version ?? null, latencyMs: extra.latencyMs ?? null,
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
  if (env.ENVIRONMENT === "production" && body.diagnostics?.profile === "DEV") return errorResponse(env, request, 400, "Perfil de estado incorrecto.");
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

  await recordServiceHealth(env, "bot", null, { version: body.version ?? null, latencyMs: body.latencyMs ?? null, diagnostics: body.diagnostics ?? null });

  return jsonResponse(env, request, {
    ok: true,
    state: body.state,
    playersOnline: body.playersOnline ?? 0,
    maxPlayers: body.maxPlayers ?? 0,
    updatedAt: now,
  });
}
