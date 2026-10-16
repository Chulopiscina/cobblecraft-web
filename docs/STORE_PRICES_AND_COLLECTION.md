# Tienda: precios Tebex y coleccion de 11 skins

## Estado y fuentes

`store/catalog.json` conserva la whitelist, condiciones y precios de referencia administrativa, NO precios actuales para cobrar o mostrar. `store/tebex-packages.json` enlaza los IDs reales. `store/skins.json` define las previews de los recursos existentes, sin crear skins de juego.

- Premium: Mewtwo y Gyarados (armaduras), 12,99 EUR; Charizard Draconico, 9,99 EUR.
- Economicas: Lucario Guardian Aura, Tyranitar Titan Esmeralda, Greninja Ninja de las Sombras y Ash Entrenador Legendario: 4,99 EUR.
- Pokemon: Gyarados Dragon Celestial, Crobat Prisma, Arcanine Guardian Solar y Luxray Emperador del Trueno: 3,99 EUR.
- Rangos sin modificaciones: paquetes 7664019/7664024/7664026.
- TODAS las skins siguen desactivadas en Tebex y tienen `serverDeliveryVerified=false`, `saleLicenseVerified=false`. Ni sincronizar precios ni recibir un ID cambia esos bloqueos.

Categoria Skins 3475114, apartados Armadura 3475343 y Pokemon 3475346. IDs creados sin duplicados:

| Skin | Tebex |
| --- | --- |
| Lucario Guardian Aura | 7743527 |
| Tyranitar Titan Esmeralda | 7743530 |
| Greninja Ninja de las Sombras | 7743533 |
| Ash Entrenador Legendario | 7743535 |
| Gyarados Dragon Celestial | 7743541 |
| Crobat Prisma | 7743543 |
| Arcanine Guardian Solar | 7743545 |
| Luxray Emperador del Trueno | 7743550 |

## Sincronizacion real

GET `/api/store/prices`: el Worker consulta la API Headless oficial con `TEBEX_PUBLIC_TOKEN` server-side. Nunca transmite el token al navegador ni acepta URLs/IDs de un cliente para consultar recursos arbitrarios. Solo consulta los paquetes de su whitelist.

Cache edge de 120 segundos para precios validos, 30 segundos para fallos. Clave de cache derivada por SHA-256, sin credenciales en la URL de cache. Se valida ID exacto, importe en centimos, divisa y modalidad. El endpoint publico es `no-store`. El navegador renueva cada minuto mientras la pagina este visible y elimina las cifras al caducar o fallar; no presenta precios compilados o caducados como vigentes. La divisa no se convierte ni se inventa. Se indica pago unico o suscripcion segun Tebex.

Al crear un checkout se vuelve a consultar Tebex sin cache, se verifica modalidad/disponibilidad y se compara el importe mostrado. Si cambio, se rechaza antes de crear/cobrar el pedido. El pedido guarda el precio acordado; el webhook sigue contrastando firma, paquete, importe y destinatario, con su idempotencia existente.

Prueba real del Worker: se detecto `Invalid redirect value` al usar `redirect:error`. Este runtime solo admite `follow/manual`. Se usa `manual` y se rechazan respuestas 3xx: no se siguen redirecciones ni se reenvian credenciales. El mismo adaptador de checkout recibio esa correccion minima.

Los tres rangos se leen correctamente: 399/699/999 centimos EUR y tipo subscription. Tebex devuelve HTTP 422 en los paquetes de skins desactivados. Se mantiene la restriccion: no se activa un producto para poder leer el precio. La web muestra precio no disponible cuando la API no proporciona uno verificable. Queda pendiente acceso oficial de catalogo que permita lectura de paquetes desactivados o su habilitacion futura tras cumplir TODOS los requisitos de entrega/licencias. El token publico se alineo con el de la sesion actual sin mostrarlo, almacenarlo en Git ni generar claves privadas.

## Entrega y gratuidad: pendientes comprobados

Los ocho IDs reales existen y sus modelos/texturas son exportables. Las armaduras usan `armor_overlay_lucario_aura`, `armor_overlay_tyranitar_emerald`, `armor_overlay_greninja_shadow`, `armor_overlay_ash_classic`. Los objetos Pokemon usan `progression:cosmetics/skin_gyarados_celestial`, `skin_crobat_prisma`, `skin_arcanine_solar`, `skin_luxray_emperador` bajo el mismo prefijo.

La whitelist `StoreCatalogConfig.kt` de la .85 preparada NO incluye estos ocho productId web. No se modifica el servidor en esta tarea. Debe conectarse y probarse antes de marcar `serverDeliveryVerified=true`. Las tres skins premium conservan su entrega previa preparada en .85; tampoco estan verificadas in-game.

La obtencion gratuita de las ocho esta declarada como coleccion de juego, pero sin fuente asignada en el codigo actual; no aparecen tampoco en la config local de recompensas. Se comunica como prevista y pendiente de activar, no como una recompensa ya disponible. No se anaden metodos de obtencion ni se modifican cofres/recompensas.

Los cinco modelos Pokemon son derivados de recursos Cobblemon con licencia no comercial. Se conservan atribuciones/licencias. Falta autorizacion comercial; los productos NO deben activarse mientras falte. Las armaduras tampoco se declaran automaticamente autorizadas para venta.

## Publicacion

```sh
node scripts/deploy-subscriptions-worker.mjs --deploy --catalog-only
node scripts/deploy-store-prod.mjs --prepare --whole-store
node scripts/deploy-store-prod.mjs --deploy --whole-store
```

Fuentes comprometidas exclusivamente de esta tarea. `--whole-store` actualiza tienda, las 14 fichas de rangos/skins y recursos asociados; conserva el resto del snapshot PROD, launcher, cliente y RP. `--catalog-only` NO ejecuta migraciones ni SQL remoto. No hay despliegue PebbleHost ni compras reales.
