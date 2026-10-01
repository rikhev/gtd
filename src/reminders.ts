import { getState, stamp } from "./store.ts";
import type { UI } from "./ui.tsx";
import { askContext } from "./actionCommands.tsx";
import type { Action, ID, Op, Project, State, Stuff } from "../shared/types.ts";

/**
 * Tickler entries ("Due back: …"): on its bring-back date an item comes back to the Inbox for a fresh decision, as
 * GTD's tickler does, while the item itself stays what it was. Clarifying the entry decides again.
 */

export type Reminder = { kind: "action"; item: Action } | { kind: "project"; item: Project };

/** The item a tickler entry points at, if it is one and the item is still there. */
export function reminderOf(s: Pick<State, "actions" | "projects">, st: Pick<Stuff, "back_kind" | "back_id"> | undefined): Reminder | null {
  if (!st?.back_id || !st.back_kind) return null;
  if (st.back_kind === "action") {
    const item = s.actions.find((a) => a.id === st.back_id && a.status !== "trashed");
    return item ? { kind: "action", item } : null;
  }
  const item = s.projects.find((p) => p.id === st.back_id && p.status !== "trashed");
  return item ? { kind: "project", item } : null;
}

const LISTS: Record<string, string> = { next: "Next Actions", waiting: "Waiting For", someday: "Someday / Maybe", later: "Planned, in its project", active: "Projects", done: "Done" };

/** Where the item lives now: "Someday / Maybe · Renew the passports", "Waiting For · Anna". */
export function reminderWhere(s: Pick<State, "projects">, r: Reminder): string {
  if (r.kind === "project") return r.item.status === "someday" ? "Someday / Maybe (project)" : "Projects";
  const a = r.item;
  const project = s.projects.find((p) => p.id === a.project_id)?.title;
  return [LISTS[a.status] ?? a.status, a.status === "waiting" ? a.waiting_who : null, project].filter(Boolean).join(" · ");
}

const name = (r: Reminder) => `“${r.item.title || (r.kind === "project" ? "Untitled project" : "Untitled action")}”`;

/** One way to decide again: its key, its words, and what it does (finishing with a toast and the ops, or not at all). */
export interface ReminderChoice {
  k: string;
  label: string;
  run: () => void;
}

/**
 * The decisions a tickler entry offers, in GTD's terms: keep it as it is, make it current (a someday item), done,
 * bring it back again later, go to it, or drop it. `finish` records the decision together with the entry being dealt
 * with, as one undo. Without a UI (a key acting straight from a list) only the choices that need no picker are offered.
 */
export function reminderChoices(ui: UI | null, st: Stuff, r: Reminder, finish: (label: string, ops: Op[]) => void): ReminderChoice[] {
  const at = stamp();
  const handled: Op = { type: "patch", table: "stuff", id: st.id, data: { status: "processed", processed_at: at } };
  const table = r.kind === "action" ? "actions" : "projects";
  // Something not yet current (a someday item, or a project's planned later step) can be made current here.
  const someday = r.item.status === "someday" || r.item.status === "later";
  const out: ReminderChoice[] = [{ k: "enter", label: "Keep it as it is", run: () => finish(`${name(r)} kept as it is`, [handled]) }];
  if (someday && ui) {
    out.push({
      k: "a",
      label: r.kind === "project" ? "Make it an active project" : "Make it a next action",
      run: () => {
        if (r.kind === "project") return finish(`${name(r)} is active`, [handled, { type: "patch", table: "projects", id: r.item.id, data: { status: "active" } }]);
        const a = r.item;
        // A next action always has a context, as everywhere.
        if (a.context_id) return finish(`${name(r)} is a next action`, [handled, { type: "patch", table: "actions", id: a.id, data: { status: "next" } }]);
        askContext(ui, `Context for ${name(r)}`, (context_id, extra) =>
          finish(`${name(r)} is a next action`, [...extra, handled, { type: "patch", table: "actions", id: a.id, data: { status: "next", context_id } }]),
        );
      },
    });
  }
  out.push({
    k: "e",
    label: r.kind === "project" ? "Complete the project" : "Done",
    run: () => {
      if (r.kind === "action") {
        const a = r.item;
        const from = a.status === "waiting" || a.status === "someday" || a.status === "later" ? a.status : "next";
        return finish(`${name(r)} done`, [handled, { type: "patch", table: "actions", id: a.id, data: { status: "done", completed_at: at, flagged: 0, done_from: from, archived_at: null } }]);
      }
      // A completed project's open actions are done with it and filed in Done, as on Projects.
      const open = getState().actions.filter((a) => a.project_id === r.item.id && ["next", "waiting", "later"].includes(a.status));
      finish(`${name(r)} complete${open.length ? ` · ${open.length} open ${open.length === 1 ? "action" : "actions"} done with it` : ""}`, [
        handled,
        { type: "patch", table: "projects", id: r.item.id, data: { status: "done", completed_at: at, archived_at: null } },
        ...open.map((a): Op => ({ type: "patch", table: "actions", id: a.id, data: { status: "done", completed_at: at, done_from: a.status, archived_at: at } })),
      ]);
    },
  });
  if (ui) out.push({
    k: "b",
    label: "Bring it back again later",
    run: () =>
      ui.openPicker({
        type: "date",
        title: `Bring ${name(r)} back on`,
        current: null,
        onPick: (d) => d && finish(`${name(r)} comes back ${d}`, [handled, { type: "patch", table, id: r.item.id, data: { bring_back: d } }]),
      }),
  });
  if (ui) out.push({
    k: "j",
    label: "Go to it",
    run: () => {
      finish(`${name(r)}: decide there`, [handled]);
      ui.reveal({ kind: r.kind, id: r.item.id });
    },
  });
  out.push({
    k: "backspace",
    label: r.kind === "project" ? "Drop it (the project and its open actions to the Trash)" : "Drop it (to the Trash)",
    run: () => {
      const extra: Op[] =
        r.kind === "project"
          ? getState()
              .actions.filter((a) => a.project_id === r.item.id && !["done", "trashed"].includes(a.status))
              .map((a): Op => ({ type: "patch", table: "actions", id: a.id, data: { status: "trashed" } }))
          : [];
      finish(`${name(r)} dropped (in the Trash)`, [handled, { type: "patch", table, id: r.item.id, data: { status: "trashed" } }, ...extra]);
    },
  });
  return out;
}

/** The ids of tickler entries among some Inbox items. */
export const remindersAmong = (ids: ID[]) => getState().stuff.filter((x) => ids.includes(x.id) && reminderOf(getState(), x)).map((x) => x.id);
