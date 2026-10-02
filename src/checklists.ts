import { useSyncExternalStore } from "react";
import { getMeta, getState, mutate, notify, plural, stamp, uid } from "./store.ts";
import { addDays, formatLong, fromIso, iso, today } from "../shared/dates.ts";
import type { Checklist, ChecklistItem, ChecklistTick, ID, Op, State } from "../shared/types.ts";

/**
 * Checklists, as GTD keeps them: a category of their own, apart from Reference (reminders reviewed again and again,
 * not information filed to look up): reusable lists such as packing for a trip, closing the month, a new
 * starter's first week, looked at when they are relevant and reviewed in the Weekly Review. Ticking only ticks: the
 * ticks are the current run's progress, kept until the run starts over, and they never reach the other lists.
 */

/* ---------------- which checklist is open ---------------- */

/**
 * The Checklists view has two levels: every checklist, and one checklist's items. The open one has its own address
 * (#checklists/<id>), so Back and Forward step between them and a reload or bookmark lands inside it.
 */
const listeners = new Set<() => void>();
const fromHash = () => {
  const m = /^#checklists\/(.+)$/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
};
let open: ID | null = typeof window === "undefined" ? null : fromHash();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (!window.location.hash.startsWith("#checklists")) return;
    const id = fromHash();
    if (id !== open) {
      open = id;
      emit();
    }
  });
}

export function useOpenChecklist(): ID | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
export const openChecklistId = () => open;

/** The item a checklist opens on (a search hit names one), kept until the cursor is there. */
let landing: ID | null = null;
export const landingItem = () => landing;
export const landed = () => void (landing = null);

/**
 * Opens a checklist (or, with null, goes back to every checklist). Inside the Checklists view each step is a history
 * entry; from elsewhere the view change makes the entry, so `history: false` only sets where it will land.
 */
export function openChecklist(id: ID | null, history = true, at: ID | null = null) {
  landing = at;
  if (id === open) return;
  open = id;
  // A checklist opens on today: a day stepped back to belongs to the checklist it was stepped in.
  viewDay = null;
  if (history) window.history.pushState(null, "", id ? `#checklists/${encodeURIComponent(id)}` : "#checklists");
  emit();
}

/* ---------------- the day a routine is ticked for ---------------- */

/**
 * A repeating checklist can be stepped back to an earlier day (or week) and ticked there, for a habit done but not
 * ticked at the time (owner's request): ← and → step, never past today. null is today.
 */
let viewDay: string | null = null;
const dayListeners = new Set<() => void>();
export function useChecklistDay(): string | null {
  return useSyncExternalStore(
    (l) => {
      dayListeners.add(l);
      return () => dayListeners.delete(l);
    },
    () => viewDay,
  );
}
/** Steps to a day (the start of its week on a weekly routine); today, or later, is null. */
export function setChecklistDay(day: string | null, repeats: Repeats) {
  const now = periodOf(today(), repeats);
  const next = day && periodOf(day, repeats) < now ? periodOf(day, repeats) : null;
  if (next === viewDay) return;
  viewDay = next;
  dayListeners.forEach((l) => l());
}
export const checklistDay = () => viewDay;
/** Back to today (on leaving a checklist, so it opens on today next time). */
export function resetChecklistDay() {
  if (viewDay === null) return;
  viewDay = null;
  dayListeners.forEach((l) => l());
}

/** The day or week a routine is looked at, by name: "today", "yesterday", "Tue 29 Sep", "last week", "the week of 14 Sep". */
export function dayName(day: string | null, repeats: Repeats): string {
  const now = periodOf(today(), repeats);
  const d = day ? periodOf(day, repeats) : now;
  if (repeats === "week") return d === now ? "this week" : d === addDays(now, -7) ? "last week" : `the week of ${formatLong(d)}`;
  return d === now ? "today" : d === addDays(now, -1) ? "yesterday" : formatLong(d);
}
/** The same after a count or a verb: "3 of 5 today", "ticked on Tue 29 Sep", "done in the week of 14 Sep". */
export function dayWords(day: string | null, repeats: Repeats): string {
  const name = dayName(day, repeats);
  return /^(today|yesterday|this week|last week)$/.test(name) ? name : repeats === "week" ? `in ${name}` : `on ${name}`;
}

/* ---------------- reading ---------------- */

export const itemsOf = (s: Pick<State, "checklist_items">, id: ID): ChecklistItem[] =>
  s.checklist_items.filter((i) => i.checklist_id === id).sort((a, b) => a.sort - b.sort);

type Lists = Pick<State, "checklists" | "checklist_items" | "checklist_ticks">;

/* ---------------- habits: checklists that repeat ---------------- */

/**
 * A repeating checklist starts over by itself: every day, or every week (from the week's first day in Settings ›
 * Calendar). Its ticks are records of the days things were done, so the history is kept as the ticks clear.
 */
