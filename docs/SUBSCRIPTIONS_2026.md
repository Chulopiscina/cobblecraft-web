# Suscripciones CobbleCraft (0.18.11.79)

## Estado comprobado

Produccion tiene TEBEX_PUBLIC_TOKEN y TEBEX_WEBHOOK_SECRET, pero NO TEBEX_PRIVATE_KEY.
TEBEX_CHECKOUT_ENABLED esta desactivado. No hay entregas verificadas. Los IDs actuales
7664019 / 7664024 / 7664026 corresponden al mapeo anterior; no se han convertido en
suscripciones desde el panel privado. subscriptionVerified=false evita cobrar el paquete
antiguo por error. No se ha realizado ningun cargo real ni se ha simulado un checkout PROD.

## Configuracion privada necesaria (en este orden)

1. En Tebex > Packages: crear o convertir Explorador 3.99 EUR, Maestro 6.99 EUR y Leyenda
   9.99 EUR. Recurring/subscription ONLY, cada 1 mes; sin pago unico alternativo, cantidad 1.
   No configurar comandos de entrega adicionales: progression_core usa el webhook firmado.
   Mantener historico de pedidos antiguos; no borrar compras previas ni sus destinatarios.
2. Settings > Checkout: Allow Gifting. El destinatario Minecraft se introduce en nuestra web
   y su UUID Java se resuelve server-side; no se confia en un UUID/precio del navegador.
3. Confirmar con Tebex una categoria/tier mutuamente excluyente por destinatario. No habilitar
   cambios inmediatos de tier: la API PATCH /tiers/{tierId} cambia inmediatamente y puede cobrar.
   El cambio automatico al siguiente ciclo queda BLOQUEADO hasta disponer de un mecanismo oficial
   confirmado. Nuestra web rechaza otro checkout durante un periodo activo o un checkout pendiente.
   Un checkout pendiente fallido por red conserva el bloqueo por seguridad; soporte solo debe
   liberarlo tras confirmar en Tebex que el basket ya no puede cobrar. No borrar locks a ciegas.
4. Developers > Webhooks: endpoint existente
   https://cobblemon-server-store.cobblemon-server.workers.dev/api/webhook/tebex
   Suscribir payment.completed/refunded/dispute.opened/dispute.lost y recurring-payment.started,
   renewed, ended, cancellation.requested, cancellation.aborted; validar firma con el secreto actual.
   Los eventos recurring-payment deben incluir initial_payment con custom.orderPublicId/playerUuid,
   last_payment, created_at, status y next_payment_at. Ausencia/inconsistencia se rechaza, no se inventa
   una duracion de 30 dias. No activar hasta probar la forma REAL de los webhooks con test payments.
5. Obtener PRIVATE KEY de Headless (NO Game Server secret). En web/worker:
   `npx wrangler secret put TEBEX_PRIVATE_KEY`
   Pegar exclusivamente en el prompt secreto de Wrangler, nunca en Git/Discord/chat.
6. Verificar cada ID, precio EUR, intervalo mensual y compra tipo subscription. Actualizar SOLO
   web/store/tebex-packages.json con los IDs reales si cambiaron, subscriptionVerified=true por paquete.
   Conservar el mapeo historico si se crean IDs distintos: los pedidos antiguos requieren sus IDs
   originales. No activar una conversion sin probar tambien un webhook historico.
7. Revision de monetizacion obligatoria antes de activar pagos:
   https://www.minecraft.net/en-us/usage-guidelines (Servers and hosting).
   No se permite ventaja competitiva. Curacion/servicios remotos y descuento de entrenamiento
   afectan progresion/economia; con rankings, mercado o PvP NO se puede certificar que sean
   inocuos. Revisar/reducir estas ventajas o solicitar confirmacion de Mojang/Tebex. Tambien exige
   acceso solo a usuarios con Minecraft original. No declaramos el catalogo aprobado legalmente.
8. Solo tras superar 1-7: TEBEX_CHECKOUT_ENABLED=true en el entorno Worker realmente desplegado,
   publicar el Worker y las fichas por scripts/deploy-store-prod.mjs. No basta cambiar el .env de Astro.
9. PebbleHost config/progression_core/store-delivery.properties: conservar token existente,
   enabled=true, api_base_url=https://cobblemon-server-store.cobblemon-server.workers.dev.
   server_token debe coincidir con STORE_SERVER_TOKEN del Worker. Nunca subir un placeholder.

## Entrega y caducidad

Journal D1 subscription_events: firma verificada, evento unico, transaccion atomica con marcador.
Renovaciones usan next_payment_at absoluto; reintentos no suman meses. Cancelar conserva el periodo,
ended lo termina; refund/dispute revocan el pago afectado, sin revocar una renovacion posterior valida.
Orden de llegada irrelevante: se reconstruye por periodo/fecha, no por tiempo de recepcion.
El endpoint autenticado /api/delivery/subscriptions?since=N devuelve estados versionados de cambios.
Minecraft persiste snapshot y cursor juntos (migracion 60); despues hace ACK. Crash antes/despues del
ACK se reconcilia sin doblar periodos. Expira localmente incluso si Worker esta offline. Un timer
en cada inicio/caducidad actualiza rango visible/arbol de comandos, sin polling por tick.
Solo un tier efectivo. Los grupos permanentes existentes siguen funcionando para identidades
no gestionadas por una nueva suscripcion; no hay migracion destructiva de compras antiguas.
Las suscripciones nuevas no ejecutan parent add permanente ni entregan kits semanales.

## Actividad

/actividad solo owner/Administrador/Moderador, respuesta efimera. Misma calculadora y embed del
resumen de medianoche. activity-today.json se exporta en JOIN/LEAVE y medianoche: lectura SQLite
sin modificar contadores. Las sesiones abiertas se extrapolan hasta heartbeat reciente, no downtime.
Requiere .79 en Pebble y bridge autenticado configurado en el bot. No se consulta SQLite por API.

Fuentes Tebex: https://docs.tebex.io/developers/webhooks/overview
https://docs.tebex.io/developers/headless-api/guides/tiers/update-tier
https://docs.tebex.io/creators/tebex-control-panel/payments-overview/recurring-payments
