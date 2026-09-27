import { useEffect, useMemo, useState } from "react";
import { getState, isStalled, mutate, named, newProject, patchMany, projectHealth, stamp, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, usePersisted, isGroupKey, type Column, type GridGroup } from "../components/Grid.tsx";
import { DateCell, Lamp, Tape } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { areaItems, createAreaOp } from "../actionCommands.tsx";
import { formatLong } from "../../shared/dates.ts";
import type { ID, Op, Project } from "../../shared/types.ts";

type Filter = "active" | "all";

export function projectEditors(ui: ReturnType<typeof useUI>) {
  const n = (ids: ID[]) => named("projects", ids, "project");
  const api = {
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
        onPick: (id) => patchMany("projects", ids, { area_id: id }, `${n(ids)} → ${getState().areas.find((a) => a.id === id)?.name ?? "no area"}`),
      });
    },
    date(ids: ID[], field: "due" | "bring_back") {
      if (!ids.length) return;
      ui.openPicker({
        type: "date",
        title: field === "due" ? "Project due date" : "Bring back to the Inbox on",
        current: ids.length === 1 ? (getState().projects.find((p) => p.id === ids[0])?.[field] ?? null) : null,
        onPick: (d) => patchMany("projects", ids, { [field]: d }, d ? `${n(ids)}: ${field === "due" ? "due" : "bring back"} ${formatLong(d)}` : `${n(ids)}: date cleared`),
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
      for (const id of ids) {
        ops.push({ type: "patch", table: "projects", id, data: { status: "done", completed_at: stamp() } });
        for (const a of s.actions.filter((a) => a.project_id === id && ["next", "waiting"].includes(a.status))) {
          ops.push({ type: "patch", table: "actions", id: a.id, data: { status: "done", completed_at: stamp() } });
        }
      }
      mutate(`${n(ids)} complete`, ops);
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

export function ProjectsView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [groupByArea, setGroupByArea] = usePersisted("projects:byArea", true);
  const [filter, setFilter] = usePersisted<Filter>("projects:filter", "active");
  const [editing, setEditing] = useState<ID | null>(null);
  const ed = projectEditors(ui);

  const rows = useMemo(
    () =>
      s.projects
        .filter((p) => (filter === "active" ? p.status === "active" : p.status !== "trashed"))
        .sort((a, b) => a.sort - b.sort),
    [s.projects, filter],
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

  const groups: GridGroup<Project>[] = useMemo(() => {
    if (!groupByArea) return [{ key: "all", label: "", rows }];
    const byArea = new Map<string, Project[]>();
    for (const p of rows) byArea.set(p.area_id ?? "none", [...(byArea.get(p.area_id ?? "none") ?? []), p]);
    return [...byArea.entries()]
      .sort((a, b) => (areaById.get(a[0])?.sort ?? 999) - (areaById.get(b[0])?.sort ?? 999))
      .map(([k, r]) => ({ key: k, label: areaById.get(k)?.name ?? "No area", folder: k !== "none", rows: r }));
  }, [rows, groupByArea, areaById]);

  const multi = groupByArea && groups.length > 0 && !(groups.length === 1 && groups[0].key === "all");
  const nav = useListNav("projects", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.id), showHeader: multi })), [groups, multi]));
  const focusId = nav.focus && !isGroupKey(nav.focus) ? nav.focus : null;
  const has = Boolean(focusId) || nav.selected.size > 0;

  useEffect(() => {
    if (focusId && ui.detail?.kind === "project" && ui.detail.id !== focusId) ui.openDetail({ kind: "project", id: focusId });
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

  const create = () => {
    let area: string | null = null;
    if (nav.focus && groupByArea) {
      const g = isGroupKey(nav.focus) ? nav.focus.slice(6) : groups.find((x) => x.rows.some((r) => r.id === nav.focus))?.key;
      if (g && areaById.has(g)) area = g;
    }
    const p = newProject({ area_id: area });
    mutate("New project", [{ type: "create", table: "projects", row: { ...p } }], { silent: true });
    nav.setFocus(p.id);
    setEditing(p.id);
  };

  const reorder = (dir: -1 | 1) => {
    if (!focusId) return;
    const g = groups.find((x) => x.rows.some((r) => r.id === focusId));
    if (!g) return;
    const i = g.rows.findIndex((r) => r.id === focusId);
    const other = g.rows[i + dir];
    const me = g.rows[i];
    if (!other) return;
    mutate("Reordered", [
      { type: "patch", table: "projects", id: me.id, data: { sort: other.sort } },
      { type: "patch", table: "projects", id: other.id, data: { sort: me.sort } },
    ], { silent: true });
  };

  const commands: Command[] = [
    ...nav.commands,
    { id: "proj.new", label: "New project", group: "Projects", keys: ["n"], run: create },
    { id: "proj.open", label: "Open project", group: "Projects", keys: ["enter"], enabled: Boolean(focusId), run: () => focusId && ui.openDetail({ kind: "project", id: focusId }, true) },
    { id: "proj.jump", label: "Jump to its next action", group: "Projects", keys: ["j"], enabled: Boolean(focusId), run: () => focusId && ui.jumpToAction(focusId) },
    { id: "proj.rename", label: "Rename", group: "Projects", keys: ["f2"], enabled: Boolean(focusId), run: () => focusId && setEditing(focusId) },
    { id: "proj.done", label: "Complete project", group: "Projects", keys: ["e"], enabled: has, run: () => ed.complete(nav.targets()) },
    { id: "proj.area", label: "Set area", group: "Fields", keys: ["a"], enabled: has, run: () => ed.area(nav.targets()) },
    { id: "proj.due", label: "Due date", group: "Fields", keys: ["d"], enabled: has, run: () => ed.date(nav.targets(), "due") },
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
            { id: "filter", label: filter === "active" ? "Show someday and completed projects" : "Show active projects only", section: "show" },
          ],
          onPick: (id) => {
            if (id === "area") setGroupByArea(!groupByArea);
            if (id === "filter") setFilter(filter === "active" ? "all" : "active");
          },
        }),
    },
  ];
  useCommands("list:projects", commands, { priority: 10, active: regionActive });

  const columns: Column<Project>[] = [
    {
      key: "mark",
      label: "",
      width: "30px",
      render: (p) => <Lamp health={projectHealth(s, p)} />,
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
            {isStalled(s, p) && <span className="stamp">Stalled</span>}
            {p.status === "someday" && <span className="stamp muted">Someday</span>}
            {p.status === "done" && <span className="stamp muted">Done</span>}
          </span>
        ),
    },
    ...(groupByArea ? [] : [{ key: "area", label: "Area", width: "110px", drop: 2, render: (p: Project) => (p.area_id ? <Tape>{areaById.get(p.area_id)?.name}</Tape> : <span className="dash" aria-hidden="true">–</span>) }]),
    { key: "next", label: "Next action", width: "minmax(160px, 1fr)", drop: 3, render: (p) => (firstNext.get(p.id) ? <span className="muted-text">{firstNext.get(p.id)}</span> : <span className="dash" aria-hidden="true">–</span>) },
    { key: "open", label: "Open", width: "52px", align: "end", drop: 1, render: (p) => <span className="num">{openCount.get(p.id) ?? 0}</span> },
    { key: "due", label: "Due", width: "84px", render: (p) => <DateCell date={p.due} /> },
  ];

  return (
    <Grid
      listId="projects"
      columns={columns}
      groups={groups}
      getKey={(p) => p.id}
      nav={nav}
      active={regionActive}
      showHeaders={multi}
      rowClass={(p) => (isStalled(s, p) ? "is-stalled" : "")}
      onOpen={(k) => ui.openDetail({ kind: "project", id: k }, true)}
      empty={<EmptyState title="No projects yet" lines={["Start one here, or let Claude propose projects when it clarifies your Inbox."]} />}
    />
  );
}
