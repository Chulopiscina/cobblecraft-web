export interface Env {
  DB: D1Database;
  ENVIRONMENT: "development" | "production";
  PAYMENT_PROVIDER: "mock" | "stripe" | "tebex";
  CORS_ALLOWED_ORIGIN: string;
  CLAIM_TIMEOUT_SECONDS: string;
  /** /vote V2 (2026-09-11) - "UN VOTO POR DIA DE COBBLECRAFT", ventana GLOBAL diaria anclada a un
   * huso horario IANA + hora de reset local configurables (ver lib/vote-period.ts). NUNCA rolling
   * "ultimo voto + N horas" - ese modelo (VOTE_COOLDOWN_HOURS) fue retirado. */
  VOTE_TIMEZONE?: string; // IANA (ej. "Europe/Madrid"), default Europe/Madrid.
  VOTE_RESET_HOUR?: string; // 0-23 hora LOCAL de reset diario, default 0.
  VOTE_RESET_MINUTE?: string; // 0-59 minuto LOCAL de reset diario, default 0.

  /** Secrets reales - NUNCA en wrangler.toml, siempre `wrangler secret put` o `.dev.vars` local (gitignored). */
  STORE_SERVER_TOKEN?: string; // Bearer token que valida al servidor Minecraft (Worker <-> progression_core) - REUTILIZADO por /api/vote/reward/*
  STORE_MOCK_SECRET?: string; // firma del "webhook" de MockPaymentProvider (SOLO development)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  TEBEX_PUBLIC_TOKEN?: string; // Identificador publico Headless API de la tienda Tebex.
  TEBEX_WEBHOOK_SECRET?: string; // Secreto de firma X-Signature para webhooks Tebex.
  GITHUB_LAUNCHER_REPO?: string; // "owner/repo" para /api/launcher/latest
  MC_STATUS_HOST?: string;
  MC_STATUS_PORT?: string;
  VOTE_SIGNING_SECRET?: string; // HMAC compartido con progression_core (VoteConfig) para firmar/verificar el token de /vote
}
