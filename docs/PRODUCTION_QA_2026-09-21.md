# Cierre de operaciones: Discord, Tebex, web y diagnostico

Fecha: 21/09/2026. Estado: despliegue web/Worker/bot realizado; pagos y bridge API bloqueados
por credenciales y QA real pendiente. No es una certificacion de compras end-to-end.
No se modifico gameplay, progression_core, mods, mundos, playerdata ni DB Minecraft.
No se reinicio ni detuvo PebbleHost. Se conservaron cambios concurrentes ajenos.

## Discord

1. **Inicial:** bot apuntaba a PROD por SLP, bridge sin API key; faltaba verificar el servidor API,
   diagnostico consolidado, embeds claros y backoff por endpoint.
2. **Cambios:** cliente Pebble oficial GET, validacion de identidad/asignacion, recursos opcionales,
   timeout, backoff independiente, estado honesto, telemetria autenticada y logs redactados.
3. **PebbleHost:** panel real confirma identifier `4eef347d`, IP `194.213.3.150:25602`.
   Account API confirma que no hay claves. Codigo listo, transporte remoto NO validado con API real.
4. **Disponible:** ping de produccion, online, conteo, version Minecraft 1.21.1 y latencia medida.
   Se observaron 1/20 y despues 0/20 jugadores en momentos distintos, no valores constantes.
5. **No disponible:** nombres completos, Cobblemon runtime version, TPS, uptime y eventos sin bridge.
   World Boss no existe en el contrato actual; no se invento ni se modifico el mod.
6. **/estado:** slash real en canal STAFF, respuesta COBBLECRAFT, online, 1/20, 1.21.1, 201 ms.
   No se muestran placeholders N/D ni metricas derivadas de configuracion no verificadas.
7. **/jugadores:** slash real; 1/20 y aviso de que la fuente no ofrece lista completa. No nombres inventados.
8. **Slash reales:** ejecutados `/estado`, `/jugadores`, `/ayuda`, `/campaign stats`; respuestas verificadas.
   Los nueve comandos estan registrados en Discord. NO se ejecutaron `/setup`, `/novedad`,
   `/publicar_novedades`, `/sugerencia`, `/bug` durante este QA para no reconfigurar el servidor
   ni publicar contenido ficticio. Esos cinco flujos siguen pendientes de QA de interaccion completa.
9. **Permisos:** API Discord confirma Administrator para setup/campaign/novedad/publicar_novedades;
   los handlers tambien comprueban owner/admin. STAFF y todos sus canales niegan ViewChannel a everyone;
   permisos explicitos de lectura solo bot/Administrador/Moderador. No hubo prueba negativa con otra cuenta.
10. **Reconexion:** bot reiniciado y reconectado realmente; watchdog activo. En una reanudacion
    los PID habian caducado y ambos procesos estaban ausentes, sin error en logs que explique la causa.
    Se arranco de nuevo y el heartbeat se recupero. No afirmar disponibilidad 24/7 de un PC local.
11. **Tests:** 13/13; API key invalida, asignacion equivocada, archivos GET allowlisted, backoff acotado,
    resources denegado sin bloquear bridge, fuentes stale/futuras y TCP real sin respuesta con timeout.
12. **QA real:** login Discord, comandos citados, lectura de permisos, bot/heartbeat y SLP PROD.
    Reinicio PebbleHost, corte de Internet y secuencias de apagado/encendido solo simulados;
    no se interrumpio produccion para probarlos. Autostart por acceso directo existente, no servicio remoto.

## Tebex

13. **Inicial:** checkout desactivado, falta Private Key; 29 pedidos historicos FAILED, sin paid_at/delivered_at.
    No se borraron ni se reinterpretaron como compras. No se observaron pedidos PAID/DELIVERED reales.
14. **Private key:** pendiente; panel Developers API Keys ofrece Generate, no una clave existente.
    Se solicito confirmacion especifica para crear ese acceso amplio; no se genero sin respuesta explicita.
15. **Test Payment:** NO realizado. Documentacion oficial: Test Mode en la tienda real, no sandbox aislado.
    No se hicieron cargos reales ni se activo Test Mode/public checkout a ciegas.
16. **Checkout:** respuesta publica 409 mientras esta cerrado, sin crear pedido nuevo; configuracion false.
    Panel confirma paquetes y precios. `Submit for Review` sigue visible: falta revision antes de apertura.
17. **Webhook:** firma HMAC real comprobada en integracion; evento/pago/UUID/producto/importe se validan.
    En PROD no se registra todavia un payment.completed autenticado de prueba en processed_webhooks.
18. **D1:** backup antes de migrar; 0006 agrega intentos, revision, reversals y service_health, sin reset.
    D1 real accesible despues del despliegue. Se mantienen los 29 pedidos historicos, todos FAILED.
