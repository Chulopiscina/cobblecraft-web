# Auditoría de seguridad - Production Hardening V1

Auditoría realizada el 2026-08-26 (sesión autónoma nocturna), sobre el código real tal y como
quedó tras la sesión "Web Oficial V1" (2026-08-25). Metodología: lectura línea a línea de cada
endpoint/ruta/servicio real (nunca desde memoria de sesiones anteriores), clasificación P0-P3,
corrección inmediata de todo lo P0/P1 con impacto real.

## Clasificación

- **P0** - explotable de forma directa, impacto grave (dinero, comandos arbitrarios, duplicados).
- **P1** - explotable con esfuerzo moderado, o robustez real (pedido perdido/atascado).
- **P2** - defensa en profundidad, abuso limitado, UX de error.
- **P3** - observación menor, sin impacto de seguridad real.

## P0 - ninguno encontrado

Se auditó explícitamente cada punto de la lista P0 del encargo:

| Riesgo | Resultado |
|---|---|
| Compra gratis / precio manipulable | **Descartado.** `POST /api/orders` solo acepta `productId`+`playerName`; el precio se lee SIEMPRE de `getAuthoritativeProduct` (catálogo server-side). Un `priceCents` en el body se ignora (test: `routes.test.ts` "ignores any price the client tries to send"). |
| Ejecución de comando arbitrario | **Descartado por diseño.** `GET /api/delivery/pending` nunca devuelve una instrucción de entrega, solo `productId`; `StoreCatalogConfig.kt` (whitelist LOCAL en Kotlin) decide qué se entrega. Ver `MINECRAFT_DELIVERY.md`. |
| Entrega duplicada | Cubierto por `processed_ops` (exactamente-una-vez real) + claim atómico. Reforzado esta sesión con claim lease (`claim_token`) - ver Fase B abajo y `DELIVERY_FAILURE_RECOVERY.md`. |
| IDOR en pedidos | **Descartado.** `public_id` = 20 caracteres base32 aleatorios (32^20 ≈ 2^100) - inenumerable. |
| Filtración de token | Auditado `redactSecret`, ningún log imprime un secreto completo; `.dev.vars`/`.env` gitignored; `PUBLIC_*` es la única superficie expuesta al navegador. |
| Webhook falsificable | Firma HMAC verificada siempre server-side antes de tocar cualquier pedido (`processProviderWebhook`). Ver P1 abajo por la comparación no-constante-en-tiempo que SÍ se corrigió. |
| SQL injection | Auditado: 100% sentencias preparadas D1 (`.prepare(sql).bind(...)`) en todo `lib/`. Cero concatenación de SQL con datos de usuario. |
| Privilege escalation | No existe ningún concepto de "rol" en la propia web/Worker (solo Bearer token binario para progression_core) - no aplica. |
| Productos DEV visibles en PROD | `visibleProducts()` excluye `devOnly` incondicionalmente cuando `env=prod`, verificado por test (`catalog-schema.test.ts`). |

## P1 - encontrados y corregidos

1. **Comparación de firma NO constante en tiempo** (`MockPaymentProvider.verifyWebhook`,
   `StripePaymentProvider.verifyWebhook`) - usaban `!==`/`===` normal sobre el HMAC calculado.
   **Corregido**: `timingSafeEqual` extraída a `lib/security.ts` (antes solo existía para el
   Bearer token de `routes/delivery.ts`) y aplicada también a ambos proveedores de pago.
2. **Sin tolerancia de timestamp en la firma Stripe** - un webhook firmado hace mucho tiempo
   pasaba la verificación de firma igualmente. **Corregido**: ventana de 5 minutos
   (`WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`), con test dedicado. Nota: `processed_webhooks` ya
   bloqueaba el replay EXACTO del mismo evento antes de este cambio - esto es defensa adicional,
   no la única barrera.
3. **JSON malformado en un webhook con firma válida lanzaba una excepción no controlada** (ambos
   proveedores) - un body corrupto/truncado tras pasar la verificación de firma tumbaba la
   petición con un 500 en vez de un 400 controlado. **Corregido**: `JSON.parse` envuelto en
   try/catch, tratado igual que una firma inválida.
4. **`POST /api/orders`: si `provider.createCheckout`/`markPendingPayment` fallaban, el pedido
   quedaba huérfano en `CREATED` para siempre** ("pedido bloqueado"). **Corregido**: la sección
   completa se envuelve en try/catch; un fallo marca el pedido `FAILED` explícitamente (nunca
   deja un estado ambiguo) y responde 502 claro. Caso residual documentado en
   `DELIVERY_FAILURE_RECOVERY.md`.
5. **`GET /api/link/status/:code` sin rate limit** - endpoint público, sin límite, permitía
   fuerza bruta/enumeración de códigos de vinculación sin fricción (aunque el espacio de códigos,
   32^6 ≈ mil millones, ya lo hacía impráctico a gran escala). **Corregido**: 20 req/min por IP.
