/**
 * Date helpers.
 *
 * Every date in the domain is an ISO calendar date string (`YYYY-MM-DD`), never
 * a `Date`. Credentialing deadlines are calendar facts — a license expires on a
 * date, not at an instant — and storing instants invites the timezone bugs that
 * make an expirable look lapsed a day early in one region and a day late in
 * another. All arithmetic here is UTC-anchored so it is stable everywhere.
 */

export type IsoDate = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  // Rejects impossible calendar dates that Date.parse rolls over (2025-02-30).
  return toIso(ms) === value;
}

function assertIso(value: IsoDate, label: string): number {
  if (!isIsoDate(value)) {
    throw new RangeError(`${label} must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(value)}`);
  }
  return Date.parse(`${value}T00:00:00Z`);
}

function toIso(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIso(assertIso(date, "date") + Math.trunc(days) * MS_PER_DAY);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const ms = assertIso(date, "date");
  const d = new Date(ms);
  const targetMonth = d.getUTCMonth() + Math.trunc(months);
  const anchorDay = d.getUTCDate();
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1));
  // Clamp to the last day of the target month: Jan 31 + 1 month is Feb 28/29,
  // not Mar 3. Reappointment terms are quoted in months, so this matters.
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return toIso(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), Math.min(anchorDay, lastDay)),
  );
}

/** Signed day count from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((assertIso(to, "to") - assertIso(from, "from")) / MS_PER_DAY);
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return assertIso(a, "a") < assertIso(b, "b");
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return assertIso(a, "a") > assertIso(b, "b");
}

export function minDate(...dates: IsoDate[]): IsoDate | null {
  const valid = dates.filter(isIsoDate);
  if (valid.length === 0) return null;
  return valid.reduce((lo, d) => (isBefore(d, lo) ? d : lo));
}

export function maxDate(...dates: IsoDate[]): IsoDate | null {
  const valid = dates.filter(isIsoDate);
  if (valid.length === 0) return null;
  return valid.reduce((hi, d) => (isAfter(d, hi) ? d : hi));
}

export function formatDate(date: IsoDate | null | undefined): string {
  if (!date || !isIsoDate(date)) return "—";
  const [y, m, d] = date.split("-");
  return `${m}/${d}/${y}`;
}

/** "in 42 days" / "12 days ago" / "today", relative to `today`. */
export function relativeDays(today: IsoDate, date: IsoDate): string {
  const n = daysBetween(today, date);
  if (n === 0) return "today";
  if (n > 0) return `in ${n} day${n === 1 ? "" : "s"}`;
  return `${-n} day${n === -1 ? "" : "s"} ago`;
}
