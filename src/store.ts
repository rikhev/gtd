import type { FeedInfo } from "./calendarFeed.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { Action, Appointment, ID, Op, Project, State, TableName, Tables, Ref } from "../shared/types.ts";
import { nextOccurrence, parseRecurrence, today, daysBetween } from "../shared/dates.ts";

const empty: State = {
  actions: [],
  projects: [],
  stuff: [],
  refs: [],
  contexts: [],
  areas: [],
  files: [],
  reviews: [],
  appointments: [],
  checklists: [],
  checklist_items: [],
  checklist_ticks: [],
  horizons: [],
};

let state: State = empty;
let meta: {
  today: string;
  loaded: boolean;
  authRequired: boolean;
  signedIn: boolean;
  authConfigured: boolean;
  /** Weeks without progress before a project counts as stalled (Settings). */
  stallWeeks: number;
  trashDays: number;
  /** The calendar's first day of the week: 1 Monday, 0 Sunday. */
  weekStart: 0 | 1;
  /** Subscribed calendars (Outlook, iCloud…): names, colours and hosts; their links stay on the server. */
  calendars: FeedInfo[];
  /** The hours the Calendar's week shows, [from, to), e.g. [7, 19]. */
  dayHours: [number, number];
} = { today: today(), loaded: false, authRequired: false, signedIn: true, authConfigured: true, stallWeeks: 3, trashDays: 7, weekStart: 1, calendars: [], dayHours: [7, 19] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}
export function useMeta() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => meta,
  );
}
export const getState = () => state;

/**
 * Subscribes to named tables only: the component re-renders when one of them changes, not on every change anywhere
 * (tables that didn't change keep their identity). Returns a State whose other tables are the snapshot at render.
 */
export function useTables<K extends keyof State>(...keys: K[]): State {
  // The keys are fixed per call site, so the hooks below run in the same order every render.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const vals = keys.map((k) => useStore((s) => s[k]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ ...state, ...Object.fromEntries(keys.map((k, i) => [k, vals[i]])) }) as State, vals);
}
export const getMeta = () => meta;

/** Called when any API request comes back 401: the session expired or was revoked. */
export function signedOut() {
  if (!meta.signedIn) return;
  meta = { ...meta, signedIn: false };
  emit();
}

export async function signOut(everywhere = false) {
  await fetch(everywhere ? "/api/auth/logout-all" : "/api/auth/logout", { method: "POST" });
  state = empty;
  meta = { ...meta, signedIn: false };
  // The appointments kept in this browser (calendarFeed.ts) leave with the session.
  try {
    localStorage.removeItem("gtd:calendar:known");
  } catch {
    /* no storage */
  }
  emit();
}

export function updateMeta(patch: Partial<typeof meta>) {
  meta = { ...meta, ...patch };
  emit();
}

export async function load() {
  const auth = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({ required: false, signedIn: true, configured: true }));
  if (!auth.signedIn) {
    meta = { ...meta, loaded: true, authRequired: auth.required, signedIn: false, authConfigured: auth.configured };
    emit();
    return;
  }
  meta = { ...meta, authRequired: auth.required, signedIn: true, authConfigured: auth.configured };
  const res = await fetch("/api/state");
  const json = await res.json();
  state = json.state;
  meta = { ...meta, ...json.meta, loaded: true };
  emit();
}

/* ---------------- status line ---------------- */

export interface Notice {
  id: number;
  text: string;
  undo?: boolean;
  tone?: "info" | "error";
}
let notice: Notice | null = null;
const noticeListeners = new Set<() => void>();
let noticeSeq = 0;
export function notify(text: string, opts: { undo?: boolean; tone?: "info" | "error" } = {}) {
  notice = { id: ++noticeSeq, text, ...opts };
  noticeListeners.forEach((l) => l());
}
export function useNotice() {
  return useSyncExternalStore(
    (l) => {
      noticeListeners.add(l);
      return () => noticeListeners.delete(l);
    },
    () => notice,
  );
}

