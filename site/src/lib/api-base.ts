const configuredApiBase = (import.meta.env.PUBLIC_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "");

export const publicApiBaseUrl = configuredApiBase || "https://cobblemon-server-store.cobblemon-server.workers.dev";
