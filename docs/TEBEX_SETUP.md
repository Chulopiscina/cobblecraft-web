# Tebex para CobbleCraft

Estado actual: preparado, no activo. No hay pagos reales, productos reales, precios ni claves en
el repositorio.

## Variables necesarias

Worker:

```bash
TEBEX_PUBLIC_TOKEN=
TEBEX_WEBHOOK_SECRET=
STORE_SERVER_TOKEN=
PAYMENT_PROVIDER=tebex
```

Pages:

```bash
PUBLIC_API_BASE_URL=https://cobblemon-server-store.cobblemon-server.workers.dev
PUBLIC_STORE_ENV=prod
PUBLIC_SITE_URL=https://cobblemon-server-site.pages.dev
```

Cuando exista dominio propio, `PUBLIC_SITE_URL` y `CORS_ALLOWED_ORIGIN` deben cambiar al dominio
final.

## Flujo preparado

1. Jugador entra en `/tienda`.
2. Selecciona un producto real publicado en el catálogo.
3. Escribe su usuario de Minecraft Java.
4. El Worker valida el usuario con Mojang.
5. El Worker crea un pedido en D1.
6. El Worker crea un basket Tebex y añade el paquete configurado en `metadata.tebexPackageId`.
7. El jugador paga en checkout hospedado por Tebex.
8. Tebex llama a `POST /api/webhook/tebex`.
9. El Worker valida `X-Signature`.
10. El pedido pasa a `PAID`.
11. El servidor Minecraft, cuando se active más adelante, reclama pedidos pendientes y entrega
    usando su whitelist local.

## Pasos que debe hacer el propietario en Tebex

1. Crear cuenta Tebex.
2. Crear una tienda Minecraft.
3. Configurar moneda y datos de payout/retirada.
4. Crear los paquetes reales, sin crates aleatorias de pago directo.
5. Copiar el identificador público Headless/API de la tienda para `TEBEX_PUBLIC_TOKEN`.
6. Crear un endpoint webhook apuntando a:
   `https://cobblemon-server-store.cobblemon-server.workers.dev/api/webhook/tebex`
7. Copiar el secreto de ese endpoint para `TEBEX_WEBHOOK_SECRET`.
8. Configurar las URLs de éxito/cancelación usando el dominio actual o el dominio definitivo.
9. Darme los IDs reales de paquetes Tebex para mapearlos en `web/store/catalog.json`.
10. Hacer una compra de prueba de importe mínimo antes de anunciar la tienda.

## Entrega futura con LuckPerms

No se implementa desde la web. El servidor debe traducir `productId` a acciones permitidas en su
propia whitelist. Para rangos, el concepto es:

```text
lp user <jugador> parent add <rango>
```

Para rangos temporales:

```text
lp user <jugador> parent addtemp <rango> <duracion>
```

No hay nombres de rangos reales todavía. La arquitectura deja espacio para rangos permanentes,
rangos temporales, kits periódicos, comandos con permisos, cooldowns, teletransportes especiales
y `/healing`, pero ninguna de esas ventajas está activada ni definida como producto comercial.

## Seguridad

- Secretos solo en Cloudflare Worker secrets.
- Nada de claves Tebex en Astro/frontend.
- Checkout hospedado por Tebex.
- Webhooks firmados con `X-Signature`.
- Idempotencia por `processed_webhooks(provider,event_id)`.
- Entrega separada y autenticada por `STORE_SERVER_TOKEN`.
- Reembolsos, chargebacks y cancelaciones quedan como eventos a revisar antes de activar pagos
  reales.

