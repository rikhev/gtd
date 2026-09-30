import { randomUUID } from "node:crypto";
import { getSetting, setSetting } from "./db.ts";

/**
 * The hard landscape (GTD's calendar): appointments from the owner's published Outlook calendar, read-only. The
 * subscription link is a secret (anyone with it can read the calendar), so it stays on the server; the browser only
 * ever sees the appointments and where they come from (the host name).
 *
 * Outlook publishes an ICS file: VEVENTs with Windows time-zone names, weekly and monthly RRULEs, EXDATEs, and
 * RECURRENCE-ID overrides for moved occurrences. This reads what it needs of that and no more.
 */

export interface CalEvent {
  /** Stable per occurrence: the feed, the event's UID and its day. */
  key: string;
  /** Which subscribed calendar it comes from. */
  feed: string;
  title: string;
  location: string | null;
  /** Local day (YYYY-MM-DD) it starts and, for multi-day all-day events, the last day it covers. */
  date: string;
  endDate: string;
  /** Local wall-clock times ("09:30"), or null for all-day. */
  time: string | null;
  endTime: string | null;
}

/** A subscribed calendar. The link is a secret: it never leaves the server (the browser gets `FeedInfo`). */
interface Feed {
  id: string;
  name: string;
  color: string;
  url: string;
}
export interface FeedInfo {
  id: string;
  name: string;
  color: string;
  /** Where it comes from (the link's host), for the owner to recognise it by. */
  host: string;
  /** The last fetch's problem, if the calendar couldn't be read. */
  error?: string;
}

const KEY = "calendars";
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; events: RawEvent[] }>();
const errors = new Map<string, string>();

function load(): Feed[] {
  try {
    const feeds = JSON.parse(getSetting(KEY, "[]")) as Feed[];
    // The single Outlook link of before becomes the first calendar, once.
    const old = getSetting("calendarUrl", "");
    if (old && !feeds.some((f) => f.url === old)) {
      feeds.unshift({ id: randomUUID(), name: "Outlook", color: "#2f6fb5", url: old });
      save(feeds);
      setSetting("calendarUrl", "");
    }
    return feeds;
  } catch {
    return [];
  }
}
const save = (feeds: Feed[]) => setSetting(KEY, JSON.stringify(feeds));
const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};

/** What the browser may know of the calendars: names, colours, where they come from. */
export const feedInfo = (): FeedInfo[] => load().map((f) => ({ id: f.id, name: f.name, color: f.color, host: hostOf(f.url), ...(errors.has(f.id) ? { error: errors.get(f.id) } : {}) }));

/** A pasted link, as a fetchable https URL (webcal:// is how Outlook and iCloud offer the same address to subscribe). */
function normalise(raw: string): string {
  const u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  // https only; plain http just for a calendar on this machine (testing).
  if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) throw new Error("Use the https or webcal link the calendar gives you");
  return u.toString();
}

