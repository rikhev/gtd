import { getState, mutate, notify } from "./store.ts";
import type { UI } from "./ui.tsx";
import { projectItems } from "./actionCommands.tsx";
import { checklistNamed } from "./checklists.ts";
import type { ID, Op } from "../shared/types.ts";

/**
 * A project's support material (GTD's project support: the reference and the checklists a project draws on, kept
 * apart from its actions). References and checklists each name the project they support; its pane lists them.
 */

/** P on a checklist: the project it supports, or none. */
export function setChecklistProject(ui: UI, ids: ID[]) {
  if (!ids.length) return;
  const cur = ids.length === 1 ? (getState().checklists.find((c) => c.id === ids[0])?.project_id ?? null) : null;
  ui.openPicker({
    type: "list",
    title: "Project it supports",
    items: projectItems(),
    current: cur,
    noneLabel: "No project",
    onPick: (project_id) => {
      const name = project_id ? `“${getState().projects.find((p) => p.id === project_id)?.title || "Untitled project"}”` : "no project";
      mutate(`${checklistNamed(ids)} → ${name}`, ids.map((id): Op => ({ type: "patch", table: "checklists", id, data: { project_id } })));
    },
  });
}

/**
 * From a project's pane: link a reference or a checklist that isn't its support material yet. One that supports
 * another project moves over (its hint says which).
 */
export function linkSupport(ui: UI, projectId: ID) {
  const s = getState();
  const project = s.projects.find((p) => p.id === projectId);
  const elsewhere = (pid: ID | null | undefined) => (pid ? `Now with “${s.projects.find((p) => p.id === pid)?.title || "another project"}”` : "");
  const refs = s.refs
    .filter((r) => r.status === "active" && r.project_id !== projectId)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((r) => ({ id: `r:${r.id}`, label: r.title || "Untitled reference", hint: elsewhere(r.project_id) || "Reference", section: "refs" }));
  const lists = s.checklists
    .filter((c) => c.status === "active" && c.project_id !== projectId)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((c) => ({ id: `c:${c.id}`, label: c.title || "Untitled checklist", hint: elsewhere(c.project_id) || "Checklist", section: "lists" }));
  if (!refs.length && !lists.length) return notify("No other reference or checklist to link. Add one in Reference or Checklists first.");
  ui.openPicker({
    type: "list",
    title: `Support material for “${project?.title || "Untitled project"}”`,
    placeholder: "Find a reference or a checklist",
    items: [...refs, ...lists],
    mustChoose: true,
    onPick: (key) => {
      if (!key) return;
      const [kind, id] = [key.slice(0, 1), key.slice(2)];
      const table = kind === "r" ? "refs" : "checklists";
      const title = kind === "r" ? s.refs.find((r) => r.id === id)?.title : s.checklists.find((c) => c.id === id)?.title;
      mutate(`“${title || "Untitled"}” → support for “${project?.title || "Untitled project"}”`, [{ type: "patch", table, id, data: { project_id: projectId } }]);
    },
  });
}
