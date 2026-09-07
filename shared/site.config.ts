/**
 * Web Oficial V1 (2026-08-25) - fuente de verdad UNICA de identidad del servidor, reutilizada por
 * el frontend (Astro) y el backend (Worker). Pedido explicito: "quiero cambiar el nombre futuro
 * desde UN solo lugar".
 *
 * Rediseño visual V5 (2026-08-26): `serverName` renombrado a "CobbleCraft" por pedido explícito
 * del usuario (nombre definitivo, no provisional) - `launcher/config/server-branding.json`
 * `displayName` se actualizó igual en la misma sesión (ver `BrandingConfig.kt`), así que web y
 * Launcher Oficial vuelven a mostrar el mismo nombre. Quedan fuera de este cambio a propósito
 * `client-pack/README.md` y el motd real del servidor (`server.properties`) - son artefactos del
 * servidor de Minecraft, no de la web ni del Launcher.
 */
export const siteConfig = {
  serverName: "CobbleCraft",
  tagline: "Una experiencia de supervivencia y progresión Pokémon.",

  /** Mismos colores EXACTOS que `launcher/config/server-branding.json` - nunca un tema nuevo. */
  colors: {
    accentPrimary: "#D4AF37", // dorado
    accentSecondary: "#3FE0E0", // cyan
    backgroundDark: "#0B0E14",
  },

  /** Copia real de `launcher/assets/logo/hub_menu_emblem.png` (128x128) - nunca un logo inventado. */
  logo: {
    path: "/images/logo.png",
    alt: "Emblema de Servidor Cobblemon",
  },

  minecraft: {
    javaVersion: "1.21.1",
    cobblemonVersion: "1.7.3",
    loader: "Fabric",
    // launcher/config/launcher-config.json ramMinMb/ramMaxMb - misma fuente real, nunca inventada.
    ramMinMb: 2048,
    ramMaxMb: 4096,
  },

  /**
   * Descarga del Launcher Oficial - ver web/docs/LAUNCHER_DOWNLOAD.md para el detalle completo.
   * En PROD, `downloadUrl` apunta al asset real de la última GitHub Release (resuelto en runtime
   * por el Worker, `/api/launcher/latest` - nunca hardcodeado aqui). `devLocalNotice` se muestra
   * SOLO en entorno DEV mientras no exista ninguna Release publicada todavia.
   */
  launcher: {
    githubOwner: "REQUIERE-CONFIGURACION", // placeholder claro - ver DOMAIN_SETUP.md/GITHUB_ACTIONS.md
    githubRepo: "REQUIERE-CONFIGURACION",
    devLocalNotice:
      "Build local de desarrollo - la descarga pública real se activará cuando exista una GitHub Release publicada (ver launcher/docs/RELEASE_CHECKLIST.md).",
  },

  /** Nunca URLs ficticias "clicables" - null = seccion oculta hasta que exista un valor real. */
  links: {
    discord: "https://discord.gg/7pBm62xgUr" as string | null,
    website: null as string | null,
    supportEmail: null as string | null,
  },

  /** Nunca vender como terminado lo que sigue siendo framework/QA interna. */
  featureMaturity: {
    // Economía + Onboarding V1 (2026-09-03): 5 entrenadores reales desplegados (Nv.120-160),
    // fuente de dinero endgame repetible real - ya no es solo framework/QA.
    league: "real" as const,
    // CORREGIDO 2026-09-07 (el valor "false" del 2026-09-05 era un falso negativo real, ver
    // docs/qa/BETA_READINESS.md "CORRECCIÓN IMPORTANTE"): los 5 NPCs (Tienda/Mercado/Maestro de
    // Cacerías/Vendedor de Rocas/Encantador) SÍ están físicamente colocados y funcionan - la
    // consulta anterior fallaba porque `hub:hub` no tenía ningún chunk cargado con 0 jugadores
    // online, nunca porque los NPCs no existieran. Verificado en vivo forzando la carga del
    // área real del Hub y confirmando las 5 posiciones exactas.
    npcsPlaced: true,
    skinsAvailable: false, // Skin System V1 existe como framework, sin skins reales publicadas todavia
  },
} as const;

export type SiteConfig = typeof siteConfig;
