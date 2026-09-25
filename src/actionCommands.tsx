import { useRef, useState } from "react";
import type { Command } from "./keys.ts";
import type { UI } from "./ui.tsx";
import { completeActions, getState, mutate, newAction, newProject, patchMany, plural, stamp, uid } from "./store.ts";
import type { Action, ActionStatus, ID, Op } from "../shared/types.ts";
import { formatLong, parseRecurrence, recurrenceLabel, today, formatTime } from "../shared/dates.ts";

export const CONTEXT_COLORS = ["#2f6fb5", "#c0392b", "#1f8a4c", "#b7791f", "#6b4fa0", "#0f8a8a", "#a3476e", "#5b6b2e"];

export function createContextOp(name: string): { id: ID; op: Op } {
  const s = getState();
  const clean = name.startsWith("@") ? name : `@${name}`;
  const id = uid();
  return {
    id,
    op: {
      type: "create",
      table: "contexts",
      row: { id, name: clean, color: CONTEXT_COLORS[s.contexts.length % CONTEXT_COLORS.length], sort: s.contexts.length },
    },
  };
}

export function createAreaOp(name: string): { id: ID; op: Op } {
  const id = uid();
  return { id, op: { type: "create", table: "areas", row: { id, name, sort: getState().areas.length } } };
}

export function contextItems() {
  return getState()
    .contexts.slice()
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ id: c.id, label: c.name, color: c.color }));
}

export function projectItems() {
  const s = getState();
  return s.projects
    .filter((p) => p.status === "active" || p.status === "someday")
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({ id: p.id, label: p.title || "Untitled project", hint: p.status === "someday" ? "Someday" : s.areas.find((a) => a.id === p.area_id)?.name }));
}

export function areaItems() {
  return getState()
    .areas.slice()
    .sort((a, b) => a.sort - b.sort)
    .map((a) => ({ id: a.id, label: a.name }));
}

const n = (ids: ID[]) => plural(ids.length, "action");

