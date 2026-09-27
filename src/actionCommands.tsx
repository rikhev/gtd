import { useRef, useState } from "react";
import type { Command } from "./keys.ts";
import type { UI } from "./ui.tsx";
import { completeActions, getState, mutate, named, newAction, newProject, notify, patchMany, reopenActions, stamp, uid } from "./store.ts";
import type { Action, ActionStatus, ID, Op } from "../shared/types.ts";
import { formatLong, parseRecurrence, recurrenceLabel, today, formatTime } from "../shared/dates.ts";

/** No red (kept for trouble: overdue, stalled, errors) and no green (kept for the "on track" lamp). */
export const CONTEXT_COLORS = ["#2f6fb5", "#5b6b7e", "#8a5a2b", "#b7791f", "#6b4fa0", "#0f8a8a", "#a3476e", "#5b6b2e"];

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

/** Everyone and everything the Waiting For list is waiting on right now, most recent first. */
export function waitingNames(): string[] {
  const waiting = getState().actions.filter((a) => a.status === "waiting");
  const seen = new Map<string, string>();
  for (const a of waiting) {
    const who = a.waiting_who?.trim();
    if (!who) continue;
    const when = a.waiting_since ?? a.created_at;
    const key = who.toLowerCase();
    if (!seen.has(key) || (seen.get(key) ?? "") < when) seen.set(key, when);
  }
  const names = new Map<string, string>();
  for (const a of waiting) if (a.waiting_who?.trim()) names.set(a.waiting_who.trim().toLowerCase(), a.waiting_who.trim());
  return [...seen.entries()].sort((x, y) => y[1].localeCompare(x[1])).map(([k]) => names.get(k)!);
}

/**
 * Waiting For always needs someone or something to wait on. This asks for it (pick a
 * previous name or type a new one) and only then applies; Esc leaves everything as it was.
 */
export function askWaitingOn(ui: UI, current: string | null, apply: (who: string) => void, title = "Waiting on") {
  ui.openPicker({
    type: "list",
    title,
    items: waitingNames().map((w) => ({ id: w, label: w })),
    current,
    mustChoose: true,
    placeholder: "Who or what are you waiting on?",
    createLabel: (q) => `Waiting on “${q}”`,
    onCreate: (q) => apply(q.trim()),
    onPick: (who) => who && apply(who),
  });
}

/**
 * A next action always gets a context when it's clarified. Asks for one (existing, or type a new
 * name); `apply` receives the context id and any op that creates it. Esc applies nothing.
 */
export function askContext(ui: UI, title: string, apply: (contextId: ID, extra: Op[]) => void) {
  ui.openPicker({
    type: "list",
    title,
    items: contextItems(),
    mustChoose: true,
    placeholder: "Where can you do it? Pick or type a context",
    createLabel: (q) => `New context “${q.startsWith("@") ? q : "@" + q}”`,
    onCreate: (q) => {
      const { id, op } = createContextOp(q);
      apply(id, [op]);
    },
    onPick: (id) => id && apply(id, []),
  });
}

export function contextItems() {
  return getState()
    .contexts.slice()
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ id: c.id, label: c.name, color: c.color }));
}

