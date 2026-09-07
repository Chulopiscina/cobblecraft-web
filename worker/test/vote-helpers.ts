/** Helper de test compartido - firma un token EXACTAMENTE como `VoteTokenSigner.kt` (progression_core), ver vote-token.test.ts para el detalle del formato. */
export async function signTestToken(secret: string, payload: { uuid: string; playerName: string; issuedAt: number; expiresAt: number; nonce: string }): Promise<string> {
  const payloadStr = `${payload.uuid}|${payload.playerName}|${payload.issuedAt}|${payload.expiresAt}|${payload.nonce}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadStr));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const b64url = btoa(payloadStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url}.${hex}`;
}
