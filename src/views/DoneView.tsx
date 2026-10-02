import { useEffect, useMemo } from "react";
import { Circle, Layers } from "lucide-react";
import { LIST_NAMES, quote, mutate, plural, reopenActions, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { setProject } from "../actionCommands.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, usePersisted, useSort, sortGroups, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { projectEditors } from "./ProjectsView.tsx";
import { clockOf, dayHeading, formatDate, localDay } from "../../shared/dates.ts";
import type { ID, Op, State } from "../../shared/types.ts";

type Kind = "action" | "project";
interface Row {
  key: string;
  kind: Kind;
  id: ID;
  title: string;
  /** The list it was done on, and its project; for a project, its area. */
  from: string;
  /** The same without its project, for when the rows are grouped by project. */
  place: string;
  /** Its project (an action) or itself (a project), for grouping by project. */
  project: ID | null;
  at: string;
}


/** Everything archived to Done, newest first: actions and completed projects alike. */
function rowsOf(s: State): Row[] {
  const proj = (id: ID | null) => s.projects.find((p) => p.id === id);
  const out: Row[] = [];
  for (const a of s.actions) {
    if (a.status !== "done" || !a.archived_at) continue;
    const list = LIST_NAMES[a.done_from ?? ""] ?? "Next Actions";
    const p = proj(a.project_id);
    // A waiting item names who it waited on after its list, as the Waiting For list does ("Waiting For · Anna Lind").
    const who = a.done_from === "waiting" ? a.waiting_who?.trim() : "";
    const place = who ? `${list} · ${who}` : list;
    out.push({ key: `a:${a.id}`, kind: "action", id: a.id, title: a.title || "Untitled action", from: p ? `${place} · ${p.title || "Untitled project"}` : place, place, project: a.project_id, at: a.completed_at ?? a.archived_at });
  }
  for (const p of s.projects) {
    // Every completed project: Done is the only place one is shown, archived or not (completed before that rule).
    if (p.status !== "done") continue;
    const area = s.areas.find((x) => x.id === p.area_id);
    out.push({ key: `p:${p.id}`, kind: "project", id: p.id, title: p.title || "Untitled project", from: area ? `Projects · #${area.name}` : "Projects", place: "Projects", project: p.id, at: p.completed_at ?? p.archived_at ?? p.created_at });
  }
  // Newest first; on the same moment a project leads the actions closed along with it.
  return out.sort((a, b) => b.at.localeCompare(a.at) || (a.kind === b.kind ? 0 : a.kind === "project" ? -1 : 1));
}

const clock = clockOf;
const dayLabel = dayHeading;

/**
 * Done: everything archived off its list, newest first, grouped by the day it was done (or by project), as the Trash
 * lists everything deleted. E puts it back as not done; Delete moves it to the Trash.
 */
export function DoneView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const all = useMemo(() => rowsOf(s), [s]);
  const [groupBy, setGroupBy] = usePersisted<"day" | "project">("done:group", "day");

  const [sort, setSort] = useSort("done");
  const sorters: Sorters<Row> = useMemo(() => ({ subject: (r) => r.title, from: (r) => r.from, at: (r) => r.at }), []);
  const groups: GridGroup<Row>[] = useMemo(() => {
    const map = new Map<string, { label: string; rows: Row[] }>();
    for (const r of all) {
      let key: string, label: string;
      if (groupBy === "project") {
        const p = r.project ? s.projects.find((x) => x.id === r.project) : undefined;
        key = p?.id ?? "none";
        label = p ? p.title || "Untitled project" : "No project";
      } else {
        key = localDay(r.at);
        label = dayLabel(key);
      }
      const g = map.get(key) ?? { label, rows: [] };
      g.rows.push(r);
      map.set(key, g);
    }
    let out = [...map.entries()].map(([key, g]) => ({ key, label: g.label, rows: g.rows }));
    // By project, the project that finished most recently comes first; loose actions go last.
    if (groupBy === "project") out = [...out.filter((g) => g.key !== "none"), ...out.filter((g) => g.key === "none")];
    return sortGroups(out, sorters, sort);
  }, [all, groupBy, s.projects, sorters, sort]);
  const multi = groups.length > 0;
  const nav = useListNav("done", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: multi })), [groups, multi]));
  const focus = all.find((r) => r.key === nav.focus);
  const targets = () => nav.targets().map((k) => all.find((r) => r.key === k)).filter((r): r is Row => Boolean(r));

  useEffect(() => {
    ui.followDetail(focus ? { kind: focus.kind, id: focus.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  // Opened from elsewhere (search, a project's timeline): land on the row.
  useEffect(() => {
    const t = ui.revealTarget;
    if (!t || (t.kind !== "action" && t.kind !== "project")) return;
    const key = `${t.kind === "action" ? "a" : "p"}:${t.id}`;
    const g = groups.find((x) => x.rows.some((r) => r.key === key));
    if (!g) return;
    nav.toggleGroup(g.key, true);
    nav.setFocus(key);
    ui.clearReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget, all]);

  // Not done after all: an action goes back to the list it was done on, a project back to Projects (with the
  // actions that were closed along with it).
  const reopen = (rows: Row[]) => {
    const acts = rows.filter((r) => r.kind === "action").map((r) => r.id);
    const projs = rows.filter((r) => r.kind === "project").map((r) => r.id);
    if (projs.length) projectEditors(ui).reopen(projs);
    if (acts.length) reopenActions(acts);
  };
  const name = (rows: Row[]) => (rows.length === 1 ? `“${rows[0].title || "Untitled"}”` : plural(rows.length, "item"));
  const trash = (rows: Row[], permanent = false) => {
    if (!rows.length) return;
    const table = (r: Row) => (r.kind === "project" ? ("projects" as const) : ("actions" as const));
    const ops: Op[] = rows.map((r): Op => (permanent ? { type: "delete", table: table(r), id: r.id } : { type: "patch", table: table(r), id: r.id, data: { status: "trashed" } }));
    mutate(`${name(rows)} ${permanent ? "deleted permanently" : "trashed"}`, ops);
  };
  /** F2, as on every list: a done item can still be reworded (in a picker, the list being read-only otherwise). */
  const rename = (r: Row) =>
    ui.openPicker({
      type: "text",
      title: "Rename",
      current: r.title,
      onPick: (v) => {
        const title = (v ?? "").trim();
        if (title && title !== r.title) mutate(`Renamed ${quote(title)}`, [{ type: "patch", table: r.kind === "project" ? "projects" : "actions", id: r.id, data: { title } }]);
      },
    });

  const openViewMenu = () =>
    ui.openPicker({
      type: "list",
      title: "View",
      items: [
        { id: "day", label: "Group by day", hint: groupBy === "day" ? "Current" : "", section: "group" },
        { id: "project", label: "Group by project", hint: groupBy === "project" ? "Current" : "", section: "group" },
        { id: "s:", label: "Sort by when done", hint: !sort ? "Current" : "", section: "sort" },
        { id: "s:subject", label: "Sort by subject", hint: sort?.key === "subject" ? "Current" : "", section: "sort" },
        { id: "s:from", label: "Sort by where it was", hint: sort?.key === "from" ? "Current" : "", section: "sort" },
      ],
      onPick: (id) => {
        if (id === "day" || id === "project") setGroupBy(id);
        if (id?.startsWith("s:")) setSort(id === "s:" ? null : { key: id.slice(2), dir: 1 });
      },
    });

  const commands: Command[] = [
    ...nav.commands,
    { id: "done.reopen", row: true, label: "Mark not done", group: "Done", keys: ["e"], enabled: Boolean(focus), run: () => reopen(targets()) },
    { id: "done.open", row: true, label: "Open details", group: "Done", keys: ["enter"], enabled: Boolean(focus), run: () => focus && ui.openDetail({ kind: focus.kind, id: focus.id }, true) },
    // P and J as on every list (for done actions; a done project has no project of its own).
    { id: "done.project", row: true, label: "Set project", group: "Fields", keys: ["p"], enabled: targets().some((r) => r.kind === "action"), run: () => setProject(ui, "actions", targets().filter((r) => r.kind === "action").map((r) => r.id)) },
    { id: "done.jump", row: true, label: "Jump to its project", group: "Done", keys: ["j"], enabled: focus?.kind === "action", run: () => focus?.kind === "action" && ui.jumpToProject(focus.id) },
    { id: "done.rename", row: true, label: "Rename", group: "Done", keys: ["f2"], enabled: Boolean(focus), run: () => focus && rename(focus) },
    { id: "done.trash", row: true, label: "Trash", group: "Done", keys: ["backspace", "delete"], enabled: Boolean(focus), run: () => trash(targets()) },
    { id: "done.delete", row: true, label: "Delete permanently", group: "Done", keys: ["shift+backspace", "shift+delete"], enabled: Boolean(focus), run: () => trash(targets(), true) },
    { id: "done.view", label: "Open the View menu", group: "View", keys: ["alt+v"], run: openViewMenu },
  ];
  useCommands("list:done", commands, { priority: 10, active: regionActive });

  const columns: Column<Row>[] = [
    {
      key: "kind",
      label: "",
      width: "30px",
      render: (r) => <span className="kind-icon">{r.kind === "project" ? <Layers size={14} strokeWidth={1.75} aria-label="Project" /> : <Circle size={12} strokeWidth={1.75} aria-label="Action" />}</span>,
    },
    { key: "subject", label: "Item", width: "minmax(220px, 1.3fr)", render: (r) => <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title}</span> },
    { key: "from", label: "Was in", width: "minmax(140px, 1fr)", drop: 2, render: (r) => <span className="muted-text">{groupBy === "project" ? r.place : r.from}</span> },
    {
      key: "at",
      label: "Done",
      width: "96px",
      align: "end",
      drop: 1,
      // Grouped by day the heading has the date, so the row gives the time; by project, the date.
      render: (r) => <span className="date">{groupBy === "day" ? clock(r.at) : formatDate(localDay(r.at))}</span>,
    },
  ];

  return (
    <Grid
      listId="done"
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      columns={columns}
      groups={groups}
      getKey={(r) => r.key}
      nav={nav}
      active={regionActive}
      showHeaders={multi}
      swipe={{ right: { label: "Not done", run: (k) => reopen(all.filter((r) => r.key === k)) } }}
      onOpen={(k) => {
        const r = all.find((x) => x.key === k);
        if (r) ui.openDetail({ kind: r.kind, id: r.id }, true);
      }}
      empty={<EmptyState title="Nothing done yet" lines={["Finished actions and completed projects are logged here by day once they are archived from their list."]} />}
    />
  );
}
