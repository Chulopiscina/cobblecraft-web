# Web Oficial del Servidor

Web oficial de Servidor Cobblemon: información del servidor, descarga del Launcher Oficial y
Tienda con entrega automática en el juego.

## Estructura

```
web/
├── site/       Frontend Astro (100% estático) - Cloudflare Pages
├── worker/     Backend Cloudflare Worker (API de Tienda/Pedidos/Entrega) - Cloudflare Workers
├── shared/     Código compartido entre site y worker (esquema del catálogo, branding)
├── store/      Catálogo de productos versionado en Git (store/catalog.json)
├── scripts/    Scripts de utilidad (capturas de pantalla automáticas)
└── docs/       Toda la documentación de esta parte del proyecto (ver índice abajo)
```

`web/` es un workspace npm (`web/package.json`) con dos paquetes: `worker` y `site`. Esto permite
que dependencias compartidas (como `zod`, usada tanto por el frontend como por el backend para
validar `store/catalog.json`) se instalen una sola vez y sean visibles desde `web/shared/` (que no
tiene su propio `package.json`).

## Arranque rápido (desarrollo local)

```bash
cd web
npm install
npx playwright install chromium   # solo si vas a generar capturas de pantalla

# Terminal 1 - backend
cd worker
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply cobblemon_store --local
npm run dev        # http://127.0.0.1:8787

# Terminal 2 - frontend
cd site
cp .env.example .env
npm run dev        # http://localhost:4321
```

Ver [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) para el detalle completo.

## Índice de documentación

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - visión general de la arquitectura y por qué
- [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) - cómo correr todo en local
- [CLOUDFLARE_DEPLOY.md](docs/CLOUDFLARE_DEPLOY.md) - cómo desplegar a Cloudflare cuando haya cuenta real
- [DOMAIN_SETUP.md](docs/DOMAIN_SETUP.md) - qué hacer cuando se compre el dominio
- [GITHUB_ACTIONS.md](docs/GITHUB_ACTIONS.md) - CI/CD, secrets necesarios
- [STORE_ARCHITECTURE.md](docs/STORE_ARCHITECTURE.md) - modelo de pedidos, estados, D1
- [PAYMENT_PROVIDER.md](docs/PAYMENT_PROVIDER.md) - abstracción de pago, Mock, Tebex y adapter legacy Stripe
- [MINECRAFT_DELIVERY.md](docs/MINECRAFT_DELIVERY.md) - cómo el servidor Minecraft entrega pedidos
- [ADDING_PRODUCTS.md](docs/ADDING_PRODUCTS.md) - cómo añadir un producto nuevo a la Tienda
- [LAUNCHER_DOWNLOAD.md](docs/LAUNCHER_DOWNLOAD.md) - cómo se resuelve la descarga del Launcher
- [SECURITY.md](docs/SECURITY.md) - modelo de seguridad y anti-abuso
- [PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) - todo lo que falta antes de publicar de verdad
- `docs/previews/` - capturas de pantalla automáticas de la web (generadas con `npm run screenshots` en `web/site`)

## Estado (2026-08-25)

V1 funcional en local: frontend completo (15 páginas), backend completo (Worker + D1, 65 tests),
flujo de compra E2E verificado manualmente en navegador con MockPaymentProvider (creación de
pedido → pago simulado → entrega simulada → estado DELIVERED, sin duplicados). Pendiente: cuenta
Cloudflare real, dominio, proveedor de pago real, integración `progression_core` en el servidor
Minecraft (ver PRODUCTION_CHECKLIST.md para la lista completa).
