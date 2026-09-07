-- Web Oficial V1 - esquema inicial de la Tienda (D1/SQLite). Ver web/docs/STORE_ARCHITECTURE.md
-- para el diagrama de estados y el flujo completo pedido -> pago -> entrega.

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,           -- id publico opaco expuesto al frontend (nunca el id incremental)
  player_uuid TEXT NOT NULL,                -- UUID real del jugador (autoridad de entrega, NUNCA solo el nombre)
  player_name TEXT NOT NULL,                -- username mostrado en el momento de la compra (informativo)
  product_id TEXT NOT NULL,                 -- referencia al catalogo real (web/store/catalog.json)
  price_cents INTEGER NOT NULL,             -- precio SERVIDOR (nunca el que mande el navegador)
  currency TEXT NOT NULL,
  payment_provider TEXT NOT NULL,           -- "mock" | "stripe" | "tebex"
  provider_payment_id TEXT,                 -- id real de la sesion/pago en el proveedor (null hasta checkout)
  status TEXT NOT NULL,                     -- CREATED|PENDING_PAYMENT|PAID|CLAIMED|DELIVERED|FAILED|REFUNDED
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  claimed_at INTEGER,
  delivered_at INTEGER,
  failed_at INTEGER
);

CREATE UNIQUE INDEX idx_orders_public_id ON orders(public_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_player_uuid ON orders(player_uuid);
-- Idempotencia real de pago: el MISMO pago de un proveedor nunca puede marcar dos pedidos PAID.
CREATE UNIQUE INDEX idx_orders_provider_payment ON orders(payment_provider, provider_payment_id);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  event_type TEXT NOT NULL,                 -- CREATED|CHECKOUT_STARTED|WEBHOOK_RECEIVED|PAID|CLAIMED|DELIVERED|FAILED|...
  created_at INTEGER NOT NULL,
  metadata TEXT                             -- JSON de solo diagnostico, NUNCA secrets/tarjetas
);

CREATE INDEX idx_order_events_order ON order_events(order_id);

-- Un evento de webhook real (event id del proveedor) nunca se procesa dos veces, incluso si el
-- proveedor reintenta la entrega HTTP (comportamiento estandar de Tebex/proveedores reales).
CREATE TABLE processed_webhooks (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);

-- Vinculacion opcional mas segura (Parte C): codigo temporal `/web link AB12CD` generado por la
-- web, confirmado dentro del servidor Minecraft. Nunca sustituye la resolucion de UUID en el
-- momento de comprar - es un mecanismo ADICIONAL para una futura cuenta web sin contraseña.
CREATE TABLE link_codes (
  code TEXT PRIMARY KEY,                    -- ej. "AB12CD"
  player_uuid TEXT,                         -- se rellena cuando el servidor confirma el codigo
  player_name TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  confirmed_at INTEGER
);

CREATE INDEX idx_link_codes_expires ON link_codes(expires_at);
