import { useEffect, useMemo, useRef } from "react";
import { Paperclip, Repeat, AlignLeft, Clock, CalendarClock } from "lucide-react";
import { useStore, isChase, isDeferred } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, usePersisted, isGroupKey, type Column, type GridGroup } from "../components/Grid.tsx";
import { ContextCode, DateCell, Energy, Marker, TimeCell, titleOr } from "../components/bits.tsx";
import { useActionCommands } from "../actionCommands.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { today, daysBetween, formatDate, formatLong } from "../../shared/dates.ts";
import type { Action, ActionStatus, State } from "../../shared/types.ts";

type Mode = "next" | "waiting" | "someday" | "done";
type GroupBy = "project" | "who" | "context" | "due" | "none";
type SortBy = "manual" | "due" | "subject" | "context" | "time" | "energy";

const SUBJECT_HINT: Record<Mode, string> = {
  next: "Describe the next action",
  waiting: "Describe what you’re waiting for",
  someday: "Describe something you might do",
  done: "Describe the action",
};

const GROUPS: Record<GroupBy, string> = { project: "Project", who: "Waiting on", context: "Context", due: "Due date", none: "No grouping" };
const SORTS: Record<SortBy, string> = { manual: "Manual order", due: "Due date", subject: "Subject", context: "Context", time: "Time estimate", energy: "Energy" };

export function InlineEdit({ value, onDone, placeholder }: { value: string; onDone: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
    // Hand focus back to the list, so the keyboard (and a screen reader) is on the row again, not the page.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) document.querySelector<HTMLElement>(".list-region .grid.is-active")?.focus({ preventScroll: true });
    });
  };
  return (
    <input
      ref={ref}
      className="inline-edit"
      defaultValue={value}
      placeholder={placeholder}
      aria-label="Subject"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(value);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}

/** Grouping choices per list: no project grouping where the Projects list already does that job. */
function groupOptions(mode: Mode): GroupBy[] {
  if (mode === "next") return ["context", "due", "none"];
  if (mode === "waiting") return ["who", "context", "due", "none"];
  if (mode === "someday") return ["project", "context", "due", "none"];
  return ["none"];
}

function rowsFor(s: State, mode: Mode, showDeferred: boolean): Action[] {
  const t = today();
  if (mode === "next") {
    return s.actions.filter((a) => (a.status === "next" && (showDeferred || !isDeferred(a, t))) || isChase(a, t));
  }
  if (mode === "done") return s.actions.filter((a) => a.status === "done");
  return s.actions.filter((a) => a.status === mode);
}

function dueBucket(a: Action): [number, string] {
  if (!a.due) return [9, "No due date"];
  const d = daysBetween(today(), a.due);
  if (d < 0) return [0, "Overdue"];
  if (d === 0) return [1, "Today"];
  if (d === 1) return [2, "Tomorrow"];
  if (d < 7) return [3, "This week"];
  if (d < 31) return [4, "Within a month"];
  return [5, "Later"];
}

