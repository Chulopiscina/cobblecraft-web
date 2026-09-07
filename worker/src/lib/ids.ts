/** Web Oficial V1 - generadores de identificadores opacos, nunca el id incremental de la fila. */

/** public_id de pedido: prefijo legible + 20 caracteres aleatorios base32 (sin ambigüedad 0/O/1/I). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomFrom(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function generateOrderPublicId(): string {
  return `ord_${randomFrom(ALPHABET, 20)}`;
}

/** Código de vinculación corto para `/web link AB12CD` - 6 caracteres, fácil de teclear en el juego. */
export function generateLinkCode(): string {
  return randomFrom(ALPHABET, 6);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Normaliza un UUID de Mojang sin guiones ("032e...") al formato con guiones estándar. */
export function normalizeMojangUuid(raw: string): string {
  const clean = raw.replace(/-/g, "").toLowerCase();
  if (clean.length !== 32) throw new Error(`UUID con longitud inesperada: ${raw}`);
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}