export type Repeats = "day" | "week";

/** The first day of the period a day falls in: the day itself, or the start of its week. */
export function periodOf(day: string, repeats: Repeats): string {
  if (repeats === "day") return day;
  const back = (fromIso(day).getDay() - getMeta().weekStart + 7) % 7;
  return addDays(day, -back);
}

const repeatsOf = (s: Lists, id: ID): Repeats | null => s.checklists.find((c) => c.id === id)?.repeats ?? null;

/** This period's ticks of an item on a repeating checklist. */
function ticksNow(s: Lists, item: ChecklistItem, repeats: Repeats, t = today()): ChecklistTick[] {
  const now = periodOf(t, repeats);
  return s.checklist_ticks.filter((k) => k.item_id === item.id && periodOf(k.day, repeats) === now);
}

/** Whether an item is ticked: in this day or week on a repeating checklist, otherwise until Start over. */
export function isTicked(s: Lists, item: ChecklistItem, t = today()): boolean {
  const r = repeatsOf(s, item.checklist_id);
  return r ? ticksNow(s, item, r, t).length > 0 : Boolean(item.checked_at);
}

/** The last four weeks of a habit, oldest first: 28 days, or 8 weeks counted by their first day. */
export function history(s: Lists, item: ChecklistItem, repeats: Repeats, t = today()) {
  const done = new Set(s.checklist_ticks.filter((k) => k.item_id === item.id).map((k) => periodOf(k.day, repeats)));
  const now = periodOf(t, repeats);
  const n = repeats === "day" ? 28 : 8;
  const step = repeats === "day" ? 1 : 7;
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(now, -(n - 1 - i) * step);
    return { day, done: done.has(day), now: day === now };
  });
}

/**
 * How many days (or weeks) in a row it has been done, up to now. Today not done yet doesn't break the run: it counts
 * back from yesterday until the day is over.
 */
export function streak(s: Lists, item: ChecklistItem, repeats: Repeats, t = today()): number {
  const done = new Set(s.checklist_ticks.filter((k) => k.item_id === item.id).map((k) => periodOf(k.day, repeats)));
  const step = repeats === "day" ? 1 : 7;
  let at = periodOf(t, repeats);
  if (!done.has(at)) at = addDays(at, -step);
  let n = 0;
  while (done.has(at)) {
    n++;
    at = addDays(at, -step);
  }
  return n;
}

/** The local day a stored stamp falls on. */
const dayOf = (stamp: string) => iso(new Date(stamp));

/**
 * A habit's record, from the day it became one (the routine began repeating, or the habit was added since): how often
 * it was done, how the last four weeks compare with the four before, its longest run, and on a daily habit the
 * weekdays it slips. Only past periods are counted; this one counts once it is done. Nothing here is kept: it is all
 * read from the ticks.
 */
export function habitStats(s: Lists, item: ChecklistItem, repeats: Repeats, t = today()) {
  const list = s.checklists.find((c) => c.id === item.checklist_id);
  const step = repeats === "day" ? 1 : 7;
  const begun = [list?.repeats_since ?? (list ? dayOf(list.created_at) : t), dayOf(item.created_at)].sort().pop()!;
  const since = periodOf(begun, repeats);
  const now = periodOf(t, repeats);
  const done = new Set(s.checklist_ticks.filter((k) => k.item_id === item.id).map((k) => periodOf(k.day, repeats)));
  // Every period from the first to this one; this one only counts once it is done (the day isn't over).
  const periods: string[] = [];
  for (let d = since; d <= now; d = addDays(d, step)) periods.push(d);
  const counted = periods.filter((d) => d < now || done.has(d));
  const kept = counted.filter((d) => done.has(d)).length;
  const span = repeats === "day" ? 28 : 4;
  const past = periods.filter((d) => d < now);
  const recent = past.slice(-span);
  const before = past.slice(-2 * span, -span);
  let longest = 0;
  let longestEnd: string | null = null;
  let run = 0;
  for (const d of periods) {
    if (done.has(d)) {
      run++;
      if (run > longest) {
        longest = run;
        longestEnd = d;
      }
    } else if (d < now) run = 0;
  }
  // On a daily habit, how each weekday went, in the week's own order.
  const first = getMeta().weekStart;
  const weekdays =
    repeats === "day"
      ? Array.from({ length: 7 }, (_, n) => {
          const wd = (first + n) % 7;
          const days = past.filter((d) => fromIso(d).getDay() === wd);
          return { wd, done: days.filter((d) => done.has(d)).length, of: days.length };
        })
      : [];
  return {
    since,
    kept,
    of: counted.length,
    recent: { kept: recent.filter((d) => done.has(d)).length, of: recent.length },
    before: { kept: before.filter((d) => done.has(d)).length, of: before.length },
    longest,
    longestEnd,
    current: streak(s, item, repeats, t),
    weekdays,
  };
}

