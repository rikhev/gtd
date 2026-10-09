import { getState, mutate, named, newAction, newProject, notify, stamp, uid } from "./store.ts";
import type { UI } from "./ui.tsx";
import { askContext, askProjectArea, askWaitingOn, destinationItems } from "./actionCommands.tsx";
import { splitStuff, stuffTitle } from "./views/InboxView.tsx";
import { itemsFromText, newChecklist } from "./checklists.ts";
import { reminderChoices, reminderOf } from "./reminders.ts";
import type { ID, Op, Stuff } from "../shared/types.ts";

/* Filing Inbox items, shared by the Inbox and the Weekly Review's Get clear step. */

const n = (ids: ID[]) => named("stuff", ids, "item");

/**
 * Tickler entries among some Inbox items are decided by their own choice (done, drop…), each as its own undo; the
 * rest go on as ordinary stuff.
 */
function splitReminders(ids: ID[], k: string): ID[] {
  const s = getState();
  return ids.filter((id) => {
    const st = s.stuff.find((x) => x.id === id);
    const r = reminderOf(s, st);
    if (!st || !r) return true;
    reminderChoices(null, st, r, (label, ops) => mutate(label, ops))
      .find((c) => c.k === k)
      ?.run();
    return false;
  });
}

/** V on a tickler entry: decide again (keep, make current, done, bring back later, go to it, drop). */
export function reconsider(ui: UI, id: ID) {
  const s = getState();
  const st = s.stuff.find((x) => x.id === id);
  const r = reminderOf(s, st);
  if (!st || !r) return false;
  const choices = reminderChoices(ui, st, r, (label, ops) => mutate(label, ops));
  ui.openPicker({
    type: "list",
    title: st.text,
    items: choices.map((c) => ({ id: c.k, label: c.label, section: c.k === "backspace" ? "drop" : "keep" })),
    onPick: (k) => k && window.setTimeout(() => choices.find((c) => c.k === k)?.run(), 0),
  });
  return true;
}

/**
 * Done already (the two-minute rule): the item stays in the Inbox struck through, like a done action on its list,
 * and is logged as a done action that shares its id, so unticking it (reopenActions) makes it stuff again.
 * Archiving (⇧E) moves both on to Done.
 */
export function doneNow(ids: ID[]) {
  // A tickler entry: the item it brings back is done.
  ids = splitReminders(ids, "e");
  if (!ids.length) return;
  const ops: Op[] = [];
  const at = stamp();
  for (const st of getState().stuff.filter((x) => ids.includes(x.id) && x.status === "inbox")) {
    const title = stuffTitle(st);
    const notes = st.text.slice(st.text.indexOf(title) + title.length).trim();
    ops.push({ type: "create", table: "actions", row: { ...newAction({ id: st.id, title, notes, status: "done", completed_at: at, done_from: "inbox" }) } });
    ops.push({ type: "patch", table: "stuff", id: st.id, data: { status: "done", processed_at: at } });
    getState().files.filter((f) => f.owner_kind === "stuff" && f.owner_id === st.id).forEach((f) => ops.push({ type: "patch", table: "files", id: f.id, data: { owner_kind: "action" } }));
  }
  if (ops.length) mutate(`${n(ids)} done`, ops);
}

/** Trash (or, with permanently, delete) Inbox items; a ticked-off item takes its logged action with it. */
export function trashNow(ids: ID[], permanently = false) {
  // A tickler entry: Delete drops the item it brings back (to the Trash, ⌘Z restores both).
  ids = splitReminders(ids, "backspace");
  if (!ids.length) return;
  const logged = new Set(getState().actions.filter((a) => ids.includes(a.id) && a.done_from === "inbox" && !a.archived_at).map((a) => a.id));
  const ops: Op[] = ids.flatMap((id): Op[] => [
    ...(logged.has(id) ? [{ type: "delete" as const, table: "actions" as const, id }] : []),
    permanently ? { type: "delete", table: "stuff", id } : { type: "patch", table: "stuff", id, data: { status: "trashed" } },
  ]);
  mutate(`${n(ids)} ${permanently ? "deleted permanently" : "trashed"}`, ops);
}

