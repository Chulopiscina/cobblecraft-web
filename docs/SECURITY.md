# Seguridad

## Autoridad del precio: siempre el servidor

El frontend envía únicamente `productId` + `playerName` a `POST /api/orders`. El precio, la
moneda y la propia existencia/disponibilidad del producto se leen SIEMPRE de
`web/store/catalog.json` server-side (`getAuthoritativeProduct`, `lib/catalog.ts`) - un campo
`priceCents` añadido al body de la petición se ignora por completo (test:
`routes.test.ts` → "ignores any price the client tries to send").

## Validación de entrada

Zod en cada endpoint que acepta un body (`web/worker/src/routes/*.ts`) - nunca se parsea JSON a
mano ni se confía en la forma del payload. `productId` se valida contra la whitelist real del
catálogo (nunca un ID arbitrario). `playerName` se valida con el patrón real de un username de
Minecraft Java (`^[A-Za-z0-9_]{3,16}$`) antes de tocar la red. UUIDs se validan con
`isValidUuid` (`lib/ids.ts`) antes de guardarse o compararse.

## SQL

Solo sentencias preparadas de D1 (`.prepare(sql).bind(...)`) en todo `web/worker/src/lib/`.
Ninguna concatenación de SQL con datos de usuario en ningún punto del código.

## CORS

`corsHeaders()` (`lib/security.ts`) refleja el origen configurado (`CORS_ALLOWED_ORIGIN`) SOLO si
coincide exactamente - nunca `Access-Control-Allow-Origin: *`, nunca un eco del header `Origin`
recibido sin comparar. Test: `security.test.ts`.

## Cabeceras de seguridad

El Worker solo sirve JSON (nunca HTML), así que `securityHeaders()` aplica una CSP restrictiva
(`default-src 'none'; frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` en toda respuesta.

## Rate limiting

Bucket de ventana fija en memoria por `(ruta, IP)` (`rateLimit()`, `lib/security.ts`) - documentado
como "se reinicia si el Worker recicla la instancia", aceptado explícitamente para V1 ("no montar
un sistema enterprise"). Barrido oportunista de entradas expiradas cuando el mapa supera 500
entradas (Production Hardening V1, Fase A - antes crecía sin límite). Aplicado a: `POST
/api/orders` (8/min), `POST /api/link/start` (10/min), `GET /api/link/status/:code` (20/min),
`POST /api/link/confirm` (60/min, además del Bearer token ya exigido), `POST
/api/payments/mock/simulate` (20/min, solo DEV). **Nunca** aplicado a `/api/delivery/*` (Fase I -
"no bloquear la Delivery API legítima", ya protegida por Bearer token). Verificado bajo carga
concurrente real, no solo en tests unitarios - ver `LOAD_TEST_V1.md`.

## Secretos

- Nunca se commitea ningún secreto real - `.dev.vars`/`.env` están gitignored,
  `.dev.vars.example`/`.env.example` solo contienen placeholders documentados.
- `redactSecret()` (`lib/security.ts`) - cualquier log que pudiera incluir un token nunca imprime
  el valor completo.
- El frontend nunca recibe ni un solo secreto - `PUBLIC_API_BASE_URL`/`PUBLIC_STORE_ENV` son las
  ÚNICAS variables expuestas al navegador (por diseño de Astro, solo las prefijadas `PUBLIC_` se
  incluyen en el bundle).

## Autenticación Worker <-> Minecraft

`Authorization: Bearer <STORE_SERVER_TOKEN>`, comparado con `timingSafeEqual` (`lib/security.ts`
- comparación en tiempo constante, evita timing attacks triviales) en `requireServerAuth`
(`routes/delivery.ts`), reutilizado por `routes/link.ts`. Sin este header válido: 401 en todos
los endpoints `/api/delivery/*` y `/api/link/confirm`.

**Claim lease (Production Hardening V1, Fase B)**: cada `POST /api/delivery/claim` exitoso
genera un `claim_token` nuevo (migración `0002_claim_lease.sql`); `POST /api/delivery/ack` lo
exige y rechaza (`STALE_CLAIM`, 409) un token que ya no corresponde al claim vigente - defensa en
profundidad adicional sobre la protección real (`processed_ops` en progression_core). Ver
`DELIVERY_FAILURE_RECOVERY.md` para el protocolo completo.

## Webhooks de pago

Firma verificada SIEMPRE server-side (`PaymentProvider.verifyWebhook`) antes de tocar cualquier
pedido - nunca se confía en el contenido de un POST no firmado. `processed_webhooks(provider,
event_id)` impide procesar el mismo evento dos veces (replay). **Reforzado esta sesión**: la
comparación de la firma HMAC (Mock, Stripe y Tebex) usa `timingSafeEqual` (antes era `!==`/`===`
normal, un canal de temporización teórico); la firma de Stripe además exige que el `timestamp` de la
cabecera esté dentro de una ventana de 5 minutos (`WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`); un
cuerpo JSON malformado tras una firma válida se trata como firma inválida en vez de lanzar una
excepción no controlada. Ver `PRODUCTION_SECURITY_AUDIT_V1.md` para el detalle completo.

## MockPaymentProvider nunca en producción

`createPaymentProvider()` (`lib/payment/factory.ts`) lanza una excepción en el arranque del
Worker si `ENVIRONMENT=production` y `PAYMENT_PROVIDER=mock` - imposible desplegar
accidentalmente con pagos simulados activos. Test: `payment-factory.test.ts`.

## Identificación de jugador

Nunca se pide ni se almacena una contraseña de Microsoft/Mojang. La identidad se resuelve vía la
API pública de Mojang (username → UUID real) o, de forma más segura, vía el código de vinculación
`/web link` confirmado DENTRO del juego por el propio servidor Minecraft (nunca por la web). La
entrega usa siempre el UUID, nunca el username (que es mutable).

## Qué NO se construyó (a propósito)

Formulario de tarjeta propio, almacenamiento de datos de pago, cuentas web con contraseña,
ejecución de comandos Minecraft arbitrarios desde el Worker, y ningún endpoint que permita a un
cliente auto-marcar un pedido como pagado.
