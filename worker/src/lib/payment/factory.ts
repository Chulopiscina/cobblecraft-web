import type { Env } from "../../types";
import type { PaymentProvider } from "./PaymentProvider";
import { MockPaymentProvider } from "./MockPaymentProvider";
import { StripePaymentProvider } from "./StripePaymentProvider";
import { TebexPaymentProvider } from "./TebexPaymentProvider";

/**
 * Parte M (Entornos) - "NO permitir MockPaymentProvider en PROD. Fail startup/build si intenta
 * habilitarse." Esta es la ÚNICA función que construye un [PaymentProvider] real - cualquier
 * ruta que necesite cobrar pasa por aquí, nunca instancia un provider directamente.
 */
export function createPaymentProvider(env: Env, siteBaseUrl: string): PaymentProvider {
  if (env.ENVIRONMENT === "production") {
    if (env.PAYMENT_PROVIDER === "mock") {
      throw new Error("Configuración inválida: MockPaymentProvider nunca puede usarse en producción (ENVIRONMENT=production).");
    }
    if (env.PAYMENT_PROVIDER === "tebex") {
      if (!env.TEBEX_PUBLIC_TOKEN || !env.TEBEX_WEBHOOK_SECRET) {
        throw new Error("Configuración inválida: producción con Tebex requiere TEBEX_PUBLIC_TOKEN y TEBEX_WEBHOOK_SECRET reales (ver web/docs/TEBEX_SETUP.md).");
      }
      return new TebexPaymentProvider(env.TEBEX_PUBLIC_TOKEN, env.TEBEX_WEBHOOK_SECRET);
    }
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Configuración inválida: producción requiere STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET reales (ver web/docs/PAYMENT_PROVIDER.md).");
    }
    return new StripePaymentProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  }

  if (env.PAYMENT_PROVIDER === "tebex") {
    if (!env.TEBEX_PUBLIC_TOKEN || !env.TEBEX_WEBHOOK_SECRET) {
      throw new Error("PAYMENT_PROVIDER=tebex requiere TEBEX_PUBLIC_TOKEN y TEBEX_WEBHOOK_SECRET (usa una tienda de prueba/sandbox si vas a probar en dev).");
    }
    return new TebexPaymentProvider(env.TEBEX_PUBLIC_TOKEN, env.TEBEX_WEBHOOK_SECRET);
  }

  // Desarrollo: Stripe SI puede probarse en dev si hay credenciales reales de test configuradas.
  if (env.PAYMENT_PROVIDER === "stripe") {
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