/** Where an item can go, in one order and with one set of names everywhere (Move and the Inbox's File as). */
export function destinationItems(prefix = "") {
  return [
    { id: `${prefix}next`, label: "Next Actions", hint: "List", section: "lists" },
    { id: `${prefix}waiting`, label: "Waiting For", hint: "List", section: "lists" },
    { id: `${prefix}someday`, label: "Someday / Maybe", hint: "List", section: "lists" },
    { id: `${prefix}reference`, label: "Reference", hint: "Keep as reference", section: "lists" },
    ...projectItems().map((p) => ({ ...p, hint: p.hint ? `Project · ${p.hint}` : "Project", section: "projects" })),
  ];
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

const n = (ids: ID[]) => named("actions", ids, "action");

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
      askWaitingOn(ui, one(ids)?.waiting_who ?? null, (who) =>
        patchMany("actions", ids, { status: "waiting", waiting_who: who, waiting_since: today(), flagged: 0 }, `${n(ids)} → Waiting For (${who})`),
      );
    },
    move(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "list",
        title: "Move to",
        // Say where the item already is (for a single item), so the picker answers "where is it now?" too.
        items: destinationItems("list:").map((it) => {
          const a = ids.length === 1 ? one(ids) : undefined;
          const here = a && (it.id === `list:${a.status}` || it.id === a.project_id);
          return here ? { ...it, hint: `${it.hint} · current` } : it;
        }),
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
            if (status === "waiting") {
              askWaitingOn(ui, one(ids)?.waiting_who ?? null, (who) =>
                patchMany("actions", ids, { status: "waiting", waiting_who: who, waiting_since: today(), flagged: 0 }, `${n(ids)} → Waiting For (${who})`),
              );
              return;
            }
            const label = { next: "Next Actions", someday: "Someday / Maybe" }[status as "next"];
            patchMany("actions", ids, { status }, `${n(ids)} → ${label}`);
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
  /** Rows about to be marked done: the list moves its cursor off them (they stay, struck through, at the bottom). */
  onCompleting?: (ids: ID[]) => void;
  waitingView?: boolean;
  doneView?: boolean;
}) {
  const { ui, targets, status } = opts;
  const [editing, setEditing] = useState<ID | null>(null);
  const [striking, setStriking] = useState<Set<ID>>(new Set());
  const timer = useRef<number | undefined>(undefined);
  const ed = editors(ui);

  // A command on a group heading has nothing to act on: say so instead of doing nothing.
  const pick = () => {
    const ids = targets();
    if (!ids.length) notify("That's a group heading. Move onto an action first.");
    return ids;
  };

  const complete = () => {
    const ids = pick();
    if (!ids.length) return;
    // E on done rows (still on their list) takes them back: E toggles, like the Complete box.
    const acts = getState().actions.filter((a) => ids.includes(a.id));
    if (acts.length && acts.every((a) => a.status === "done")) return reopenActions(ids);
    opts.onCompleting?.(ids);
    // The pen strikes through first, then the row is done (struck through at the bottom of its group, or gone when done is hidden).
    setStriking(new Set(ids));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      completeActions(ids);
      setStriking(new Set());
    }, 280);
  };

  // Back to the list each was done on.
  const reopen = () => {
    const ids = targets();
    if (!ids.length) return;
    reopenActions(ids);
  };

  const flag = () => {
    const ids = pick();
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
    const defaults = opts.defaults?.() ?? {};
    const make = (extra: Partial<Action> = {}) => {
      const a = newAction({ status, ...defaults, ...extra });
      mutate("New action", [{ type: "create", table: "actions", row: { ...a } }], { silent: true });
      opts.onCreated?.(a.id);
      setEditing(a.id);
    };
    // A new Waiting For item starts with who or what it waits on (the cursor's group is
    // offered first); Esc creates nothing.
    if (status === "waiting") askWaitingOn(ui, defaults.waiting_who ?? null, (who) => make({ waiting_who: who, waiting_since: today() }), "New item: waiting on");
    else make();
  };

  const has = () => targets().length > 0;

  const commands: Command[] = [
    { id: "act.new", label: "New action", group: "Actions", keys: ["n"], run: create },
    { id: "act.open", label: "Open details", group: "Actions", keys: ["enter"], run: () => opts.focusId && ui.openDetail({ kind: "action", id: opts.focusId }, true) },
    { id: "act.jump", label: "Jump to its project", group: "Actions", keys: ["j"], run: () => opts.focusId && ui.jumpToProject(opts.focusId) },
    { id: "act.rename", label: "Edit subject", group: "Actions", keys: ["f2"], run: () => opts.focusId && setEditing(opts.focusId) },
    opts.doneView
      ? { id: "act.reopen", label: "Not done (put back)", group: "Actions", keys: ["e"], run: reopen }
      : { id: "act.done", label: "Mark done", group: "Actions", keys: ["e"], run: complete, enabled: true },
    { id: "act.flag", label: "Flag for today", group: "Actions", keys: ["insert", "mod+i"], run: flag },
    { id: "act.move", label: "Move to project or list", group: "Actions", keys: ["v"], run: () => ed.move(pick()) },
    { id: "act.context", label: "Set context", group: "Fields", keys: ["c"], run: () => ed.context(pick()) },
    { id: "act.project", label: "Set project", group: "Fields", keys: ["p"], run: () => ed.project(pick()) },
    opts.waitingView
      ? { id: "act.followup", label: "Follow-up date", group: "Fields", keys: ["d"], run: () => ed.date(pick(), "followup") }
      : { id: "act.due", label: "Due date", group: "Fields", keys: ["d"], run: () => ed.date(pick(), "due") },
    { id: "act.defer", label: "Start date", group: "Fields", keys: ["s"], run: () => ed.date(pick(), "defer") },
    { id: "act.time", label: "Time estimate (then 1–6)", group: "Fields", keys: ["t"], run: () => ed.time(pick()) },
    { id: "act.energy", label: "Energy (then 1–3)", group: "Fields", keys: ["g"], run: () => ed.energy(pick()) },
    { id: "act.repeat", label: "Repeat", group: "Fields", keys: ["r"], run: () => ed.recurrence(pick()) },
    { id: "act.bringback", label: "Bring back on (tickler)", group: "Fields", keys: ["b"], run: () => ed.date(pick(), "bring_back") },
    { id: "act.delegate", label: "Delegate → Waiting For", group: "Actions", keys: ["shift+f"], run: () => ed.delegate(pick()) },
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

  // The Complete box acts on its own row, not on the selection: strike through and complete, or bring back.
  const completeOne = (id: ID) => {
    opts.onCompleting?.([id]);
    setStriking((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      completeActions([id]);
      setStriking((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }, 280);
  };
  const reopenOne = (id: ID) => reopenActions([id]);

  const flagOne = (id: ID) => {
    const a = getState().actions.find((x) => x.id === id);
    if (!a) return;
    const on = a.flagged ? 0 : 1;
    patchMany("actions", [id], { flagged: on }, on ? `${n([id])} flagged for today` : `${n([id])} unflagged`);
  };

  return { commands, editing, setEditing, commitTitle, striking, completeOne, reopenOne, flagOne };
}
