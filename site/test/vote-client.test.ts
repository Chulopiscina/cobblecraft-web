import { describe, it, expect } from "vitest";
import { panelForState, errorCopyForState, formatNextReset, type VoteApiState } from "../src/lib/vote-client";

describe("panelForState", () => {
  it("maps each real Worker state to the right visual panel", () => {
    const cases: Array<[VoteApiState, string]> = [
      [{ state: "ready", playerName: "Notch" }, "ready"],
      [{ state: "success", playerName: "Notch" }, "success"],
      [{ state: "already_voted", playerName: "Notch", nextResetAt: Date.now() + 1000 }, "already-voted"],
      [{ state: "used", playerName: "Notch" }, "error"],
      [{ state: "expired" }, "error"],
      [{ state: "invalid" }, "error"],
    ];
    for (const [input, expected] of cases) {
      expect(panelForState(input)).toBe(expected);
    }
  });
});

describe("errorCopyForState", () => {
  it("gives distinct, human copy for used vs expired vs invalid - never the raw Worker string", () => {
    const used = errorCopyForState({ state: "used", playerName: "Notch" });
    const expired = errorCopyForState({ state: "expired" });
    const invalid = errorCopyForState({ state: "invalid" });
    expect(used.title).not.toBe(expired.title);
    expect(used.title.toLowerCase()).toContain("ya se usó");
    expect(expired.title.toLowerCase()).toContain("caducado");
    expect(invalid.title.toLowerCase()).toContain("no válido");
    // Las 3 siempre indican el mismo siguiente paso real (generar un enlace nuevo con /vote).
    for (const copy of [used, expired, invalid]) {
      expect(copy.text).toContain("/vote");
    }
  });
});

describe("formatNextReset", () => {
  it("always renders in Europe/Madrid, regardless of the runtime's local timezone", () => {
    // 2026-06-16 00:00 CEST = 2026-06-15 22:00 UTC.
    const result = formatNextReset(Date.UTC(2026, 5, 15, 22, 0, 0));
    expect(result).toContain("Europe/Madrid");
    expect(result).toContain("00:00");
    expect(result).toContain("16/06");
  });

  it("reflects a non-midnight configured reset time correctly", () => {
    // 2026-06-16 06:30 CEST = 2026-06-16 04:30 UTC.
    const result = formatNextReset(Date.UTC(2026, 5, 16, 4, 30, 0));
    expect(result).toContain("06:30");
  });

  it("never returns the raw millisecond number as a string", () => {
    const ms = Date.UTC(2026, 5, 15, 22, 0, 0);
    const result = formatNextReset(ms);
    expect(result).not.toContain(String(ms));
  });
});
