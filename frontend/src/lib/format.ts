/** Date helpers. Times are stored in UTC and shown in the user's time zone. */

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/** Formats a calendar date ("2026-03-15") without shifting it across time zones. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat(undefined, { ...DATE_OPTS, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDateTime(value: string | null | undefined, timeZone: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    ...DATE_OPTS,
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function formatRelative(value: string, now: Date = new Date()): string {
  const diffMs = new Date(value).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(0, "minute");
}

/** "YYYY-MM-DD" for a Date in the given time zone. */
export function isoDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Converts a wall-clock time in a time zone ("2026-03-15", "09:30") to a UTC ISO string.
 * Uses the zone offset at that instant, so it is correct across DST changes.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  const offset = zoneOffsetMs(new Date(guess), timeZone);
  const first = guess - offset;
  const corrected = guess - zoneOffsetMs(new Date(first), timeZone);
  return new Date(corrected).toISOString();
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Wall-clock date and time ("YYYY-MM-DD", "HH:MM") of a UTC instant in a time zone. */
export function utcToZoned(value: string, timeZone: string): { date: string; time: string } {
  const instant = new Date(value);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return { date: isoDateInZone(instant, timeZone), time };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string, fallback: string): string {
  const source = name.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
