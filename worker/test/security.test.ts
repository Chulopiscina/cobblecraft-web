import { describe, it, expect } from "vitest";
import { corsHeaders, rateLimit, redactSecret } from "../src/lib/security";
import type { Env } from "../src/types";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
    ...overrides,
  };
}

describe("corsHeaders", () => {
  it("reflects the configured origin when it matches exactly", () => {
    const env = makeEnv();
    const req = new Request("http://worker.local/api/orders", { headers: { Origin: "http://localhost:4321" } });
    const headers = corsHeaders(env, req) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:4321");
  });

  it("never reflects an unexpected origin (no wildcard, no arbitrary echo)", () => {
    const env = makeEnv();
    const req = new Request("http://worker.local/api/orders", { headers: { Origin: "https://evil.example" } });
    const headers = corsHeaders(env, req) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("rateLimit", () => {
  it("allows up to the limit and then blocks within the same window", () => {
    const key = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000)).toBe(true);
    }
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("different keys have independent buckets", () => {
    const keyA = `test-a-${crypto.randomUUID()}`;
    const keyB = `test-b-${crypto.randomUUID()}`;
    expect(rateLimit(keyA, 1, 60_000)).toBe(true);
    expect(rateLimit(keyA, 1, 60_000)).toBe(false);
    expect(rateLimit(keyB, 1, 60_000)).toBe(true);
  });
});

describe("redactSecret", () => {
  it("never returns the full secret value", () => {
    const secret = "super-secret-token-value-12345";
    const redacted = redactSecret(secret);
    expect(redacted).not.toBe(secret);
    expect(redacted).not.toContain(secret);
  });

  it("reports a clear placeholder for an unset secret, never throws", () => {
    expect(redactSecret(undefined)).toBe("(no configurado)");
    expect(redactSecret(null)).toBe("(no configurado)");
  });
});
