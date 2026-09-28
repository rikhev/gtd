import { useEffect, useMemo, useState } from "react";
import { mutate, notify, plural, updateMeta, useMeta, useStore, bareArea } from "../store.ts";
import { useUI, type EntityKind, type ViewId } from "../ui.tsx";
import { keyLabel, useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, useSort, sortGroups, isGroupKey, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { AreaName, ContextCode, Tag } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { AREA_COLORS, COLOR_NAMES, CONTEXT_COLORS, nextAreaColor } from "../actionCommands.tsx";
import { suggestRules } from "../rules.ts";
import { isDark, setTheme, useTheme } from "../theme.ts";
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
  const [sort, setSort] = useSort("search");
  const sorters: Sorters<Hit> = useMemo(() => ({ subject: (h) => h.title, where: (h) => h.where }), []);
  const found: GridGroup<Hit>[] = useMemo(() => {
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
      .filter((p) => p.status !== "trashed" && match(p.title, p.notes))
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
  // Results keep their kind groups; a heading click sorts inside each.
  const hits = useMemo(() => sortGroups(found, sorters, sort), [found, sorters, sort]);

  const nav = useListNav("search", useMemo(() => hits.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: true })), [hits]));
  const all = hits.flatMap((g) => g.rows);
  const focused = all.find((h) => h.key === nav.focus);
  useEffect(() => {
    ui.followDetail(focused ? { kind: focused.kind, id: focused.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.key]);

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
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
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

type SRow = { key: string; kind: "rule" | "context" | "area" | "apikey" | "stall" | "theme" | "trash" | "week"; id: ID; text: string; status?: string; color?: string };

export function SettingsView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const meta = useMeta();
  const [editing, setEditing] = useState<string | null>(null);
  const theme = useTheme();

  const groups: GridGroup<SRow>[] = useMemo(
    () => [
      {
        key: "appearance",
        label: "Appearance",
        hideCount: true,
        rows: [{ key: "theme", kind: "theme" as const, id: "theme", text: "Theme" }],
      },
      {
        key: "calendar",
        label: "Calendar",
        hideCount: true,
        rows: [{ key: "week", kind: "week" as const, id: "week", text: "Week starts on" }],
      },
      {
        key: "review",
        label: "Weekly Review",
        hideCount: true,
        rows: [{ key: "stall", kind: "stall" as const, id: "stall", text: "Stalled after" }],
      },
      {
        key: "deleted",
        label: "Recently deleted",
        hideCount: true,
        rows: [{ key: "trash", kind: "trash" as const, id: "trash", text: "Keep deleted items" }],
      },
      {
        key: "claude",
        label: "Claude",
        hideCount: true,
        rows: [{ key: "apikey", kind: "apikey" as const, id: "apikey", text: "API key", status: meta.hasKey ? "set" : "missing" }],
      },
      {
        key: "suggested",
        label: "Suggested rules",
        rows: s.rules.filter((r) => r.status === "suggested").map((r) => ({ key: `r:${r.id}`, kind: "rule" as const, id: r.id, text: r.text, status: r.status })),
        meta: s.rules.some((r) => r.status === "suggested")
          ? undefined
          : meta.hasKey
            ? `Ask Claude (${keyLabel("mod+k")} › Suggest rules) once you have corrected the same kind of proposal a few times`
            : "Rules come from correcting Claude's proposals, so they need an API key first",
      },
      {
        key: "rules",
        label: "Claude's rules",
        rows: s.rules.filter((r) => r.status === "active").map((r) => ({ key: `r:${r.id}`, kind: "rule" as const, id: r.id, text: r.text, status: r.status })),
        meta: s.rules.some((r) => r.status === "active") ? undefined : "None yet. Approve a suggested rule, or add your own",
      },
      {
        // Areas of focus are managed here (the Projects list groups by them); creating one also works from any area picker.
        key: "areas",
        label: "Areas",
        rows: [...s.areas].sort((a, b) => a.sort - b.sort).map((a) => ({ key: `a:${a.id}`, kind: "area" as const, id: a.id, text: a.name, color: a.color ?? undefined })),
        meta: s.areas.length ? undefined : "None yet. N adds one; projects are grouped by area",
      },
      {
        key: "contexts",
        label: "Contexts",
        rows: [...s.contexts].sort((a, b) => a.sort - b.sort).map((c) => ({ key: `c:${c.id}`, kind: "context" as const, id: c.id, text: c.name, color: c.color })),
      },
    ],
    [s.rules, s.contexts, s.areas, meta.hasKey, meta.stallWeeks, meta.trashDays, meta.weekStart],
  );
  const nav = useListNav("settings", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: true })), [groups]));
  const all = groups.flatMap((g) => g.rows);
  const cur = all.find((r) => r.key === nav.focus);
  const groupOfFocus = nav.focus && isGroupKey(nav.focus) ? nav.focus.slice(6) : groups.find((g) => g.rows.some((r) => r.key === nav.focus))?.key;

  // Only rules, contexts and areas can be renamed or deleted; the other rows are settings, not list items.
  const listRow = cur?.kind === "rule" || cur?.kind === "context" || cur?.kind === "area";
  const moveArea = (id: ID, dir: -1 | 1) => {
    const list = [...s.areas].sort((a, b) => a.sort - b.sort);
    const i = list.findIndex((a) => a.id === id);
    const other = list[i + dir];
    if (!other) return;
    mutate("Reordered", [
      { type: "patch", table: "areas", id, data: { sort: other.sort } },
      { type: "patch", table: "areas", id: other.id, data: { sort: list[i].sort } },
    ], { silent: true });
  };

  const commands: Command[] = [
    ...nav.commands,
    {
      id: "set.stall",
      label: "Change when projects count as stalled",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "stall",
      run: () =>
        // A number is typed, not picked from a list: any whole number of weeks from 1 to 52.
        ui.openPicker({
          type: "text",
          title: "Stalled after (weeks)",
          current: String(meta.stallWeeks),
          placeholder: "Number of weeks",
          preview: (v) => {
            const n = Number(v.trim());
            if (!v.trim()) return { ok: false, text: "Type a number of weeks" };
            if (!Number.isInteger(n) || n < 1 || n > 52) return { ok: false, text: "A whole number from 1 to 52" };
            return { ok: true, text: `Stalled after ${plural(n, "week")} without progress` };
          },
          onPick: (v) => void saveStallWeeks(Number(v.trim())),
        }),
    },
    {
      id: "set.week",
      label: "Choose the first day of the week",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "week",
      run: () =>
        ui.openPicker({
          type: "list",
          title: "Week starts on",
          items: [
            { id: "1", label: "Monday" },
            { id: "0", label: "Sunday" },
          ],
          current: String(meta.weekStart),
          onPick: (v) => v !== null && void saveWeekStart(v === "0" ? 0 : 1),
        }),
    },
    {
      id: "set.trash",
      label: "Change how long deleted items are kept",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "trash",
      run: () =>
        ui.openPicker({
          type: "text",
          title: "Keep deleted items (days)",
          current: String(meta.trashDays),
          placeholder: "Number of days",
          preview: (v) => {
            const n = Number(v.trim());
            if (!v.trim()) return { ok: false, text: "Type a number of days" };
            if (!Number.isInteger(n) || n < 1 || n > 365) return { ok: false, text: "A whole number from 1 to 365" };
            return { ok: true, text: `Deleted items are kept ${plural(n, "day")}, then gone for good` };
          },
          onPick: (v) => void saveTrashDays(Number(v.trim())),
        }),
    },
    {
      id: "set.theme",
      label: "Choose the theme: light, dark or the system's",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "theme",
      run: () =>
        ui.openPicker({
          type: "list",
          title: "Theme",
          items: [
            { id: "system", label: "Follow the system", hint: isDark("system") ? "Dark now" : "Light now" },
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ],
          current: theme.pref,
          onPick: (id) => {
            if (id !== "system" && id !== "light" && id !== "dark") return;
            setTheme(id);
            notify(id === "system" ? "Following the system theme" : `${id === "dark" ? "Dark" : "Light"} theme`);
          },
        }),
    },
    {
      id: "set.key",
      label: meta.hasKey ? "Change the Claude API key" : "Add a Claude API key",
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
    { id: "set.edit", label: "Rename", group: "Settings", keys: ["f2"], enabled: listRow, run: () => cur && setEditing(cur.key) },
    { id: "set.suggest", label: "Ask Claude to suggest rules from your corrections", group: "Settings", keys: ["shift+k"], enabled: meta.hasKey, run: () => void suggestRules() },
    {
      id: "set.new",
      label: groupOfFocus === "contexts" ? "New context" : groupOfFocus === "areas" ? "New area" : "New rule",
      group: "Settings",
      keys: ["n"],
      run: () => {
        const id = crypto.randomUUID();
        if (groupOfFocus === "areas") {
          mutate("New area", [{ type: "create", table: "areas", row: { id, name: "", sort: Math.max(0, ...s.areas.map((a) => a.sort)) + 1, color: nextAreaColor() } }], { silent: true });
          nav.setFocus(`a:${id}`);
          setEditing(`a:${id}`);
        } else if (groupOfFocus === "contexts") {
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
      enabled: listRow,
      run: () => {
        if (!cur) return;
        if (cur.kind === "area") {
          // Its projects keep going, just without an area.
          mutate(`Area “${cur.text}” deleted`, [
            { type: "delete", table: "areas", id: cur.id },
            ...s.projects.filter((p) => p.area_id === cur.id).map((p) => ({ type: "patch" as const, table: "projects" as const, id: p.id, data: { area_id: null } })),
          ]);
        } else if (cur.kind === "context") {
          mutate("Context deleted", [
            { type: "delete", table: "contexts", id: cur.id },
            ...s.actions.filter((a) => a.context_id === cur.id).map((a) => ({ type: "patch" as const, table: "actions" as const, id: a.id, data: { context_id: null } })),
          ]);
        } else mutate(cur.status === "suggested" ? "Rule rejected" : "Rule deleted", [{ type: "delete", table: "rules", id: cur.id }]);
      },
    },
    { id: "set.areaup", label: "Move area up", group: "Settings", keys: ["alt+arrowup"], enabled: cur?.kind === "area", run: () => cur && moveArea(cur.id, -1) },
    { id: "set.areadown", label: "Move area down", group: "Settings", keys: ["alt+arrowdown"], enabled: cur?.kind === "area", run: () => cur && moveArea(cur.id, 1) },
    {
      id: "set.color",
      label: cur?.kind === "area" ? "Change area colour" : "Change context colour",
      group: "Settings",
      keys: ["c"],
      enabled: cur?.kind === "context" || cur?.kind === "area",
      run: () =>
        cur &&
        ui.openPicker({
          type: "list",
          title: "Colour",
          items: (cur.kind === "area" ? AREA_COLORS : CONTEXT_COLORS).map((c) => ({ id: c, label: COLOR_NAMES[c], color: c })),
          current: cur.color,
          onPick: (c) => c && mutate("Colour changed", [{ type: "patch", table: cur.kind === "area" ? "areas" : "contexts", id: cur.id, data: { color: c } }]),
        }),
    },
  ];
  useCommands("list:settings", commands, { priority: 10, active: regionActive });

  const columns: Column<SRow>[] = [
    {
      key: "subject",
      label: "Name",
      width: "minmax(260px, 1fr)",
      render: (r) =>
        editing === r.key ? (
          <InlineEdit
            value={r.text}
            placeholder={r.kind === "context" ? "Name the context" : r.kind === "area" ? "Name the area" : "Describe the rule"}
            onDone={(v) => {
              setEditing(null);
              const table = r.kind === "rule" ? "rules" : r.kind === "area" ? "areas" : "contexts";
              const field = r.kind === "rule" ? "text" : "name";
              let val = v.trim();
              if (r.kind === "context" && val && !val.startsWith("@")) val = `@${val}`;
              if (r.kind === "area") val = bareArea(val);
              if (!val || val === "@") mutate("Discarded", [{ type: "delete", table, id: r.id }], { silent: true });
              else if (val !== r.text) mutate("Saved", [{ type: "patch", table, id: r.id, data: { [field]: val } }]);
            }}
          />
        ) : r.kind === "theme" ? (
          <span className="subject">
            <span className="subject-text strong">Theme</span>
            <span className="subject-more">Light, dark, or follow the system. Kept in this browser.</span>
          </span>
        ) : r.kind === "week" ? (
          <span className="subject">
            <span className="subject-text strong">Week starts on</span>
            <span className="subject-more">The first column of the calendar's weeks and months.</span>
          </span>
        ) : r.kind === "trash" ? (
          <span className="subject">
            <span className="subject-text strong">Keep deleted items</span>
            <span className="subject-more">Anything deleted stays in Recently deleted this long, so it can be put back. Then it is gone for good.</span>
          </span>
        ) : r.kind === "stall" ? (
          <span className="subject">
            <span className="subject-text strong">Stalled after</span>
            <span className="subject-more">A project with a next action counts as stalled when nothing in it has been touched for this long.</span>
          </span>
        ) : r.kind === "apikey" ? (
          <span className="subject">
            <span className="subject-text strong">API key</span>
            <span className="subject-more">{meta.hasKey ? `Kept out of the browser: only its last four characters are ever shown. Clarify with Claude uses Claude Sonnet 5.` : "Lets Claude propose projects and actions when you clarify with Claude (⌥K). Everything else works without it."}</span>
          </span>
        ) : r.kind === "area" ? (
          <AreaName name={r.text} color={r.color} />
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
        r.kind === "theme" ? (
          <span>{theme.pref === "system" ? `System (${theme.dark ? "dark" : "light"})` : theme.pref === "dark" ? "Dark" : "Light"}</span>
        ) : r.kind === "stall" ? (
          <span className="num">{plural(meta.stallWeeks, "week")}</span>
        ) : r.kind === "trash" ? (
          <span className="num">{plural(meta.trashDays, "day")}</span>
        ) : r.kind === "week" ? (
          <span>{meta.weekStart === 0 ? "Sunday" : "Monday"}</span>
        ) : r.kind === "apikey" ? (
          meta.hasKey ? (
            <span className="key-state">
              Connected
              {meta.keyHint && <span className="key-hint num">…{meta.keyHint}</span>}
            </span>
          ) : (
            <span className="badge">Not set</span>
          )
        ) : r.status === "suggested" ? (
          <span className="muted-text small">Awaiting approval</span>
        ) : r.kind === "area" ? (
          <span className="num muted-text">{plural(s.projects.filter((p) => p.area_id === r.id && p.status === "active").length, "active project")}</span>
        ) : r.kind === "context" ? (
          <span className="num muted-text">{plural(s.actions.filter((a) => a.context_id === r.id && a.status === "next").length, "action")}</span>
        ) : null,
    },
  ];

  return (
    <div className="settings">
      <Grid
        listId="settings"
        columns={columns}
        groups={groups}
        getKey={(r) => r.key}
        nav={nav}
        active={regionActive}
        showHeaders
        head={false}
        empty={null}
      />
      {/* Export last: the things you set come first, taking your data out comes after. */}
      <div className="settings-facts">
        <div>
          <Tag>Export</Tag>
          <p>
            <a href="/api/export/zip">Markdown files (.zip)</a> · <a href="/api/export/json">JSON</a>. Both are also in the command palette.
          </p>
        </div>
      </div>
    </div>
  );
}

async function saveStallWeeks(weeks: number) {
  const res = await fetch("/api/settings/stall", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ weeks }) });
  const j = (await res.json()) as { stallWeeks?: number; error?: string };
  if (j.stallWeeks) {
    updateMeta({ stallWeeks: j.stallWeeks });
    notify(`Projects now count as stalled after ${plural(j.stallWeeks, "week")} without progress.`);
  } else notify(j.error ?? "Couldn't save that.", { tone: "error" });
}

async function saveTrashDays(days: number) {
  const res = await fetch("/api/settings/trash", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ days }) });
  const j = (await res.json()) as { trashDays?: number; error?: string };
  if (j.trashDays) {
    updateMeta({ trashDays: j.trashDays });
    notify(`Deleted items are now kept ${plural(j.trashDays, "day")}.`);
  } else notify(j.error ?? "Couldn't save that.", { tone: "error" });
}

async function saveWeekStart(start: 0 | 1) {
  const res = await fetch("/api/settings/week", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ start }) });
  const j = (await res.json()) as { weekStart?: 0 | 1; error?: string };
  if (j.weekStart === 0 || j.weekStart === 1) {
    updateMeta({ weekStart: j.weekStart });
    notify(`Weeks now start on ${j.weekStart === 0 ? "Sunday" : "Monday"}.`);
  } else notify(j.error ?? "Couldn't save that.", { tone: "error" });
}
