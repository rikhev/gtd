/** Local-date helpers. Dates are stored as YYYY-MM-DD strings in local time. */

const pad = (n: number) => String(n).padStart(2, "0");

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return iso(new Date());
}

export function fromIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = fromIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function addMonths(s: string, n: number): string {
  const d = fromIso(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86400000);
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function weekdayIndex(word: string): number {
  const w = word.slice(0, 3).toLowerCase();
  return WEEKDAYS.indexOf(w);
}

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase());
}

/**
 * Parse loose date text: "today", "tom", "fri", "next week", "+3d", "2w",
 * "in 5 days", "3 oct", "oct 3", "2026-10-03", "10-03". Returns null to clear
 * ("", "none", "-"), undefined when it can't parse.
 */
export function parseDate(input: string, base = today()): string | null | undefined {
  const t = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "" || t === "none" || t === "-" || t === "clear") return null;
  if (t === "today" || t === "tod" || t === "now") return base;
  if (t === "tomorrow" || t === "tom" || t === "tmr") return addDays(base, 1);
  if (t === "yesterday") return addDays(base, -1);

  let m = t.match(/^(?:in |\+)?(\d+) ?(d|day|days|w|wk|week|weeks|m|mo|month|months|y|yr|year|years)$/);
  if (m) {
    const n = Number(m[1]);
    const u = m[2][0];
    if (u === "d") return addDays(base, n);
    if (u === "w") return addDays(base, n * 7);
    if (u === "m") return addMonths(base, n);
    if (u === "y") return addMonths(base, n * 12);
  }

  if (t === "next week" || t === "nw") {
    const d = fromIso(base).getDay();
    return addDays(base, ((8 - d) % 7) || 7);
  }
  if (t === "next month" || t === "nm") {
    const d = fromIso(addMonths(base, 1));
    d.setDate(1);
    return iso(d);
  }
  if (t === "end of week" || t === "eow") {
    const d = fromIso(base).getDay();
    return addDays(base, (5 - d + 7) % 7);
  }
  if (t === "end of month" || t === "eom") {
    const d = fromIso(base);
    return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  m = t.match(/^(?:next )?([a-z]+)$/);
  if (m && weekdayIndex(m[1]) >= 0 && m[1].length >= 2) {
    const target = weekdayIndex(m[1]);
    const cur = fromIso(base).getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    if (t.startsWith("next ")) diff += diff < 7 ? 7 : 0;
    return addDays(base, diff);
  }

  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));

  m = t.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return rollYear(Number(m[1]), Number(m[2]), base);

  m = t.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/);
  if (m && monthIndex(m[2]) >= 0) {
    return m[3] ? valid(Number(m[3]), monthIndex(m[2]) + 1, Number(m[1])) : rollYear(monthIndex(m[2]) + 1, Number(m[1]), base);
  }
  m = t.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/);
  if (m && monthIndex(m[1]) >= 0) {
    return m[3] ? valid(Number(m[3]), monthIndex(m[1]) + 1, Number(m[2])) : rollYear(monthIndex(m[1]) + 1, Number(m[2]), base);
  }
  return undefined;
}

function valid(y: number, mo: number, d: number): string | undefined {
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return undefined;
  return iso(dt);
}