/* Field editors shared by list keys and the detail pane. */
export function editors(ui: UI) {
  const actions = (ids: ID[]) => getState().actions.filter((a) => ids.includes(a.id));
  const one = (ids: ID[]) => (ids.length === 1 ? actions(ids)[0] : undefined);

  return {
    context(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "list",
        title: "Context",
        items: contextItems(),
        current: one(ids)?.context_id ?? null,
        noneLabel: "No context",
        createLabel: (q) => `Create “${q.startsWith("@") ? q : "@" + q}”`,
        onCreate: (q) => {
          const { id, op } = createContextOp(q);
          mutate(`${n(ids)} → new context`, [op, ...ids.map((a) => ({ type: "patch" as const, table: "actions" as const, id: a, data: { context_id: id } }))]);
        },
        onPick: (id) => {
          const name = getState().contexts.find((c) => c.id === id)?.name ?? "no context";
          patchMany("actions", ids, { context_id: id }, `${n(ids)} → ${name}`);
        },
      });
    },
    project(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "list",
        title: "Project",
        items: projectItems(),
        current: one(ids)?.project_id ?? null,
        noneLabel: "No project",
        createLabel: (q) => `Create project “${q}”`,
        onCreate: (q) => {
          const p = newProject({ title: q });
          mutate(`${n(ids)} → new project “${q}”`, [
            { type: "create", table: "projects", row: { ...p } },
            ...ids.map((a) => ({ type: "patch" as const, table: "actions" as const, id: a, data: { project_id: p.id } })),
          ]);
        },
        onPick: (id) => {
          const name = getState().projects.find((p) => p.id === id)?.title ?? "no project";
          patchMany("actions", ids, { project_id: id }, `${n(ids)} → ${name}`);
        },
      });
    },
    date(ids: ID[], field: "due" | "defer" | "followup" | "bring_back") {
      if (!ids.length) return;
      const titles = { due: "Due date", defer: "Start date (hidden until then)", followup: "Follow up on", bring_back: "Bring back to the Inbox on" };
      ui.openPicker({
        type: "date",
        title: titles[field],
        current: one(ids)?.[field] ?? null,
        onPick: (d) => {
          const what = { due: "due", defer: "start", followup: "follow-up", bring_back: "bring back" }[field];
          patchMany("actions", ids, { [field]: d }, d ? `${n(ids)}: ${what} ${formatLong(d)}` : `${n(ids)}: ${what} date cleared`);
        },
      });
    },
    time(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "time",
        current: one(ids)?.time_min ?? null,
        onPick: (m) => patchMany("actions", ids, { time_min: m }, m ? `${n(ids)}: ${formatTime(m)}` : `${n(ids)}: estimate cleared`),
      });
    },
    energy(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "energy",
        current: one(ids)?.energy ?? null,
        onPick: (e) => patchMany("actions", ids, { energy: e }, e ? `${n(ids)}: ${["", "low", "medium", "high"][e]} energy` : `${n(ids)}: energy cleared`),
      });
    },
    recurrence(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "text",
        title: "Repeat",
        current: one(ids)?.recurrence ?? "",
        placeholder: "every mon, every 3 months, weekly",
        preview: (s) => {
          const r = parseRecurrence(s);
          if (r === null) return { ok: true, text: "Doesn’t repeat" };
          if (r === undefined) return { ok: false, text: "Try “weekly”, “every mon, thu”, “every 3 months”" };
          return { ok: true, text: `${recurrenceLabel(r)} · the next one appears when this is done` };
        },
        onPick: (s) => {
          const r = parseRecurrence(s);
          patchMany("actions", ids, { recurrence: r ? s.trim() : null }, r ? `${n(ids)}: ${recurrenceLabel(r).toLowerCase()}` : `${n(ids)}: no longer repeats`);
        },
      });
    },
    delegate(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "text",
        title: "Delegate to",
        current: one(ids)?.waiting_who ?? "",
        placeholder: "Who is it waiting on?",
        preview: (s) => (s.trim() ? { ok: true, text: `Moves to Waiting For · since today` } : { ok: false, text: "Type a name" }),
        onPick: (who) =>
          patchMany("actions", ids, { status: "waiting", waiting_who: who.trim(), waiting_since: today(), flagged: 0 }, `${n(ids)} → Waiting For (${who.trim()})`),
      });
    },
    move(ids: ID[]) {
      if (!ids.length) return;
      const lists = [
        { id: "list:next", label: "Next Actions", hint: "List" },
        { id: "list:waiting", label: "Waiting For", hint: "List" },
        { id: "list:someday", label: "Someday / Maybe", hint: "List" },
        { id: "list:reference", label: "Reference", hint: "Keep as reference" },
      ];
      ui.openPicker({
        type: "list",
        title: "Move to",
        items: [...lists, ...projectItems().map((p) => ({ ...p, hint: "Project" }))],
        createLabel: (q) => `Create project “${q}” and move`,
        onCreate: (q) => {
          const p = newProject({ title: q });
          mutate(`${n(ids)} → new project “${q}”`, [
            { type: "create", table: "projects", row: { ...p } },
            ...ids.map((a) => ({ type: "patch" as const, table: "actions" as const, id: a, data: { project_id: p.id } })),
          ]);
        },
        onPick: (target) => {
          if (!target) return;
          if (target === "list:reference") {
            const ops: Op[] = [];
            for (const a of actions(ids)) {
              const rid = uid();
              ops.push({ type: "create", table: "refs", row: { id: rid, title: a.title, notes: a.notes, project_id: a.project_id, status: "active", created_at: stamp() } });
              ops.push({ type: "patch", table: "actions", id: a.id, data: { status: "trashed" } });
              for (const f of getState().files.filter((f) => f.owner_kind === "action" && f.owner_id === a.id)) {
                ops.push({ type: "patch", table: "files", id: f.id, data: { owner_kind: "ref", owner_id: rid } });
              }
            }
            mutate(`${n(ids)} → Reference`, ops);
          } else if (target.startsWith("list:")) {
            const status = target.slice(5) as ActionStatus;
            const label = { next: "Next Actions", waiting: "Waiting For", someday: "Someday / Maybe" }[status as "next"];
            const data: Record<string, unknown> = { status };
            if (status === "waiting") data.waiting_since = today();
            patchMany("actions", ids, data, `${n(ids)} → ${label}`);
          } else {
            const name = getState().projects.find((p) => p.id === target)?.title ?? "project";
            patchMany("actions", ids, { project_id: target }, `${n(ids)} → ${name}`);
          }
        },
      });
    },
  };
}

/**
 * Keyboard commands for any list of actions. `status` decides where N creates
 * new rows; `neighbors` supplies visible order for ⌥↑/⌥↓.
 */
