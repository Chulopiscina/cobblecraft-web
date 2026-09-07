/**
 * Web Oficial V1 - estado del servidor Minecraft (ONLINE/OFFLINE/jugadores X/Y). Pedido
 * explícito: "no montar scraping raro" y "si no hay endpoint fiable todavía, mostrar el
 * componente desactivado en PROD" - se deja preparada la INTERFAZ, con una implementación
 * `DisabledServerStatusProvider` como valor por defecto real hasta que exista un endpoint
 * fiable (Server List Ping real desde el Worker, ver nota al final de este archivo).
 */
export type ServerStatusResult =
  | { state: "online"; playersOnline: number; maxPlayers: number }
  | { state: "offline" }
  | { state: "disabled" }; // el componente decide no intentar consultar nada

export interface ServerStatusProvider {
  fetchStatus(): Promise<ServerStatusResult>;
}

/** Valor por defecto real - nunca inventa un número de jugadores. */
export class DisabledServerStatusProvider implements ServerStatusProvider {
  async fetchStatus(): Promise<ServerStatusResult> {
    return { state: "disabled" };
  }
}

/**
 * Implementación real (cliente): consulta `${apiBaseUrl}/api/server/status` en el Worker - NUNCA
 * contacta el puerto de Minecraft directamente desde el navegador. Se activa pasando
 * `data-status-endpoint` en `<server-status-widget>` (ver ServerStatus.astro) - si el atributo no
 * está presente, el widget nunca hace ninguna petición de red (permanece "disabled").
 *
 * Lado Worker (preparado, ver web/worker/src/routes/server-status.ts): un Server List Ping (SLP)
 * real vía la Workers TCP Sockets API contra `MC_STATUS_HOST:MC_STATUS_PORT` - protocolo estándar
 * de Minecraft, NUNCA "scraping" de una web de terceros. Desactivado hasta que esas dos variables
 * de entorno estén configuradas en el Worker real (ver web/docs/PRODUCTION_CHECKLIST.md).
 */
export class HttpServerStatusProvider implements ServerStatusProvider {
  constructor(private readonly apiBaseUrl: string) {}

  async fetchStatus(): Promise<ServerStatusResult> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/server/status`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { state: "disabled" };
      const data = (await res.json()) as ServerStatusResult;
      return data;
    } catch {
      return { state: "disabled" };
    }
  }
}