6. **`POST /api/link/confirm` sin rate limit propio** (más allá de requerir el Bearer token del
   servidor) - defensa en profundidad insuficiente si el token se filtrase. **Corregido**: 60
   req/min por IP, además del auth ya existente.
7. **`POST /api/payments/mock/simulate` sin rate limit** (endpoint solo-DEV, pero sin límite
   igualmente). **Corregido**: 20 req/min por IP.
8. **`buckets` (mapa de rate-limit en memoria) crecía sin límite** durante la vida de la
   instancia del Worker - las entradas expiradas nunca se eliminaban. **Corregido**: barrido
   oportunista cuando el mapa supera 500 entradas.
9. **Claim sin "lease" real (Fase B)** - un ACK nunca verificaba que correspondía a la
   generación de claim vigente. **Corregido**: `claim_token` nuevo por cada claim exitoso
   (migración `0002_claim_lease.sql`), `ackDelivered` lo exige y rechaza (`STALE_CLAIM`, HTTP
   409) un token que ya no coincide. Ver `DELIVERY_FAILURE_RECOVERY.md` para el protocolo
   completo y por qué esto es defensa en profundidad (la protección real contra duplicados ya la
   daba `processed_ops`).

## P2 - documentados, aceptados o mitigados

- **CORS**: `Access-Control-Allow-Headers`/`-Methods` se envían incluso cuando el origen no
  coincide (solo `Access-Control-Allow-Origin` se omite) - inofensivo, el navegador bloquea la
  respuesta igualmente sin `Allow-Origin`, pero se documenta aquí por transparencia.
- **Rate limiting en memoria por instancia** - se reinicia si el Worker recicla el proceso;
  aceptado explícitamente para V1 ("no montar sistema enterprise"), ya documentado en
  `SECURITY.md` antes de esta auditoría.
- **`AckOutcome.StaleClaim`/`STALE_CLAIM` en una topología de un único servidor Minecraft**: no
  debería ocurrir nunca en operación normal. Si aparece, es una señal real de que dos instancias
  de `progression_core` apuntan al mismo Worker (error operacional, no de código) - se loguea
  como error explícito (`warnIfStale`) para que un admin lo investigue.
- **Mojang API caída/lenta**: ya manejado con timeout (5s) + try/catch → 502 claro, verificado
  en esta auditoría, sin cambios necesarios.

## P3 - observaciones menores

