/**
 * Sistema `/vote` - lógica PURA del cliente de la página `vote.astro`, separada del `<script>`
 * inline para poder testearla con Vitest (mismo criterio que `server-status.ts`/
 * `launcher-download.ts`: nada de DOM aquí, solo funciones puras).
 *
 * V2 (2026-09-11) - "UN VOTO POR DÍA DE COBBLECRAFT" (ventana GLOBAL diaria anclada a
 * Europe/Madrid 00:00 por defecto, ver worker/src/lib/vote-period.ts) reemplaza al antiguo
 * cooldown rolling "última hora + N horas". El Worker ya no devuelve `nextAvailableAt`
 * (timestamp relativo al último voto) sino `nextResetAt` (el instante ABSOLUTO del próximo
 * reinicio diario, siempre en el huso horario configurado en el servidor - se muestra SIEMPRE en
 * Europe/Madrid para que sea el mismo instante para todos los jugadores, nunca convertido a la
 * zona horaria del navegador de cada uno).
 */

export type VoteApiState =
  | { state: "ready"; playerName: string }
  | { state: "already_voted"; nextResetAt: number; playerName: string }
  | { state: "used"; playerName: string }
  | { state: "expired" }
  | { state: "invalid" }
  | { state: "success"; playerName: string };

export type VotePanel = "explainer" | "loading" | "ready" | "success" | "already-voted" | "error";

/** A qué panel visual corresponde cada estado real devuelto por el Worker. */
export function panelForState(data: VoteApiState): VotePanel {
  switch (data.state) {
    case "ready":
      return "ready";
    case "success":
      return "success";
    case "already_voted":
      return "already-voted";
    case "used":
    case "expired":
    case "invalid":
      return "error";
  }
}

/** Texto de error humano por estado - nunca expone el string crudo del Worker. */
export function errorCopyForState(data: Extract<VoteApiState, { state: "used" | "expired" | "invalid" }>): { title: string; text: string } {
  if (data.state === "used") {
    return {
      title: "Este enlace ya se usó",
      text: "Vuelve al servidor y escribe /vote para generar un enlace nuevo cuando puedas volver a votar.",
    };
  }
  if (data.state === "expired") {
    return { title: "El enlace ha caducado", text: "Vuelve al servidor y escribe /vote para generar un enlace nuevo." };
  }
  return { title: "Enlace no válido", text: "Vuelve al servidor y escribe /vote para generar un enlace nuevo." };
}

/**
 * Formatea el próximo reinicio diario como fecha/hora real en Europe/Madrid (nunca la zona
 * horaria del navegador del jugador - el reinicio es un instante GLOBAL compartido, mostrarlo en
 * hora local de cada uno daría una hora distinta a cada jugador para el MISMO instante real).
 * Formato `DD/MM HH:mm` - sin ambigüedad incluso si el servidor configura una hora de reset
 * distinta de medianoche.
 */
export function formatNextReset(nextResetAtMs: number): string {
  // formatToParts + construcción manual (nunca `.format()` directo) - algunas combinaciones de
  // locale/ICU no rellenan "2-digit" con cero a la izquierda de forma consistente (visto en la
  // práctica: "16/6" en vez de "16/06") - esto garantiza el padding real siempre.
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(nextResetAtMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value.padStart(2, "0") ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour"); // quirk conocido de ICU con hour12:false.
  return `${get("day")}/${get("month")} ${hour}:${get("minute")} (Europe/Madrid)`;
}
