# Skins directas (web 0.1.2)

## Fuentes de verdad

- `store/catalog.json`: precios EUR en centimos, textos, limites y recompensa real.
- `store/skins.json`: presentacion, modelo, textura, emisivo e icono por producto.
- `store/tebex-packages.json`: IDs REALES Tebex y verificacion explicita del servidor.
- `scripts/export-skin-previews.py`: exporta geometria/UV del juego y copia texturas sin modificar el cliente ni el RP. Falla si el generador de armaduras ya no coincide con el Kotlin real. Los JSON incluyen hashes de las fuentes.

| Producto web | Precio | Entrega real en progression_core 0.18.11.85 |
| --- | --- | --- |
| skin_armor_mewtwo | 4,99 EUR | ACCOUNT_COSMETIC -> armor_overlay_mewtwo |
| skin_armor_gyarados | 4,99 EUR | ACCOUNT_COSMETIC -> armor_overlay_gyarados |
| skin_pokemon_charizard_draconico | 3,99 EUR | COSMETIC -> 1 progression:cosmetics/skin_charizard_draconico |

Las armaduras se desbloquean en el ledger de cosmeticos existente (reintentar no duplica el desbloqueo); se equipan/quitan desde Menu del Servidor > Cosmeticos > Skins de armadura. No son los antiguos trims `dev_*`.

Charizard entrega el objeto real en inventario/buzon. El jugador aporta su Charizard sin otra skin, clic derecho al objeto, previsualizacion y confirmacion. Consume un objeto y la skin queda permanente en ese Pokemon. No se entrega un Pokemon.

## Bloqueos reales pendientes

El checkout publico estaba desactivado antes de esta tarea. No se han inventado IDs ni credenciales, ni activado pagos globalmente.

1. Instalar manualmente `progression_core-0.18.11.85.jar` en PebbleHost sustituyendo .84. No hace falta cambiar cliente/RP/pack, configuraciones, mundos o SQLite.
2. Crear tres paquetes de COMPRA UNICA en Tebex con los precios de la tabla, y poner sus IDs numericos reales en los tres `packageId: null` de `store/tebex-packages.json`. No usar suscripciones ni comandos de entrega paralelos: entrega exclusivamente por webhook y cola existente, no tambien mediante comandos Tebex.
3. Falta `TEBEX_PRIVATE_KEY` en los secrets remotos del Worker (comprobado con `wrangler secret list`, sin mostrar valores). `TEBEX_PUBLIC_TOKEN` y `TEBEX_WEBHOOK_SECRET` si existen alli. Configurar la clave privada real con `npx wrangler secret put TEBEX_PRIVATE_KEY` desde `web/worker`, y verificar el webhook `/api/webhook/tebex`, la habilitacion de la cuenta Tebex y su checkout. No guardar ninguna clave en Git ni en el frontend.
4. Verificar entrega real en el servidor y solo entonces marcar `serverDeliveryVerified: true` para cada paquete. Mantener el cierre global `TEBEX_CHECKOUT_ENABLED` hasta completar todos los requisitos. `subscriptionVerified` y los rangos NO se cambian para habilitar skins.
5. Volver a probar checkout, compra/entrega, retry del webhook/ACK y precio/base currency exactos. Publicar el catalogo actualizado en Worker y Pages con el pipeline.

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
