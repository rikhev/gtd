import { useEffect, useMemo, useRef } from "react";
import { Paperclip, Repeat, AlignLeft, Clock, CalendarClock } from "lucide-react";
import { archiveDone, mutate, useStore, isChase, isDeferred } from "../store.ts";
import { useUI, VIEW_TITLES } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, usePersisted, useSort, sortGroups, isGroupKey, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { ContextCode, DateCell, DoneBox, Energy, FlagButton, Marker, TimeCell, titleOr } from "../components/bits.tsx";
import { useActionCommands } from "../actionCommands.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { addDays, today, daysBetween, formatDate, formatLong } from "../../shared/dates.ts";
import type { Action, ActionStatus, State } from "../../shared/types.ts";

type Mode = "next" | "waiting" | "someday" | "done";
type GroupBy = "project" | "who" | "context" | "due" | "today" | "none";

const SUBJECT_HINT: Record<Mode, string> = {
  next: "Describe the next action",
  waiting: "Describe what you’re waiting for",
  someday: "Describe something you might do",
  done: "Describe the action",
};

const GROUPS: Record<GroupBy, string> = { project: "Project", who: "Waiting on", context: "Context", due: "Due date", today: "Flagged for today", none: "No grouping" };
/** The View menu's sorts: the same state the column headings set (null is the list's own, manual order). */
const SORTS: [string | null, string][] = [[null, "Manual order"], ["due", "Due date"], ["subject", "Subject"], ["ctx", "Context"], ["time", "Time estimate"], ["energy", "Energy"]];

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
  if (mode === "next") return ["context", "due", "today", "none"];
  if (mode === "waiting") return ["who", "context", "due", "today", "none"];
  if (mode === "someday") return ["project", "context", "due", "none"];
  return ["none"];
}

/** Done, not yet archived, and done on this list: it stays here, struck through, until archived to Done. */
const doneHere = (a: Action, mode: Mode) => a.status === "done" && !a.archived_at && (a.done_from ?? "next") === mode;

