CREATE TABLE IF NOT EXISTS subscription_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  reference TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subscription_reference ON subscription_events(reference,seq);
CREATE INDEX IF NOT EXISTS subscription_recipient ON subscription_events(player_uuid,seq);
CREATE TABLE IF NOT EXISTS subscription_checkouts (
  player_uuid TEXT PRIMARY KEY, order_id TEXT NOT NULL
);
