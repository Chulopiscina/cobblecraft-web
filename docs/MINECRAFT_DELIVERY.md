# Entrega automática en Minecraft

## Componente: `StoreDeliveryService` (`mods-source/progression_core`)

Vive dentro del mod propio `progression_core`, no en la web. Archivos nuevos (Web Oficial V1,
2026-08-25), bajo `mods-source/progression_core/src/main/kotlin/com/cobblemonserver/progression/store/`:

- `StoreDeliveryConfig.kt` - config (`store-delivery.properties`), `enabled=false` por defecto.
- `StoreApiClient.kt` - cliente HTTP asíncrono (`java.net.http.HttpClient`, JDK 21, sin
  dependencia nueva) hacia el Worker.
- `StoreCatalogConfig.kt` - **whitelist local** `productId -> DeliveryAction`.
- `DeliveryAction.kt` - qué significa realmente cada tipo de entrega (RANK/CUSTOM_ITEM/COSMETIC/
  CURRENCY/BUNDLE).
- `StoreDeliveryService.kt` - orquestador del ciclo completo.
- `json/MiniJson.kt` - parser/escritor JSON propio y minimo (ver nota abajo).
- `commands/WebLinkCommands.kt` - `/web link <codigo>`.

## Por qué la web nunca puede ejecutar un comando arbitrario

El Worker (`GET /api/delivery/pending`) devuelve **solo** `orderId`, `productId`, `playerUuid`,
`playerName` - nunca una instrucción de entrega. `StoreCatalogConfig` (Kotlin, vive en el propio
mod, se despliega solo cuando el admin del servidor lo decide) es quien traduce `productId` a un
`DeliveryAction` real. Un `productId` que no exista en `StoreCatalogConfig` simplemente nunca se
entrega (se libera el claim y se reintenta indefinidamente, con un aviso claro en logs) - la web
no tiene ningún mecanismo para forzar una entrega no reconocida.

**Mantener sincronizado a mano** `StoreCatalogConfig.kt` con `web/store/catalog.json` cada vez que
se publique un producto real - un test (`StoreCatalogConfigTest`) verifica automáticamente que
todo producto `active` del catálogo web real tiene mapping local, y falla el build si no.

## Ciclo de entrega

```
cada `poll_interval_ticks` (900 ticks / 45s por defecto):
  1. GET /api/delivery/pending          (async, nunca bloquea el hilo principal)
  2. por cada pedido:
     a. ¿ya esta en processed_ops localmente? -> solo reenviar ACK (reconciliacion), no repetir entrega
     b. POST /api/delivery/claim         (atomico - ver STORE_ARCHITECTURE.md)
     c. si CLAIMED: resolver productId via StoreCatalogConfig
        - desconocido -> POST ack "failed" (libera el claim, log de error, reintenta despues)
        - conocido -> server.execute { entregar en el hilo principal }
     d. tras entregar: marcar processed_ops("store_order:<orderId>"), luego POST ack "delivered"
```

## Por qué es seguro contra bloqueos del hilo principal

Todo el HTTP (`StoreApiClient`, `java.net.http.HttpClient.sendAsync`) corre en los hilos internos
del propio `HttpClient` - el tick del servidor solo incrementa un contador y, cuando toca,
dispara la cadena async (`triggerPollCycle`). El ÚNICO punto que vuelve a tocar el hilo principal
es `server.execute { ... }`, justo antes de tocar inventario/LuckPerms - exactamente el mismo
patrón (`MinecraftServer#execute`) que Fabric/vanilla usan internamente para reencolar trabajo en
el hilo del servidor desde otro hilo. Un `AtomicBoolean` evita que dos ciclos de polling se
solapen si una respuesta HTTP tarda más que el intervalo configurado.

## Entrega por tipo

- **RANK**: `server.commands.performPrefixedCommand(server.createCommandSourceStack(), "lp user
  <uuid> parent add <rankId>")` (o `parent addtemp <rankId> <Nd> accumulate` si hay
  `durationDays`). Se usa el **UUID**, nunca el username (autoridad final de identidad, Parte C) -
  LuckPerms acepta UUID directamente. Por qué comando y no la API de LuckPerms: no hay
  dependencia de LuckPerms en el classpath de este mod (investigado antes de escribir código) y
  el propio `CLAUDE.md` ya documenta que LuckPerms no responde por RCON/consola pero SÍ ejecuta
  el comando igualmente - mismo mecanismo ya usado en producción.
- **CUSTOM_ITEM / COSMETIC**: `CustomItemRegistry.get(customItemId)` + `CustomItemFactory.create`
  (identidad real, nunca un vanilla renombrado). Si el jugador está online y tiene hueco
  (`InventoryItems.giveOrFalse`), entrega directa; si no, `MailboxService.deliver` (nunca se
  tira al suelo, nunca se pierde).
- **CURRENCY**: DESACTIVADO en V1 (pedido explícito) - si algún día se activa un producto de este
  tipo por error, `StoreDeliveryService` lo rechaza con un log de error, nunca falla en silencio
  concediendo dinero sin control.
- **BUNDLE**: aplica cada sub-entrega (best-effort, un fallo puntual en una sub-entrega se
  registra y no impide las demás - mismo criterio pragmático que `RewardService.grant` ya usa en
  este mod para recompensas de objetivos).

## Exactamente-una-vez

Clave de operación: `"store_order:<orderId>"` en la tabla `processed_ops` (ya existente desde la
Fase 5, reutilizada aquí - nunca se creó una tabla nueva). Mismo patrón `isProcessed`/
`markProcessed` que ya usan `RewardService`/`SlayerRewardDelivery`/`LeagueBadgeDelivery`. Si el
ACK se pierde tras una entrega ya completada, el pedido puede reaparecer en `pending` (el Worker
libera el claim tras su timeout) - el servicio detecta que el op ya está procesado localmente y
**solo reenvía el ACK**, nunca repite la entrega.

## `/web link <codigo>`

Comando de jugador (nunca consola - no tendría sentido). Llama a
`POST /api/link/confirm` con el UUID/nombre REALES de quien ejecutó el comando (`ctx.source.player`,
nunca inventado por la web). El comando responde de forma asíncrona (mensaje "Verificando
código..." inmediato, luego el resultado real cuando llega la respuesta HTTP) para no bloquear al
jugador ni al hilo del servidor.

## Sobre `MiniJson`

No se añadió Gson/kotlinx.serialization como dependencia nueva del Gradle module: Gson está
presente transitivamente en el classpath de Loom mediante Minecraft, pero nunca se había usado en
este mod y no estaba verificado que compilase de forma estable. Se escribió un parser/escritor
JSON propio, pequeño y con tests reales (`MiniJsonTest`, 12 tests) cubriendo exactamente el
subconjunto de JSON que las respuestas del Worker usan (objetos, arrays, strings con escapes,
números, booleanos, null - incluyendo el caso anidado de un `BUNDLE`).

## Configuración real (servidor)

`server/config/progression_core/store-delivery.properties` (autogenerado la primera vez,
`enabled=false` por defecto - nunca se reescribe solo, hay que editarlo a mano tras desplegar el
Worker real):

```properties
enabled=true
api_base_url=https://<tu-worker>.workers.dev
server_token=<el MISMO valor que STORE_SERVER_TOKEN del Worker>
poll_interval_ticks=900
request_timeout_seconds=8
```

`server_token` debe ser exactamente el mismo secreto configurado en el Worker
(`wrangler secret put STORE_SERVER_TOKEN`, ver CLOUDFLARE_DEPLOY.md) - es un secreto compartido
copiado a mano una vez, nunca transmitido por otro canal.
