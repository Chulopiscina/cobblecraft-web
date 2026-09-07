-- Sistema /vote (Web CobbleCraft V1) - ver web/docs/VOTE_ARCHITECTURE.md.
--
-- `vote_sessions`: una fila por token HMAC emitido por Minecraft (`/vote` en el juego). El
-- `nonce` es la clave primaria - da proteccion contra REPLAY como defensa en profundidad ademas
-- de la firma/expiracion del propio token (que ya se verifican sin tocar la base de datos). Un
-- nonce ya presente aqui nunca puede volver a canjearse (`consumed_at IS NOT NULL`).
CREATE TABLE vote_sessions (
  nonce TEXT PRIMARY KEY,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX idx_vote_sessions_uuid ON vote_sessions(player_uuid);

-- `votes`: persistencia DURABLE del voto real, mas el ciclo de vida de su recompensa pendiente
-- (mismo patron claim+lease que `orders.claim_token`, ver lib/orders.ts). `reward_status`:
-- pending -> claimed -> delivered (o vuelve a pending si Minecraft reporta "failed").
CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  voted_at INTEGER NOT NULL,
  nonce TEXT NOT NULL,
  reward_status TEXT NOT NULL DEFAULT 'pending', -- pending|claimed|delivered
  claim_token TEXT,
  claimed_at INTEGER,
  delivered_at INTEGER
);

CREATE INDEX idx_votes_uuid ON votes(player_uuid);
CREATE INDEX idx_votes_uuid_voted_at ON votes(player_uuid, voted_at);
CREATE INDEX idx_votes_reward_status ON votes(reward_status);
