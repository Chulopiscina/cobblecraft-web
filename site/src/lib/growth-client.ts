/**
 * COBBLECRAFT GROWTH - Fase 0: cliente de atribucion del sitio (navegador).
 *
 * Reglas de oro (ver docs/GROWTH_PHASE0.md):
 *  - **Growth nunca bloquea nada**: todas las llamadas son `fire-and-forget` con `keepalive`, con
 *    timeout corto y `try/catch`. Si el Worker esta caido, la descarga del launcher sigue igual.
 *  - **First party**: la unica cookie es `cc_ref` (nuestra, 90 dias, SameSite=Lax). Ningun tracker
 *    de terceros, ninguna cookie publicitaria.
 *  - **Sin datos personales**: al Worker solo se le manda el codigo de campana y la ruta. El IP
 *    nunca se envia (el Worker lo hashea por su cuenta, con su propia sal, y no lo guarda en claro).
 */
import { publicApiBaseUrl } from "./api-base";

export const REF_COOKIE = "cc_ref";
const REF_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const TOKEN_STORAGE_KEY = "cc_install_token";
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

function cookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function readCookieCampaign(): string | null {
  try {
    return normalizeCode(cookieValue(REF_COOKIE));
  } catch {
    return null;
  }
}

export function rememberCampaign(code: string): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${REF_COOKIE}=${encodeURIComponent(code)}; Max-Age=${REF_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* La atribucion nunca puede romper la pagina. */
  }
}

/** `?ref=` manda sobre la cookie (permite corregir una atribucion equivocada con un enlace nuevo). */
export function resolveCampaign(): string | null {
  try {
    const fromUrl = normalizeCode(new URLSearchParams(location.search).get("ref"));
    return fromUrl ?? readCookieCampaign();
  } catch {
    return null;
  }
}

function post(path: string, body: unknown): void {
  try {
    void fetch(`${publicApiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined);
  } catch {
    /* silencio a proposito */
  }
}

/** Analitica web first-party minima: `campaign_click` (pagina /ir), `jugar_view` (pagina /jugar). */
export function reportWebEvent(kind: "campaign_click" | "jugar_view", code: string, path = location.pathname): void {
  post("/api/growth/click", { ref: code, kind, path });
}

/**
 * Pide un token de instalacion de un solo uso para la campana. Se guarda en localStorage (y se
 * muestra como "codigo de campana" solo si el usuario lo pide) para el flujo explicito: pegarlo en
 * `install-token.txt` junto al launcher, que es la via fiable para que el launcher lo lea.
 * DEVUELVE el token o null; nunca lanza.
 */
export async function requestInstallToken(code: string): Promise<string | null> {
  try {
    const res = await fetch(`${publicApiBaseUrl}/api/growth/install-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: code }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: unknown };
    if (typeof data.token !== "string") return null;
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token: data.token, code, at: Date.now() }));
    } catch {
      /* almacenamiento no disponible: el token se usa igualmente en esta pagina */
    }
    return data.token;
  } catch {
    return null;
  }
}

export function readStoredToken(): { token: string; code: string } | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown; code?: unknown };
    if (typeof parsed.token !== "string" || typeof parsed.code !== "string") return null;
    return { token: parsed.token, code: parsed.code };
  } catch {
    return null;
  }
}

/**
 * Reescribe el boton de descarga del launcher para que pase por el Worker (`/api/growth/launcher-download`),
 * que cuenta la intencion de descarga y redirige al asset REAL de la GitHub Release. Si algo falla
 * (Worker caido, sin token), el `href` original se queda intacto: la descarga nunca se rompe.
 */
export function decorateDownloadLinks(code: string | null, token: string | null): void {
  const params = new URLSearchParams();
  if (code) params.set("ref", code);
  if (token) params.set("token", token);
  if ([...params.keys()].length === 0) return;
  const url = `${publicApiBaseUrl}/api/growth/launcher-download?${params.toString()}`;
  try {
    document.querySelectorAll<HTMLAnchorElement>("[data-launcher-download]").forEach((anchor) => {
      anchor.setAttribute("data-launcher-download-original", anchor.getAttribute("href") ?? "");
      anchor.setAttribute("href", url);
    });
  } catch {
    /* sin efecto: el enlace original sigue siendo valido */
  }
}

/**
 * Fase 0.1 (A1) - descarga SIN pasos manuales: el Worker sirve un instalador de arranque diminuto con
 * el codigo y el token dentro; el jugador solo lo abre y el instalador descarga el launcher, deja el
 * fichero de atribucion en su sitio y lo abre. Nunca copia ni pega nada.
 */
export function decorateBootstrapLink(code: string | null, token: string | null): void {
  const anchor = document.querySelector<HTMLAnchorElement>("[data-launcher-bootstrap]");
  if (!anchor) return;
  const params = new URLSearchParams();
  if (code) params.set("ref", code);
  if (token) params.set("token", token);
  anchor.setAttribute("href", `${publicApiBaseUrl}/api/growth/launcher-bootstrap?${params.toString()}`);
  if (code) anchor.hidden = false;
}