/**
 * File: the whole clarify decision in one picker. A list, an existing project,
 * a new project (type its name), done now, or trash.
 */
export function fileStuff(ui: UI, ids: ID[]) {
  if (!ids.length) return;
  // A tickler entry isn't filed: it brings back an item that is already filed, to be decided again.
  if (ids.length === 1 && reconsider(ui, ids[0])) return;
  if (ids.some((id) => reminderOf(getState(), getState().stuff.find((x) => x.id === id)))) {
    notify("“Due back” entries are decided one at a time: V on one of them, or K to clarify.");
    return;
  }
  ui.openPicker({
    type: "list",
    title: "File as",
    // GTD order: the lists, then "under two minutes? do it now" (or trash it), then the projects.
    items: [
      ...destinationItems().flatMap((it) =>
        it.section !== "lists"
          ? []
          : // A checklist follows Reference (both non-actionable; GTD keeps checklists as their own category): an item's lines become the items to tick.
            it.id === "reference"
            ? [it, { id: "checklist", label: "Checklist", hint: "Its lines become items", section: "lists" }]
            : [it],
      ),
      { id: "__done", label: "Done already (two-minute rule)", section: "now" },
      { id: "__trash", label: "Trash", section: "now" },
      ...destinationItems().filter((it) => it.section === "projects"),
    ],
    createLabel: (q) => `New project “${q}”, with this as its first action`,
    onCreate: (q) =>
      // The project is made with its first action, which is worded like any next action; its area is asked first.
      askProjectArea(ui, q, (area_id, areaOps) => {
        const p = newProject({ title: q, area_id });
        oneByOne(p.id, [...areaOps, { type: "create", table: "projects", row: { ...p } }], q);
      }),
    onPick: (target) => {
      if (!target) return;
      if (target === "__done") doneNow(ids);
      else if (target === "__trash") trashNow(ids);
      else if (target === "someday" || target === "reference") file(target);
      else if (target === "checklist") asChecklists();
      // Next Actions, Waiting For or a project: each item is put into words first, one at a time.
      else oneByOne(target);
    },
  });

  /**
   * Filing something you will do (or wait for) asks GTD's question first, for one item at a time (owner's decision
   * after the GTD critique: V used to file the captured words as they were, many at once): the very next physical step
   * (or what you are waiting for), the item's own words offered to rewrite; then its context (or who it waits on).
   * Each item files as its own ⌘Z. Esc at any prompt stops there; the items not reached stay in the Inbox.
   */
  function oneByOne(target: string, first: Op[] = [], newProject?: string) {
    const queue = getState().stuff.filter((x) => ids.includes(x.id) && x.status === "inbox");
    const waiting = target === "waiting";
    const step = (i: number, lead: Op[]) => {
      const st = queue[i];
      if (!st) return;
      const count = queue.length > 1 ? `${i + 1} of ${queue.length} · ` : "";
      ui.openPicker({
        type: "text",
        title: `${count}${waiting ? "What are you waiting for?" : newProject ? `First next action of “${newProject}”` : "What's the very next physical step?"}`,
        current: stuffTitle(st),
        onPick: (v) => {
          const words = (v ?? "").trim();
          if (!words) return;
          const done = (extra: Op[], data: { context_id?: ID; waiting_who?: string }, label: string) => {
            mutate(label, [...lead, ...extra, ...fileOne(st, target, words, data)]);
            window.setTimeout(() => step(i + 1, []), 0);
          };
          window.setTimeout(() => {
            if (waiting) askWaitingOn(ui, null, (who) => done([], { waiting_who: who }, `“${words}” → Waiting For (${who})`), `Waiting on, for “${words}”`);
            else
              askContext(ui, `Context for “${words}”`, (context_id, extra) =>
                done(extra, { context_id }, newProject && i === 0 ? `“${words}” → new project “${newProject}”` : `“${words}” filed`),
              );
          }, 0);
        },
      });
    };
    step(0, first);
  }

  /** One Inbox item as the action it was worded into: its notes and files come along, and it leaves the Inbox. */
  function fileOne(st: Stuff, target: string, words: string, data: { context_id?: ID; waiting_who?: string }): Op[] {
    const isList = target === "next" || target === "waiting";
    const a = newAction({
      title: words,
      notes: splitStuff(st).rest,
      status: target === "waiting" ? "waiting" : "next",
      project_id: isList ? null : target,
      context_id: data.context_id ?? null,
      waiting_who: data.waiting_who ?? null,
      waiting_since: target === "waiting" ? new Date().toISOString().slice(0, 10) : null,
    });
    return [
      { type: "create", table: "actions", row: { ...a } },
      ...getState()
        .files.filter((f) => f.owner_kind === "stuff" && f.owner_id === st.id)
        .map((f): Op => ({ type: "patch", table: "files", id: f.id, data: { owner_kind: "action", owner_id: a.id } })),
      { type: "patch", table: "stuff", id: st.id, data: { status: "processed", processed_at: stamp() } },
    ];
  }
  /** Each item becomes a checklist named by its first line, its other lines the items. A checklist keeps no files. */
  function asChecklists() {
    const items = getState().stuff.filter((x) => ids.includes(x.id) && x.status === "inbox");
    const withFiles = items.filter((st) => getState().files.some((f) => f.owner_kind === "stuff" && f.owner_id === st.id));
    if (withFiles.length) return notify(`${named("stuff", withFiles.map((x) => x.id), "item")} ${withFiles.length === 1 ? "has" : "have"} files attached, and a checklist can't keep files. File as Reference to keep them.`, { tone: "error" });
    const ops: Op[] = [];
    // Each takes its own place in the manual order, one after another.
    items.forEach((st, k) => {
      const c = newChecklist({ title: stuffTitle(st) || "Untitled checklist" });
      c.sort += k;
      ops.push({ type: "create", table: "checklists", row: { ...c } });
      for (const it of itemsFromText(splitStuff(st).rest, c.id)) ops.push({ type: "create", table: "checklist_items", row: { ...it } });
      ops.push({ type: "patch", table: "stuff", id: st.id, data: { status: "processed", processed_at: stamp() } });
    });
    mutate(`${n(ids)} → ${items.length === 1 ? "a checklist" : "checklists"}`, ops);
  }
  /** Someday/Maybe and Reference keep the captured words as they are: there is no next action to decide yet. */
  function file(target: "someday" | "reference") {
    const ops: Op[] = [];
    for (const st of getState().stuff.filter((x) => ids.includes(x.id) && x.status === "inbox")) {
      const title = stuffTitle(st);
      const rest = st.text.slice(st.text.indexOf(title) + title.length).trim();
      const files = getState().files.filter((f) => f.owner_kind === "stuff" && f.owner_id === st.id);
      let owner: { kind: string; id: ID };
      if (target === "reference") {
        const rid = uid();
        ops.push({
          type: "create",
          table: "refs",
          row: {
            id: rid,
            title,
            notes: rest,
            project_id: null,
            status: "active",
            created_at: stamp(),
          },
        });
        owner = { kind: "ref", id: rid };
      } else {
        const a = newAction({ title, notes: rest, status: "someday" });
        ops.push({ type: "create", table: "actions", row: { ...a } });
        owner = { kind: "action", id: a.id };
      }
      files.forEach((f) =>
        ops.push({
          type: "patch",
          table: "files",
          id: f.id,
          data: { owner_kind: owner.kind, owner_id: owner.id },
        }),
      );
      ops.push({
        type: "patch",
        table: "stuff",
        id: st.id,
        data: { status: "processed", processed_at: stamp() },
      });
    }
    mutate(`${n(ids)} → ${target === "someday" ? "Someday / Maybe" : "Reference"}`, ops);
  }
}
