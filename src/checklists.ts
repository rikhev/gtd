import { useSyncExternalStore } from "react";
import { getMeta, getState, mutate, notify, plural, stamp, uid } from "./store.ts";
import { addDays, formatLong, fromIso, today } from "../shared/dates.ts";
import type { Checklist, ChecklistItem, ChecklistTick, ID, Op, State } from "../shared/types.ts";

/**
 * Checklists, as GTD keeps them: reusable lists beside Reference (packing for a trip, closing the month, a new
 * starter's first week), looked at when they are relevant and reviewed in the Weekly Review. Ticking only ticks: the
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

/**
 * Opens a checklist (or, with null, goes back to every checklist). Inside the Checklists view each step is a history
 * entry; from elsewhere the view change makes the entry, so `history: false` only sets where it will land.
 */
export function openChecklist(id: ID | null, history = true) {
  if (id === open) return;
  open = id;
  if (history) window.history.pushState(null, "", id ? `#checklists/${encodeURIComponent(id)}` : "#checklists");
  emit();
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
 * Repeat every day or every week, or not at all. Turning it on carries today's ticks over as today's records;
 * turning it off keeps the records (the history) and leaves this period's ticks ticked.
 */
export function setRepeats(ids: ID[], repeats: Repeats | null) {
  const s = getState();
  const t = today();
  const ops: Op[] = [];
  for (const c of s.checklists.filter((x) => ids.includes(x.id) && (x.repeats ?? null) !== repeats)) {
    ops.push({ type: "patch", table: "checklists", id: c.id, data: { repeats } });
    for (const i of itemsOf(s, c.id).filter((x) => !x.section)) {
      if (repeats && !c.repeats && i.checked_at) {
        ops.push({ type: "patch", table: "checklist_items", id: i.id, data: { checked_at: null } });
        if (!ticksNow(s, i, repeats, t).length) ops.push({ type: "create", table: "checklist_ticks", row: { id: uid(), item_id: i.id, checklist_id: c.id, day: t, created_at: stamp() } });
      }
      if (!repeats && c.repeats && ticksNow(s, i, c.repeats, t).length) ops.push({ type: "patch", table: "checklist_items", id: i.id, data: { checked_at: stamp() } });
    }
  }
  if (!ops.length) return;
  mutate(`${checklistNamed(ids)} ${repeats ? `repeats ${repeatsLabel(repeats).toLowerCase()}` : "no longer repeats"}`, ops);
}

/** "4 of 12", "All 12 ticked" ("All 5 done today" on a routine), or nothing while no run is under way. */
export function progressLabel(p: { ticked: number; total: number; repeats?: Repeats | null }) {
  if (!p.ticked || !p.total) return "";
  // A routine says which period it counts: "3 of 5 today", "2 of 4 this week".
  const when = p.repeats === "day" ? " today" : p.repeats === "week" ? " this week" : "";
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
export function tickItems(ids: ID[]) {
  const s = getState();
  const t = today();
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
  let label = tick ? `${itemName(change)} ticked` : `${itemName(change)} unticked`;
  if (tick && list) {
    const p = progress(s, list.id, t);
    if (p.ticked + change.length === p.total) {
      ops.push({ type: "patch", table: "checklists", id: list.id, data: { finished_at: at } });
      label = r ? `${title(list)}: all ${p.total} done ${r === "day" ? "today" : "this week"}` : `${title(list)}: all ${p.total} ticked. Start over when you run it again.`;
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