19. **Idempotencia:** pruebas con cinco entregas del mismo webhook firmado producen un PAID, un claim
    vigente y un ACK efectivo; update+audit transaccionales. ACK incorrecto ya no simula entrega exitosa.
20. **Jugador offline:** pedido pagado persiste en la cola de integracion; no se ha comprobado la concesion
    offline por el consumidor Minecraft real. No confundir cola persistente con entrega end-to-end.
21. **Minecraft offline:** webhook/D1 independientes del servidor, lease expira para reintentar;
    secuencia probada con ausencia simulada del consumidor, no apagando PebbleHost.
22. **Reinicio durante entrega:** SQLite fisico cerrado/reabierto y fallo transaccional del ACK probados.
    Falta probar el caso real de concesion Minecraft seguida de crash antes del ACK; requiere dedup persistente alli.
23. **Entrega real:** NO verificada; diagnostico no observa polling autenticado de delivery desde Minecraft.
    No se envio un polling usando otra credencial para fabricar una senal de consumidor sano.
24. **Rango entregado:** ninguno por esta tarea. El mapeo esperado figura abajo; no se concedio un rango de prueba manual.
25. **Reembolso:** persiste incluso antes de payment.completed; bloquea entrega. Si CLAIMED/DELIVERED,
    marca revision y conserva el historial/fecha de entrega, sin retirada automatica del rango.
26. **Disputa:** se conserva event type y transaction ID; dispute.opened/lost y duplicados cubiertos
    en integracion. No se abrio una disputa financiera real.
27. **Pendiente:** key, Test Mode controlado, checkout real de prueba, webhook, consumidor, entrega,
    offline/crash/duplicados reales y revision de tienda. Pagos reales siguen cerrados.

| Producto web | Tebex cotejado en panel | Package ID | Precio | Moneda | Entrega esperada | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| rank_explorer | Explorador | 7664019 | 14,99 | EUR | explorer permanente | Mapeo OK; pago/entrega pendientes |
| rank_master | Maestro | 7664024 | 29,99 | EUR | master permanente | Mapeo OK; pago/entrega pendientes |
| rank_legend | Leyenda | 7664026 | 49,99 | EUR | legend permanente | Mapeo OK; pago/entrega pendientes |

## Web

28. **Tienda:** mantiene tres rangos y contenido existente, incorpora estado vivo; ningun upgrade nuevo.
29. **Exito:** consulta estado real del pedido; no interpreta volver de Tebex como prueba de pago.
    Muestra jugador, producto, fecha, referencia y entrega; probado con un FAILED historico de solo lectura.
30. **Cancelacion:** pagina separada, sin mutar pedido. No garantiza ausencia de cargo solo por visitar una URL.
    Sin referencia valida muestra error identificable; con pendiente permite volver al checkout.
31. **Estado de pedido:** referencia opaca de 20 caracteres, rate limit, no-store, sin UUID ni claim token publico.
    Polling limitado con timeout; estados pendientes, entregados, fallo y revision cubiertos por tests.
32. **Estado publico:** `/estado/` y banda en tienda; online verde, offline/sin respuesta rojo, pagos cerrados amarillo.
    TTL 90s, sin datos inventados. Tambien se observo expiracion real al estar el bot detenido y recuperacion al arrancarlo.
33. **Diagnostico:** GET `/api/admin/diagnostics`, Bearer OPERATIONS_TOKEN independiente y solo lectura.
    Sin auth devuelve 401; ese token NO autoriza heartbeat ni delivery (401 reales).
34. **Responsive:** estado, tienda, gracias y cancelado comprobados a 320/390/768/1440, sin overflow horizontal.
    Header recortaba a 768: breakpoint corregido a 1100; screenshots y DOM revisados. Logos cargan.
    No se redisenaron secciones ajenas ni se publico el build completo del arbol sucio.
35. **URLs:** todas las siete paginas gestionadas respondieron 200 y hash esperado tras deploy:
    https://cobblemon-server-site.pages.dev/tienda/
    https://cobblemon-server-site.pages.dev/tienda/rango-explorador/
    https://cobblemon-server-site.pages.dev/tienda/rango-maestro/
    https://cobblemon-server-site.pages.dev/tienda/rango-leyenda/
    https://cobblemon-server-site.pages.dev/tienda/gracias/
    https://cobblemon-server-site.pages.dev/tienda/cancelado/
    https://cobblemon-server-site.pages.dev/estado/

## Seguridad

36. **Auditoria:** scripts/audit-secrets.mjs reviso texto rastreado e historial de ambos repositorios,
    patrones de credenciales y coincidencias exactas con secretos locales, sin imprimir valores.
    Ultima pasada previa a commits: root 3508 textos/6061 blobs; web 186 textos/245 blobs; 0 archivos grandes omitidos.
    No sustituye un analizador exhaustivo de cualquier formato binario/proveedor desconocido.
