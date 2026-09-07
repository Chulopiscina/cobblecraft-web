# GitHub Releases del Launcher - pipeline completo

Preparado end-to-end (Production Hardening V1, Fase D). Nada de esto se ha ejecutado
públicamente esta sesión (requiere un tag real empujado a un repositorio con Actions habilitado)
- verificado en su lugar con una simulación 100% local (ver "Simulación local" abajo).

## Flujo real

```
git tag launcher-v1.0.0 && git push origin launcher-v1.0.0
  → .github/workflows/launcher-release.yml se dispara
    → checkout + JDK 21
    → verifica que gradle.properties (launcher_version) coincide EXACTAMENTE con el tag
    → ./gradlew test          (80 tests reales - la release NUNCA se publica si fallan)
    → ./gradlew jpackageAppImage
    → valida que el .exe existe y no está sospechosamente vacío
    → Compress-Archive → CobblemonServerLauncher-<version>-win64.zip
    → SHA-256 + tamaño reales del .zip
    → lee packVersion real de launcher/manifests/pack-manifest.json
    → genera launcher-manifest.json (ver esquema abajo)
    → gh release create (GITHUB_TOKEN automático, sin secret nuevo que configurar)
  → GitHub Release publicada con 2 assets: el .zip y el manifest
  → GET /api/launcher/latest (Worker) lo detecta automáticamente en la siguiente consulta
  → LauncherDownloadButton.astro muestra "Descargar Launcher (vX.Y.Z)" + SHA-256
```

## Por qué un `.zip`, no un `.exe` suelto

`jpackage --type app-image` genera una CARPETA autocontenida (el `.exe` + el runtime Java
bundleado vía jlink + las libs de la app) - el `.exe` por sí solo, sin sus carpetas hermanas
(`app/`, `runtime/`), no arranca. La unidad de distribución real es la carpeta completa,
comprimida como `.zip`. (Ver `launcher/docs/BUILD_WINDOWS.md`.)

## `launcher-manifest.json` - esquema real

```json
{
  "launcherVersion": "1.0.0",
  "packVersion": "1.0.0",
  "filename": "CobblemonServerLauncher-1.0.0-win64.zip",
  "sha256": "<64 caracteres hex reales>",
  "size": 81547124,
  "publishedAt": "2026-08-26T00:00:00Z",
  "platform": "windows-x64",
  "minSupportedVersion": null
}
```

`launcherVersion` (versión del propio Launcher) y `packVersion` (versión del pack de
mods/config/Cobblemon, `launcher/manifests/pack-manifest.json`) se mantienen **deliberadamente
separados** - actualizar el pack nunca requiere una Release nueva del Launcher (ver
`launcher/docs/RELEASE_CHECKLIST.md`), y viceversa.

## `GET /api/launcher/latest` - cómo lo consume el Worker

1. Si `GITHUB_LAUNCHER_REPO` no está configurado → `{available:false, reason:"not_configured"}`.
2. Consulta `GET https://api.github.com/repos/{repo}/releases/latest` (pública, sin auth).
3. Maneja explícitamente: sin release todavía (`not_published`), rate limit de GitHub
   (`rate_limited`, detectado por la cabecera `X-RateLimit-Remaining: 0`), y cualquier fallo de
   red (`fetch_error`) - nunca lanza, nunca devuelve una URL rota.
4. Busca el asset `launcher-manifest.json`. Si existe y es válido (`sha256` con formato real de
   64 caracteres hex, campos completos), **cruza el `filename` del manifest contra los assets
   REALES de la Release** (nunca confía en una URL que el manifest pudiera declarar por sí
   mismo) - si el fichero referenciado no está entre los assets, responde `invalid_release`.
5. Si no hay manifest (Release legado/manual) o está corrupto, cae a buscar directamente un
   asset `.zip` o `.exe` - `manifestPresent:false`, sin SHA-256 verificable.

Ver `web/worker/test/launcher.test.ts` (9 tests) para cada uno de estos caminos verificado
contra fixtures reales.

## Simulación local (Fase W - sin publicar nada)

Ejecutada el 2026-08-26 contra el proyecto real:

```powershell
cd launcher/app
./gradlew.bat jpackageAppImage
Compress-Archive -Path build/jpackage/CobblemonServerLauncher -DestinationPath CobblemonServerLauncher-1.0.0-win64.zip
Get-FileHash -Algorithm SHA256 CobblemonServerLauncher-1.0.0-win64.zip
```

Resultado real: `.zip` de 81.547.124 bytes (~77.8 MB), SHA-256 calculado con éxito, manifest
generado con el esquema exacto de arriba, validado contra la lógica real de
`handleLauncherLatest` (test dedicado que usa exactamente esta forma de manifest). El pipeline
completo - salvo el `gh release create` final, que requiere un repositorio remoto autenticado -
quedó verificado de punta a punta.

## Bug real encontrado y corregido: build no reproducible

`launcher/app/build.gradle` tenía una variable (`appImageDir`) apuntando a una carpeta
(`build/jpackage/app-image`) que `jpackage` nunca llega a escribir realmente (el `--dest` real
resuelve a `build/jpackage/<nombre-app>`) - la limpieza previa a cada build (`deleteDir()`) no
borraba nada real, así que una **segunda** ejecución consecutiva de `jpackageAppImage` fallaba
con `Application destination directory ... already exists`. Corregido apuntando la variable al
directorio REAL que jpackage genera - verificado ejecutando el build dos veces seguidas tras el
arreglo (ambas veces `BUILD SUCCESSFUL`). Sin este arreglo, `launcher-release.yml` habría fallado
en cualquier runner de CI que reutilizara un workspace con un build anterior.

## Qué falta para una release real

- [ ] Repositorio de GitHub real con Actions habilitado (puede ser este mismo si se hace
      público, o uno dedicado).
- [ ] `web/shared/site.config.ts` → `launcher.githubOwner`/`launcher.githubRepo` actualizados a
      los valores reales.
- [ ] `GITHUB_LAUNCHER_REPO` configurado como variable del Worker (`wrangler.toml` o secret,
      según se prefiera - no es sensible, puede ir como var pública).
- [ ] Certificado de firma de código (opcional, ver `launcher/docs/BUILD_WINDOWS.md`) - sin él,
      SmartScreen avisará la primera vez que un jugador ejecute el `.exe`.
- [ ] `git tag launcher-v1.0.0 && git push origin launcher-v1.0.0` (acción explícita de un
      humano, nunca automática).
