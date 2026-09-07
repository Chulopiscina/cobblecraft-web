# Observabilidad (sin servicios externos de pago)

Objetivo del encargo: "poder diagnosticar problemas cuando esté en producción sin pagar
servicios externos". Todo lo de aquí usa herramientas ya incluidas gratis en Cloudflare/GitHub -
ningún Sentry/Datadog/etc. nuevo.

## `GET /api/health`

```json
{ "ok": true, "environment": "production", "dbReachable": true, "timestamp": 1735689600000 }
```

- `ok`/`dbReachable`: hace un `SELECT 1` real contra D1 - si D1 no responde, `ok:false` y HTTP
  503 (nunca un 200 mentiroso).
- `environment`: para confirmar rápidamente contra qué entorno se está consultando.
- **Nunca** expone secretos, recuentos de pedidos, ingresos, ni ningún dato de negocio -
  diagnóstico de infraestructura únicamente.
- Test: `web/worker/test/health.test.ts`.

Uso real: un simple `curl https://<worker>/api/health` (o un uptime-checker externo gratuito
tipo UptimeRobot, fuera del alcance de esta sesión pero mencionado como opción futura sin coste)
confirma en segundos si el Worker+D1 están vivos.

## Logs estructurados

Cloudflare Workers captura automáticamente todo `console.log`/`console.error`/`console.warn`
(visible en el dashboard, pestaña "Logs" del Worker, en tiempo real o con `wrangler tail`) - sin
configuración adicional. Convención seguida en este proyecto:

- **Nunca** loguear el body completo de un webhook de pago (puede contener datos de facturación
  del proveedor) - solo campos concretos (`orderId`, `eventId`, `status`).
- **Nunca** loguear un secreto/token - `redactSecret()` para cualquier caso donde hiciera falta
  mostrar parte de un valor sensible en diagnóstico.
- Cada transición de estado de un pedido queda en `order_events` (D1, consultable a mano vía
  `wrangler d1 execute` - ver `STORE_ARCHITECTURE.md`) - un histórico de auditoría real, no solo
  logs efímeros.

Lado Minecraft (`progression_core`): SLF4J estándar (`server/logs/latest.log`), mismo criterio -
`StoreDeliveryService` nunca loguea el `STORE_SERVER_TOKEN`, solo IDs de pedido y resultados.

## Códigos de error consistentes

`web/worker/src/lib/security.ts` → `ErrorCode` (Production Hardening V1, Fase K). Cada
`errorResponse()` incluye un `code` explícito o uno derivado razonablemente del status HTTP -
nunca solo un `message` en texto libre.

| Código | Cuándo |
|---|---|
| `ORDER_NOT_FOUND` | Pedido inexistente (`public_id` no encontrado). |
| `PRODUCT_NOT_FOUND` | `productId` no está en el catálogo visible para ese entorno. |
| `INVALID_PLAYER_NAME` | El nombre no tiene forma de username Minecraft válido. |
| `PLAYER_NOT_FOUND` | La API de Mojang no encontró ninguna cuenta con ese nombre. |
| `UPSTREAM_UNAVAILABLE` | Mojang/proveedor de pago no respondieron a tiempo. |
| `RATE_LIMITED` | Límite de peticiones superado (429). |
| `ALREADY_CLAIMED` | Otro proceso ya reclamó ese pedido (409, esperado en operación normal). |
| `STALE_CLAIM` | El `claimToken` no corresponde al claim vigente (409, ver `DELIVERY_FAILURE_RECOVERY.md`). |
| `LINK_CODE_NOT_FOUND` / `_EXPIRED` / `_ALREADY_USED` | Estados del código de vinculación `/web link`. |
| `INVALID_SIGNATURE` | Firma de webhook inválida (nunca se procesa el pedido; en Tebex corresponde a `X-Signature`). |
| `INTERNAL_ERROR` | Cualquier fallo no clasificado (el mensaje nunca incluye detalles internos). |

El frontend puede mapear estos códigos a mensajes humanos sin parsear texto libre; los logs
quedan grepeables por código exacto.

## Qué NO se construyó (a propósito)

Dashboard de métricas propio, alertas por email/Slack, tracing distribuido - fuera de escala
para este proyecto ("sin servicios externos de pago", "no montar sistema enterprise"). Si el
proyecto creciera, Cloudflare Analytics (incluido gratis, ya activo por defecto en cualquier
Worker/Pages) ya cubre gráficas de tráfico/errores sin ninguna integración adicional.