/** Half a year of a habit, oldest first: 26 weeks of days (a grid, week by week), or 26 weeks on a weekly habit. */
export function longHistory(s: Lists, item: ChecklistItem, repeats: Repeats, t = today()) {
  const done = new Set(s.checklist_ticks.filter((k) => k.item_id === item.id).map((k) => periodOf(k.day, repeats)));
  const now = periodOf(t, repeats);
  if (repeats === "week")
    return Array.from({ length: 26 }, (_, i) => {
      const day = addDays(now, -(25 - i) * 7);
      return { day, done: done.has(day), now: day === now, future: false };
    });
  // Days: whole weeks from the week's first day, 26 of them, so each column is a week.
  const start = addDays(periodOf(t, "week"), -25 * 7);
  return Array.from({ length: 26 * 7 }, (_, i) => {
    const day = addDays(start, i);
    return { day, done: done.has(day), now: day === now, future: day > now };
  });
}

export const streakLabel = (n: number, repeats: Repeats) => (n ? plural(n, repeats === "day" ? "day" : "week") : "");

/** A square of the strip, named for its hover: "Tue 29 Sep: done", "Week of 21 Sep: not done". */
export const historyTitle = (c: { day: string; done: boolean; now: boolean }, repeats: Repeats) =>
  `${repeats === "day" ? formatLong(c.day) : `Week of ${formatLong(c.day)}`}${c.now ? (repeats === "day" ? " (today)" : " (this week)") : ""}: ${c.done ? "done" : "not done"}`;

/** "Every day", "Every week". */
export const repeatsLabel = (r: Repeats | null | undefined) => (r === "day" ? "Every day" : r === "week" ? "Every week" : "");

/** How far the current run has got: ticked of everything that can be ticked (section headings aside). */
export function progress(s: Lists, id: ID, t = today()) {
  const items = itemsOf(s, id).filter((i) => !i.section);
  return { ticked: items.filter((i) => isTicked(s, i, t)).length, total: items.length, repeats: repeatsOf(s, id) };
}

/**
 * Repeat every day or every week, or not at all. Turning it on carries today's ticks over as today's records and
 * clears older ones (they are no record of any day the habit was kept); turning it off keeps the records (the history) and leaves this period's ticks ticked.
 */
export function setRepeats(ids: ID[], repeats: Repeats | null) {
  const s = getState();
  const t = today();
  const ops: Op[] = [];
  for (const c of s.checklists.filter((x) => ids.includes(x.id) && (x.repeats ?? null) !== repeats)) {
    // Turned on, it notes the day it began repeating, which a habit's record counts from.
    ops.push({ type: "patch", table: "checklists", id: c.id, data: repeats && !c.repeats ? { repeats, repeats_since: t } : { repeats } });
    for (const i of itemsOf(s, c.id).filter((x) => !x.section)) {
      if (repeats && !c.repeats && i.checked_at) {
        ops.push({ type: "patch", table: "checklist_items", id: i.id, data: { checked_at: null } });
        // Only a tick made today is a record of today; older ones are cleared, never dated today.
        if (iso(new Date(i.checked_at)) === t && !ticksNow(s, i, repeats, t).length) ops.push({ type: "create", table: "checklist_ticks", row: { id: uid(), item_id: i.id, checklist_id: c.id, day: t, created_at: stamp() } });
      }
      if (!repeats && c.repeats && ticksNow(s, i, c.repeats, t).length) ops.push({ type: "patch", table: "checklist_items", id: i.id, data: { checked_at: stamp() } });
    }
  }
  if (!ops.length) return;
  mutate(`${checklistNamed(ids)} ${repeats ? `repeats ${repeatsLabel(repeats).toLowerCase()}` : "no longer repeats"}`, ops);
}

/** "4 of 12", "All 12 ticked" ("All 5 done today" on a routine), or nothing while no run is under way. */
export function progressLabel(p: { ticked: number; total: number; repeats?: Repeats | null }, day: string | null = null) {
  if (!p.ticked || !p.total) return "";
  // A routine says which period it counts: "3 of 5 today", "2 of 4 this week", "4 of 5 yesterday".
  const when = p.repeats ? ` ${dayWords(day, p.repeats)}` : "";
  if (p.ticked === p.total) return p.repeats ? `All ${p.total} done${when}` : `All ${p.total} ticked`;
  return `${p.ticked} of ${p.total}${when}`;
}

const title = (c: Pick<Checklist, "title"> | undefined) => `“${c?.title || "Untitled checklist"}”`;

/* ---------------- making ---------------- */

