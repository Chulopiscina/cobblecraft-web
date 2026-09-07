# Sistema `/vote`

Flujo completo: jugador ejecuta `/vote` en Minecraft → recibe un enlace firmado → la web
(`/vote/[token]`) verifica el enlace y registra el voto → Minecraft consulta (polling saliente)
si tiene una recompensa pendiente y la entrega. Mismo principio de seguridad que la Tienda
(`MINECRAFT_DELIVERY.md`): **Cloudflare nunca tiene ninguna vía de entrada hacia el servidor de
Minecraft**, todo es HTTPS saliente iniciado por `progression_core`.

## Por qué NO es `/vote?player=Nombre`

Cualquiera podría cambiar la URL y votar "en nombre de" otro jugador, o falsear a quién se le
entrega la recompensa. En su lugar, Minecraft firma localmente un token opaco con HMAC-SHA256
(secreto compartido `VOTE_SIGNING_SECRET`, nunca en el frontend, nunca en git) que codifica
`uuid|playerName|issuedAt|expiresAt|nonce`. La web solo puede leer esos datos si la firma es
válida - nunca puede inventarlos.

## Componentes

**Minecraft** (`mods-source/progression_core/.../vote/`):
- `VoteConfig.kt` - config (`vote-config.properties`): `enabled`, `site_base_url`,
  `signing_secret`, `token_ttl_seconds` (600 = 10 min), `poll_interval_ticks` (900 = 45s), y (V2)
  `timezone`/`reset_hour`/`reset_minute` (deben coincidir EXACTAMENTE con
  `VOTE_TIMEZONE`/`VOTE_RESET_HOUR`/`VOTE_RESET_MINUTE` del Worker) +
  `reminders_enabled`/`first_reminder_minutes`/`reminder_interval_minutes`.
- `VotePeriod.kt` (V2) - `idFor(instant, zoneId, resetHour, resetMinute): String` (`YYYY-MM-DD`) -
  MISMA regla exacta que `lib/vote-period.ts` del Worker (`java.time`/`ZoneId`, maneja DST de
  forma nativa). Usado SOLO para anotar el período de un voto ya entregado
  (`VoteLocalStatusStore`) y decidir recordatorios - el Worker sigue siendo la única autoridad
  real para aceptar/rechazar un voto.
- `VoteLocalStatusStore.kt` (V2) - tabla local `vote_local_status` (1 fila por jugador:
  `vote_period_id` + `confirmed_at`) escrita SOLO tras una entrega real de la Llave de Voto -
  alimenta `VoteReminderService`/`VoteCommands` sin llamar al Worker en cada comprobación.
- `VoteReminderService.kt` (V2) - recordatorios en el chat SOLO a jugadores online que no hayan
  votado el período actual (ver sección "Recordatorios" más abajo).
- `VoteTokenSigner.kt` - Kotlin puro (JDK `javax.crypto.Mac`, cero dependencia nueva). Firma
  `payload = "uuid|playerName|issuedAt|expiresAt|nonce"`, token =
  `base64url(payload) + "." + hex(HMAC-SHA256(payload))`. **Responde al instante** - cero llamada
  de red para generar el enlace, el comando `/vote` nunca depende de que el Worker esté vivo.
- `VoteRewardConfig.kt` - Reward Provider (`vote-reward.properties`): `type=custom_item` con
  `custom_item_id=progression:crate_key/vote` (1x Llave de Voto) por defecto - una migración
  aditiva (`migrateDefaultToVoteKey`) upgradeó el antiguo default `type=none` sin tocar ningún
  archivo ya personalizado por un admin.
- `VoteRewardDeliveryService.kt` - mismo patrón EXACTO que `StoreDeliveryService` (poll → claim
  atómico → entregar en `server.execute {}` → `processed_ops` → ack), reutilizando el mismo
  `StoreApiClient`/`STORE_SERVER_TOKEN` que la Tienda. Tras una entrega real, anota el período en
  `VoteLocalStatusStore` usando `vote.votedAt` real (nunca "ahora").
- `commands/VoteCommands.kt` - `/vote`, jugador-only, envía un componente de chat clicable
  (`ClickEvent.OPEN_URL`) con el enlace real - o, si `VoteLocalStatusStore` ya confirma el período
  actual, un mensaje directo "ya has votado hoy" sin generar ningún enlace.
