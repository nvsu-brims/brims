// Borrow history export: period maths and shared types (Plan 5).
// Pure functions only: no database and no PDF code, so the server action and
// the browser can both import this file. All boundaries are Manila time
// (UTC+8, no daylight saving), the same rule as the overdue job.

export type PeriodSpec =
  | { type: "daily"; date: string } // "YYYY-MM-DD"
  | { type: "weekly"; date: string } // any date in the week (Monday to Friday)
  | { type: "monthly"; year: number; month: number } // month 1-12
  | { type: "yearly"; year: number };

export interface PeriodRange {
  label: string;
  /** Inclusive start, Manila midnight. */
  from: Date;
  /** Exclusive end, Manila midnight. */
  to: Date;
  coverText: string;
  fileName: string;
}

/** One borrow, as stored in the database (D1: nothing calculated or guessed). */
export interface ExportBorrow {
  requestedAt: string;
  approvedAt: string | null;
  dueAt: string | null;
  returnedAt: string | null;
  borrowerName: string;
  idNumber: string;
  college: string | null;
  organization: string | null;
  contactNumber: string | null;
  email: string | null;
  /** Cash deposit total for this request, PHP. Null when not recorded. */
  depositTotal: number | null;
  itemName: string;
  itemOffice: string;
  quantity: number;
  status: string;
  approvedByName: string | null;
  /** One condition per returned unit, in unit order. Empty until returned. */
  unitConditions: string[];
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Midnight in Manila for a calendar date. Date.UTC also handles month and year overflow. */
function manilaMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);
}

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("Choose a valid date.");
  }
  return { year, month, day };
}

/** Manila calendar date as "3 Nov 2026". */
function fmtDay(instant: Date): string {
  const m = new Date(instant.getTime() + MANILA_OFFSET_MS);
  return `${m.getUTCDate()} ${MONTH_SHORT[m.getUTCMonth()]} ${m.getUTCFullYear()}`;
}

/** Manila date and time for a stored timestamp, or "" when nothing is recorded. */
export function formatManilaDateTime(value: string | null): string {
  if (!value) return "";
  const instant = new Date(value);
  const m = new Date(instant.getTime() + MANILA_OFFSET_MS);
  return `${m.getUTCDate()} ${MONTH_SHORT[m.getUTCMonth()]} ${m.getUTCFullYear()} ${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
}

export function periodRange(spec: PeriodSpec): PeriodRange {
  switch (spec.type) {
    case "daily": {
      const { year, month, day } = parseIsoDate(spec.date);
      const from = manilaMidnight(year, month, day);
      const to = new Date(from.getTime() + DAY_MS);
      const text = fmtDay(from);
      return {
        label: `Daily, ${text}`,
        from,
        to,
        coverText: `Covers ${text}`,
        fileName: `borrow-history_daily_${year}-${pad(month)}-${pad(day)}.pdf`,
      };
    }
    case "weekly": {
      const { year, month, day } = parseIsoDate(spec.date);
      const dayOfWeek = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7; // Monday = 0
      const monday = new Date(Date.UTC(year, month - 1, day - dayOfWeek));
      const from = manilaMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
      const to = new Date(from.getTime() + 5 * DAY_MS); // Saturday 00:00 ends Friday
      const friday = new Date(from.getTime() + 4 * DAY_MS);
      const text = `${fmtDay(from)} to ${fmtDay(friday)}`;
      return {
        label: `Weekly, ${text}`,
        from,
        to,
        coverText: `Covers Monday to Friday, ${text}`,
        fileName: `borrow-history_weekly_${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}.pdf`,
      };
    }
    case "monthly": {
      if (!Number.isInteger(spec.year) || !Number.isInteger(spec.month) || spec.month < 1 || spec.month > 12) {
        throw new Error("Choose a valid month.");
      }
      const from = manilaMidnight(spec.year, spec.month, 1);
      const to = manilaMidnight(spec.year, spec.month + 1, 1);
      const last = new Date(to.getTime() - DAY_MS);
      return {
        label: `Monthly, ${MONTH_NAMES[spec.month - 1]} ${spec.year}`,
        from,
        to,
        coverText: `Covers ${fmtDay(from)} to ${fmtDay(last)}`,
        fileName: `borrow-history_monthly_${spec.year}-${pad(spec.month)}.pdf`,
      };
    }
    case "yearly": {
      if (!Number.isInteger(spec.year) || spec.year < 1970 || spec.year > 9999) {
        throw new Error("Choose a valid year.");
      }
      const from = manilaMidnight(spec.year, 1, 1);
      const to = manilaMidnight(spec.year + 1, 1, 1);
      return {
        label: `Yearly, ${spec.year}`,
        from,
        to,
        coverText: `Covers 1 Jan ${spec.year} to 31 Dec ${spec.year}`,
        fileName: `borrow-history_yearly_${spec.year}.pdf`,
      };
    }
  }
}