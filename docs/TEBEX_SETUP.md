# Tebex para CobbleCraft

Estado actual: tienda web preparada, pagos reales bloqueados hasta completar Tebex.

La web ya publica los 3 rangos permanentes y los 3 upgrades de diferencia en
`store/catalog.json`, pero `checkoutEnabled=false` hasta que existan los paquetes reales de
Tebex, el webhook firmado y el payout de la cuenta.

## Productos

| Producto | Precio | Entrega |
| --- | ---: | --- |
| Explorador | 14,99 EUR | `lp user {username} parent add explorer` |
| Maestro | 29,99 EUR | `lp user {username} parent add master` |
| Leyenda | 49,99 EUR | `lp user {username} parent add legend` |
| Upgrade Explorador -> Maestro | 15,00 EUR | pasar a `master` |
| Upgrade Maestro -> Leyenda | 20,00 EUR | pasar a `legend` |
| Upgrade Explorador -> Leyenda | 35,00 EUR | pasar a `legend` |

Los grupos reales verificados en LuckPerms son `explorer`, `master` y `legend`, con herencia
`legend -> master -> explorer`.

## Pasos manuales en Tebex

1. Crear/verificar la cuenta Tebex y una tienda de tipo Minecraft.
2. Completar identidad, datos fiscales y metodo de payout/banco desde el dashboard de Tebex.
3. Crear los 3 paquetes de rango permanente: Explorador, Maestro y Leyenda.
4. Configurar cada paquete para entregar el grupo LuckPerms correspondiente.
5. Crear los upgrades/tiered packages para que Tebex cobre solo la diferencia.
6. Crear el webhook hacia:
   `https://cobblemon-server-store.cobblemon-server.workers.dev/api/webhook/tebex`
7. Copiar el Headless/Public Token y el webhook secret.
8. Sustituir los placeholders `PENDIENTE_TEBEX_PACKAGE_ID_*` por IDs numericos reales en
   `store/catalog.json` y poner `checkoutEnabled=true` solo en productos ya probados.
9. Hacer compra de prueba real minima antes de anunciar la tienda.

## Secrets Cloudflare

Worker:

```bash
wrangler secret put TEBEX_PUBLIC_TOKEN
wrangler secret put TEBEX_WEBHOOK_SECRET
wrangler secret put STORE_SERVER_TOKEN
```

Variables no sensibles:

```bash
PAYMENT_PROVIDER=tebex
ENVIRONMENT=production
CORS_ALLOWED_ORIGIN=https://cobblemon-server-site.pages.dev
```

Pages:

```bash
PUBLIC_API_BASE_URL=https://cobblemon-server-store.cobblemon-server.workers.dev
PUBLIC_STORE_ENV=prod
PUBLIC_SITE_URL=https://cobblemon-server-site.pages.dev
```

## Flujo tecnico

1. El jugador abre `/tienda`, elige producto y escribe su usuario de Minecraft Java.
2. El Worker valida ese nombre con Mojang y crea un pedido en D1.
3. El Worker crea un basket Tebex Headless con `username`, `ip_address`, URLs de retorno y
   `custom.orderPublicId`.
4. El Worker anade el paquete Tebex whitelisteado por `metadata.tebexPackageId`.
5. El jugador paga en checkout hospedado por Tebex.
6. Tebex llama al webhook.
7. El Worker valida `X-Signature`, registra el evento para idempotencia y marca el pedido como
   `PAID`.
8. El servidor Minecraft reclama pedidos pagados usando `STORE_SERVER_TOKEN` y entrega solo
   acciones permitidas por su whitelist.

## Reembolsos y chargebacks

El Worker ya clasifica eventos de refund/chargeback como `failed`/no entregables. Antes de activar
ventas reales conviene decidir la politica operativa: retirada manual del rango, bloqueo de
beneficios, o revision caso por caso desde Tebex.

## Skins

La categoria Skins queda en la web como `Proximamente`. No hay skins, precios ni productos reales
todavia. Cuando existan, deben ser compra directa conocida con imagen/preview, nunca recompensa
aleatoria.

## Prohibido por defecto

No se publican llaves de crates ni loot aleatorio por dinero real.
