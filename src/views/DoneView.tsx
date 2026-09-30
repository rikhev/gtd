import { useEffect, useMemo } from "react";
import { Circle, Layers } from "lucide-react";
import { mutate, plural, reopenActions, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, usePersisted, useSort, sortGroups, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { projectEditors } from "./ProjectsView.tsx";
import { daysBetween, formatDate, formatLong, today } from "../../shared/dates.ts";
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

const LIST_NAMES: Record<string, string> = { next: "Next Actions", waiting: "Waiting For", someday: "Someday / Maybe", inbox: "Inbox" };

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
    if (p.status !== "done" || !p.archived_at) continue;
    const area = s.areas.find((x) => x.id === p.area_id);
    out.push({ key: `p:${p.id}`, kind: "project", id: p.id, title: p.title || "Untitled project", from: area ? `Projects · #${area.name}` : "Projects", place: "Projects", project: p.id, at: p.completed_at ?? p.archived_at });
  }
  // Newest first; on the same moment a project leads the actions closed along with it.
  return out.sort((a, b) => b.at.localeCompare(a.at) || (a.kind === b.kind ? 0 : a.kind === "project" ? -1 : 1));
}

const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** One date style for every day: the full date, with "Today" or "Yesterday" in front when it applies. */
function dayLabel(d: string) {
  if (!d) return "Undated";
  return Math.abs(daysBetween(today(), d)) <= 1 ? `${formatDate(d)} · ${formatLong(d)}` : formatLong(d);
}

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
        key = r.at.slice(0, 10);
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
  const trash = (rows: Row[]) => {
    if (!rows.length) return;
    const ops: Op[] = rows.map((r) => ({ type: "patch" as const, table: r.kind === "project" ? ("projects" as const) : ("actions" as const), id: r.id, data: { status: "trashed" } }));
    mutate(`${rows.length === 1 ? `“${rows[0].title}”` : plural(rows.length, "item")} trashed`, ops);
  };

  const openViewMenu = () =>
    ui.openPicker({
      type: "list",
      title: "View",
      items: [
        { id: "day", label: "Group by day", hint: groupBy === "day" ? "Current" : "" },
        { id: "project", label: "Group by project", hint: groupBy === "project" ? "Current" : "" },
      ],
      onPick: (id) => id && setGroupBy(id as "day" | "project"),
    });

  const commands: Command[] = [
    ...nav.commands,
    { id: "done.reopen", label: "Not done (put back)", group: "Done", keys: ["e"], enabled: Boolean(focus), run: () => reopen(targets()) },
    { id: "done.open", label: "Open details", group: "Done", keys: ["enter"], enabled: Boolean(focus), run: () => focus && ui.openDetail({ kind: focus.kind, id: focus.id }, true) },
    { id: "done.trash", label: "Trash", group: "Done", keys: ["backspace", "delete"], enabled: Boolean(focus), run: () => trash(targets()) },
    { id: "done.view", label: "View: group by day or project", group: "View", keys: ["alt+v"], run: openViewMenu },
  ];
  useCommands("list:done", commands, { priority: 10, active: regionActive });

  const columns: Column<Row>[] = [
    {
      key: "kind",
      label: "",
      width: "30px",
      render: (r) => <span className="kind-icon">{r.kind === "project" ? <Layers size={14} strokeWidth={1.75} aria-label="Project" /> : <Circle size={12} strokeWidth={1.75} aria-label="Action" />}</span>,
    },
    { key: "subject", label: "Item", width: "minmax(220px, 1fr)", render: (r) => <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title}</span> },
    { key: "from", label: "Was in", width: "minmax(140px, 360px)", drop: 2, render: (r) => <span className="muted-text">{groupBy === "project" ? r.place : r.from}</span> },
    {
      key: "at",
      label: "Done",
      width: "96px",
      align: "end",
      drop: 1,
      // Grouped by day the heading has the date, so the row gives the time; by project, the date.
      render: (r) => <span className="date">{groupBy === "day" ? clock(r.at) : formatDate(r.at.slice(0, 10))}</span>,
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
