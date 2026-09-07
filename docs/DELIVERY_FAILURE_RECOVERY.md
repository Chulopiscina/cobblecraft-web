# Recuperación de fallos en la entrega (exactly-once real)

## Máquina de estados

```
PAID → CLAIMED → (entrega real en Minecraft) → processed_ops marcado → DELIVERED
         │
         └─(timeout sin ACK)─→ vuelve a ser reclamable (nuevo claim_token)
```

Capas de protección, de fuera hacia dentro:

1. **`UNIQUE(payment_provider, provider_payment_id)`** en `orders` (D1) - un pago real nunca
   crea dos pedidos.
2. **`processed_webhooks(provider, event_id)`** - un webhook repetido nunca se procesa dos veces.
3. **Claim atómico** (`UPDATE ... WHERE status='PAID' OR (status='CLAIMED' AND claimed_at <
   cutoff)`) - dos claims simultáneos del mismo pedido nunca pueden ganar ambos.
4. **Claim lease (`claim_token`, Production Hardening V1)** - cada claim exitoso genera un token
   nuevo; el ACK debe presentar el MISMO token o se rechaza (`STALE_CLAIM`, HTTP 409) en vez de
   confirmarse contra el estado equivocado.
5. **`processed_ops` en progression_core** (SQLite local del servidor Minecraft, clave
   `"store_order:<orderId>"`) - la entrega REAL nunca se repite si esta clave ya existe,
   independientemente de lo que diga el Worker.

La capa 5 es la que **realmente** impide una entrega física duplicada (dar el rango/item dos
veces) - las capas 1-4 son todas del lado del Worker/D1 y protegen la integridad del PEDIDO
(nunca dos pedidos por el mismo pago, nunca dos servidores reclamando a la vez), pero ninguna de
ellas puede "deshacer" una entrega ya realizada en el mundo de Minecraft. `processed_ops` es la
autoridad final porque vive en el mismo proceso/transacción que la propia entrega.

## Por qué el claim lease (`claim_token`) es defensa EN PROFUNDIDAD, no la protección principal

Con una única instancia de `progression_core` corriendo (la topología real de este proyecto - un
solo servidor Minecraft), el propio diseño de `StoreDeliveryService` ya impide un doble intento
de entrega de otra forma independiente: `cycleRunning` (un `AtomicBoolean`) impide que un nuevo
ciclo de polling empiece mientras el anterior sigue entregando/confirmando - así que dos intentos
de entrega concurrentes del MISMO proceso son estructuralmente imposibles. El `claim_token`
existe para:

1. **Detectar** (nunca prevenir del todo) el caso anómalo de dos GENERACIONES de claim
   compitiendo - solo puede pasar si hay más de una instancia de `progression_core` apuntando al
   mismo Worker por error operacional (dos servidores desplegados a la vez, un redeploy
   solapado). Si ocurre, `warnIfStale` lo registra como error explícito - es una alarma, no una
   corrección automática (la entrega física ya pudo haber ocurrido en la instancia "vieja").
2. Evitar que un ACK muy tardío (de una llamada HTTP que tardó anormalmente) confirme el pedido
   equivocado si mientras tanto otra generación ya lo gestionó.

**Regla operacional derivada, no solo de código**: nunca debe haber dos procesos de
`progression_core` con `store-delivery.properties` → `enabled=true` apuntando al mismo Worker
simultáneamente. El propio protocolo de despliegue de este proyecto (parada limpia → deploy →
arranque) ya lo garantiza en el uso normal.

## Los 21 casos del encargo, uno por uno

1. **Webhook llega dos veces** → `processed_webhooks` lo detecta en la primera comprobación,
   `already_processed`, cero efecto en el pedido. Test: `webhook-processing.test.ts`.
2. **Webhook llega 100 veces** → mismo camino que el caso 1, 100 veces - sigue siendo UNA sola
   transición a PAID. Test de carga: `LOAD_TEST_V1.md`.
3. **Dos instancias intentan claim** → solo una gana la `UPDATE` atómica (D1/SQLite lo
   garantiza); la otra recibe `ALREADY_CLAIMED` (409). Test: `orders.test.ts`.
