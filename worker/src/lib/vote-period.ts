/**
 * `/vote` V2 (2026-09-11, cambio de modelo: "UN VOTO POR DÍA DE COBBLECRAFT, ventana GLOBAL
 * diaria" - NUNCA "último voto + N horas rolling"). Ventana diaria FIJA anclada a un huso horario
 * IANA configurable (default `Europe/Madrid`) y una hora de reset local configurable (default
 * `00:00`) - debe manejar correctamente horario de verano/invierno (CET/CEST) y días de 23/25h.
 *
 * Solo usa `Intl.DateTimeFormat` (disponible nativamente en el runtime de Cloudflare Workers,
 * sin dependencias nuevas) - NUNCA aritmética manual de offset UTC (`timestamp / 86400000` NO
 * respeta zonas horarias ni DST, pedido explícito de NO hacerlo así).
 */

export interface VotePeriodConfig {
  timeZone: string;
  resetHour: number;
  resetMinute: number;
}

export function votePeriodConfigFromEnv(env: { VOTE_TIMEZONE?: string; VOTE_RESET_HOUR?: string; VOTE_RESET_MINUTE?: string }): VotePeriodConfig {
  const timeZone = env.VOTE_TIMEZONE?.trim() || "Europe/Madrid";
  const resetHour = clampInt(env.VOTE_RESET_HOUR, 0, 23, 0);
  const resetMinute = clampInt(env.VOTE_RESET_MINUTE, 0, 59, 0);
  return { timeZone, resetHour, resetMinute };
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i < min ? min : i > max ? max : i;
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  minutesOfDay: number; // 0-1439 (o excepcionalmente >=1440/negativo NUNCA - normalizado abajo)
}

/** Fecha/hora LOCAL real (en `timeZone`) de un instante UTC - vía Intl, nunca aritmética de offset a mano. */
function localPartsAt(ms: number, timeZone: string): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // Quirk conocido de ICU/Intl: con hour12:false, la medianoche puede reportarse como "24" en vez
  // de "00" en algunos motores - normalizado explícitamente, nunca asumido.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { year, month, day, minutesOfDay: hour * 60 + minute };
}

/**
 * `vote_period_id` real para el instante [ms] - un string `YYYY-MM-DD` estable que representa
 * "a qué día de voto pertenece este instante" según [config]. Si la hora local está ANTES del
 * reset configurado, pertenece todavía al día de voto ANTERIOR (ej. reset=06:00, votar a las
 * 03:00 del día 5 pertenece al período del día 4). Con el default reset=00:00 esto nunca resta
 * un día (0 minutos nunca es "antes de las 00:00").
 */
export function votePeriodId(ms: number, config: VotePeriodConfig): string {
  const local = localPartsAt(ms, config.timeZone);
  const resetMinutesOfDay = config.resetHour * 60 + config.resetMinute;
  // Ancla de fecha pura (mediodía UTC del día local calculado) - solo se usa para aritmética de
  // calendario (restar 1 día), nunca se reinterpreta como un instante real.
  let anchor = Date.UTC(local.year, local.month - 1, local.day, 12, 0, 0);
  if (local.minutesOfDay < resetMinutesOfDay) {
    anchor -= 24 * 60 * 60 * 1000;
  }
  const d = new Date(anchor);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Instante UTC (epoch ms) del PRÓXIMO reset diario estrictamente después de [afterMs] - usado
 * SOLO para mostrar "próximo voto disponible" al jugador, nunca para decidir si un voto se acepta
 * (eso es SIEMPRE una comparación directa de `votePeriodId`). Implementado por búsqueda binaria
 * sobre la MISMA función pura [votePeriodId] (nunca inversión manual de offset UTC->local, que
 * sería frágil ante DST) - funciona automáticamente con días de 23h/25h porque nunca asume que un
 * día dura 24h exactas, solo pregunta repetidamente "¿ya cambió el período?".
 */
export function nextVotePeriodResetAt(afterMs: number, config: VotePeriodConfig): number {
  const currentPeriod = votePeriodId(afterMs, config);
  let lo = afterMs;
  let hi = afterMs + 26 * 60 * 60 * 1000;
  while (votePeriodId(hi, config) === currentPeriod) {
    hi += 26 * 60 * 60 * 1000;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (votePeriodId(mid, config) === currentPeriod) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}
