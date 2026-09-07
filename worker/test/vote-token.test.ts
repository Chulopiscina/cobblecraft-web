import { describe, it, expect } from "vitest";
import { verifyVoteToken } from "../src/lib/vote-token";
import { signTestToken } from "./vote-helpers";

const SECRET = "test-vote-secret";
const UUID = "069a79f4-44e9-4726-a5be-fca90e38aaf5";

function freshPayload(overrides: Partial<{ uuid: string; playerName: string; issuedAt: number; expiresAt: number; nonce: string }> = {}) {
  const now = Date.now();
  return { uuid: UUID, playerName: "Notch", issuedAt: now, expiresAt: now + 10 * 60_000, nonce: crypto.randomUUID(), ...overrides };
}

describe("verifyVoteToken", () => {
  it("accepts a correctly signed, non-expired token", async () => {
    const payload = freshPayload();
    const token = await signTestToken(SECRET, payload);
    const result = await verifyVoteToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.uuid).toBe(UUID);
      expect(result.payload.playerName).toBe("Notch");
      expect(result.payload.nonce).toBe(payload.nonce);
    }
  });

  it("rejects a token signed with the WRONG secret (tampered/forged)", async () => {
    const token = await signTestToken("wrong-secret", freshPayload());
    const result = await verifyVoteToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("BAD_SIGNATURE");
  });

  it("rejects a token whose payload was tampered with after signing (playerName swapped)", async () => {
    const token = await signTestToken(SECRET, freshPayload());
    const [payloadB64, sig] = token.split(".");
    const tamperedPayload = payloadB64.slice(0, -2) + "xx"; // corrompe el base64 sin cambiar su longitud
    const result = await verifyVoteToken(`${tamperedPayload}.${sig}`, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejects an expired token even with a valid signature", async () => {
    const now = Date.now();
    const token = await signTestToken(SECRET, freshPayload({ issuedAt: now - 20 * 60_000, expiresAt: now - 60_000 }));
    const result = await verifyVoteToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("EXPIRED");
  });

  it("rejects a malformed token (no signature separator)", async () => {
    const result = await verifyVoteToken("not-a-real-token", SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MALFORMED");
  });

  it("rejects a token with an invalid UUID shape even if the signature would match", async () => {
    const token = await signTestToken(SECRET, freshPayload({ uuid: "not-a-uuid" }));
    const result = await verifyVoteToken(token, SECRET);
    expect(result.ok).toBe(false);
  });

  it("two tokens for the same player issued at different times never collide (different nonce)", async () => {
    const a = await signTestToken(SECRET, freshPayload());
    const b = await signTestToken(SECRET, freshPayload());
    const resultA = await verifyVoteToken(a, SECRET);
    const resultB = await verifyVoteToken(b, SECRET);
    expect(resultA.ok && resultB.ok).toBe(true);
    if (resultA.ok && resultB.ok) expect(resultA.payload.nonce).not.toBe(resultB.payload.nonce);
  });
});