export function newChecklist(data: Partial<Checklist> = {}): Checklist {
  const s = getState();
  return {
    id: uid(),
    title: "",
    notes: "",
    area_id: null,
    status: "active",
    sort: Math.max(0, ...s.checklists.map((c) => c.sort)) + 1,
    created_at: stamp(),
    updated_at: stamp(),
    finished_at: null,
    project_id: null,
    ...data,
  };
}

/**
 * The lines of a captured list as checklist items: bullets, numbers and boxes ("- ", "1.", "[ ]", "[x]") are left
 * off; a line ending in a colon, or a Markdown heading, becomes a section heading. Blank lines are skipped.
 */
export function itemsFromText(text: string, checklistId: ID): ChecklistItem[] {
  const at = stamp();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const heading = /^#{1,6}\s+/.test(line) || (/:$/.test(line) && line.length <= 60);
      let clean = line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^([-*•–]|\d+[.)])\s+/, "")
        .replace(/^\[[ xX]?\]\s*/, "");
      if (heading) clean = clean.replace(/:$/, "");
      clean = clean.trim();
      return { id: uid(), checklist_id: checklistId, title: clean, section: heading ? 1 : 0, checked_at: null, sort: i + 1, created_at: at } as ChecklistItem;
    })
    .filter((i) => i.title);
}

/** An edit to a checklist's items is an edit of the checklist (a tick is not). */
export const touchChecklist = (id: ID): Op => ({ type: "patch", table: "checklists", id, data: { updated_at: stamp() } });

/* ---------------- running ---------------- */

/**
 * Ticks or unticks items. When the last open item is ticked the run is finished: the checklist records when, and the
 * toast says so. Unticking leaves that date alone (it is when the last run was finished).
 */
export function tickItems(ids: ID[], day: string | null = null) {
  const s = getState();
  // On a routine stepped back to an earlier day, the tick is that day's record.
  const t = day ?? today();
  const items = s.checklist_items.filter((i) => ids.includes(i.id) && !i.section);
  if (!items.length) return;
  // A mixed selection ticks what is open; all ticked already, it unticks them.
  const tick = items.some((i) => !isTicked(s, i, t));
  const at = stamp();
  const change = items.filter((i) => isTicked(s, i, t) !== tick);
  const list = s.checklists.find((c) => c.id === items[0].checklist_id);
  const r = list?.repeats ?? null;
  // On a repeating checklist a tick is a record of the day (unticking removes this period's); otherwise it is a mark.
  const ops: Op[] = change.flatMap((i): Op[] =>
    r
      ? tick
        ? [{ type: "create", table: "checklist_ticks", row: { id: uid(), item_id: i.id, checklist_id: i.checklist_id, day: t, created_at: at } }]
        : ticksNow(s, i, r, t).map((k): Op => ({ type: "delete", table: "checklist_ticks", id: k.id }))
      : [{ type: "patch", table: "checklist_items", id: i.id, data: { checked_at: tick ? at : null } }],
  );
  const past = r && day ? ` ${dayWords(day, r)}` : "";
  let label = tick ? `${itemName(change)} ticked${past}` : `${itemName(change)} unticked${past}`;
  if (tick && list) {
    const p = progress(s, list.id, t);
    if (p.ticked + change.length === p.total) {
      // A day caught up afterwards finishes nothing now: "last finished" stays the latest real run.
      if (!past) ops.push({ type: "patch", table: "checklists", id: list.id, data: { finished_at: at } });
      label = r ? `${title(list)}: all ${p.total} done ${dayWords(day, r)}` : `${title(list)}: all ${p.total} ticked. Start over when you run it again.`;
    }
  }
  mutate(label, ops);
}

function itemName(items: ChecklistItem[]) {
  if (items.length !== 1) return plural(items.length, "item");
  const t = items[0].title.trim();
  return `“${t.length > 42 ? `${t.slice(0, 40).trimEnd()}…` : t || "Untitled"}”`;
}

/** Start over: every tick cleared, ready for the next run. ⌘Z brings them back. */
export function startOver(ids: ID[]) {
  const s = getState();
  // A repeating checklist starts over by itself; its ticks are the record of the days.
  ids = ids.filter((id) => !repeatsOf(s, id));
  const ops: Op[] = s.checklist_items.filter((i) => ids.includes(i.checklist_id) && i.checked_at).map((i) => ({ type: "patch", table: "checklist_items", id: i.id, data: { checked_at: null } }));
  if (!ops.length) return notify(ids.length === 1 ? `${title(s.checklists.find((c) => c.id === ids[0]))} has nothing ticked` : "Nothing ticked to clear");
  const one = ids.length === 1 ? s.checklists.find((c) => c.id === ids[0]) : undefined;
  mutate(one ? `${title(one)} started over` : `${plural(ids.length, "checklist")} started over`, ops);
}

export const checklistNamed = (ids: ID[]) => {
  if (ids.length !== 1) return plural(ids.length, "checklist");
  return title(getState().checklists.find((c) => c.id === ids[0]));
};
