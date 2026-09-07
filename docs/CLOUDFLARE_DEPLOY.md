# Despliegue a Cloudflare

El proyecto `cobblemon-server-site` ya existe en Cloudflare Pages y actualmente se despliega por
upload directo con Wrangler, no desde Git Provider. Cuando se conecte GitHub, usar la misma rama de
producción que Pages ya espera: `main`.

## 0. Requisitos previos

- Cuenta de Cloudflare (el tier gratuito es suficiente para el volumen esperado de este
  servidor).
- `wrangler login` autenticado localmente, o un `CLOUDFLARE_API_TOKEN` para CI (ver
  GITHUB_ACTIONS.md).

## 1. Crear la base de datos D1 real

```bash
cd web/worker
npx wrangler d1 create cobblemon_store
```

Copia el `database_id` que devuelve el comando y sustituye
`REQUIERE-CONFIGURACION-wrangler-d1-create` en **ambas** entradas de `wrangler.toml`
(`[[d1_databases]]` y `[[env.production.d1_databases]]` si son bases de datos distintas para
staging/producción, o la misma si se comparte).

```bash
npx wrangler d1 migrations apply cobblemon_store --remote
```

## 2. Configurar secrets del Worker (nunca en wrangler.toml)

```bash
npx wrangler secret put STORE_SERVER_TOKEN --env production
npx wrangler secret put TEBEX_PUBLIC_TOKEN --env production     # cuando exista tienda Tebex
npx wrangler secret put TEBEX_WEBHOOK_SECRET --env production   # secreto del endpoint webhook Tebex
```

`STORE_SERVER_TOKEN` debe generarse con una fuente criptográficamente segura, ej.:

```bash
openssl rand -hex 32
```

Este mismo valor se configura también en `progression_core` (ver MINECRAFT_DELIVERY.md) - es un
secreto compartido, no se transmite nunca por otro canal que no sea copiarlo a mano una vez.

## 3. Desplegar el Worker

```bash
cd web/worker
npx wrangler deploy --env production
```

Verifica: `curl https://cobblemon-server-store.cobblemon-server.workers.dev/api/health`.

## 4. Desplegar el frontend a Cloudflare Pages

Opción recomendada: conectar el repositorio de GitHub directamente en el dashboard de Cloudflare
Pages (Settings → Pages → Create a project → Connect to Git), con:

- Root directory: `web/site`
- Build command: `npm install && npm run build`
- Build output directory: `dist`
- Variables de entorno (Pages → Settings → Environment variables):
  - `PUBLIC_API_BASE_URL` = URL real del Worker desplegado (paso 3)
  - `PUBLIC_STORE_ENV` = `prod`
  - `PUBLIC_SITE_URL` = dominio real o `https://cobblemon-server-site.pages.dev` mientras no haya
    dominio propio.

Esto activa despliegue automático en cada push a la rama configurada - no necesita GitHub
Actions para el propio despliegue de Pages (aunque sí lo usamos para lint/test antes del merge,
ver GITHUB_ACTIONS.md).

## 5. Actualizar CORS

En `web/worker/wrangler.toml`, `[env.production].vars.CORS_ALLOWED_ORIGIN` debe apuntar al
dominio REAL final (ver DOMAIN_SETUP.md) - nunca dejar `REQUIERE-DOMINIO-REAL` en un despliegue
real, el Worker rechazará CORS de cualquier origen hasta corregirlo (fail-safe intencional).

## 6. Verificación post-despliegue

- `GET /api/health` responde `{"ok":true,"environment":"production"}`.
- Crear un pedido de prueba con un producto marcado `devOnly:false` (ninguno existe todavía a
  propósito, ver PRODUCTION_CHECKLIST.md) y confirmar que el flujo de pago real funciona antes de
  anunciar la Tienda públicamente.
- Confirmar que `createPaymentProvider` rechaza arrancar si `PAYMENT_PROVIDER=mock` en
  `ENVIRONMENT=production` (test automático, `payment-factory.test.ts` - pero repetir la
  comprobación contra el Worker real desplegado no está de más).

## Coste

Cloudflare Pages, Workers y D1 tienen tier gratuito suficiente para el tráfico esperado de un
servidor de Minecraft de esta escala. El único coste fijo real de toda la arquitectura es el
dominio (ver DOMAIN_SETUP.md) - si el proveedor de pago real cobra comisión por venta (habitual,
ej. Stripe), esa comisión es variable, no fija.
