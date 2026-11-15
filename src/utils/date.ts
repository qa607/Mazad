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

/**
 * A calendar day in Riyadh (UTC+3 all year), `daysFromToday` days after today there, as a
 * datepicker needs it: "2026-11-16", the day of the month, and how many months after the current
 * one it falls in.
 */
export function riyadhCalendarDay(
  daysFromToday: number,
  now: number = Date.now(),
): { iso: string; day: number; monthsAhead: number } {
  const riyadh = (ms: number) => new Date(ms + 3 * 3_600_000);
  const today = riyadh(now);
  const target = riyadh(now + daysFromToday * 86_400_000);
  return {
    iso: target.toISOString().slice(0, 10),
    day: target.getUTCDate(),
    monthsAhead:
      (target.getUTCFullYear() - today.getUTCFullYear()) * 12 +
      target.getUTCMonth() -
      today.getUTCMonth(),
  };
}

/** Whole minutes between two times (always positive). */
export function minutesBetween(a: number, b: number): number {
  return Math.abs(a - b) / 60_000;
}
