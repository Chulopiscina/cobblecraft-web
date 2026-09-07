# Prueba de carga local (Fase S)

Ejecutada el 2026-08-26 contra el Worker real corriendo en local (`wrangler dev --local`,
`127.0.0.1:8787`) con D1 local real (migraciones aplicadas). Nunca contra un dominio público,
nunca un servicio externo - 100% local y controlada.

## Resultado

```
100x GET /api/health (burst): 240ms → 100/100 OK

15x POST /api/orders concurrent: 229ms
 → 7 creados (200), 8 correctamente bloqueados por rate limit (429) - total 15/15
 (comportamiento CORRECTO: el límite de 8/min/IP actuando bajo carga real, no un fallo)

10x POST /api/delivery/claim CONCURRENTES sobre el MISMO pedido: 38ms
 → claimed=1 (exactamente 1), already_claimed=9 (exactamente 9)
 *** ESTE ES EL TEST MÁS IMPORTANTE: la garantía de claim atómico probada bajo
     concurrencia REAL (10 peticiones HTTP simultáneas), no solo llamadas secuenciales
     en un test unitario. Ganó exactamente una. ***

50x POST /api/payments/mock/simulate DUPLICADO (mismo pedido, ya pagado): 186ms
 → 19/50 respondieron 200 (already_processed), 31 correctamente rate-limited (429)

Estado final del pedido tras toda la carga: CLAIMED (esperado - nunca corrupto,
nunca avanzó de estado por la concurrencia)

50x GET /api/delivery/pending (simula progression_core bajo carga): 107ms → 50/50 OK
 (sin rate limit aquí a propósito - Fase I: "no bloquear la Delivery API legítima")

=== RESUMEN: 6/6 bloques OK, 0 fallos ===
```

## Qué demuestra

1. **El claim atómico se sostiene bajo concurrencia HTTP real**, no solo en el test unitario
   secuencial (`orders.test.ts`) - 10 peticiones simultáneas, una sola ganadora, siempre.
2. **El rate limiting funciona bajo carga real**, no solo en `security.test.ts` con llamadas
   directas a la función - confirmado a través de todo el stack HTTP (Worker → `rateLimit()`).
3. **Ningún endpoint se cae ni corrompe estado** bajo ráfagas de cientos de peticiones
   concurrentes en un proceso `wrangler dev --local` con recursos modestos.
4. **Los endpoints de entrega (`/api/delivery/pending`) nunca se ven afectados** por el rate
   limiting de otros endpoints (buckets independientes por ruta+IP).

## Cómo reproducirlo

```bash
cd web/worker
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply cobblemon_store --local
npm run dev   # deja corriendo en otra terminal

node web/scripts/load-test.mjs   # ver el script real en el repo
```

## Limitaciones honestas

- Un único proceso `wrangler dev --local` en la misma máquina que genera la carga - no mide
  latencia de red real ni el comportamiento bajo el runtime distribuido real de Cloudflare
  Workers (que escala horizontalmente de forma distinta). Suficiente para detectar bugs de
  concurrencia/estado, no para benchmarking de rendimiento en producción real.
- No se probó carga sostenida durante minutos/horas (memory leaks de larga duración) - el
  barrido del mapa de rate-limit (`sweepExpiredBuckets`, Fase A) mitiga el caso conocido de
  crecimiento sin límite, pero no se ha verificado con una prueba de horas.