function rowsFor(s: State, mode: Mode, showDeferred: boolean, showDone: boolean): Action[] {
  const t = today();
  if (mode === "done") return s.actions.filter((a) => a.status === "done" && a.archived_at);
  if (mode === "next") {
    return s.actions.filter((a) => (a.status === "next" && (showDeferred || !isDeferred(a, t))) || isChase(a, t) || (showDone && doneHere(a, mode)));
  }
  return s.actions.filter((a) => a.status === mode || (showDone && doneHere(a, mode)));
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
  const [sort, setSort] = useSort(mode);
  const [showDeferred, setShowDeferred] = usePersisted(`deferred:${mode}`, false);
  const t = today();

  // Done actions stay on their list (struck through, at the bottom of their group) unless hidden; ⇧E archives them to Done.
  const [showDone, setShowDone] = usePersisted(`showdone:${mode}`, true);
  const doneCount = useMemo(() => (mode === "done" ? 0 : s.actions.filter((a) => doneHere(a, mode)).length), [s.actions, mode]);
  const rows = useMemo(() => rowsFor(s, mode, showDeferred, showDone), [s, mode, showDeferred, showDone]);
  const deferredCount = useMemo(() => (mode === "next" ? s.actions.filter((a) => a.status === "next" && isDeferred(a, t)).length : 0), [s, mode, t]);

  const ctxById = useMemo(() => new Map(s.contexts.map((c) => [c.id, c])), [s.contexts]);
  const projById = useMemo(() => new Map(s.projects.map((p) => [p.id, p])), [s.projects]);
  const filesByOwner = useMemo(() => {
    const m = new Set<string>();
    s.files.forEach((f) => f.owner_kind === "action" && m.add(f.owner_id));
    return m;
  }, [s.files]);

  // Every column that has something to order by is sortable from its heading.
  const sorters: Sorters<Action> = useMemo(
    () => ({
      subject: (a) => a.title,
      ctx: (a) => ctxById.get(a.context_id ?? "")?.name,
      proj: (a) => (a.project_id ? projById.get(a.project_id)?.title : undefined),
      due: (a) => a.due,
      defer: (a) => a.defer,
      time: (a) => a.time_min,
      energy: (a) => a.energy,
      who: (a) => a.waiting_who,
      since: (a) => a.waiting_since,
      follow: (a) => a.followup,
      back: (a) => a.bring_back,
      when: (a) => a.completed_at,
    }),
    [ctxById, projById],
  );

  const baseGroups: GridGroup<Action>[] = useMemo(() => {
    // The list's own order: manual, or newest first in Done. A heading click sorts on top of it.
    const sorted = [...rows].sort((a, b) => (mode === "done" ? (b.completed_at ?? "").localeCompare(a.completed_at ?? "") : a.sort - b.sort));
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
    const map = new Map<string, { label: string; order: string; color?: string; meta?: string; rows: Action[] }>();
    for (const a of sorted) {
      let key: string, label: string, order: string;
      let color: string | undefined;
      let meta: string | undefined;
      if (groupBy === "today") {
        // What you've flagged for today comes first, under today's date; the rest follows.
        key = a.flagged ? "today" : "none";
        label = a.flagged ? "Today" : "Everything else";
        order = a.flagged ? "0" : "9";
        meta = a.flagged ? formatLong(t) : undefined;
      } else if (groupBy === "project") {
        const p = a.project_id ? projById.get(a.project_id) : undefined;
        key = p?.id ?? "none";
        label = p ? p.title || "Untitled project" : "No project";
        order = p ? `0${String(p.sort).padStart(8, "0")}` : "9";
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
      const g = map.get(key) ?? { label, order, color, meta, rows: [] };
      g.rows.push(a);
      map.set(key, g);
    }
    return [...map.entries()]
      .sort((a, b) => a[1].order.localeCompare(b[1].order))
      .map(([key, g]) => ({ key, label: g.label, color: g.color, meta: g.meta, rows: g.rows }));
  }, [rows, groupBy, mode, ctxById, projById]);
  const groups = useMemo(
    () =>
      sortGroups(baseGroups, sorters, sort).map((g) =>
        // Done rows sink to the bottom of their group, whatever the sort.
        mode === "done" ? g : { ...g, rows: [...g.rows.filter((a) => a.status !== "done"), ...g.rows.filter((a) => a.status === "done")] },
      ),
    [baseGroups, sorters, sort, mode],
  );

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
      if (groupBy === "today" && g === "today") return { flagged: 1 };
      return {};
    },
    neighbors: (id) => {
      const g = groups.find((x) => x.rows.some((r) => r.id === id));
      const i = g ? g.rows.findIndex((r) => r.id === id) : -1;
      return { prev: g?.rows[i - 1], next: g?.rows[i + 1] };
    },
    onCreated: (id) => nav.setFocus(id),
    // The cursor stays in place (on the next open row) rather than following a done row to the bottom.
    onCompleting: (ids) => {
      if (!focusId || !ids.includes(focusId)) return;
      const flat = groups.flatMap((g) => g.rows);
      const i = flat.findIndex((a) => a.id === focusId);
      const open = (a: Action) => a.status !== "done" && !ids.includes(a.id);
      const next = flat.slice(i + 1).find(open) ?? [...flat.slice(0, i)].reverse().find(open);
      if (next) nav.setFocus(next.id);
    },
  });

  // Keep the detail pane following the cursor when it is open.
  useEffect(() => {
    ui.followDetail(focusId ? { kind: "action", id: focusId } : null);
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
      ...(mode === "done" ? [] : SORTS.map(([k, name]) => ({ id: `s:${k ?? ""}`, label: `Sort by ${name.toLowerCase()}`, hint: (sort?.key ?? null) === k ? "Current" : "", section: "sort" }))),
      ...(mode === "next" ? [{ id: "deferred", label: showDeferred ? "Hide deferred actions" : `Show deferred actions (${deferredCount})`, section: "show" }] : []),
      ...(mode === "done" ? [] : [{ id: "showdone", label: showDone ? `Hide done actions${doneCount ? ` (${doneCount})` : ""}` : `Show done actions${doneCount ? ` (${doneCount})` : ""}`, section: "done" }]),
      ...(mode === "done" || !doneCount ? [] : [{ id: "archive", label: `Archive done actions to Done (${doneCount})`, section: "done" }]),
      ...(mode === "done" ? [{ id: "g:none", label: "Group by day", hint: groupBy === "none" ? "Current" : "", section: "group" }, { id: "g:project", label: "Group by project", hint: groupBy === "project" ? "Current" : "", section: "group" }] : []),
    ];
    ui.openPicker({
      type: "list",
      title: "View",
      items,
      onPick: (id) => {
        if (!id) return;
        if (id.startsWith("g:")) setGroupBy(id.slice(2) as GroupBy);
        else if (id.startsWith("s:")) setSort(id.slice(2) ? { key: id.slice(2), dir: 1 } : null);
        else if (id === "deferred") setShowDeferred(!showDeferred);
        else if (id === "showdone") setShowDone(!showDone);
        else if (id === "archive") archiveHere();
      },
    });
  };

  // Drag to reorder while the list is in its own (manual) order: the row takes a sort value between its new
  // neighbours, so nothing else moves. Done rows stay put at the bottom.
  // Dropped into another group, an action takes on what that group stands for (its context, who it waits on, its
  // project, today's flag or a due date). null refuses the drop: a next action needs a context, and "Overdue" has no date to give.
  const groupPatch = (groupKey: string): Partial<Action> | null => {
    const t = today();
    switch (groupBy) {
      case "context":
        return groupKey === "none" ? (mode === "next" ? null : { context_id: null }) : { context_id: groupKey };
      case "who":
        return groupKey === "none" ? { waiting_who: null } : { waiting_who: groups.find((g) => g.key === groupKey)?.label ?? null };
      case "project":
        return { project_id: groupKey === "none" ? null : groupKey };
      case "today":
        return { flagged: groupKey === "today" ? 1 : 0 };
      case "due":
        return (
          ({ Today: { due: t }, Tomorrow: { due: addDays(t, 1) }, "This week": { due: addDays(t, 2) }, "Within a month": { due: addDays(t, 7) }, Later: { due: addDays(t, 31) }, "No due date": { due: null } } as Record<string, Partial<Action>>)[groupKey] ?? null
        );
      default:
        return {};
    }
  };
  const reorder =
    sort || mode === "done"
      ? undefined
      : {
          canDrag: (k: string) => s.actions.find((a) => a.id === k)?.status !== "done",
          canDrop: (groupKey: string) => groupPatch(groupKey) !== null,
          onMove: (key: string, beforeKey: string | null, groupKey: string) => {
            const g = groups.find((x) => x.key === groupKey);
            const me = s.actions.find((a) => a.id === key);
            if (!g || !me) return;
            const home = groups.find((x) => x.rows.some((a) => a.id === key))?.key;
            const patch = groupKey === home ? {} : groupPatch(groupKey);
            if (!patch) return;
            const open = g.rows.filter((a) => a.status !== "done" && a.id !== key);
            const i = beforeKey ? open.findIndex((a) => a.id === beforeKey) : -1;
            const sortAt = i >= 0 ? (i > 0 ? (open[i - 1].sort + open[i].sort) / 2 : open[i].sort - 1) : open.length ? open[open.length - 1].sort + 1 : me.sort;
            const moved = Object.keys(patch).length > 0;
            mutate(moved ? `“${me.title || "Untitled action"}” → ${g.label || "no group"}` : "Moved", [{ type: "patch", table: "actions", id: key, data: { ...patch, sort: sortAt } }], { silent: !moved });
            nav.setFocus(key);
          },
        };
  const archiveHere = () => archiveDone(s.actions.filter((a) => doneHere(a, mode)).map((a) => a.id), VIEW_TITLES[mode]);
  const viewCommands: Command[] = [
    { id: "view.menu", label: "View: group and sort", group: "View", keys: ["alt+v"], run: openViewMenu },
    ...(mode === "done"
      ? []
      : [
          { id: "list.archive", label: `Archive done actions to Done${doneCount ? ` (${doneCount})` : ""}`, group: "Actions", keys: ["shift+e"], enabled: doneCount > 0, run: archiveHere },
          { id: "list.showdone", label: showDone ? "Hide done actions" : "Show done actions", group: "View", run: () => setShowDone(!showDone) },
        ]),
  ];
  useCommands(`list:${mode}`, [...nav.commands, ...act.commands, ...viewCommands], { priority: 10, active: regionActive });

  const marker: Column<Action> = {
    key: "mark",
    label: "",
    width: "30px",
    render: (a) =>
      a.status === "done" ? (
        <Marker quiet flagged={false} />
      ) : (
        <FlagButton flagged={Boolean(a.flagged)} chase={isChase(a)} title={titleOr(a)} onToggle={() => act.flagOne(a.id)} />
      ),
  };
  const doneCol: Column<Action> = {
    key: "done",
    label: "",
    width: "26px",
    render: (a) => {
      const done = a.status === "done" || act.striking.has(a.id);
      return <DoneBox done={done} title={titleOr(a)} onToggle={() => (a.status === "done" ? act.reopenOne(a.id) : act.striking.has(a.id) ? undefined : act.completeOne(a.id))} />;
    },
  };
  const subject: Column<Action> = {
    key: "subject",
    label: "Subject",
    // 180px minimum leaves room for the project beside the detail pane at 1024px ("whose action is this?").
    width: "minmax(180px, 1fr)",
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
      doneCol,
      subject,
      ...(groupBy === "who" ? [] : [{ key: "who", label: "Waiting on", width: "132px", render: (a: Action) => a.waiting_who || <span className="dash" aria-hidden="true">–</span> }]),
      { key: "since", label: "Since", width: "84px", drop: 1, render: (a) => <DateCell date={a.waiting_since} kind="plain" /> },
      { key: "follow", label: "Follow up", width: "88px", render: (a) => <DateCell date={a.followup} /> },
      projCol,
    ];
  } else if (mode === "someday") {
    columns = [marker, doneCol, subject, ...(groupBy === "project" ? [] : [projCol]), ctxCol, { key: "back", label: "Bring back", width: "96px", render: (a) => <DateCell date={a.bring_back} kind="plain" /> }];
  } else if (mode === "done") {
    columns = [
      marker,
      doneCol,
      subject,
      projCol,
      ctxCol,
      // Grouped by day, the group heading already carries the date.
      ...(groupBy === "none" ? [] : [{ key: "when", label: "Done", width: "96px", render: (a: Action) => <DateCell date={a.completed_at?.slice(0, 10) ?? null} kind="plain" /> }]),
    ];
  } else {
    columns = [
      marker,
      doneCol,
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
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      reorder={reorder}
      columns={columns}
      groups={groups}
      getKey={(a) => a.id}
      nav={nav}
      active={regionActive}
      showHeaders={multi}
      rowClass={(a) =>
        [
          act.striking.has(a.id) ? `is-striking ${showDone ? "" : "is-leaving"}` : "",
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
