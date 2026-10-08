import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Hourglass, RefreshCw } from "lucide-react";
import { completeActions, isDeferred, isStalled, onHold, mutate, named, newAction, nextAppointment, plural, projectHealth, useMeta, useStore } from "../store.ts";
import { fitLabel, fits, useFit } from "../fit.ts";
import { useUI } from "../ui.tsx";
import { keyLabel, useCommands, type Command } from "../keys.ts";
import { usePersisted } from "../components/Grid.tsx";
import { syncCalendars, toggleFeed, useEvents, useHiddenFeeds, useSyncing } from "../calendarFeed.ts";
import { DoneBox, EventMark, Lamp, Marker } from "../components/bits.tsx";
import { actionRowCommands, askContext, askWaitingOn, editors, linkAppointment, setProject } from "../actionCommands.tsx";
import { projectEditors } from "./ProjectsView.tsx";
import { addDays, addMonths, daysBetween, formatDate, formatLong, fromIso, today } from "../../shared/dates.ts";
import type { Appointment, ID, State } from "../../shared/types.ts";

/*
 * The calendar is GTD's hard landscape: what has to happen on a given day, and what spans days. It shows the dates
 * the system already holds (an action's start and due, a project's start and due, follow-ups, ticklers) and lets
 * them be moved by dragging, as in any calendar: the bar to move it, either end to change that date.
 */

