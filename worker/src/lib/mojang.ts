import { normalizeMojangUuid } from "./ids";

export interface MojangProfile {
  uuid: string;
  name: string;
}

/**
 * Resolución legítima de identidad Minecraft (Parte C del encargo) - "NO autenticar mediante
 * password Minecraft/Microsoft... resolver identidad mediante un mecanismo legítimo apropiado".
 * Usa la API pública de Mojang (`api.mojang.com`, sin autenticación, sin credenciales) para
 * traducir un username a su UUID real - el MISMO mecanismo que usa cualquier lanzador/plugin
 * legítimo para resolver un nombre a una cuenta real. Nunca se pide contraseña ni token OAuth.
 */
export async function resolveMojangProfile(username: string): Promise<MojangProfile | null> {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return null;
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mojang API respondió ${res.status}`);
  const data = (await res.json()) as { id: string; name: string };
  return { uuid: normalizeMojangUuid(data.id), name: data.name };
}
