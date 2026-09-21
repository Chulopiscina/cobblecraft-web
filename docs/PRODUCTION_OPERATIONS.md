# Operaciones de produccion

## Alcance y estado seguro

Esta guia cubre bot Windows, Pages, Worker y D1. No autoriza cambios en gameplay,
mods, mundos, playerdata o DB de Minecraft. Los pagos reales permanecen desactivados.
El bot requiere que este PC permanezca encendido; el autostart no es alojamiento 24/7.

## Bot y PebbleHost

Desde `discord-bot`: `npm run check`, `npm test`, `npm run build`, `npm start`.
Consultar `npm run status`; detener con `npm stop` antes de arrancar de nuevo.
Comprobar propiedad de los PID de `run/` antes de detener un proceso antiguo.
Logs en `logs/bot.out.log` y `logs/bot.err.log`; no publicar los archivos sin revisar/redactar.

En `.env` ignorado: `MINECRAFT_ENV=PROD`, host `194.213.3.150`, puerto `25602`.
DEV usa `MINECRAFT_ENV=DEV` y host/puerto DEV; nunca enviar heartbeat DEV al Worker PROD.
`PEBBLE_SERVER_ID=4eef347d` es el identificador confirmado en el panel, no el ID numerico de facturacion.
`PEBBLE_API_KEY` sigue pendiente: obtenerla en https://panel.pebblehost.com/account/api
y guardarla solo en `discord-bot/.env`. Usar los menores permisos disponibles y limitar IP
si la IP del bot es estable. La generacion de una credencial nueva requiere aprobacion del propietario.

La API oficial se consulta por HTTPS/Bearer, GET exclusivamente, sin redirects, con timeout y backoff.
Primero se verifica identifier/UUID y asignacion IP:puerto. Solo se leen detalles,
resources y `/run/discord-bridge/status.json` / `events.ndjson` mediante API.
Nunca se abre `/home/container` desde Windows, ni se envian comandos de consola.
Una denegacion de resources no bloquea un permiso valido de lectura del bridge.
Referencia oficial: https://api.pebblehost.com/ (esquema `/api.yaml`).

Sin API key el ping Minecraft real sigue funcionando: online, conteo, version y latencia.
TPS, uptime y lista completa solo se publican con bridge reciente y valido; no se inventan.
World Boss no se exporta en el contrato actual; no se modifica progression_core para obtenerlo.

## Tebex y bloqueo de pagos

Falta `TEBEX_PRIVATE_KEY`, secret del Worker `cobblemon-server-store`.
Obtener/generar con aprobacion en https://creator.tebex.io/developers/api-keys.
Desde `web/worker`: `npx --no-install wrangler secret put TEBEX_PRIVATE_KEY --name cobblemon-server-store`.
Pegarla solo en la entrada interactiva; nunca en argumentos, Git, chat o capturas.
Public token, webhook secret y delivery token existentes no se rotan ni se sustituyen sin necesidad.

Tebex no proporciona un sandbox aislado: Test Mode agrega Test Payments a la tienda real.
Se configura en https://creator.tebex.io/payment-methods/settings.
Referencia: https://docs.tebex.io/developers/headless-api/testing.
La Private Key concede acceso amplio a la cuenta: https://docs.tebex.io/developers/headless-api/authorization.

No activar `TEBEX_CHECKOUT_ENABLED=true` para probar a ciegas. Primero credenciales,
productos/precios/UUID, checkout en Test Mode, webhook, entrega, duplicados, offline y reinicio.
Mantener acceso publico bloqueado durante la prueba y no pagar con un medio real.
La autorizacion de esta tarea NO permite habilitar pagos reales al finalizar.
Tras QA y autorizacion expresa, cambiar la variable y desplegar el Worker.
Para desactivar rapidamente: fijar `TEBEX_CHECKOUT_ENABLED=false` en `worker/wrangler.toml`
y desplegar `npx --no-install wrangler deploy --name cobblemon-server-store` desde `web/worker`.
No usar `--env production`: es otro nombre/despliegue sin los secrets del Worker actual.
No detener webhook/entregas de pedidos ya pagados al cerrar checkout.

