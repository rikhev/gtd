import { getState, mutate, newAction, quote, stamp, uid } from "./store.ts";
import type { ID } from "../shared/types.ts";
import type { useUI, ViewId } from "./ui.tsx";
import { addNextActionNamed, addWaitingNamed } from "./actionCommands.tsx";
import { projectEditors } from "./views/ProjectsView.tsx";
import { itemsFromText, newChecklist, openChecklist, touchChecklist } from "./checklists.ts";

type UI = ReturnType<typeof useUI>;

/**
 * The phone's +, on a list: what it adds there, named in the sheet's own field (owner's request: on a phone there was
 * no real way to add to a list; the desktop names a new row in place, which a phone can't do well). The words are
 * written first, then the list's own questions follow as sheets, as ⌥T, ⌥W and ⌥N ask them: a next action its
 * context and project, a waiting for who it waits on, a project its area and first next action. A note opens in its
 * sheet to be written; a checklist opens to be filled; inside a checklist, every line becomes an item.
 */
export interface PhoneAdder {
  /** The tab's name: where it goes. */
  tab: string;
  run: (ui: UI, text: string) => void;
}

const firstLine = (text: string) => text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";

export function phoneAdder(view: ViewId, inChecklist: ID | null, inRefList: ID | null): PhoneAdder | null {
  if (inRefList) return null;
  if (inChecklist) {
    const c = getState().checklists.find((x) => x.id === inChecklist);
    if (!c) return null;
    return {
      tab: c.title || "Checklist",
      run: (_ui, text) => {
        const s = getState();
        const top = Math.max(0, ...s.checklist_items.filter((i) => i.checklist_id === c.id).map((i) => i.sort));
        const items = itemsFromText(text, c.id).map((i, n) => ({ ...i, sort: top + n + 1 }));
        if (!items.length) return;
        mutate(items.length === 1 ? `${quote(items[0].title)} added` : `${items.length} items added`, [
          ...items.map((row) => ({ type: "create" as const, table: "checklist_items" as const, row: { ...row } })),
          touchChecklist(c.id),
        ]);
      },
    };
  }
  switch (view) {
    case "next":
      return { tab: "Next Actions", run: (ui, text) => addNextActionNamed(ui, firstLine(text)) };
    case "waiting":
      return { tab: "Waiting For", run: (ui, text) => addWaitingNamed(ui, firstLine(text)) };
    case "projects":
      return { tab: "Projects", run: (ui, text) => projectEditors(ui).createNamed(firstLine(text)) };
    case "someday":
      return {
        tab: "Someday / Maybe",
        run: (_ui, text) => {
          const a = newAction({ title: firstLine(text), status: "someday" });
          mutate(`${quote(a.title)} on Someday / Maybe`, [{ type: "create", table: "actions", row: { ...a } }]);
        },
      };
    case "reference":
      return {
        tab: "Reference",
        run: (ui, text) => {
          // The first line names the note; anything under it is its first words. It opens in its sheet to be written.
          const [title, ...rest] = text.split("\n");
          const id = uid();
          mutate(`New note ${quote(title.trim())}`, [{ type: "create", table: "refs", row: { id, title: title.trim(), notes: rest.join("\n").trim(), project_id: null, status: "active", created_at: stamp(), form: null } }]);
          ui.openDetail({ kind: "ref", id }, true);
        },
      };
    case "checklists":
      return {
        tab: "Checklists",
        run: (_ui, text) => {
          // Named by the first line; any lines under it are its first items, as a pasted list is read everywhere.
          const [title, ...rest] = text.split("\n");
          const c = newChecklist({ title: title.trim() });
          const items = itemsFromText(rest.join("\n"), c.id);
          mutate(`New checklist ${quote(c.title)}`, [{ type: "create", table: "checklists", row: { ...c } }, ...items.map((row) => ({ type: "create" as const, table: "checklist_items" as const, row: { ...row } }))]);
          openChecklist(c.id);
        },
      };
    default:
      return null;
  }
}