/** Day is the daily review (GTD: the calendar first, then the action lists); week, month and year the landscape. */
type Mode = "day" | "week" | "month" | "year";
type Role = "day" | "followup" | "tickler" | "event" | "next";
interface Item {
  key: string;
  /** An appointment from the subscribed Outlook calendar: read-only, never dragged or opened. */
  kind: "action" | "project" | "event";
  id: ID;
  time?: string | null;
  endTime?: string | null;
  location?: string | null;
  /** The subscribed calendar's colour, and its name. */
  color?: string;
  feedName?: string;
  title: string;
  start: string;
  end: string;
  role: Role;
  /** The fields its two ends are stored in (the same field for a Do on day); null for an appointment or a next action. */
  startField: string | null;
  endField: string | null;
  waiting?: string | null;
  overdue?: boolean;
  sub?: string;
  health?: ReturnType<typeof projectHealth>;
  projectStart?: string | null;
  /** A project's next linked appointment, which its lamp names. */
  projectAppt?: Appointment | null;
  /** An appointment's subscribed calendar (its id). */
  feed?: string;
  stalled?: boolean;
  /** One day's part of an appointment that runs past midnight: the whole of it, as the feed gives it. */
  whole?: { start: string; end: string; time: string; endTime: string };
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK_LANES = 99;
const MONTH_LANES = 3;
/** This week and the weeks after it are where the hard landscape is read: they get room for everything on them. */
const MONTH_LANES_AHEAD = 8;

const dow = (d: string) => fromIso(d).getDay();
const startOfWeek = (d: string, ws: 0 | 1) => addDays(d, -((dow(d) - ws + 7) % 7));
const monthOf = (d: string) => d.slice(0, 7);
const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;
/** ISO week number of the week that holds this day's Thursday. */
function isoWeek(d: string): number {
  const date = fromIso(d);
  const thu = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7) + 3);
  const firstThu = new Date(thu.getFullYear(), 0, 4);
  return 1 + Math.round(((thu.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
}
/** Where an appointment is, short enough for its block: a meeting link reads as its site ("freshworks.zoom.us"). */
const placeName = (loc: string) => {
  const m = /^https?:\/\/([^/?#\s]+)\S*$/i.exec(loc.trim());
  return m ? m[1].replace(/^www\./, "") : loc;
};
const range = (a: string, n: number) => Array.from({ length: n }, (_, i) => addDays(a, i));
const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);

/**
 * Every dated thing the landscape holds. Done and deleted work stays off it. GTD's calendar is the hard landscape: by
 * default it shows appointments, what is to be done on a day (an action's or a project's Do on: owner's decision,
 * 8 October, one date only, no start or due) and follow-ups, each on its day. `soft` adds the ticklers (bring back).
 */
function itemsOf(s: State, t: string, soft: boolean): Item[] {
  const out: Item[] = [];
  const proj = new Map(s.projects.map((p) => [p.id, p]));
  const ctx = new Map(s.contexts.map((c) => [c.id, c.name]));
  for (const a of s.actions) {
    const open = (a.status === "next" || a.status === "waiting") && !onHold(a, s);
    if (open) {
      const sub = [a.project_id ? proj.get(a.project_id)?.title : null, a.context_id ? ctx.get(a.context_id) : null].filter(Boolean).join(" · ");
      const base = { kind: "action" as const, id: a.id, title: a.title || "Untitled action", waiting: a.status === "waiting" ? a.waiting_who || "someone" : null, sub };
      // The day to do it; passed with the action still open, it is late.
      if (a.status === "next" && a.defer) out.push({ ...base, key: `a:${a.id}`, start: a.defer, end: a.defer, role: "day", startField: "defer", endField: "defer", overdue: a.defer < t });
      // A follow-up date is day-specific information (GTD), so it is on the hard landscape, not a soft date.
      if (a.status === "waiting" && a.followup) out.push({ ...base, key: `f:${a.id}`, start: a.followup, end: a.followup, role: "followup", startField: "followup", endField: "followup", overdue: a.followup < t });
    }
    if (soft && a.status === "someday" && a.bring_back)
      out.push({ key: `b:${a.id}`, kind: "action", id: a.id, title: a.title || "Untitled action", start: a.bring_back, end: a.bring_back, role: "tickler", startField: "bring_back", endField: "bring_back" });
  }
  for (const p of s.projects) {
    if (p.status === "active") {
      const base = { kind: "project" as const, id: p.id, title: p.title || "Untitled project", health: projectHealth(s, p), projectStart: p.start, projectAppt: nextAppointment(s, p), stalled: isStalled(s, p) };
      // A project's day: when it begins (it is off Projects until then). Once begun it is simply active, never late.
      if (p.start) out.push({ ...base, key: `p:${p.id}`, start: p.start, end: p.start, role: "day", startField: "start", endField: "start" });
    }
    if (soft && p.status === "someday" && p.bring_back)
      out.push({ key: `pb:${p.id}`, kind: "project", id: p.id, title: p.title || "Untitled project", start: p.bring_back, end: p.bring_back, role: "tickler", startField: "bring_back", endField: "bring_back" });
  }
  // Longer and earlier first, projects before their actions: the lanes read like a plan.
  return out.sort((a, b) => a.start.localeCompare(b.start) || daysBetween(b.start, b.end) - daysBetween(a.start, a.end) || (a.kind === b.kind ? 0 : a.kind === "project" ? -1 : 1) || a.title.localeCompare(b.title));
}

interface Placed {
  item: Item;
  col: number;
  span: number;
  lane: number;
  contL: boolean;
  contR: boolean;
}
/** Lays one week's items into lanes: each takes the first lane free on all its days. */
function layoutRow(days: string[], items: Item[], cap: number) {
  const first = days[0];
  const last = days[days.length - 1];
  const lanesEnd: string[] = [];
  const placed: Placed[] = [];
  const hidden = days.map(() => 0);
  for (const item of items) {
    if (item.end < first || item.start > last) continue;
    const s = max(item.start, first);
    const e = min(item.end, last);
    let lane = lanesEnd.findIndex((end) => end < s);
    if (lane < 0) lane = lanesEnd.length;
    lanesEnd[lane] = e;
    const col = daysBetween(first, s);
    const span = daysBetween(s, e) + 1;
    if (lane >= cap) {
      for (let i = col; i < col + span; i++) hidden[i]++;
      continue;
    }
    placed.push({ item, col: col + 1, span, lane, contL: item.start < first, contR: item.end > last });
  }
  return { placed, hidden, lanes: Math.min(cap, lanesEnd.length) };
}

type Drag = { key: string; start: string; end: string };

/** The week's hours never get shorter than this; below it (a very small window) the hours scroll. */
const MIN_HOUR_PX = 20;
/** The all-day band shows this many rows a day before "+N more". */
const BAND_ROWS = 3;
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/**
 * Timed appointments are placed in the hours: one-day ones, and those running past midnight for less than a day (a
 * night flight), as Outlook draws them (owner's request). Everything else (deadlines, starts, all-day, appointments of
 * a day or more) sits in the band above.
 */
const isTimed = (i: Item) =>
  i.kind === "event" && Boolean(i.time) && (i.start === i.end || (Boolean(i.endTime) && daysBetween(i.start, i.end) * 1440 + minutesOf(i.endTime!) - minutesOf(i.time!) < 1440));
/**
 * A timed appointment's part on one day: an overnight one runs from its start to midnight, then on from midnight to
 * its end the next day. Each part keeps the whole appointment's times to show.
 */
function partOn(i: Item, d: string): Item | null {
  if (d < i.start || d > i.end) return null;
  if (i.start === i.end) return i;
  // Ending at midnight sharp leaves nothing on the last day.
  if (d === i.end && d !== i.start && i.endTime === "00:00") return null;
  return { ...i, start: d, end: d, time: d === i.start ? i.time : "00:00", endTime: d === i.end ? i.endTime : "24:00", whole: { start: i.start, end: i.end, time: i.time!, endTime: i.endTime! } };
}

interface Block {
  item: Item;
  top: number;
  height: number;
  /** Side by side when appointments overlap: which slot of how many. */
  slot: number;
  of: number;
}
/** One day's timed appointments as blocks; overlapping ones share the width, as in any calendar. */
function layoutDay(list: Item[], px: number, h0: number, h1 = 24): Block[] {
  const sorted = [...list].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || (b.endTime ?? "").localeCompare(a.endTime ?? ""));
  const out: Block[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const of = Math.max(1, ...cluster.map((b) => b.slot + 1));
    cluster.forEach((b) => (b.of = of));
    cluster = [];
  };
  for (const item of sorted) {
    // Kept within the hours shown: an overnight part can start before them or run past them.
    const start = Math.max(h0 * 60, minutesOf(item.time!));
    // An appointment without an end, or one ending past midnight, runs its hour (or to the end of the day).
    const end = Math.min(h1 * 60, item.endTime && minutesOf(item.endTime) > start ? minutesOf(item.endTime) : Math.min(24 * 60, start + 60));
    if (start >= clusterEnd) flush();
    const top = (start / 60 - h0) * px;
    const taken = new Set(cluster.filter((b) => b.top + b.height > top).map((b) => b.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    const b: Block = { item, top, height: Math.max(18, ((end - start) / 60) * px - 2), slot, of: 1 };
    cluster.push(b);
    out.push(b);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

/** A phone-width screen, where bars across seven columns can't be read: the calendar becomes dots and an agenda. */
function usePhone() {
  const q = "(max-width: 820px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

export function CalendarView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const meta = useMeta();
  const s = useStore((x) => x);
  const t = today();
  const ws = meta.weekStart;
  const phone = usePhone();
  // A phone keeps its own view, and opens on the week as an agenda: the month's seven columns are too narrow for titles.
  const [deskMode, setDeskMode] = usePersisted<Mode>("calendar:mode", "month");
  const [phoneMode, setPhoneMode] = usePersisted<Mode>("calendar:mode:phone", "week");
  const mode = phone ? phoneMode : deskMode;
  const setMode = phone ? setPhoneMode : setDeskMode;
  const [cursor, setCursor] = useState(t);
  const [shown, setShown] = useState(t);
  const [itemKey, setItemKey] = useState<string | null>(null);
  // Items being marked done: the pen strikes them through, then they leave the calendar (done work stays off it).
  const [striking, setStriking] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // The hour grid opens on the working day (07:00), or an hour before the first appointment when that is earlier.
  const hoursRef = useRef<HTMLDivElement>(null);

  // The hard landscape: the owner's appointments (a subscribed Outlook calendar) sit first on each day.
  const feedFrom = mode === "year" ? `${shown.slice(0, 4)}-01-01` : addDays(firstOfMonth(shown), -7);
  const feedTo = mode === "year" ? `${shown.slice(0, 4)}-12-31` : addDays(firstOfMonth(shown), 45);
  const { events, feeds } = useEvents(feedFrom, feedTo);
  const feedById = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  const hiddenFeeds = useHiddenFeeds();
  const syncing = useSyncing();
  // The oldest read among the calendars: "last synced" can't claim more than that.
  const oldest = feeds.map((f) => f.syncedAt).filter((x): x is string => Boolean(x)).sort()[0];
  const lastSync = oldest ? new Date(oldest).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : null;
  // Bring back days (ticklers) are a layer, off by default: the calendar is the hard landscape.
  const [soft, setSoft] = usePersisted<boolean>("cal:soft", false);
  const all = useMemo(
    () => [
      ...events.map((e): Item => ({ key: `e:${e.key}`, kind: "event", id: e.key, title: e.title, start: e.date, end: e.endDate, role: "event", startField: null, endField: null, time: e.time, endTime: e.endTime, location: e.location, feed: e.feed, color: feedById.get(e.feed)?.color, feedName: feedById.get(e.feed)?.name })),
      ...itemsOf(s, t, soft),
    ],
    [s, t, events, feedById, soft],
  );
  // While a bar is dragged it is drawn where it would land.
  const items = useMemo(() => (drag ? all.map((i) => (i.key === drag.key ? { ...i, start: drag.start, end: drag.end } : i)) : all), [all, drag]);
  const onDay = (d: string) => items.filter((i) => i.start <= d && i.end >= d);
  // The Day tab's day reads its overdue work too (on today only): what should already have happened.
  const overdueBefore = (d: string) => (d === t ? items.filter((i) => i.kind !== "event" && i.role !== "followup" && i.overdue && i.end < d) : []);
  // Follow-ups already past their day (today's are in the day's landscape): chases to make, on today only.
  const lateFollowups = (d: string) => (d === t ? items.filter((i) => i.role === "followup" && i.end < d) : []);
  const fitNow = useFit();
  // "Late" means one thing everywhere: an action's day to do it passed with it still open. Follow-ups past their day are
  // chases (the rail's "to chase"), counted on Waiting For, not here; the count is what the Day tab's Late section lists.
  const overdueCount = overdueBefore(t).length;
  // The Day tab's next actions (what fits now, else anywhere) as items too, so the keyboard reaches every row.
  const nextNow: Item[] = useMemo(() => {
    if (mode !== "day" || cursor !== t) return [];
    const ctx = new Map(s.contexts.map((c) => [c.id, c.name]));
    return s.actions
      .filter((a) => a.status === "next" && !onHold(a, s) && !(a.defer && a.defer <= t) && !isDeferred(a, t) && (!fitNow || fits(a, fitNow) === "fits"))
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({ key: `n:${a.id}`, kind: "action" as const, id: a.id, title: a.title || "Untitled action", start: t, end: t, role: "next" as const, startField: null, endField: null, sub: a.context_id ? (ctx.get(a.context_id) ?? "") : "" }));
  }, [mode, cursor, t, s, fitNow]);
  const cursorItems = mode === "day" ? [...onDay(cursor), ...overdueBefore(cursor), ...nextNow.slice(0, 12), ...lateFollowups(cursor)] : onDay(cursor);
  const focusItem = itemKey ? (items.find((i) => i.key === itemKey) ?? nextNow.find((i) => i.key === itemKey)) : undefined;

  useEffect(() => {
    ui.followDetail(focusItem ? { kind: focusItem.kind, id: focusItem.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItem?.key]);
  // An appointment J is bringing back to (see below), picked once its week has arrived from the calendars.
  const arriving = useRef<string | null>(null);
  // The item cursor lets go when its item leaves the cursor day (moved, completed).
  useEffect(() => {
    const due = arriving.current;
    if (due) {
      if (cursor !== due.slice(-10)) arriving.current = null;
      else if (cursorItems.some((i) => i.key === `e:${due}`)) {
        arriving.current = null;
        setItemKey(`e:${due}`);
        return;
      }
    }
    if (itemKey && !cursorItems.some((i) => i.key === itemKey)) setItemKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, items]);

  // The period on screen follows the cursor day.
  // The period on screen follows the cursor when the keyboard or the arrows move it; a click on a day or item that
  // falls outside it (October's first days at the foot of September) picks it without turning the page.
  const weekDays = range(startOfWeek(shown, ws), 7);
  const monthStart = firstOfMonth(shown);
  const gridStart = startOfWeek(monthStart, ws);
  const monthWeeks = Math.ceil((daysBetween(gridStart, addDays(addMonths(monthStart, 1), -1)) + 1) / 7);
  const year = Number(shown.slice(0, 4));
  const title =
    mode === "day"
      ? `${cursor === t ? "Today · " : ""}${formatLong(cursor)}`
      : mode === "week"
      ? `Week ${isoWeek(weekDays[3])} · ${weekDays[0]} – ${weekDays[6]}`
      : mode === "month"
        ? `${MONTH[Number(shown.slice(5, 7)) - 1]} ${year}`
        : String(year);
  const step = (dir: -1 | 1) => {
    setItemKey(null);
    setCursor((c) => (mode === "day" ? addDays(c, dir) : mode === "week" ? addDays(c, 7 * dir) : mode === "month" ? addMonths(c, dir) : addMonths(c, 12 * dir)));
  };
  const moveCursor = (n: number) => {
    setItemKey(null);
    setCursor((c) => addDays(c, n));
  };

  /** Writes a moved or stretched item back to the fields its ends stand for. */
  const commit = (item: Item, start: string, end: string, how: "move" | "start" | "end") => {
    if (start === item.start && end === item.end) return;
    const table = item.kind === "action" ? "actions" : "projects";
    const data: Record<string, string> = {};
    // Every dated item is one day (a Do on, a follow-up, a tickler): moved, it takes the day it was dropped on.
    if (how === "move" && item.startField) data[item.startField] = start;
    if (!Object.keys(data).length) return;
    const when = start === end ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`;
    mutate(`“${item.title}” → ${when}`, [{ type: "patch", table, id: item.id, data }]);
  };

  /** Drag a bar to move it, or an end to change that date, as in any calendar. A press without a move is a click. */
  const startDrag = (e: ReactMouseEvent, item: Item, how: "move" | "start" | "end") => {
    if (e.button !== 0) return;
    // An appointment belongs to its calendar: it isn't moved here, and a click shows its details.
    if (item.kind === "event") {
      e.preventDefault();
      setItemKey(item.key);
      ui.openDetail({ kind: "event", id: item.id });
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // The second press of a double-click opens the item's details. It must be caught here: a press takes the bars out
    // of the pointer's way (so a drag can read the day under it), which would hand the double-click to the day
    // beneath and start a new action there instead.
    if (e.detail >= 2) {
      setItemKey(item.key);
      ui.openDetail({ kind: item.kind, id: item.id }, true);
      return;
    }
    const dateAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null;
    const x0 = e.clientX;
    const y0 = e.clientY;
    // Bars stop taking the pointer for the whole press, so the day under it can be read (the bar sits over the cells).
    document.body.classList.add("is-cal-dragging");
    const origin = dateAt(x0, y0) ?? item.start;
    let lastAt = origin;
    let moved = false;
    let cur: Drag = { key: item.key, start: item.start, end: item.end };
    const move = (ev: MouseEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) {
        moved = true;
        document.body.classList.add(how === "move" ? "is-cal-moving" : "is-cal-sizing");
      }
      const at = dateAt(ev.clientX, ev.clientY);
      if (!at) return;
      lastAt = at;
      const delta = daysBetween(origin, at);
      if (how === "move") cur = { key: item.key, start: addDays(item.start, delta), end: addDays(item.end, delta) };
      else if (how === "start") cur = { key: item.key, start: min(addDays(item.start, delta), item.end), end: item.end };
      else cur = { key: item.key, start: item.start, end: max(addDays(item.end, delta), item.start) };
      setDrag(cur);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("is-cal-dragging", "is-cal-moving", "is-cal-sizing");
      setDrag(null);
      if (!moved) {
        // A click picks the item (the detail pane follows it); its day becomes the cursor day.
        cursorFromMouse(dateAt(x0, y0) ?? item.start);
        setItemKey(item.key);
        return;
      }
      commit(item, cur.start, cur.end, how);
      // The cursor stays where the drop was, so the view doesn't jump away from it.
      setCursor(lastAt);
      setItemKey(item.key);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const shift = (item: Item | undefined, n: number, how: "move" | "end") => {
    if (!item) return;
    if (how === "move") {
      commit(item, addDays(item.start, n), addDays(item.end, n), "move");
      setCursor((c) => addDays(c, n));
    } else commit(item, item.start, max(addDays(item.end, n), item.start), "end");
  };
  const newOn = (day: string) =>
    ui.openPicker({
      type: "text",
      title: `New action for ${formatLong(day)}`,
      current: "",
      onPick: (title) => {
        if (!title.trim()) return;
        askContext(ui, "Context", (ctx, extra) => {
          // A day-specific action (GTD's calendar): start and due on that day, so it stays off Next Actions until then.
          const a = newAction({ title: title.trim(), status: "next", defer: day, context_id: ctx });
          mutate(`“${a.title}” on ${formatShort(day)}`, [...extra, { type: "create", table: "actions", row: { ...a } }]);
          setItemKey(`a:${a.id}`);
        });
      },
    });
  /** W, as everywhere: something you're waiting for, its follow-up on the day under the cursor. */
  const waitOn = (day: string) =>
    ui.openPicker({
      type: "text",
      title: `New waiting for, follow up ${formatLong(day)}`,
      current: "",
      onPick: (title) => {
        if (!title.trim()) return;
        window.setTimeout(() =>
          askWaitingOn(ui, null, (who) => {
            const a = newAction({ title: title.trim(), status: "waiting", waiting_who: who, waiting_since: t, followup: day });
            mutate(`Waiting on ${who}: follow up ${formatShort(day)}`, [{ type: "create", table: "actions", row: { ...a } }]);
            setItemKey(`f:${a.id}`);
          }),
        );
      },
    });
  const ed = editors(ui);
  const ped = projectEditors(ui);

  const inItem = Boolean(focusItem);
  const focusWaiting = focusItem?.kind === "action" && s.actions.find((a) => a.id === focusItem.id)?.status === "waiting";
  // Appointments belong to their calendar: moved, completed or re-dated only there.
  const editable = inItem && focusItem?.kind !== "event";
  /**
   * Trash what is under the cursor (to the Trash, ⌘Z brings it back); the cursor moves on to the day's next item, or
   * back to the day when it was the last. A project goes with its open actions, as it does on Projects.
   */
  const trashItem = (it: typeof focusItem) => {
    if (!it || it.kind === "event") return;
    const others = cursorItems.filter((x) => !(x.kind === it.kind && x.id === it.id));
    const at = cursorItems.findIndex((x) => x.key === it.key);
    setItemKey(others.length ? others[Math.min(Math.max(0, at), others.length - 1)].key : null);
    if (it.kind === "project") ped.trash([it.id], false);
    else mutate(`${named("actions", [it.id], "action")} trashed`, [{ type: "patch", table: "actions", id: it.id, data: { status: "trashed" } }]);
  };
  const cycle = (dir: 1 | -1) => {
    if (!cursorItems.length) return;
    const i = cursorItems.findIndex((x) => x.key === itemKey);
    setItemKey(cursorItems[(i + dir + cursorItems.length) % cursorItems.length].key);
  };
  const commands: Command[] = [
    { id: "cal.sync", label: "Sync calendars", group: "Calendar", keys: ["alt+s"], enabled: feeds.length > 0, run: () => void syncCalendars() },
    { id: "cal.day", label: "Show the day", group: "Calendar", keys: ["1"], run: () => setMode("day") },
    { id: "cal.week", label: "Show the week", group: "Calendar", keys: ["2"], run: () => setMode("week") },
    { id: "cal.month", label: "Show the month", group: "Calendar", keys: ["3"], run: () => setMode("month") },
    { id: "cal.year", label: "Show the year", group: "Calendar", keys: ["4"], run: () => setMode("year") },
    // T and W add, as they do everywhere (DESIGN.md: letters mean one thing); today is Home, or Outlook's ⌥⇧Y.
    { id: "cal.today", label: "Go to today", group: "Calendar", keys: ["home", "alt+shift+y"], run: () => (setItemKey(null), setCursor(t)) },
    { id: "cal.prev", label: `Previous ${mode}`, group: "Calendar", keys: ["pageup", "shift+arrowleft"], run: () => step(-1) },
    { id: "cal.next", label: `Next ${mode}`, group: "Calendar", keys: ["pagedown", "shift+arrowright"], run: () => step(1) },
    { id: "cal.left", label: "Go to the previous day", group: "Move", keys: ["arrowleft"], run: () => moveCursor(-1) },
    { id: "cal.right", label: "Go to the next day", group: "Move", keys: ["arrowright"], run: () => moveCursor(1) },
    // On the Day tab ↑↓ walk the day's items (there is no week to move through); elsewhere they move a week.
    { id: "cal.up", label: inItem ? "Go to the previous item on this day" : mode === "day" ? "Go to the last item of the day" : "Go to the same day last week", group: "Move", keys: ["arrowup"], run: () => (inItem ? cycle(-1) : mode === "day" ? cursorItems.length && setItemKey(cursorItems[cursorItems.length - 1].key) : moveCursor(-7)) },
    { id: "cal.down", label: inItem ? "Go to the next item on this day" : mode === "day" ? "Go to the first item of the day" : "Go to the same day next week", group: "Move", keys: ["arrowdown"], run: () => (inItem ? cycle(1) : mode === "day" ? cursorItems.length && setItemKey(cursorItems[0].key) : moveCursor(7)) },
    {
      id: "cal.enter",
      label: inItem ? "Open details" : mode === "year" ? "Open this month" : "Step into the day's items",
      group: "Calendar",
      keys: ["enter"],
      run: () => {
        if (focusItem) ui.openDetail({ kind: focusItem.kind, id: focusItem.id }, true);
        else if (mode === "year") setMode("month");
        else if (cursorItems.length) setItemKey(cursorItems[0].key);
      },
    },
    { id: "cal.out", label: "Back to the day", group: "Calendar", keys: ["escape"], enabled: inItem, run: () => setItemKey(null) },
    { id: "cal.new", label: "New action on this day", group: "Calendar", keys: ["t", "n"], run: () => newOn(cursor) },
    { id: "cal.soft", label: soft ? "Hide bring back days" : "Show bring back days", group: "View", run: () => setSoft(!soft) },
    { id: "cal.wait", label: "New waiting for on this day", group: "Calendar", keys: ["w"], run: () => waitOn(cursor) },
    { id: "cal.later", row: true, label: "Move a day later", group: "Calendar", keys: ["alt+arrowright"], enabled: editable, run: () => shift(focusItem, 1, "move") },
    { id: "cal.earlier", row: true, label: "Move a day earlier", group: "Calendar", keys: ["alt+arrowleft"], enabled: editable, run: () => shift(focusItem, -1, "move") },
    {
      id: "cal.done",
      row: true,
      label: "Mark done",
      group: "Calendar",
      keys: ["e"],
      enabled: editable,
      run: () => focusItem && finish(focusItem),
    },
    {
      // Your own things only (owner's request): an appointment belongs to its calendar and is deleted there.
      id: "cal.trash",
      row: true,
      label: focusItem?.kind === "project" ? "Trash the project (and its open actions)" : "Trash",
      group: "Calendar",
      keys: ["backspace", "delete"],
      enabled: editable,
      run: () => trashItem(focusItem),
    },
    {
      // S sets the date, as on the lists: the follow-up on a waiting item, the day to do it on anything else.
      id: "cal.due",
      row: true,
      label: focusWaiting ? "Set follow-up date" : "Set the day to do it",
      group: "Fields",
      keys: ["s"],
      enabled: editable,
      run: () => focusItem && (focusItem.kind === "action" ? ed.date([focusItem.id], focusWaiting ? "followup" : "defer") : ped.date([focusItem.id], "start")),
    },
    {
      id: "cal.jump",
      row: true,
      label: "Jump to its project",
      group: "Calendar",
      keys: ["j"],
      enabled: focusItem?.kind === "event" || focusItem?.kind === "action",
      run: () => focusItem && (focusItem.kind === "event" ? ui.jumpFromAppointment(focusItem.id) : focusItem.kind === "action" && ui.jumpToProject(focusItem.id)),
    },
    {
      id: "cal.project",
      row: true,
      label: focusItem?.kind === "event" ? "Link the appointment to a project" : "Set project",
      group: "Fields",
      keys: ["p"],
      // P as on every list: an appointment is linked to a project, an action set in one (a project has none).
      enabled: focusItem?.kind === "event" || focusItem?.kind === "action",
      run: () =>
        focusItem?.kind === "event"
          ? linkAppointment(ui, { key: focusItem.id, title: focusItem.title, date: focusItem.start, time: focusItem.time ?? null, endTime: focusItem.endTime ?? null, feed: focusItem.feed ?? "" })
          : focusItem?.kind === "action" && setProject(ui, "actions", [focusItem.id]),
    },
    // An action under the cursor takes the rest of the keys an action takes on its list (F2, V, ⇧P, C, M, G, R, B, H, ⇧F).
    ...actionRowCommands(ui, {
      targets: () => (focusItem?.kind === "action" ? [focusItem.id] : []),
      focusId: focusItem?.kind === "action" ? focusItem.id : null,
      group: "Calendar",
      skip: ["row.open", "row.jump", "row.project", "row.date", "row.trash", "row.delete"],
    }),
  ];
  useCommands("list:calendar", commands, { priority: 10, active: regionActive });
  // While the calendar is the active region it holds focus (as a list's grid does), so a screen reader is inside the
  // calendar widget and hears the live line; a picker, a field or the pane keep focus when they have it.
  useEffect(() => {
    if (!regionActive) return;
    const el = document.activeElement;
    if (!el || el === document.body) root.current?.focus({ preventScroll: true });
  });

  // J from a project lands here on its appointment: that day, the appointment picked (its key ends in its day).
  useEffect(() => {
    if (ui.revealTarget?.kind !== "event") return;
    const key = ui.revealTarget.id;
    const day = key.slice(-10);
    setCursor(day);
    // Already on screen (its week fetched): pick it now; otherwise once it arrives.
    if (onDay(day).some((i) => i.key === `e:${key}`)) setItemKey(`e:${key}`);
    else {
      arriving.current = key;
      setItemKey(null);
    }
    if (mode === "year") setMode("week");
    ui.clearReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget]);

  // Opening the month on the current one: this week goes to the top, the past a scroll away above it.
  useEffect(() => {
    if (mode !== "month" || monthOf(shown) !== monthOf(t)) return;
    const row = root.current?.querySelector<HTMLElement>(".cal-row.is-this-week");
    const scroller = row?.closest<HTMLElement>(".cal-month");
    if (row && scroller) scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  }, [mode, monthOf(shown)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the cursor day in view in the week and month grids, when the keyboard moved it. A click already happened on
  // screen: scrolling then would slide the item from under the pointer and send a double-click's second press elsewhere.
  const cursorByMouse = useRef(false);
  const cursorFromMouse = (d: string) => {
    cursorByMouse.current = true;
    setCursor(d);
    // Cleared shortly after, in case the day didn't change (no effect ran): the next keyboard move scrolls as usual.
    window.setTimeout(() => (cursorByMouse.current = false), 50);
  };
  useEffect(() => {
    if (cursorByMouse.current) {
      cursorByMouse.current = false;
      return;
    }
    setShown(cursor);
    root.current?.querySelector(`[data-date="${cursor}"].is-cursor`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, mode]);

  const bar = (p: Placed, rich: boolean) => {
    const i = p.item;
    const single = i.role === "followup" || i.role === "tickler" || i.role === "event" || i.role === "day";
    const quiet = i.role === "followup" || i.role === "tickler";
    const canStart = !single && !p.contL;
    const canEnd = !single && !p.contR;
    const cls = [
      "cal-bar",
      `is-${i.kind}`,
      `role-${i.role}`,
      quiet ? "is-quiet" : "",
      i.overdue ? "is-overdue" : "",
      i.waiting ? "is-waiting" : "",
      p.contL ? "cont-l" : "",
      p.contR ? "cont-r" : "",
      itemKey === i.key ? "is-focus" : "",
      drag?.key === i.key ? "is-dragging" : "",
    ].join(" ");
    const label =
      i.role === "event" ? `${i.time ? `${i.time}${i.endTime ? `–${i.endTime}` : ""} ` : ""}${i.title}${i.location ? ` · ${i.location}` : ""}` : i.role === "followup" ? `Follow up: ${i.waiting ?? ""} · ${i.title}` : i.role === "tickler" ? `Comes back: ${i.title}` : i.waiting ? `${i.title} · waiting on ${i.waiting}` : i.title;
    const dates =
      i.role === "event" ? (i.start === i.end ? formatLong(i.start) : `${formatLong(i.start)} to ${formatLong(i.end)}`) : i.role === "day" ? `on ${formatLong(i.start)}` : formatLong(i.start);
    return (
      <div
        key={i.key}
        className={cls}
        // What has focus, so a picker opened from the keyboard (P, S…) opens at it.
        data-focused={itemKey === i.key || undefined}
        style={{ gridColumn: `${p.col} / span ${p.span}`, gridRow: p.lane + 1, ...(i.color ? { ["--feed" as string]: i.color } : {}) }}
        title={`${label}\n${dates}${i.overdue ? (i.role === "followup" ? " · to chase" : " · late") : ""}`}
        aria-label={`${i.kind === "project" ? "Project" : i.kind === "event" ? `Appointment${i.feedName ? `, ${i.feedName}` : ""}` : "Action"}: ${label}, ${dates}${i.overdue ? (i.role === "followup" ? ", to chase" : ", late") : ""}`}
        onMouseDown={(e) => startDrag(e, i, "move")}
        onDoubleClick={() => ui.openDetail({ kind: i.kind, id: i.id }, true)}
      >
        {canStart && <span className="cal-grip is-start" onMouseDown={(e) => startDrag(e, i, "start")} aria-hidden="true" />}
        <span className="cal-line">
          {i.kind === "project" && i.health && <Lamp health={i.health} start={i.projectStart} appt={i.projectAppt} />}
          {i.role === "followup" && <Hourglass size={11} strokeWidth={2} aria-hidden />}
          {i.role === "tickler" && <CalendarClock size={11} strokeWidth={2} aria-hidden />}
          {i.role === "event" && i.time && <span className="cal-time">{i.time}</span>}
          <span className="cal-title">{i.role === "followup" ? `Follow up ${i.waiting ?? ""}` : i.title}</span>
        </span>
        {rich && i.role === "followup" && <span className="cal-sub">{i.title}</span>}
        {rich && i.role !== "followup" && (i.sub || i.waiting) && <span className="cal-sub">{i.waiting ? `Waiting on ${i.waiting}` : i.sub}</span>}
        {canEnd && <span className="cal-grip is-end" onMouseDown={(e) => startDrag(e, i, "end")} aria-hidden="true" />}
      </div>
    );
  };

  /** One item as an agenda line (phones): its mark, the full title, and what the date is to it. */
  /** Marks an action or project done (E, or its Complete box): struck through first, then gone, ⌘Z to bring it back. */
  const finish = (i: Item) => {
    if ((i.kind !== "action" && i.kind !== "project") || striking.has(i.key)) return;
    setStriking((p) => new Set(p).add(i.key));
    window.setTimeout(() => {
      if (i.kind === "action") completeActions([i.id]);
      else ped.complete([i.id]);
      setStriking((p) => new Set([...p].filter((k) => k !== i.key)));
    }, 380);
  };
  /** Today's "N late", opening the Day tab: on a phone it sits on today's heading, since a cell has no room for it. */
  const overdueLink = (d: string) =>
    d === t && overdueCount > 0 ? (
      <button
        type="button"
        className="cal-overdue"
        onClick={() => {
          setItemKey(null);
          setCursor(t);
          setMode("day");
        }}
        title="Open the Day tab: today, with what is late"
      >
        {overdueCount} late
      </button>
    ) : null;
  const agendaRow = (i: Item, d: string, label?: string) => {
    const what =
      label ??
      (i.role === "event" ? (i.time ? `${i.time}${i.endTime ? `–${i.endTime}` : ""}` : "All day") : i.role === "followup" ? `Follow up ${i.waiting ?? ""}` : i.role === "tickler" ? "Comes back" : "On the day");
    // Your own work has the lists' Complete box (owner's request), ahead of its mark; an appointment belongs to its calendar.
    const doable = i.kind === "action" || i.kind === "project";
    const going = striking.has(i.key);
    return (
      <li key={i.key} className={`cal-agenda-item ${going ? "is-striking" : ""}`}>
        {doable && (
          <span className="cal-agenda-done">
            <DoneBox done={going} title={i.title} onToggle={() => finish(i)} />
          </span>
        )}
        <button
          type="button"
          className={`cal-agenda-row ${i.overdue && i.end === d ? "is-overdue" : ""} ${itemKey === i.key ? "is-focus" : ""}`}
          data-focused={itemKey === i.key || undefined}
          onClick={() => {
            setCursor(d);
            setItemKey(i.key);
            ui.openDetail({ kind: i.kind, id: i.id }, true);
          }}
        >
          <span className="cal-agenda-mark" aria-hidden="true">
            {i.kind === "project" && i.health ? <Lamp health={i.health} start={i.projectStart} appt={i.projectAppt} /> : i.role === "followup" ? <Hourglass size={13} strokeWidth={2} /> : i.role === "tickler" ? <CalendarClock size={13} strokeWidth={2} /> : i.kind === "event" ? (
              <EventMark color={i.color} />
            ) : (
              <Marker quiet={phone} />
            )}
          </span>
          <span className={`cal-agenda-title ${i.kind === "project" ? "strong" : ""}`}>{i.title}</span>
          <span className="cal-agenda-when">{what}</span>
        </button>
      </li>
    );
  };
  const dots = (d: string) => {
    const on = onDay(d).slice(0, 4);
    return on.length ? (
      <span className="cal-dots" aria-hidden="true">
        {on.map((i) => (
          <i key={i.key} style={i.kind === "event" && i.color ? { background: i.color } : undefined} className={i.kind === "event" ? "is-event" : i.overdue ? "is-due" : i.role === "followup" ? "is-follow" : i.kind === "project" ? "is-project" : ""} />
        ))}
      </span>
    ) : null;
  };

  const dayCell = (d: string, opts: { outside?: boolean; hidden?: number; head?: boolean }) => (
    <div
      key={d}
      data-date={d}
      // With no item picked, the cursor day has focus: a picker from the keyboard opens under it.
      data-focused={(d === cursor && !itemKey) || undefined}
      className={[
        "cal-day",
        d === t ? "is-today" : "",
        d === cursor ? "is-cursor" : "",
        opts.outside ? "is-outside" : "",
        dow(d) === 0 || dow(d) === 6 ? "is-weekend" : "",
        d < t ? "is-past" : "",
      ].join(" ")}
      onMouseDown={() => (setItemKey(null), cursorFromMouse(d))}
      onDoubleClick={() => newOn(d)}
    >
      {opts.head ? (
        <span className="cal-dayhead">
          <span className="cal-wd">{WEEKDAY[dow(d)]}</span>
          <span className="cal-num">{Number(d.slice(8))}</span>
        </span>
      ) : (
        <span className="cal-num">{Number(d.slice(8)) === 1 && !phone ? `${Number(d.slice(8))} ${MONTH[Number(d.slice(5, 7)) - 1].slice(0, 3)}` : Number(d.slice(8))}</span>
      )}
      {phone && !opts.head && dots(d)}
      {/* What should already have happened, on today's cell, so Week and Month don't hide it in the past. */}
      {d === t && overdueCount > 0 && !phone && (
        <button
          type="button"
          className="cal-overdue"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            setItemKey(null);
            setCursor(t);
            setMode("day");
          }}
          title="Open the Day tab: today, with what is late"
        >
          {overdueCount} late
        </button>
      )}
      {!phone && Boolean(opts.hidden) && (
        <button
          type="button"
          className="cal-more"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            setCursor(d);
            // In the week, "+N more" opens the all-day band; in the month, it goes to that week.
            if (mode === "week") setBandOpen(true);
            else setMode("week");
          }}
        >
          +{opts.hidden} more
        </button>
      )}
    </div>
  );

  const weekdayHead = (
    <div className="cal-weekdays" aria-hidden="true">
      {mode === "month" && <span className="cal-wk" />}
      {range(startOfWeek(t, ws), 7).map((d) => (
        <span key={d}>{phone ? WEEKDAY[dow(d)][0] : WEEKDAY[dow(d)]}</span>
      ))}
    </div>
  );

  // The week fits its window (owner's request: no scrolling): the hours fill what is left under the all-day band.
  const [hoursHeight, setHoursHeight] = useState(0);
  useEffect(() => {
    const el = hoursRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHoursHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, phone]);
  const [bandOpen, setBandOpen] = useState(false);
  const { dayHours } = useMeta();
  useEffect(() => setBandOpen(false), [weekDays[0]]);

  let body;
  if (mode === "year") body = <YearGrid year={year} ws={ws} items={all} cursor={cursor} t={t} phone={phone} onPick={(d) => (setCursor(d), setMode("month"))} onCursor={setCursor} />;
  else if (mode === "month") {
    // Past weeks keep a compact three lanes ("+N more" for the rest); this week and later ones grow to hold what
    // is on them, and the month opens scrolled to this week (owner's decision: the calendar looks forward).
    const weeks = Array.from({ length: monthWeeks }, (_, w) => {
      const days = range(addDays(gridStart, w * 7), 7);
      const ahead = days[6] >= t;
      const row = layoutRow(days, items, ahead ? MONTH_LANES_AHEAD : MONTH_LANES);
      return { days, ahead, row, min: phone ? 48 : ahead ? Math.max(150, 29 + row.lanes * 24 + 26) : 112 };
    });
    body = (
      <>
        {weekdayHead}
        <div className="cal-month" tabIndex={0} aria-label={`Weeks of ${title}`} style={{ gridTemplateRows: weeks.map((w) => `minmax(${w.min}px, 1fr)`).join(" ") }}>
          {weeks.map(({ days, ahead, row }) => {
            return (
              <div key={days[0]} className={`cal-row ${ahead ? "is-ahead" : ""} ${days[0] <= t && t <= days[6] ? "is-this-week" : ""}`}>
                <span className="cal-wk num" title={`Week ${isoWeek(days[3])}`}>
                  {isoWeek(days[3])}
                </span>
                <div className="cal-cells">{days.map((d, i) => dayCell(d, { outside: monthOf(d) !== monthOf(shown), hidden: row.hidden[i] }))}</div>
                {!phone && <div className="cal-bars">{row.placed.map((p) => bar(p, false))}</div>}
              </div>
            );
          })}
        </div>
        {/* On a phone the chosen day's items are listed in full under the grid (tap a day to choose it). */}
        {phone && (
          <section className="cal-agenda-day" aria-label={formatLong(cursor)}>
            <h3 className="cal-agenda-head">
              {formatLong(cursor)}
              {overdueLink(cursor)}
            </h3>
            {cursorItems.length ? <ul className="cal-agenda">{cursorItems.map((i) => agendaRow(i, cursor))}</ul> : <p className="cal-agenda-none">Nothing scheduled.</p>}
          </section>
        )}
      </>
    );
  } else if (mode === "day") {
    // The daily review (GTD): the hard landscape first (appointments, day-specific actions, deadlines, follow-ups),
    // what is overdue, then the next actions that fit now and the chases still to make. Every row is the same agenda
    // row: ↑↓ walk them all, Enter opens the details beside the calendar, J goes to its project.
    const d = cursor;
    const here = onDay(d);
    const late = overdueBefore(d);
    const chases = lateFollowups(d);
    body = (
      <div className="cal-day-view">
        <section aria-label="On the calendar">
          <h3 className="cal-day-h">On the calendar</h3>
          {here.length ? <ul className="cal-agenda">{here.map((i) => agendaRow(i, d))}</ul> : <p className="cal-agenda-none">Nothing scheduled.</p>}
        </section>
        {late.length > 0 && (
          <section aria-label="Late">
            <h3 className="cal-day-h">Late</h3>
            <ul className="cal-agenda">{late.map((i) => agendaRow(i, d, `Do on ${formatShort(i.end)}`))}</ul>
          </section>
        )}
        {d === t && (
          <section aria-label="Next actions">
            <h3 className="cal-day-h">
              Next actions <span className="cal-day-note">{fitNow ? `that fit ${fitLabel(fitNow)}` : "anywhere"}</span>
            </h3>
            {nextNow.length ? (
              <ul className="cal-agenda">{nextNow.slice(0, 12).map((i) => agendaRow(i, d, i.sub ?? ""))}</ul>
            ) : (
              <p className="cal-agenda-none">{fitNow ? "Nothing fits right now." : "No next actions."}</p>
            )}
            {nextNow.length > 12 && (
              <button type="button" className="text-btn cal-day-more" onClick={() => ui.go("next")}>
                {plural(nextNow.length - 12, "more")} on Next Actions
              </button>
            )}
          </section>
        )}
        {chases.length > 0 && (
          <section aria-label="Follow-ups to chase">
            <h3 className="cal-day-h">Follow-ups to chase</h3>
            <ul className="cal-agenda">{chases.map((i) => agendaRow(i, d, `${i.waiting ?? ""} · was ${formatShort(i.end)}`))}</ul>
          </section>
        )}
      </div>
    );
  } else if (phone) {
    // The week as an agenda: one section per day, every item with its full title.
    body = (
      <div className="cal-agenda-week">
        {weekDays.map((d) => {
          const list = onDay(d);
          return (
            <section key={d} data-date={d} className={`cal-agenda-day ${d === t ? "is-today" : ""} ${d < t ? "is-past" : ""} ${list.length ? "" : "is-empty"}`} aria-label={`${formatLong(d)}${list.length ? "" : ", nothing scheduled"}`}>
              <h3 className="cal-agenda-head">
                <span className="cal-wd">{WEEKDAY[dow(d)]}</span>
                <span className="cal-num">{Number(d.slice(8))}</span>
                <span className="cal-agenda-month">{MONTH[Number(d.slice(5, 7)) - 1].slice(0, 3)}</span>
                {overdueLink(d)}
              </h3>
              {list.length > 0 && <ul className="cal-agenda">{list.map((i) => agendaRow(i, d))}</ul>}
            </section>
          );
        })}
      </div>
    );
  } else {
    // The week with its hours, like any calendar: what has no time of day (deadlines, starts, follow-ups, projects,
    // all-day appointments) in a band across the top; timed appointments where they fall in the day below.
    const banded = items.filter((i) => !isTimed(i));
    // The band is one line per item and three rows a day; "+N more" opens it for this week.
    const row = layoutRow(weekDays, banded, bandOpen ? WEEK_LANES : BAND_ROWS);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    // The hours set in Settings, stretched to take in any of this week's appointments that fall outside them.
    const timed = items.filter(isTimed).flatMap((i) => weekDays.map((d) => partOn(i, d)).filter((x): x is Item => x !== null));
    // An overnight appointment's parts stretch them only to its real start and end (an hour of it either side of
    // midnight shows); the rest runs off the edge of the hours, its dashed end saying it carries on.
    const firstMin = (i: Item) => (i.whole && i.start !== i.whole.start ? Math.max(0, minutesOf(i.endTime!) - 60) : minutesOf(i.time!));
    const lastMin = (i: Item) => (i.whole && i.end !== i.whole.end ? Math.min(1440, minutesOf(i.time!) + 60) : i.endTime && minutesOf(i.endTime) > minutesOf(i.time!) ? minutesOf(i.endTime) : minutesOf(i.time!) + 60);
    const h0 = Math.min(dayHours[0], ...timed.map((i) => Math.floor(firstMin(i) / 60)));
    const h1 = Math.max(dayHours[1], ...timed.map((i) => Math.ceil(lastMin(i) / 60)));
    const px = Math.max(MIN_HOUR_PX, hoursHeight ? Math.floor((hoursHeight - 8) / (h1 - h0)) : 40);
    body = (
      <div className="cal-week is-hours">
        <div className="cal-row is-week is-band" style={{ minHeight: 38 + Math.max(1, row.lanes) * 24 + (row.hidden.some(Boolean) ? 24 : 6) }}>
          <span className="cal-gutter-label">All day</span>
          <div className="cal-cells">{weekDays.map((d, i) => dayCell(d, { head: true, hidden: row.hidden[i] }))}</div>
          <div className="cal-bars" style={{ gridTemplateRows: `repeat(${Math.max(1, row.lanes)}, 22px)` }}>
            {row.placed.map((p) => bar(p, false))}
          </div>
        </div>
        <div className="cal-hours" ref={hoursRef} aria-label="Hours of the week">
          <div className="cal-hours-grid" style={{ height: (h1 - h0) * px, ["--hour" as string]: `${px}px` }}>
            <div className="cal-gutter" aria-hidden="true">
              {Array.from({ length: h1 - h0 }, (_, i) => h0 + i).map((h) => (
                <span key={h} style={{ top: (h - h0) * px }}>
                  {h > h0 ? `${String(h).padStart(2, "0")}:00` : ""}
                </span>
              ))}
            </div>
            {weekDays.map((d) => (
              <div
                key={d}
                data-date={d}
                className={`cal-hourcol ${d === t ? "is-today" : ""} ${d === cursor ? "is-cursor" : ""} ${dow(d) === 0 || dow(d) === 6 ? "is-weekend" : ""}`}
                onMouseDown={() => (setItemKey(null), cursorFromMouse(d))}
              >
                {layoutDay(timed.filter((i) => i.start === d), px, h0, h1).map((b) => {
                  // A part of an overnight appointment names the whole: "21:15–09:40", and in a short block the end when
                  // it is the morning part.
                  const w = b.item.whole;
                  const from = w?.time ?? b.item.time;
                  const to = w?.endTime ?? b.item.endTime;
                  const when = w ? `${formatLong(w.start)} ${w.time} to ${formatLong(w.end)} ${w.endTime}` : `${formatLong(d)} ${from}${to ? ` to ${to}` : ""}`;
                  return (
                  <div
                    key={b.item.key}
                    // A part of an overnight appointment runs square into the day it continues from, or on to.
                    className={`cal-block ${b.height < 40 ? "is-compact" : ""} ${itemKey === b.item.key ? "is-focus" : ""} ${b.item.whole && d !== b.item.whole.start ? "is-from-before" : ""} ${b.item.whole && d !== b.item.whole.end ? "is-to-after" : ""}`}
                    data-focused={itemKey === b.item.key || undefined}
                    style={{ top: b.top, height: b.height, left: `calc(${(b.slot / b.of) * 100}% + 2px)`, width: `calc(${100 / b.of}% - 4px)`, ...(b.item.color ? { ["--feed" as string]: b.item.color } : {}) }}
                    title={`${from}${to ? `–${to}` : ""} ${b.item.title}${b.item.location ? ` · ${b.item.location}` : ""}${b.item.feedName ? `\n${b.item.feedName}` : ""}`}
                    aria-label={`Appointment${b.item.feedName ? `, ${b.item.feedName}` : ""}: ${b.item.title}, ${when}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setCursor(d);
                      setItemKey(b.item.key);
                      ui.openDetail({ kind: "event", id: b.item.id });
                    }}
                  >
                    <span className="cal-block-time">
                      {b.height >= 40 ? `${from}${to ? `–${to}` : ""}` : w && d !== w.start ? `–${to}` : from}
                    </span>
                    {/* The title takes the lines the block has room for, less one for the place when it shows, then an
                        ellipsis: never a half-cut line, and the place never runs over it. */}
                    <span className="cal-block-title" style={b.height >= 40 ? { WebkitLineClamp: Math.max(1, Math.floor((b.height - 24) / 15) - (b.item.location && b.height > 56 ? 1 : 0)) } : undefined}>
                      {b.item.title}
                    </span>
                    {b.item.location && b.height > 56 && <span className="cal-block-sub">{placeName(b.item.location)}</span>}
                  </div>
                );
                })}
                {d === t && nowMin >= h0 * 60 && nowMin <= h1 * 60 && <div className="cal-now" style={{ top: (nowMin / 60 - h0) * px }} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    // One keyboard widget for a screen reader (Calendar critique): the calendar holds focus and its keys, and the live
    // line below says where the cursor is and what it is on (kind, when, overdue, which calendar).
    <div
      className={`calendar is-${mode} ${phone ? "is-phone" : ""}`}
      ref={root}
      role="application"
      aria-roledescription="calendar"
      aria-label={`Calendar, ${title}`}
      aria-describedby="cal-live"
      tabIndex={-1}
    >
      <div className="cal-bar-top">
        {/* A phone's narrow title gives the week its own line and the dates a quieter one under it, so it never breaks
            inside a date. */}
        <h2 className="cal-title-period">
          {mode === "week" && phone ? (
            <>
              Week {isoWeek(weekDays[3])}
              <span className="cal-title-dates">
                {weekDays[0]} – {weekDays[6]}
              </span>
            </>
          ) : (
            title
          )}
        </h2>
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label={`Previous ${mode}`} title={`Previous ${mode} (${keyLabel("pageup")})`}>
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button type="button" className="cal-today" onClick={() => (setItemKey(null), setCursor(t))} title={`Go to today (${keyLabel("home")})`}>
            Today
          </button>
          <button type="button" className="icon-btn" onClick={() => step(1)} aria-label={`Next ${mode}`} title={`Next ${mode} (${keyLabel("pagedown")})`}>
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>
        {/* The right-hand group, pushed right once: what's shown (the soft-dates layer and each calendar), then sync. */}
        <div className="cal-legend" aria-label="What's shown">
          {/* Bring back days (ticklers) as a layer you switch on; the hard landscape always shows. */}
          <button
            type="button"
            className={`cal-legend-item cal-soft ${soft ? "is-on" : ""}`}
            aria-pressed={soft}
            title={soft ? "Hide bring back days" : "Show bring back days: when someday items come back"}
            onClick={() => setSoft(!soft)}
          >
            <span className="cal-soft-box" aria-hidden="true" />
            Bring back
          </button>
          {/* The subscribed calendars, each in its colour: pressing one hides it here for a while (kept in this browser). */}
          {feeds.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`cal-legend-item ${hiddenFeeds.has(f.id) ? "is-off" : ""}`}
              aria-pressed={!hiddenFeeds.has(f.id)}
              title={hiddenFeeds.has(f.id) ? `Show ${f.name}` : `Hide ${f.name}`}
              onClick={() => toggleFeed(f.id)}
            >
              <span className="cal-legend-dot" style={{ background: hiddenFeeds.has(f.id) ? "transparent" : f.color }} aria-hidden="true" />
              {f.name}
            </button>
          ))}
        </div>
        {/* Sync now: every subscribed calendar read again at once; the icon turns while it runs. */}
        {feeds.length > 0 && (
          <button
            type="button"
            className={`icon-btn cal-sync ${syncing ? "is-syncing" : ""}`}
            onClick={() => void syncCalendars()}
            disabled={syncing}
            aria-label="Sync calendars"
            title={`Sync calendars (${keyLabel("alt+s")})${lastSync ? ` · last synced ${lastSync}` : ""}`}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden />
          </button>
        )}
        <div className="cal-modes" role="tablist" aria-label="Calendar view">
          {(["day", "week", "month", "year"] as Mode[]).map((m, i) => (
            <button key={m} id={`cal-tab-${m}`} type="button" role="tab" aria-selected={mode === m} aria-controls="cal-panel" tabIndex={mode === m ? 0 : -1} className={mode === m ? "is-current" : ""} onClick={() => setMode(m)} title={`${m[0].toUpperCase()}${m.slice(1)} (${i + 1})`} aria-keyshortcuts={String(i + 1)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div id="cal-panel" className="cal-panel" role="tabpanel" aria-labelledby={`cal-tab-${mode}`}>
        {body}
      </div>
      <p id="cal-live" className="visually-hidden" aria-live="polite">
        {focusItem ? describe(focusItem) : `${formatLong(cursor)}, ${cursorItems.length ? plural(cursorItems.length, "item") : "nothing scheduled"}`}
      </p>
    </div>
  );
}

/**
 * What an item is, said whole for a screen reader (Calendar critique: the live line gave only the title and date):
 * its kind, its title, when, and anything that asks for attention.
 */
function describe(i: Item): string {
  const when = i.start === i.end ? formatLong(i.start) : `${formatLong(i.start)} to ${formatLong(i.end)}`;
  const late = i.overdue ? (i.role === "followup" ? ", to chase" : ", late") : "";
  const what = i.kind === "project" ? "Project" : "Action";
  switch (i.role) {
    case "event":
      return `Appointment${i.feedName ? `, ${i.feedName}` : ""}: ${i.title}, ${when}${i.time ? `, ${i.time}${i.endTime ? ` to ${i.endTime}` : ""}` : ", all day"}${i.location ? `, ${i.location}` : ""}`;
    case "day":
      return `${what}: ${i.title}, on ${when}${late}`;
    case "followup":
      return `Follow up${i.waiting ? ` with ${i.waiting}` : ""}: ${i.title}, ${when}${late}`;
    case "tickler":
      return `Comes back: ${i.title}, ${when}`;
    case "next":
      return `Next action: ${i.title}${i.sub ? `, ${i.sub}` : ""}`;
  }
}

const formatShort = (d: string) => formatDate(d);

/** The year at a glance: twelve small months, each day shaded by how much it holds and dotted where something is due. */
function YearGrid({ year, ws, items, cursor, t, phone, onPick, onCursor }: { year: number; ws: 0 | 1; items: Item[]; cursor: string; t: string; phone: boolean; onPick: (d: string) => void; onCursor: (d: string) => void }) {
  const { load, due, peak } = useMemo(() => {
    const load = new Map<string, number>();
    const due = new Map<string, "due" | "overdue">();
    const lo = `${year}-01-01`;
    const hi = `${year}-12-31`;
    for (const i of items) {
      if (i.end < lo || i.start > hi) continue;
      for (let d = max(i.start, lo); d <= min(i.end, hi); d = addDays(d, 1)) load.set(d, (load.get(d) ?? 0) + 1);
      if (i.role === "day") due.set(i.end, i.overdue ? "overdue" : due.get(i.end) === "overdue" ? "overdue" : "due");
    }
    return { load, due, peak: Math.max(3, ...load.values()) };
  }, [items, year]);
  return (
    <div className="cal-year">
      {MONTH.map((name, m) => {
        const first = `${year}-${String(m + 1).padStart(2, "0")}-01`;
        const start = startOfWeek(first, ws);
        const days = range(start, 42).filter((_, i) => i < 35 || range(start, 42)[35].slice(0, 7) === first.slice(0, 7));
        return (
          <section key={name} className={`cal-mini ${monthOf(cursor) === first.slice(0, 7) ? "is-current" : ""}`} aria-label={`${name} ${year}`}>
            <button type="button" className="cal-mini-title" onClick={() => onPick(first.slice(0, 7) === monthOf(t) ? t : first)}>
              {name}
            </button>
            <div className="cal-mini-grid">
              <span className="cal-mini-wk" aria-hidden="true" />
              {range(start, 7).map((d) => (
                <span key={d} className="cal-mini-wd" aria-hidden="true">
                  {WEEKDAY[dow(d)][0]}
                </span>
              ))}
              {days.map((d, i) => {
                const outside = d.slice(0, 7) !== first.slice(0, 7);
                const n = outside ? 0 : (load.get(d) ?? 0);
                return [
                  i % 7 === 0 ? (
                    <span key={`w${d}`} className="cal-mini-wk num" aria-hidden="true">
                      {isoWeek(addDays(d, 3))}
                    </span>
                  ) : null,
                  outside ? (
                    <span key={d} className="cal-mini-day is-outside" aria-hidden="true" />
                  ) : (
                    <button
                      key={d}
                      type="button"
                      data-date={d}
                      className={["cal-mini-day", d === t ? "is-today" : "", d === cursor ? "is-cursor" : "", due.get(d) ? `has-${due.get(d)}` : ""].join(" ")}
                      style={{ ["--load" as string]: n / peak }}
                      aria-label={`${formatLong(d)}${n ? `, ${plural(n, "item")}` : ""}${due.get(d) === "overdue" ? ", late" : ""}`}
                      // The calendar's keys move through the days; 365 tab stops would bury everything after them.
                      tabIndex={-1}
                      onClick={() => (phone ? onPick(d) : onCursor(d))}
                      onDoubleClick={() => onPick(d)}
                    >
                      {Number(d.slice(8))}
                    </button>
                  ),
                ];
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

