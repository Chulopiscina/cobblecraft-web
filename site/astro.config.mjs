import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

const sharedDir = fileURLToPath(new URL("../shared", import.meta.url));
const storeDir = fileURLToPath(new URL("../store", import.meta.url));
// Workspace npm (web/package.json) hoists dependencias comunes (astro, zod...) a `web/node_modules`
// en vez de `web/site/node_modules` - Vite necesita permiso explícito para servir desde ahí.
const webRootDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Web Oficial V1 - salida 100% estática (pedido explícito: "la web será principalmente
 * estática, con interactividad únicamente donde aporte valor"). Cloudflare Pages sirve el
 * `dist/` resultante directamente, sin runtime de servidor - el backend real vive en
 * `web/worker` (Cloudflare Worker aparte), nunca en un adapter SSR de Astro.
 */
export default defineConfig({
  output: "static",
  // PUBLIC_SITE_URL real (Fase N - SEO) cuando exista un dominio comprado, ver DOMAIN_SETUP.md -
  // placeholder claro (NUNCA "publicado") mientras tanto. `site:` de Astro se lee en tiempo de
  // config (process.env, no import.meta.env) - por eso no se usa el helper de env.d.ts aquí.
  site: process.env.PUBLIC_SITE_URL || "https://example.invalid",
  build: {
    format: "directory",
  },
  vite: {
    resolve: {
      alias: {
        "@shared": sharedDir,
        "@store": storeDir,
      },
    },
    server: {
      fs: {
        allow: [sharedDir, storeDir, webRootDir, fileURLToPath(new URL(".", import.meta.url))],
      },
    },
  },
});
