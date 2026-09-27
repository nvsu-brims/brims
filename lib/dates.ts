// Date helpers, all fixed to APP_TIME_ZONE (Asia/Manila) rather than server
// or browser zone: the server runs in UTC (8 hours behind Manila, which
// breaks "yesterday"/"today" logic), and a client component rendered first
// in UTC then reformatted in the browser zone causes a hydration mismatch.
// Date-only values ("YYYY-MM-DD") have no zone and are formatted as-is.

export const APP_TIME_ZONE = "Asia/Manila";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The current day in APP_TIME_ZONE as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  // The en-CA locale prints dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * `iso` ("YYYY-MM-DD") plus `days` calendar days, as "YYYY-MM-DD". Computed
 * on the UTC calendar so zone/DST can't shift the result. Returns "" for an
 * invalid date.
 */
export function addDaysIso(iso: string, days: number): string {
  if (!isValidIsoDate(iso)) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * "Month D, YYYY" (e.g. "September 25, 2026") for a timestamp. `fallback` for
 * null/undefined/unparseable. Used by the profile dialog footer.
 */
export function formatLongDate(
  value: string | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

/** True for a real calendar date written exactly as "YYYY-MM-DD". */
export function isValidIsoDate(input: string): boolean {
  const match = DATE_ONLY.exec(input);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** "MM/DD/YYYY" for a table cell. Accepts date-only or full ISO timestamp. */
export function formatDate(
  value: string | null | undefined,
  fallback = "N/A"
): string {
  if (!value) return fallback;

  const isDateOnly = DATE_ONLY.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: isDateOnly ? "UTC" : APP_TIME_ZONE,
  });
}

/**
 * True when `dueAt` (timestamp or date-only "YYYY-MM-DD") falls on a Manila
 * calendar day strictly before today (BUG-13). Compares by calendar day, not
 * raw timestamp: `dueAt` is stored as midnight UTC = 8 AM Manila, so a
 * timestamp comparison would flip an item overdue at 8 AM on its own due
 * date, while the borrower can still return it that day. Returns false for
 * null/undefined/unparseable. `now` is injectable for tests.
 */
export function isPastDue(
  dueAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!dueAt) return false;

  const dueDay = DATE_ONLY.test(dueAt) ? dueAt : isoToManilaDate(dueAt);
  if (!dueDay) return false;
  return dueDay < todayIso(now); // "YYYY-MM-DD" sorts chronologically
}

/** "MM/DD/YYYY, H:MM AM" for a timestamp column. Used by the Activity Logs table. */
export function formatDateTime(
  value: string | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIME_ZONE,
  });
}

/**
 * The Manila calendar day of a timestamp, as "YYYY-MM-DD" — `iso.slice(0,10)`
 * would give the UTC day, off by one for the first 8 hours of each Manila
 * day. Returns "" for unparseable input.
 */
export function isoToManilaDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return todayIso(date);
}