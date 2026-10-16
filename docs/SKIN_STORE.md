# Skins directas (web 0.1.2)

## Fuentes de verdad

- `store/catalog.json`: precios EUR en centimos, textos, limites y recompensa real.
- `store/skins.json`: presentacion, modelo, textura, emisivo e icono por producto.
- `store/tebex-packages.json`: IDs REALES Tebex y verificacion explicita del servidor.
- `scripts/export-skin-previews.py`: exporta geometria/UV del juego y copia texturas sin modificar el cliente ni el RP. Falla si el generador de armaduras ya no coincide con el Kotlin real. Los JSON incluyen hashes de las fuentes.

| Producto web | Paquete Tebex | Precio | Entrega real en progression_core 0.18.11.85 |
| --- | --- | --- | --- |
| skin_armor_mewtwo | 7742868 | 4,99 EUR | ACCOUNT_COSMETIC -> armor_overlay_mewtwo |
| skin_armor_gyarados | 7742880 | 4,99 EUR | ACCOUNT_COSMETIC -> armor_overlay_gyarados |
| skin_pokemon_charizard_draconico | 7742881 | 3,99 EUR | COSMETIC -> 1 progression:cosmetics/skin_charizard_draconico |

Las armaduras se desbloquean en el ledger de cosmeticos existente (reintentar no duplica el desbloqueo); se equipan/quitan desde Menu del Servidor > Cosmeticos > Skins de armadura. No son los antiguos trims `dev_*`.

Charizard entrega el objeto real en inventario/buzon. El jugador aporta su Charizard sin otra skin, clic derecho al objeto, previsualizacion y confirmacion. Consume un objeto y la skin queda permanente en ese Pokemon. No se entrega un Pokemon.

## Bloqueos reales pendientes

Configurado en la sesion real de Tebex el 2026-10-16: categoria `Skins` (3475114) y los tres paquetes de la tabla, TODOS desactivados. Compra unica, sin suscripcion ni caducidad. Las dos armaduras tienen limite de una compra por usuario sin periodo; Charizard entrega un objeto por compra. No se han cambiado los rangos existentes ni creado claves.

El endpoint existente `https://cobblemon-server-store.cobblemon-server.workers.dev/api/webhook/tebex` esta suscrito a Payment Completed, Payment Refunded y disputas. La cuenta figura Pending Review. No hay comandos de juego/entregas paralelas en los paquetes: la unica entrega es webhook firmado -> cola Worker -> whitelist progression_core -> ACK. Solo los pedidos creados por la web llevan la identidad y metadatos necesarios; no vender estos paquetes desde un checkout independiente.

El checkout publico continua desactivado. `serverDeliveryVerified` y `saleLicenseVerified` son explicitamente false en las tres skins; ningun ID por si solo habilita cobros.

1. Instalar manualmente `progression_core-0.18.11.85.jar` en PebbleHost sustituyendo .84. No hace falta cambiar cliente/RP/pack, configuraciones, mundos o SQLite.
2. Falta `TEBEX_PRIVATE_KEY` en los secrets remotos del Worker (comprobado con `wrangler secret list`, sin mostrar valores). `TEBEX_PUBLIC_TOKEN` y `TEBEX_WEBHOOK_SECRET` si existen alli. La pagina Integrations > API Keys muestra Generate para la clave privada; no se genero acceso persistente sin autorizacion especifica. El titular debe generar/configurar la clave real con `npx wrangler secret put TEBEX_PRIVATE_KEY` desde `web/worker`. Nunca guardarla en Git/frontend ni copiarla a mensajes.
3. Completar la revision/habilitacion de Tebex y verificar los permisos comerciales de TODOS los recursos antes de marcar `saleLicenseVerified: true`. Charizard tiene el bloqueo de licencia concreto indicado abajo. No se han afirmado derechos comerciales por ser geometria propia ni por existir un paquete.
4. Verificar entrega real en el servidor sin compras reales (prueba sandbox apropiada, nunca simular pagos en produccion) y solo entonces marcar `serverDeliveryVerified: true` para cada paquete. Mantener el cierre global `TEBEX_CHECKOUT_ENABLED` y los paquetes/categoria Tebex desactivados hasta completar todos los requisitos. `subscriptionVerified` y los rangos NO se cambian para habilitar skins.
5. Volver a probar checkout, entrega, retry del webhook/ACK y precio/base currency exactos. Publicar el catalogo actualizado en Worker/Pages con el pipeline cuando corresponda. Activar solo los productos que hayan superado todas las comprobaciones, sin activar Charizard por haber verificado una armadura.

Las pruebas `skin-tebex-delivery.test.ts` usan los tres IDs reales pero firmas/credenciales de prueba, SQLite en memoria y red prohibida: verifican HMAC, producto/importe/destinatario, cola autenticada, claim exclusivo, ACK y reintentos idempotentes. No prueban ni alteran el inventario/ledger de PebbleHost; no equivalen a certificar la entrega in-game en produccion.

Charizard tiene un bloqueo ADICIONAL e independiente: el archivo de licencia del modelo derivado indica CC BY-NC 3.0 (uso no comercial). `saleLicenseVerified: false` impide activar su venta aun rellenando el paquete y verificando el servidor. Hace falta autorizacion comercial adecuada antes de cambiar esa marca; no se ha supuesto ni concedido permiso. La ficha conserva la atribucion y enlaza la licencia. Las armaduras usan la geometria propia de sus generadores, no este modelo derivado.

El precio nunca viene del navegador. Sin paquete real o sin verificacion de la entrega, la API devuelve 409 antes de crear un pedido/cobro. El cierre global tambien se mantiene. Las pruebas solo usan proveedores/datos locales; no simulan pagos en produccion.

## Publicacion aislada

Commit y push SOLO de los archivos de esta tarea. No usar `git add .`.

```sh
node scripts/deploy-store-prod.mjs --prepare --only-skins
node scripts/deploy-subscriptions-worker.mjs --catalog-only
node scripts/deploy-subscriptions-worker.mjs --deploy --catalog-only
node scripts/deploy-store-prod.mjs --deploy --only-skins
```

El pipeline usa fuentes comprometidas y el snapshot PROD verificado; conserva launcher, RP, guias, rangos y resto de paginas byte a byte. `--catalog-only` no ejecuta migraciones ni SQL remoto. Las previews se cargan bajo demanda con Three.js, renderizan solo al mover/redimensionar y tienen fallback si WebGL/modelo/textura falla.