/* ---------------- mutations with undo ---------------- */

interface UndoEntry {
  label: string;
  inverse: Op[];
  /** Names a step a later one may join or take back (a new row, before it is named). */
  key?: string;
}
const undoStack: UndoEntry[] = [];

function find<T extends TableName>(table: T, id: ID): Tables[T] | undefined {
  return (state[table] as Tables[T][]).find((r) => (r as { id: ID }).id === id);
}

function applyLocal(ops: Op[]) {
  const next: State = { ...state };
  for (const op of ops) {
    const rows = [...(next[op.table] as unknown as Record<string, unknown>[])];
    if (op.type === "create") {
      const i = rows.findIndex((r) => r.id === op.row.id);
      if (i >= 0) rows[i] = { ...op.row };
      else rows.push({ ...op.row });
    } else if (op.type === "patch") {
      const i = rows.findIndex((r) => r.id === op.id);
      if (i >= 0) rows[i] = { ...rows[i], ...op.data };
    } else {
      const i = rows.findIndex((r) => r.id === op.id);
      if (i >= 0) rows.splice(i, 1);
    }
    (next as unknown as Record<string, unknown>)[op.table] = rows;
  }
  state = next;
  emit();
}

function invert(ops: Op[]): Op[] {
  const inv: Op[] = [];
  // Build inverses against the state *before* applying, in reverse order.
  const shadow: State = JSON.parse(JSON.stringify(state));
  const get = (t: TableName, id: ID) =>
    (shadow[t] as unknown as Record<string, unknown>[]).find((r) => r.id === id);
  for (const op of ops) {
    if (op.type === "create") {
      const prev = get(op.table, op.row.id as ID);
      inv.unshift(prev ? { type: "create", table: op.table, row: { ...prev } } : { type: "delete", table: op.table, id: op.row.id as ID });
      (shadow[op.table] as unknown as Record<string, unknown>[]).push({ ...op.row });
    } else if (op.type === "patch") {
      const prev = get(op.table, op.id);
      if (!prev) continue;
      const back: Record<string, unknown> = {};
      for (const k of Object.keys(op.data)) back[k] = prev[k] ?? null;
      inv.unshift({ type: "patch", table: op.table, id: op.id, data: back });
      Object.assign(prev, op.data);
    } else {
      const prev = get(op.table, op.id);
      if (!prev) continue;
      inv.unshift({ type: "create", table: op.table, row: { ...prev } });
    }
  }
  return inv;
}