4. **Servidor reclama y cae antes de entregar** → el pedido queda `CLAIMED` sin `processed_ops`
   marcado. Tras `CLAIM_TIMEOUT_SECONDS` (120s por defecto), el Worker lo vuelve a ofrecer en
   `pending` con un nuevo claim disponible. Al reiniciar, `progression_core` lo reclama de nuevo
   (token nuevo) y entrega normalmente - CERO efecto, nunca se llegó a entregar la primera vez.
5. **Servidor entrega y cae antes de ACK (EL CASO MÁS IMPORTANTE)** → ver sección dedicada
   abajo. Es SEGURO: `processed_ops` ya se marcó antes del ACK.
6. **ACK llega dos veces** → `ackDelivered` es idempotente (`ALREADY_DELIVERED` en el segundo
   intento con el mismo token). Test: `orders.test.ts`.
7. **Worker cae tras claim** → el pedido queda `CLAIMED` en D1 (persistente); en cuanto el
   Worker vuelve, el timeout normal se aplica igual que el caso 4.
8. **Minecraft cae tras `processed_op`** (marcado pero ACK no enviado todavía) → ver sección
   dedicada abajo, mismo caso que el 5 en la práctica (ambos ocurren DESPUÉS de `processed_ops`).
9. **Red falla durante ACK** → igual que el caso 5/8: la entrega y `processed_ops` ya son firmes
   antes de intentar el ACK; un fallo de red aquí solo retrasa la confirmación, nunca repite la
   entrega (ver reconciliación automática en el siguiente ciclo).
10. **Timeout del Worker** (una petición de progression_core tarda más que
    `request_timeout_seconds`) → `StoreApiClient` lo trata como fallo de red normal, se reintenta
    en el siguiente ciclo de polling. Sin efecto en la integridad (el estado en D1 no cambió si
    la petición nunca llegó a completarse).
11. **Timeout de Minecraft** (el Worker no recibe respuesta a tiempo, ej. `/api/delivery/ack`) →
    el pedido queda `CLAIMED`; el timeout de 120s lo libera para reintento, con reconciliación
    automática (caso 5/8) si la entrega YA había ocurrido.
12. **Respuesta JSON truncada** → `MiniJson.parseObjectArray`/`parseObject` lanzan
    `JsonParseException` de forma controlada (nunca un crash silencioso); `StoreApiClient`
    propaga la excepción, `triggerPollCycle`/`handleOrder` la capturan con `.exceptionally {}` y
    solo loguean un aviso - el ciclo se recupera solo en el siguiente intento.
13. **Pedido malformado** (un campo inesperado del lado del Worker) → cubierto por el mismo
    mecanismo que el caso 12 (fallo de parseo controlado).
14. **`productId` inexistente** en `StoreCatalogConfig` → `handleOrder` lo detecta, loguea un
    error claro, hace ACK `"failed"` (libera el claim para reintento) - NUNCA entrega nada.
    Bucle de reintento indefinido hasta que un admin corrija `StoreCatalogConfig.kt` - señal
    visible en logs, no un fallo silencioso.
15. **Producto deshabilitado DESPUÉS de comprar** (un admin lo desactiva en
    `web/store/catalog.json` tras la compra pero antes de la entrega) → el pedido YA está PAID
    en D1 con su `productId` original; `StoreCatalogConfig.kt` (Minecraft) sigue teniendo su
    propio mapping local independiente del `active` de la web, así que la entrega SIGUE
    funcionando (el pedido ya pagado se sigue entregando; desactivar un producto en la web solo
    impide compras NUEVAS, nunca las ya pagadas).
16. **Jugador offline** → `giveCustomItem` comprueba `server.playerList.getPlayer(uuid) == null`
    → usa `MailboxService.deliver` directamente, entrega garantizada cuando vuelva a conectar.
17. **Inventario lleno** → `InventoryItems.giveOrFalse` devuelve `false` → mismo camino que el
    caso 16 (Mailbox).
18. **Mailbox falla temporalmente** (excepción de SQLite, ej. disco lleno) → la excepción se
    propaga hasta el `catch` de `handleOrder`, que hace ACK `"failed"` (libera el claim) - el
    pedido se reintenta en el siguiente ciclo, NUNCA se marca `processed_ops` si la entrega
    realmente falló.