- `commands/VoteAdminCommands.kt` (V2) - `/progression vote status <player>` (solo lectura,
  conocimiento LOCAL) y `/progression vote qa reminder <player>` (vista previa del mensaje real,
  nunca modifica estado).

**Worker** (`web/worker/src/`):
- `lib/vote-period.ts` (V2) - `votePeriodId(ms, config)`/`nextVotePeriodResetAt(ms, config)` - la
  regla real de "1 voto por DÍA de CobbleCraft" (ventana GLOBAL diaria, timezone/hora de reset
  configurables vía `VOTE_TIMEZONE`/`VOTE_RESET_HOUR`/`VOTE_RESET_MINUTE`), usando solo
  `Intl.DateTimeFormat` (sin dependencias nuevas). Maneja DST (CET/CEST, días de 23h/25h)
  correctamente - ver `test/vote-period.test.ts`.
- `lib/vote-token.ts` - `verifyVoteToken(token, secret)`: recalcula el HMAC y compara en tiempo
  constante (`timingSafeEqual`). Nunca confía en el payload sin verificar la firma primero.
- `lib/votes.ts` - acceso a `vote_sessions` (anti-replay del nonce) y `votes` (persistencia
  durable del voto + ciclo de vida claim/ack de la recompensa, migraciones `0003_vote.sql` +
  `0004_vote_period.sql` - añade `vote_period_id` con índice ÚNICO `(player_uuid, vote_period_id)`,
  la autoridad REAL de "1 voto por período" a nivel de base de datos).
- `routes/vote.ts` - `GET /api/vote/status` (informativo), `POST /api/vote/submit` (autoritativo,
  idempotente), `GET|POST /api/vote/reward/{pending,claim,ack}` (Bearer-auth, solo Minecraft -
  reutiliza el mismo `STORE_SERVER_TOKEN` y `requireServerAuth` de `routes/delivery.ts`).

