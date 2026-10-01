import { askEnergy, askTime, fitLabel, fits, openFit, setFit, useFit } from "../fit.ts";
import { useEffect, useMemo, useRef } from "react";
import { Paperclip, Repeat, AlignLeft, Clock, CalendarClock } from "lucide-react";
import { archiveDone, mutate, notify, plural, useStore, isChase, isDeferred, onHold } from "../store.ts";
import { useUI, VIEW_TITLES } from "../ui.tsx";
import { isTouchDevice, useCommands, type Command } from "../keys.ts";
import { Grid, bakeDrop, stepRows, useListNav, usePersisted, useSort, sortGroups, isGroupKey, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { AreaName, ContextCode, DateCell, DoneBox, Energy, Marker, TimeCell, titleOr } from "../components/bits.tsx";
import { useActionCommands } from "../actionCommands.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { addDays, today, daysBetween, formatDate, formatLong, parseRecurrence, recurrenceLabel } from "../../shared/dates.ts";
import type { Action, ActionStatus, State, ID, Op } from "../../shared/types.ts";

type Mode = "next" | "waiting" | "someday" | "done";
type GroupBy = "project" | "who" | "context" | "due" | "none";

const SUBJECT_HINT: Record<Mode, string> = {
  next: "Describe the next action",
  waiting: "Describe what you’re waiting for",
  someday: "Describe something you might do",
  done: "Describe the action",
};

const GROUPS: Record<GroupBy, string> = { project: "Project", who: "Waiting on", context: "Context", due: "Due date", none: "No grouping" };
/** The View menu's sorts: the same state the column headings set (null is the list's own, manual order). */
const SORTS: [string | null, string][] = [[null, "Manual order"], ["due", "Due date"], ["subject", "Subject"], ["ctx", "Context"], ["time", "Time estimate"], ["energy", "Energy"]];

/**
 * A subject edited in place. `onPasteLines` gets a pasted text of several lines (and what the field held): when it
 * takes them (returns true), the edit ends there and the caller has done the rest.
 */
export function InlineEdit({
  value,
  onDone,
  placeholder,
  label = "Subject",
  onPasteLines,
}: {
  value: string;
  onDone: (v: string, how: "enter" | "cancel" | "blur") => void;
  placeholder: string;
  label?: string;
  onPasteLines?: (text: string, current: string) => boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  // Hand focus back to the list, so the keyboard (and a screen reader) is on the row again, not the page.
  const backToList = () =>
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) document.querySelector<HTMLElement>(".list-region .grid.is-active")?.focus({ preventScroll: true });
    });
  const finish = (v: string, how: "enter" | "cancel" | "blur") => {
    if (done.current) return;
    done.current = true;
    onDone(v, how);
    backToList();
  };
  return (
    <input
      ref={ref}
      className="inline-edit"
      defaultValue={value}
      placeholder={placeholder}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          finish(e.currentTarget.value, e.key === "Enter" ? "enter" : "blur");
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(value, "cancel");
        }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text/plain");
        if (!onPasteLines || !text.trim().includes("\n") || done.current) return;
        if (!onPasteLines(text, e.currentTarget.value)) return;
        e.preventDefault();
        done.current = true;
        backToList();
      }}
      onBlur={(e) => finish(e.currentTarget.value, "blur")}
    />
  );
}

/** Grouping choices per list: no project grouping where the Projects list already does that job. */
function groupOptions(mode: Mode): GroupBy[] {
  if (mode === "next") return ["context", "project", "due", "none"];
  if (mode === "waiting") return ["who", "project", "context", "due", "none"];
  if (mode === "someday") return ["project", "context", "due", "none"];
  return ["none"];
}

/** Done, not yet archived, and done on this list: it stays here, struck through, until archived to Done. */
const doneHere = (a: Action, mode: Mode) => a.status === "done" && !a.archived_at && (a.done_from ?? "next") === mode;

