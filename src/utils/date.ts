/**
 * A date-time as Mazad shows it ("2026-11-10 14:05:00", "2026-11-10 14:05"), read as Riyadh
 * time (UTC+3 all year, no daylight saving). Returns milliseconds since the epoch, or NaN when
 * the text is not in that form.
 */
export function parseRiyadhDateTime(text: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(text.trim());
  if (!match) return Number.NaN;
  return Date.parse(`${match[1]}T${match[2]}${match[3] ?? ':00'}+03:00`);
}

/** Whole minutes between two times (always positive). */
export function minutesBetween(a: number, b: number): number {
  return Math.abs(a - b) / 60_000;
}
