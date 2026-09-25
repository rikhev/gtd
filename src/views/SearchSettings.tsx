import { useMemo, useState } from "react";
import { mutate, plural, useMeta, useStore } from "../store.ts";
import { useUI, type EntityKind, type ViewId } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, isGroupKey, type Column, type GridGroup } from "../components/Grid.tsx";
import { ContextCode, Tape } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { CONTEXT_COLORS } from "../actionCommands.tsx";
import { promptApiKey, removeApiKey } from "../apiKey.ts";
import type { ID } from "../../shared/types.ts";

/* ------------------------------------------------------------------ */
/* Search                                                               */
/* ------------------------------------------------------------------ */

interface Hit {
  key: string;
  kind: EntityKind;
  id: ID;
  title: string;
  where: string;
  home: ViewId;
}

export function SearchView({ regionActive, query }: { regionActive: boolean; query: string }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const hits: GridGroup<Hit>[] = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const match = (...texts: (string | null | undefined)[]) => {
      const hay = texts.filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    const where = { next: "Next Actions", waiting: "Waiting For", someday: "Someday / Maybe", done: "Done", trashed: "" } as const;
    const home = { next: "next", waiting: "waiting", someday: "someday", done: "done", trashed: "next" } as const;
    const actions = s.actions
      .filter((a) => a.status !== "trashed" && match(a.title, a.notes, a.waiting_who))
      .map((a) => ({ key: `a:${a.id}`, kind: "action" as const, id: a.id, title: a.title, where: where[a.status], home: home[a.status] as ViewId }));
    const projects = s.projects
      .filter((p) => p.status !== "trashed" && match(p.title, p.outcome, p.notes))
      .map((p) => ({ key: `p:${p.id}`, kind: "project" as const, id: p.id, title: p.title, where: p.status === "someday" ? "Someday / Maybe" : "Projects", home: (p.status === "someday" ? "someday" : "projects") as ViewId }));
    const stuff = s.stuff
      .filter((x) => x.status === "inbox" && match(x.text))
      .map((x) => ({ key: `s:${x.id}`, kind: "stuff" as const, id: x.id, title: x.text.split("\n")[0], where: "Inbox", home: "inbox" as ViewId }));
    const refs = s.refs
      .filter((r) => r.status === "active" && match(r.title, r.notes))
      .map((r) => ({ key: `r:${r.id}`, kind: "ref" as const, id: r.id, title: r.title, where: "Reference", home: "reference" as ViewId }));
    return [
      { key: "actions", label: "Actions", rows: actions },
      { key: "projects", label: "Projects", rows: projects },
      { key: "inbox", label: "Inbox", rows: stuff },
      { key: "refs", label: "Reference", rows: refs },
    ].filter((g) => g.rows.length);
  }, [s, query]);

  const nav = useListNav("search", useMemo(() => hits.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: true })), [hits]));
  const all = hits.flatMap((g) => g.rows);
  const focused = all.find((h) => h.key === nav.focus);

  const commands: Command[] = [
    ...nav.commands,
    {
      id: "search.go",
      label: "Go to item",
      group: "Search",
      keys: ["enter"],
      enabled: Boolean(focused),
      run: () => focused && ui.reveal({ kind: focused.kind, id: focused.id }),
    },
    { id: "search.refine", label: "Refine search", group: "Search", keys: ["alt+q", "/"], run: ui.openSearch },
  ];
  useCommands("list:search", commands, { priority: 10, active: regionActive });

  const columns: Column<Hit>[] = [
    { key: "subject", label: "Result", width: "minmax(240px, 1fr)", render: (h) => <span className="subject-text">{h.title || "Untitled"}</span> },
    { key: "where", label: "In", width: "160px", render: (h) => <span className="muted-text">{h.where}</span> },
  ];

  return (
    <Grid
      listId="search"
      columns={columns}
      groups={hits}
      getKey={(h) => h.key}
      nav={nav}
      active={regionActive}
      showHeaders
      onOpen={() => focused && ui.reveal({ kind: focused.kind, id: focused.id })}
      empty={<EmptyState title={query.trim() ? `Nothing matches “${query.trim()}”` : "Type to search every list"} lines={["Searches actions, projects, the Inbox and reference notes."]} />}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Settings: rules, contexts, Claude, export                            */
/* ------------------------------------------------------------------ */

type SRow = { key: string; kind: "rule" | "context" | "apikey"; id: ID; text: string; status?: string; color?: string };

export function SettingsView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const meta = useMeta();
  const [editing, setEditing] = useState<string | null>(null);

  const groups: GridGroup<SRow>[] = useMemo(
    () => [
      {
        key: "claude",
        label: "Claude",
        rows: [{ key: "apikey", kind: "apikey" as const, id: "apikey", text: "API key", status: meta.hasKey ? "set" : "missing" }],
      },
      {
        key: "suggested",
        label: "Suggested rules (from your corrections)",
        rows: s.rules.filter((r) => r.status === "suggested").map((r) => ({ key: `r:${r.id}`, kind: "rule" as const, id: r.id, text: r.text, status: r.status })),
      },
      {
        key: "rules",
        label: "Rules Claude follows when clarifying",
        rows: s.rules.filter((r) => r.status === "active").map((r) => ({ key: `r:${r.id}`, kind: "rule" as const, id: r.id, text: r.text, status: r.status })),
      },
      {
        key: "contexts",
        label: "Contexts",
        rows: [...s.contexts].sort((a, b) => a.sort - b.sort).map((c) => ({ key: `c:${c.id}`, kind: "context" as const, id: c.id, text: c.name, color: c.color })),
      },
    ],
    [s.rules, s.contexts, meta.hasKey],
  );
  const nav = useListNav("settings", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: true })), [groups]));
  const all = groups.flatMap((g) => g.rows);
  const cur = all.find((r) => r.key === nav.focus);
  const groupOfFocus = nav.focus && isGroupKey(nav.focus) ? nav.focus.slice(6) : groups.find((g) => g.rows.some((r) => r.key === nav.focus))?.key;

  const commands: Command[] = [
    ...nav.commands,
    {
      id: "set.key",
      label: meta.hasKey ? "Change the API key" : "Add an API key",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "apikey",
      run: () => promptApiKey(ui),
    },
    {
      id: "set.keyremove",
      label: "Remove the API key",
      group: "Settings",
      keys: ["backspace", "delete"],
      enabled: cur?.kind === "apikey" && meta.hasKey,
      run: () => void removeApiKey(),
    },
    {
      id: "set.approve",
      label: "Approve rule",
      group: "Settings",
      keys: ["enter"],
      enabled: cur?.kind === "rule" && cur.status === "suggested",
      run: () => cur && mutate("Rule approved: Claude will follow it", [{ type: "patch", table: "rules", id: cur.id, data: { status: "active" } }]),
    },
    { id: "set.edit", label: "Edit", group: "Settings", keys: ["f2"], enabled: Boolean(cur) && cur?.kind !== "apikey", run: () => cur && setEditing(cur.key) },
    {
      id: "set.new",
      label: groupOfFocus === "contexts" ? "New context" : "New rule",
      group: "Settings",
      keys: ["n"],
      run: () => {
        const id = crypto.randomUUID();
        if (groupOfFocus === "contexts") {
          mutate("New context", [{ type: "create", table: "contexts", row: { id, name: "@", color: CONTEXT_COLORS[s.contexts.length % CONTEXT_COLORS.length], sort: s.contexts.length } }], { silent: true });
          nav.setFocus(`c:${id}`);
          setEditing(`c:${id}`);
        } else {
          mutate("New rule", [{ type: "create", table: "rules", row: { id, text: "", status: "active", created_at: new Date().toISOString() } }], { silent: true });
          nav.setFocus(`r:${id}`);
          setEditing(`r:${id}`);
        }
      },
    },
    {
      id: "set.delete",
      label: cur?.status === "suggested" ? "Reject rule" : "Delete",
      group: "Settings",
      keys: ["backspace", "delete"],
      enabled: Boolean(cur) && cur?.kind !== "apikey",
      run: () => {
        if (!cur) return;
        if (cur.kind === "context") {
          mutate("Context deleted", [
            { type: "delete", table: "contexts", id: cur.id },
            ...s.actions.filter((a) => a.context_id === cur.id).map((a) => ({ type: "patch" as const, table: "actions" as const, id: a.id, data: { context_id: null } })),
          ]);
        } else mutate(cur.status === "suggested" ? "Rule rejected" : "Rule deleted", [{ type: "delete", table: "rules", id: cur.id }]);
      },
    },
    {
      id: "set.color",
      label: "Change context colour",
      group: "Settings",
      keys: ["c"],
      enabled: cur?.kind === "context",
      run: () =>
        cur &&
        ui.openPicker({
          type: "list",
          title: "Colour",
          items: CONTEXT_COLORS.map((c, i) => ({ id: c, label: ["Blue", "Red", "Green", "Ochre", "Violet", "Teal", "Plum", "Olive"][i], color: c })),
          current: cur.color,
          onPick: (c) => c && mutate("Colour changed", [{ type: "patch", table: "contexts", id: cur.id, data: { color: c } }]),
        }),
    },
  ];
  useCommands("list:settings", commands, { priority: 10, active: regionActive });

  const columns: Column<SRow>[] = [
    {
      key: "subject",
      label: "Setting",
      width: "minmax(260px, 1fr)",
      render: (r) =>
        editing === r.key ? (
          <InlineEdit
            value={r.text}
            onDone={(v) => {
              setEditing(null);
              const table = r.kind === "rule" ? "rules" : "contexts";
              const field = r.kind === "rule" ? "text" : "name";
              let val = v.trim();
              if (r.kind === "context" && val && !val.startsWith("@")) val = `@${val}`;
              if (!val || val === "@") mutate("Discarded", [{ type: "delete", table, id: r.id }], { silent: true });
              else if (val !== r.text) mutate("Saved", [{ type: "patch", table, id: r.id, data: { [field]: val } }]);
            }}
          />
        ) : r.kind === "apikey" ? (
          <span className="subject">
            <span className="subject-text strong">API key</span>
            <span className="subject-more">{meta.hasKey ? `Stored in .env on this Mac. Clarify and Review use Claude Sonnet 5.` : "Needed for Clarify and the Weekly Review."}</span>
          </span>
        ) : r.kind === "context" ? (
          <ContextCode ctx={{ id: r.id, name: r.text, color: r.color!, sort: 0 }} />
        ) : (
          <span className="subject-text">{r.text}</span>
        ),
    },
    {
      key: "state",
      label: "",
      width: "160px",
      render: (r) =>
        r.kind === "apikey" ? (
          meta.hasKey ? (
            <span className="key-state">
              Connected
              {meta.keyHint && <span className="key-hint num">…{meta.keyHint}</span>}
            </span>
          ) : (
            <span className="stamp">Not set</span>
          )
        ) : r.status === "suggested" ? (
          <span className="muted-text small">Awaiting approval</span>
        ) : r.kind === "context" ? (
          <span className="num muted-text">{plural(s.actions.filter((a) => a.context_id === r.id && a.status === "next").length, "action")}</span>
        ) : null,
    },
  ];

  return (
    <div className="settings">
      <div className="settings-facts">
        <div>
          <Tape>Export</Tape>
          <p>
            <a href="/api/export/zip">Markdown files (.zip)</a> · <a href="/api/export/json">JSON</a>. Both are also in the command palette.
          </p>
        </div>
      </div>
      <Grid
        listId="settings"
        columns={columns}
        groups={groups}
        getKey={(r) => r.key}
        nav={nav}
        active={regionActive}
        showHeaders
        empty={null}
      />
    </div>
  );
}
