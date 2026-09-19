import type { Env } from "../types";

export function checkoutAvailable(env: Env): boolean {
  if (env.PAYMENT_PROVIDER !== "tebex") return env.ENVIRONMENT === "development";
  return env.TEBEX_CHECKOUT_ENABLED === "true" && Boolean(env.TEBEX_PUBLIC_TOKEN && env.TEBEX_PRIVATE_KEY && env.TEBEX_WEBHOOK_SECRET);
}
