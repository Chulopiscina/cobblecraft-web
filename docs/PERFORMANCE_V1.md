# Rendimiento (Fase G) - resultados reales de Lighthouse

Ejecutado localmente el 2026-08-26 con Lighthouse 13.4.1 (Chromium de Playwright, headless) -
nunca números inventados. Astro permanece 100% estático (`output: "static"`), sin hidratación
innecesaria - solo `<script>` puntuales para nav toggle, formulario de compra, y los tres widgets
que consultan el Worker (estado del servidor, descarga del Launcher, estado de pedido).

## Contra el build de PRODUCCIÓN real (`astro build` + `astro preview`, `PUBLIC_SITE_URL` real)

| Categoría | Puntuación |
|---|---|
| Performance | **100** |
| Accessibility | **100** |
| Best Practices | **100** |
| SEO | **100** |

Métricas: First Contentful Paint 0.3s · Largest Contentful Paint 0.3s · Total Blocking Time 0ms
· Cumulative Layout Shift 0 · Speed Index 0.3s.

## Contra el servidor de desarrollo (`astro dev`, sin `PUBLIC_SITE_URL`)

| Categoría | Puntuación |
|---|---|
| Performance | 81 (servidor dev sin optimizar, no representativo de producción) |
| Accessibility | **100** |
| Best Practices | **100** |
| SEO | 66 - **único fallo: "Page is blocked from indexing"** |

El SEO de 66 en DEV es el comportamiento **CORRECTO y buscado**: sin un `PUBLIC_SITE_URL` real,
`robots.txt` bloquea todo el sitio a propósito (ver `LAYOUT.astro`/`robots.txt.ts`, Fase N) -
nunca se quiere que un entorno de desarrollo/preview se indexe. En el build de producción real
(con dominio real configurado), este mismo check pasa y el SEO sube a 100 - confirmado arriba.

## Por qué el sitio es tan ligero

`dist/` completo pesa **187 KB** (build de producción, 11-15 páginas según el entorno). Cada
página HTML pesa entre 4 y 8 KB. Un único bundle CSS compartido de 8 KB (cacheado tras la
primera visita). El JS más pesado del sitio es de 4 KB (sin hidratación de componentes - los
`<script>` son vanilla JS, nunca un framework cliente). El logo (28 KB) es la imagen más pesada
del sitio entero.

## Qué NO se hizo (a propósito)

No se convirtió ninguna página estática en un componente hidratado. No se añadió ninguna
dependencia de optimización de imágenes (`sharp` ya viene con Astro pero no se usa activamente -
los assets fuente ya son pequeños). No se manipuló la página para "ganar puntos" - los números de
arriba son el resultado real y honesto de auditar el sitio tal y como quedó tras el trabajo de
Fase A-N, sin ningún ajuste dirigido a Lighthouse específicamente.
