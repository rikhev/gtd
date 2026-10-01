import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { quote, completeActions, getState, mutate, named, newAction, patchMany, plural, refUpdated, stamp, uid, upload, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, useSort, sortGroups, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { DateCell, Lamp, Marker } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { actionRowCommands, editors, setProject } from "../actionCommands.tsx";
import { projectEditors } from "./ProjectsView.tsx";
import { formatDate } from "../../shared/dates.ts";
import type { ID, Op, Ref } from "../../shared/types.ts";

/* ------------------------------------------------------------------ */
/* Someday / Maybe: someday projects and someday actions together       */
/* ------------------------------------------------------------------ */

type SomedayRow = { key: string; kind: "project" | "action"; id: ID; title: string; bring_back: string | null; project?: string };

export function SomedayView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [editing, setEditing] = useState<string | null>(null);
  const aEd = editors(ui);
  const pEd = projectEditors(ui);

  const [sort, setSort] = useSort("someday");
  const sorters: Sorters<SomedayRow> = useMemo(() => ({ subject: (r) => r.title, proj: (r) => r.project, back: (r) => r.bring_back }), []);
  const baseGroups: GridGroup<SomedayRow>[] = useMemo(() => {
    const projects = s.projects
      .filter((p) => p.status === "someday")
      .sort((a, b) => a.sort - b.sort)
      .map((p) => ({ key: `p:${p.id}`, kind: "project" as const, id: p.id, title: p.title, bring_back: p.bring_back }));
    const actions = s.actions
      .filter((a) => a.status === "someday")
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({
        key: `a:${a.id}`,
        kind: "action" as const,
        id: a.id,
        title: a.title,
        bring_back: a.bring_back,
        project: s.projects.find((p) => p.id === a.project_id)?.title,
      }));
    return [
      { key: "projects", label: "Projects", rows: projects },
      { key: "actions", label: "Actions", rows: actions },
    ];
  }, [s.projects, s.actions]);
  const groups = useMemo(() => sortGroups(baseGroups, sorters, sort), [baseGroups, sorters, sort]);

  const nav = useListNav("someday", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: true })), [groups]));
  const all = groups.flatMap((g) => g.rows);
  const pick = (kind: "project" | "action") =>
    nav
      .targets()
      .map((k) => all.find((r) => r.key === k))
      .filter((r): r is SomedayRow => Boolean(r && r.kind === kind))
      .map((r) => r.id);
  const focusRow = all.find((r) => r.key === nav.focus);
  const has = Boolean(focusRow) || nav.selected.size > 0;

  useEffect(() => {
    if (ui.revealTarget && (ui.revealTarget.kind === "action" || ui.revealTarget.kind === "project")) {
      nav.setFocus(`${ui.revealTarget.kind === "action" ? "a" : "p"}:${ui.revealTarget.id}`);
      ui.clearReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget]);

  useEffect(() => {
    ui.followDetail(focusRow ? { kind: focusRow.kind, id: focusRow.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow?.key]);

  const activate = () => {
    const a = pick("action");
    const p = pick("project");
    const ops: Op[] = [
      ...a.map((id) => ({ type: "patch" as const, table: "actions" as const, id, data: { status: "next" } })),
      ...p.map((id) => ({ type: "patch" as const, table: "projects" as const, id, data: { status: "active" } })),
    ];
    mutate(`${someName(a, p)} activated`, ops);
  };
  const newSomeday = () => {
    const a = newAction({ status: "someday" });
    mutate("New someday action", [{ type: "create", table: "actions", row: { ...a } }], { silent: true });
    nav.setFocus(`a:${a.id}`);
    setEditing(`a:${a.id}`);
  };
  /** One item by its name ("“Learn Italian”"), several by their count. */
  const someName = (a: ID[], p: ID[]) => (a.length + p.length === 1 ? (a.length ? named("actions", a, "action") : named("projects", p, "project")) : plural(a.length + p.length, "item"));
  /** E is Done here as everywhere: a someday action is done, a someday project complete. */
  const done = () => {
    const a = pick("action");
    const p = pick("project");
    if (a.length) completeActions(a);
    if (p.length) pEd.complete(p);
  };
  const trash = (permanent: boolean) => {
    const a = pick("action");
    const p = pick("project");
    if (!a.length && !p.length) return;
    // A project goes with the actions in it, as on Projects.
    const projectActions = getState().actions.filter((x) => x.project_id && p.includes(x.project_id) && x.status !== "done" && !a.includes(x.id)).map((x) => x.id);
    mutate(`${someName(a, p)} ${permanent ? "deleted permanently" : "trashed"}`, [
      ...[...a, ...projectActions].map((id): Op => (permanent && a.includes(id) ? { type: "delete", table: "actions", id } : { type: "patch", table: "actions", id, data: { status: "trashed" } })),
      ...p.map((id): Op => (permanent ? { type: "delete", table: "projects", id } : { type: "patch", table: "projects", id, data: { status: "trashed" } })),
    ]);
  };

  const commands: Command[] = [
    ...nav.commands,
    {
      id: "some.new",
      label: "New someday action",
      group: "Someday",
      keys: ["n"],
      run: newSomeday,
    },
    {
      id: "some.jump",
      row: true,
      label: focusRow?.kind === "project" ? "Jump to its next action" : "Jump to its project",
      group: "Someday",
      keys: ["j"],
      enabled: Boolean(focusRow),
      run: () => focusRow && (focusRow.kind === "project" ? ui.jumpToAction(focusRow.id) : ui.jumpToProject(focusRow.id)),
    },
    { id: "some.open", row: true, label: "Open details", group: "Someday", keys: ["enter"], enabled: Boolean(focusRow), run: () => focusRow && ui.openDetail({ kind: focusRow.kind, id: focusRow.id }, true) },
    { id: "some.rename", row: true, label: "Rename", group: "Someday", keys: ["f2"], enabled: Boolean(focusRow), run: () => focusRow && setEditing(focusRow.key) },
    // A activates, as on the Weekly Review's Someday step; E is Done, as everywhere.
    { id: "some.activate", row: true, label: "Activate (make it current)", group: "Someday", keys: ["a"], enabled: has, run: activate },
    { id: "some.done", row: true, label: "Mark done (a project: complete it)", group: "Someday", keys: ["e"], enabled: has, run: done },
    { id: "some.back", row: true, label: "Bring back on (tickler)", group: "Fields", keys: ["b"], enabled: has, run: () => (pick("action").length ? aEd.date(pick("action"), "bring_back") : pEd.date(pick("project"), "bring_back")) },
    { id: "some.move", row: true, label: "Move", group: "Someday", keys: ["v"], enabled: has, run: () => (pick("action").length ? aEd.move(pick("action")) : pEd.move(pick("project"))) },
    { id: "some.trash", row: true, label: "Trash", group: "Someday", keys: ["backspace", "delete"], enabled: has, run: () => trash(false) },
    { id: "some.delete", row: true, label: "Delete permanently", group: "Someday", keys: ["shift+backspace", "shift+delete"], enabled: has, run: () => trash(true) },
    // A someday action takes the same field keys as anywhere else (C, P, D, S, M, G, R, H, ⇧P, ⇧F).
    ...actionRowCommands(ui, {
      targets: () => pick("action"),
      focusId: focusRow?.kind === "action" ? focusRow.id : null,
      group: "Someday",
      skip: ["row.open", "row.jump", "row.rename", "row.move", "row.bringback", "row.trash", "row.delete"],
    }),
  ];
  useCommands("list:someday", commands, { priority: 10, active: regionActive });

  const columns: Column<SomedayRow>[] = [
    { key: "mark", label: "", width: "30px", render: (r) => (r.kind === "project" ? <Lamp health="someday" /> : <Marker />) },
    {
      key: "subject",
      // Mixed rows (actions and projects) are items, as in Done and the Trash.
      label: "Item",
      width: "minmax(240px, 2fr)",
      render: (r) =>
        editing === r.key ? (
          <InlineEdit
            value={r.title}
            placeholder={r.kind === "project" ? "Name the project" : "Describe something you might do"}
            onDone={(v) => {
              setEditing(null);
              const table = r.kind === "project" ? "projects" : "actions";
              if (!v.trim() && !r.title) mutate("Discarded", [{ type: "delete", table, id: r.id }], { silent: true });
              else if (v.trim() !== r.title) mutate(`Renamed ${quote(v)}`, [{ type: "patch", table, id: r.id, data: { title: v.trim() } }]);
            }}
          />
        ) : (
          <span className="subject">
            <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title || "Untitled"}</span>
          </span>
        ),
    },
    { key: "proj", label: "Project", width: "minmax(120px, 1fr)", blank: (r) => !r.project, render: (r) => (r.project ? <span className="proj-cell">{r.project}</span> : <span className="dash" aria-hidden="true">–</span>) },
    { key: "back", label: "Bring back", width: "100px", blank: (r) => !r.bring_back, render: (r) => <DateCell date={r.bring_back} kind="plain" /> },
  ];

  return (
    <Grid
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      listId="someday"
      columns={columns}
      groups={groups}
      getKey={(r) => r.key}
      nav={nav}
      active={regionActive}
      showHeaders
      onOpen={() => focusRow && ui.openDetail({ kind: focusRow.kind, id: focusRow.id }, true)}
      empty={<EmptyState title="Nothing on Someday / Maybe" lines={["Move actions or projects here when they can wait."]} action={{ label: "New someday action", run: newSomeday }} />}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Reference                                                            */
/* ------------------------------------------------------------------ */

export function ReferenceView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [editing, setEditing] = useState<ID | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filesBy = useMemo(() => {
    const m = new Map<string, number>();
    s.files.forEach((f) => f.owner_kind === "ref" && m.set(f.owner_id, (m.get(f.owner_id) ?? 0) + 1));
    return m;
  }, [s.files]);
  // A–Z by title is the list's own order; a heading click sorts by that column instead.
  const [sort, setSort] = useSort("reference");
  const sorters: Sorters<Ref> = useMemo(
    () => ({ subject: (r) => r.title, proj: (r) => s.projects.find((p) => p.id === r.project_id)?.title, files: (r) => filesBy.get(r.id) ?? null, created: (r) => r.created_at, updated: (r) => refUpdated(s, r) }),
    [s, filesBy],
  );
  const rows = useMemo(
    () => sortGroups([{ key: "refs", label: "", rows: s.refs.filter((r) => r.status === "active").sort((a, b) => a.title.localeCompare(b.title)) }], sorters, sort)[0].rows,
    [s.refs, sorters, sort],
  );
  const nav = useListNav("reference", useMemo(() => [{ key: "refs", rowKeys: rows.map((r) => r.id), showHeader: false }], [rows]));
  const focusId = nav.focus;

  useEffect(() => {
    ui.followDetail(focusId ? { kind: "ref", id: focusId } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  useEffect(() => {
    if (ui.revealTarget?.kind === "ref") {
      nav.setFocus(ui.revealTarget.id);
      ui.clearReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget]);

  const create = () => {
    const id = uid();
    mutate("New reference", [{ type: "create", table: "refs", row: { id, title: "", notes: "", project_id: null, status: "active", created_at: stamp() } }], { silent: true });
    nav.setFocus(id);
    setEditing(id);
  };
  const commands: Command[] = [
    ...nav.commands,
    {
      id: "ref.new",
      label: "New reference",
      group: "Reference",
      keys: ["n"],
      run: () => create(),
    },
    {
      // Typing a title finds it (the list's letters are its commands, so the typing happens in a picker): what starts
      // with the words comes first. ⌥Q searches inside notes and files as well.
      id: "ref.find",
      label: "Find a reference by its title",
      group: "Reference",
      keys: ["/"],
      enabled: rows.length > 0,
      run: () =>
        ui.openPicker({
          type: "list",
          title: "Find a reference",
          items: [...rows].sort((a, b) => a.title.localeCompare(b.title)).map((r) => ({ id: r.id, label: r.title || "Untitled", hint: s.projects.find((p) => p.id === r.project_id)?.title })),
          current: focusId,
          onPick: (id) => id && nav.setFocus(id),
        }),
    },
    { id: "ref.open", row: true, label: "Open details", group: "Reference", keys: ["enter"], enabled: Boolean(focusId), run: () => focusId && ui.openDetail({ kind: "ref", id: focusId }, true) },
    { id: "ref.rename", row: true, label: "Rename", group: "Reference", keys: ["f2"], enabled: Boolean(focusId), run: () => focusId && setEditing(focusId) },
    { id: "ref.jump", row: true, label: "Jump to its project", group: "Reference", keys: ["j"], enabled: Boolean(focusId), run: () => focusId && ui.jumpFromSupport("ref", focusId) },
    {
      id: "ref.project",
      row: true,
      label: "Set project",
      group: "Fields",
      keys: ["p"],
      enabled: Boolean(focusId),
      run: () => setProject(ui, "refs", nav.targets()),
    },
    { id: "ref.attach", row: true, label: "Attach file", group: "Reference", keys: ["mod+o"], enabled: Boolean(focusId), run: () => fileInput.current?.click() },
    {
      id: "ref.trash",
      row: true,
      label: "Trash",
      group: "Reference",
      keys: ["backspace", "delete"],
      enabled: Boolean(focusId),
      run: () => patchMany("refs", nav.targets(), { status: "trashed" }, `${named("refs", nav.targets(), "reference")} trashed`),
    },
    {
      id: "ref.delete",
      row: true,
      label: "Delete permanently",
      group: "Reference",
      keys: ["shift+backspace", "shift+delete"],
      enabled: Boolean(focusId),
      run: () => mutate(`${named("refs", nav.targets(), "reference")} deleted permanently`, nav.targets().map((id): Op => ({ type: "delete", table: "refs", id }))),
    },
  ];
  useCommands("list:reference", commands, { priority: 10, active: regionActive });

  const columns: Column<Ref>[] = [
    {
      key: "subject",
      label: "Reference",
      width: "minmax(240px, 2fr)",
      render: (r) =>
        editing === r.id ? (
          <InlineEdit
            value={r.title}
            placeholder="Title the reference"
            onDone={(v) => {
              setEditing(null);
              if (!v.trim() && !r.title) mutate("Discarded", [{ type: "delete", table: "refs", id: r.id }], { silent: true });
              else if (v.trim() !== r.title) mutate(`Renamed ${quote(v)}`, [{ type: "patch", table: "refs", id: r.id, data: { title: v.trim() } }]);
            }}
          />
        ) : (
          <span className="subject">
            <span className="subject-text">{r.title || "Untitled"}</span>
            {r.notes && <span className="subject-more">{r.notes.split("\n")[0]}</span>}
          </span>
        ),
    },
    { key: "proj", label: "Project", width: "minmax(120px, 1fr)", blank: (r) => !r.project_id, render: (r) => <span className="proj-cell">{s.projects.find((p) => p.id === r.project_id)?.title ?? <span className="dash" aria-hidden="true">–</span>}</span> },
    {
      key: "files",
      label: "Files",
      width: "64px",
      blank: (r) => !filesBy.get(r.id),
      render: (r) =>
        filesBy.get(r.id) ? (
          <span className="files-count">
            <Paperclip size={12} strokeWidth={2} aria-hidden /> {filesBy.get(r.id)}
            <span className="visually-hidden"> {filesBy.get(r.id) === 1 ? "file" : "files"}</span>
          </span>
        ) : (
          <span className="dash" aria-hidden="true">–</span>
        ),
    },
    // On a narrow screen, and on a phone, Created steps aside for Updated: when it last changed is what helps you find a thing.
    { key: "created", label: "Created", width: "96px", drop: 1, render: (r) => <span className="date">{formatDate(r.created_at.slice(0, 10))}</span> },
    {
      key: "updated",
      label: "Updated",
      width: "96px",
      // Empty until it has changed since it was filed; the column steps aside while nothing has.
      blank: (r) => !(refUpdated(s, r) > r.created_at),
      render: (r) => {
        const at = refUpdated(s, r);
        return at > r.created_at ? <span className="date">{formatDate(at.slice(0, 10))}</span> : <span className="dash" aria-hidden="true">–</span>;
      },
    },
  ];

  return (
    <>
      <Grid
        sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
        listId="reference"
        columns={columns}
        groups={[{ key: "refs", label: "", rows }]}
        getKey={(r) => r.id}
        nav={nav}
        active={regionActive}
        showHeaders={false}
        onOpen={(k) => ui.openDetail({ kind: "ref", id: k }, true)}
        empty={<EmptyState title="No reference material" lines={["Add a note here, or file non-actionable stuff here when you clarify the Inbox."]} action={{ label: "New reference", run: create }} />}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files && focusId) void upload(e.target.files, { kind: "ref", id: focusId });
          e.target.value = "";
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Areas of focus                                                       */
/* ------------------------------------------------------------------ */