async function send(ops: Op[]) {
  try {
    const res = await fetch("/api/ops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ops }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  } catch (e) {
    notify(`Couldn't save: ${(e as Error).message}. Reloading your lists.`, { tone: "error" });
    await load();
  }
}

/** Apply ops optimistically, persist, and record an undo entry. */
/** An action that leaves Waiting For for Next or Someday stops waiting on anyone. */
function dropStaleWaiting(ops: Op[]): Op[] {
  return ops.map((op) =>
    op.type === "patch" && op.table === "actions" && (op.data.status === "next" || op.data.status === "someday")
      ? { ...op, data: { waiting_who: null, waiting_since: null, followup: null, ...op.data } }
      : op,
  );
}

/** Any edit to an action or reference (except a pure reorder) marks it touched, as the server does; undo restores the old date. */
function touchActions(ops: Op[]): Op[] {
  return ops.map((op) =>
    op.type === "patch" &&
    (op.table === "actions" || op.table === "refs") &&
    !("updated_at" in op.data) &&
    Object.keys(op.data).some((k) => (op.table === "refs" ? !["sort", "status", "trashed_at", "trashed_from"].includes(k) : k !== "sort"))
      ? { ...op, data: { ...op.data, updated_at: stamp() } }
      : op,
  );
}

const TRASHABLE = new Set<TableName>(["actions", "projects", "stuff", "refs", "checklists", "horizons"]);
/**
 * Deleting is a status: a row turning "trashed" records when (one time for the whole edit, so a project and the
 * actions deleted with it share it) and the status it had, for the Trash; any other status clears both.
 * The server does the same for its own edits.
 */
function stampTrash(ops: Op[]): Op[] {
  const at = stamp();
  return ops.map((op) => {
    if (op.type !== "patch" || !TRASHABLE.has(op.table) || !("status" in op.data) || "trashed_at" in op.data) return op;
    const cur = find(op.table, op.id) as { status?: string } | undefined;
    if (op.data.status === "trashed") return cur?.status === "trashed" ? op : { ...op, data: { ...op.data, trashed_at: at, trashed_from: cur?.status ?? null } };
    return { ...op, data: { ...op.data, trashed_at: null, trashed_from: null } };
  });
}

/**
 * Applies ops as one undoable step. `key` names the step; `join` folds this one into the last step when that step
 * has the key (a new row and its name are one ⌘Z); `undoable: false` keeps it off the stack.
 */
export function mutate(label: string, rawOps: Op[], opts: { silent?: boolean; key?: string; join?: string; undoable?: boolean } = {}) {
  if (!rawOps.length) return;
  const ops = stampTrash(touchActions(dropStaleWaiting(rawOps)));
  const inverse = invert(ops);
  applyLocal(ops);
  void send(ops);
  const top = undoStack[undoStack.length - 1];
  if (opts.undoable === false) {
    // Kept off the stack.
  } else if (opts.join && top?.key === opts.join) {
    undoStack[undoStack.length - 1] = { label, inverse: [...inverse, ...top.inverse] };
  } else {
    undoStack.push({ label, inverse, key: opts.key });
    if (undoStack.length > 200) undoStack.shift();
  }
  if (!opts.silent) notify(label, { undo: true });
}

/** Takes back the last step if it has this key (a new row left blank was never really there). */
export function forgetUndo(key: string): boolean {
  if (undoStack[undoStack.length - 1]?.key !== key) return false;
  undoStack.pop();
  return true;
}

export function undo() {
  const entry = undoStack.pop();
  if (!entry) {
    notify("Nothing to undo");
    return;
  }
  applyLocal(entry.inverse);
  void send(entry.inverse);
  notify(`Undid: ${entry.label}`);
  // Lists put their cursor back on the row that was just restored.
  const ids = entry.inverse.map((op) => (op.type === "create" ? (op.row.id as string) : op.id));
  window.dispatchEvent(new CustomEvent("gtd:undo", { detail: ids }));
}

/* ---------------- helpers ---------------- */

export const uid = () => crypto.randomUUID();
export const stamp = () => new Date().toISOString();

export function newAction(data: Partial<Action>): Action {
  const s = getState();
  const maxSort = Math.max(0, ...s.actions.map((a) => a.sort));
  return {
    id: uid(),
    title: "",
    notes: "",
    project_id: null,
    context_id: null,
    due: null,
    defer: null,
    time_min: null,
    energy: null,
    flagged: 0,
    status: "next",
    waiting_who: null,
    person: null,
    waiting_since: null,
    followup: null,
    recurrence: null,
    bring_back: null,
    sort: maxSort + 1,
    created_at: stamp(),
    completed_at: null,
    updated_at: stamp(),
    done_from: null,
    archived_at: null,
    ...data,
  };
}

export function newProject(data: Partial<Project>): Project {
  const s = getState();
  const maxSort = Math.max(0, ...s.projects.map((p) => p.sort));
  return {
    id: uid(),
    title: "",
    outcome: "",
    notes: "",
    purpose: "",
    ideas: "",
    goal_id: null,
    area_id: null,
    status: "active",
    due: null,
    bring_back: null,
    sort: maxSort + 1,
    created_at: stamp(),
    completed_at: null,
    archived_at: null,
    ...data,
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export { plural };

/** Mark actions done; recurring ones spawn their next occurrence. */
/** A toast's subject: the item itself when there is one ("“Pay the VAT”"), else a count ("3 actions"). */
/** Areas read as "#Work", as contexts read as "@phone"; the # is shown, never stored. */
export function areaLabel(name: string) {
  return `#${bareArea(name) || "Untitled"}`;
}
/** An area name as stored: whatever the owner typed, without a leading #. */
export function bareArea(name: string) {
  return name.trim().replace(/^#+\s*/, "");
}

/** When a reference last changed: its own last edit, or a file attached to it since, whichever is later. */
export function refUpdated(s: State, r: Ref): string {
  let at = r.updated_at ?? r.created_at;
  for (const f of s.files) if (f.owner_kind === "ref" && f.owner_id === r.id && f.created_at > at) at = f.created_at;
  return at;
}

/** The lists by the names the rail gives them, for "Was in", "Where it lives" and search hits, the same everywhere. */
export const LIST_NAMES: Record<string, string> = {
  inbox: "Inbox",
  next: "Next Actions",
  waiting: "Waiting For",
  someday: "Someday / Maybe",
  later: "Later, in its project",
  active: "Projects",
  done: "Done",
};

/** A title as a toast names it: its first line in quotes, cut short past 42 characters ("“Call Anna about…”"). */
export function quote(text: string, fallback = "Untitled"): string {
  const raw = text.split("\n")[0].trim() || fallback;
  return `“${raw.length > 42 ? `${raw.slice(0, 40).trimEnd()}…` : raw}”`;
}

export function named(table: "actions" | "projects" | "stuff" | "refs", ids: ID[], noun: string): string {
  if (ids.length !== 1) return plural(ids.length, noun);
  const row = (state[table] as unknown as { id: ID; title?: string; text?: string }[]).find((r) => r.id === ids[0]);
  const raw = (row?.title ?? row?.text ?? "").split("\n")[0].trim();
  if (!raw) return plural(1, noun);
  return quote(raw);
}

export function completeActions(ids: ID[]) {
  const ops: Op[] = [];
  let spawned = 0;
  for (const id of ids) {
    const a = find("actions", id);
    if (!a || a.status === "done") continue;
    // Done stays on its own list, struck through, until archived to Done.
    const from = a.status === "waiting" || a.status === "someday" || a.status === "later" ? a.status : "next";
    ops.push({ type: "patch", table: "actions", id, data: { status: "done", completed_at: stamp(), flagged: 0, done_from: from, archived_at: null } });
    const r = a.recurrence ? parseRecurrence(a.recurrence) : null;
    if (r) {
      const t = today();
      const anchor = a.due ?? a.defer ?? t;
      let nextDue = a.due ? nextOccurrence(anchor, r) : null;
      let nextDefer = a.defer ? nextOccurrence(a.defer, r) : null;
      if (!a.due && !a.defer) nextDefer = nextOccurrence(t, r);
      // Never schedule into the past when catching up late.
      while (nextDue && nextDue < t) nextDue = nextOccurrence(nextDue, r);
      while (nextDefer && nextDefer < t && !nextDue) nextDefer = nextOccurrence(nextDefer, r);
      if (nextDue && a.defer && a.due) nextDefer = nextOccurrence(a.defer, r);
      ops.push({
        type: "create",
        table: "actions",
        row: { ...newAction({ ...a, id: uid(), status: "next", completed_at: null, due: nextDue, defer: nextDefer, created_at: stamp(), flagged: 0 }) },
      });
      spawned++;
    }
  }
  if (!ops.length) return;
  // Finishing a project's last current step makes its next planned (later) step current, by itself (owner's rule:
  // faithful, but no routine admin); it takes the finished step's context when it has none. ⌘Z undoes both.
  const done = new Set(ids);
  const projectIds = [...new Set(ids.map((id) => find("actions", id)?.project_id).filter((p): p is ID => Boolean(p)))];
  const t = today();
  const promoted: Action[] = [];
  for (const pid of projectIds) {
    const mine = state.actions.filter((a) => a.project_id === pid && !done.has(a.id));
    if (mine.some((a) => isCurrentStep(a, t))) continue;
    const next = mine.filter((a) => a.status === "later").sort((a, b) => a.sort - b.sort)[0];
    if (!next) continue;
    const ctx = next.context_id ?? ids.map((id) => find("actions", id)).find((a) => a?.project_id === pid)?.context_id ?? null;
    ops.push({ type: "patch", table: "actions", id: next.id, data: { status: "next", context_id: ctx } });
    promoted.push(next);
  }
  mutate(`${named("actions", ids, "action")} done${spawned ? ` · ${spawned} recurring scheduled` : ""}${promoted.length === 1 ? ` · next up: “${promoted[0].title}”` : promoted.length ? ` · ${promoted.length} planned steps now current` : ""}`, ops);
}

/**
 * Not done after all: back to the list it was done on (Next Actions for anything archived before we tracked it).
 * Stuff ticked done in the Inbox shares its id with the action that logs it: while it is still in the Inbox, it goes back to being stuff.
 */
export function reopenActions(ids: ID[]) {
  const acts = ids.map((id) => find("actions", id)).filter((a): a is Action => Boolean(a && a.status === "done"));
  if (!acts.length) return;
  const ops: Op[] = [];
  for (const a of acts) {
    const st = a.done_from === "inbox" ? find("stuff", a.id) : undefined;
    if (st && st.status === "done") {
      ops.push({ type: "delete", table: "actions", id: a.id });
      ops.push({ type: "patch", table: "stuff", id: st.id, data: { status: "inbox", processed_at: null } });
      getState().files.filter((f) => f.owner_kind === "action" && f.owner_id === a.id).forEach((f) => ops.push({ type: "patch", table: "files", id: f.id, data: { owner_kind: "stuff" } }));
    } else ops.push({ type: "patch", table: "actions", id: a.id, data: { status: a.done_from && a.done_from !== "inbox" ? a.done_from : "next", completed_at: null, done_from: null, archived_at: null } });
  }
  mutate(`${named("actions", acts.map((a) => a.id), "action")} not done`, ops);
}

/** Done actions still on their list, optionally only those on one list. */
export function unarchivedDone(list?: "next" | "waiting" | "someday" | "inbox") {
  return getState().actions.filter((a) => a.status === "done" && !a.archived_at && (!list || (a.done_from ?? "next") === list));
}

/** Moves done actions off their lists into Done. */
export function archiveDone(ids: ID[], where = "") {
  const acts = ids.map((id) => find("actions", id)).filter((a): a is Action => Boolean(a && a.status === "done" && !a.archived_at));
  if (!acts.length) return;
  const at = stamp();
  mutate(
    `${plural(acts.length, "done action")} archived to Done${where ? ` from ${where}` : ""}`,
    acts.flatMap((a): Op[] => [
      { type: "patch", table: "actions", id: a.id, data: { archived_at: at } },
      // Ticked-off Inbox stuff leaves the Inbox with its action.
      ...(a.done_from === "inbox" && find("stuff", a.id)?.status === "done" ? [{ type: "patch" as const, table: "stuff" as const, id: a.id, data: { status: "processed" } }] : []),
    ]),
  );
}

/** Everything done but still on its list, everywhere: done actions (Inbox ones included) and completed projects. */
function doneEverywhere() {
  const s = getState();
  return { actions: s.actions.filter((a) => a.status === "done" && !a.archived_at), projects: s.projects.filter((p) => p.status === "done" && !p.archived_at) };
}

/** ⇧E: every done item on every list goes to Done in one step (owner's request), one ⌘Z to undo. */
export function archiveAllDone() {
  const { actions, projects } = doneEverywhere();
  const n = actions.length + projects.length;
  if (!n) return notify("Nothing done to archive");
  const at = stamp();
  mutate(`${plural(n, "done item")} archived to Done`, [
    ...actions.flatMap((a): Op[] => [
      { type: "patch", table: "actions", id: a.id, data: { archived_at: at } },
      // Ticked-off Inbox stuff leaves the Inbox with its action.
      ...(a.done_from === "inbox" && find("stuff", a.id)?.status === "done" ? [{ type: "patch" as const, table: "stuff" as const, id: a.id, data: { status: "processed" } }] : []),
    ]),
    ...projects.map((p): Op => ({ type: "patch", table: "projects", id: p.id, data: { archived_at: at } })),
  ]);
}

export function patchMany(table: TableName, ids: ID[], data: Record<string, unknown>, label: string) {
  mutate(
    label,
    ids.map((id) => ({ type: "patch", table, id, data })),
  );
}

/* ---------------- derived ---------------- */

/**
 * Why an active project is stalled, if it is: it has nothing open to do, or nothing in it has been
 * touched (edited or completed) for the stall threshold.
 */
/**
 * A project with a start date hasn't begun until that day is over (owner's decision, GTD's "a calendar entry is a
 * next step"): it can't be stalled before then. Set the start to the day of the meeting it waits for, and it is only
 * flagged from the day after, if the meeting left no next action behind.
 */
export function notStarted(p: Project, t = today()): boolean {
  return Boolean(p.start && p.start > t);
}
export function startsToday(p: Project, t = today()): boolean {
  return p.start === t;
}

/**
 * The project's next linked appointment (today or later), soonest first. It is the project's next step: a project
 * with one and no next action is scheduled, not stalled (owner's request). Once it has passed, the project needs a
 * next action again.
 */
export function nextAppointment(s: State, p: Project, t = today()): Appointment | null {
  return (
    (s.appointments ?? [])
      .filter((x) => x.project_id === p.id && x.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))[0] ?? null
  );
}

export function stallReason(s: State, p: Project): "no-next" | "idle" | null {
  if (p.status !== "active") return null;
  const t = today();
  if (p.start && p.start >= t) return null; // not begun, or begins today: nothing to be stalled yet
  const mine = s.actions.filter((a) => a.project_id === p.id);
  // A next action deferred past today isn't current yet (it is hidden from Next Actions): it doesn't move the project.
  if (!mine.some((a) => isCurrentStep(a, t))) return nextAppointment(s, p, t) ? null : "no-next";
  const limit = Date.now() - meta.stallWeeks * 7 * 86_400_000;
  // The idle clock runs from when the project began: its creation, or its start date if that came later.
  const began = Math.max(Date.parse(p.created_at) || 0, p.start ? Date.parse(`${p.start}T23:59:59`) || 0 : 0);
  if (began > limit) return null; // too new to have stalled
  const lastTouch = mine.reduce((m, a) => Math.max(m, Date.parse(a.updated_at ?? a.completed_at ?? a.created_at) || 0), 0);
  return lastTouch < limit ? "idle" : null;
}

/**
 * Stalled, in GTD's sense: an active project with no current next action (or waiting for, or upcoming appointment).
 * Untouched for the threshold ("idle") is not stalled (owner's decision after the second GTD critique, reversing the
 * earlier rule): it is a quiet note and a Weekly Review question, never the red lamp.
 */
export function isStalled(s: State, p: Project): boolean {
  return stallReason(s, p) === "no-next";
}

/** A project's step that is current: a next action you can do now (not deferred past today), or a waiting for. */
export function isCurrentStep(a: Action, t = today()): boolean {
  return (a.status === "next" && !(a.defer && a.defer > t)) || a.status === "waiting";
}

/** An open action nobody has touched for the stall threshold (shown as stale in the review). */
export function isStale(a: Action): boolean {
  if (a.status !== "next" && a.status !== "waiting") return false;
  const touched = Date.parse(a.updated_at ?? a.created_at) || 0;
  return touched < Date.now() - meta.stallWeeks * 7 * 86_400_000;
}

export type ProjectHealth = "ok" | "waiting" | "stalled" | "someday" | "done" | "scheduled";

/**
 * Traffic light: green has a next action, amber only waits on others, red has nothing moving. A project that hasn't
 * begun is "scheduled" (a ring with a clock), never green: nothing is moving yet, and nothing needs to be. On its start
 * day it stays scheduled until it has a next action.
 */
export function projectHealth(s: State, p: Project): ProjectHealth {
  if (p.status === "someday") return "someday";
  if (p.status === "done" || p.status === "trashed") return "done";
  if (notStarted(p)) return "scheduled";
  if (isStalled(s, p)) return "stalled";
  const open = s.actions.filter((a) => a.project_id === p.id);
  if (open.some((a) => a.status === "next" && isCurrentStep(a))) return "ok";
  if (open.some((a) => a.status === "waiting")) return "waiting";
  return startsToday(p) || nextAppointment(s, p) ? "scheduled" : "stalled";
}

export function lastReview(s: State): string | null {
  return s.reviews.map((r) => r.completed_at).sort().pop() ?? null;
}

export function daysSinceReview(s: State): number | null {
  const r = lastReview(s);
  return r ? daysBetween(r.slice(0, 10), today()) : null;
}

export function isDeferred(a: Action, t = today()) {
  return Boolean(a.defer && a.defer > t);
}

/**
 * On hold with its project (GTD: putting a project on Someday/Maybe puts its actions on hold too; GTD audit). They
 * keep their status and come back when the project is active again, but no action list, count or filter shows them.
 */
export function onHold(a: Pick<Action, "project_id">, s: Pick<State, "projects"> = state): boolean {
  return Boolean(a.project_id && s.projects.find((p) => p.id === a.project_id)?.status === "someday");
}

export function isChase(a: Action, t = today()) {
  return a.status === "waiting" && Boolean(a.followup && a.followup <= t) && !onHold(a);
}

/* ---------------- server helpers ---------------- */

/** Something new landed in the Inbox (a capture or an upload, never a load or an undo): the rail's pond takes a drop. */
function landed(n: number) {
  window.dispatchEvent(new CustomEvent("gtd:landed", { detail: n }));
}

/** Capture to the Inbox. A caller that must know the new item (the Weekly Review's capture lines) passes its id. */
export async function capture(text: string, id: ID = uid()) {
  const row = {
    id,
    text: text.trim(),
    kind: "text" as const,
    status: "inbox" as const,
    created_at: stamp(),
    processed_at: null,
  };
  applyLocal([{ type: "create", table: "stuff", row }]);
  landed(1);
  undoStack.push({ label: "Capture", inverse: [{ type: "patch", table: "stuff", id, data: { status: "trashed" } }] });
  const res = await fetch("/api/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, id }),
  });
  const saved = await res.json();
  applyLocal([{ type: "patch", table: "stuff", id, data: { kind: saved.kind } }]);
}

export async function upload(files: File[] | FileList, owner?: { kind: string; id: ID }) {
  const list = Array.from(files);
  if (!list.length) return;
  const form = new FormData();
  list.forEach((f) => form.append("file", f));
  if (owner) {
    form.append("owner_kind", owner.kind);
    form.append("owner_id", owner.id);
  }
  notify(`Uploading ${plural(list.length, "file")}…`);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) throw new Error(res.statusText);
    const { stuff, files: frows } = await res.json();
    applyLocal([
      ...stuff.map((row: Record<string, unknown>) => ({ type: "create" as const, table: "stuff" as const, row })),
      ...frows.map((row: Record<string, unknown>) => ({ type: "create" as const, table: "files" as const, row })),
    ]);
    if (stuff.length) landed(stuff.length);
    notify(owner ? `Attached ${plural(list.length, "file")}` : `${plural(list.length, "file")} captured to the Inbox`);
  } catch (e) {
    notify(`Upload failed: ${(e as Error).message}`, { tone: "error" });
  }
}

export function localApply(ops: Op[]) {
  applyLocal(ops);
}