- `scripts/hub_build/generate_portal_fields.py:79` contiene una ruta personal absoluta
  (`C:\Users\bilan\...`) - **fuera de alcance de esta sesión** (no es parte de la Tienda/Web/
  Launcher, es una herramienta de generación de datapacks del Hub, cubierta por la regla "no
  tocar nada de gameplay/Hub esta noche"). Queda anotado para una limpieza futura, no corregido
  aquí.
- El recuento de tests de `progression_core` reportado en la sesión anterior ("1064/1064") era
  inexacto por un problema de tooling (reportes `build/test-results` no purgados entre
  ejecuciones incrementales) - el recuento REAL verificado con `./gradlew clean test` era
  919/919. Documentado en `CLAUDE.md` como regla permanente ("usa siempre `clean test` para
  cifras reales"), y en el resumen final de esta sesión con el número correcto.

## Área auditada: `progression_core` (Minecraft)

- **`WebLinkCommands.kt`**: console-safe (`ctx.source.player as? ServerPlayer`, nunca
  `playerOrException`), usa el UUID real del ejecutor, nunca confía en nada enviado por la web
  más allá del código de 6 caracteres que el propio jugador teclea. Sin hallazgos.
- **`StoreCatalogConfig.kt`**: whitelist local hardcodeada en Kotlin, nunca deriva de una
  respuesta HTTP. Test de consistencia cruzada contra `web/store/catalog.json` real
  (`StoreCatalogConfigTest`) evita que un producto activo en la web quede sin mapping. Sin
  hallazgos adicionales.
- **`StoreDeliveryService.kt`/`StoreApiClient.kt`**: ver Fase B (`DELIVERY_FAILURE_RECOVERY.md`)
  para el análisis completo de resiliencia - aquí solo la parte de seguridad: el Bearer token
  nunca se loguea, `grantRank` usa el UUID (nunca el username) para el comando `/lp`, ningún dato
  recibido del Worker se interpreta como comando distinto de los 5 `DeliveryType` conocidos.

## Área auditada: GitHub Actions / configuración

Ver `web/docs/GITHUB_ACTIONS.md` (actualizado) para el detalle completo de lo corregido:
`npm install` → `npm ci` (reproducibilidad real), bloques `permissions:` explícitos de mínimo
privilegio, `concurrency:` para evitar despliegues solapados, `timeout-minutes` en cada job,
workflow nuevo `minecraft-ci.yml` (progression_core no tenía NINGÚN CI hasta esta sesión, pese a
tener cientos de tests reales), `launcher-ci.yml`/`launcher-release.yml` nuevos, `dependabot.yml`
nuevo.

## Fase F - dependencias / supply chain (`npm audit`, 2026-08-26)

`npm audit` sobre el workspace `web/` reporta 13 vulnerabilidades conocidas (1 crítica, 6 altas,
6 moderadas). **Ninguna de ellas vive en el código que se despliega de verdad** - las tres
cadenas son:

1. **Astro (`<=7.0.9`, XSS/SSRF varios) + esbuild + sharp + vite** - todas herramientas de
   BUILD-TIME. El sitio es `output: "static"`; el `dist/` resultante es HTML/CSS/JS escrito por
   nosotros, nunca incluye código de Astro/esbuild/sharp/vite en sí. El fix real requiere
   `astro@7.2.7` (salto mayor 4→7, "breaking change" explícito según `npm audit`) - **no se
   fuerza esta noche** (pedido explícito: "No hacer actualizaciones major arriesgadas únicamente
   porque existen"). Recomendado como tarea de seguimiento con tiempo dedicado a probar las 15
   páginas tras el salto, antes de publicar en producción real.
2. **wrangler 3.x → `ws`/`undici` (altas/crítica)** - dependencias de Miniflare, la simulación
   local de Cloudflare Workers (`wrangler dev`). Herramienta de DESARROLLO/CI, nunca se ejecuta
   en el Worker real desplegado (Cloudflare ejecuta nuestro código sobre su propio runtime, sin
   ninguna de estas dependencias de Node). El fix requiere `wrangler@4` (salto mayor) - mismo
   criterio, no forzado esta noche.
3. **`uuid@9.0.1` (moderada) vía `linkinator` → `gaxios`** - `linkinator` es una herramienta de
   comprobación de enlaces rotos (`astro check`-adyacente, dev-only), nunca se ejecuta en
   producción. `npm audit fix` (no-breaking) se intentó pero no pudo resolverlo sin tocar
   `linkinator` (dependencia anidada más profunda de lo que el fix automático alcanza) - impacto
   real mínimo (la función vulnerable de `uuid` solo es explotable si se le pasa un buffer
   controlado por un atacante, algo que el uso interno de `linkinator` no hace).

**Resumen**: cero vulnerabilidades en la superficie de ataque real (Worker desplegado, sitio
estático servido). Todo lo encontrado es tooling de desarrollo/build. Dependabot (`dependabot.yml`,
nuevo esta sesión) mantendrá esto vigilado semanalmente sin auto-merge.

## Fase M - accesibilidad (sin rediseño visual)

Auditoría completa de `web/site/src/` (todas las páginas, componentes, layout, CSS). Encontrado
y corregido - todo invisible para un usuario que ya veía bien la web, nunca un cambio de diseño:

- **Jerarquía de encabezados rota en `/servidor`**: `h1 → h3(×10) → h2` (la rejilla de sistemas
  no tenía ningún `h2` delante, a diferencia de cada otra sección del sitio). Corregido añadiendo
  el mismo patrón "eyebrow + h2" que ya usa el resto del sitio (`index.astro`) - visualmente
  consistente con el resto de la web, no una sección nueva inventada.
- **Enlace "saltar al contenido" ausente** para navegación por teclado - añadido
  (`.skip-link`, invisible hasta recibir foco, patrón estándar).
- **Mensajes de estado/error dinámicos sin `aria-live`** (formulario de compra, checkout
  simulado, página de estado de pedido) - un lector de pantalla nunca anunciaba estos cambios.
  Añadido `role="alert"/"status"` + `aria-live="assertive"/"polite"` según el caso.
- **Iconos de producto con `alt=""`**: revisado y confirmado CORRECTO tal y como estaba - el
  icono es redundante con el `<h1>`/`<h3>` inmediatamente adyacente (mismo nombre de producto);
  darle un `alt` real habría duplicado el anuncio en un lector de pantalla. Documentado con un
  comentario explícito en el código para que quede claro que es deliberado, no un descuido.
- **Formularios**: el único `<input>` del sitio (nombre de usuario en la compra) ya tenía su
  `<label for>` correcto - sin cambios.
- **Foco visible**: auditado - ninguna regla CSS elimina el outline por defecto del navegador en
  ningún elemento. Sin cambios necesarios.
- **Contraste**: calculado manualmente el par más usado (`--text-muted` #9aa3b8 sobre `--bg`
  #0b0e14) ≈ 7,4:1 - supera el mínimo WCAG AA (4,5:1) con margen. Sin cambios necesarios.
- **`<details>/<summary>` de Ayuda**: confirmado nativo, sin JavaScript que altere su
  comportamiento por teclado por defecto.
- **`lang="es"`**: correcto, único `<html>` del proyecto (layout compartido).

## Conclusión

Cero hallazgos P0 reales (la arquitectura ya estaba bien diseñada en ese sentido - autoridad de
precio/producto siempre server-side, whitelist de entrega local, D1 con restricciones reales).
Los 9 hallazgos P1 eran genuinos y ya están corregidos con tests que los cubren. La superficie de
ataque de la Tienda queda significativamente más robusta sin haber tocado ninguna decisión de
producto (precios, catálogo, diseño visual).
