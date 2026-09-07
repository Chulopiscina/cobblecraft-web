# Arquitectura de la Tienda: pedidos, estados, D1

## Esquema (D1, `web/worker/migrations/0001_init.sql`)

- **`orders`**: `id`, `public_id` (el ID que ve el jugador, `ord_...`), `player_uuid`,
  `player_name`, `product_id`, `price_cents`, `currency`, `payment_provider`,
  `provider_payment_id`, `status`, `created_at`, `paid_at`, `claimed_at`, `delivered_at`,
  `failed_at`.
- **`order_events`**: `order_id`, `event_type`, `timestamp`, `metadata` (JSON, nunca contiene
  secretos) - historial de auditoría, nunca se borra.
- **`processed_webhooks`**: `(provider, event_id)` como clave primaria - un evento de webhook
  con el mismo `event_id` nunca se procesa dos veces (protección anti-replay).
- **`link_codes`**: códigos de vinculación jugador↔web de un solo uso (ver MINECRAFT_DELIVERY.md).

Índice único real: `UNIQUE(payment_provider, provider_payment_id)` en `orders` - impide que dos
filas de pedido queden asociadas al mismo pago real del proveedor, sea cual sea la causa (bug,
doble clic, replay).

## Máquina de estados

```
CREATED → PENDING_PAYMENT → PAID → CLAIMED → DELIVERED
                    │                  │
                    ▼                  ▼ (fallo real de entrega)
                 FAILED             (vuelve a PAID/reclamable tras timeout)

PAID/CLAIMED/DELIVERED → REFUNDED (manual, fuera del alcance de V1 - solo el estado existe)
```

- `CREATED`: reservado para una futura separación entre "creación de pedido" y "creación de
  sesión de pago" - hoy `handleCreateOrder` hace ambas cosas en una sola llamada, así que en la
  práctica un pedido nace directamente en `PENDING_PAYMENT`.
- `PENDING_PAYMENT`: pedido creado, checkout hospedado del proveedor de pago generado, esperando
  confirmación.
- `PAID`: el webhook del proveedor confirmó el pago (firma verificada). Entra en la cola de
  `GET /api/delivery/pending`.
- `CLAIMED`: un servidor Minecraft lo reclamó de forma atómica (ver abajo). Si no llega ACK en
  `CLAIM_TIMEOUT_SECONDS` (config, por defecto 120s), vuelve a aparecer como reclamable - sin
  necesitar ningún cron job aparte, el propio `listDeliverable`/`claimOrder` comprueban el
  timeout en cada llamada.
- `DELIVERED`: ACK positivo recibido. Terminal.
- `FAILED`: el pago falló o fue rechazado. Terminal.

## Por qué D1 (SQLite) y no KV

El requisito "un pago nunca genera dos pedidos" y "un pedido nunca se reclama dos veces" necesita
restricciones reales (`UNIQUE`, `WHERE status = 'PAID'` en un `UPDATE` condicional) evaluadas
atómicamente por el motor de base de datos. KV no ofrece transacciones ni índices únicos - habría
que reinventar ese locking a mano, con mucho más riesgo de una condición de carrera real.

## Claim atómico (anti-doble-entrega)

```sql
UPDATE orders
SET status = 'CLAIMED', claimed_at = ?
WHERE public_id = ? AND (status = 'PAID' OR (status = 'CLAIMED' AND claimed_at < ?))
```

Una única sentencia `UPDATE` condicional - si dos servidores Minecraft llaman a
`/api/delivery/claim` para el mismo pedido casi simultáneamente, solo uno de los dos `UPDATE`
afecta a una fila (`changes = 1`); el otro afecta a cero filas y recibe `ALREADY_CLAIMED`. No
hace falta un lock explícito ni una transacción `BEGIN/COMMIT` separada - la propia atomicidad de
un `UPDATE` en SQLite/D1 ya lo garantiza.

## Idempotencia end-to-end (capas)

1. `UNIQUE(payment_provider, provider_payment_id)` en `orders` - un pago real nunca crea dos
   pedidos.
2. `processed_webhooks(provider, event_id)` - un webhook repetido (reintento del proveedor, o un
   atacante reenviando la misma petición) nunca se procesa dos veces.
3. `claimOrder` (arriba) - nunca dos claims simultáneos ganan.
4. `ackDelivered` es idempotente: si el pedido ya está `DELIVERED`, un segundo ACK responde
   `alreadyDelivered:true` sin error y sin tocar nada.
5. (Lado Minecraft, ver MINECRAFT_DELIVERY.md) el `public_id` del pedido se usa como clave del
   mecanismo `processed_ops` de `progression_core` - incluso si el propio Worker fallara y
   permitiera un reclamo duplicado por algún bug futuro, el lado Minecraft tiene su propia
   barrera independiente.

Ver `web/worker/test/orders.test.ts` y `web/worker/test/routes.test.ts` para los tests que
verifican cada una de estas capas contra una base de datos SQLite real (no mockeada).