| Producto web | Producto Tebex esperado | Package ID | Precio | Moneda | Entrega esperada |
| --- | --- | --- | --- | --- | --- |
| rank_explorer | Explorador | 7664019 | 14,99 | EUR | rango explorer permanente |
| rank_master | Maestro | 7664024 | 29,99 | EUR | rango master permanente |
| rank_legend | Leyenda | 7664026 | 49,99 | EUR | rango legend permanente |

Mapeo local y panel autenticado de Tebex cotejados el 21/09/2026: nombres, IDs y precios coinciden.
Test Payment y entrega real pendientes; compras bloqueadas. El panel todavia muestra
`Submit for Review`: la revision de la tienda debe resolverse antes de abrir pagos reales.
No hay upgrades ni nuevos productos. No conceder un rango manualmente para simular exito.

## Diagnostico y pedidos

Desde la raiz: `node web/scripts/production-health.mjs`.
Detalle privado: `node web/scripts/production-health.mjs --json`.
Pedido: `node web/scripts/production-health.mjs --order ord_REFERENCIA_REAL`.
La referencia valida tiene 20 caracteres despues de `ord_`.
`OPERATIONS_TOKEN` es independiente de los tokens delivery/heartbeat, solo permite lectura.
Esta configurado como secret y en `web/.wrangler/operations.env` ignorado. No compartir su contenido.
Reconfiguracion controlada: `node web/scripts/production-health.mjs --configure`.
No pasar secretos en URL. Diagnostico: `/api/admin/diagnostics` con Bearer, sin cache.

El resumen distingue ausencia de credenciales, datos caducados y servicios verificados.
El heartbeat del bot caduca a los 90 segundos. Un PC desconectado implica estado no verificable,
no una prueba de crash del servidor. La pagina publica no expone diagnosticos privados.

Para un fallo: cerrar checkout si afecta a pagos; consultar pedido y eventos; conservar transaction ID,
event ID, UUID, package, fechas y lease. Nunca borrar/recrear pedidos ni modificar estados a mano.
PAID espera al consumidor Minecraft. CLAIMED conserva lease de 120s; tras caducar puede reclamarse.
ACK exige claim token correcto; update y evento se guardan atomicamente. Registrar fallo no consume pago.
El consumidor Minecraft debe deduplicar persistentemente por pedido al recuperar despues de conceder
el rango pero antes del ACK. Este requisito no se da por validado con tests del Worker: falta QA real.
No forzar reentrega de CLAIMED sin verificar primero el resultado en Minecraft.

Reembolso antes de entrega bloquea el pedido incluso si llega antes del pago.
Si ya estaba CLAIMED/DELIVERED: REFUNDED + `review_required=1`; no retirar rangos automaticamente.
Chargeback/disputa queda con event type y transaction ID. Revisar en Tebex y resolver manualmente
con evidencia del estado real, sin inventar reintentos ni conceder dos veces.
No se guardan tarjetas, CVV ni datos bancarios en los nuevos registros de auditoria.

## Publicacion y recuperacion

Worker: tests/build, backup D1, migracion aditiva, deploy, health autenticado y publico.
Backup local previo a 0006: `.wrangler/operations-backups/before-0006-20260921.sql` (privado).
No restaurar un backup antiguo encima de pedidos nuevos; recuperar mediante migracion correctiva.
Pages conserva el snapshot PROD y cambia solo tienda/estado/assets necesarios:
`node web/scripts/deploy-store-prod.mjs --prepare` y despues `--deploy`.
Requiere commit explicito y push main. Nunca `git add .`; no publicar el build completo de un arbol sucio.
El script aborta si PROD cambio o un archivo ajeno pierde su hash.

Auditoria local de secretos (sin imprimir valores): `node web/scripts/audit-secrets.mjs`.
Si detecta uno, detener publicacion y rotarlo; borrar del ultimo archivo no revoca una filtracion historica.

## QA pendiente que requiere credenciales o coordinacion

No reiniciar ni apagar PebbleHost para simular fallos en esta tanda.
Probar con ventana autorizada: entrega real online/offline, reinicio tras concesion y antes del ACK,
webhook duplicado de Tebex Test Payments, refund/dispute real de prueba y restricciones con usuario no admin.
Las pruebas SQLite/HMAC locales son integracion, no sustituyen esas comprobaciones en produccion.
