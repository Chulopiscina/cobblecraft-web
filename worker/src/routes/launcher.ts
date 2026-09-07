import type { Env } from "../types";
import { jsonResponse } from "../lib/security";

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}
interface GithubRelease {
  tag_name: string;
  assets: GithubReleaseAsset[];
}

interface LauncherManifest {
  launcherVersion: string;
  packVersion: string;
  filename: string;
  sha256: string;
  size: number;
  publishedAt: string;
  platform: string;
  minSupportedVersion: string | null;
}

/** Valida la forma real del manifest - nunca confía ciegamente en el JSON descargado. */
function parseManifest(raw: unknown): LauncherManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (
    typeof m.launcherVersion === "string" &&
    typeof m.packVersion === "string" &&
    typeof m.filename === "string" &&
    typeof m.sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(m.sha256) &&
    typeof m.size === "number" &&
    m.size > 0 &&
    typeof m.publishedAt === "string" &&
    typeof m.platform === "string"
  ) {
    return {
      launcherVersion: m.launcherVersion,
      packVersion: m.packVersion,
      filename: m.filename,
      sha256: m.sha256,
      size: m.size,
      publishedAt: m.publishedAt,
      platform: m.platform,
      minSupportedVersion: typeof m.minSupportedVersion === "string" ? m.minSupportedVersion : null,
    };
  }
  return null;
}

/**
 * GET /api/launcher/latest - resuelve la última GitHub Release real del Launcher Oficial
 * (Production Hardening V1, Fase D). Nunca hardcodea una URL. Prioriza `launcher-manifest.json`
 * (generado por `.github/workflows/launcher-release.yml`) - "no confiar únicamente en el nombre
 * del .exe" (pedido explícito): el manifest aporta versión real, packVersion, SHA-256 y tamaño
 * verificables. Si una Release no tiene manifest (legado/manual), cae a buscar un asset
 * `.zip`/`.exe` directamente, marcando `manifestPresent:false` para que el frontend sepa que no
 * hay checksum verificable. Nunca devuelve una URL falsa: cualquier fallo (GitHub caído, rate
 * limit, sin Release, asset roto) responde `available:false` con una `reason` clara.
 */
export async function handleLauncherLatest(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_LAUNCHER_REPO) {
    return jsonResponse(env, request, { available: false, reason: "not_configured" });
  }

  let release: GithubRelease;
  try {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_LAUNCHER_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "cobblemon-server-worker" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return jsonResponse(env, request, { available: false, reason: "not_published" });
    if (res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0") {
      return jsonResponse(env, request, { available: false, reason: "rate_limited" });
    }
    if (!res.ok) return jsonResponse(env, request, { available: false, reason: "fetch_error" });
    release = await res.json();
  } catch {
    return jsonResponse(env, request, { available: false, reason: "fetch_error" });
  }

  const manifestAsset = release.assets.find((a) => a.name === "launcher-manifest.json");
  if (manifestAsset) {
    try {
      const manifestRes = await fetch(manifestAsset.browser_download_url, { signal: AbortSignal.timeout(5000) });
      if (manifestRes.ok) {
        const manifest = parseManifest(await manifestRes.json());
        if (manifest) {
          // La URL de descarga real SIEMPRE se resuelve contra el asset REAL de la Release (nunca
          // se confía en una URL que el propio manifest pudiera declarar) - se busca por filename.
          const fileAsset = release.assets.find((a) => a.name === manifest.filename);
          if (fileAsset) {
            return jsonResponse(env, request, {
              available: true,
              manifestPresent: true,
              version: manifest.launcherVersion,
              packVersion: manifest.packVersion,
              url: fileAsset.browser_download_url,
              filename: manifest.filename,
              sha256: manifest.sha256,
              size: manifest.size,
              publishedAt: manifest.publishedAt,
              platform: manifest.platform,
            });
          }
          // El manifest referencia un fichero que no está entre los assets reales - release rota.
          return jsonResponse(env, request, { available: false, reason: "invalid_release" });
        }
      }
      // Manifest presente pero corrupto/malformado - fallback a la resolución legacy, no un 500.
    } catch {
      // Fallo de red descargando el manifest - fallback a la resolución legacy.
    }
  }

  // Legacy / sin manifest: busca un asset .zip (portable) o .exe suelto directamente.
  const fallbackAsset = release.assets.find((a) => a.name.toLowerCase().endsWith(".zip")) ?? release.assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
  if (!fallbackAsset) return jsonResponse(env, request, { available: false, reason: "no_asset" });
  return jsonResponse(env, request, {
    available: true,
    manifestPresent: false,
    version: release.tag_name.replace(/^launcher-v/, "").replace(/^v/, ""),
    url: fallbackAsset.browser_download_url,
    filename: fallbackAsset.name,
  });
}
