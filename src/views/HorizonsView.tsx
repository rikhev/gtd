import { useEffect, useMemo, useState } from "react";
import { Compass, Eye, Target } from "lucide-react";
import { quote, getState, mutate, patchMany, plural, stamp, useTables } from "../store.ts";
import { useUI, type UI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, stepRows, useListNav, isGroupKey, type Column, type GridGroup } from "../components/Grid.tsx";
import { AreaName, DateCell } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { areaItems } from "../actionCommands.tsx";
import { HORIZON_KINDS, newHorizon } from "../horizons.ts";
import type { Horizon, ID, Op } from "../../shared/types.ts";

const ICON = { purpose: Compass, vision: Eye, goal: Target } as const;

/**
 * Horizons (GTD's higher horizons of focus): purpose and principles, vision (3–5 years), goals (1–2 years). Areas,
 * the horizon below, are managed in Settings › Areas and group the Projects list; projects name the goal they serve.
 */
export function HorizonsView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useTables("horizons", "projects", "areas");
  const [editing, setEditing] = useState<ID | null>(null);

  const groups: GridGroup<Horizon>[] = useMemo(
    () =>
      HORIZON_KINDS.map(({ kind, label, note }) => {
        const rows = s.horizons.filter((h) => h.kind === kind && h.status !== "trashed").sort((a, b) => a.sort - b.sort);
        // An achieved goal (or a vision come true) stays, struck through, at the foot of its group.
        return { key: kind, label, meta: <span className="muted-text">{note}</span>, rows: [...rows.filter((h) => h.status === "active"), ...rows.filter((h) => h.status === "done")] };
      }),
    [s.horizons],
  );
  const all = groups.flatMap((g) => g.rows);
  const nav = useListNav("horizons", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((h) => h.id), showHeader: true })), [groups]));
  const focus = all.find((h) => h.id === nav.focus);
  const targets = () => nav.targets().filter((k) => !isGroupKey(k));
  /** One horizon by its name, several by their count. */
  const hName = (ids: ID[]) => (ids.length === 1 ? `“${all.find((h) => h.id === ids[0])?.title || "Untitled"}”` : plural(ids.length, "horizon"));
  const serving = (id: ID) => s.projects.filter((p) => p.goal_id === id && p.status === "active").length;

  useEffect(() => {
    ui.followDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** N: a new one in the group the cursor is in (a goal when it is nowhere yet). */
  const create = () => {
    const kind = (nav.focus ? (isGroupKey(nav.focus) ? nav.focus.slice(6) : focus?.kind) : "goal") as Horizon["kind"];
    const h = newHorizon(kind ?? "goal");
    mutate("New", [{ type: "create", table: "horizons", row: { ...h } }], { silent: true });
    nav.setFocus(h.id);
    setEditing(h.id);
  };
  const toggleDone = (ids: ID[]) => {
    const rows = all.filter((h) => ids.includes(h.id));
    if (!rows.length) return;
    const reopen = rows.every((h) => h.status === "done");
    patchMany("horizons", rows.map((h) => h.id), reopen ? { status: "active", completed_at: null } : { status: "done", completed_at: stamp() }, reopen ? `${plural(rows.length, "horizon")} current again` : rows.length === 1 ? `“${rows[0].title}” achieved` : `${plural(rows.length, "horizon")} achieved`);
  };
  const reorder = (dir: -1 | 1) => {
    const moved = stepRows(groups, (h) => h.id, (h) => h.sort, (h) => h.status === "active", targets(), dir);
    if (moved) mutate("Reordered", [...moved].map(([id, at]): Op => ({ type: "patch", table: "horizons", id, data: { sort: at } })), { silent: true });
  };
  const goals = () => targets().filter((id) => all.find((h) => h.id === id)?.kind === "goal");

  const commands: Command[] = [
    ...nav.commands,
    { id: "hz.new", label: "New (in this group)", group: "Horizons", keys: ["n"], run: create },
    { id: "hz.rename", row: true, label: "Rename", group: "Horizons", keys: ["f2", "enter"], enabled: Boolean(focus), run: () => focus && setEditing(focus.id) },
    { id: "hz.done", row: true, label: "Mark achieved, or current again", group: "Horizons", keys: ["e"], enabled: Boolean(focus), run: () => toggleDone(targets()) },
    { id: "hz.area", row: true, label: "Set the goal's area", group: "Fields", keys: ["a"], enabled: goals().length > 0, run: () => setArea(ui, goals()) },
    { id: "hz.target", row: true, label: "Set target date", group: "Fields", keys: ["s"], enabled: goals().length > 0, run: () => setTarget(ui, goals()) },
    { id: "hz.up", row: true, label: "Move row up", group: "Horizons", keys: ["alt+arrowup"], enabled: Boolean(focus), run: () => reorder(-1) },
    { id: "hz.down", row: true, label: "Move row down", group: "Horizons", keys: ["alt+arrowdown"], enabled: Boolean(focus), run: () => reorder(1) },
    {
      id: "hz.trash",
      row: true,
      label: "Trash",
      group: "Horizons",
      keys: ["backspace", "delete"],
      enabled: Boolean(focus),
      run: () => {
        const ids = targets();
        // A goal's projects keep naming it while it is in the Trash (nothing shows it there), so restoring it relinks
        // them; the links go only when the Trash removes the goal for good (GTD audit).
        mutate(`${hName(ids)} trashed`, ids.map((id): Op => ({ type: "patch", table: "horizons", id, data: { status: "trashed" } })));
      },
    },
    {
      id: "hz.delete",
      row: true,
      label: "Delete permanently",
      group: "Horizons",
      keys: ["shift+backspace", "shift+delete"],
      enabled: Boolean(focus),
      run: () => {
        const ids = targets();
        // Gone for good, a goal's projects stop naming it (⌘Z brings both back).
        const linked = getState().projects.filter((p) => p.goal_id && ids.includes(p.goal_id));
        mutate(`${hName(ids)} deleted permanently`, [
          ...linked.map((p): Op => ({ type: "patch", table: "projects", id: p.id, data: { goal_id: null } })),
          ...ids.map((id): Op => ({ type: "delete", table: "horizons", id })),
        ]);
      },
    },
  ];
  useCommands("list:horizons", commands, { priority: 10, active: regionActive });

  const columns: Column<Horizon>[] = [
    {
      key: "mark",
      label: "",
      width: "30px",
      render: (h) => {
        const I = ICON[h.kind];
        return (
          <span className="kind-icon">
            <I size={14} strokeWidth={1.75} aria-hidden />
          </span>
        );
      },
    },
    {
      key: "subject",
      label: "Horizon",
      width: "minmax(240px, 2fr)",
      render: (h) =>
        editing === h.id ? (
          <InlineEdit
            value={h.title}
            onDone={(v) => {
              setEditing(null);
              const title = v.trim();
              if (!title && !h.title) return mutate("Discarded", [{ type: "delete", table: "horizons", id: h.id }], { silent: true });
              if (title && title !== h.title) mutate(`Renamed ${quote(title)}`, [{ type: "patch", table: "horizons", id: h.id, data: { title } }]);
            }}
          />
        ) : (
          <span className="subject">
            <span className="subject-text">{h.title || "Untitled"}</span>
          </span>
        ),
    },
    {
      key: "area",
      label: "Area",
      width: "minmax(100px, 0.8fr)",
      drop: 2,
      blank: (h) => !h.area_id,
      render: (h) => {
        const a = s.areas.find((x) => x.id === h.area_id);
        return a ? <AreaName name={a.name} color={a.color} /> : <span className="dash" aria-hidden="true">–</span>;
      },
    },
    {
      key: "projects",
      label: "Projects",
      width: "84px",
      align: "end",
      // How many active projects serve a goal; a goal with none is said so, quietly.
      blank: (h) => h.kind !== "goal",
      render: (h) => (h.kind !== "goal" ? null : serving(h.id) ? <span className="num muted-text">{serving(h.id)}</span> : <span className="muted-text">none yet</span>),
    },
    { key: "target", label: "By", width: "100px", drop: 1, blank: (h) => !h.target, render: (h) => <DateCell date={h.target} kind="plain" /> },
  ];

  return (
    <Grid
      listId="horizons"
      columns={columns}
      groups={groups}
      getKey={(h) => h.id}
      nav={nav}
      active={regionActive}
      showHeaders
      rowClass={(h) => (h.status === "done" ? "is-done" : "")}
      onOpen={(k) => setEditing(k)}
      empty={
        <EmptyState
          title="No horizons yet"
          lines={[
            "Above your areas: goals for the next year or two, a vision for three to five years, and the purpose and principles behind it all.",
            "Projects name the goal they serve, so the Weekly Review can ask whether each goal has the projects it needs.",
          ]}
          action={{ label: "New goal", run: create }}
        />
      }
    />
  );
}

function setArea(ui: UI, ids: ID[]) {
  ui.openPicker({
    type: "list",
    title: "Area",
    items: areaItems(),
    current: ids.length === 1 ? (getState().horizons.find((h) => h.id === ids[0])?.area_id ?? null) : null,
    noneLabel: "No area",
    onPick: (area_id) => patchMany("horizons", ids, { area_id }, area_id ? `Area: #${getState().areas.find((a) => a.id === area_id)?.name ?? ""}` : "No area"),
  });
}

function setTarget(ui: UI, ids: ID[]) {
  ui.openPicker({
    type: "date",
    title: "Target date",
    current: ids.length === 1 ? (getState().horizons.find((h) => h.id === ids[0])?.target ?? null) : null,
    onPick: (target) => patchMany("horizons", ids, { target }, target ? `Target ${target}` : "Target cleared"),
  });
}
