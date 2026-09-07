/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Base URL del Cloudflare Worker (API). Vacío = ningún componente que dependa de red se activa. */
  readonly PUBLIC_API_BASE_URL: string;
  /** "dev" (por defecto) muestra también productos `devOnly`; "prod" los excluye siempre. */
  readonly PUBLIC_STORE_ENV: "dev" | "prod";
  /** Dominio real de producción (Fase N - SEO). Vacío en DEV - nunca se inventa un dominio "publicado"; sin él, la página siempre se marca noindex y no se emite canonical/OG absoluto. */
  readonly PUBLIC_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
