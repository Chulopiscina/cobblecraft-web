import { z } from "zod";

export const StorePriceSchema = z.object({
  productId: z.string(), packageId: z.string(), source: z.literal("tebex"),
  available: z.boolean(), priceCents: z.number().int().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  billing: z.enum(["one_time", "subscription", "both"]).nullable(),
  disabled: z.boolean().nullable(), checkedAt: z.number(), expiresAt: z.number(),
  upstreamStatus: z.number().int().optional(),
  reason: z.enum(["credentials_missing", "upstream_unavailable", "invalid_package"]).optional(),
});
export const StorePricesSchema = z.object({serverTime:z.number(),prices:z.array(StorePriceSchema)});
export type StorePrice = z.infer<typeof StorePriceSchema>;

export function formatStorePrice(price: StorePrice): string {
  if (!price.available || price.priceCents === null || !price.currency) return "Precio no disponible";
  return new Intl.NumberFormat("es-ES",{style:"currency",currency:price.currency}).format(price.priceCents/100);
}
export function billingLabel(price: StorePrice): string {
  return price.billing === "one_time" ? "Pago único" : price.billing === "subscription" ? "Suscripción" : price.billing === "both" ? "Único o suscripción en Tebex" : "";
}
