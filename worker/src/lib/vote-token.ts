import { timingSafeEqual } from "./security";

/**
 * Sistema `/vote` (Web CobbleCraft V1) - verificacion SERVER-SIDE del token que Minecraft firma
 * localmente cuando un jugador ejecuta `/vote`. Diseño (pedido explicito, seccion 10/11 de la
 * especificacion): "NO quiero un simple ?player=X... Minecraft genera un token firmado/opaque...
 * La firma debe realizarse EN SERVIDOR." El servidor Minecraft firma con HMAC-SHA256 usando un
 * secreto compartido (`VOTE_SIGNING_SECRET`, mismo patron que `STORE_SERVER_TOKEN` - copiado a
 * mano una vez, nunca en git/frontend); el Worker recalcula la misma firma y compara en tiempo
 * constante. Cero dependencia de red para GENERAR el token (el comando `/vote` responde al
 * instante sin depender de que el Worker este disponible).
 *
 * Formato del token: `<base64url(payload)>.<hmac-sha256-hex>`, con
 * `payload = "<uuid>|<playerName>|<issuedAt>|<expiresAt>|<nonce>"`. El payload es SIEMPRE ASCII
 * (UUID hex+guiones, nombre de jugador `[A-Za-z0-9_]`, timestamps y nonce numericos/hex) - por
 * eso `atob`/`btoa` (disponibles tanto en Workers como en Node 18+) son suficientes, sin
 * necesitar un TextEncoder/TextDecoder para UTF-8 multibyte.
 */
export interface VoteTokenPayload {
  uuid: string;
  playerName: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export type VoteTokenVerifyResult =
  | { ok: true; payload: VoteTokenPayload }
  | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" };

function base64UrlDecodeAscii(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

export async function verifyVoteToken(token: string, secret: string): Promise<VoteTokenVerifyResult> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === token.length - 1) return { ok: false, reason: "MALFORMED" };
  const payloadB64 = token.slice(0, lastDot);
  const signatureHex = token.slice(lastDot + 1);

  let payloadStr: string;
  try {
    payloadStr = base64UrlDecodeAscii(payloadB64);
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }

  const parts = payloadStr.split("|");
  if (parts.length !== 5) return { ok: false, reason: "MALFORMED" };
  const [uuid, playerName, issuedAtStr, expiresAtStr, nonce] = parts;
  const issuedAt = Number(issuedAtStr);
  const expiresAt = Number(expiresAtStr);
  if (!UUID_RE.test(uuid) || !NAME_RE.test(playerName) || !nonce || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return { ok: false, reason: "MALFORMED" };
  }

  const expectedSignature = await hmacSha256Hex(secret, payloadStr);
  if (!timingSafeEqual(signatureHex.toLowerCase(), expectedSignature)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  if (Date.now() > expiresAt) return { ok: false, reason: "EXPIRED" };

  return { ok: true, payload: { uuid: uuid.toLowerCase(), playerName, issuedAt, expiresAt, nonce } };
}