export function ActionsView({ mode, regionActive }: { mode: Mode; regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  // Next Actions are organised by context (where you are), Waiting For by who you wait on;
  // the Projects list is the view by project.
  const groupKey = mode === "next" ? "group:next:v2" : mode === "waiting" ? "group:waiting:v2" : `group:${mode}`;
  const groupDefault: GroupBy = mode === "done" ? "none" : mode === "next" ? "context" : mode === "waiting" ? "who" : "project";
  const [storedGroup, setGroupBy] = usePersisted<GroupBy>(groupKey, groupDefault);
  const groupBy: GroupBy = groupOptions(mode).includes(storedGroup) || (mode === "done" && storedGroup === "project") ? storedGroup : groupDefault;
  const [sortBy, setSortBy] = usePersisted<SortBy>(`sort:${mode}`, "manual");
  const [showDeferred, setShowDeferred] = usePersisted(`deferred:${mode}`, false);
  const t = today();

  const rows = useMemo(() => rowsFor(s, mode, showDeferred), [s, mode, showDeferred]);
  const deferredCount = useMemo(() => (mode === "next" ? s.actions.filter((a) => a.status === "next" && isDeferred(a, t)).length : 0), [s, mode, t]);

  const ctxById = useMemo(() => new Map(s.contexts.map((c) => [c.id, c])), [s.contexts]);
  const projById = useMemo(() => new Map(s.projects.map((p) => [p.id, p])), [s.projects]);
  const filesByOwner = useMemo(() => {
    const m = new Set<string>();
    s.files.forEach((f) => f.owner_kind === "action" && m.add(f.owner_id));
    return m;
  }, [s.files]);

  const groups: GridGroup<Action>[] = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      if (mode === "done") return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
      switch (sortBy) {
        case "due":
          return (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.sort - b.sort;
        case "subject":
          return a.title.localeCompare(b.title);
        case "context":
          return (ctxById.get(a.context_id ?? "")?.name ?? "~").localeCompare(ctxById.get(b.context_id ?? "")?.name ?? "~") || a.sort - b.sort;
        case "time":
          return (a.time_min ?? 1e9) - (b.time_min ?? 1e9);
        case "energy":
          return (a.energy ?? 9) - (b.energy ?? 9);
        default:
          return a.sort - b.sort;
      }
    });
    if (mode === "done" && groupBy === "none") {
      const byDay = new Map<string, Action[]>();
      for (const a of sorted) {
        const d = (a.completed_at ?? "").slice(0, 10);
        byDay.set(d, [...(byDay.get(d) ?? []), a]);
      }
      // One date style for every day: the full date, with "Today" or "Yesterday" in front when it applies.
      return [...byDay.entries()].map(([d, r]) => ({ key: d, label: d ? (Math.abs(daysBetween(t, d)) <= 1 ? `${formatDate(d)} · ${formatLong(d)}` : formatLong(d)) : "Undated", rows: r }));
    }
    if (groupBy === "none") return [{ key: "all", label: "", rows: sorted }];
    const map = new Map<string, { label: string; order: string; folder?: boolean; color?: string; rows: Action[] }>();
    for (const a of sorted) {
      let key: string, label: string, order: string, folder = false;
      let color: string | undefined;
      if (groupBy === "project") {
        const p = a.project_id ? projById.get(a.project_id) : undefined;
        key = p?.id ?? "none";
        label = p ? p.title || "Untitled project" : "No project";
        order = p ? `0${String(p.sort).padStart(8, "0")}` : "9";
        folder = Boolean(p);
      } else if (groupBy === "who") {
        const who = a.waiting_who?.trim() ?? "";
        key = who ? `who:${who.toLowerCase()}` : "none";
        label = who || "Nobody named";
        order = who ? `0${who.toLowerCase()}` : "9";
      } else if (groupBy === "context") {
        const c = a.context_id ? ctxById.get(a.context_id) : undefined;
        key = c?.id ?? "none";
        label = c?.name ?? "No context";
        order = c ? `0${String(c.sort).padStart(4, "0")}` : "9";
        color = c?.color;
      } else {
        const [o, l] = dueBucket(a);
        key = l;
        label = l;
        order = String(o);
      }
      const g = map.get(key) ?? { label, order, folder, color, rows: [] };
      g.rows.push(a);
      map.set(key, g);
    }
    return [...map.entries()]
      .sort((a, b) => a[1].order.localeCompare(b[1].order))
      .map(([key, g]) => ({ key, label: g.label, folder: g.folder, color: g.color, rows: g.rows }));
  }, [rows, groupBy, sortBy, mode, ctxById, projById]);

  const multi = groups.length > 1 || (groupBy !== "none" && groups.length === 1 && groups[0].key !== "all");
  const navGroups = useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.id), showHeader: multi })), [groups, multi]);
  const nav = useListNav(mode, navGroups);
  const focusId = nav.focus && !isGroupKey(nav.focus) ? nav.focus : null;

  const status: ActionStatus = mode === "done" ? "next" : mode;
  const act = useActionCommands({
    ui,
    targets: nav.targets,
    focusId,
    status,
    waitingView: mode === "waiting",
    doneView: mode === "done",
    defaults: () => {
      // New rows join the group the cursor is in.
      if (!nav.focus) return {};
      const g = isGroupKey(nav.focus) ? nav.focus.slice(6) : groups.find((x) => x.rows.some((r) => r.id === nav.focus))?.key;
      if (!g || g === "none") return {};
      if (groupBy === "project" && projById.has(g)) return { project_id: g };
      if (groupBy === "context" && ctxById.has(g)) return { context_id: g };
      if (groupBy === "who" && g.startsWith("who:")) return { waiting_who: groups.find((x) => x.key === g)?.label };
      return {};
    },
    neighbors: (id) => {
      const g = groups.find((x) => x.rows.some((r) => r.id === id));
      const i = g ? g.rows.findIndex((r) => r.id === id) : -1;
      return { prev: g?.rows[i - 1], next: g?.rows[i + 1] };
    },
    onCreated: (id) => nav.setFocus(id),
  });

  // Keep the detail pane following the cursor when it is open.
  useEffect(() => {
    if (focusId && ui.detail && ui.detail.kind === "action" && ui.detail.id !== focusId) ui.openDetail({ kind: "action", id: focusId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // Search results jump here.
  useEffect(() => {
    if (ui.revealTarget?.kind === "action" && rows.some((r) => r.id === ui.revealTarget!.id)) {
      const g = groups.find((x) => x.rows.some((r) => r.id === ui.revealTarget!.id));
      if (g) nav.toggleGroup(g.key, true);
      nav.setFocus(ui.revealTarget.id);
      ui.clearReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget, rows]);

  const openViewMenu = () => {
    const items = [
      ...(mode === "done" ? [] : groupOptions(mode).map((g) => ({ id: `g:${g}`, label: g === "none" ? "No grouping" : `Group by ${GROUPS[g].toLowerCase()}`, hint: groupBy === g ? "Current" : "", section: "group" }))),
      ...(mode === "done" ? [] : (Object.keys(SORTS) as SortBy[]).map((k) => ({ id: `s:${k}`, label: `Sort by ${SORTS[k].toLowerCase()}`, hint: sortBy === k ? "Current" : "", section: "sort" }))),
      ...(mode === "next" ? [{ id: "deferred", label: showDeferred ? "Hide deferred actions" : `Show deferred actions (${deferredCount})`, section: "show" }] : []),
      ...(mode === "done" ? [{ id: "g:none", label: "Group by day", hint: groupBy === "none" ? "Current" : "", section: "group" }, { id: "g:project", label: "Group by project", hint: groupBy === "project" ? "Current" : "", section: "group" }] : []),
    ];
    ui.openPicker({
      type: "list",
      title: "View",
      items,
      onPick: (id) => {
        if (!id) return;
        if (id.startsWith("g:")) setGroupBy(id.slice(2) as GroupBy);
        else if (id.startsWith("s:")) setSortBy(id.slice(2) as SortBy);
        else if (id === "deferred") setShowDeferred(!showDeferred);
      },
    });
  };

  const viewCommands: Command[] = [
    { id: "view.menu", label: "View: group and sort", group: "View", keys: ["alt+v"], run: openViewMenu },
  ];
  useCommands(`list:${mode}`, [...nav.commands, ...act.commands, ...viewCommands], { priority: 10, active: regionActive });

  const marker: Column<Action> = {
    key: "mark",
    label: "",
    width: "30px",
    render: (a) => <Marker flagged={Boolean(a.flagged)} done={a.status === "done" || act.striking.has(a.id)} chase={isChase(a)} />,
  };
  const subject: Column<Action> = {
    key: "subject",
    label: "Subject",
    width: "minmax(220px, 1fr)",
    render: (a) =>
      act.editing === a.id ? (
        <InlineEdit value={a.title} placeholder={SUBJECT_HINT[mode]} onDone={(v) => act.commitTitle(a.id, v)} />
      ) : (
        <span className="subject">
          {isChase(a) && mode === "next" && <span className="chase-label">Chase {a.waiting_who ?? ""}</span>}
          <span className="subject-text">{titleOr(a)}</span>
          <span className="subject-icons">
            {a.recurrence && <Repeat size={12} strokeWidth={2} aria-label="Repeats" />}
            {a.notes && <AlignLeft size={12} strokeWidth={2} aria-label="Has notes" />}
            {filesByOwner.has(a.id) && <Paperclip size={12} strokeWidth={2} aria-label="Has files" />}
            {a.defer && a.defer > t && <Clock size={12} strokeWidth={2} aria-label={`Starts ${a.defer}`} />}
            {a.bring_back && (
              <span className="back-on" title={`Comes back to the Inbox on ${a.bring_back}`}>
                <CalendarClock size={12} strokeWidth={2} aria-hidden /> {formatDate(a.bring_back)}
              </span>
            )}
          </span>
        </span>
      ),
  };
  const ctxCol: Column<Action> = { key: "ctx", label: "Context", width: "112px", render: (a) => <ContextCode ctx={ctxById.get(a.context_id ?? "")} /> };
  const projCol: Column<Action> = {
    key: "proj",
    label: "Project",
    width: "minmax(120px, 200px)",
    drop: 4,
    render: (a) => {
      const p = a.project_id ? projById.get(a.project_id) : undefined;
      return p ? <span className="proj-cell">{p.title}</span> : <span className="dash" aria-hidden="true">–</span>;
    },
  };

  let columns: Column<Action>[];
  if (mode === "waiting") {
    columns = [
      marker,
      subject,
      ...(groupBy === "who" ? [] : [{ key: "who", label: "Waiting on", width: "132px", render: (a: Action) => a.waiting_who || <span className="dash" aria-hidden="true">–</span> }]),
      { key: "since", label: "Since", width: "84px", drop: 1, render: (a) => <DateCell date={a.waiting_since} kind="plain" /> },
      { key: "follow", label: "Follow up", width: "88px", render: (a) => <DateCell date={a.followup} /> },
      projCol,
    ];
  } else if (mode === "someday") {
    columns = [marker, subject, ...(groupBy === "project" ? [] : [projCol]), ctxCol, { key: "back", label: "Bring back", width: "96px", render: (a) => <DateCell date={a.bring_back} kind="plain" /> }];
  } else if (mode === "done") {
    columns = [
      marker,
      subject,
      projCol,
      ctxCol,
      // Grouped by day, the group heading already carries the date.
      ...(groupBy === "none" ? [] : [{ key: "when", label: "Done", width: "96px", render: (a: Action) => <DateCell date={a.completed_at?.slice(0, 10) ?? null} kind="plain" /> }]),
    ];
  } else {
    columns = [
      marker,
      subject,
      ...(groupBy === "context" ? [] : [ctxCol]),
      ...(groupBy === "project" ? [] : [projCol]),
      { key: "due", label: "Due", width: "84px", render: (a) => <DateCell date={a.due} /> },
      { key: "defer", label: "Start", width: "80px", drop: 1, render: (a) => <DateCell date={a.defer} kind="defer" /> },
      { key: "time", label: "Time", width: "52px", align: "end", drop: 3, render: (a) => <TimeCell min={a.time_min} /> },
      { key: "energy", label: "Energy", width: "62px", drop: 2, render: (a) => <Energy level={a.energy} /> },
    ];
  }

  const empty =
    mode === "next" ? (
      <EmptyState title="No next actions yet" lines={["Add an action here, capture to the Inbox, or let Claude clarify what you have captured."]} />
    ) : mode === "waiting" ? (
      <EmptyState title="Nothing delegated" lines={["Delegate any action and it waits here, with who and since when."]} />
    ) : mode === "someday" ? (
      <EmptyState title="No someday items" lines={["Move any action or project here when it can wait."]} />
    ) : (
      <EmptyState title="Nothing done yet" lines={["Completed actions are logged here by day."]} />
    );

  return (
    <Grid
      listId={mode}
      columns={columns}
      groups={groups}
      getKey={(a) => a.id}
      nav={nav}
      active={regionActive}
      showHeaders={multi}
      rowClass={(a) =>
        [
          act.striking.has(a.id) ? "is-striking" : "",
          a.status === "done" ? "is-done" : "",
          isDeferred(a) ? "is-deferred" : "",
          a.flagged ? "is-flagged" : "",
        ].join(" ")
      }
      onOpen={(k) => ui.openDetail({ kind: "action", id: k }, true)}
      empty={empty}
    />
  );
}
