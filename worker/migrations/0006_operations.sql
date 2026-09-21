-- Additive only: preserve orders, leases and all existing application data.
ALTER TABLE orders ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN review_reason TEXT;
CREATE TABLE service_health (
  component TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL,
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error_code TEXT,
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE payment_reversals (
  provider TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX idx_payment_reversals_transaction ON payment_reversals(provider, transaction_id);
CREATE INDEX idx_orders_review ON orders(review_required);
