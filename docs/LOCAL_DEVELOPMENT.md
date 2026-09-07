# Desarrollo local

Todo el flujo de la Tienda (crear pedido → pagar → entregar) puede probarse de principio a fin en
tu máquina sin ninguna cuenta de Cloudflare ni credenciales reales, usando `wrangler dev --local`
(Miniflare simula Workers + D1 localmente) y `MockPaymentProvider`.

## Requisitos

- Node.js 22+ (usa `node:sqlite`, ver nota de tests más abajo).
- Sin Cloudflare CLI login necesario para desarrollo local.

## Primera vez

```bash
cd web
npm install                        # instala worker + site (workspace npm)
npx playwright install chromium    # solo si vas a generar capturas (npm run screenshots)
```

## Backend (Worker + D1 local)

```bash
cd web/worker
cp .dev.vars.example .dev.vars     # nunca commitear .dev.vars real
npx wrangler d1 migrations apply cobblemon_store --local
npm run dev                        # http://127.0.0.1:8787
```

La D1 local vive en `web/worker/.wrangler/state/` (gitignored) - bórrala si quieres partir de una
base de datos vacía otra vez.

Comprobación rápida:

```bash
curl http://127.0.0.1:8787/api/health
# {"ok":true,"environment":"development"}
```

## Frontend (Astro)

```bash
cd web/site
cp .env.example .env               # PUBLIC_API_BASE_URL=http://127.0.0.1:8787
npm run dev                        # http://localhost:4321
```

Con `PUBLIC_API_BASE_URL` vacío, todos los widgets que dependen de red (estado del servidor,
descarga del Launcher, formulario de compra) se quedan en su estado "desactivado" seguro por
defecto - la web nunca rompe por no tener el Worker corriendo.

## Probar una compra completa sin dinero real

1. Con el Worker y el site corriendo, abre `http://localhost:4321/tienda`.
2. Entra en cualquier producto marcado `DEV`, escribe un nombre de usuario de Minecraft Java real
   (se valida contra la API pública de Mojang) y pulsa "Comprar".
3. Se te redirige a `/tienda/mock-checkout?order=...` - pulsa "Simular pago exitoso".
4. Se te redirige a `/tienda/gracias?order=...`, que consulta el estado real cada 3s.
5. El pedido queda en `PAID`, esperando a que "el servidor Minecraft" lo reclame. Como
   `progression_core` puede no estar corriendo en tu prueba, puedes simular esa parte a mano:

```bash
TOKEN=dev-local-server-token-change-me   # el mismo valor que STORE_SERVER_TOKEN en .dev.vars
ORDER=ord_XXXXXXXXXXXXXXXXXXXX             # el orderId real de tu pedido

curl -s http://127.0.0.1:8787/api/delivery/pending -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://127.0.0.1:8787/api/delivery/claim -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"orderId\":\"$ORDER\"}"
curl -s -X POST http://127.0.0.1:8787/api/delivery/ack   -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"orderId\":\"$ORDER\",\"result\":\"delivered\"}"
```

6. La página `/tienda/gracias` (que sigue haciendo polling) pasa a "¡Entregado!" sola, sin
   recargar - así es como se ve el flujo real una vez `progression_core` haga estos mismos tres
   pasos automáticamente.

Este flujo completo (con las comprobaciones de no-duplicado) se verificó manualmente contra un
Worker local real el 2026-08-25 - ver el resumen final del encargo para el detalle.

## Tests

```bash
cd web/worker && npm test          # 65 tests, node:sqlite + migraciones reales
cd web/worker && npm run build     # tsc --noEmit sobre src/
cd web/worker && npm run typecheck:test  # tsc --noEmit sobre test/ (tipos de Node)

cd web/site && npx astro check     # tipos de las páginas .astro
cd web/site && npx astro build     # build estático completo
```

Los tests del Worker usan `node:sqlite` (módulo nativo de Node, experimental pero sin
compilación nativa) en vez de `@cloudflare/vitest-pool-workers` - ese paquete falla de forma
reproducible en Windows cuando la ruta del repo contiene espacios (nuestro caso: "Servidor
Cobblemon"). Ver `web/worker/test/d1-fake.ts` para el detalle y el porqué.

## Capturas de pantalla automáticas

Con el site corriendo en `http://localhost:4321`:

```bash
cd web/site
npm run screenshots
```

Genera capturas en `web/docs/previews/` y ejecuta un smoke test básico (overflow horizontal,
imágenes rotas, errores de consola) - no sustituye una revisión visual humana real.
