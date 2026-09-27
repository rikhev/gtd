import { useSyncExternalStore } from "react";
import type { Action, ID, Op, Project, State, TableName, Tables } from "../shared/types.ts";
import { nextOccurrence, parseRecurrence, today, daysBetween } from "../shared/dates.ts";

const empty: State = {
  actions: [],
  projects: [],
  stuff: [],
  refs: [],
  contexts: [],
  areas: [],
  files: [],
  rules: [],
  corrections: [],
  reviews: [],
};

let state: State = empty;
let meta: {
  hasKey: boolean;
  keyHint: string | null;
  today: string;
  loaded: boolean;
  authRequired: boolean;
  signedIn: boolean;
  authConfigured: boolean;
  /** Weeks without progress before a project counts as stalled (Settings). */
  stallWeeks: number;
} = { hasKey: false, keyHint: null, today: today(), loaded: false, authRequired: false, signedIn: true, authConfigured: true, stallWeeks: 3 };
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

/** Any edit to an action (except a pure reorder) marks it touched, as the server does; undo restores the old date. */
function touchActions(ops: Op[]): Op[] {
  return ops.map((op) =>
    op.type === "patch" && op.table === "actions" && !("updated_at" in op.data) && Object.keys(op.data).some((k) => k !== "sort")
      ? { ...op, data: { ...op.data, updated_at: stamp() } }
      : op,
  );
}

export function mutate(label: string, rawOps: Op[], opts: { silent?: boolean } = {}) {
  if (!rawOps.length) return;
  const ops = touchActions(dropStaleWaiting(rawOps));
  const inverse = invert(ops);
  applyLocal(ops);
  void send(ops);
  undoStack.push({ label, inverse });
  if (undoStack.length > 200) undoStack.shift();
  if (!opts.silent) notify(label, { undo: true });
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
    waiting_since: null,
    followup: null,
    recurrence: null,
    bring_back: null,
    sort: maxSort + 1,
    created_at: stamp(),
    completed_at: null,
    updated_at: stamp(),
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
    area_id: null,
    status: "active",
    due: null,
    bring_back: null,
    sort: maxSort + 1,
    created_at: stamp(),
    completed_at: null,
    ...data,
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export { plural };

/** Mark actions done; recurring ones spawn their next occurrence. */
/** A toast's subject: the item itself when there is one ("“Pay the VAT”"), else a count ("3 actions"). */
export function named(table: "actions" | "projects" | "stuff" | "refs", ids: ID[], noun: string): string {
  if (ids.length !== 1) return plural(ids.length, noun);
  const row = (state[table] as unknown as { id: ID; title?: string; text?: string }[]).find((r) => r.id === ids[0]);
  const raw = (row?.title ?? row?.text ?? "").split("\n")[0].trim();
  if (!raw) return plural(1, noun);
  return `“${raw.length > 42 ? `${raw.slice(0, 40).trimEnd()}…` : raw}”`;
}

export function completeActions(ids: ID[]) {
  const ops: Op[] = [];
  let spawned = 0;
  for (const id of ids) {
    const a = find("actions", id);
    if (!a || a.status === "done") continue;
    ops.push({ type: "patch", table: "actions", id, data: { status: "done", completed_at: stamp(), flagged: 0 } });
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
  mutate(`${named("actions", ids, "action")} done${spawned ? ` · ${spawned} recurring scheduled` : ""}`, ops);
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
 * touched (edited or completed) for the stall threshold. Built in: no Claude needed.
 */
export function stallReason(s: State, p: Project): "no-next" | "idle" | null {
  if (p.status !== "active") return null;
  const mine = s.actions.filter((a) => a.project_id === p.id);
  if (!mine.some((a) => a.status === "next" || a.status === "waiting")) return "no-next";
  const limit = Date.now() - meta.stallWeeks * 7 * 86_400_000;
  if (Date.parse(p.created_at) > limit) return null; // too new to have stalled
  const lastTouch = mine.reduce((m, a) => Math.max(m, Date.parse(a.updated_at ?? a.completed_at ?? a.created_at) || 0), 0);
  return lastTouch < limit ? "idle" : null;
}

export function isStalled(s: State, p: Project): boolean {
  return stallReason(s, p) !== null;
}

/** An open action nobody has touched for the stall threshold (shown as stale in the review). */
export function isStale(a: Action): boolean {
  if (a.status !== "next" && a.status !== "waiting") return false;
  const touched = Date.parse(a.updated_at ?? a.created_at) || 0;
  return touched < Date.now() - meta.stallWeeks * 7 * 86_400_000;
}

export type ProjectHealth = "ok" | "waiting" | "stalled" | "someday" | "done";

/** Traffic light: green has a next action, amber only waits on others, red has nothing moving. */
export function projectHealth(s: State, p: Project): ProjectHealth {
  if (p.status === "someday") return "someday";
  if (p.status === "done" || p.status === "trashed") return "done";
  if (isStalled(s, p)) return "stalled";
  const open = s.actions.filter((a) => a.project_id === p.id);
  if (open.some((a) => a.status === "next")) return "ok";
  if (open.some((a) => a.status === "waiting")) return "waiting";
  return "stalled";
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

export function isChase(a: Action, t = today()) {
  return a.status === "waiting" && Boolean(a.followup && a.followup <= t);
}

/* ---------------- server helpers ---------------- */

export async function capture(text: string) {
  const id = uid();
  const row = {
    id,
    text: text.trim(),
    kind: "text" as const,
    status: "inbox" as const,
    created_at: stamp(),
    processed_at: null,
  };
  applyLocal([{ type: "create", table: "stuff", row }]);
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
    notify(owner ? `Attached ${plural(list.length, "file")}` : `${plural(list.length, "file")} captured to the Inbox`);
  } catch (e) {
    notify(`Upload failed: ${(e as Error).message}`, { tone: "error" });
  }
}

export function localApply(ops: Op[]) {
  applyLocal(ops);
}
