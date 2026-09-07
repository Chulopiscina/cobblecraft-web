import { describe, it, expect } from "vitest";
import { createPaymentProvider } from "../src/lib/payment/factory";
import type { Env } from "../src/types";

function makeEnv(overrides: Partial<Env>): Env {
  return {
    DB: {} as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
    ...overrides,
  };
}

describe("createPaymentProvider - Parte M: MockPaymentProvider nunca en PROD", () => {
  it("throws if ENVIRONMENT=production and PAYMENT_PROVIDER=mock", () => {
    const env = makeEnv({ ENVIRONMENT: "production", PAYMENT_PROVIDER: "mock" });
    expect(() => createPaymentProvider(env, "https://example.com")).toThrow(/nunca puede usarse en producción/);
  });

  it("throws if ENVIRONMENT=production without real Stripe credentials", () => {
    const env = makeEnv({ ENVIRONMENT: "production", PAYMENT_PROVIDER: "stripe" });
    expect(() => createPaymentProvider(env, "https://example.com")).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("succeeds in production only with real Stripe credentials present", () => {
    const env = makeEnv({ ENVIRONMENT: "production", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" });
    const provider = createPaymentProvider(env, "https://example.com");
    expect(provider.id).toBe("stripe");
  });

  it("succeeds in production with Tebex only when Tebex secrets are present", () => {
    const env = makeEnv({ ENVIRONMENT: "production", PAYMENT_PROVIDER: "tebex", TEBEX_PUBLIC_TOKEN: "public-token", TEBEX_WEBHOOK_SECRET: "webhook-secret" });
    const provider = createPaymentProvider(env, "https://example.com");
    expect(provider.id).toBe("tebex");
  });

  it("throws in production Tebex mode without Tebex configuration", () => {
    const env = makeEnv({ ENVIRONMENT: "production", PAYMENT_PROVIDER: "tebex" });
    expect(() => createPaymentProvider(env, "https://example.com")).toThrow(/TEBEX_PUBLIC_TOKEN/);
  });

  it("succeeds in development with mock when STORE_MOCK_SECRET is configured", () => {
    const env = makeEnv({ ENVIRONMENT: "development", PAYMENT_PROVIDER: "mock", STORE_MOCK_SECRET: "dev-secret" });
    const provider = createPaymentProvider(env, "http://localhost:4321");
    expect(provider.id).toBe("mock");
  });

  it("throws in development mock mode without STORE_MOCK_SECRET (never silently insecure)", () => {
    const env = makeEnv({ ENVIRONMENT: "development", PAYMENT_PROVIDER: "mock" });
    expect(() => createPaymentProvider(env, "http://localhost:4321")).toThrow(/STORE_MOCK_SECRET/);
  });
});
