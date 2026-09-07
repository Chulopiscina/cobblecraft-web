/**
 * Web Oficial V1 - resolución de la descarga del Launcher Oficial. Pedido explícito: "no
 * hardcodear una URL absurda... preparar configuración launcher.downloadUrl/version/platform".
 *
 * El sitio es 100% estático (build-time), así que en vez de resolver la última release en cada
 * visita, el botón de descarga llama al Worker (`GET /api/launcher/latest`, ver
 * web/worker/src/routes/launcher.ts) - ese SÍ puede consultar la API real de GitHub Releases en
 * tiempo real sin necesitar rebuild de la web cada vez que se publica una versión nueva del
 * Launcher. En DEV (sin Worker corriendo o sin ninguna Release todavía), el botón muestra el
 * aviso `siteConfig.launcher.devLocalNotice` en vez de un enlace roto.
 */
import { siteConfig } from "@shared/site.config";

export interface LauncherDownloadInfo {
  available: boolean;
  url: string | null;
  version: string | null;
  notice: string | null;
}

/** Construye la URL del endpoint del Worker a partir de la env var pública inyectada en build (PUBLIC_API_BASE_URL). */
export function launcherApiEndpoint(apiBaseUrl: string): string {
  return `${apiBaseUrl}/api/launcher/latest`;
}

export const launcherDevPlaceholder: LauncherDownloadInfo = {
  available: false,
  url: null,
  version: null,
  notice: siteConfig.launcher.devLocalNotice,
};
