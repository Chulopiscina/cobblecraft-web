# Checklist para publicar la Tienda real

V1 (2026-08-25) + Production Hardening V1 (2026-08-26) están completas y verificadas en local/
DEV. Esto es TODO lo que falta - por diseño, nada de esto se ha hecho porque requiere cuentas/
credenciales/decisiones que solo el usuario puede aportar. 13 pasos, en orden, con comandos
reales donde existen.

## Los 13 pasos

**1. Crear/conectar Cloudflare**
```bash
npx wrangler login
```

**2. Comprar/conectar el dominio** - ver [DOMAIN_SETUP.md](DOMAIN_SETUP.md) paso a paso.

**3. Añadir GitHub Secrets** (Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, y las variables (no secrets)
`PUBLIC_API_BASE_URL`, `PUBLIC_SITE_URL` (Settings → ... → Variables). Ver
[GITHUB_ACTIONS.md](GITHUB_ACTIONS.md).

**4. Crear D1 de producción**
```bash
cd web/worker
npx wrangler d1 create cobblemon_store
# copiar el database_id real a wrangler.toml ([[d1_databases]] Y [[env.production.d1_databases]])
npx wrangler d1 migrations apply cobblemon_store --remote
```

**5. Desplegar el Worker**
```bash
npx wrangler secret put STORE_SERVER_TOKEN --env production   # openssl rand -hex 32
npx wrangler secret put TEBEX_PUBLIC_TOKEN --env production
npx wrangler secret put TEBEX_WEBHOOK_SECRET --env production
npx wrangler deploy --env production
```
Actualiza también `[env.production].vars.CORS_ALLOWED_ORIGIN` en `wrangler.toml` al dominio real
(nunca dejar el placeholder) y `GITHUB_LAUNCHER_REPO` cuando exista.

**6. Desplegar Pages** - conectar el repo en el dashboard de Cloudflare Pages (root: `web/site`,
build: `npm install && npm run build`, output: `dist`) - ver
[CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md).

**7. Publicar una Release del Launcher**
```bash
git tag launcher-v1.0.0 && git push origin launcher-v1.0.0
```
Dispara `.github/workflows/launcher-release.yml` automáticamente - ver
[GITHUB_RELEASES_LAUNCHER.md](GITHUB_RELEASES_LAUNCHER.md).

**8. Configurar Tebex** - ver [TEBEX_SETUP.md](TEBEX_SETUP.md) y
[PAYMENT_PROVIDER.md](PAYMENT_PROVIDER.md). Confirma cuenta/payout, paquetes numericos,
webhook firmado y `PAYMENT_PROVIDER=tebex` (nunca `mock`) antes de poner `checkoutEnabled:true`.

**9. Revisar el catálogo comercial real** - ver [ADDING_PRODUCTS.md](ADDING_PRODUCTS.md). Los
rangos permanentes y sus upgrades ya son visibles en produccion, pero el checkout sigue bloqueado
hasta sustituir los placeholders de Tebex. Confirma que no hay llaves de crates ni loot aleatorio
por dinero real.

**10. Revisar legal** - `web/site/src/pages/legal/{terminos,privacidad,reembolsos}.astro` son
PLANTILLAS marcadas "REQUIERE REVISIÓN HUMANA ANTES DE PRODUCCIÓN". Revisar también las Minecraft
Usage Guidelines de Mojang y la ley de consumidores aplicable (derecho de desistimiento en
contenido digital).

**11. Activar `StoreDeliveryService`** - `server/config/progression_core/store-delivery.properties`
→ `enabled=true`, `api_base_url` y `server_token` reales (el MISMO valor que
`STORE_SERVER_TOKEN` del paso 5). Reiniciar el servidor y confirmar en logs que el polling
arranca sin errores.

**12. Hacer una compra de QA real** - de importe mínimo, de principio a fin (web → pago real →
entrega real en el servidor), antes de anunciar la Tienda públicamente.

**13. Producción** - anunciar. A partir de aquí, cada producto nuevo sigue
[ADDING_PRODUCTS.md](ADDING_PRODUCTS.md); cada incidente de entrega,
[DELIVERY_FAILURE_RECOVERY.md](DELIVERY_FAILURE_RECOVERY.md).

## QA visual pendiente

Capturas automáticas en `web/docs/previews/` (`npm run screenshots`) son solo un smoke test
técnico (overflow, imágenes rotas, errores de consola) - **QA VISUAL HUMANA sigue pendiente**,
nunca reemplazada por la comprobación automática.

## Coste fijo esperado

Solo el dominio. Cloudflare Pages/Workers/D1 en tier gratuito cubren el tráfico esperado (ver
[FREE_TIER_CAPACITY.md](FREE_TIER_CAPACITY.md) - estimado en ~2-4% del límite gratuito incluso en
el escenario más activo); el proveedor de pago cobra comisión variable por venta, nunca cuota
fija.

## Referencia rápida - documentación por tema

Arquitectura: [ARCHITECTURE.md](ARCHITECTURE.md) · Desarrollo local:
[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) · Seguridad:
[SECURITY.md](SECURITY.md) + [PRODUCTION_SECURITY_AUDIT_V1.md](PRODUCTION_SECURITY_AUDIT_V1.md) ·
Recuperación de fallos de entrega: [DELIVERY_FAILURE_RECOVERY.md](DELIVERY_FAILURE_RECOVERY.md) ·
Observabilidad: [OBSERVABILITY.md](OBSERVABILITY.md) · Capacidad/tier gratuito:
[FREE_TIER_CAPACITY.md](FREE_TIER_CAPACITY.md) · Carga: [LOAD_TEST_V1.md](LOAD_TEST_V1.md) ·
Launcher/Releases: [GITHUB_RELEASES_LAUNCHER.md](GITHUB_RELEASES_LAUNCHER.md) +
[LAUNCHER_DOWNLOAD.md](LAUNCHER_DOWNLOAD.md).
