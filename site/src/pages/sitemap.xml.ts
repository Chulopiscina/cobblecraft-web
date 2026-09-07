import type { APIRoute } from "astro";
import { getVisibleProducts } from "../lib/catalog";
import { categories as guideCategories } from "../data/guide/categories";
import { items as guideItems } from "../data/guide/items";

/**
 * Production Hardening V1, Fase N - sitemap.xml real (rutas reales del sitio, nunca inventadas),
 * generado solo con URLs absolutas cuando existe un `PUBLIC_SITE_URL` real - en DEV, sin dominio,
 * se sirve vacío en vez de anunciar `https://example.invalid` como si fuera un sitio real.
 *
 * Unificación visual + Guía CobbleCraft (2026-09-05) - añadido `/vote` (hueco real preexistente,
 * la página ya existía pero nunca se listó aquí) y todas las rutas reales de `/guia/*`
 * (categorías + fichas de ítem, derivadas de `data/guide/` - mismo patrón que `productPaths`
 * para la Tienda, nunca una lista repetida a mano).
 */
const STATIC_PATHS = ["/", "/jugar", "/servidor", "/tienda", "/vote", "/ayuda", "/guia", "/legal/terminos", "/legal/privacidad", "/legal/reembolsos"];

export const GET: APIRoute = () => {
  const siteUrl = (import.meta.env.PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "");
  if (!siteUrl) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n', {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  const productPaths = getVisibleProducts().map((p) => `/tienda/${p.slug}`);
  const guidePaths = [...guideCategories.map((c) => c.href), ...guideItems.map((i) => `/guia/items/${i.slug}`)];
  const allPaths = [...STATIC_PATHS, ...productPaths, ...guidePaths];

  const urls = allPaths.map((path) => `  <url><loc>${siteUrl}${path}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
