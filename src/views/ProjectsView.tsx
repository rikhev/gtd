import { useEffect, useMemo, useState } from "react";
import { getState, isStalled, mutate, named, newAction, newProject, nextAppointment, notStarted, patchMany, plural, projectHealth, stamp, startsToday, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, bakeDrop, stepRows, useListNav, usePersisted, useSort, sortGroups, isGroupKey, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { AreaName, DateCell, DoneBox, Lamp } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { areaItems, areaName, askContext, askWaitingOn, createAreaOp } from "../actionCommands.tsx";
import { formatLong, today } from "../../shared/dates.ts";
import { pickGoal } from "../horizons.ts";
import { areaFilterLabel, inAreas, openAreaFilter, setAreaFilter, useAreaFilter } from "../areaFilter.ts";
import type { Appointment, ID, Op, Project } from "../../shared/types.ts";

type Filter = "active" | "all";

export function projectEditors(ui: ReturnType<typeof useUI>) {
  const n = (ids: ID[]) => named("projects", ids, "project");
  const api = {
    /**
     * A new project from anywhere (⌥N): its name (the outcome, verb first); what done looks like (Enter skips); its area
     * (or none); then its first next action, as GTD asks of every project. Esc at the last step keeps the project without
     * one (it then shows as stalled).
     */
    create() {
      ui.openPicker({
        type: "text",
        title: "New project",
        current: "",
        placeholder: "The outcome, verb first",
        onPick: (v) => {
          const title = (v ?? "").trim();
          if (!title) return;
          // Natural planning (GTD): after its name, what done looks like (Enter with nothing skips it), then its area.
          window.setTimeout(
            () =>
              ui.openPicker({
                type: "text",
                title: `What does done look like for “${title}”?`,
                current: "",
                placeholder: "What will be true when it's done (Enter skips)",
                onPick: (done) => window.setTimeout(() => askArea(title, (done ?? "").trim()), 0),
              }),
            0,
          );
        },
      });
      const askArea = (title: string, outcome: string) => {
        const make = (area_id: ID | null, extra: Op[] = []) => {
          const p = newProject({ title, area_id, outcome });
          mutate(`New project “${title}”`, [...extra, { type: "create", table: "projects", row: { ...p } }]);
          // Next tick, so the area picker has closed before the next-action prompt opens.
          window.setTimeout(() => api.addNextAction(p.id), 0);
        };
        if (!getState().areas.length) return make(null);
        ui.openPicker({
          type: "list",
          title: `Area for “${title}”`,
          items: areaItems(),
          current: null,
          noneLabel: "No area",
          createLabel: (q) => `Create area “${q}”`,
          onCreate: (q) => {
            const { id, op } = createAreaOp(q);
            make(id, [op]);
          },
          onPick: (id) => make(id),
        });
      };
    },
    /** Give a project something it waits on: what, then who or what (required, as everywhere in Waiting For). */
    addWaiting(projectId: ID) {
      const p = getState().projects.find((x) => x.id === projectId);
      if (!p) return;
      const name = p.title || "Untitled project";
      ui.openPicker({
        type: "text",
        title: `Waiting for, in “${name}”`,
        current: "",
        placeholder: "What are you waiting for?",
        onPick: (v) => {
          const title = (v ?? "").trim();
          if (!title) return;
          window.setTimeout(
            () =>
              askWaitingOn(
                ui,
                null,
                (who) => {
                  const a = newAction({ title, project_id: projectId, status: "waiting", waiting_who: who, waiting_since: today() });
                  mutate(`Waiting on ${who} added to “${name}”`, [{ type: "create", table: "actions", row: { ...a } }]);
                },
                `Waiting on, for “${title}”`,
              ),
            0,
          );
        },
      });
    },
    /** Give a project a next action: what to do, then where (a context is required, as in Clarify). */
    addNextAction(projectId: ID, added?: (actionId: ID) => void) {
      const p = getState().projects.find((x) => x.id === projectId);
      if (!p) return;
      const name = p.title || "Untitled project";
      ui.openPicker({
        type: "text",
        title: `Next action for “${name}”`,
        current: "",
        placeholder: "Describe the next action",
        onPick: (v) => {
          const title = (v ?? "").trim();
          if (!title) return;
          askContext(ui, `Context for “${title}”`, (context_id, extra) => {
            const a = newAction({ title, project_id: projectId, context_id, status: "next" });
            mutate(`Next action added to “${name}”`, [...extra, { type: "create", table: "actions", row: { ...a } }]);
            added?.(a.id);
          });
        },
      });
    },
    area(ids: ID[]) {
      if (!ids.length) return;
      const one = ids.length === 1 ? getState().projects.find((p) => p.id === ids[0]) : undefined;
      ui.openPicker({
        type: "list",
        title: "Area of focus",
        items: areaItems(),
        current: one?.area_id ?? null,
        noneLabel: "No area",
        createLabel: (q) => `Create area “${q}”`,
        onCreate: (q) => {
          const { id, op } = createAreaOp(q);
          mutate(`${n(ids)} → ${q}`, [op, ...ids.map((p) => ({ type: "patch" as const, table: "projects" as const, id: p, data: { area_id: id } }))]);
        },
        onPick: (id) => patchMany("projects", ids, { area_id: id }, `${n(ids)} → ${areaName(getState().areas.find((a) => a.id === id)?.name) ?? "no area"}`),
      });
    },
    date(ids: ID[], field: "due" | "start" | "bring_back") {
      if (!ids.length) return;
      const title = { due: "Project due date", start: "Project starts on", bring_back: "Bring back to the Inbox on" }[field];
      const what = { due: "due", start: "starts", bring_back: "bring back" }[field];
      ui.openPicker({
        type: "date",
        title,
        current: ids.length === 1 ? (getState().projects.find((p) => p.id === ids[0])?.[field] ?? null) : null,
        onPick: (d) => {
          patchMany("projects", ids, { [field]: d }, d ? `${n(ids)}: ${what} ${formatLong(d)}` : `${n(ids)}: date cleared`);
          // A project that won't begin for a while belongs on Someday/Maybe or in the tickler (GTD): offer that, once.
          const active = getState().projects.filter((p) => ids.includes(p.id) && p.status === "active").map((p) => p.id);
          if (field === "start" && d && d > today() && active.length)
            window.setTimeout(
              () =>
                ui.openPicker({
                  type: "list",
                  title: `Starts ${formatLong(d)}. Until then?`,
                  items: [
                    { id: "keep", label: "Keep it active, not started yet", hint: "Shown with a clock" },
                    { id: "someday", label: "On Someday until then", hint: `Comes back ${formatLong(d)}` },
                  ],
                  onPick: (id) =>
                    id === "someday" &&
                    patchMany("projects", active, { status: "someday", bring_back: d }, `${n(active)} on Someday/Maybe until ${formatLong(d)}, then back to decide`),
                }),
              0,
            );
        },
      });
    },
    move(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "list",
        title: "Move project to",
        items: [
          { id: "active", label: "Active projects" },
          { id: "someday", label: "Someday / Maybe" },
          ...getState()
            .projects.filter((p) => !ids.includes(p.id) && (p.status === "active" || p.status === "someday"))
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((p) => ({ id: `merge:${p.id}`, label: `Merge into “${p.title || "Untitled project"}”`, hint: "Merge" })),
        ],
        onPick: (st) => {
          if (!st) return;
          if (st.startsWith("merge:")) api.merge(ids, st.slice(6));
          else patchMany("projects", ids, { status: st }, `${n(ids)} → ${st === "active" ? "Active" : "Someday / Maybe"}`);
        },
      });
    },
    /** Move actions, reference notes and files into the target, keep the notes, then trash the source. */
    merge(ids: ID[], targetId: ID) {
      const s = getState();
      const target = s.projects.find((p) => p.id === targetId);
      if (!target) return;
      const ops: Op[] = [];
      let notes = target.notes;
      for (const id of ids) {
        const src = s.projects.find((p) => p.id === id);
        if (!src || id === targetId) continue;
        s.actions.filter((a) => a.project_id === id).forEach((a) => ops.push({ type: "patch", table: "actions", id: a.id, data: { project_id: targetId } }));
        s.refs.filter((r) => r.project_id === id).forEach((r) => ops.push({ type: "patch", table: "refs", id: r.id, data: { project_id: targetId } }));
        s.files.filter((f) => f.owner_kind === "project" && f.owner_id === id).forEach((f) => ops.push({ type: "patch", table: "files", id: f.id, data: { owner_id: targetId } }));
        if (src.notes.trim()) notes = [notes, `From “${src.title}”:\n${src.notes}`].filter((x) => x.trim()).join("\n\n");
        ops.push({ type: "patch", table: "projects", id, data: { status: "trashed" } });
      }
      ops.push({ type: "patch", table: "projects", id: targetId, data: { notes, area_id: target.area_id ?? s.projects.find((p) => ids.includes(p.id))?.area_id ?? null } });
      mutate(`${n(ids)} merged into “${target.title}”`, ops);
    },
    complete(ids: ID[]) {
      if (!ids.length) return;
      const s = getState();
      const ops: Op[] = [];
      const at = stamp();
      let closed = 0;
      for (const id of ids) {
        if (s.projects.find((p) => p.id === id)?.status === "done") continue;
        // The project stays on Projects, struck through, until archived (⇧E), like a done action on its list.
        ops.push({ type: "patch", table: "projects", id, data: { status: "done", completed_at: at, archived_at: null } });
        // A finished project's open actions go straight to Done (archived), not onto the lists struck through.
        // They share the project's completion stamp, so unticking the project brings them back with it.
        for (const a of s.actions.filter((a) => a.project_id === id && ["next", "waiting"].includes(a.status))) {
          ops.push({ type: "patch", table: "actions", id: a.id, data: { status: "done", completed_at: at, done_from: a.status, archived_at: at } });
          closed++;
        }
      }
      // Say what went with it (owner's request): its next actions and waiting fors are done too, and now in Done.
      if (ops.length) mutate(`${n(ids)} complete${closed ? ` · ${plural(closed, "open action")} done with it` : ""}`, ops);
    },
    /** Not done after all: active again, with the actions that were closed along with it. */
    reopen(ids: ID[]) {
      const s = getState();
      const ops: Op[] = [];
      for (const p of s.projects.filter((p) => ids.includes(p.id) && p.status === "done")) {
        ops.push({ type: "patch", table: "projects", id: p.id, data: { status: "active", completed_at: null, archived_at: null } });
        for (const a of s.actions.filter((a) => a.project_id === p.id && a.status === "done" && p.completed_at && a.completed_at === p.completed_at && a.archived_at === p.completed_at)) {
          ops.push({ type: "patch", table: "actions", id: a.id, data: { status: a.done_from && a.done_from !== "inbox" ? a.done_from : "next", completed_at: null, done_from: null, archived_at: null } });
        }
      }
      if (ops.length) mutate(`${n(ids)} not done`, ops);
    },
    /** Moves completed projects off the Projects list (they stay under "Show someday and completed"). */
    archive(ids: ID[]) {
      const done = getState().projects.filter((p) => ids.includes(p.id) && p.status === "done" && !p.archived_at);
      if (!done.length) return;
      const at = stamp();
      mutate(`${plural(done.length, "completed project")} archived`, done.map((p) => ({ type: "patch" as const, table: "projects" as const, id: p.id, data: { archived_at: at } })));
    },
    trash(ids: ID[], permanent: boolean) {
      if (!ids.length) return;
      const s = getState();
      const ops: Op[] = [];
      for (const id of ids) {
        ops.push(permanent ? { type: "delete", table: "projects", id } : { type: "patch", table: "projects", id, data: { status: "trashed" } });
        for (const a of s.actions.filter((a) => a.project_id === id && a.status !== "done")) {
          ops.push({ type: "patch", table: "actions", id: a.id, data: { status: "trashed" } });
        }
      }
      mutate(permanent ? `${n(ids)} deleted permanently` : `${n(ids)} and their actions trashed`, ops);
    },
  };
  return api;
}

