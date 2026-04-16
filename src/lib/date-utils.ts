/**
 * Converts a half-open period-end date (exclusive upper bound) to the last
 * inclusive calendar day of that period.
 *
 * Example: periodRange Q1 returns `to = "2024-04-01"` (first day of next
 * period). `lastDayOf("2024-04-01")` → `"2024-03-31"` (Mar 31, inclusive).
 */
export function lastDayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
