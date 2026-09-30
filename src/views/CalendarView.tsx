import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Hourglass } from "lucide-react";
import { completeActions, isStalled, mutate, newAction, plural, projectHealth, useMeta, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { keyLabel, useCommands, type Command } from "../keys.ts";
import { usePersisted } from "../components/Grid.tsx";
import { toggleFeed, useEvents, useHiddenFeeds } from "../calendarFeed.ts";
import { ImportantGlyph, Lamp } from "../components/bits.tsx";
import { askContext, editors } from "../actionCommands.tsx";
import { projectEditors } from "./ProjectsView.tsx";
import { addDays, addMonths, daysBetween, formatLong, fromIso, today } from "../../shared/dates.ts";
import type { ID, State } from "../../shared/types.ts";

/*
 * The calendar is GTD's hard landscape: what has to happen on a given day, and what spans days. It shows the dates
 * the system already holds (an action's start and due, a project's start and due, follow-ups, ticklers) and lets
 * them be moved by dragging, as in any calendar: the bar to move it, either end to change that date.
 */

type Mode = "week" | "month" | "year";
type Role = "span" | "due" | "start" | "followup" | "tickler" | "event";
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
  /** The fields its two ends are stored in; null when that end is only implied (a due date with no start). */
  startField: string | null;
  endField: string | null;
  waiting?: string | null;
  flagged?: boolean;
  overdue?: boolean;
  sub?: string;
  health?: ReturnType<typeof projectHealth>;
  projectStart?: string | null;
  stalled?: boolean;
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
const range = (a: string, n: number) => Array.from({ length: n }, (_, i) => addDays(a, i));
const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);