function rowsFor(s: State, mode: Mode, showDeferred: boolean, showDone: boolean): Action[] {
  const t = today();
  if (mode === "done") return s.actions.filter((a) => a.status === "done" && a.archived_at);
  // A Someday project's actions are on hold with it: off every action list until the project is active again.
  if (mode === "next") {
    return s.actions.filter((a) => (a.status === "next" && !onHold(a, s) && (showDeferred || !isDeferred(a, t))) || isChase(a, t) || (showDone && doneHere(a, mode)));
  }
  return s.actions.filter((a) => (a.status === mode && !(mode === "waiting" && onHold(a, s))) || (showDone && doneHere(a, mode)));
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
  // What fits now (GTD's engage step: where you are decides what can be done): Next Actions narrowed to the contexts
  // you are in; done rows step aside. The filter is for the moment: it lapses at the end of the day, so a stale one
  // never hides tomorrow's list.
  const fitNow = useFit();
  const fit = mode === "next" ? fitNow : null;
  const allRows = useMemo(() => rowsFor(s, mode, showDeferred, showDone), [s, mode, showDeferred, showDone]);
  const rows = useMemo(
    () => (fit ? allRows.filter((a) => a.status !== "done" && fits(a, fit) === "fits") : allRows),
    [allRows, fit],
  );
  // Next actions for other places wait, folded, below: you are not there now.
  const elsewhereRows = useMemo(() => (fit ? allRows.filter((a) => a.status !== "done" && fits(a, fit) === "elsewhere") : []), [allRows, fit]);
  const deferredCount = useMemo(() => (mode === "next" ? s.actions.filter((a) => a.status === "next" && !onHold(a, s) && isDeferred(a, t)).length : 0), [s, mode, t]);

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
      area: (a) => {
        const p = a.project_id ? projById.get(a.project_id) : undefined;
        return p?.area_id ? s.areas.find((x) => x.id === p.area_id)?.name : undefined;
      },
      created: (a) => a.created_at,
      updated: (a) => a.updated_at ?? a.created_at,
      repeat: (a) => a.recurrence,
    }),
    [ctxById, projById, s.areas],
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
      if (groupBy === "project") {
        const p = a.project_id ? projById.get(a.project_id) : undefined;
        key = p?.id ?? "none";
        label = p ? p.title || "Untitled project" : "No project";
        order = p ? `0${String(p.sort).padStart(8, "0")}` : "9";
      } else if (groupBy === "who") {
        const who = a.waiting_who?.trim() ?? "";
        key = who ? `who:${who.toLowerCase()}` : "none";
        label = who || "Nobody named";
        order = who ? `0${who.toLowerCase()}` : "9";
      } else if (groupBy === "context" && mode === "next" && isChase(a, t)) {
        // Waiting items whose follow-up has come are the most time-sensitive thing here: they lead, on their own,
        // instead of sitting in "No context" looking misfiled.
        key = "chase";
        label = "To chase";
        order = "!";
        meta = "follow-up due";
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
    () => [
      ...sortGroups(baseGroups, sorters, sort).map((g) =>
        // Done rows sink to the bottom of their group, whatever the sort.
        mode === "done" ? g : { ...g, rows: [...g.rows.filter((a) => a.status !== "done"), ...g.rows.filter((a) => a.status === "done")] },
      ),
      ...(elsewhereRows.length ? [{ key: "elsewhere", label: "Elsewhere", rows: elsewhereRows, meta: <span className="muted-text">{fit && (fit.minutes || fit.energy) ? "other places, or more than you have now" : "other places"}</span> }] : []),
    ],
    [baseGroups, sorters, sort, mode, elsewhereRows],
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
      if (!g || g === "none" || g === "chase") return {};
      if (groupBy === "project" && projById.has(g)) return { project_id: g };
      if (groupBy === "context" && ctxById.has(g)) return { context_id: g };
      if (groupBy === "who" && g.startsWith("who:")) return { waiting_who: groups.find((x) => x.key === g)?.label };
      return {};
    },
    step: (ids, dir) => {
      if (mode === "done") return;
      const moved = stepRows(groups, (a) => a.id, (a) => a.sort, (a) => a.status !== "done", ids, dir);
      if (!moved) return;
      mutate(sort ? "Moved · now in manual order" : "Reordered", [...moved].map(([id, at]) => ({ type: "patch" as const, table: "actions" as const, id, data: { sort: at } })), { silent: !sort });
      // In a column sort the moved rows would not budge on screen: the list switches to its own order, as a drop does.
      if (sort) setSort(null);
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

  // Swipes are invisible: the first time an action list is seen on a touch screen, one note says what they do.
  useEffect(() => {
    if (!isTouchDevice() || mode === "done") return;
    try {
      if (localStorage.getItem("gtd:swipehint")) return;
      localStorage.setItem("gtd:swipehint", "1");
    } catch {
      return;
    }
    notify("Swipe a row right to mark it done, left to trash it.");
  }, [mode]);

  // Setting the filter folds "Elsewhere", so what fits stands alone (open it to see the rest).
  useEffect(() => {
    if (!fit) return;
    nav.toggleGroup("elsewhere", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit?.where.join()]);

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
      ...(mode === "next"
        ? [
            { id: "fit", label: fit ? `What fits now: ${fitLabel(fit)}` : "What fits now…", hint: fit ? "On" : "", section: "show" },
            { id: "fit-time", label: fit?.minutes ? "How long do you have? (change)…" : "How long do you have?…", hint: "What fits now", section: "show" },
            { id: "fit-energy", label: fit?.energy ? "How is your energy? (change)…" : "How is your energy?…", hint: "What fits now", section: "show" },
          ]
        : []),
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
        else if (id === "fit") openFit(ui);
        else if (id === "fit-time") window.setTimeout(() => askTime(ui), 0);
        else if (id === "fit-energy") window.setTimeout(() => askEnergy(ui), 0);
        else if (id === "showdone") setShowDone(!showDone);
        else if (id === "archive") archiveHere();
      },
    });
  };

  // Drag to reorder while the list is in its own (manual) order: the row takes a sort value between its new
  // neighbours, so nothing else moves. Done rows stay put at the bottom.
  // Dropped into another group, an action takes on what that group stands for (its context, who it waits on, its
  // project, its importance or a due date). null refuses the drop: a next action needs a context, and "Overdue" has no date to give.
  const groupPatch = (groupKey: string): Partial<Action> | null => {
    const t = today();
    switch (groupBy) {
      case "context":
        // Nothing is dropped into "To chase": an item gets there by its follow-up date, not by being moved.
        if (groupKey === "chase") return null;
        return groupKey === "none" ? (mode === "next" ? null : { context_id: null }) : { context_id: groupKey };
      case "who":
        return groupKey === "none" ? { waiting_who: null } : { waiting_who: groups.find((g) => g.key === groupKey)?.label ?? null };
      case "project":
        return { project_id: groupKey === "none" ? null : groupKey };
      case "due":
        return (
          ({ Today: { due: t }, Tomorrow: { due: addDays(t, 1) }, "This week": { due: addDays(t, 2) }, "Within a month": { due: addDays(t, 7) }, Later: { due: addDays(t, 31) }, "No due date": { due: null } } as Record<string, Partial<Action>>)[groupKey] ?? null
        );
      default:
        return {};
    }
  };
  // Rows always drag (Done excepted: it keeps no order of its own). In a column sort, a drop switches the list to
  // its manual order, keeping everything where it was on screen.
  const reorder =
    mode === "done"
      ? undefined
      : {
          canDrag: (k: string) => s.actions.find((a) => a.id === k)?.status !== "done",
          canDrop: (groupKey: string) => groupPatch(groupKey) !== null,
          onMove: (keys: string[], beforeKey: string | null, groupKey: string) => {
            const g = groups.find((x) => x.key === groupKey);
            const movers = keys.map((k) => s.actions.find((a) => a.id === k)).filter((a): a is Action => Boolean(a));
            if (!g || !movers.length) return;
            const patch = groupPatch(groupKey);
            // Each dragged action takes the drop group's field, unless it already sits in that group.
            const homeOf = (id: ID) => groups.find((x) => x.rows.some((a) => a.id === id))?.key;
            const changes = movers.map((a) => (homeOf(a.id) === groupKey ? {} : patch));
            if (changes.some((c) => c === null)) return;
            // They land together, in list order, spaced evenly between the rows either side of the drop line.
            const open = g.rows.filter((a) => a.status !== "done" && !keys.includes(a.id));
            const i = beforeKey ? open.findIndex((a) => a.id === beforeKey) : -1;
            const lo = i > 0 ? open[i - 1].sort : i === 0 ? null : open.length ? open[open.length - 1].sort : null;
            const hi = i >= 0 ? open[i].sort : null;
            const n = movers.length;
            const sortAt = (j: number) => (lo !== null && hi !== null ? lo + ((hi - lo) * (j + 1)) / (n + 1) : lo !== null ? lo + j + 1 : hi !== null ? hi - (n - j) : movers[j].sort);
            const moved = changes.some((c) => c && Object.keys(c).length > 0);
            const who = movers.length === 1 ? `“${movers[0].title || "Untitled action"}”` : plural(movers.length, "action");
            const ops: Op[] = [];
            if (sort) {
              const baked = bakeDrop(groups, (a) => a.id, (a) => a.sort, (a) => a.status !== "done", keys, beforeKey, groupKey);
              for (const [id, at] of baked) {
                const j = movers.findIndex((m) => m.id === id);
                const a = s.actions.find((x) => x.id === id);
                if (j >= 0) ops.push({ type: "patch", table: "actions", id, data: { ...changes[j], sort: at } });
                else if (a && a.sort !== at) ops.push({ type: "patch", table: "actions", id, data: { sort: at } });
              }
              setSort(null);
            } else movers.forEach((a, j) => ops.push({ type: "patch", table: "actions", id: a.id, data: { ...changes[j], sort: sortAt(j) } }));
            const label = moved ? `${who} → ${g.label || "no group"}` : "Moved";
            mutate(sort ? `${label} · now in manual order` : label, ops, { silent: !moved && !sort });
            nav.setFocus(keys[keys.length - 1]);
          },
        };
  const archiveHere = () => archiveDone(s.actions.filter((a) => doneHere(a, mode)).map((a) => a.id), VIEW_TITLES[mode]);
  const viewCommands: Command[] = [
    { id: "view.menu", label: "Open the View menu: group and sort", group: "View", keys: ["alt+v"], run: openViewMenu },
    ...(mode === "next"
      ? [
          { id: "view.fit", label: fit ? "Show what fits now (change or clear)" : "Show what fits now: the contexts where you are", group: "View", keys: ["f"], run: () => openFit(ui) },
          // Allen's next two questions, there when wanted (no key: F asks only where you are).
          { id: "view.fittime", label: "Show what fits now: the time you have", group: "View", run: () => askTime(ui) },
          { id: "view.fitenergy", label: "Show what fits now: your energy", group: "View", run: () => askEnergy(ui) },
          ...(fit ? [{ id: "view.fitoff", label: "Show every next action", group: "View", run: () => setFit(null) }] : []),
        ]
      : []),
    ...(mode === "done"
      ? []
      : [
          { id: "list.archive", label: `Archive done actions to Done${doneCount ? ` (${doneCount})` : ""}`, group: "Actions", enabled: doneCount > 0, run: archiveHere },
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
        <Marker quiet />
      ) : (
        <Marker quiet chase={isChase(a)} />
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
    width: "minmax(180px, 2fr)",
    render: (a) =>
      act.editing === a.id ? (
        <InlineEdit value={a.title} placeholder={SUBJECT_HINT[mode]} onDone={(v) => act.commitTitle(a.id, v)} />
      ) : (
        <span className="subject">
          {isChase(a) && mode === "next" && (
            // Under "To chase" the group already says it: the row names only who.
            <span className="chase-label">{groupBy === "context" ? a.waiting_who ?? "Chase" : `Chase ${a.waiting_who ?? ""}`}</span>
          )}
          {/* Who a next action is for rides before it, as a chase names who: an @agenda group reads as people and points. */}
          {a.status === "next" && a.person && <span className="person-label">{a.person}</span>}
          <span className="subject-text">{titleOr(a)}</span>
          <span className="subject-icons">
            {a.recurrence && <Repeat size={12} strokeWidth={2} aria-label="Repeats" />}
            {a.notes && <AlignLeft className="ind-notes" size={12} strokeWidth={2} aria-label="Has notes" />}
            {filesByOwner.has(a.id) && <Paperclip className="ind-files" size={12} strokeWidth={2} aria-label="Has files" />}
            {a.defer && a.defer > t && <Clock size={12} strokeWidth={2} aria-label={`Starts ${formatLong(a.defer)}`} />}
            {a.bring_back && (
              <span className="back-on" title={`Comes back to the Inbox on ${formatLong(a.bring_back)}`}>
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
    width: "minmax(120px, 1fr)",
    drop: 4,
    blank: (a) => !a.project_id,
    render: (a) => {
      const p = a.project_id ? projById.get(a.project_id) : undefined;
      return p ? <span className="proj-cell">{p.title}</span> : <span className="dash" aria-hidden="true">–</span>;
    },
  };

  // Offered but hidden until shown (right-click a heading, or ⌘K › Show or hide columns…).
  const areaCol: Column<Action> = {
    key: "area",
    label: "Area",
    width: "110px",
    optional: true,
    render: (a) => {
      const p = a.project_id ? projById.get(a.project_id) : undefined;
      const area = p?.area_id ? s.areas.find((x) => x.id === p.area_id) : undefined;
      return area ? <AreaName name={area.name} color={area.color} /> : <span className="dash" aria-hidden="true">–</span>;
    },
  };
  const createdCol: Column<Action> = { key: "created", label: "Created", width: "84px", optional: true, render: (a) => <DateCell date={a.created_at.slice(0, 10)} kind="plain" /> };
  const updatedCol: Column<Action> = { key: "updated", label: "Updated", width: "84px", optional: true, render: (a) => <DateCell date={(a.updated_at ?? a.created_at).slice(0, 10)} kind="plain" /> };
  const repeatCol: Column<Action> = {
    key: "repeat",
    label: "Repeat",
    width: "110px",
    optional: true,
    render: (a) => {
      const r = a.recurrence ? parseRecurrence(a.recurrence) : null;
      return r ? <span className="muted-text">{recurrenceLabel(r)}</span> : <span className="dash" aria-hidden="true">–</span>;
    },
  };
  const backCol: Column<Action> = { key: "back", label: "Bring back", width: "96px", blank: (a) => !a.bring_back, render: (a) => <DateCell date={a.bring_back} kind="plain" /> };
  const dueCol: Column<Action> = { key: "due", label: "Due", width: "84px", render: (a) => <DateCell date={a.due} /> };
  let columns: Column<Action>[];
  if (mode === "waiting") {
    columns = [
      marker,
      doneCol,
      subject,
      ...(groupBy === "who" ? [] : [{ key: "who", label: "Waiting on", width: "132px", render: (a: Action) => a.waiting_who || <span className="dash" aria-hidden="true">–</span> }]),
      { key: "since", label: "Since", width: "84px", drop: 1, render: (a) => <DateCell date={a.waiting_since} kind="plain" /> },
      { key: "follow", label: "Follow up", width: "88px", blank: (a) => !a.followup, render: (a) => <DateCell date={a.followup} /> },
      projCol,
      { ...ctxCol, optional: true },
      { ...dueCol, optional: true },
      areaCol,
      createdCol,
      updatedCol,
    ];
  } else if (mode === "someday") {
    columns = [marker, doneCol, subject, ...(groupBy === "project" ? [] : [projCol]), ctxCol, backCol, { ...dueCol, optional: true }, areaCol, createdCol, updatedCol];
  } else if (mode === "done") {
    columns = [
      marker,
      doneCol,
      subject,
      projCol,
      ctxCol,
      // Grouped by day, the group heading already carries the date.
      ...(groupBy === "none" ? [] : [{ key: "when", label: "Done", width: "96px", render: (a: Action) => <DateCell date={a.completed_at?.slice(0, 10) ?? null} kind="plain" /> }]),
      areaCol,
      createdCol,
    ];
  } else {
    columns = [
      marker,
      doneCol,
      subject,
      ...(groupBy === "context" ? [] : [ctxCol]),
      ...(groupBy === "project" ? [] : [projCol]),
      dueCol,
      { key: "defer", label: "Start", width: "80px", drop: 1, blank: (a) => !a.defer, render: (a) => <DateCell date={a.defer} kind="defer" /> },
      { key: "time", label: "Time", width: "52px", align: "end", drop: 3, render: (a) => <TimeCell min={a.time_min} /> },
      { key: "energy", label: "Energy", width: "62px", drop: 2, render: (a) => <Energy level={a.energy} /> },
      areaCol,
      { ...backCol, optional: true },
      repeatCol,
      createdCol,
      updatedCol,
    ];
  }

  const empty =
    mode === "next" ? (
      <EmptyState title="No next actions yet" lines={["Add an action here, or capture to the Inbox and clarify what you have captured."]} action={{ label: "New action", run: act.create }} />
    ) : mode === "waiting" ? (
      <EmptyState title="Nothing delegated" lines={["Delegate any action and it waits here, with who and since when."]} action={{ label: "New waiting for", run: act.create }} />
    ) : mode === "someday" ? (
      <EmptyState title="No someday items" lines={["Move any action or project here when it can wait."]} action={{ label: "New someday action", run: act.create }} />
    ) : (
      <EmptyState title="Nothing done yet" lines={["Completed actions are logged here by day."]} />
    );

  const grid = (
    <Grid
      listId={mode}
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      reorder={reorder}
      // Touch: swipe right to complete (or bring a done row back), left to trash; both undo with the toast.
      swipe={
        mode === "done"
          ? { right: { label: "Not done", run: (id) => act.reopenOne(id) } }
          : {
              right: { label: "Done", run: (id) => (s.actions.find((a) => a.id === id)?.status === "done" ? act.reopenOne(id) : act.completeOne(id)) },
              left: {
                label: "Trash",
                run: (id) => {
                  const a = s.actions.find((x) => x.id === id);
                  if (a) mutate(`“${a.title || "Untitled action"}” trashed`, [{ type: "patch", table: "actions", id, data: { status: "trashed" } }]);
                },
              },
            }
      }
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
        ].join(" ")
      }
      onOpen={(k) => ui.openDetail({ kind: "action", id: k }, true)}
      empty={empty}
    />
  );
  if (!fit) return grid;
  // While the list is narrowed, a quiet line above it says so, how much it hides, and how to see everything again.
  // The heading carries the count (so many of so many fit); the line names where you are.
  return (
    <>
      <div className="fit-bar" role="status">
        <span>
          Fits <strong>{fitLabel(fit)}</strong>
        </span>
        <button type="button" className="text-btn" onClick={() => openFit(ui)}>
          Change
        </button>
        <button type="button" className="text-btn" onClick={() => setFit(null)}>
          Show all
        </button>
      </div>
      {grid}
    </>
  );
}