/** Check a link before it is saved: that it is a calendar, how many appointments it has, and the name it gives itself. */
export async function probe(raw: string): Promise<{ ok: boolean; error?: string; count?: number; name?: string | null }> {
  try {
    const { events, name } = await fetchIcs(normalise(raw));
    return { ok: true, count: events.length, name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function addFeed(input: { name?: string; color?: string; url?: string }): Promise<{ ok: boolean; error?: string; feed?: FeedInfo }> {
  let url: string;
  try {
    url = normalise(String(input.url ?? ""));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const feeds = load();
  if (feeds.some((f) => f.url === url)) return { ok: false, error: "That calendar is already subscribed." };
  try {
    const { events } = await fetchIcs(url);
    const feed: Feed = { id: randomUUID(), name: String(input.name ?? "").trim().slice(0, 60) || "Calendar", color: validColor(input.color), url };
    save([...feeds, feed]);
    cache.set(feed.id, { at: Date.now(), events });
    return { ok: true, feed: feedInfo().find((f) => f.id === feed.id) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateFeed(id: string, patch: { name?: string; color?: string; url?: string }): Promise<{ ok: boolean; error?: string }> {
  const feeds = load();
  const f = feeds.find((x) => x.id === id);
  if (!f) return { ok: false, error: "No such calendar" };
  if (patch.name !== undefined) f.name = String(patch.name).trim().slice(0, 60) || f.name;
  if (patch.color !== undefined) f.color = validColor(patch.color);
  if (patch.url !== undefined) {
    try {
      const url = normalise(patch.url);
      const { events } = await fetchIcs(url);
      f.url = url;
      cache.set(f.id, { at: Date.now(), events });
      errors.delete(f.id);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  save(feeds);
  return { ok: true };
}

export function removeFeed(id: string) {
  save(load().filter((f) => f.id !== id));
  cache.delete(id);
  errors.delete(id);
}

const validColor = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : "#2f6fb5");

async function fetchIcs(url: string): Promise<{ events: RawEvent[]; name: string | null }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
  if (!res.ok) throw new Error(`The calendar answered ${res.status}. Check the link, or share or publish the calendar again.`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link isn't a calendar (no ICS data). Use the calendar's subscribe (webcal) or ICS link.");
  if (text.length > 20_000_000) throw new Error("That calendar is too large to read.");
  const name = /^X-WR-CALNAME:(.*)$/m.exec(text.replace(/\r\n/g, "\n"))?.[1]?.trim() || null;
  return { events: parse(text), name };
}

/** Appointments from every calendar on the days from..to (inclusive), expanded, in local time. */
export async function eventsBetween(from: string, to: string): Promise<{ events: CalEvent[]; feeds: FeedInfo[] }> {
  const feeds = load();
  const out: CalEvent[] = [];
  await Promise.all(
    feeds.map(async (f) => {
      const c = cache.get(f.id);
      if (!c || Date.now() - c.at > CACHE_MS) {
        try {
          cache.set(f.id, { at: Date.now(), events: (await fetchIcs(f.url)).events });
          errors.delete(f.id);
        } catch (e) {
          // A failed refresh keeps the last good copy, and says so in Settings.
          errors.set(f.id, (e as Error).message);
        }
      }
      const got = cache.get(f.id);
      if (got) out.push(...expand(got.events, from, to).map((e) => ({ ...e, feed: f.id, key: `${f.id}:${e.key}` })));
    }),
  );
  return { events: out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")), feeds: feedInfo() };
}

/* ---------------- parsing ---------------- */

interface Stamp {
  /** Wall-clock parts in the stated zone, or UTC when utc is set. */
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  allDay: boolean;
  utc: boolean;
  tz: string | null;
}
interface RawEvent {
  uid: string;
  title: string;
  location: string | null;
  start: Stamp;
  end: Stamp | null;
  rrule: Record<string, string> | null;
  exdates: string[];
  recurrenceId: string | null;
  cancelled: boolean;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(v: string) {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

function stamp(value: string, params: string): Stamp | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const tz = /TZID=("?)([^;:"]+)\1/i.exec(params)?.[2] ?? null;
  return { y: +m[1], m: +m[2], d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0, allDay: !m[4], utc: Boolean(m[7]), tz };
}

function parse(text: string): RawEvent[] {
  const out: RawEvent[] = [];
  let cur: Partial<RawEvent> & { exdates?: string[] } | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") cur = { exdates: [], rrule: null, recurrenceId: null, cancelled: false, location: null };
    else if (line === "END:VEVENT") {
      if (cur?.uid && cur.start) out.push({ title: "Untitled", end: null, ...cur } as RawEvent);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const head = line.slice(0, i);
      const value = line.slice(i + 1);
      const [name, ...rest] = head.split(";");
      const params = rest.join(";");
      switch (name.toUpperCase()) {
        case "UID":
          cur.uid = value.trim();
          break;
        case "SUMMARY":
          cur.title = unescape(value) || "Untitled";
          break;
        case "LOCATION":
          cur.location = unescape(value) || null;
          break;
        case "DTSTART":
          cur.start = stamp(value, params) ?? undefined;
          break;
        case "DTEND":
          cur.end = stamp(value, params);
          break;
        case "RRULE":
          cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("=") as [string, string]));
          break;
        case "EXDATE":
          for (const v of value.split(",")) {
            const s = stamp(v, params);
            if (s) cur.exdates!.push(localDay(s));
          }
          break;
        case "RECURRENCE-ID": {
          const s = stamp(value, params);
          cur.recurrenceId = s ? localDay(s) : null;
          break;
        }
        case "STATUS":
          cur.cancelled = value.trim().toUpperCase() === "CANCELLED";
          break;
      }
    }
  }
  return out;
}

/* ---------------- time zones ---------------- */

/** Outlook writes Windows zone names; the common ones, as IANA. Anything unknown is read as local time. */
const WINDOWS: Record<string, string> = {
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "FLE Standard Time": "Europe/Helsinki",
  "E. Europe Standard Time": "Europe/Chisinau",
  "Russian Standard Time": "Europe/Moscow",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "India Standard Time": "Asia/Kolkata",
  "AUS Eastern Standard Time": "Australia/Sydney",
  UTC: "UTC",
  "Coordinated Universal Time": "UTC",
};
const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone;

function zoneOf(tz: string | null): string {
  if (!tz) return LOCAL;
  const mapped = WINDOWS[tz] ?? tz;
  try {
    new Intl.DateTimeFormat("en", { timeZone: mapped });
    return mapped;
  } catch {
    return LOCAL;
  }
}

/** The zone's offset from UTC, in minutes, at an instant. */
function offset(zone: string, at: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** A stamp as an instant (all-day stamps are taken at local midnight of their day). */
function instant(s: Stamp): Date {
  if (s.utc) return new Date(Date.UTC(s.y, s.m - 1, s.d, s.h, s.mi));
  const zone = zoneOf(s.tz);
  const guess = new Date(Date.UTC(s.y, s.m - 1, s.d, s.h, s.mi));
  return new Date(guess.getTime() - offset(zone, guess) * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The owner's local day and time for an instant. */
function local(at: Date): { day: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: LOCAL, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function localDay(s: Stamp): string {
  return s.allDay ? `${s.y}-${pad(s.m)}-${pad(s.d)}` : local(instant(s)).day;
}

/* ---------------- recurrence ---------------- */

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const addDaysUTC = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Every start (as wall-clock stamps in the event's own zone) from the first up to `until` (a local day). */
function occurrences(e: RawEvent, untilDay: string): Stamp[] {
  const r = e.rrule;
  if (!r) return [e.start];
  const freq = (r.FREQ ?? "").toUpperCase();
  const interval = Math.max(1, Number(r.INTERVAL ?? 1));
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? stamp(r.UNTIL, "") : null;
  const untilLimit = until ? localDay(until) : "9999-12-31";
  const byDay = (r.BYDAY ?? "").split(",").filter(Boolean);
  const out: Stamp[] = [];
  const base = new Date(Date.UTC(e.start.y, e.start.m - 1, e.start.d));
  const mk = (d: Date): Stamp => ({ ...e.start, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
  const dayStr = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const push = (d: Date) => {
    if (out.length >= count) return false;
    const ds = dayStr(d);
    if (ds > untilLimit || ds > untilDay) return false;
    if (ds >= dayStr(base)) out.push(mk(d));
    return true;
  };
  // Guard against a runaway rule: nothing beyond a few thousand occurrences is ever needed for a two-month view.
  for (let n = 0, guard = 0; guard < 5000; n++, guard++) {
    if (freq === "DAILY") {
      if (!push(addDaysUTC(base, n * interval))) break;
    } else if (freq === "WEEKLY") {
      const weekStart = addDaysUTC(base, n * 7 * interval - base.getUTCDay());
      const days = byDay.length ? byDay.map((b) => DAYS.indexOf(b.slice(-2))) : [base.getUTCDay()];
      let go = true;
      for (const wd of days.sort((a, b) => a - b)) if (!push(addDaysUTC(weekStart, wd))) go = false;
      if (!go || dayStr(weekStart) > untilDay) break;
    } else if (freq === "MONTHLY") {
      const y = base.getUTCFullYear();
      const m = base.getUTCMonth() + n * interval;
      if (byDay.length) {
        // e.g. BYDAY=2TU (second Tuesday) or -1FR (last Friday)
        const [, ord, wd] = /^(-?\d)?([A-Z]{2})$/.exec(byDay[0]) ?? [];
        const first = new Date(Date.UTC(y, m, 1));
        const want = DAYS.indexOf(wd);
        let d: Date;
        if (Number(ord) < 0) {
          const last = new Date(Date.UTC(y, m + 1, 0));
          d = addDaysUTC(last, -((last.getUTCDay() - want + 7) % 7));
        } else d = addDaysUTC(first, ((want - first.getUTCDay() + 7) % 7) + 7 * (Math.max(1, Number(ord || 1)) - 1));
        if (!push(d)) break;
      } else {
        const d = new Date(Date.UTC(y, m, base.getUTCDate()));
        if (d.getUTCDate() === base.getUTCDate() && !push(d)) break;
        if (dayStr(d) > untilDay) break;
      }
    } else if (freq === "YEARLY") {
      if (!push(new Date(Date.UTC(base.getUTCFullYear() + n * interval, base.getUTCMonth(), base.getUTCDate())))) break;
    } else return [e.start];
  }
  return out;
}

function expand(raw: RawEvent[], from: string, to: string): Omit<CalEvent, "feed">[] {
  // Moved or cancelled single occurrences replace their series' day.
  const overrides = new Map<string, Set<string>>();
  for (const e of raw) if (e.recurrenceId) overrides.set(e.uid, (overrides.get(e.uid) ?? new Set()).add(e.recurrenceId));
  const out: Omit<CalEvent, "feed">[] = [];
  for (const e of raw) {
    if (e.cancelled) continue;
    const lengthMs = e.end ? instant(e.end).getTime() - instant(e.start).getTime() : e.start.allDay ? 86_400_000 : 0;
    for (const s of e.recurrenceId ? [e.start] : occurrences(e, to)) {
      const startDay = localDay(s);
      if (!e.recurrenceId && (e.exdates.includes(startDay) || overrides.get(e.uid)?.has(startDay))) continue;
      const begin = instant(s);
      const finish = new Date(begin.getTime() + lengthMs);
      let date: string, endDate: string, time: string | null, endTime: string | null;
      if (s.allDay) {
        date = startDay;
        // An all-day DTEND is the day after the last; a one-day event covers only its day.
        const days = Math.max(1, Math.round(lengthMs / 86_400_000));
        const d = new Date(Date.UTC(s.y, s.m - 1, s.d + days - 1));
        endDate = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        time = endTime = null;
      } else {
        const a = local(begin);
        const b = local(finish);
        date = a.day;
        endDate = b.day < a.day ? a.day : b.day;
        time = a.time;
        endTime = lengthMs ? b.time : null;
      }
      if (endDate < from || date > to) continue;
      out.push({ key: `${e.uid}:${date}`, title: e.title, location: e.location, date, endDate, time, endTime });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}
