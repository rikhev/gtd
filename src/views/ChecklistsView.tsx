import { useEffect, useMemo, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import { getState, mutate, notify, patchMany, plural, stamp, uid, useTables } from "../store.ts";
import { useUI, type UI } from "../ui.tsx";
import { pressedByTouch, useCommands, type Command } from "../keys.ts";
import { Grid, bakeDrop, stepRows, useListNav, usePersisted, useSort, sortGroups, isGroupKey, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { AreaName, DoneBox } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { areaItems, createAreaOp, quickAddNextAction } from "../actionCommands.tsx";
import {
  checklistNamed,
  history,
  historyTitle,
  isTicked,
  itemsOf,
  newChecklist,
  openChecklist,
  progress,
  progressLabel,
  repeatsLabel,
  setRepeats,
  startOver,
  streak,
  streakLabel,
  tickItems,
  touchChecklist,
  useOpenChecklist,
  type Repeats,
} from "../checklists.ts";
import { formatDate } from "../../shared/dates.ts";
import { setChecklistProject } from "../support.ts";
import type { Checklist, ChecklistItem, ID, Op } from "../../shared/types.ts";

/**
 * Checklists (GTD's checklists, their own category apart from Reference): every checklist, or one checklist's items. Enter opens a
 * checklist, Esc comes back up; each level has its own address.
 */
export function ChecklistsView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const openId = useOpenChecklist();
  const s = useTables("checklists");
  const open = openId ? s.checklists.find((c) => c.id === openId && c.status === "active") : undefined;
  // An address for a checklist that is gone (deleted, or never there) lands on every checklist instead.
  useEffect(() => {
    if (openId && !open) {
      window.history.replaceState(null, "", "#checklists");
      openChecklist(null, false);
    }
  }, [openId, open]);
  // Checklists have no details of their own: the pane, if pinned, has nothing to show here.
  useEffect(() => {
    ui.followDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  return open ? <ChecklistItems key={open.id} list={open} regionActive={regionActive} /> : <ChecklistIndex regionActive={regionActive} />;
}

/* ------------------------------------------------------------------ */
/* Every checklist                                                      */
/* ------------------------------------------------------------------ */

function ChecklistIndex({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useTables("checklists", "checklist_items", "checklist_ticks", "areas", "projects");
  const [editing, setEditing] = useState<{ id: ID; fresh: boolean } | null>(null);
  const [byArea, setByArea] = usePersisted<boolean>("checklists:byArea", true);
  const [sort, setSort] = useSort("checklists");

  const lists = useMemo(() => s.checklists.filter((c) => c.status === "active").sort((a, b) => a.sort - b.sort), [s.checklists]);
  const areaById = useMemo(() => new Map(s.areas.map((a) => [a.id, a])), [s.areas]);
  // Grouped by area as Projects are, once any checklist has one; otherwise one plain list.
  const grouped = byArea && lists.some((c) => c.area_id && areaById.has(c.area_id));
  const sorters: Sorters<Checklist> = useMemo(
    () => ({
      subject: (c) => c.title,
      area: (c) => areaById.get(c.area_id ?? "")?.name,
      repeats: (c) => (c.repeats === "day" ? 1 : c.repeats === "week" ? 2 : null),
      proj: (c) => s.projects.find((p) => p.id === c.project_id)?.title,
      items: (c) => progress(s, c.id).total,
      run: (c) => {
        const p = progress(s, c.id);
        return p.ticked ? p.ticked / Math.max(1, p.total) : null;
      },
      finished: (c) => c.finished_at,
    }),
    [s, areaById],
  );
  const groups: GridGroup<Checklist>[] = useMemo(() => {
    if (!grouped) return sortGroups([{ key: "all", label: "", rows: lists }], sorters, sort);
    const areas = [...s.areas].sort((a, b) => a.sort - b.sort);
    return sortGroups(
      [
        ...areas.map((a) => ({ key: a.id, label: `#${a.name}`, areaColor: a.color ?? "", rows: lists.filter((c) => c.area_id === a.id) })).filter((g) => g.rows.length),
        { key: "none", label: "No area", rows: lists.filter((c) => !c.area_id || !areaById.has(c.area_id)) },
      ].filter((g) => g.rows.length || g.key !== "none"),
      sorters,
      sort,
    );
  }, [grouped, lists, s.areas, areaById, sorters, sort]);

  const nav = useListNav("checklists", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((c) => c.id), showHeader: grouped })), [groups, grouped]));
  const focusId = nav.focus && !isGroupKey(nav.focus) ? nav.focus : null;
  const targets = () => nav.targets().filter((k) => !isGroupKey(k));
  // Start over is for a checklist run by hand; a repeating one starts over by itself.
  const anyTicked = (ids: ID[]) => s.checklist_items.some((i) => ids.includes(i.checklist_id) && i.checked_at && !s.checklists.find((c) => c.id === i.checklist_id)?.repeats);

  const create = () => {
    // A new checklist joins the area group the cursor is in.
    let area: ID | null = null;
    if (grouped && nav.focus) {
      const g = isGroupKey(nav.focus) ? nav.focus.slice(6) : groups.find((x) => x.rows.some((c) => c.id === nav.focus))?.key;
      if (g && areaById.has(g)) area = g;
    }
    const c = newChecklist({ area_id: area });
    mutate("New checklist", [{ type: "create", table: "checklists", row: { ...c } }], { silent: true });
    nav.setFocus(c.id);
    setEditing({ id: c.id, fresh: true });
  };
  const reorder = (dir: -1 | 1) => {
    const moved = stepRows(groups, (c) => c.id, (c) => c.sort, () => true, targets(), dir);
    if (!moved) return;
    mutate(sort ? "Moved · now in manual order" : "Reordered", [...moved].map(([id, at]) => ({ type: "patch" as const, table: "checklists" as const, id, data: { sort: at } })), { silent: !sort });
    if (sort) setSort(null);
  };
  const trash = (ids: ID[]) => ids.length && patchMany("checklists", ids, { status: "trashed" }, `${checklistNamed(ids)} trashed`);

  const commands: Command[] = [
    ...nav.commands,
    { id: "cl.new", label: "New checklist", group: "Checklists", keys: ["n"], run: create },
    { id: "cl.open", label: "Open checklist", group: "Checklists", keys: ["enter"], enabled: Boolean(focusId), run: () => focusId && openChecklist(focusId) },
    { id: "cl.rename", label: "Rename", group: "Checklists", keys: ["f2"], enabled: Boolean(focusId), run: () => focusId && setEditing({ id: focusId, fresh: false }) },
    { id: "cl.area", label: "Set area", group: "Fields", keys: ["a"], enabled: Boolean(focusId), run: () => setArea(ui, targets()) },
    { id: "cl.jump", label: "Jump to its project", group: "Checklists", keys: ["j"], enabled: Boolean(focusId), run: () => focusId && ui.jumpFromSupport("checklist", focusId) },
    { id: "cl.project", label: "Set project (support material for it)", group: "Fields", keys: ["p"], enabled: Boolean(focusId), run: () => setChecklistProject(ui, targets()) },
    { id: "cl.repeat", label: "Repeat (a routine: every day or every week)", group: "Fields", keys: ["r"], enabled: Boolean(focusId), run: () => pickRepeats(ui, targets()) },
    { id: "cl.over", label: "Start over (clear the ticks)", group: "Checklists", enabled: anyTicked(targets()), run: () => startOver(targets()) },
    { id: "cl.trash", label: "Trash checklist", group: "Checklists", keys: ["backspace", "delete"], enabled: Boolean(focusId), run: () => trash(targets()) },
    { id: "cl.up", label: "Move row up", group: "Checklists", keys: ["alt+arrowup"], enabled: Boolean(focusId), run: () => reorder(-1) },
    { id: "cl.down", label: "Move row down", group: "Checklists", keys: ["alt+arrowdown"], enabled: Boolean(focusId), run: () => reorder(1) },
    {
      id: "cl.view",
      label: "View: group and sort",
      group: "View",
      keys: ["alt+v"],
      run: () =>
        ui.openPicker({
          type: "list",
          title: "View",
          items: [
            { id: "area", label: byArea ? "Don't group by area" : "Group by area", section: "group" },
            { id: "s:subject", label: "Sort by name", hint: sort?.key === "subject" ? "Current" : "", section: "sort" },
            { id: "s:finished", label: "Sort by last finished", hint: sort?.key === "finished" ? "Current" : "", section: "sort" },
            { id: "s:", label: "Manual order", hint: !sort ? "Current" : "", section: "sort" },
            ...(focusId && anyTicked(targets()) ? [{ id: "over", label: `Start over ${checklistNamed(targets())}`, section: "run" }] : []),
          ],
          onPick: (id) => {
            if (id === "area") setByArea(!byArea);
            if (id?.startsWith("s:")) setSort(id === "s:" ? null : { key: id.slice(2), dir: id === "s:finished" ? -1 : 1 });
            if (id === "over") startOver(targets());
          },
        }),
    },
  ];
  useCommands("list:checklists", commands, { priority: 10, active: regionActive });

  const columns: Column<Checklist>[] = [
    { key: "mark", label: "", width: "30px", render: () => <span className="kind-icon"><ListChecks size={14} strokeWidth={1.75} aria-hidden /></span> },
    {
      key: "subject",
      label: "Checklist",
      width: "minmax(220px, 2fr)",
      render: (c) =>
        editing?.id === c.id ? (
          <InlineEdit
            value={c.title}
            placeholder="Name the checklist: Packing for a trip, Closing the month…"
            onDone={(v, how) => {
              const fresh = editing.fresh;
              setEditing(null);
              const title = v.trim();
              if (!title && !c.title) return mutate("Discarded", [{ type: "delete", table: "checklists", id: c.id }], { silent: true });
              if (title && title !== c.title) mutate(fresh ? `New checklist “${title}”` : "Renamed", [{ type: "patch", table: "checklists", id: c.id, data: { title, updated_at: stamp() } }]);
              // Named with Enter, a new checklist opens at once, ready for its first item.
              if (fresh && title && how === "enter") openChecklist(c.id);
            }}
          />
        ) : (
          <span className="subject">
            <span className="subject-text">{c.title || "Untitled checklist"}</span>
          </span>
        ),
    },
    {
      key: "area",
      label: "Area",
      width: "minmax(100px, 0.8fr)",
      drop: 2,
      // Grouped by area, the heading already says it.
      blank: (c) => grouped || !c.area_id || !areaById.has(c.area_id),
      render: (c) => {
        const a = areaById.get(c.area_id ?? "");
        return a && !grouped ? <AreaName name={a.name} color={a.color} /> : <span className="dash" aria-hidden="true">–</span>;
      },
    },
    {
      key: "proj",
      label: "Project",
      width: "minmax(110px, 1fr)",
      drop: 3,
      // Only checklists that support a project name one; the column steps aside until one does.
      blank: (c) => !s.projects.some((p) => p.id === c.project_id),
      render: (c) => {
        const p = s.projects.find((x) => x.id === c.project_id);
        return p ? <span className="proj-cell">{p.title || "Untitled project"}</span> : <span className="dash" aria-hidden="true">–</span>;
      },
    },
    { key: "items", label: "Items", width: "64px", align: "end", render: (c) => <span className="num muted-text">{progress(s, c.id).total}</span> },
    {
      key: "repeats",
      label: "Repeats",
      width: "96px",
      // Only routines repeat; the column steps aside until one does.
      blank: (c) => !c.repeats,
      render: (c) => (c.repeats ? <span className="muted-text">{repeatsLabel(c.repeats)}</span> : <span className="dash" aria-hidden="true">–</span>),
    },
    {
      key: "run",
      label: "This run",
      // Wide enough for a routine's "All 5 done this week".
      width: "140px",
      // Empty while no run is under way; the column steps aside when none is.
      blank: (c) => !progressLabel(progress(s, c.id)),
      render: (c) => {
        const label = progressLabel(progress(s, c.id));
        return label ? <span className="num cl-run">{label}</span> : <span className="dash" aria-hidden="true">–</span>;
      },
    },
    {
      key: "finished",
      label: "Last finished",
      width: "104px",
      drop: 1,
      blank: (c) => !c.finished_at,
      render: (c) => (c.finished_at ? <span className="date">{formatDate(c.finished_at.slice(0, 10))}</span> : <span className="dash" aria-hidden="true">–</span>),
    },
  ];

  return (
    <Grid
      listId="checklists"
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      columns={columns}
      groups={groups}
      getKey={(c) => c.id}
      nav={nav}
      active={regionActive}
      showHeaders={grouped}
      onOpen={(k) => openChecklist(k)}
      reorder={{
        onMove: (keys, beforeKey, groupKey) => {
          const baked = bakeDrop(groups, (c) => c.id, (c) => c.sort, () => true, keys, beforeKey, groupKey);
          const area = grouped ? (groupKey === "none" ? null : groupKey) : undefined;
          const ops: Op[] = [...baked].map(([id, at]): Op => ({ type: "patch", table: "checklists", id, data: { sort: at, ...(area !== undefined && keys.includes(id) ? { area_id: area } : {}) } }));
          // Dropped into another area's group, it joins that area, and the toast says so.
          const moved = area !== undefined && keys.some((id) => (lists.find((c) => c.id === id)?.area_id ?? null) !== area);
          mutate(moved ? `${checklistNamed(keys)} → ${area ? `#${areaById.get(area)?.name ?? ""}` : "no area"}` : "Moved", ops, { silent: !moved });
          if (sort) setSort(null);
        },
      }}
      empty={
        <EmptyState
          title="No checklists yet"
          lines={[
            "Keep the lists you run again and again: packing for a trip, closing the month, a new starter's first week.",
            "Tick through one when it's relevant, and start over for the next time.",
          ]}
          action={{ label: "New checklist", run: create }}
        />
      }
    />
  );
}

/** A checklist's area, or none; a new one can be typed. */
function setArea(ui: UI, ids: ID[]) {
  if (!ids.length) return;
  const cur = ids.length === 1 ? getState().checklists.find((c) => c.id === ids[0])?.area_id : null;
  const apply = (area_id: ID | null, extra: Op[] = [], name?: string) =>
    mutate(`${checklistNamed(ids)} → ${name ?? (area_id ? `#${getState().areas.find((a) => a.id === area_id)?.name ?? ""}` : "no area")}`, [
      ...extra,
      ...ids.map((id): Op => ({ type: "patch", table: "checklists", id, data: { area_id } })),
    ]);
  ui.openPicker({
    type: "list",
    title: "Area",
    items: areaItems(),
    current: cur ?? null,
    noneLabel: "No area",
    createLabel: (q) => `Create area “${q}”`,
    onCreate: (q) => {
      const { id, op } = createAreaOp(q);
      apply(id, [op], `#${q.replace(/^#+\s*/, "")}`);
    },
    onPick: (id) => apply(id),
  });
}

