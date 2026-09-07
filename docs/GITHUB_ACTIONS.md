# GitHub Actions - CI/CD

## Workflows presentes

- **`web-ci.yml`** - push/PR que toque `web/**`. `npm ci` (instalación reproducible con
  lockfile, nunca `npm install` flotante), typecheck del Worker, **validación de migraciones D1**
  (`npm run validate:migrations` - nombres/orden/aplican limpio desde una BD vacía), tests, `astro
  check` + `astro build`. Sin secrets. `permissions: contents: read` (mínimo privilegio),
  `concurrency` cancela runs obsoletos, `timeout-minutes: 10` por job.
- **`web-deploy.yml`** - despliegue a Cloudflare Pages/Workers en push a main. Requiere secrets
  que todavía no existen (ver abajo) - se detiene de forma controlada (aviso, no error) hasta que
  se configuren. `permissions: contents: read` (el despliegue usa `CLOUDFLARE_API_TOKEN`, nunca
  el `GITHUB_TOKEN`). `concurrency` con `cancel-in-progress: false` (nunca cancelar un despliegue
  a mitad).
- **`minecraft-ci.yml`** (NUEVO, Production Hardening V1) - `progression_core` no tenía NINGÚN
  CI hasta esta sesión, pese a tener ~935 tests reales. Corre `./gradlew build` (tests + compile)
  solo cuando cambia `mods-source/progression_core/**`.
- **`launcher-ci.yml`** (NUEVO) - tests (80 reales) + `jpackageAppImage` (build, sin publicar)
  cuando cambia `launcher/**`. Corre en `windows-latest` (jpackage necesita Windows para un
  `.exe` real).
- **`launcher-release.yml`** (NUEVO) - publica una GitHub Release real del Launcher. Trigger:
  tag `launcher-v*`. Ver [GITHUB_RELEASES_LAUNCHER.md](GITHUB_RELEASES_LAUNCHER.md) para el
  detalle completo del pipeline (tests → build → SHA-256 → manifest → `gh release create`).
  `permissions: contents: write` (el único workflow que necesita escritura - crear la Release).

## Secrets necesarios para `web-deploy.yml` (NINGUNO configurado todavía)

Configúralos en GitHub → Settings → Secrets and variables → Actions:

| Secret | De dónde sale |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → crear uno con permiso "Edit Cloudflare Workers" + "Cloudflare Pages" |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → cualquier página del dashboard, columna derecha |
| `STORE_SERVER_TOKEN` | Generar con `openssl rand -hex 32` - el mismo valor debe configurarse en `progression_core` en el servidor Minecraft |
| `TEBEX_PUBLIC_TOKEN` | Cuando exista tienda Tebex real (ver TEBEX_SETUP.md) |
| `TEBEX_WEBHOOK_SECRET` | Cuando exista el endpoint webhook real configurado en Tebex |

Variables (no secrets, GitHub → ... → Variables) usadas por `web-deploy.yml`:
`PUBLIC_API_BASE_URL` (URL real del Worker desplegado), `PUBLIC_SITE_URL` (dominio real, para
SEO - ver `DOMAIN_SETUP.md`).

**`launcher-release.yml` no necesita ningún secret nuevo** - usa el `GITHUB_TOKEN` automático
(vía `gh` CLI) con permiso `contents: write` ya declarado en el propio workflow.

Nunca se han inventado valores de relleno para estos secrets ni en el repo ni en los workflows -
sin ellos, los jobs correspondientes simplemente no se ejecutan (gate explícito al principio).

## Publicación del Launcher (GitHub Releases) - preparado, no ejecutado

Ver [GITHUB_RELEASES_LAUNCHER.md](GITHUB_RELEASES_LAUNCHER.md) - pipeline completo preparado y
simulado localmente de punta a punta (build real, zip real, SHA-256 real, manifest real), nunca
ejecutado públicamente esta sesión (requiere un tag empujado a un repositorio remoto real).

## Permisos - principio de mínimo privilegio

| Workflow | `permissions` | Por qué |
|---|---|---|
| `web-ci.yml` | `contents: read` | Solo lee el repo para testear/buildear. |
| `web-deploy.yml` | `contents: read` | El despliegue usa el secret de Cloudflare, no el `GITHUB_TOKEN`. |
| `minecraft-ci.yml` | `contents: read` | Solo tests/build. |
| `launcher-ci.yml` | `contents: read` | Solo tests/build, nunca publica. |
| `launcher-release.yml` | `contents: write` | Único caso real que necesita escribir (crear la Release y subir sus assets). |

Ninguno usa `permissions: write-all` ni deja el permiso implícito por defecto - cada workflow
declara explícitamente lo mínimo que necesita.

## Dependabot

`.github/dependabot.yml` (nuevo) - vigilancia semanal de `npm` (`web/`), `gradle`
(`mods-source/progression_core/`, `launcher/app/`) y `github-actions`. **Nunca auto-merge** - cada
PR de Dependabot se revisa a mano (ver `PRODUCTION_SECURITY_AUDIT_V1.md`, Fase F, para el estado
actual de las dependencias y por qué no se forzaron actualizaciones mayores esta sesión).

## Por qué no se auto-generó ningún secret

Generar valores de relleno y commitearlos "para que funcione" sería peor que dejarlo pendiente:
un secret real debe generarse una sola vez y guardarse solo en los sitios que lo necesitan
(GitHub Secrets + `progression_core` + Worker) - nunca en el historial de Git.