/** Every dated thing the landscape holds. Done and deleted work stays off it. */
function itemsOf(s: State, t: string): Item[] {
  const out: Item[] = [];
  const proj = new Map(s.projects.map((p) => [p.id, p]));
  const ctx = new Map(s.contexts.map((c) => [c.id, c.name]));
  for (const a of s.actions) {
    const open = a.status === "next" || a.status === "waiting";
    if (open) {
      const sub = [a.project_id ? proj.get(a.project_id)?.title : null, a.context_id ? ctx.get(a.context_id) : null].filter(Boolean).join(" · ");
      const base = { kind: "action" as const, id: a.id, title: a.title || "Untitled action", waiting: a.status === "waiting" ? a.waiting_who || "someone" : null, flagged: Boolean(a.flagged), sub };
      if (a.defer && a.due && a.defer <= a.due) out.push({ ...base, key: `a:${a.id}`, start: a.defer, end: a.due, role: "span", startField: "defer", endField: "due", overdue: a.due < t });
      else if (a.due) out.push({ ...base, key: `a:${a.id}`, start: a.due, end: a.due, role: "due", startField: null, endField: "due", overdue: a.due < t });
      else if (a.defer) out.push({ ...base, key: `a:${a.id}`, start: a.defer, end: a.defer, role: "start", startField: "defer", endField: null });
      if (a.status === "waiting" && a.followup) out.push({ ...base, key: `f:${a.id}`, start: a.followup, end: a.followup, role: "followup", startField: "followup", endField: "followup", overdue: a.followup < t });
    }
    if ((open || a.status === "someday") && a.bring_back)
      out.push({ key: `b:${a.id}`, kind: "action", id: a.id, title: a.title || "Untitled action", start: a.bring_back, end: a.bring_back, role: "tickler", startField: "bring_back", endField: "bring_back" });
  }
  for (const p of s.projects) {
    if (p.status === "active") {
      const base = { kind: "project" as const, id: p.id, title: p.title || "Untitled project", health: projectHealth(s, p), projectStart: p.start, stalled: isStalled(s, p) };
      if (p.start && p.due && p.start <= p.due) out.push({ ...base, key: `p:${p.id}`, start: p.start, end: p.due, role: "span", startField: "start", endField: "due", overdue: p.due < t });
      else if (p.due) out.push({ ...base, key: `p:${p.id}`, start: p.due, end: p.due, role: "due", startField: null, endField: "due", overdue: p.due < t });
      else if (p.start) out.push({ ...base, key: `p:${p.id}`, start: p.start, end: p.start, role: "start", startField: "start", endField: null });
    }
    if ((p.status === "active" || p.status === "someday") && p.bring_back)
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

/** A phone-width screen, where bars across seven columns can't be read: the calendar becomes dots and an agenda. */
function usePhone() {
  const q = "(max-width: 640px)";
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // The hard landscape: the owner's appointments (a subscribed Outlook calendar) sit first on each day.
  const feedFrom = mode === "year" ? `${shown.slice(0, 4)}-01-01` : addDays(firstOfMonth(shown), -7);
  const feedTo = mode === "year" ? `${shown.slice(0, 4)}-12-31` : addDays(firstOfMonth(shown), 45);
  const { events, feeds } = useEvents(feedFrom, feedTo);
  const feedById = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  const hiddenFeeds = useHiddenFeeds();
  const all = useMemo(
    () => [
      ...events.map((e): Item => ({ key: `e:${e.key}`, kind: "event", id: e.key, title: e.title, start: e.date, end: e.endDate, role: "event", startField: null, endField: null, time: e.time, endTime: e.endTime, location: e.location, color: feedById.get(e.feed)?.color, feedName: feedById.get(e.feed)?.name })),
      ...itemsOf(s, t),
    ],
    [s, t, events, feedById],
  );
  // While a bar is dragged it is drawn where it would land.
  const items = useMemo(() => (drag ? all.map((i) => (i.key === drag.key ? { ...i, start: drag.start, end: drag.end } : i)) : all), [all, drag]);
  const onDay = (d: string) => items.filter((i) => i.start <= d && i.end >= d);
  const cursorItems = onDay(cursor);
  const focusItem = itemKey ? items.find((i) => i.key === itemKey) : undefined;

  useEffect(() => {
    ui.followDetail(focusItem && focusItem.kind !== "event" ? { kind: focusItem.kind, id: focusItem.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItem?.key]);
  // The item cursor lets go when its item leaves the cursor day (moved, completed).
  useEffect(() => {
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
    mode === "week"
      ? `Week ${isoWeek(weekDays[3])} · ${formatShort(weekDays[0])} – ${formatShort(weekDays[6])} ${weekDays[6].slice(0, 4)}`
      : mode === "month"
        ? `${MONTH[Number(shown.slice(5, 7)) - 1]} ${year}`
        : String(year);
  const step = (dir: -1 | 1) => {
    setItemKey(null);
    setCursor((c) => (mode === "week" ? addDays(c, 7 * dir) : mode === "month" ? addMonths(c, dir) : addMonths(c, 12 * dir)));
  };
  const moveCursor = (n: number) => {
    setItemKey(null);
    setCursor((c) => addDays(c, n));
  };

  /** Writes a moved or stretched item back to the fields its ends stand for. */
  const commit = (item: Item, start: string, end: string, how: "move" | "start" | "end") => {
    if (start === item.start && end === item.end) return;
    const table = item.kind === "action" ? "actions" : "projects";
    const startF = item.kind === "action" ? "defer" : "start";
    const data: Record<string, string> = {};
    if (item.role === "followup" || item.role === "tickler") data[item.startField!] = start;
    else if (how === "move") {
      if (item.startField) data[item.startField] = start;
      if (item.endField) data[item.endField] = end;
    } else if (item.role === "due" || item.role === "start") {
      // A one-date item stretched across days gets both dates: the day it had stays where it is on screen and the
      // dropped end becomes the other date (a due date stretched right becomes the start; a start stretched left
      // becomes the due date). Dropped back on its own day, it keeps its single date.
      if (start < end) {
        data[startF] = start;
        data.due = end;
      }
    } else if (how === "start") data[item.startField!] = start;
    else data[item.endField!] = end;
    if (!Object.keys(data).length) return;
    const when = start === end ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`;
    mutate(`“${item.title}” → ${when}`, [{ type: "patch", table, id: item.id, data }]);
  };

  /** Drag a bar to move it, or an end to change that date, as in any calendar. A press without a move is a click. */
  const startDrag = (e: ReactMouseEvent, item: Item, how: "move" | "start" | "end") => {
    if (e.button !== 0) return;
    // An appointment belongs to Outlook: it can be pointed at, not moved or opened here.
    if (item.kind === "event") {
      e.preventDefault();
      setItemKey(item.key);
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
      title: `New action due ${formatLong(day)}`,
      current: "",
      placeholder: "What's the next action?",
      onPick: (title) => {
        if (!title.trim()) return;
        askContext(ui, "Context", (ctx, extra) => {
          const a = newAction({ title: title.trim(), status: "next", due: day, context_id: ctx });
          mutate(`“${a.title}” due ${formatShort(day)}`, [...extra, { type: "create", table: "actions", row: { ...a } }]);
          setItemKey(`a:${a.id}`);
        });
      },
    });
  const ed = editors(ui);
  const ped = projectEditors(ui);

  const inItem = Boolean(focusItem) && focusItem?.kind !== "event";
  const cycle = (dir: 1 | -1) => {
    if (!cursorItems.length) return;
    const i = cursorItems.findIndex((x) => x.key === itemKey);
    setItemKey(cursorItems[(i + dir + cursorItems.length) % cursorItems.length].key);
  };
  const commands: Command[] = [
    { id: "cal.week", label: "Week", group: "Calendar", keys: ["1"], run: () => setMode("week") },
    { id: "cal.month", label: "Month", group: "Calendar", keys: ["2"], run: () => setMode("month") },
    { id: "cal.year", label: "Year", group: "Calendar", keys: ["3"], run: () => setMode("year") },
    { id: "cal.today", label: "Go to today", group: "Calendar", keys: ["t"], run: () => (setItemKey(null), setCursor(t)) },
    { id: "cal.prev", label: `Previous ${mode}`, group: "Calendar", keys: ["pageup", "shift+arrowleft"], run: () => step(-1) },
    { id: "cal.next", label: `Next ${mode}`, group: "Calendar", keys: ["pagedown", "shift+arrowright"], run: () => step(1) },
    { id: "cal.left", label: "Previous day", group: "Move", keys: ["arrowleft"], run: () => moveCursor(-1) },
    { id: "cal.right", label: "Next day", group: "Move", keys: ["arrowright"], run: () => moveCursor(1) },
    { id: "cal.up", label: inItem ? "Previous item on this day" : "Same day last week", group: "Move", keys: ["arrowup"], run: () => (inItem ? cycle(-1) : moveCursor(-7)) },
    { id: "cal.down", label: inItem ? "Next item on this day" : "Same day next week", group: "Move", keys: ["arrowdown"], run: () => (inItem ? cycle(1) : moveCursor(7)) },
    {
      id: "cal.enter",
      label: inItem ? "Open details" : mode === "year" ? "Open this month" : "Step into the day's items",
      group: "Calendar",
      keys: ["enter"],
      run: () => {
        if (focusItem && focusItem.kind !== "event") ui.openDetail({ kind: focusItem.kind, id: focusItem.id }, true);
        else if (focusItem) return;
        else if (mode === "year") setMode("month");
        else if (cursorItems.length) setItemKey(cursorItems[0].key);
      },
    },
    { id: "cal.out", label: "Back to the day", group: "Calendar", keys: ["escape"], enabled: inItem, run: () => setItemKey(null) },
    { id: "cal.new", label: "New action due on this day", group: "Calendar", keys: ["n"], run: () => newOn(cursor) },
    { id: "cal.later", label: "Move a day later", group: "Calendar", keys: ["alt+arrowright"], enabled: inItem, run: () => shift(focusItem, 1, "move") },
    { id: "cal.earlier", label: "Move a day earlier", group: "Calendar", keys: ["alt+arrowleft"], enabled: inItem, run: () => shift(focusItem, -1, "move") },
    { id: "cal.longer", label: "End a day later", group: "Calendar", keys: ["alt+shift+arrowright"], enabled: inItem, run: () => shift(focusItem, 1, "end") },
    { id: "cal.shorter", label: "End a day earlier", group: "Calendar", keys: ["alt+shift+arrowleft"], enabled: inItem, run: () => shift(focusItem, -1, "end") },
    {
      id: "cal.done",
      label: "Mark done",
      group: "Calendar",
      keys: ["e"],
      enabled: inItem,
      run: () => focusItem && (focusItem.kind === "action" ? completeActions([focusItem.id]) : ped.complete([focusItem.id])),
    },
    {
      id: "cal.due",
      label: "Due date",
      group: "Fields",
      keys: ["d"],
      enabled: inItem,
      run: () => focusItem && (focusItem.kind === "action" ? ed.date([focusItem.id], "due") : ped.date([focusItem.id], "due")),
    },
    {
      id: "cal.start",
      label: "Start date",
      group: "Fields",
      keys: ["s"],
      enabled: inItem,
      run: () => focusItem && (focusItem.kind === "action" ? ed.date([focusItem.id], "defer") : ped.date([focusItem.id], "start")),
    },
  ];
  useCommands("list:calendar", commands, { priority: 10, active: regionActive });

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
    const single = i.role === "followup" || i.role === "tickler" || i.role === "event";
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
      // The due end carries the milestone diamond wherever it falls on screen: deadlines stand out in every view.
      (i.role === "due" || i.role === "span") && !p.contR ? "has-due-end" : "",
      itemKey === i.key ? "is-focus" : "",
      drag?.key === i.key ? "is-dragging" : "",
    ].join(" ");
    const label =
      i.role === "event" ? `${i.time ? `${i.time}${i.endTime ? `–${i.endTime}` : ""} ` : ""}${i.title}${i.location ? ` · ${i.location}` : ""}` : i.role === "followup" ? `Follow up: ${i.waiting ?? ""} · ${i.title}` : i.role === "tickler" ? `Comes back: ${i.title}` : i.waiting ? `${i.title} · waiting on ${i.waiting}` : i.title;
    const dates =
      i.role === "event" ? (i.start === i.end ? formatLong(i.start) : `${formatLong(i.start)} to ${formatLong(i.end)}`) : i.role === "due" ? `due ${formatLong(i.end)}` : i.role === "start" ? `starts ${formatLong(i.start)}` : i.start === i.end ? formatLong(i.start) : `${formatLong(i.start)} to ${formatLong(i.end)}, due ${formatLong(i.end)}`;
    return (
      <div
        key={i.key}
        className={cls}
        style={{ gridColumn: `${p.col} / span ${p.span}`, gridRow: p.lane + 1, ...(i.color ? { ["--feed" as string]: i.color } : {}) }}
        title={`${label}\n${dates}${i.overdue ? " · overdue" : ""}`}
        aria-label={`${i.kind === "project" ? "Project" : i.kind === "event" ? `Appointment${i.feedName ? `, ${i.feedName}` : ""}` : "Action"}: ${label}, ${dates}${i.overdue ? ", overdue" : ""}`}
        onMouseDown={(e) => startDrag(e, i, "move")}
        onDoubleClick={() => i.kind !== "event" && ui.openDetail({ kind: i.kind, id: i.id }, true)}
      >
        {canStart && <span className="cal-grip is-start" onMouseDown={(e) => startDrag(e, i, "start")} aria-hidden="true" />}
        <span className="cal-line">
          {i.kind === "project" && i.health && <Lamp health={i.health} start={i.projectStart} />}
          {i.role === "followup" && <Hourglass size={11} strokeWidth={2} aria-hidden />}
          {i.role === "tickler" && <CalendarClock size={11} strokeWidth={2} aria-hidden />}
          {i.flagged && (
            <svg className="cal-flag" viewBox="0 0 22 22" width="12" height="12" role="img" aria-label="Important">
              <ImportantGlyph />
            </svg>
          )}
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
  const agendaRow = (i: Item, d: string) => {
    const what =
      i.role === "event" ? (i.time ? `${i.time}${i.endTime ? `–${i.endTime}` : ""}` : "All day") : i.role === "followup" ? `Follow up ${i.waiting ?? ""}` : i.role === "tickler" ? "Comes back" : i.role === "start" || (i.role === "span" && d === i.start && d !== i.end) ? "Starts" : i.end === d ? "Due" : `Until ${formatShort(i.end)}`;
    return (
      <li key={i.key}>
        <button
          type="button"
          className={`cal-agenda-row ${i.overdue && i.end === d ? "is-overdue" : ""} ${itemKey === i.key ? "is-focus" : ""}`}
          onClick={() => {
            setCursor(d);
            setItemKey(i.key);
            if (i.kind !== "event") ui.openDetail({ kind: i.kind, id: i.id }, true);
          }}
        >
          <span className="cal-agenda-mark" aria-hidden="true">
            {i.kind === "project" && i.health ? <Lamp health={i.health} start={i.projectStart} /> : i.role === "followup" ? <Hourglass size={13} strokeWidth={2} /> : i.role === "tickler" ? <CalendarClock size={13} strokeWidth={2} /> : i.flagged ? (
              <svg className="cal-flag" viewBox="0 0 22 22" width="16" height="16" aria-hidden="true">
                <ImportantGlyph />
              </svg>
            ) : <span className={`cal-agenda-dot ${i.kind === "event" ? "is-event" : ""}`} style={i.color ? { background: i.color } : undefined} />}
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
          <i key={i.key} style={i.kind === "event" && i.color ? { background: i.color } : undefined} className={i.kind === "event" ? "is-event" : i.overdue || ((i.role === "due" || i.role === "span") && i.end === d) ? "is-due" : i.role === "followup" ? "is-follow" : i.kind === "project" ? "is-project" : ""} />
        ))}
      </span>
    ) : null;
  };

  const dayCell = (d: string, opts: { outside?: boolean; hidden?: number; head?: boolean }) => (
    <div
      key={d}
      data-date={d}
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
      {!phone && Boolean(opts.hidden) && (
        <button
          type="button"
          className="cal-more"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            setCursor(d);
            setMode("week");
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

  let body;
  if (mode === "year") body = <YearGrid year={year} ws={ws} items={all} cursor={cursor} t={t} onPick={(d) => (setCursor(d), setMode("month"))} onCursor={setCursor} />;
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
            <h3 className="cal-agenda-head">{formatLong(cursor)}</h3>
            {cursorItems.length ? <ul className="cal-agenda">{cursorItems.map((i) => agendaRow(i, cursor))}</ul> : <p className="cal-agenda-none">Nothing scheduled.</p>}
          </section>
        )}
      </>
    );
  } else if (phone) {
    // The week as an agenda: one section per day, every item with its full title.
    body = (
      <div className="cal-agenda-week">
        {weekDays.map((d) => {
          const list = onDay(d);
          return (
            <section key={d} data-date={d} className={`cal-agenda-day ${d === t ? "is-today" : ""} ${d < t ? "is-past" : ""}`} aria-label={formatLong(d)}>
              <h3 className="cal-agenda-head">
                <span className="cal-wd">{WEEKDAY[dow(d)]}</span>
                <span className="cal-num">{Number(d.slice(8))}</span>
                <span className="cal-agenda-month">{MONTH[Number(d.slice(5, 7)) - 1].slice(0, 3)}</span>
              </h3>
              {list.length ? <ul className="cal-agenda">{list.map((i) => agendaRow(i, d))}</ul> : <p className="cal-agenda-none">Nothing scheduled.</p>}
            </section>
          );
        })}
      </div>
    );
  } else {
    const row = layoutRow(weekDays, items, WEEK_LANES);
    body = (
      <div className="cal-week">
        <div className="cal-row is-week">
          <div className="cal-cells">{weekDays.map((d) => dayCell(d, { head: true }))}</div>
          <div className="cal-bars" style={{ gridTemplateRows: `repeat(${Math.max(1, row.lanes)}, 40px)` }}>
            {row.placed.map((p) => bar(p, true))}
          </div>
          {!row.placed.length && <p className="cal-empty">Nothing scheduled this week. The lists hold the rest.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`calendar is-${mode} ${phone ? "is-phone" : ""}`} ref={root} aria-label={`Calendar, ${title}`}>
      <div className="cal-bar-top">
        <h2 className="cal-title-period">{title}</h2>
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label={`Previous ${mode}`} title={`Previous ${mode} (${keyLabel("pageup")})`}>
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button type="button" className="cal-today" onClick={() => (setItemKey(null), setCursor(t))} title={`Go to today (${keyLabel("t")})`}>
            Today
          </button>
          <button type="button" className="icon-btn" onClick={() => step(1)} aria-label={`Next ${mode}`} title={`Next ${mode} (${keyLabel("pagedown")})`}>
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>
        {/* The subscribed calendars, each in its colour: pressing one hides it here for a while (kept in this browser). */}
        {feeds.length > 0 && (
          <div className="cal-legend" aria-label="Calendars">
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
        )}
        <div className="cal-modes" role="tablist" aria-label="Calendar view">
          {(["week", "month", "year"] as Mode[]).map((m, i) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-current" : ""} onClick={() => setMode(m)} title={`${m[0].toUpperCase()}${m.slice(1)} (${i + 1})`} aria-keyshortcuts={String(i + 1)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {body}
      <p className="visually-hidden" aria-live="polite">
        {focusItem
          ? `${focusItem.title}, ${focusItem.start === focusItem.end ? formatLong(focusItem.start) : `${formatLong(focusItem.start)} to ${formatLong(focusItem.end)}`}`
          : `${formatLong(cursor)}, ${cursorItems.length ? plural(cursorItems.length, "item") : "nothing scheduled"}`}
      </p>
    </div>
  );
}

function formatShort(d: string) {
  return `${Number(d.slice(8))} ${MONTH[Number(d.slice(5, 7)) - 1].slice(0, 3)}`;
}

/** The year at a glance: twelve small months, each day shaded by how much it holds and dotted where something is due. */
function YearGrid({ year, ws, items, cursor, t, onPick, onCursor }: { year: number; ws: 0 | 1; items: Item[]; cursor: string; t: string; onPick: (d: string) => void; onCursor: (d: string) => void }) {
  const { load, due, peak } = useMemo(() => {
    const load = new Map<string, number>();
    const due = new Map<string, "due" | "overdue">();
    const lo = `${year}-01-01`;
    const hi = `${year}-12-31`;
    for (const i of items) {
      if (i.end < lo || i.start > hi) continue;
      for (let d = max(i.start, lo); d <= min(i.end, hi); d = addDays(d, 1)) load.set(d, (load.get(d) ?? 0) + 1);
      if (i.role === "span" || i.role === "due") due.set(i.end, i.overdue ? "overdue" : due.get(i.end) === "overdue" ? "overdue" : "due");
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
                      aria-label={`${formatLong(d)}${n ? `, ${plural(n, "item")}` : ""}${due.get(d) === "overdue" ? ", overdue" : ""}`}
                      onClick={() => onCursor(d)}
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