**Web** (`web/site/src/pages/vote.astro`): página estática ÚNICA (Astro `output: "static"` no
puede pre-renderizar una ruta por cada token generado en tiempo de ejecución - el token viaja
como query string, `/vote?token=...`, mismo patrón ya usado por `/tienda/gracias?order=...`) que
llama a la API del Worker desde el cliente en tiempo de carga - nunca contiene lógica de
verificación/secretos, es solo la UI. Sin `?token=`, la página muestra el explicador ("escribe
/vote dentro del servidor").

## Ciclo de voto

```
1. Jugador ejecuta /vote
2. Minecraft firma el token LOCALMENTE (sin red) y responde con el enlace clicable
3. Jugador hace click -> abre <site>/vote?token=<token>
4. La página llama GET /api/vote/status?token=... -> el Worker verifica firma+expiración+período
   -> "ready" | "expired" | "invalid" | "already_voted" | "used"
5. Si "ready", el jugador pulsa "VOTAR POR COBBLECRAFT" -> POST /api/vote/submit
   -> el Worker RE-VERIFICA todo desde cero (nunca confía en el status previo), canjea el nonce
      de forma atómica (UPDATE condicional - gana la carrera en doble click/refresh/concurrencia)
      y registra el voto en `votes` (reward_status = 'pending')
6. La página muestra "¡Gracias por apoyar CobbleCraft!"
```

## Ciclo de recompensa (idéntico en espíritu a la Tienda)

```
cada poll_interval_ticks (900 ticks / 45s por defecto):
  1. GET /api/vote/reward/pending           (async, nunca bloquea el hilo principal)
  2. por cada voto pendiente:
     a. ¿ya esta en processed_ops localmente? -> solo reenviar ACK (reconciliacion tras crash)
     b. POST /api/vote/reward/claim         (atomico, con lease - mismo mecanismo que orders.claim_token)
     c. server.execute { entregar segun VoteRewardConfig (Llave de Voto por defecto) }
     d. marcar processed_ops("vote_reward:<voteId>") + anotar vote_local_status, luego POST /api/vote/reward/ack
```

Si Minecraft está offline cuando se vota, el voto queda `pending` en D1 hasta que vuelva a
consultar. Si el jugador está offline al entregarse, la ruta de `CustomItem` cae al buzón
(`MailboxService`, mismo mecanismo que la Tienda) - nunca se pierde. Un fallo temporal de la web
nunca bloquea el servidor (todo async, `server.execute` solo en el paso final).

## Protecciones cubiertas

| Amenaza | Protección |
|---|---|
| Replay del mismo enlace | `nonce` único, `vote_sessions.consumed_at` (UPDATE condicional atómico) |
| Doble click / doble request / refresh | Mismo mecanismo - el segundo intento ve `consumed_at` ya puesto |
| Concurrencia (2 requests simultáneas) | La UPDATE condicional de SQLite/D1 solo puede ganarla una |
| Token caducado | `expiresAt` verificado server-side antes de cualquier otra cosa |
| Token manipulado | HMAC-SHA256 recalculado y comparado en tiempo constante |
| Mismo UUID votando dos veces el mismo día | `vote_period_id` (ventana GLOBAL diaria, NUNCA rolling 24h) + índice ÚNICO `(player_uuid, vote_period_id)` en D1 - defensa en profundidad real a nivel de BD, identificador SIEMPRE el UUID, nunca IP/localStorage |
| Recompensa entregada dos veces | `claim_token` (lease) + `processed_ops` en Minecraft (autoridad real, exactamente-una-vez) |

## Modelo de voto diario (V2, 2026-09-11)

"1 voto por DÍA de CobbleCraft" - ventana GLOBAL diaria (no por-jugador-desde-su-último-voto),
anclada a un huso horario IANA + hora de reset LOCAL configurables (`VOTE_TIMEZONE`/
`VOTE_RESET_HOUR`/`VOTE_RESET_MINUTE` en el Worker, `timezone`/`reset_hour`/`reset_minute` en
Minecraft - **deben coincidir exactamente**). Default: `Europe/Madrid`, `00:00`. Un voto a las
23:58 y otro a las 00:01 (3 minutos después) SÍ cuentan como dos períodos distintos - es el
comportamiento deseado, nunca un bug. `lib/vote-period.ts`/`VotePeriod.kt` calculan el
`vote_period_id` (`YYYY-MM-DD`) usando únicamente APIs de zona horaria nativas (`Intl.DateTimeFormat`
en el Worker, `java.time.ZoneId` en Minecraft) - ambos manejan correctamente los cambios de
horario CET/CEST (días de 23h/25h), verificado con tests reales sobre las fechas de transición de
2026 (29 de marzo y 25 de octubre).

## Recordatorios automáticos (V2, 2026-09-11)

`VoteReminderService` (Minecraft, tick cada ~5s) envía un mensaje de chat clicable SOLO a
jugadores online que NO hayan votado el período actual (comprobado contra `VoteLocalStatusStore`,
nunca una llamada al Worker por recordatorio). Cadencia configurable: primer recordatorio
`first_reminder_minutes` (default 5) tras conectar, siguientes cada `reminder_interval_minutes`
(default 60) mientras siga pendiente - nunca spam, nunca un recordatorio instantáneo justo al
cruzar el reset diario. En cuanto la Llave de Voto se entrega de verdad, los recordatorios paran
hasta el siguiente período.

## Configuración pendiente para producción

- `VOTE_SIGNING_SECRET` - generar con `openssl rand -hex 32`, idéntico en
  `wrangler secret put VOTE_SIGNING_SECRET` (Worker) y `vote-config.properties`
  `signing_secret` (Minecraft).
- `site_base_url` (Minecraft) - dominio real de la web una vez exista.
- `VOTE_TIMEZONE`/`VOTE_RESET_HOUR`/`VOTE_RESET_MINUTE` (Worker, `wrangler.toml [vars]`) y
  `timezone`/`reset_hour`/`reset_minute` (Minecraft, `vote-config.properties`) - deben coincidir
  EXACTAMENTE; default `Europe/Madrid`/`00:00` en ambos.
- `vote-reward.properties` - ya apunta a `type=custom_item` (Llave de Voto) por defecto;
  reconfigurable a `type=command` sin tocar código si se decide otra recompensa.
