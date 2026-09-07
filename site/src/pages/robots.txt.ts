import type { APIRoute } from "astro";

/**
 * Production Hardening V1, Fase N - robots.txt dinámico (endpoint, no un fichero estático en
 * public/) para poder bloquear DEV/preview a propósito. `PUBLIC_STORE_ENV=prod` por sí solo NO
 * basta para permitir indexación - hace falta además un `PUBLIC_SITE_URL` real (nunca se anuncia
 * un dominio de ejemplo como si fuera el sitio publicado).
 */
export const GET: APIRoute = () => {
  const isProd = import.meta.env.PUBLIC_STORE_ENV === "prod";
  const siteUrl = (import.meta.env.PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "");
  const allowIndexing = isProd && !!siteUrl;

  const body = allowIndexing
    ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
