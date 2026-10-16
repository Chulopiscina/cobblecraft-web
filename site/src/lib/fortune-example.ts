/** Matches HarvestFortune.rollExtra for a resource with one base unit. */
export function fortuneExample(percent: number) {
  const points = Number.isFinite(percent) ? Math.max(0, percent) : 0;
  const expected = points / 100;
  const guaranteed = Math.floor(expected);
  return { guaranteed, chance: Math.round((expected - guaranteed) * 10000) / 100, minimumTotal: 1 + guaranteed, averageTotal: 1 + expected };
}
