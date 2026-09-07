# Proveedor de pago

## Abstracción (`web/worker/src/lib/payment/PaymentProvider.ts`)

```ts
interface PaymentProvider {
  readonly id: "mock" | "stripe" | "tebex";
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null>;
}
```

Ningún endpoint de pedidos llama directamente a un SDK de proveedor. Todo pasa por
`createPaymentProvider(env, siteBaseUrl)`, para que pedidos, webhooks e idempotencia vivan en una
capa común. El proveedor elegido para CobbleCraft es Tebex; Stripe queda como adapter legacy/no
recomendado para este proyecto.

## MockPaymentProvider - solo desarrollo

Simula un checkout hospedado (`/tienda/mock-checkout`) y una firma HMAC real con
`STORE_MOCK_SECRET`. Sigue el mismo camino de webhook que los proveedores reales y está prohibido
en `ENVIRONMENT=production`.

## TebexPaymentProvider - proveedor previsto

Implementado contra Tebex Headless API sin SDK ni secretos en frontend:

- crea un basket en `https://headless.tebex.io/api/accounts/{TEBEX_PUBLIC_TOKEN}/baskets`;
- añade el paquete configurado en `metadata.tebexPackageId`;
- devuelve una URL de checkout hospedada por Tebex;
- verifica webhooks con cabecera `X-Signature`.

Según la documentación oficial de Tebex, la firma de webhook se valida calculando primero
`SHA256(rawBody)` y después `HMAC-SHA256(bodyHash, TEBEX_WEBHOOK_SECRET)`. El Worker compara esa
firma con `timingSafeEqual`, registra `processed_webhooks(provider,event_id)` y solo entonces
marca el pedido como `PAID`.

Los rangos reales ya estan publicados como fichas de tienda, pero el checkout queda bloqueado
con `checkoutEnabled=false` hasta sustituir cada placeholder `metadata.tebexPackageId` por un ID
numerico real de Tebex y activar el producto de forma consciente.

## StripePaymentProvider - legacy

No es el proveedor objetivo de CobbleCraft. Se conserva para no romper pruebas/arquitectura
existente, pero `wrangler.toml` deja producción preparada para `PAYMENT_PROVIDER=tebex`.

## Confirmación de pago: siempre server-side

La entrega nunca depende de que el navegador vuelva a `/tienda/gracias`; esa página solo consulta
`GET /api/orders/:id`. El único camino que mueve un pedido a `PAID` es un webhook firmado,
verificado server-side por `processProviderWebhook`.

Si el jugador cierra el navegador a mitad del pago, el pedido igual se marca `PAID` cuando Tebex
envíe el webhook. La entrega Minecraft queda separada y autenticada con `STORE_SERVER_TOKEN`.
