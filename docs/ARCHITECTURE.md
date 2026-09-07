# Arquitectura - Web Oficial V1

## Objetivo y restricciones

El encargo original fue explícito: **cero cuotas mensuales fijas**, sin VPS propio, sin usar el
propio ordenador como servidor web permanente. El único coste fijo aceptado es el dominio.

Esto descarta Vercel/Supabase/un droplet propio y apunta directamente a la capa gratuita de
Cloudflare, que cubre exactamente lo que necesitamos: hosting estático, funciones serverless y
una base de datos SQL, todo en el mismo proveedor y sin tarjeta de crédito obligatoria en su tier
gratuito.

## Diagrama de componentes

```
Jugador (navegador)
   │
   ▼
Cloudflare Pages  ──(sirve)──  web/site (Astro, 100% estático, build-time)
   │
   │  fetch() a la API (solo desde el navegador, nunca server-side)
   ▼
Cloudflare Worker  ──(web/worker, TypeScript, sin framework)
   │
   ├─ Cloudflare D1 (SQLite) ── pedidos, eventos, códigos de vinculación
   ├─ Proveedor de pago (Mock en dev / Tebex Headless + checkout hospedado en prod)
   └─ API pública de Mojang (resolver username → UUID)
   ▲
   │  HTTPS SALIENTE (el Worker nunca abre conexión hacia el servidor Minecraft)
   │
Servidor Minecraft (progression_core, mod propio)
   - Hace POLLING periódico al Worker (StoreDeliveryService)
   - Reclama pedidos, los entrega (LuckPerms / CustomItemRegistry / Mailbox)
   - Confirma la entrega (ACK)
```

**Dirección de la conexión, remarcado porque es una decisión de seguridad deliberada**: el
servidor Minecraft siempre INICIA la conexión hacia Cloudflare (saliente). Cloudflare nunca
tiene ninguna vía de entrada hacia el servidor Minecraft (ni RCON, ni el puerto del juego, ni
SQLite, ni ningún panel admin expuesto a Internet). Si el Worker fuera comprometido, lo máximo
que podría hacer es dejar de responder o servir datos de pedidos falsos - nunca ejecutar nada
directamente en el servidor, porque no tiene ningún canal de entrada.

## Por qué cada pieza

- **Astro (salida estática)**: la web es mayormente informativa - no necesita SSR. Un build
  estático se sirve gratis y muy rápido desde el CDN de Cloudflare Pages. Astro por defecto no
  envía JavaScript de framework al cliente; solo los `<script>` puntuales que escribimos
  (toggle de navegación, formulario de compra, widget de estado) - "interactividad solo donde
  aporte valor", pedido explícito.
- **Cloudflare Worker sin framework**: la superficie de la API es pequeña (una decena de rutas).
  Un `switch`/regex sobre el path (`web/worker/src/index.ts`) es más fácil de auditar que añadir
  Hono/itty-router para ahorrar 15 líneas.
- **Cloudflare D1**: SQLite gestionado, gratis en su tier, con soporte para transacciones y
  `UNIQUE`/`CHECK` reales - necesario para las garantías de idempotencia del sistema de pedidos
  (ver STORE_ARCHITECTURE.md). Nunca se usó KV para esto porque KV no tiene transacciones ni
  índices únicos reales.
- **GitHub Releases para el Launcher**: el `.exe` del Launcher Oficial no vive en Cloudflare
  Pages (límite de tamaño de asset, y GitHub Releases ya es el lugar natural para binarios
  versionados). El Worker consulta la API de GitHub Releases en tiempo real
  (`routes/launcher.ts`) para no tener que reconstruir la web cada vez que sale una versión
  nueva del Launcher.

## Por qué NO un mixin/servidor Node propio

Se consideró y se descartó explícitamente un pequeño servidor Node.js propio (Express/Fastify)
corriendo en el mismo PC que Minecraft, expuesto con algo como Cloudflare Tunnel. Se descartó
porque:

1. Ataría la disponibilidad de la Tienda a que el PC del usuario esté encendido - inaceptable
   para pagos reales.
2. Sería, de facto, "usar el propio ordenador como servidor web permanente" - explícitamente
   excluido por el encargo.

## Entornos

Ver [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md), [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md) y
[PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) para el detalle de DEV/TEST/PROD.
