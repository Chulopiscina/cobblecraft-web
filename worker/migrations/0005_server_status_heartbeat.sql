CREATE TABLE IF NOT EXISTS server_status_heartbeat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL CHECK (state IN ('online', 'offline')),
  players_online INTEGER CHECK (players_online IS NULL OR players_online >= 0),
  max_players INTEGER CHECK (max_players IS NULL OR max_players >= 0),
  description TEXT,
  updated_at INTEGER NOT NULL
);
