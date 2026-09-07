# Capacidad en el tier gratuito de Cloudflare

Estimaciones reales (no inventadas) basadas en la configuración actual del código y en los
límites publicados del tier gratuito de Cloudflare (Workers: 100.000 requests/día; D1: 5M filas
leídas/día, 100k filas escritas/día - límites sujetos a cambio, verificar en cloudflare.com antes
de confiar en ellos para una decisión de producción real).

## Polling de `StoreDeliveryService` (el consumo "de fondo", constante)

`poll_interval_ticks = 900` (valor por defecto real, `StoreDeliveryConfig.kt`) = 900 ticks / 20
ticks-por-segundo = **45 segundos entre ciclos**.

Cada ciclo hace **como mínimo 1 request** (`GET /api/delivery/pending`) - si no hay pedidos
pendientes, ahí termina el ciclo (nunca hace un `claim` sin pedidos reales que reclamar).

```
86.400 segundos/día ÷ 45 segundos/ciclo ≈ 1.920 ciclos/día
→ ~1.920 requests/día SOLO de polling vacío (caso normal, sin compras)
```

Con actividad real de compra, cada pedido entregado añade 2 requests más al ciclo que lo procesa
(`claim` + `ack`) - insignificante frente al volumen de polling de fondo salvo picos de cientos
de compras simultáneas (no realista para la escala de este servidor).

**1.920 requests/día es ~1,9% del límite gratuito de Workers (100.000/día)** - hay margen amplio
incluso multiplicando por 10 sin acercarse al límite.

## Otros endpoints (tráfico real de jugadores, variable)

- `GET /api/server/status`: si algún día se activa el widget de estado en Home, cada visita hace
  1 request. Con audiencia moderada (cientos de visitas/día), sigue siendo marginal.
- `GET /api/launcher/latest`: 1 request por visita a `/jugar` (el botón de descarga la consulta
  al cargar la página) - mismo orden de magnitud.
- `POST /api/orders`, `/api/payments/*`, `/api/delivery/*`, `/api/link/*`: ligados al volumen
  real de compras/vinculaciones, muy por debajo del volumen de polling de fondo a esta escala.

## Escenarios (nunca tráfico de usuario real - son estimaciones de orden de magnitud)

| Escenario | Requests/día estimadas | % del límite gratuito (100k/día) |
|---|---|---|
| 10 jugadores activos, sin Tienda | ~1.920 (solo polling) + ~50 (status/launcher) ≈ **2.000** | ~2% |
| 50 concurrentes, uso normal de Tienda | ~1.920 + ~500 (status/launcher/pedidos) ≈ **2.500** | ~2,5% |
| 100 concurrentes, pico de actividad | ~1.920 + ~1.500 ≈ **3.500** | ~3,5% |

Incluso en el escenario más activo, el consumo queda cómodamente dentro del tier gratuito. El
polling de fondo (no el tráfico de jugadores) es el componente dominante del consumo total -
justo lo contrario de lo que cabría esperar, y la razón por la que vale la pena optimizarlo si
algún día se quisiera reducir aún más el margen de seguridad.

## D1 (lecturas/escrituras)

Cada ciclo de polling vacío hace 1 lectura (`SELECT ... WHERE status IN (...)`, típicamente 0
filas). 1.920 ciclos/día ≈ 1.920 lecturas/día - **0,04% del límite gratuito de D1** (5M
filas/día). Las escrituras (crear/actualizar pedidos) están atadas al volumen real de compras,
órdenes de magnitud por debajo del límite (100k filas/día).

## ¿Hace falta polling adaptativo/backoff?

**No para esta escala.** Se evaluó explícitamente (pedido del encargo: "polling 45s → ¿es
razonable? Si hay una mejora sencilla, impleméntala SOLO si mantiene robustez y simplicidad") -
con el consumo real en ~2-4% del límite gratuito, un backoff exponencial o polling adaptativo
(más lento sin pedidos, más rápido tras una compra) añadiría complejidad de estado real
(¿cuándo volver al intervalo normal? ¿qué pasa si el backoff coincide con una compra real y la
entrega se retrasa minutos?) sin ningún beneficio medible - el margen de seguridad ya es de
~25-50x. **No implementado a propósito** - el intervalo fijo de 45s ya es simple, predecible y
sobra de margen. Si el servidor creciera 25-50x en tráfico real, esta sería la primera
optimización a revisar (documentado aquí para esa eventualidad futura).

## Qué SÍ se limita (por otras razones, no por cuota)

`CLAIM_TIMEOUT_SECONDS` (120s) es mayor que 2 ciclos de polling (90s) a propósito - evita que un
pedido se libere para reintento mientras la entrega original todavía podría estar en curso. Ver
`DELIVERY_FAILURE_RECOVERY.md`.
