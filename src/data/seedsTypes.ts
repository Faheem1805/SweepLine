/** Shape of the generated multi-seed study (see scripts/seed-study.ts). */

/** A share across seeds: mean, 95 % confidence interval of the mean, the range seen, and the number of seeds. */
export interface SeedStat {
  mean: number;
  lo: number;
  hi: number;
  min: number;
  max: number;
  n: number;
}

export interface SeedsData {
  generatedAt: string;
  /** Reference sequence from the bloom approach: share of intake contacts avoided, diversion efficiency, under-skirt escape. */
  reference: { minutes: number; reduction: SeedStat; diversion: SeedStat; underSkirt: SeedStat };
  /** Recorded tide turn: share of post-turn intake contacts avoided with the Twin-Line and with a single line. */
  tideTurn: { hoursAfter: number; twin: SeedStat; single: SeedStat };
}
