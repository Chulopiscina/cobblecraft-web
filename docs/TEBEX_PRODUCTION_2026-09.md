# Tienda Tebex y Discord PROD

## Estado y activacion

Worker real: `cobblemon-server-store` (entorno predeterminado de wrangler.toml).
No usar `--env production`: crea otro nombre si no hay name explicito en ese perfil.
La tienda permanece cerrada hasta disponer de credenciales y validar entrega real.
GET `/api/store/status` publica solo `checkoutAvailable`, nunca secretos.

En `web/worker`, `npx wrangler secret put TEBEX_PRIVATE_KEY --name cobblemon-server-store`
configura la **Private Key Headless** de Developers > API Keys del panel Tebex.
No es Game Server secret ni el secreto webhook. Public Token y Webhook Secret ya
estan configurados en Cloudflare; no se pueden recuperar mediante secret list.
No pegar secretos en Git, chat ni frontend. `.dev.vars` local esta ignorado.

Los tres paquetes existentes son 7664019 (Explorador, 14,99 EUR),
7664024 (Maestro, 29,99 EUR), 7664026 (Leyenda, 49,99 EUR).
Verificar en Tebex que identidad Minecraft, moneda y precios base coinciden.
No hay upgrades. `TEBEX_CHECKOUT_ENABLED=true` es la activacion explicita del
Worker, solo despues del QA de compra/entrega. Requiere tambien los tres secretos.
Un ID de paquete, por si solo, NO abre los pagos.

## Flujo y seguridad

Nombre confirmado por comprador -> perfil UUID Minecraft -> pedido persistido en
D1 -> basket Headless atribuido a username/IP reales y custom orderPublicId/UUID ->
un paquete whitelisted -> `links.checkout` HTTPS exclusivamente checkout.tebex.io.
No se almacenan tarjetas, CVV ni datos bancarios. No hay checkout propio.
Cancelar vuelve al producto con el ID opaco del pedido; reanudar consulta el mismo
basket por GET sin incrementar la cantidad ni crear otro pedido.

El retorno no marca PAID. Solo webhook HMAC-SHA256(SHA256(rawBody)) puede hacerlo.
Se exige payment.completed, identificador estable, transaccion, paquete, cantidad,
destinatario, UUID custom e importe base/moneda coincidentes. Promociones o precios
distintos requieren validar explicitamente esa politica antes de activarlos.
La transaccion D1 guarda pago/evento/deduplicacion juntos. Fallos hacen rollback y
permiten reintento; un evento o pago no puede producir dos pedidos pagados.
Reembolsos/disputas detienen pedidos no entregados; una entrega ya efectuada o en
vuelo necesita revision/revocacion manual. No hay comandos de revocacion remotos.

Webhook: https://cobblemon-server-store.cobblemon-server.workers.dev/api/webhook/tebex
Subscribir payment.completed, payment.refunded, payment.dispute.opened/lost.
La validacion oficial funciona sin la Private Key del checkout.

## Entrega Minecraft existente (no modificada)

El servidor hace polling saliente /api/delivery/pending, claim con lease y ACK.
progression_core usa whitelist local de rangos/UUID y processed_ops para reconciliar
ACK perdido tras reinicio. Confirmar en el panel real:
`/home/container/config/progression_core/store-delivery.properties` (ver ruta del
directorio de configuracion de progression_core en el runtime real): enabled=true,
api_base_url=URL del Worker, server_token=STORE_SERVER_TOKEN real compartido.
No se ha leido/configurado ese archivo de produccion, ni se ha reiniciado PebbleHost.
No ejecutar el servidor DEV con el token PROD de entrega.
Revisar tambien que Tebex no entregue los mismos rangos por un segundo plugin.
No se prepara ni sube ningun JAR.

## QA

Tests locales: HMAC invalida, evento incompleto, destinatario/precio/paquete erroneo,
repeticion, mismo pago para otro pedido, rollback D1, reembolso y paid tardio,
cancelacion/reanudacion GET, timeouts y redirecciones fuera de Tebex.
Falta con acceso privado: basket real, Test Payments y entrega LuckPerms en PebbleHost.
Tebex NO tiene sandbox aislado: Test Payments crea registros y webhooks reales.
No habilitarlo globalmente en tienda abierta ni hacer cargos reales para QA.

Documentacion oficial consultada:
- https://docs.tebex.io/developers/headless-api/authorization
- https://docs.tebex.io/developers/headless-api/guides/baskets/create-a-basket
- https://docs.tebex.io/developers/headless-api/testing
- https://docs.tebex.io/developers/webhooks/overview