/** A linked appointment as the project's next step: "Workshop with Nordplast · today 09:30". */
const apptLine = (x: Appointment) => `${x.title} · ${x.date === today() ? "today" : formatLong(x.date)}${x.time ? ` ${x.time}` : ""}`;

export function ProjectsView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [groupByArea, setGroupByArea] = usePersisted("projects:byArea", true);
  const [filter, setFilter] = usePersisted<Filter>("projects:filter", "active");
  const [editing, setEditing] = useState<ID | null>(null);
  const ed = projectEditors(ui);
  // F narrows the list to one or more areas of focus; the rest step aside until the filter is cleared.
  const areas = useAreaFilter();

  // Completed projects stay on the list, struck through at the bottom of their area, until archived (⇧E), as on every list.
  const [showDone, setShowDone] = usePersisted("showdone:projects", true);
  const doneHere = useMemo(() => s.projects.filter((p) => p.status === "done" && !p.archived_at).map((p) => p.id), [s.projects]);
  const [striking, setStriking] = useState<Set<ID>>(new Set());
  const rows = useMemo(
    () =>
      s.projects
        .filter((p) => (filter === "active" ? p.status === "active" || (showDone && p.status === "done" && !p.archived_at) : p.status !== "trashed"))
        .filter((p) => !areas || inAreas(p.area_id, areas))
        .sort((a, b) => a.sort - b.sort),
    [s.projects, filter, showDone, areas],
  );
  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    s.actions.forEach((a) => a.project_id && ["next", "waiting"].includes(a.status) && m.set(a.project_id, (m.get(a.project_id) ?? 0) + 1));
    return m;
  }, [s.actions]);
  const firstNext = useMemo(() => {
    const m = new Map<string, string>();
    const sorted = [...s.actions].sort((a, b) => a.sort - b.sort);
    sorted.forEach((a) => {
      if (a.project_id && a.status === "next" && !m.has(a.project_id)) m.set(a.project_id, a.title);
    });
    // A project that is only waiting shows who it waits on: that explains its amber lamp.
    sorted.forEach((a) => {
      if (a.project_id && a.status === "waiting" && !m.has(a.project_id)) m.set(a.project_id, `Waiting · ${a.waiting_who ?? "someone"}`);
    });
    return m;
  }, [s.actions]);
  const areaById = useMemo(() => new Map(s.areas.map((a) => [a.id, a])), [s.areas]);

  const [sort, setSort] = useSort("projects");
  const sorters: Sorters<Project> = useMemo(
    () => ({
      // Status, one group per lamp, what needs you first: stalled, on track, waiting, then everything with the clock
      // (starting today or later, soonest first), someday, completed (owner's decision: the clocks sort together).
      mark: (p) => {
        const h = projectHealth(s, p);
        const rank = { stalled: 0, ok: 1, waiting: 2, scheduled: 3, someday: 4, done: 5 }[h];
        return `${rank}|${h === "scheduled" ? p.start ?? "" : ""}`;
      },
      subject: (p) => p.title,
      area: (p) => (p.area_id ? areaById.get(p.area_id)?.name : undefined),
      next: (p) => firstNext.get(p.id),
      open: (p) => openCount.get(p.id) ?? 0,
      due: (p) => p.due,
      start: (p) => p.start,
      back: (p) => p.bring_back,
      created: (p) => p.created_at,
    }),
    [areaById, firstNext, openCount, s],
  );
  const baseGroups: GridGroup<Project>[] = useMemo(() => {
    if (!groupByArea) return [{ key: "all", label: "", rows }];
    const byArea = new Map<string, Project[]>();
    for (const p of rows) byArea.set(p.area_id ?? "none", [...(byArea.get(p.area_id ?? "none") ?? []), p]);
    return [...byArea.entries()]
      .sort((a, b) => (areaById.get(a[0])?.sort ?? 999) - (areaById.get(b[0])?.sort ?? 999))
      .map(([k, r]) => ({ key: k, label: areaName(areaById.get(k)?.name) ?? "No area", areaColor: areaById.get(k) ? (areaById.get(k)!.color ?? "") : undefined, rows: r }));
  }, [rows, groupByArea, areaById]);
  // Areas keep their order; a heading click sorts the projects inside each one.
  const groups = useMemo(
    () => sortGroups(baseGroups, sorters, sort).map((g) => ({ ...g, rows: [...g.rows.filter((p) => p.status !== "done"), ...g.rows.filter((p) => p.status === "done")] })),
    [baseGroups, sorters, sort],
  );

  const multi = groupByArea && groups.length > 0 && !(groups.length === 1 && groups[0].key === "all");
  const nav = useListNav(
    "projects",
    useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.id), showHeader: multi })), [groups, multi]),
  );
  const focusId = nav.focus && !isGroupKey(nav.focus) ? nav.focus : null;
  const has = Boolean(focusId) || nav.selected.size > 0;

  // An open (or pinned) detail pane follows the cursor and shows the project's actions.
  useEffect(() => {
    ui.followDetail(focusId ? { kind: "project", id: focusId } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  useEffect(() => {
    if (ui.revealTarget?.kind === "project") {
      const g = groups.find((x) => x.rows.some((r) => r.id === ui.revealTarget!.id));
      if (g) nav.toggleGroup(g.key, true);
      nav.setFocus(ui.revealTarget.id);
      ui.clearReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget]);

  /** E and the Complete box: complete (the pen strikes first), or untick when everything in hand is already done. */
  const toggleDone = (ids: ID[]) => {
    const ps = s.projects.filter((p) => ids.includes(p.id));
    if (!ps.length) return;
    if (ps.every((p) => p.status === "done")) return ed.reopen(ids);
    const open = ps.filter((p) => p.status !== "done").map((p) => p.id);
    // The cursor stays in place, on the next open row, rather than following a done row to the bottom.
    if (focusId && open.includes(focusId)) {
      const flat = groups.flatMap((g) => g.rows);
      const i = flat.findIndex((p) => p.id === focusId);
      const isOpen = (p: Project) => p.status !== "done" && !open.includes(p.id);
      const next = flat.slice(i + 1).find(isOpen) ?? [...flat.slice(0, i)].reverse().find(isOpen);
      if (next) nav.setFocus(next.id);
    }
    setStriking((prev) => new Set([...prev, ...open]));
    window.setTimeout(() => {
      ed.complete(open);
      setStriking((prev) => new Set([...prev].filter((id) => !open.includes(id))));
    }, 280);
  };

  const create = () => {
    let area: string | null = null;
    if (nav.focus && groupByArea) {
      const g = isGroupKey(nav.focus) ? nav.focus.slice(6) : groups.find((x) => x.rows.some((r) => r.id === nav.focus))?.key;
      if (g && areaById.has(g)) area = g;
    }
    // Narrowed to areas, a new project takes the first of them, so it doesn't vanish as it is named.
    if (!area && areas && !areas.includes("none")) area = areas[0];
    const p = newProject({ area_id: area });
    mutate("New project", [{ type: "create", table: "projects", row: { ...p } }], { silent: true });
    nav.setFocus(p.id);
    setEditing(p.id);
  };

  // ⌥↑/⌥↓ moves the whole selection one place within its area; completed projects stay put at the bottom.
  const reorder = (dir: -1 | 1) => {
    const moved = stepRows(groups, (p) => p.id, (p) => p.sort, (p) => p.status !== "done", nav.targets(), dir);
    if (!moved) return;
    mutate(sort ? "Moved · now in manual order" : "Reordered", [...moved].map(([id, at]) => ({ type: "patch" as const, table: "projects" as const, id, data: { sort: at } })), { silent: !sort });
    if (sort) setSort(null);
  };

  const commands: Command[] = [
    ...nav.commands,
    { id: "proj.addnext", label: "Add a next action to the project", group: "Projects", keys: ["t"], enabled: Boolean(focusId), run: () => focusId && ed.addNextAction(focusId) },
    { id: "proj.addwaiting", label: "Add a waiting for to the project", group: "Projects", keys: ["w"], enabled: Boolean(focusId), run: () => focusId && ed.addWaiting(focusId) },
    { id: "proj.new", label: "New project", group: "Projects", keys: ["n"], run: create },
    { id: "proj.open", label: "Open project", group: "Projects", keys: ["enter"], enabled: Boolean(focusId), run: () => focusId && ui.openDetail({ kind: "project", id: focusId }, true) },
    { id: "proj.jump", label: "Jump to its next action (or back to the appointment, reference or checklist you came from)", group: "Projects", keys: ["j"], enabled: Boolean(focusId), run: () => focusId && ui.jumpToAction(focusId) },
    { id: "proj.rename", label: "Rename", group: "Projects", keys: ["f2"], enabled: Boolean(focusId), run: () => focusId && setEditing(focusId) },
    { id: "proj.done", label: "Complete project, or not done", group: "Projects", keys: ["e"], enabled: has, run: () => toggleDone(nav.targets()) },
    { id: "proj.archive", label: `Archive completed projects${doneHere.length ? ` (${doneHere.length})` : ""}`, group: "Projects", enabled: doneHere.length > 0, run: () => ed.archive(doneHere) },
    { id: "proj.showdone", label: showDone ? "Hide completed projects" : "Show completed projects", group: "View", run: () => setShowDone(!showDone) },
    { id: "proj.area", label: "Set area", group: "Fields", keys: ["a"], enabled: has, run: () => ed.area(nav.targets()) },
    { id: "proj.goal", label: "Set the goal it serves", group: "Fields", keys: ["g"], enabled: has, run: () => pickGoal(ui, nav.targets()) },
    { id: "proj.due", label: "Due date", group: "Fields", keys: ["d"], enabled: has, run: () => ed.date(nav.targets(), "due") },
    { id: "proj.start", label: "Start date", group: "Fields", keys: ["s"], enabled: has, run: () => ed.date(nav.targets(), "start") },
    { id: "proj.back", label: "Bring back on (tickler)", group: "Fields", keys: ["b"], enabled: has, run: () => ed.date(nav.targets(), "bring_back") },
    { id: "proj.move", label: "Move to Someday / Active, or merge into another project", group: "Projects", keys: ["v"], enabled: has, run: () => ed.move(nav.targets()) },
    { id: "proj.trash", label: "Trash project", group: "Projects", keys: ["backspace", "delete"], enabled: has, run: () => ed.trash(nav.targets(), false) },
    { id: "proj.delete", label: "Delete permanently", group: "Projects", keys: ["shift+backspace", "shift+delete"], enabled: has, run: () => ed.trash(nav.targets(), true) },
    { id: "proj.up", label: "Move row up", group: "Projects", keys: ["alt+arrowup"], enabled: Boolean(focusId), run: () => reorder(-1) },
    { id: "proj.down", label: "Move row down", group: "Projects", keys: ["alt+arrowdown"], enabled: Boolean(focusId), run: () => reorder(1) },
    {
      id: "proj.view",
      label: "View: group and filter",
      group: "View",
      keys: ["alt+v"],
      run: () =>
        ui.openPicker({
          type: "list",
          title: "View",
          items: [
            { id: "area", label: groupByArea ? "Don't group by area" : "Group by area", section: "group" },
            { id: "s:mark", label: "Sort by status", hint: sort?.key === "mark" ? "Current" : "", section: "sort" },
            { id: "s:due", label: "Sort by due date", hint: sort?.key === "due" ? "Current" : "", section: "sort" },
            { id: "s:", label: "Manual order", hint: !sort ? "Current" : "", section: "sort" },
            { id: "areas", label: areas ? `Areas: ${areaFilterLabel(areas)}` : "Filter by area…", hint: areas ? "On" : "", section: "show" },
            { id: "filter", label: filter === "active" ? "Show someday and archived projects" : "Show active projects only", section: "show" },
            ...(filter === "active" ? [{ id: "showdone", label: showDone ? `Hide completed projects${doneHere.length ? ` (${doneHere.length})` : ""}` : `Show completed projects${doneHere.length ? ` (${doneHere.length})` : ""}`, section: "done" }] : []),
            ...(doneHere.length ? [{ id: "archive", label: `Archive completed projects (${doneHere.length})`, section: "done" }] : []),
          ],
          onPick: (id) => {
            if (id === "showdone") setShowDone(!showDone);
            if (id === "archive") ed.archive(doneHere);
            if (id === "area") setGroupByArea(!groupByArea);
            if (id?.startsWith("s:")) setSort(id === "s:" ? null : { key: id.slice(2), dir: 1 });
            if (id === "filter") setFilter(filter === "active" ? "all" : "active");
            if (id === "areas") window.setTimeout(() => openAreaFilter(ui));
          },
        }),
    },
    { id: "proj.areas", label: areas ? "Filter by area (change or clear)" : "Filter by area: show only some areas", group: "View", keys: ["f"], run: () => openAreaFilter(ui) },
    ...(areas ? [{ id: "proj.areasoff", label: "Show every area", group: "View", run: () => setAreaFilter([]) }] : []),
  ];
  useCommands("list:projects", commands, { priority: 10, active: regionActive });

  const columns: Column<Project>[] = [
    {
      key: "mark",
      label: "",
      width: "30px",
      // The lamp column sorts by status from its heading: a small ring stands for it.
      sortName: "Status",
      headIcon: <span className="gh-lamp" aria-hidden="true" />,
      render: (p) => <Lamp health={projectHealth(s, p)} start={p.start} appt={nextAppointment(s, p)} />,
    },
    {
      key: "done",
      label: "",
      width: "26px",
      render: (p) => <DoneBox done={p.status === "done" || striking.has(p.id)} title={p.title || "Untitled project"} onToggle={() => !striking.has(p.id) && toggleDone([p.id])} />,
    },
    {
      key: "subject",
      label: "Project",
      width: "minmax(200px, 1.1fr)",
      render: (p) =>
        editing === p.id ? (
          <InlineEdit
            value={p.title}
            placeholder="Name the project"
            onDone={(v) => {
              setEditing(null);
              if (!v.trim() && !p.title) mutate("Discarded empty project", [{ type: "delete", table: "projects", id: p.id }], { silent: true });
              else if (v.trim() !== p.title) mutate("Renamed", [{ type: "patch", table: "projects", id: p.id, data: { title: v.trim() } }]);
            }}
          />
        ) : (
          <span className="subject">
            <span className="subject-text strong">{p.title || "Untitled project"}</span>
            {p.status === "someday" && <span className="badge muted">Someday</span>}
            {p.status === "done" && p.archived_at && <span className="badge muted">Done</span>}
          </span>
        ),
    },
    {
      key: "goal",
      label: "Goal",
      width: "minmax(110px, 0.8fr)",
      drop: 3,
      optional: false,
      // Only projects serving a goal name one; the column steps aside until one does.
      blank: (p: Project) => !s.horizons.some((h) => h.id === p.goal_id && h.status !== "trashed"),
      render: (p: Project) => {
        const g = s.horizons.find((h) => h.id === p.goal_id && h.status !== "trashed");
        return g ? <span className="proj-cell">{g.title || "Untitled goal"}</span> : <span className="dash" aria-hidden="true">–</span>;
      },
    },
    ...(groupByArea ? [] : [{ key: "area", label: "Area", width: "110px", drop: 2, render: (p: Project) => (p.area_id ? <AreaName name={areaById.get(p.area_id)?.name ?? ""} color={areaById.get(p.area_id)?.color} /> : <span className="dash" aria-hidden="true">–</span>) }]),
    {
      key: "next",
      label: "Next action",
      width: "minmax(160px, 1fr)",
      drop: 3,
      // A project that hasn't begun says when it does instead of an empty cell; on its start day, without a next
      // action, it asks for one.
      render: (p) =>
        firstNext.get(p.id) ? (
          <span className="muted-text">{firstNext.get(p.id)}</span>
        ) : notStarted(p) ? (
          <span className="muted-text">Starts {formatLong(p.start!)}</span>
        ) : nextAppointment(s, p) ? (
          // With no next action, a linked appointment is the next step: what, and when.
          <span className="muted-text">{apptLine(nextAppointment(s, p)!)}</span>
        ) : startsToday(p) && p.status === "active" ? (
          <span className="starts-today">Starts today · add a next action</span>
        ) : (
          <span className="dash" aria-hidden="true">–</span>
        ),
    },
    { key: "open", label: "Open", width: "52px", align: "end", drop: 1, render: (p) => <span className="num">{openCount.get(p.id) ?? 0}</span> },
    { key: "due", label: "Due", width: "84px", render: (p) => <DateCell date={p.due} /> },
    // Offered but hidden until shown (right-click a heading, or ⌘K › Show or hide columns…).
    { key: "start", label: "Start", width: "84px", optional: true, render: (p) => <DateCell date={p.start ?? null} kind="plain" /> },
    { key: "back", label: "Bring back", width: "96px", optional: true, render: (p) => <DateCell date={p.bring_back} kind="plain" /> },
    { key: "created", label: "Created", width: "84px", optional: true, render: (p) => <DateCell date={p.created_at.slice(0, 10)} kind="plain" /> },
  ];

  const grid = (
    <Grid
      listId="projects"
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      reorder={{
        // Projects always drag; dropped into another area, the project moves there. In a column sort the drop
        // switches the list to its manual order, keeping everything where it was on screen.
        // Completed projects stay put at the bottom of their area.
        canDrag: (k: string) => s.projects.find((p) => p.id === k)?.status !== "done",
        onMove: (keys, beforeKey, groupKey) => {
          const g = groups.find((x) => x.key === groupKey);
          const movers = keys.map((k) => s.projects.find((p) => p.id === k)).filter((p): p is Project => Boolean(p));
          if (!g || !movers.length) return;
          // Dropped into another area group, every dragged project moves to that area.
          const homeOf = (id: ID) => groups.find((x) => x.rows.some((p) => p.id === id))?.key;
          const newArea = groupByArea ? (groupKey === "none" ? null : groupKey) : undefined;
          const rest = g.rows.filter((p) => p.status !== "done" && !keys.includes(p.id));
          const i = beforeKey ? rest.findIndex((p) => p.id === beforeKey) : -1;
          const lo = i > 0 ? rest[i - 1].sort : i === 0 ? null : rest.length ? rest[rest.length - 1].sort : null;
          const hi = i >= 0 ? rest[i].sort : null;
          const n = movers.length;
          const sortAt = (j: number) => (lo !== null && hi !== null ? lo + ((hi - lo) * (j + 1)) / (n + 1) : lo !== null ? lo + j + 1 : hi !== null ? hi - (n - j) : movers[j].sort);
          const moves = movers.map((p) => newArea !== undefined && homeOf(p.id) !== groupKey);
          const moved = moves.some(Boolean);
          const who = movers.length === 1 ? `“${movers[0].title || "Untitled project"}”` : plural(movers.length, "project");
          const ops: Op[] = [];
          if (sort) {
            const baked = bakeDrop(groups, (p) => p.id, (p) => p.sort, (p) => p.status !== "done", keys, beforeKey, groupKey);
            for (const [id, at] of baked) {
              const j = movers.findIndex((m) => m.id === id);
              const p = s.projects.find((x) => x.id === id);
              if (j >= 0) ops.push({ type: "patch", table: "projects", id, data: { sort: at, ...(moves[j] ? { area_id: newArea } : {}) } });
              else if (p && p.sort !== at) ops.push({ type: "patch", table: "projects", id, data: { sort: at } });
            }
            setSort(null);
          } else movers.forEach((p, j) => ops.push({ type: "patch", table: "projects", id: p.id, data: { sort: sortAt(j), ...(moves[j] ? { area_id: newArea } : {}) } }));
          const label = moved ? `${who} → ${g.label}` : "Moved";
          mutate(sort ? `${label} · now in manual order` : label, ops, { silent: !moved && !sort });
          nav.setFocus(keys[keys.length - 1]);
        },
      }}
      columns={columns}
      groups={groups}
      getKey={(p) => p.id}
      nav={nav}
      active={regionActive}
      showHeaders={multi}
      rowClass={(p) =>
        [isStalled(s, p) ? "is-stalled" : "", striking.has(p.id) ? `is-striking ${showDone ? "" : "is-leaving"}` : "", p.status === "done" ? "is-done" : ""].join(" ")
      }
      onOpen={(k) => ui.openDetail({ kind: "project", id: k }, true)}
      // Touch: swipe right to complete the project (or reopen it), left to trash it with its actions.
      swipe={{ right: { label: "Done", run: (id) => toggleDone([id]) }, left: { label: "Trash", run: (id) => ed.trash([id], false) } }}
      empty={
        areas ? (
          <EmptyState title={`No projects in ${areaFilterLabel(areas)}`} lines={["Press F to choose other areas, or show every area."]} />
        ) : (
          <EmptyState title="No projects yet" lines={["Start one here, or make one when you clarify your Inbox (⇧P)."]} />
        )
      }
    />
  );
  if (!areas) return grid;
  // While the list is narrowed, a quiet line above it names the areas and how to see everything again (as What fits now).
  return (
    <>
      <div className="fit-bar" role="status">
        <span>
          Showing <strong>{areaFilterLabel(areas)}</strong>
        </span>
        <button type="button" className="text-btn" onClick={() => openAreaFilter(ui)}>
          Change
        </button>
        <button type="button" className="text-btn" onClick={() => setAreaFilter([])}>
          Show all
        </button>
      </div>
      {grid}
    </>
  );
}