37. **Secrets pendientes:** PEBBLE_API_KEY y TEBEX_PRIVATE_KEY. OPERATIONS_TOKEN creado separadamente,
    guardado en secret Worker y archivo ignorado `.wrangler/operations.env`.
38. **Expuestos encontrados:** ninguna coincidencia de los detectores empleados; no se afirma ausencia absoluta.
39. **Rotaciones:** ninguna filtracion identificada que justifique rotacion en esta tanda. No se reescribio historial.
40. **Webhooks:** firma sobre cuerpo original, dedup durable, validacion de destinatario/paquete/importe;
    secret y tokens nunca enviados al frontend. No se aceptan pedidos pagados por una pagina de exito.

## Produccion

41. **Commits:** root `da7f903` (bot); web `26b6d58` (operaciones) y `eb916b2` (responsive), push main realizado.
    El informe y guia se versionan aparte. Ningun archivo gameplay, launcher o vote.test ajeno incluido.
42. **Pages:** deployments propios `d8817709` y final `86a8aadb`, Direct Upload preservando snapshot ajeno por hashes.
    Posteriormente otra tarea publico cliente `e627299` / deployment `e8efa54f`; NO se revirtio.
    QA publico final se realizo tambien sobre ese despliegue posterior y conserva nuestras paginas.
43. **Worker:** `6086f5b8-1e72-4324-9383-29de4401e361`, cobblemon-server-store; version y entorno reales en diagnostico.
44. **Migracion:** 0006_operations.sql aplicada en D1 PROD. Backup privado:
    `.wrangler/operations-backups/before-0006-20260921.sql`, SHA256
    `0FD57FAA59D5C499E49B0DC3F1BFED630A274D203EBE2E79C8A0293A7167E90C`.
45. **Ultimo estado:** WEB/Worker/D1 OK, Minecraft ONLINE, Discord ONLINE; API Pebble sin key,
    Tebex sin credenciales completas/checkout cerrado, delivery sin polling observado. Estado puntual, no SLA.
46. **Health:** `node web/scripts/production-health.mjs`; detalle `--json`; trazabilidad `--order ord_...`.
    Publico: `/api/server/status` y `/api/store/status` en el Worker. No se programaron acciones periodicas externas.

## Pendiente para el propietario

47. **Variables exactas:** `PEBBLE_API_KEY` y `TEBEX_PRIVATE_KEY`. No compartirlas por chat.
48. **Origen:** Pebble Account API, https://panel.pebblehost.com/account/api;
    Tebex Developers/API keys, https://creator.tebex.io/developers/api-keys.
49. **Destino:** Pebble en `discord-bot/.env` ignorado; Tebex en Worker mediante
    `npx --no-install wrangler secret put TEBEX_PRIVATE_KEY --name cobblemon-server-store`
    desde `web/worker`. Ambos son secretos, nunca PUBLIC_* ni repositorio.
50. **Accion necesaria:** confirmar expresamente creacion de claves con acceso amplio (solicitudes pendientes)
    o configurarlas directamente; despues completar Test Payments y QA coordinado de entrega/reinicio.
    Tramitar revision Tebex antes de autorizar cobros reales. Usuario normal real para QA de permisos.
51. **No verificado:** API Pebble real/archivos remotos, cinco comandos con efectos publicos/configuracion,
    bloqueo con cuenta no admin, Test Payment, entrega/rango real, crash Minecraft y refund/dispute reales.
    Las suites (bot 13, Worker 175, web 11), check/build y typecheck pasan; no se presentan como QA E2E.

## Causas tecnicas corregidas

- ACK no-CLAIMED devolvia falsamente ALREADY_DELIVERED; ahora exige estado/lease correcto.
- Fallos y ACK no tenian trazabilidad atomica ni conteo de intentos; ahora claim/ack y auditoria comparten transaccion.
- Reversal previo al pago podia perderse; ahora existe registro durable que bloquea el payment.completed posterior.
- Refund tras concesion no diferenciaba revision administrativa; ahora conserva evidencia y review_required.
- Telemetria incompleta/contadores cero falsos y consultas API sin verificar asignacion: corregidos con TTL, null y validacion.
- Header de escritorio activado a 761px no cabia; menu movil hasta 1100px en las paginas publicadas.

## Referencias oficiales

- PebbleHost API: https://api.pebblehost.com/
- Tebex Test Payments: https://docs.tebex.io/developers/headless-api/testing
- Tebex autorizacion: https://docs.tebex.io/developers/headless-api/authorization
- Tebex webhooks: https://docs.tebex.io/developers/webhooks/overview

Guia de uso y recuperacion: [PRODUCTION_OPERATIONS.md](PRODUCTION_OPERATIONS.md).
