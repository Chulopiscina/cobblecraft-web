# Descarga del Launcher Oficial

## Cómo se resuelve la URL de descarga

El sitio es 100% estático (build-time) - en vez de hardcodear una URL de descarga que quedaría
obsoleta en cada release nueva, el botón de descarga (`LauncherDownloadButton.astro`) llama en
tiempo real al Worker:

```
GET /api/launcher/latest
```

que a su vez consulta la API pública de GitHub:

```
GET https://api.github.com/repos/{GITHUB_LAUNCHER_REPO}/releases/latest
```

(`GITHUB_LAUNCHER_REPO` es una variable de entorno del Worker, no un secreto - repos públicos no
necesitan autenticación para esta llamada).

**Reforzado en Production Hardening V1** (ver
[GITHUB_RELEASES_LAUNCHER.md](GITHUB_RELEASES_LAUNCHER.md) para el detalle completo): el Worker
prioriza un asset `launcher-manifest.json` (generado por `.github/workflows/launcher-release.yml`)
en vez de confiar únicamente en el nombre del `.exe` - aporta versión real, `packVersion`,
SHA-256 y tamaño verificables, y **cruza la URL de descarga contra los assets REALES de la
Release** (nunca confía en una URL que el propio manifest pudiera declarar). Si una Release no
tiene manifest (legado/manual), cae a buscar un asset `.zip`/`.exe` directamente
(`manifestPresent:false`, sin checksum). El botón de descarga (`LauncherDownloadButton.astro`)
muestra el SHA-256 cuando el manifest está presente.

## Estado actual

`web/shared/site.config.ts` → `launcher.githubOwner`/`launcher.githubRepo` son placeholders
(`"REQUIERE-CONFIGURACION"`) - no existe todavía ninguna GitHub Release real del Launcher. Hasta
que exista, `/api/launcher/latest` responde `{"available": false, "reason": "not_configured"}` (o
`"not_published"`/`"rate_limited"`/`"fetch_error"` según el caso real - nunca un estado genérico)
y el botón de la web muestra el aviso `siteConfig.launcher.devLocalNotice` en vez de un enlace
roto - **nunca** un enlace que apunte a un binario inexistente.

## Nunca se construyó otro Launcher

Por pedido explícito, esta tarea NO crea un launcher nuevo - reutiliza el Launcher Oficial ya
existente en el repo (`launcher/`, `CobblemonServerLauncher.exe`). La web es solo el punto de
distribución/descarga, nunca una reimplementación.

## Para publicar una versión real

1. Confirma que `launcher/app/gradle.properties` (`launcher_version`) tiene la versión que
   quieres publicar.
2. Actualiza `web/shared/site.config.ts` con el owner/repo reales del repositorio que alojará las
   Releases (puede ser este mismo repo si se hace público, o uno dedicado), y
   `GITHUB_LAUNCHER_REPO` en la config del Worker.
3. `git tag launcher-v1.0.0 && git push origin launcher-v1.0.0` - dispara
   `.github/workflows/launcher-release.yml` automáticamente (tests → build → zip → SHA-256 →
   manifest → Release). Ver [GITHUB_RELEASES_LAUNCHER.md](GITHUB_RELEASES_LAUNCHER.md).
4. El botón de la web empieza a funcionar automáticamente en la siguiente consulta (no hace
   falta rebuild del sitio - la resolución es en tiempo de petición vía el Worker).

## RAM recomendada

`siteConfig.minecraft.ramMinMb`/`ramMaxMb` (2048/4096) están copiados literalmente de
`launcher/config/launcher-config.json` - nunca un número inventado para la web. Si cambia la
config real del Launcher, actualiza ese único archivo (`site.config.ts`) para que la web quede
sincronizada.

## Reproducibilidad del build (auditado, Production Hardening V1)

`launcher/app/build.gradle` no depende de ninguna ruta personal - todo usa
`layout.buildDirectory`/`projectDir`/propiedades de Gradle. Se encontró y corrigió un bug real de
reproducibilidad: `jpackageAppImage` limpiaba una carpeta (`build/jpackage/app-image`) distinta
de la que `jpackage` realmente escribe (`build/jpackage/<nombre-app>`), así que una segunda
ejecución consecutiva fallaba con "Application destination directory ... already exists" -
verificado en vivo (falló, se corrigió, se comprobó que dos builds seguidos funcionan). Ver
[GITHUB_RELEASES_LAUNCHER.md](GITHUB_RELEASES_LAUNCHER.md) para el detalle.

## Pasos que la web NUNCA pide al jugador

Copiar mods a mano, instalar Fabric manualmente, tocar `.minecraft`, instalar Java por separado -
todo eso lo hace el propio Launcher Oficial. La página `/jugar` y `/ayuda` solo describen:
descargar → abrir → el Launcher prepara Minecraft+Fabric+Cobblemon → iniciar sesión de
Microsoft/Minecraft desde el propio Launcher → jugar.
