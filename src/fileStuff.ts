import { getState, mutate, named, newAction, newProject, notify, stamp, uid } from "./store.ts";
import type { UI } from "./ui.tsx";
import { askContext, askWaitingOn, destinationItems } from "./actionCommands.tsx";
import { splitStuff, stuffTitle } from "./views/InboxView.tsx";
import { itemsFromText, newChecklist } from "./checklists.ts";
import type { ID, Op } from "../shared/types.ts";

/* Filing Inbox items, shared by the Inbox and the Weekly Review's Get clear step. */

const n = (ids: ID[]) => named("stuff", ids, "item");

/**
 * Done already (the two-minute rule): the item stays in the Inbox struck through, like a done action on its list,
 * and is logged as a done action that shares its id, so unticking it (reopenActions) makes it stuff again.
 * Archiving (⇧E) moves both on to Done.
 */
export function doneNow(ids: ID[]) {
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
  ui.openPicker({
    type: "list",
    title: "File as",
    // GTD order: the lists, then "under two minutes? do it now" (or trash it), then the projects.
    items: [
      ...destinationItems().flatMap((it) =>
        it.section !== "lists"
          ? []
          : // Checklists sit with Reference (GTD's support material): an item's lines become the items to tick.
            it.id === "reference"
            ? [it, { id: "checklist", label: "Checklist", hint: "Its lines become items", section: "lists" }]
            : [it],
      ),
      { id: "__done", label: "Done already (two-minute rule)", section: "now" },
      { id: "__trash", label: "Trash", section: "now" },
      ...destinationItems().filter((it) => it.section === "projects"),
    ],
    placeholder: "Filter, or name a new project",
    createLabel: (q) => `New project “${q}”, with this as its first action`,
    onCreate: (q) => {
      const p = newProject({ title: q });
      // A project's first action is a next action, so it needs a context too.
      askContext(ui, `Context for the first action of “${q}”`, (ctx, extra) => file(p.id, undefined, [{ type: "create", table: "projects", row: { ...p } }, ...extra], `project “${q}”`, ctx));
    },
    onPick: (target) => {
      if (!target) return;
      if (target === "__done") doneNow(ids);
      else if (target === "__trash") trashNow(ids);
      else if (target === "waiting") askWaitingOn(ui, null, (who) => file(target, who));
      else if (target === "someday" || target === "reference") file(target);
      else if (target === "checklist") asChecklists();
      // A next action (on its own or in a project) always gets a context.
      else askContext(ui, "Context", (ctx, extra) => file(target, undefined, extra, undefined, ctx));
    },
  });
  /** Each item becomes a checklist named by its first line, its other lines the items. A checklist keeps no files. */
  function asChecklists() {
    const items = getState().stuff.filter((x) => ids.includes(x.id) && x.status === "inbox");
    const withFiles = items.filter((st) => getState().files.some((f) => f.owner_kind === "stuff" && f.owner_id === st.id));
    if (withFiles.length) return notify(`${named("stuff", withFiles.map((x) => x.id), "item")} ${withFiles.length === 1 ? "has" : "have"} files attached, and a checklist can't keep files. File as Reference to keep them.`, { tone: "error" });
    const ops: Op[] = [];
    for (const st of items) {
      const c = newChecklist({ title: stuffTitle(st) || "Untitled checklist" });
      ops.push({ type: "create", table: "checklists", row: { ...c } });
      for (const it of itemsFromText(splitStuff(st).rest, c.id)) ops.push({ type: "create", table: "checklist_items", row: { ...it } });
      ops.push({ type: "patch", table: "stuff", id: st.id, data: { status: "processed", processed_at: stamp() } });
    }
    mutate(`${n(ids)} → ${items.length === 1 ? "a checklist" : "checklists"}`, ops);
  }
  function file(target: string, who?: string, first: Op[] = [], into?: string, contextId?: ID) {
    const ops: Op[] = [...first];
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
        const isList = ["next", "someday", "waiting"].includes(target);
        const a = newAction({
          title,
          notes: rest,
          status: isList ? (target as "next") : "next",
          project_id: isList ? null : target,
          waiting_since: target === "waiting" ? new Date().toISOString().slice(0, 10) : null,
          waiting_who: target === "waiting" ? (who ?? null) : null,
          context_id: contextId ?? null,
        });
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
    mutate(target === "waiting" ? `${n(ids)} → Waiting For (${who})` : into ? `${n(ids)} → new ${into}` : `${n(ids)} filed`, ops);
  }
}