/* ------------------------------------------------------------------ */
/* One checklist                                                        */
/* ------------------------------------------------------------------ */

function ChecklistItems({ list, regionActive }: { list: Checklist; regionActive: boolean }) {
  const ui = useUI();
  const s = useTables("checklist_items", "checklist_ticks");
  const repeats = list.repeats ?? null;
  const items = useMemo(() => itemsOf(s, list.id), [s, list.id]);
  const [editing, setEditing] = useState<{ id: ID; fresh: boolean } | null>(null);
  // The pen strikes through a ticked item before it greys, as it does for a done action.
  const [striking, setStriking] = useState<Set<ID>>(new Set());

  const nav = useListNav("checklist", useMemo(() => [{ key: "items", rowKeys: items.map((i) => i.id), showHeader: false }], [items]));
  const focus = items.find((i) => i.id === nav.focus);
  const targets = () => nav.targets().filter((id) => items.some((i) => i.id === id));
  const done = (i: ChecklistItem) => !i.section && isTicked(s, i);
  const ticked = items.filter(done).length;

  /** A new row below the cursor (or at the end), named in place. */
  const add = (section: 0 | 1 = 0, after: ChecklistItem | undefined = focus) => {
    const all = itemsOf(getState(), list.id);
    const i = after ? all.findIndex((x) => x.id === after.id) : -1;
    const next = i >= 0 ? all[i + 1] : undefined;
    const sort = after ? (next ? (after.sort + next.sort) / 2 : after.sort + 1) : Math.max(0, ...all.map((x) => x.sort)) + 1;
    const row: ChecklistItem = { id: uid(), checklist_id: list.id, title: "", section, checked_at: null, sort, created_at: stamp() };
    mutate(section ? "New section heading" : "New item", [{ type: "create", table: "checklist_items", row: { ...row } }], { silent: true });
    nav.setFocus(row.id);
    setEditing({ id: row.id, fresh: true });
  };
  // An empty checklist is opened to be filled: the first item is ready to be typed (once, however often React mounts).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!items.length && regionActive) add();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Leaving while a new row is still blank (Back, the rail) leaves no blank row behind.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(
    () => () => {
      const e = editingRef.current;
      const row = e?.fresh ? getState().checklist_items.find((x) => x.id === e.id) : undefined;
      if (row && !row.title.trim()) mutate("Discarded", [{ type: "delete", table: "checklist_items", id: row.id }], { silent: true });
    },
    [],
  );

  const tick = (ids: ID[]) => {
    const rows = items.filter((i) => ids.includes(i.id) && !i.section);
    if (!rows.length) return void (ids.length && notify("A section heading has nothing to tick. L makes it an item."));
    const ticking = rows.some((i) => !done(i));
    if (!ticking) return tickItems(rows.map((i) => i.id));
    // Running down the list: the cursor moves on to the next item still to tick.
    if (rows.length === 1 && focus?.id === rows[0].id) {
      const at = items.findIndex((i) => i.id === focus.id);
      const nextOpen = items.slice(at + 1).find((i) => !i.section && !done(i));
      if (nextOpen) nav.setFocus(nextOpen.id);
    }
    const open = rows.filter((i) => !done(i)).map((i) => i.id);
    setStriking((p) => new Set([...p, ...open]));
    window.setTimeout(() => {
      tickItems(rows.map((i) => i.id));
      setStriking((p) => new Set([...p].filter((id) => !open.includes(id))));
    }, 220);
  };
  const remove = (ids: ID[]) => {
    const rows = items.filter((i) => ids.includes(i.id));
    if (!rows.length) return;
    const name = rows.length === 1 ? `“${rows[0].title || "Untitled"}”` : plural(rows.length, "item");
    // A habit's record goes with it (⌘Z brings both back).
    const records = s.checklist_ticks.filter((k) => rows.some((i) => i.id === k.item_id));
    mutate(`${name} removed`, [
      ...rows.map((i): Op => ({ type: "delete", table: "checklist_items", id: i.id })),
      ...records.map((k): Op => ({ type: "delete", table: "checklist_ticks", id: k.id })),
      touchChecklist(list.id),
    ]);
  };
  const toggleSection = (ids: ID[]) => {
    const rows = items.filter((i) => ids.includes(i.id));
    if (!rows.length) return;
    const make = rows.some((i) => !i.section) ? 1 : 0;
    mutate(make ? `${plural(rows.length, "row")} made section ${rows.length === 1 ? "heading" : "headings"}` : `${plural(rows.length, "heading")} made ${rows.length === 1 ? "an item" : "items"}`, [
      ...rows.map((i): Op => ({ type: "patch", table: "checklist_items", id: i.id, data: { section: make, checked_at: null } })),
      touchChecklist(list.id),
    ]);
  };
  const reorder = (dir: -1 | 1) => {
    const moved = stepRows([{ key: "items", label: "", rows: items }], (i) => i.id, (i) => i.sort, () => true, targets(), dir);
    if (!moved) return;
    mutate("Reordered", [...moved].map(([id, at]): Op => ({ type: "patch", table: "checklist_items", id, data: { sort: at } })), { silent: true });
  };
  const rename = () =>
    ui.openPicker({
      type: "text",
      title: "Rename checklist",
      current: list.title,
      onPick: (v) => {
        const title = (v ?? "").trim();
        if (title && title !== list.title) mutate("Renamed", [{ type: "patch", table: "checklists", id: list.id, data: { title, updated_at: stamp() } }]);
      },
    });
  const back = () => openChecklist(null);

  const commands: Command[] = [
    ...nav.commands,
    { id: "ci.tick", label: "Tick, or untick", group: "Checklist", keys: ["e"], enabled: Boolean(focus), run: () => tick(targets()) },
    { id: "ci.new", label: "New item below", group: "Checklist", keys: ["n"], run: () => add(0) },
    { id: "ci.section", label: "New section heading below", group: "Checklist", run: () => add(1) },
    { id: "ci.makesection", label: focus?.section ? "Make it an item" : "Make it a section heading", group: "Checklist", keys: ["l"], enabled: Boolean(focus), run: () => toggleSection(targets()) },
    { id: "ci.rename", label: "Rewrite", group: "Checklist", keys: ["f2", "enter"], enabled: Boolean(focus), run: () => focus && setEditing({ id: focus.id, fresh: false }) },
    // GTD: a checklist is a trigger for new actions. The item stays as it is; ticking still only ticks.
    { id: "ci.action", label: "New next action from this item", group: "Checklist", keys: ["t"], enabled: Boolean(focus && !focus.section), run: () => focus && quickAddNextAction(ui, focus.title) },
    { id: "ci.remove", label: "Remove", group: "Checklist", keys: ["backspace", "delete"], enabled: Boolean(focus), run: () => remove(targets()) },
    { id: "ci.up", label: "Move row up", group: "Checklist", keys: ["alt+arrowup"], enabled: Boolean(focus), run: () => reorder(-1) },
    { id: "ci.down", label: "Move row down", group: "Checklist", keys: ["alt+arrowdown"], enabled: Boolean(focus), run: () => reorder(1) },
    { id: "ci.over", label: "Start over (clear the ticks)", group: "Checklist", enabled: ticked > 0 && !repeats, run: () => startOver([list.id]) },
    { id: "ci.repeat", label: repeats ? `Repeats ${repeatsLabel(repeats).toLowerCase()}: change` : "Repeat (a routine: every day or every week)", group: "Fields", keys: ["r"], run: () => pickRepeats(ui, [list.id]) },
    { id: "ci.renamelist", label: "Rename checklist", group: "Checklist", run: rename },
    { id: "ci.area", label: "Set the checklist's area", group: "Fields", keys: ["a"], run: () => setArea(ui, [list.id]) },
    { id: "ci.jump", label: "Jump to the project it supports", group: "Checklist", keys: ["j"], run: () => ui.jumpFromSupport("checklist", list.id) },
    { id: "ci.project", label: "Set the project it supports", group: "Fields", keys: ["p"], run: () => setChecklistProject(ui, [list.id]) },
    {
      id: "ci.trashlist",
      label: "Trash this checklist",
      group: "Checklist",
      run: () => {
        back();
        patchMany("checklists", [list.id], { status: "trashed" }, `${checklistNamed([list.id])} trashed`);
      },
    },
    {
      id: "ci.view",
      label: "View: repeat, start over, rename",
      group: "View",
      keys: ["alt+v"],
      run: () =>
        ui.openPicker({
          type: "list",
          title: "View",
          items: [
            ...(ticked && !repeats ? [{ id: "over", label: `Start over (clear ${plural(ticked, "tick")})`, section: "run" }] : []),
            { id: "repeat", label: repeats ? `Repeats ${repeatsLabel(repeats).toLowerCase()}…` : "Repeat every day or week…", section: "run" },
            { id: "rename", label: "Rename checklist", section: "list" },
            { id: "area", label: "Set area", section: "list" },
            { id: "project", label: "Set project", section: "list" },
            { id: "back", label: "Every checklist", section: "go" },
          ],
          onPick: (id) => {
            if (id === "over") startOver([list.id]);
            if (id === "repeat") window.setTimeout(() => pickRepeats(ui, [list.id]), 0);
            if (id === "rename") window.setTimeout(rename, 0);
            if (id === "area") window.setTimeout(() => setArea(ui, [list.id]), 0);
            if (id === "project") window.setTimeout(() => setChecklistProject(ui, [list.id]), 0);
            if (id === "back") back();
          },
        }),
    },
    // After the selection is cleared (nav's Esc), Esc goes back up to every checklist.
    { id: "ci.back", label: "Back to every checklist", group: "Move", keys: ["escape"], run: back },
  ];
  useCommands("list:checklist", commands, { priority: 10, active: regionActive });

  const columns: Column<ChecklistItem>[] = [
    {
      key: "box",
      label: "",
      width: "30px",
      render: (i) => (i.section ? null : <DoneBox done={done(i)} title={i.title || "this item"} onToggle={() => tick([i.id])} label={["Tick", "Untick"]} />),
    },
    {
      key: "subject",
      label: "Item",
      width: "minmax(220px, 1fr)",
      render: (i) =>
        editing?.id === i.id ? (
          <InlineEdit
            value={i.title}
            placeholder={i.section ? "Name the section: Clothes, Papers…" : "What to check or do"}
            onDone={(v, how) => {
              const fresh = editing.fresh;
              setEditing(null);
              const title = v.trim();
              if (!title && !i.title) return mutate("Discarded", [{ type: "delete", table: "checklist_items", id: i.id }], { silent: true });
              if (title && title !== i.title) mutate(fresh ? `Added “${title}”` : "Rewritten", [{ type: "patch", table: "checklist_items", id: i.id, data: { title } }, touchChecklist(list.id)], { silent: fresh });
              // Enter after a new item starts the next one, so a list is typed in one go; Enter on an empty one stops.
              if (fresh && title && how === "enter") window.setTimeout(() => add(0, getState().checklist_items.find((x) => x.id === i.id)), 0);
            }}
          />
        ) : i.section ? (
          <span className="cl-section">
            <span className="visually-hidden">Section: </span>
            {i.title || "Untitled section"}
          </span>
        ) : (
          <span className="subject">
            <span className="subject-text">{i.title || "Untitled"}</span>
          </span>
        ),
    },
    // A routine's habits carry their last four weeks and how long the current run is.
    ...(repeats
      ? [
          { key: "history", label: "Last four weeks", width: repeats === "day" ? "262px" : "88px", drop: 2, render: (i: ChecklistItem) => (i.section ? null : <Strip s={s} item={i} repeats={repeats} />) },
          {
            key: "streak",
            label: "In a row",
            width: "72px",
            align: "end" as const,
            render: (i: ChecklistItem) => (i.section ? null : <span className="num muted-text">{streakLabel(streak(s, i, repeats), repeats)}</span>),
          },
        ]
      : []),
  ];

  return (
    <Grid
      listId="checklist"
      label={list.title || "Checklist"}
      columns={columns}
      groups={[{ key: "items", label: "", rows: items }]}
      getKey={(i) => i.id}
      nav={nav}
      active={regionActive}
      // A checklist needs no column heads; a routine's name its strip and its run.
      head={Boolean(repeats)}
      showHeaders={false}
      rowClass={(i) => [i.section ? "is-section" : "", done(i) ? "is-done" : "", striking.has(i.id) ? "is-striking" : ""].join(" ")}
      // A tap on a phone ticks (running the list is what a phone is for); a double-click rewrites.
      onOpen={(k) => (pressedByTouch() ? tick([k]) : setEditing({ id: k, fresh: false }))}
      swipe={{ right: { label: "Tick", run: (k) => tick([k]) }, left: { label: "Remove", run: (k) => remove([k]) } }}
      reorder={{
        onMove: (keys, beforeKey) => {
          const rest = items.filter((i) => !keys.includes(i.id));
          const at = beforeKey ? rest.findIndex((i) => i.id === beforeKey) : rest.length;
          const moving = items.filter((i) => keys.includes(i.id));
          const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
          const ops = order.flatMap((i, n): Op[] => (i.sort !== n + 1 ? [{ type: "patch", table: "checklist_items", id: i.id, data: { sort: n + 1 } }] : []));
          if (ops.length) mutate("Moved", ops, { silent: true });
        },
      }}
      empty={<EmptyState title="Nothing on this checklist yet" lines={["Add the first item. Enter after each one starts the next."]} action={{ label: "Add an item", run: () => add(0) }} />}
    />
  );
}

