import { useEffect, useMemo } from "react";
import { BookOpen, Circle, FileText, Layers, Mail, StickyNote } from "lucide-react";
import { mutate, plural, useMeta, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, useSort, sortGroups, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { stuffTitle } from "./InboxView.tsx";
import { daysBetween, formatDate, today } from "../../shared/dates.ts";
import type { ID, Op, State, TableName } from "../../shared/types.ts";

type Kind = "action" | "project" | "stuff" | "ref";
interface Row {
  key: string;
  kind: Kind;
  id: ID;
  title: string;
  /** Where it was when it was deleted: the list, or the project it belonged to. */
  from: string;
  at: string;
  /** Whole days left before it is gone for good. */
  left: number;
  icon?: "email" | "file" | "note";
}

const TABLE: Record<Kind, TableName> = { action: "actions", project: "projects", stuff: "stuff", ref: "refs" };
const LIST_NAMES: Record<string, string> = { next: "Next Actions", waiting: "Waiting For", someday: "Someday / Maybe", done: "Done" };
/** What a restored item goes back to when it doesn't know what it was (deleted before this was tracked). */
const HOME: Record<Kind, string> = { action: "next", project: "active", stuff: "inbox", ref: "active" };

function rowsOf(s: State, keepDays: number): Row[] {
  const now = Date.now();
  const leftOf = (at: string) => Math.max(0, Math.ceil((new Date(at).getTime() + keepDays * 86_400_000 - now) / 86_400_000));
  const alive = (at: string | null | undefined): at is string => Boolean(at) && leftOf(at!) > 0;
  const proj = (id: ID | null) => s.projects.find((p) => p.id === id)?.title;
  const out: Row[] = [];
  for (const a of s.actions) {
    if (a.status !== "trashed" || !alive(a.trashed_at)) continue;
    const list = LIST_NAMES[a.trashed_from ?? ""] ?? "Next Actions";
    out.push({ key: `a:${a.id}`, kind: "action", id: a.id, title: a.title || "Untitled action", from: proj(a.project_id) ? `${list} · ${proj(a.project_id)}` : list, at: a.trashed_at, left: leftOf(a.trashed_at) });
  }
  for (const p of s.projects) {
    if (p.status !== "trashed" || !alive(p.trashed_at)) continue;
    out.push({ key: `p:${p.id}`, kind: "project", id: p.id, title: p.title || "Untitled project", from: p.trashed_from === "someday" ? "Someday / Maybe" : "Projects", at: p.trashed_at, left: leftOf(p.trashed_at) });
  }
  for (const st of s.stuff) {
    if (st.status !== "trashed" || !alive(st.trashed_at)) continue;
    out.push({ key: `s:${st.id}`, kind: "stuff", id: st.id, title: stuffTitle(st) || "Untitled", from: "Inbox", at: st.trashed_at, left: leftOf(st.trashed_at), icon: st.kind === "email" ? "email" : st.kind === "file" ? "file" : "note" });
  }
  for (const r of s.refs) {
    if (r.status !== "trashed" || !alive(r.trashed_at)) continue;
    out.push({ key: `r:${r.id}`, kind: "ref", id: r.id, title: r.title || "Untitled", from: proj(r.project_id) ? `Reference · ${proj(r.project_id)}` : "Reference", at: r.trashed_at, left: leftOf(r.trashed_at) });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Today", "Yesterday", then the date: when things were deleted is how they are remembered. */
function dayLabel(at: string) {
  const d = at.slice(0, 10);
  const ago = daysBetween(d, today());
  return ago <= 0 ? "Today" : ago === 1 ? "Yesterday" : formatDate(d);
}

/**
 * Trash: everything trashed in the keep period, newest first, grouped by the day it went. R puts it back
 * where it was (a project brings back the actions deleted with it); Delete removes it for good.
 */
export function TrashView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const meta = useMeta();
  const s = useStore((x) => x);
  const all = useMemo(() => rowsOf(s, meta.trashDays), [s, meta.trashDays]);

  const [sort, setSort] = useSort("trash");
  const sorters: Sorters<Row> = useMemo(() => ({ subject: (r) => r.title, from: (r) => r.from, at: (r) => r.at, left: (r) => r.left }), []);
  const groups: GridGroup<Row>[] = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const r of all) byDay.set(dayLabel(r.at), [...(byDay.get(dayLabel(r.at)) ?? []), r]);
    return sortGroups(
      [...byDay.entries()].map(([label, rows]) => ({ key: label, label, rows })),
      sorters,
      sort,
    );
  }, [all, sorters, sort]);
  const multi = groups.length > 0;
  const nav = useListNav("trash", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: multi })), [groups, multi]));
  const focus = all.find((r) => r.key === nav.focus);
  const targets = () => nav.targets().map((k) => all.find((r) => r.key === k)).filter((r): r is Row => Boolean(r));

  useEffect(() => {
    ui.followDetail(focus ? { kind: focus.kind, id: focus.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  const restore = (rows: Row[]) => {
    if (!rows.length) return;
    const ops: Op[] = [];
    for (const r of rows) {
      const row = (s[TABLE[r.kind]] as { id: ID; trashed_from?: string | null }[]).find((x) => x.id === r.id);
      const back = row?.trashed_from && row.trashed_from !== "trashed" ? row.trashed_from : HOME[r.kind];
      ops.push({ type: "patch", table: TABLE[r.kind], id: r.id, data: { status: back, ...(r.kind === "stuff" ? { processed_at: null } : {}) } });
      // A project comes back with the actions that were deleted along with it.
      if (r.kind === "project") {
        const p = s.projects.find((x) => x.id === r.id);
        for (const a of s.actions.filter((a) => a.project_id === r.id && a.status === "trashed" && p?.trashed_at && a.trashed_at === p.trashed_at && !rows.some((x) => x.id === a.id))) {
          ops.push({ type: "patch", table: "actions", id: a.id, data: { status: a.trashed_from && a.trashed_from !== "trashed" ? a.trashed_from : "next" } });
        }
      }
    }
    const where = rows.length === 1 ? ` to ${rows[0].from.split(" · ")[0]}` : "";
    mutate(`${rows.length === 1 ? `“${rows[0].title}”` : plural(rows.length, "item")} restored${where}`, ops);
  };
  const purge = (rows: Row[], label?: string) => {
    if (!rows.length) return;
    mutate(label ?? `${rows.length === 1 ? `“${rows[0].title}”` : plural(rows.length, "item")} deleted for good`, rows.map((r) => ({ type: "delete" as const, table: TABLE[r.kind], id: r.id })));
  };

  const commands: Command[] = [
    ...nav.commands,
    { id: "del.restore", label: "Restore (put back where it was)", group: "Trash", keys: ["r"], enabled: Boolean(focus), run: () => restore(targets()) },
    { id: "del.open", label: "Open details", group: "Trash", keys: ["enter"], enabled: Boolean(focus), run: () => focus && ui.openDetail({ kind: focus.kind, id: focus.id }, true) },
    { id: "del.purge", label: "Delete for good", group: "Trash", keys: ["backspace", "delete", "shift+backspace", "shift+delete"], enabled: Boolean(focus), run: () => purge(targets()) },
    { id: "del.empty", label: `Empty the Trash${all.length ? ` (${plural(all.length, "item")})` : ""}`, group: "Trash", keys: [], enabled: all.length > 0, run: () => purge(all, `Trash emptied (${plural(all.length, "item")})`) },
  ];
  useCommands("list:trash", commands, { priority: 10, active: regionActive });

  const icon = (r: Row) =>
    r.kind === "action" ? (
      <Circle size={12} strokeWidth={1.75} aria-label="Action" />
    ) : r.kind === "project" ? (
      <Layers size={14} strokeWidth={1.75} aria-label="Project" />
    ) : r.kind === "ref" ? (
      <BookOpen size={14} strokeWidth={1.75} aria-label="Reference" />
    ) : r.icon === "email" ? (
      <Mail size={14} strokeWidth={1.75} aria-label="Email" />
    ) : r.icon === "file" ? (
      <FileText size={14} strokeWidth={1.75} aria-label="File" />
    ) : (
      <StickyNote size={14} strokeWidth={1.75} aria-label="Note" />
    );
  const columns: Column<Row>[] = [
    { key: "kind", label: "", width: "30px", render: (r) => <span className="kind-icon">{icon(r)}</span> },
    { key: "subject", label: "Item", width: "minmax(220px, 1fr)", render: (r) => <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title}</span> },
    { key: "from", label: "Was in", width: "minmax(140px, 280px)", drop: 2, render: (r) => <span className="muted-text">{r.from}</span> },
    { key: "at", label: "Deleted", width: "84px", drop: 1, render: (r) => <span className="date">{dayLabel(r.at) === "Today" || dayLabel(r.at) === "Yesterday" ? clock(r.at) : formatDate(r.at.slice(0, 10))}</span> },
    {
      key: "left",
      label: "Gone in",
      width: "96px",
      align: "end",
      // The last day reads in alert red: it is about to be gone for good.
      render: (r) => <span className={`num ${r.left <= 1 ? "left-last" : ""}`}>{r.left <= 1 ? "Last day" : plural(r.left, "day")}</span>,
    },
  ];

  return (
    <Grid
      listId="trash"
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      columns={columns}
      groups={groups}
      getKey={(r) => r.key}
      nav={nav}
      active={regionActive}
      showHeaders={multi}
      onOpen={(k) => {
        const r = all.find((x) => x.key === k);
        if (r) ui.openDetail({ kind: r.kind, id: r.id }, true);
      }}
      empty={
        <EmptyState
          title="The Trash is empty"
          note={`Anything you delete stays in the Trash for ${plural(meta.trashDays, "day")}, so it can be put back.`}
          lines={["Change how long in Settings › Trash."]}
        />
      }
    />
  );
}
