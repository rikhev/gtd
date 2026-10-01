import { useEffect, useMemo } from "react";
import { BookOpen, Circle, FileText, Layers, ListChecks, Mail, StickyNote, Target } from "lucide-react";
import { LIST_NAMES, mutate, plural, useMeta, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, useSort, sortGroups, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { stuffTitle } from "./InboxView.tsx";
import { clockOf, dayHeading, localDay } from "../../shared/dates.ts";
import type { ID, Op, State, TableName } from "../../shared/types.ts";

type Kind = "action" | "project" | "stuff" | "ref" | "checklist" | "horizon";
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

const TABLE: Record<Kind, TableName> = { action: "actions", project: "projects", stuff: "stuff", ref: "refs", checklist: "checklists", horizon: "horizons" };
/** What a restored item goes back to when it doesn't know what it was (deleted before this was tracked). */
const HOME: Record<Kind, string> = { action: "next", project: "active", stuff: "inbox", ref: "active", checklist: "active", horizon: "active" };
/** Checklists have no details pane: in the Trash they are restored or deleted, not opened. */
const opens = (k: Kind): k is Exclude<Kind, "checklist" | "horizon"> => k !== "checklist" && k !== "horizon";

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
  for (const c of s.checklists) {
    if (c.status !== "trashed" || !alive(c.trashed_at)) continue;
    out.push({ key: `c:${c.id}`, kind: "checklist", id: c.id, title: c.title || "Untitled checklist", from: "Checklists", at: c.trashed_at, left: leftOf(c.trashed_at) });
  }
  for (const h of s.horizons) {
    if (h.status !== "trashed" || !alive(h.trashed_at)) continue;
    out.push({ key: `h:${h.id}`, kind: "horizon", id: h.id, title: h.title || "Untitled", from: "Horizons", at: h.trashed_at, left: leftOf(h.trashed_at) });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The day something was deleted, headed as Done heads the day something was done. */
const dayLabel = (at: string) => dayHeading(localDay(at));

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
      // Everything deleted on one day goes on the same day, so the countdown belongs to the day, not to each row.
      [...byDay.entries()].map(([label, rows]) => {
        const left = Math.min(...rows.map((r) => r.left));
        return { key: label, label, rows, meta: <span className={left <= 1 ? "left-last" : "muted-text"}>{left <= 1 ? "Last day" : `gone in ${plural(left, "day")}`}</span> };
      }),
      sorters,
      sort,
    );
  }, [all, sorters, sort]);
  const multi = groups.length > 0;
  const nav = useListNav("trash", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: multi })), [groups, multi]));
  const focus = all.find((r) => r.key === nav.focus);
  const targets = () => nav.targets().map((k) => all.find((r) => r.key === k)).filter((r): r is Row => Boolean(r));

  useEffect(() => {
    ui.followDetail(focus && opens(focus.kind) ? { kind: focus.kind, id: focus.id } : null);
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
    // A checklist goes for good with its items, and anything else with its files (⌘Z brings them back together; the
    // server keeps the stored files a day before it lets them go).
    const files = s.files.filter((f) => rows.some((r) => r.kind === f.owner_kind && r.id === f.owner_id));
    const items = s.checklist_items.filter((i) => rows.some((r) => r.kind === "checklist" && r.id === i.checklist_id));
    const records = s.checklist_ticks.filter((k) => rows.some((r) => r.kind === "checklist" && r.id === k.checklist_id));
    mutate(label ?? `${rows.length === 1 ? `“${rows[0].title}”` : plural(rows.length, "item")} deleted for good`, [
      ...rows.map((r) => ({ type: "delete" as const, table: TABLE[r.kind], id: r.id })),
      ...items.map((i) => ({ type: "delete" as const, table: "checklist_items" as const, id: i.id })),
      ...records.map((k) => ({ type: "delete" as const, table: "checklist_ticks" as const, id: k.id })),
      ...files.map((f) => ({ type: "delete" as const, table: "files" as const, id: f.id })),
    ]);
  };

  const commands: Command[] = [
    ...nav.commands,
    { id: "del.restore", row: true, label: "Restore", group: "Trash", keys: ["r"], enabled: Boolean(focus), run: () => restore(targets()) },
    { id: "del.open", row: true, label: "Open details", group: "Trash", keys: ["enter"], enabled: Boolean(focus && opens(focus.kind)), run: () => focus && opens(focus.kind) && ui.openDetail({ kind: focus.kind, id: focus.id }, true) },
    { id: "del.purge", row: true, label: "Delete for good", group: "Trash", keys: ["backspace", "delete", "shift+backspace", "shift+delete"], enabled: Boolean(focus), run: () => purge(targets()) },
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
    ) : r.kind === "checklist" ? (
      <ListChecks size={14} strokeWidth={1.75} aria-label="Checklist" />
    ) : r.kind === "horizon" ? (
      <Target size={14} strokeWidth={1.75} aria-label="Horizon" />
    ) : r.icon === "email" ? (
      <Mail size={14} strokeWidth={1.75} aria-label="Email" />
    ) : r.icon === "file" ? (
      <FileText size={14} strokeWidth={1.75} aria-label="File" />
    ) : (
      <StickyNote size={14} strokeWidth={1.75} aria-label="Note" />
    );
  const columns: Column<Row>[] = [
    { key: "kind", label: "", width: "30px", render: (r) => <span className="kind-icon">{icon(r)}</span> },
    { key: "subject", label: "Item", width: "minmax(220px, 1.3fr)", render: (r) => <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title}</span> },
    { key: "from", label: "Was in", width: "minmax(140px, 1fr)", drop: 2, render: (r) => <span className="muted-text">{r.from}</span> },
    { key: "at", label: "Deleted", width: "84px", drop: 1, // The heading has the day, so the row gives the time.
      render: (r) => <span className="date">{clockOf(r.at)}</span> },
    {
      key: "left",
      label: "Gone in",
      width: "96px",
      align: "end",
      // Only the last day is marked on the row, in alert red: it is about to be gone for good. Otherwise the day's
      // heading says it, and the column steps aside when nothing is on its last day.
      blank: (r) => r.left > 1,
      render: (r) => (r.left > 1 ? null : <span className="num left-last">Last day</span>),
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
        if (r && opens(r.kind)) ui.openDetail({ kind: r.kind, id: r.id }, true);
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
