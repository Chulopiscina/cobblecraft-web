import type { Env } from "../../types";
import type { PaymentProvider } from "./PaymentProvider";
import { MockPaymentProvider } from "./MockPaymentProvider";
import { StripePaymentProvider } from "./StripePaymentProvider";
import { TebexPaymentProvider } from "./TebexPaymentProvider";

type ProviderPurpose = "checkout" | "webhook";

/**
 * Parte M (Entornos) - "NO permitir MockPaymentProvider en PROD. Fail startup/build si intenta
 * habilitarse." Esta es la ÚNICA función que construye un [PaymentProvider] real - cualquier
 * ruta que necesite cobrar pasa por aquí, nunca instancia un provider directamente.
 */
export function createPaymentProvider(env: Env, siteBaseUrl: string, providerKind: Env["PAYMENT_PROVIDER"] = env.PAYMENT_PROVIDER, purpose: ProviderPurpose = "checkout"): PaymentProvider {
  if (env.ENVIRONMENT === "production") {
    if (providerKind === "mock") {
      throw new Error("Configuración inválida: MockPaymentProvider nunca puede usarse en producción (ENVIRONMENT=production).");
    }
    if (providerKind === "tebex") {
      if (!env.TEBEX_WEBHOOK_SECRET) {
        throw new Error("Configuración inválida: producción con Tebex requiere TEBEX_WEBHOOK_SECRET real (ver web/docs/TEBEX_SETUP.md).");
      }
      if (purpose === "checkout" && !env.TEBEX_PUBLIC_TOKEN) {
        throw new Error("Configuración inválida: checkout Tebex en producción requiere TEBEX_PUBLIC_TOKEN real (ver web/docs/TEBEX_SETUP.md).");
      }
      if (purpose === "checkout" && !env.TEBEX_PRIVATE_KEY) throw new Error("Checkout Minecraft requiere TEBEX_PRIVATE_KEY server-side.");
      return new TebexPaymentProvider(env.TEBEX_PUBLIC_TOKEN, env.TEBEX_WEBHOOK_SECRET, env.TEBEX_PRIVATE_KEY);
    }
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Configuración inválida: producción requiere STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET reales (ver web/docs/PAYMENT_PROVIDER.md).");
    }
    return new StripePaymentProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  }

  if (providerKind === "tebex") {
    if (!env.TEBEX_WEBHOOK_SECRET) {
      throw new Error("Webhook Tebex requiere TEBEX_WEBHOOK_SECRET (usa el secreto de la tienda Tebex configurado por wrangler secret).");
    }
    if (purpose === "checkout" && !env.TEBEX_PUBLIC_TOKEN) {
      throw new Error("Checkout Tebex requiere TEBEX_PUBLIC_TOKEN (usa una tienda de prueba/sandbox si vas a probar en dev).");
    }
    return new TebexPaymentProvider(env.TEBEX_PUBLIC_TOKEN, env.TEBEX_WEBHOOK_SECRET, env.TEBEX_PRIVATE_KEY);
  }

  // Desarrollo: Stripe SI puede probarse en dev si hay credenciales reales de test configuradas.
  if (providerKind === "stripe") {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("PAYMENT_PROVIDER=stripe requiere STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET (usa claves de test de Stripe en dev).");
    }
    return new StripePaymentProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  }

  if (!env.STORE_MOCK_SECRET) {
    throw new Error("PAYMENT_PROVIDER=mock requiere STORE_MOCK_SECRET (token local de desarrollo, ver .dev.vars.example).");
  }
  return new MockPaymentProvider(env.STORE_MOCK_SECRET, siteBaseUrl);
}