function rollYear(mo: number, d: number, base: string): string | undefined {
  const y = fromIso(base).getFullYear();
  const s = valid(y, mo, d);
  if (!s) return undefined;
  return s < base ? valid(y + 1, mo, d) : s;
}

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact, scannable date for grid cells. */
export function formatDate(s: string | null, base = today()): string {
  if (!s) return "";
  const diff = daysBetween(base, s);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = fromIso(s);
  if (diff > 1 && diff < 7) return SHORT_DAY[d.getDay()];
  const sameYear = d.getFullYear() === fromIso(base).getFullYear();
  return `${d.getDate()} ${SHORT_MON[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
}

/** The local day a timestamp falls on (a stored stamp is UTC: its first ten characters can be another day). */
export const localDay = (stamp: string) => iso(new Date(stamp));

/** A timestamp's time of day, 24-hour ("09:30"). */
export const clockOf = (stamp: string) => new Date(stamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** A day as a group heading, the same in Done and the Trash: "Today · Thu 1 Oct", "Yesterday · Wed 30 Sep", "Mon 28 Sep". */
export function dayHeading(d: string, base = today()): string {
  if (!d) return "Undated";
  return Math.abs(daysBetween(base, d)) <= 1 ? `${formatDate(d, base)} · ${formatLong(d, base)}` : formatLong(d, base);
}

/** "Mon 28 Sep", with the year only outside the current one ("Fri 8 Jan 2027"), as the short form keeps it. */
export function formatLong(s: string | null, base = today()): string {
  if (!s) return "";
  const d = fromIso(s);
  const sameYear = d.getFullYear() === fromIso(base).getFullYear();
  return `${SHORT_DAY[d.getDay()]} ${d.getDate()} ${SHORT_MON[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
}

/* ---------------- Recurrence ---------------- */

export interface Recurrence {
  n: number;
  unit: "day" | "week" | "month" | "year";
  weekdays: number[];
}

/** "daily", "weekly", "every 3 months", "every mon", "every mon, thu", "every 2 weeks" */
export function parseRecurrence(input: string): Recurrence | null | undefined {
  const t = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "" || t === "none" || t === "-" || t === "never") return null;
  const simple: Record<string, Recurrence> = {
    daily: { n: 1, unit: "day", weekdays: [] },
    weekly: { n: 1, unit: "week", weekdays: [] },
    fortnightly: { n: 2, unit: "week", weekdays: [] },
    monthly: { n: 1, unit: "month", weekdays: [] },
    quarterly: { n: 3, unit: "month", weekdays: [] },
    yearly: { n: 1, unit: "year", weekdays: [] },
    annually: { n: 1, unit: "year", weekdays: [] },
    weekdays: { n: 1, unit: "week", weekdays: [1, 2, 3, 4, 5] },
  };
  const body = t.replace(/^every /, "");
  if (simple[body]) return simple[body];
  if (simple[t]) return simple[t];
  let m = body.match(/^(\d+)? ?(day|days|week|weeks|month|months|year|years|d|w|m|y)$/);
  if (m) {
    const u = m[2][0] as "d" | "w" | "m" | "y";
    const unit = ({ d: "day", w: "week", m: "month", y: "year" } as const)[u];
    return { n: m[1] ? Number(m[1]) : 1, unit, weekdays: [] };
  }
  const days = body.split(/[ ,&]+|and/).filter(Boolean).map(weekdayIndex);
  if (days.length && days.every((d) => d >= 0)) {
    return { n: 1, unit: "week", weekdays: [...new Set(days)].sort() };
  }
  m = body.match(/^other (day|week|month|year)$/);
  if (m) return { n: 2, unit: m[1] as Recurrence["unit"], weekdays: [] };
  return undefined;
}

export function recurrenceLabel(r: Recurrence): string {
  if (r.weekdays.length) {
    if (r.weekdays.join() === "1,2,3,4,5") return "Every weekday";
    return "Every " + r.weekdays.map((d) => SHORT_DAY[d]).join(", ");
  }
  if (r.n === 1) return { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[r.unit];
  if (r.n === 3 && r.unit === "month") return "Quarterly";
  return `Every ${r.n} ${r.unit}s`;
}

export function nextOccurrence(from: string, r: Recurrence): string {
  if (r.weekdays.length) {
    let d = addDays(from, 1);
    for (let i = 0; i < 14; i++) {
      if (r.weekdays.includes(fromIso(d).getDay())) return d;
      d = addDays(d, 1);
    }
    return d;
  }
  if (r.unit === "day") return addDays(from, r.n);
  if (r.unit === "week") return addDays(from, r.n * 7);
  if (r.unit === "month") return addMonths(from, r.n);
  return addMonths(from, r.n * 12);
}

/* ---------------- Time estimates ---------------- */

export const TIME_PRESETS = [5, 15, 30, 60, 120, 240];

export function formatTime(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = min / 60;
  if (h === 0.25) return "¼h";
  if (h === 0.5) return "½h";
  if (Number.isInteger(h)) return `${h}h`;
  if (Number.isInteger(h * 2)) return `${Math.floor(h)}½h`;
  return `${Math.floor(h)}h${min % 60}m`;
}

export function parseTime(input: string): number | null | undefined {
  const t = input.trim().toLowerCase().replace(/\s+/g, "");
  if (t === "" || t === "none" || t === "-") return null;
  let m = t.match(/^(\d+(?:[.,]\d+)?)(m|min|mins|minutes)?$/);
  if (m && (m[2] || Number(m[1].replace(",", ".")) > 8)) return Math.round(Number(m[1].replace(",", ".")));
  m = t.match(/^(\d+(?:[.,]\d+)?)(h|hr|hrs|hours?)?$/);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 60);
  m = t.match(/^(\d+)h(\d+)m?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return undefined;
}

export const ENERGY_LABEL = { 1: "Low", 2: "Medium", 3: "High" } as const;