19. **Servidor Minecraft reinicia** → `processed_ops` sobrevive (SQLite persistente), pedidos
    `CLAIMED` huérfanos se auto-sanan por timeout - ver caso 4/7.
20. **Worker reinicia** (Cloudflare recicla la instancia) → D1 es persistente independientemente
    del ciclo de vida de la instancia del Worker; solo se pierde el estado EN MEMORIA (los
    buckets de rate-limit) - sin impacto en pedidos.
21. **Conflicto de transacción D1** → D1/SQLite serializa escrituras; una `UPDATE` condicional
    que pierde la carrera simplemente afecta 0 filas (resultado ya manejado explícitamente en
    `claimOrder`/`ackDelivered`/`markPaid`), nunca lanza una excepción de conflicto sin controlar.

## El caso 5/8/9 en detalle: "corte de red exactamente después de entregar, antes del ACK"

Esta es la secuencia real en `StoreDeliveryService.handleOrder` (dentro de `server.execute {}`):

```kotlin
deliver(...)                              // 1. entrega física (item/rango)
database.execute { markProcessed(...) }   // 2. processed_ops marcado (SQLite LOCAL, síncrono)
apiClient.ackAsync(...)                   // 3. confirmación al Worker (red, puede fallar)
```

Si el proceso muere, la red falla, o el servidor se apaga **entre el paso 2 y el paso 3** (el
caso que pide expresamente el encargo): al reiniciar, el pedido puede reaparecer en `pending`
(tras el timeout de claim). `handleOrder` comprueba `isProcessed(opId)` ANTES de intentar
entregar de nuevo - lo encuentra `true`, así que **salta directamente a reclamar (para obtener un
`claimToken` fresco) y reenviar el ACK**, sin volver a llamar a `deliver()`. Resultado: el pedido
termina en `DELIVERED`, la entrega ocurrió UNA sola vez. Verificado con un test dedicado
(`StoreDeliveryReconciliationTest`, ver más abajo) que simula exactamente esta secuencia contra
una base de datos real.

## El único riesgo residual honesto (no resuelto, y por qué se acepta)

Existe una ventana, mucho más estrecha, ENTRE el paso 1 (`deliver()`) y el paso 2
(`markProcessed`) de la secuencia de arriba. Si el proceso muere en ese instante exacto (un
`kill -9`, un fallo de hardware, un corte de luz - no un fallo de red, que es asíncrono y ocurre
después), la entrega física ya ocurrió pero `processed_ops` nunca se marcó - al reiniciar, el
pedido se reintentaría y se entregaría una SEGUNDA vez.

Esto **no es una debilidad nueva introducida por el sistema de Tienda**: es exactamente el mismo
patrón (`entregar → luego marcar processed_ops`) que ya usan `RewardService`,
`SlayerRewardDelivery`, `LeagueBadgeDelivery` y el resto de sistemas de recompensa de
`progression_core` desde hace varias fases - nunca se ha invertido el orden (marcar primero,
entregar después) en NINGÚN sistema de este proyecto, porque invertirlo cambia el riesgo de
"duplicar" por el de "perder la entrega si el proceso muere entre marcar y entregar" - un riesgo
igual de malo (el propio encargo prohíbe ambos: "JAMÁS duplicar... JAMÁS perder"). Sin una
transacción distribuida real entre SQLite y "dar un item en el mundo de Minecraft" (que no
existe, y construirla sería una complejidad desproporcionada para este riesgo), alguno de los dos
lados tiene que ir primero. Se mantiene el orden ya establecido en todo el proyecto (entregar
primero) por consistencia, y porque una entrega duplicada (recuperable a mano: quitar el objeto
sobrante) es operacionalmente más fácil de corregir que una compra pagada nunca entregada.

## Backoff / reintento de la entrega

- `productId` desconocido → ACK `"failed"`, reintento indefinido (nunca expira solo - requiere
  corrección manual del catálogo).
- Cualquier otra excepción durante la entrega → ACK `"failed"`, libera el claim, reintento en el
  siguiente ciclo de polling (cada `poll_interval_ticks`, 45s por defecto) - sin backoff
  exponencial en V1 (la cadencia ya es baja, un backoff añadiría complejidad sin beneficio real a
  esta escala).