export function useActionCommands(opts: {
  ui: UI;
  targets: () => ID[];
  focusId: ID | null;
  status: ActionStatus;
  defaults?: () => Partial<Action>;
  neighbors: (id: ID) => { prev?: Action; next?: Action };
  onCreated?: (id: ID) => void;
  waitingView?: boolean;
  doneView?: boolean;
}) {
  const { ui, targets, status } = opts;
  const [editing, setEditing] = useState<ID | null>(null);
  const [striking, setStriking] = useState<Set<ID>>(new Set());
  const timer = useRef<number | undefined>(undefined);
  const ed = editors(ui);

  const complete = () => {
    const ids = targets();
    if (!ids.length) return;
    // The pen strikes through first; the rows fold away a beat later.
    setStriking(new Set(ids));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      completeActions(ids);
      setStriking(new Set());
    }, 280);
  };

  const reopen = () => {
    const ids = targets();
    if (!ids.length) return;
    patchMany("actions", ids, { status: "next", completed_at: null }, `${n(ids)} back on Next Actions`);
  };

  const flag = () => {
    const ids = targets();
    if (!ids.length) return;
    const acts = getState().actions.filter((a) => ids.includes(a.id));
    const on = acts.some((a) => !a.flagged) ? 1 : 0;
    patchMany("actions", ids, { flagged: on }, on ? `${n(ids)} flagged for today` : `${n(ids)} unflagged`);
  };

  const trash = (permanent: boolean) => {
    const ids = targets();
    if (!ids.length) return;
    if (permanent) {
      mutate(
        `${n(ids)} deleted permanently`,
        ids.map((id) => ({ type: "delete", table: "actions", id })),
      );
    } else patchMany("actions", ids, { status: "trashed" }, `${n(ids)} trashed`);
  };

  const reorder = (dir: -1 | 1) => {
    const id = opts.focusId;
    if (!id) return;
    const me = getState().actions.find((a) => a.id === id);
    const nb = opts.neighbors(id);
    const other = dir < 0 ? nb.prev : nb.next;
    if (!me || !other) return;
    mutate("Reordered", [
      { type: "patch", table: "actions", id: me.id, data: { sort: other.sort } },
      { type: "patch", table: "actions", id: other.id, data: { sort: me.sort } },
    ], { silent: true });
  };

  const create = () => {
    const a = newAction({ status, ...(opts.defaults?.() ?? {}) });
    if (status === "waiting") a.waiting_since = today();
    mutate("New action", [{ type: "create", table: "actions", row: { ...a } }], { silent: true });
    opts.onCreated?.(a.id);
    setEditing(a.id);
  };

  const has = () => targets().length > 0;

  const commands: Command[] = [
    { id: "act.new", label: "New action", group: "Actions", keys: ["n"], run: create },
    { id: "act.open", label: "Open details", group: "Actions", keys: ["enter"], run: () => opts.focusId && ui.openDetail({ kind: "action", id: opts.focusId }, true) },
    { id: "act.rename", label: "Edit subject", group: "Actions", keys: ["f2"], run: () => opts.focusId && setEditing(opts.focusId) },
    opts.doneView
      ? { id: "act.reopen", label: "Not done (put back)", group: "Actions", keys: ["e"], run: reopen }
      : { id: "act.done", label: "Mark done", group: "Actions", keys: ["e"], run: complete, enabled: true },
    { id: "act.flag", label: "Flag for today", group: "Actions", keys: ["insert", "ctrl+i"], run: flag },
    { id: "act.move", label: "Move to project or list", group: "Actions", keys: ["v"], run: () => ed.move(targets()) },
    { id: "act.context", label: "Set context", group: "Fields", keys: ["c"], run: () => ed.context(targets()) },
    { id: "act.project", label: "Set project", group: "Fields", keys: ["p"], run: () => ed.project(targets()) },
    opts.waitingView
      ? { id: "act.followup", label: "Follow-up date", group: "Fields", keys: ["d"], run: () => ed.date(targets(), "followup") }
      : { id: "act.due", label: "Due date", group: "Fields", keys: ["d"], run: () => ed.date(targets(), "due") },
    { id: "act.defer", label: "Start date", group: "Fields", keys: ["s"], run: () => ed.date(targets(), "defer") },
    { id: "act.time", label: "Time estimate (then 1–6)", group: "Fields", keys: ["t"], run: () => ed.time(targets()) },
    { id: "act.energy", label: "Energy (then 1–3)", group: "Fields", keys: ["g"], run: () => ed.energy(targets()) },
    { id: "act.repeat", label: "Repeat", group: "Fields", keys: ["r"], run: () => ed.recurrence(targets()) },
    { id: "act.bringback", label: "Bring back on (tickler)", group: "Fields", keys: ["b"], run: () => ed.date(targets(), "bring_back") },
    { id: "act.delegate", label: "Delegate → Waiting For", group: "Actions", keys: ["shift+f"], run: () => ed.delegate(targets()) },
    { id: "act.trash", label: "Trash", group: "Actions", keys: ["backspace", "delete"], run: () => trash(false) },
    { id: "act.delete", label: "Delete permanently", group: "Actions", keys: ["shift+backspace", "shift+delete"], run: () => trash(true) },
    { id: "act.up", label: "Move row up", group: "Actions", keys: ["alt+arrowup"], run: () => reorder(-1) },
    { id: "act.down", label: "Move row down", group: "Actions", keys: ["alt+arrowdown"], run: () => reorder(1) },
  ].map((c) => (c.id === "act.new" || c.id === "act.open" ? c : { ...c, enabled: c.enabled ?? has() }));

  const commitTitle = (id: ID, title: string) => {
    setEditing(null);
    const a = getState().actions.find((x) => x.id === id);
    if (!a) return;
    if (!title.trim() && !a.title) {
      mutate("Discarded empty action", [{ type: "delete", table: "actions", id }], { silent: true });
      return;
    }
    if (title.trim() !== a.title) mutate("Renamed", [{ type: "patch", table: "actions", id, data: { title: title.trim() } }]);
  };

  return { commands, editing, setEditing, commitTitle, striking };
}