/** Repeat every day, every week, or not at all (a checklist run by hand). */
function pickRepeats(ui: UI, ids: ID[]) {
  if (!ids.length) return;
  const cur = ids.length === 1 ? (getState().checklists.find((c) => c.id === ids[0])?.repeats ?? null) : null;
  ui.openPicker({
    type: "list",
    title: "Repeat",
    items: [
      { id: "day", label: "Every day", hint: "Starts over each morning" },
      { id: "week", label: "Every week", hint: "Starts over each week" },
    ],
    current: cur,
    noneLabel: "Don't repeat",
    onPick: (id) => setRepeats(ids, (id as Repeats | null) ?? null),
  });
}

/**
 * A habit's last four weeks as a strip of small squares, oldest first: filled in ink where it was done, empty where
 * not, the current day or week outlined. No colour: green belongs to project health.
 */
function Strip({ s, item, repeats }: { s: Parameters<typeof history>[0]; item: ChecklistItem; repeats: Repeats }) {
  const cells = history(s, item, repeats);
  const n = cells.filter((c) => c.done).length;
  return (
    <span className={`hstrip is-${repeats}`} role="img" aria-label={`Done ${n} of the last ${cells.length} ${repeats === "day" ? "days" : "weeks"}`}>
      {cells.map((c) => (
        <i key={c.day} className={`${c.done ? "is-on" : ""} ${c.now ? "is-now" : ""}`} title={historyTitle(c, repeats)} />
      ))}
    </span>
  );
}
