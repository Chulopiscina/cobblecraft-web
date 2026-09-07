# Cómo añadir un producto nuevo a la Tienda

Dos archivos, en este orden. **Ambos deben coincidir en `productId` y en el campo `delivery`** -
un test automático (`StoreCatalogConfigTest`, mod `progression_core`) falla el build si no.

## 1. `web/store/catalog.json` (catálogo público/comercial)

Añade una entrada al array `products`:

```jsonc
{
  "productId": "rank_vip",                 // snake_case, único, es la clave whitelist real
  "slug": "rango-vip",                      // usado en la URL /tienda/rango-vip
  "name": "Rango VIP",
  "description": "...",
  "category": "rangos",                     // "rangos" | "cosmeticos" | "items" | "otros"
  "icon": "/images/store/mi_icono.png",     // ver web/site/public/images/store/
  "priceCents": 1000,                       // SIEMPRE en céntimos, entero, nunca un float
  "currency": "EUR",
  "active": true,
  "devOnly": false,                         // false = visible tambien en produccion (revisa PRODUCTION_CHECKLIST.md antes)
  "delivery": { "type": "RANK", "rankId": "vip" },
  "limits": { "maxPerPlayer": null },
  "metadata": {}
}
```

Tipos de `delivery` soportados: `RANK` (`rankId`, `durationDays` opcional),
`CUSTOM_ITEM`/`COSMETIC` (`customItemId`, `amount`), `CURRENCY` (desactivado en V1, no publicar),
`BUNDLE` (`bundle: [...]`, cada elemento uno de los anteriores).

## 2. `mods-source/progression_core/.../store/StoreCatalogConfig.kt`

Añade la misma entrada al mapa `CATALOG`, con el MISMO `productId` y una construcción
equivalente de `DeliveryAction`:

```kotlin
"rank_vip" to DeliveryAction.Rank(rankId = "vip"),
```

Recompila y despliega el mod (`scripts/build-custom-mods.ps1` + reinicio del servidor) - sin
este paso, el producto se ve y se puede comprar en la web, pero **nunca se entrega** (el servicio
lo deja en reintento indefinido con un aviso claro en logs, nunca falla en silencio).

## 3. Si es `RANK`: crea el grupo real en LuckPerms

```
/lp creategroup vip
/lp group vip permission set <lo que corresponda>
```

## 4. Si es `CUSTOM_ITEM`/`COSMETIC`: usa un Custom Item ya existente

`customItemId` debe existir en `CustomItemRegistry` (ver `custom-items.properties` del propio
mod) - nunca se inventa un ID nuevo solo para la Tienda.

## 5. Antes de publicar en producción (`devOnly: false`, `active: true`)

- Revisar [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) completo - especialmente la postura
  "nunca pay-to-win" y la revisión legal de Términos/Reembolsos.
- Probar el flujo completo en DEV primero (ver LOCAL_DEVELOPMENT.md) con el producto marcado
  `devOnly: true`.
- Confirmar que `StoreCatalogConfigTest` pasa (`./gradlew test` en `mods-source/progression_core`).
