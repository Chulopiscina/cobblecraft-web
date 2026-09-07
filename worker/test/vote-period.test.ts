import { describe, expect, it } from "vitest";
import { votePeriodId, nextVotePeriodResetAt, votePeriodConfigFromEnv, type VotePeriodConfig } from "../src/lib/vote-period";

const MADRID_MIDNIGHT: VotePeriodConfig = { timeZone: "Europe/Madrid", resetHour: 0, resetMinute: 0 };

describe("votePeriodId - Europe/Madrid, reset 00:00 (default)", () => {
  it("two instants on the same local calendar day share the same period", () => {
    // 2026-06-15 10:00 CEST (UTC+2) and 23:30 CEST - same local day.
    const morning = Date.UTC(2026, 5, 15, 8, 0, 0);
    const night = Date.UTC(2026, 5, 15, 21, 30, 0);
    expect(votePeriodId(morning, MADRID_MIDNIGHT)).toBe(votePeriodId(night, MADRID_MIDNIGHT));
  });

  it("23:59 local and 00:01 local three minutes later belong to DIFFERENT periods - the core daily-reset requirement", () => {
    // 2026-06-15 23:59 CEST = 21:59 UTC. +3 minutes = 2026-06-16 00:02 CEST = 22:02 UTC.
    const beforeMidnight = Date.UTC(2026, 5, 15, 21, 59, 0);
    const afterMidnight = Date.UTC(2026, 5, 15, 22, 2, 0);
    const before = votePeriodId(beforeMidnight, MADRID_MIDNIGHT);
    const after = votePeriodId(afterMidnight, MADRID_MIDNIGHT);
    expect(before).not.toBe(after);
    expect(before).toBe("2026-06-15");
    expect(after).toBe("2026-06-16");
  });

  it("never uses rolling 24h math - two votes 20 hours apart but crossing local midnight are DIFFERENT periods", () => {
    // 2026-06-15 08:00 CEST and 2026-06-16 04:00 CEST are only 20h apart, but different calendar days.
    const first = Date.UTC(2026, 5, 15, 6, 0, 0);
    const second = Date.UTC(2026, 5, 16, 2, 0, 0);
    expect(second - first).toBe(20 * 60 * 60 * 1000);
    expect(votePeriodId(first, MADRID_MIDNIGHT)).not.toBe(votePeriodId(second, MADRID_MIDNIGHT));
  });

  it("returns a stable YYYY-MM-DD string", () => {
    expect(votePeriodId(Date.UTC(2026, 5, 15, 10, 0, 0), MADRID_MIDNIGHT)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("votePeriodId - DST transitions (CET/CEST, Europe/Madrid)", () => {
  it("the spring-forward 23-hour day (2026-03-29) still keys as one single calendar day", () => {
    // 00:30 CET (before the 01:00 UTC jump) and 12:00 CEST (after) - both still "March 29" locally.
    const beforeJump = Date.UTC(2026, 2, 28, 23, 30, 0); // 2026-03-29 00:30 CET
    const afterJump = Date.UTC(2026, 2, 29, 10, 0, 0); // 2026-03-29 12:00 CEST
    expect(votePeriodId(beforeJump, MADRID_MIDNIGHT)).toBe("2026-03-29");
    expect(votePeriodId(afterJump, MADRID_MIDNIGHT)).toBe("2026-03-29");
  });

  it("the fall-back 25-hour day (2026-10-25) still keys as one single calendar day", () => {
    const beforeJump = Date.UTC(2026, 9, 25, 0, 30, 0); // 2026-10-25 02:30 CEST
    const afterJump = Date.UTC(2026, 9, 25, 10, 0, 0); // 2026-10-25 11:00 CET (post fall-back)
    expect(votePeriodId(beforeJump, MADRID_MIDNIGHT)).toBe("2026-10-25");
    expect(votePeriodId(afterJump, MADRID_MIDNIGHT)).toBe("2026-10-25");
  });

  it("periods still change correctly across the spring-forward midnight boundary", () => {
    const mar28 = Date.UTC(2026, 2, 28, 12, 0, 0); // 2026-03-28 13:00 CET
    const mar29 = Date.UTC(2026, 2, 29, 12, 0, 0); // 2026-03-29 14:00 CEST
    expect(votePeriodId(mar28, MADRID_MIDNIGHT)).toBe("2026-03-28");
    expect(votePeriodId(mar29, MADRID_MIDNIGHT)).toBe("2026-03-29");
  });

  it("periods still change correctly across the fall-back midnight boundary", () => {
    const oct24 = Date.UTC(2026, 9, 24, 12, 0, 0);
    const oct25 = Date.UTC(2026, 9, 25, 12, 0, 0);
    expect(votePeriodId(oct24, MADRID_MIDNIGHT)).toBe("2026-10-24");
    expect(votePeriodId(oct25, MADRID_MIDNIGHT)).toBe("2026-10-25");
  });
});

describe("votePeriodId - configurable non-midnight reset", () => {
  const RESET_6AM: VotePeriodConfig = { timeZone: "Europe/Madrid", resetHour: 6, resetMinute: 0 };

  it("a timestamp before the configured reset hour belongs to the PREVIOUS day's period", () => {
    // 2026-06-15 03:00 CEST is before the 06:00 reset - still belongs to June 14's period.
    const earlyMorning = Date.UTC(2026, 5, 15, 1, 0, 0);
    expect(votePeriodId(earlyMorning, RESET_6AM)).toBe("2026-06-14");
  });

  it("a timestamp at/after the configured reset hour belongs to that day's period", () => {
    const afterReset = Date.UTC(2026, 5, 15, 4, 30, 0); // 06:30 CEST
    expect(votePeriodId(afterReset, RESET_6AM)).toBe("2026-06-15");
  });
});

describe("nextVotePeriodResetAt", () => {
  it("returns the exact next local midnight for the default Europe/Madrid config", () => {
    const noon = Date.UTC(2026, 5, 15, 10, 0, 0); // 2026-06-15 12:00 CEST
    const next = nextVotePeriodResetAt(noon, MADRID_MIDNIGHT);
    // 2026-06-16 00:00 CEST = 2026-06-15 22:00 UTC.
    expect(next).toBe(Date.UTC(2026, 5, 15, 22, 0, 0));
  });

  it("correctly crosses the spring-forward 23-hour day", () => {
    const noonMar29 = Date.UTC(2026, 2, 29, 10, 0, 0); // 2026-03-29 12:00 CEST
    const next = nextVotePeriodResetAt(noonMar29, MADRID_MIDNIGHT);
    // 2026-03-30 00:00 CEST = 2026-03-29 22:00 UTC.
    expect(next).toBe(Date.UTC(2026, 2, 29, 22, 0, 0));
    expect(votePeriodId(next, MADRID_MIDNIGHT)).toBe("2026-03-30");
  });

  it("correctly crosses the fall-back 25-hour day", () => {
    const noonOct25 = Date.UTC(2026, 9, 25, 10, 0, 0); // 2026-10-25 11:00 CET
    const next = nextVotePeriodResetAt(noonOct25, MADRID_MIDNIGHT);
    // 2026-10-26 00:00 CET = 2026-10-25 23:00 UTC.
    expect(next).toBe(Date.UTC(2026, 9, 25, 23, 0, 0));
    expect(votePeriodId(next, MADRID_MIDNIGHT)).toBe("2026-10-26");
  });

  it("the returned instant is always strictly in the future relative to the input", () => {
    const now = Date.UTC(2026, 5, 15, 23, 59, 30);
    const next = nextVotePeriodResetAt(now, MADRID_MIDNIGHT);
    expect(next).toBeGreaterThan(now);
  });
});

describe("votePeriodConfigFromEnv", () => {
  it("defaults to Europe/Madrid, 00:00 when nothing is configured", () => {
    expect(votePeriodConfigFromEnv({})).toEqual({ timeZone: "Europe/Madrid", resetHour: 0, resetMinute: 0 });
  });

  it("reads real configured values", () => {
    expect(votePeriodConfigFromEnv({ VOTE_TIMEZONE: "America/New_York", VOTE_RESET_HOUR: "5", VOTE_RESET_MINUTE: "30" })).toEqual({
      timeZone: "America/New_York",
      resetHour: 5,
      resetMinute: 30,
    });
  });

  it("clamps out-of-range or garbage values to safe defaults instead of crashing", () => {
    expect(votePeriodConfigFromEnv({ VOTE_RESET_HOUR: "99", VOTE_RESET_MINUTE: "-5" })).toEqual({
      timeZone: "Europe/Madrid",
      resetHour: 23,
      resetMinute: 0,
    });
    expect(votePeriodConfigFromEnv({ VOTE_RESET_HOUR: "not-a-number" }).resetHour).toBe(0);
  });
});
