import { normalizeMojangUuid } from "./ids";

export interface MojangProfile {
  uuid: string;
  name: string;
}

type ProfileEndpoint = {
  name: string;
  url: (username: string) => string;
  parse: (data: unknown) => MojangProfile | null;
  isNotFound?: (status: number, data: unknown) => boolean;
};

const PROFILE_ENDPOINTS: ProfileEndpoint[] = [
  {
    name: "Minecraft Services profile lookup",
    url: (username) => `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(username)}`,
    parse: parseFlatProfile,
  },
  {
    name: "Mojang legacy profile lookup",
    url: (username) => `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
    parse: parseFlatProfile,
  },
  {
    name: "PlayerDB Minecraft profile lookup",
    url: (username) => `https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`,
    parse: parsePlayerDbProfile,
    isNotFound: (status, data) => status === 400 && findString(data, ["code"]) === "minecraft.invalid_username",
  },
];

function timeoutSignal(ms: number): AbortSignal | undefined {
  const abortSignal = AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal };
  return abortSignal.timeout?.(ms);
}

function findString(value: unknown, path: string[]): string | undefined {
  let cursor = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.length > 0 ? cursor : undefined;
}

function parseFlatProfile(data: unknown): MojangProfile | null {
  const id = findString(data, ["id"]);
  const name = findString(data, ["name"]);
  if (!id || !name) return null;
  return { uuid: normalizeMojangUuid(id), name };
}

function parsePlayerDbProfile(data: unknown): MojangProfile | null {
  const id = findString(data, ["data", "player", "raw_id"]) ?? findString(data, ["data", "player", "id"]);
  const name = findString(data, ["data", "player", "username"]);
  if (!id || !name) return null;
  return { uuid: normalizeMojangUuid(id), name };
}

/**
 * Resolución legítima de identidad Minecraft (Parte C del encargo) - "NO autenticar mediante
 * password Minecraft/Microsoft... resolver identidad mediante un mecanismo legítimo apropiado".
 * Usa endpoints públicos oficiales de Minecraft/Mojang, sin autenticación ni credenciales, para
 * traducir un username a su UUID real. Nunca se pide contraseña ni token OAuth.
 */
export async function resolveMojangProfile(username: string): Promise<MojangProfile | null> {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return null;

  const errors: string[] = [];
  for (const endpoint of PROFILE_ENDPOINTS) {
    let res: Response;
    try {
      res = await fetch(endpoint.url(username), {
        headers: { Accept: "application/json" },
        signal: timeoutSignal(5000),
      });
    } catch {
      errors.push(`${endpoint.name}: timeout o red`);
      continue;
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    if (res.status === 404 || endpoint.isNotFound?.(res.status, data)) return null;
    if (!res.ok) {
      errors.push(`${endpoint.name} respondió ${res.status}`);
      continue;
    }
    const profile = endpoint.parse(data);
    if (!profile) {
      errors.push(`${endpoint.name} no devolvió id/name`);
      continue;
    }
    return profile;
  }

  throw new Error(errors.join("; ") || "No se pudo resolver el perfil Minecraft");
}
