// What a series' logged entries already cover, for the "totals must cover what is logged" rule.

type Row = { episodes: number | null; season: number | null; episode_to: number | null };

/**
 * Distinct episodes logged and the highest season. An entry with an end episode ("hasta") covers
 * the `episodes` numbers that end at it, in its season, so watching the same ones again (a rewatch)
 * adds nothing. Entries without a position cannot be compared and add up. The count never goes
 * below the highest episode number logged.
 */
export function loggedCoverage(rows: readonly Row[]): { episodes: number; season: number } {
  const seen = new Set<string>();
  let unplaced = 0;
  let highest = 0;
  let season = 0;
  for (const r of rows) {
    const n = r.episodes ?? 0;
    season = Math.max(season, r.season ?? 0);
    highest = Math.max(highest, r.episode_to ?? 0);
    if (r.episode_to === null) {
      unplaced += n;
      continue;
    }
    const first = Math.max(1, r.episode_to - n + 1);
    for (let ep = first; ep <= r.episode_to; ep++) seen.add(`${r.season ?? 0}:${ep}`);
    unplaced += Math.max(0, n - (r.episode_to - first + 1));
  }
  return { episodes: Math.max(seen.size + unplaced, highest), season };
}
