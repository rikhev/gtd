import { clearEvents, type FeedInfo } from "../calendarFeed.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { LIST_NAMES, quote, getMeta, mutate, notify, plural, refUpdated, updateMeta, useMeta, useStore, bareArea } from "../store.ts";
import { formatDate, today } from "../../shared/dates.ts";
import { excerpt } from "../notes.ts";
import { importNotes } from "../noteImport.ts";
import { useUI, type EntityKind, type ViewId } from "../ui.tsx";
import { runKey, useCommands, type Command } from "../keys.ts";
import { ChevronDown, Download } from "lucide-react";
import { Grid, useListNav, usePersisted, useSort, sortGroups, isGroupKey, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { AreaName, ContextCode, KeyHints, type KeyHint } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { AREA_COLORS, COLOR_NAMES, CONTEXT_COLORS, nextAreaColor } from "../actionCommands.tsx";
import { isDark, setTheme, useTheme } from "../theme.ts";
import { ALERT_LABEL, setAlertMode, useAlerts, type AlertMode } from "../alerts.ts";
import type { ID, Op } from "../../shared/types.ts";
import { openChecklist } from "../checklists.ts";
import { choosePassword, lockNow, removeLockPassword, useLock } from "../lock.ts";

/* ------------------------------------------------------------------ */
/* Search                                                               */
/* ------------------------------------------------------------------ */

interface Hit {
  key: string;
  /** A checklist has no details pane: going to it opens it in Checklists. */
  kind: EntityKind | "checklist";
  id: ID;
  title: string;
  where: string;
  home: ViewId;
  /** A checklist hit found by one of its items: the item the checklist opens on. */
  at?: ID;
  /** Found in its text, not its title: the line it was found on. */
  line?: string;
  /** When it last changed (or was made), as an ISO stamp. */
  when?: string;
}

export function SearchView({ regionActive, query }: { regionActive: boolean; query: string }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [sort, setSort] = useSort("search");
  const sorters: Sorters<Hit> = useMemo(() => ({ subject: (h) => h.title, where: (h) => h.where, when: (h) => h.when ?? null }), []);
  const found: GridGroup<Hit>[] = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const match = (...texts: (string | null | undefined)[]) => {
      const hay = texts.filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    // An item's files count as its words: their names, and the text read out of them when they were stored.
    const fileWords = new Map<string, string[]>();
    for (const f of s.files) {
      const k = `${f.owner_kind}:${f.owner_id}`;
      // A locked file's row holds only ciphertext: it is found by nothing but its reference's title.
      if (!f.sealed) fileWords.set(k, [...(fileWords.get(k) ?? []), f.name, f.preview]);
    }
    const filesOf = (kind: string, id: ID) => fileWords.get(`${kind}:${id}`) ?? [];
    const projectOf = (id: ID | null) => (id ? s.projects.find((p) => p.id === id)?.title : undefined);
    // A hit found in its text shows the line it was found on; one whose title holds every word needs none.
    const lineOf = (title: string, ...texts: (string | null | undefined)[]) => {
      const t = title.toLowerCase();
      const rest = words.filter((w) => !t.includes(w));
      return rest.length ? excerpt(texts.filter(Boolean).join("\n"), rest) || undefined : undefined;
    };
    const where: Record<string, string> = { ...LIST_NAMES, trashed: "" };
    const home = { next: "next", waiting: "waiting", someday: "someday", later: "projects", done: "done", trashed: "next" } as const;
    const actions = s.actions
      .filter((a) => a.status !== "trashed" && match(a.title, a.notes, a.waiting_who, ...filesOf("action", a.id)))
      .map((a) => ({ key: `a:${a.id}`, kind: "action" as const, id: a.id, title: a.title, where: where[a.status], home: home[a.status] as ViewId, line: lineOf(a.title, a.notes, a.waiting_who, ...filesOf("action", a.id)), when: a.updated_at ?? a.created_at }));
    const projects = s.projects
      .filter((p) => p.status !== "trashed" && match(p.title, p.notes, ...filesOf("project", p.id)))
      .map((p) => ({ key: `p:${p.id}`, kind: "project" as const, id: p.id, title: p.title, where: p.status === "someday" ? "Someday / Maybe" : "Projects", home: (p.status === "someday" ? "someday" : "projects") as ViewId, line: lineOf(p.title, p.notes, ...filesOf("project", p.id)), when: p.created_at }));
    const stuff = s.stuff
      .filter((x) => x.status === "inbox" && match(x.text, ...filesOf("stuff", x.id)))
      .map((x) => ({ key: `s:${x.id}`, kind: "stuff" as const, id: x.id, title: x.text.split("\n")[0], where: "Inbox", home: "inbox" as ViewId, line: lineOf(x.text.split("\n")[0], x.text.split("\n").slice(1).join("\n"), ...filesOf("stuff", x.id)), when: x.created_at }));
    // A reference matches by its words, its files or the project it supports, and says which project that is.
    const refs = s.refs
      .filter((r) => r.status === "active" && match(r.title, r.notes, projectOf(r.project_id), ...filesOf("ref", r.id)))
      .map((r) => ({
        key: `r:${r.id}`,
        kind: "ref" as const,
        id: r.id,
        title: r.title,
        where: projectOf(r.project_id) ? `Reference · ${projectOf(r.project_id)}` : "Reference",
        home: "reference" as ViewId,
        line: lineOf(r.title, r.notes, ...filesOf("ref", r.id)),
        when: refUpdated(s, r),
      }));
    // A checklist matches by its name or any of its items; the hit names the item that matched.
    const lists = s.checklists
      .filter((c) => c.status === "active")
      .flatMap((c) => {
        const items = s.checklist_items.filter((i) => i.checklist_id === c.id);
        const inItem = match(c.title) ? undefined : items.find((i) => match(c.title, i.title));
        if (!match(c.title) && !inItem) return [];
        return [{ key: `c:${c.id}`, kind: "checklist" as const, id: c.id, title: c.title || "Untitled checklist", where: inItem ? `Checklists · ${inItem.title}` : "Checklists", home: "checklists" as ViewId, at: inItem?.id }];
      });
    // In each group, what holds the words in its title comes first.
    const titleFirst = (rows: Hit[]) => [...rows.filter((h) => !h.line), ...rows.filter((h) => h.line)];
    return [
      { key: "actions", label: "Actions", rows: titleFirst(actions) },
      { key: "projects", label: "Projects", rows: titleFirst(projects) },
      { key: "inbox", label: "Inbox", rows: titleFirst(stuff) },
      { key: "refs", label: "Reference", rows: titleFirst(refs) },
      { key: "checklists", label: "Checklists", rows: lists as Hit[] },
    ].filter((g) => g.rows.length);
  }, [s, query]);
  // Results keep their kind groups; a heading click sorts inside each.
  const hits = useMemo(() => sortGroups(found, sorters, sort), [found, sorters, sort]);

  const nav = useListNav("search", useMemo(() => hits.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: true })), [hits]));
  const all = hits.flatMap((g) => g.rows);
  const focused = all.find((h) => h.key === nav.focus);
  useEffect(() => {
    ui.followDetail(focused && focused.kind !== "checklist" ? { kind: focused.kind, id: focused.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.key]);

  const goTo = (h: Hit) => {
    if (h.kind !== "checklist") return ui.reveal({ kind: h.kind, id: h.id });
    ui.go("checklists");
    // A hit on an item opens the checklist with the cursor on it.
    openChecklist(h.id, true, h.at ?? null);
  };
  const commands: Command[] = [
    ...nav.commands,
    {
      id: "search.go",
      row: true,
      label: "Go to item",
      group: "Search",
      keys: ["enter"],
      enabled: Boolean(focused),
      run: () => focused && goTo(focused),
    },
    { id: "search.refine", label: "Refine search", group: "Search", keys: ["alt+q", "/"], run: ui.openSearch },
  ];
  useCommands("list:search", commands, { priority: 10, active: regionActive });

  const columns: Column<Hit>[] = [
    {
      key: "subject",
      label: "Item",
      width: "minmax(240px, 1fr)",
      render: (h) => (
        <span className="subject">
          <span className="subject-text">{h.title || "Untitled"}</span>
          {h.line && <span className="subject-more">{h.line}</span>}
        </span>
      ),
    },
    { key: "where", label: "In", width: "160px", render: (h) => <span className="muted-text">{h.where}</span> },
    { key: "when", label: "Date", width: "100px", drop: 1, render: (h) => (h.when ? <span className="date">{formatDate(h.when.slice(0, 10))}</span> : <span className="dash" aria-hidden="true">–</span>) },
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
      onOpen={() => focused && goTo(focused)}
      empty={<EmptyState title={query.trim() ? `Nothing matches “${query.trim()}”` : "Type to search every list"} lines={["Searches actions, projects, the Inbox, reference notes and checklists."]} />}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Settings: general, areas, contexts, export                          */
/* ------------------------------------------------------------------ */

type SRow = { key: string; kind: "context" | "area" | "stall" | "scheduled" | "theme" | "trash" | "week" | "export" | "import" | "feed" | "addfeed" | "hours" | "alerts" | "lock"; id: ID; text: string; status?: string; color?: string };

/** Settings in tabs, like the steps of the Weekly Review: each tab one short list, walked with ⌘. / ⌘, or 1–4. */
const TABS = [
  { id: "general", title: "General" },
  { id: "areas", title: "Areas" },
  { id: "contexts", title: "Contexts" },
  { id: "data", title: "Data" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const TAB_OF: Record<string, TabId> = {
  appearance: "general",
  calendar: "general",
  projects: "general",
  review: "general",
  trash: "general",
  areas: "areas",
  contexts: "contexts",
  import: "data",
  export: "data",
  lock: "data",
};

export function SettingsView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const meta = useMeta();
  const [editing, setEditing] = useState<string | null>(null);
  const theme = useTheme();
  const lock = useLock();
  const alerts = useAlerts();
  const [storedTab, setTab] = usePersisted<TabId>("settings:tab", "general");
  // A tab remembered from before that no longer exists falls back to General.
  const tab: TabId = TABS.some((t) => t.id === storedTab) ? storedTab : "general";
  const tabIdx = Math.max(0, TABS.findIndex((t) => t.id === tab));
  const sealedCount = s.refs.filter((r) => r.sealed && r.status !== "trashed").length;
  // While a tab has focus, ← → move between the tabs (the list's own arrows wait).
  const [onTabs, setOnTabs] = useState(false);
  const stepTab = (dir: 1 | -1) => {
    const next = TABS[(tabIdx + dir + TABS.length) % TABS.length];
    setTab(next.id);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${next.id}`)?.focus());
  };
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

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
        rows: [
          { key: "week", kind: "week" as const, id: "week", text: "Week starts on" },
          { key: "hours", kind: "hours" as const, id: "hours", text: "Hours the week shows" },
          { key: "alerts", kind: "alerts" as const, id: "alerts", text: "Appointment reminders" },
          // Subscribed calendars (the hard landscape), each named and coloured, then the way to add one.
          ...meta.calendars.map((f) => ({ key: `f:${f.id}`, kind: "feed" as const, id: f.id, text: f.name, color: f.color, status: f.error })),
          { key: "addfeed", kind: "addfeed" as const, id: "addfeed", text: "Add a calendar" },
        ],
      },
      {
        key: "review",
        label: "Weekly Review",
        hideCount: true,
        rows: [{ key: "stall", kind: "stall" as const, id: "stall", text: "Idle after" }],
      },
      {
        key: "trash",
        label: "Trash",
        hideCount: true,
        rows: [{ key: "trash", kind: "trash" as const, id: "trash", text: "Keep deleted items" }],
      },
      {
        // Areas of focus are managed here (the Projects list groups by them); creating one also works from any area picker.
        key: "areas",
        label: "Areas",
        rows: [...s.areas].sort((a, b) => a.sort - b.sort).map((a) => ({ key: `a:${a.id}`, kind: "area" as const, id: a.id, text: a.name, color: a.color ?? undefined })),
      },
      {
        // Notes from another notes app: Markdown files, or a whole folder of them.
        key: "import",
        label: "Import",
        hideCount: true,
        rows: [
          { key: "import-files", kind: "import" as const, id: "files", text: "Import Markdown files" },
          { key: "import-folder", kind: "import" as const, id: "folder", text: "Import a folder" },
        ],
      },
      {
        key: "export",
        label: "Export",
        hideCount: true,
        rows: [
          { key: "zip", kind: "export" as const, id: `/api/export/zip?today=${today()}`, text: "Export as Markdown (.zip)" },
          { key: "json", kind: "export" as const, id: "/api/export/json", text: "Export as JSON" },
        ],
      },
      {
        key: "lock",
        label: "Lock",
        hideCount: true,
        rows: [{ key: "lock", kind: "lock" as const, id: "lock", text: "Lock password" }],
      },
      {
        key: "contexts",
        label: "Contexts",
        rows: [...s.contexts].sort((a, b) => a.sort - b.sort).map((c) => ({ key: `c:${c.id}`, kind: "context" as const, id: c.id, text: c.name, color: c.color })),
      },
    ],
    [s.contexts, s.areas, meta.stallWeeks, meta.trashDays, meta.weekStart, meta.calendars, meta.dayHours],
  );
  const shown = useMemo(() => groups.filter((g) => TAB_OF[g.key] === tab), [groups, tab]);
  // No group headings: the tab already says what the list is (owner's decision); each tab is one plain list.
  const heads = false;
  const nav = useListNav(`settings:${tab}`, useMemo(() => shown.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: heads })), [shown, heads]));
  const all = groups.flatMap((g) => g.rows);
  const cur = all.find((r) => r.key === nav.focus);
  const groupOfFocus =
    (nav.focus && isGroupKey(nav.focus) ? nav.focus.slice(6) : groups.find((g) => g.rows.some((r) => r.key === nav.focus))?.key) ??
    (tab === "areas" ? "areas" : tab === "contexts" ? "contexts" : undefined);

  // Only contexts and areas can be renamed or deleted; the other rows are settings, not list items.
  const listRow = cur?.kind === "context" || cur?.kind === "area";
  /** ⌥↑↓ on an area or a context: one place up or down (contexts and areas reorder alike); the list is renumbered. */
  const moveRow = (table: "areas" | "contexts", id: ID, dir: -1 | 1) => {
    const list = [...(table === "areas" ? s.areas : s.contexts)].sort((a, b) => a.sort - b.sort);
    const i = list.findIndex((a) => a.id === id);
    if (i < 0 || !list[i + dir]) return;
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    const ops = list.flatMap((x, k): Op[] => (x.sort === k ? [] : [{ type: "patch", table, id: x.id, data: { sort: k } }]));
    mutate("Reordered", ops, { silent: true });
  };

  const commands: Command[] = [
    { id: "set.tabright", label: "Go to the next tab", group: "Settings", keys: ["arrowright"], hidden: true, enabled: onTabs, run: () => stepTab(1) },
    { id: "set.tableft", label: "Go to the previous tab", group: "Settings", keys: ["arrowleft"], hidden: true, enabled: onTabs, run: () => stepTab(-1) },
    ...nav.commands,
    { id: "set.nexttab", label: "Go to the next settings tab", group: "Settings", keys: ["mod+."], inInput: true, run: () => setTab(TABS[(tabIdx + 1) % TABS.length].id) },
    { id: "set.prevtab", label: "Go to the previous settings tab", group: "Settings", keys: ["mod+,"], inInput: true, run: () => setTab(TABS[(tabIdx - 1 + TABS.length) % TABS.length].id) },
    ...TABS.map((t, i) => ({ id: `set.tab.${t.id}`, label: `Go to Settings › ${t.title}`, group: "Settings", keys: [String(i + 1)], run: () => setTab(t.id) })),
    {
      id: "set.lock",
      row: true,
      label: meta.lock ? "Change the lock password" : "Set a lock password",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "lock",
      run: () => choosePassword(ui),
    },
    { id: "set.locknow", row: true, label: "Lock now", group: "Settings", enabled: lock.unlocked, run: () => lockNow() },
    {
      id: "set.lockremove",
      row: true,
      label: "Remove the lock password",
      group: "Settings",
      enabled: Boolean(meta.lock),
      run: () =>
        sealedCount
          ? notify(`${plural(sealedCount, "reference")} still locked: remove their locks first (⇧L on Reference)`, { tone: "error" })
          : void removeLockPassword(),
    },
    {
      id: "set.import",
      row: true,
      label: "Choose what to import",
      group: "Settings",
      keys: ["enter"],
      enabled: cur?.kind === "import",
      run: () => (cur?.id === "folder" ? folderInput : filesInput).current?.click(),
    },
    {
      id: "set.export",
      row: true,
      label: "Download this export",
      group: "Settings",
      keys: ["enter"],
      enabled: cur?.kind === "export",
      run: () => cur && (window.location.href = cur.id),
    },
    {
      id: "set.stall",
      row: true,
      label: "Change when projects count as idle",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "stall",
      run: () =>
        // A number is typed, not picked from a list: any whole number of weeks from 1 to 52.
        ui.openPicker({
          type: "text",
          title: "Idle after (weeks)",
          current: String(meta.stallWeeks),
          preview: (v) => {
            const n = Number(v.trim());
            if (!v.trim()) return { ok: false, text: "Type a number of weeks" };
            if (!Number.isInteger(n) || n < 1 || n > 52) return { ok: false, text: "A whole number from 1 to 52" };
            return { ok: true, text: `Idle after ${plural(n, "week")} untouched` };
          },
          onPick: (v) => void saveStallWeeks(Number(v.trim())),
        }),
    },
    {
      id: "set.week",
      row: true,
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
      id: "set.hours",
      row: true,
      label: "Choose the hours the week shows",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "hours",
      run: () =>
        ui.openPicker({
          type: "list",
          title: "Hours the week shows: from",
          items: Array.from({ length: 13 }, (_, h) => ({ id: String(h), label: hh(h) })),
          current: String(meta.dayHours[0]),
          onPick: (a) => {
            if (a === null) return;
            const start = Number(a);
            window.setTimeout(() =>
              ui.openPicker({
                type: "list",
                title: `Hours the week shows: ${hh(start)} until`,
                items: Array.from({ length: 24 - start - 3 }, (_, i) => start + 4 + i).map((h) => ({ id: String(h), label: hh(h) })),
                current: String(Math.max(meta.dayHours[1], start + 4)),
                onPick: (b) => b !== null && void saveDayHours(start, Number(b)),
              }),
            );
          },
        }),
    },
    {
      id: "set.alerts",
      row: true,
      label: "Set appointment reminders",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "alerts",
      run: () =>
        ui.openPicker({
          type: "list",
          title: "Appointment reminders",
          items: [
            { id: "off", label: "Off" },
            { id: "visual", label: "Visual only", hint: "A notification, silently" },
            { id: "sound", label: "With sound", hint: "A notification and a soft chime" },
          ],
          current: alerts.mode,
          onPick: (m) => m && void setAlertMode(m as AlertMode),
        }),
    },
    { id: "set.addfeed", row: true, label: "Add a calendar", group: "Settings", keys: ["enter", "f2"], enabled: cur?.kind === "addfeed", run: () => addCalendar(ui) },
    {
      id: "set.feedlink",
      row: true,
      label: "Replace this calendar's link",
      group: "Settings",
      keys: ["enter"],
      enabled: cur?.kind === "feed",
      run: () =>
        cur &&
        ui.openPicker({
          type: "text",
          title: `${cur.text}: a new link`,
          current: "",
          preview: linkPreview,
          onPick: (v) => void patchCalendar(cur.id, { url: v.trim() }, `“${cur.text}” now reads the new link`),
        }),
    },
    {
      id: "set.feedname",
      row: true,
      label: "Rename this calendar",
      group: "Settings",
      keys: ["f2"],
      enabled: cur?.kind === "feed",
      run: () =>
        cur &&
        ui.openPicker({
          type: "text",
          title: "Calendar name",
          current: cur.text,
          onPick: (v) => v.trim() && void patchCalendar(cur.id, { name: v.trim() }, `Renamed “${v.trim()}”`),
        }),
    },
    {
      id: "set.feedcolor",
      row: true,
      label: "Change this calendar's colour",
      group: "Settings",
      keys: ["c"],
      enabled: cur?.kind === "feed",
      run: () =>
        cur &&
        ui.openPicker({
          type: "list",
          title: "Colour",
          items: CONTEXT_COLORS.map((c) => ({ id: c, label: COLOR_NAMES[c], color: c })),
          current: cur.color,
          onPick: (c) => c && void patchCalendar(cur.id, { color: c }, "Colour changed"),
        }),
    },
    {
      id: "set.feeddelete",
      row: true,
      label: "Remove this calendar",
      group: "Settings",
      keys: ["backspace", "delete"],
      enabled: cur?.kind === "feed",
      run: () => cur && void removeCalendar(cur.id, cur.text),
    },
    {
      id: "set.trash",
      row: true,
      label: "Change how long deleted items are kept",
      group: "Settings",
      keys: ["enter", "f2"],
      enabled: cur?.kind === "trash",
      run: () =>
        ui.openPicker({
          type: "text",
          title: "Keep deleted items (days)",
          current: String(meta.trashDays),
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
      row: true,
      label: "Choose the theme",
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
            notify(id === "system" ? "Following the system theme" : `Using the ${id} theme`);
          },
        }),
    },
    { id: "set.edit", row: true, label: "Rename", group: "Settings", keys: ["f2"], enabled: listRow, run: () => cur && setEditing(cur.key) },
    {
      id: "set.new",
      label: groupOfFocus === "contexts" ? "New context" : "New area",
      group: "Settings",
      keys: ["n"],
      // N adds to the list in front of you: areas or contexts; General and Data have nothing to add.
      enabled: tab === "areas" || tab === "contexts",
      run: () => {
        const id = crypto.randomUUID();
        if (groupOfFocus === "areas") {
          mutate("New area", [{ type: "create", table: "areas", row: { id, name: "", sort: Math.max(0, ...s.areas.map((a) => a.sort)) + 1, color: nextAreaColor() } }], { silent: true });
          nav.setFocus(`a:${id}`);
          setEditing(`a:${id}`);
        } else {
          mutate("New context", [{ type: "create", table: "contexts", row: { id, name: "@", color: CONTEXT_COLORS[s.contexts.length % CONTEXT_COLORS.length], sort: s.contexts.length } }], { silent: true });
          nav.setFocus(`c:${id}`);
          setEditing(`c:${id}`);
        }
      },
    },
    {
      id: "set.delete",
      row: true,
      label: "Delete",
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
        } else {
          mutate("Context deleted", [
            { type: "delete", table: "contexts", id: cur.id },
            ...s.actions.filter((a) => a.context_id === cur.id).map((a) => ({ type: "patch" as const, table: "actions" as const, id: a.id, data: { context_id: null } })),
          ]);
        }
      },
    },
    { id: "set.rowup", row: true, label: cur?.kind === "context" ? "Move context up" : "Move area up", group: "Settings", keys: ["alt+arrowup"], enabled: listRow, run: () => cur && moveRow(cur.kind === "context" ? "contexts" : "areas", cur.id, -1) },
    { id: "set.rowdown", row: true, label: cur?.kind === "context" ? "Move context down" : "Move area down", group: "Settings", keys: ["alt+arrowdown"], enabled: listRow, run: () => cur && moveRow(cur.kind === "context" ? "contexts" : "areas", cur.id, 1) },
    {
      id: "set.color",
      row: true,
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

  // The mouse's way to change a setting: its value is a pop-up button that picks the row and does what Enter does
  // (or the given key), so every setting can be changed without the keyboard.
  const actOn = (r: SRow, k: string) => {
    nav.setFocus(r.key);
    requestAnimationFrame(() => runKey(k));
  };
  // A value (theme, weeks, days) carries the picker's chevron; an action (Add, Import, Set the password) carries none,
  // a download its arrow. Never a Tab stop of its own: the row under the cursor is where the keys are (Enter).
  const valueBtn = (r: SRow, content: React.ReactNode, opts: { k?: string; icon?: "chevron" | "download" | "none"; label?: string } = {}) => (
    <button
      type="button"
      className="set-value"
      tabIndex={-1}
      aria-label={opts.label}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        actOn(r, opts.k ?? "enter");
      }}
    >
      {content}
      {opts.icon === "download" ? <Download size={13} strokeWidth={2} aria-hidden /> : opts.icon === "none" ? null : <ChevronDown size={13} strokeWidth={2} aria-hidden />}
    </button>
  );

  const columns: Column<SRow>[] = [
    {
      key: "subject",
      label: "Name",
      width: "minmax(260px, 1fr)",
      render: (r) =>
        editing === r.key ? (
          <InlineEdit
            value={r.text}
            onDone={(v) => {
              setEditing(null);
              const table = r.kind === "area" ? "areas" : "contexts";
              const field = "name";
              let val = v.trim();
              if (r.kind === "context" && val && !val.startsWith("@")) val = `@${val}`;
              if (r.kind === "area") val = bareArea(val);
              if (!val || val === "@") mutate("Discarded", [{ type: "delete", table, id: r.id }], { silent: true });
              else if (val !== r.text) mutate(`Renamed ${quote(val)}`, [{ type: "patch", table, id: r.id, data: { [field]: val } }]);
            }}
          />
        ) : r.kind === "theme" ? (
          <span className="subject">
            <span className="subject-text strong">Theme</span>
            <span className="subject-more">Light, dark, or the system's. Kept in this browser.</span>
          </span>
        ) : r.kind === "lock" ? (
          <span className="subject">
            <span className="subject-text strong">Lock password</span>
            <span className="subject-more">
              {!meta.lock
                ? "Encrypts the references you lock (⇧L on Reference). A forgotten password can't be reset."
                : `${sealedCount ? plural(sealedCount, "reference") : "Nothing"} locked${lock.unlocked ? ", open now (⌘K › Lock now)" : ""}. A forgotten password can't be reset.`}
            </span>
          </span>
        ) : r.kind === "export" ? (
          <span className="subject">
            <span className="subject-text strong">{r.text}</span>
            <span className="subject-more">
              {r.key === "zip" ? "Every list, and every note with its files." : "Everything in one file, as data."}
            </span>
          </span>
        ) : r.kind === "import" ? (
          <span className="subject">
            <span className="subject-text strong">{r.text}</span>
            <span className="subject-more">
              {r.id === "folder" ? "Such as an Obsidian vault; the pictures the notes show come along." : "Each .md file becomes a note in Reference."}
            </span>
          </span>
        ) : r.kind === "week" ? (
          <span className="subject">
            <span className="subject-text strong">Week starts on</span>
            <span className="subject-more">The first column of the calendar's weeks and months.</span>
          </span>
        ) : r.kind === "hours" ? (
          <span className="subject">
            <span className="subject-text strong">Hours the week shows</span>
            <span className="subject-more">The Calendar's week; an appointment outside these hours stretches it.</span>
          </span>
        ) : r.kind === "alerts" ? (
          <span className="subject">
            <span className="subject-text strong">Appointment reminders</span>
            {alerts.permission === "denied" ? (
              <span className="subject-more error-text">Allow notifications in the browser's site settings, then choose again.</span>
            ) : alerts.permission === "unsupported" ? (
              <span className="subject-more">This browser can't show notifications.</span>
            ) : (
              <span className="subject-more">15 and 5 minutes before each timed appointment, while the app is open.</span>
            )}
          </span>
        ) : r.kind === "feed" ? (
          <span className="subject">
            <span className="subject-text strong">
              <span className="feed-swatch" style={{ background: r.color }} aria-hidden="true" />
              {r.text}
            </span>
            <span className={`subject-more ${r.status ? "error-text" : ""}`}>
              {r.status ? `Can't be read: ${r.status}` : `From ${meta.calendars.find((f) => f.id === r.id)?.host ?? "a link"}, read-only.`}
            </span>
          </span>
        ) : r.kind === "addfeed" ? (
          <span className="subject">
            <span className="subject-text strong">Add a calendar</span>
            <span className="subject-more">A published Outlook or iCloud calendar, shown read-only.</span>
          </span>
        ) : r.kind === "trash" ? (
          <span className="subject">
            <span className="subject-text strong">Keep deleted items</span>
            <span className="subject-more">How long the Trash keeps things before they are gone for good.</span>
          </span>
        ) : r.kind === "stall" ? (
          <span className="subject">
            <span className="subject-text strong">Idle after</span>
            <span className="subject-more">A project untouched this long is marked idle and comes up in the Weekly Review.</span>
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
      label: tab === "areas" ? "Projects" : tab === "contexts" ? "Actions" : "",
      width: "160px",
      render: (r) =>
        r.kind === "theme" ? (
          valueBtn(r, <span>{theme.pref === "system" ? `System (${theme.dark ? "dark" : "light"})` : theme.pref === "dark" ? "Dark" : "Light"}</span>)
        ) : r.kind === "stall" ? (
          valueBtn(r, <span className="num">{plural(meta.stallWeeks, "week")}</span>)
        ) : r.kind === "trash" ? (
          valueBtn(r, <span className="num">{plural(meta.trashDays, "day")}</span>)
        ) : r.kind === "week" ? (
          valueBtn(r, <span>{meta.weekStart === 0 ? "Sunday" : "Monday"}</span>)
        ) : r.kind === "hours" ? (
          valueBtn(r, <span className="num">{hh(meta.dayHours[0])}–{hh(meta.dayHours[1])}</span>)
        ) : r.kind === "alerts" ? (
          alerts.permission === "denied" ? (
            <span className="muted-text error-text">Blocked</span>
          ) : (
            valueBtn(r, <span>{alerts.permission === "granted" || alerts.mode === "off" ? ALERT_LABEL[alerts.mode] : "Off"}</span>)
          )
        ) : r.kind === "feed" ? (
          valueBtn(r, <span>{r.status ? "Fix the link…" : "Change link…"}</span>, { icon: "none" })
        ) : r.kind === "addfeed" ? (
          valueBtn(r, <span>Add…</span>, { icon: "none" })
        ) : r.kind === "lock" ? (
          valueBtn(r, <span>{meta.lock ? "Change…" : "Set…"}</span>, { icon: "none" })
        ) : r.kind === "export" ? (
          valueBtn(r, <span>Download</span>, { icon: "download" })
        ) : r.kind === "import" ? (
          valueBtn(r, <span>Choose…</span>, { icon: "none" })
        ) : r.kind === "area" ? (
          <span className="num muted-text">{plural(s.projects.filter((p) => p.area_id === r.id && p.status === "active").length, "active project")}</span>
        ) : r.kind === "context" ? (
          <span className="num muted-text">{plural(s.actions.filter((a) => a.context_id === r.id && a.status === "next").length, "action")}</span>
        ) : null,
    },
  ];

  const hints: KeyHint[] = [
    { k: "mod+.", label: "Next tab", touch: "hide" as const },
    { k: "mod+,", label: "Previous", touch: "hide" as const },
    ...(tab === "areas" || tab === "contexts"
      ? [
          { k: "n", label: "New" },
          { k: "f2", label: "Rename" },
          { k: "c", label: "Colour" },
          { k: "alt+arrowup", label: "Move" },
          { k: "delete", label: "Delete" },
        ]
      : tab === "data"
        ? [{ k: "enter", label: cur?.kind === "import" ? "Choose" : cur?.kind === "lock" ? (meta.lock ? "Change" : "Set") : "Download" }]
        : cur?.kind === "feed"
          ? [{ k: "enter", label: "Change link" }, { k: "f2", label: "Rename" }, { k: "c", label: "Colour" }, { k: "delete", label: "Remove" }]
          : cur?.kind === "addfeed"
            ? [{ k: "enter", label: "Add a calendar" }]
            : [{ k: "enter", label: "Change" }]),
  ];

  // On a phone the tabs are one sideways-scrolling strip: keep the current one in view.
  useEffect(() => {
    document.querySelector(".settings-tabs .is-current")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tab]);
  return (
    <div className="settings">
      {/* One Tab stop for the tabs (the current one); ← → move between them, as tabs do. */}
      <ol className="review-steps settings-tabs" role="tablist" aria-label="Settings">
        {TABS.map((t, i) => (
          <li key={t.id} role="presentation" className={t.id === tab ? "is-current" : ""}>
            <button
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={t.id === tab}
              aria-controls="settings-panel"
              tabIndex={t.id === tab ? 0 : -1}
              aria-keyshortcuts={String(i + 1)}
              title={`${t.title} (${i + 1})`}
              onClick={() => setTab(t.id)}
              onFocus={() => setOnTabs(true)}
              onBlur={() => setOnTabs(false)}
            >
              {t.title}
            </button>
          </li>
        ))}
      </ol>
      <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${tab}`}>
      <Grid
        listId={`settings-${tab}`}
        columns={columns}
        groups={shown}
        getKey={(r) => r.key}
        nav={nav}
        active={regionActive}
        showHeaders={heads}
        // Areas and Contexts are lists of things, so they carry column heads; the other tabs are settings, one per row.
        head={tab === "areas" || tab === "contexts"}
        // Areas and Contexts are filled here, so an empty one offers its first step (General and Data are never empty).
        empty={
          tab === "areas" ? (
            <EmptyState title="No areas yet" lines={["Areas group your projects: #Work, #Home."]} action={{ label: "New area", run: () => runKey("n") }} />
          ) : tab === "contexts" ? (
            <EmptyState title="No contexts yet" lines={["Contexts say where an action can be done: @computer, @phone."]} action={{ label: "New context", run: () => runKey("n") }} />
          ) : null
        }
        // Double-click: what Enter does, or rename for areas and contexts.
        onOpen={(k) => {
          const r = all.find((x) => x.key === k);
          if (r) actOn(r, r.kind === "area" || r.kind === "context" ? "f2" : "enter");
        }}
      />
      </div>
      <KeyHints hints={hints} touchOnly />
      <input
        ref={filesInput}
        type="file"
        accept=".md,.markdown,text/markdown,image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void importNotes(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        // A folder and all that is in it (every browser takes this attribute, under this name).
        {...{ webkitdirectory: "" }}
        hidden
        onChange={(e) => {
          if (e.target.files) void importNotes(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

async function saveStallWeeks(weeks: number) {
  const res = await fetch("/api/settings/stall", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ weeks }) });
  const j = (await res.json()) as { stallWeeks?: number; error?: string };
  if (j.stallWeeks) {
    updateMeta({ stallWeeks: j.stallWeeks });
    notify(`Projects now count as idle after ${plural(j.stallWeeks, "week")} untouched.`);
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

const linkPreview = (v: string) => {
  const u = v.trim();
  if (!u) return { ok: false, text: "Outlook: Settings › Calendar › Shared calendars › Publish, the ICS link. iCloud: share as a public calendar, the webcal link." };
  if (!/^(https|webcals?|http):\/\//i.test(u)) return { ok: false, text: "A webcal or https link, from the calendar's share or publish settings" };
  return { ok: true, text: "Checks the link first. It stays on the server; only the appointments are shown, read-only." };
};

/** Add a calendar: its link (checked first), then its name (the calendar's own as the suggestion), then its colour. */
function addCalendar(ui: ReturnType<typeof useUI>) {
  ui.openPicker({
    type: "text",
    title: "Calendar link",
    current: "",
    preview: linkPreview,
    onPick: async (v) => {
      const url = v.trim();
      if (!url) return;
      const probe = (await (await fetch("/api/calendars/probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) })).json()) as { ok: boolean; error?: string; count?: number; name?: string | null };
      if (!probe.ok) return notify(probe.error ?? "That link didn't work.", { tone: "error" });
      const guess = probe.name || (/outlook|office365/i.test(url) ? "Work" : /icloud/i.test(url) ? "Private" : "Calendar");
      window.setTimeout(() =>
        ui.openPicker({
          type: "text",
          title: `Name it (${plural(probe.count ?? 0, "appointment")} found)`,
          current: guess,
          onPick: (n) => {
            const name = n.trim() || guess;
            const used = new Set(getMeta().calendars.map((c) => c.color));
            window.setTimeout(() =>
              ui.openPicker({
                type: "list",
                title: `Colour for “${name}”`,
                items: CONTEXT_COLORS.map((c) => ({ id: c, label: COLOR_NAMES[c], color: c })),
                current: CONTEXT_COLORS.find((c) => !used.has(c)) ?? CONTEXT_COLORS[0],
                onPick: (color) => color && void createCalendar(name, color, url),
              }),
            );
          },
        }),
      );
    },
  });
}

async function createCalendar(name: string, color: string, url: string) {
  const j = (await (await fetch("/api/calendars", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, color, url }) })).json()) as { ok: boolean; error?: string; calendars?: FeedInfo[] };
  if (!j.ok) return notify(j.error ?? "That calendar couldn't be added.", { tone: "error" });
  clearEvents();
  updateMeta({ calendars: j.calendars ?? [] });
  notify(`“${name}” added. Its appointments are in the Calendar.`);
}

async function patchCalendar(id: string, patch: { name?: string; color?: string; url?: string }, done: string) {
  const j = (await (await fetch(`/api/calendars/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) })).json()) as { ok: boolean; error?: string; calendars?: FeedInfo[] };
  if (!j.ok) return notify(j.error ?? "That didn't work.", { tone: "error" });
  if (patch.url) clearEvents();
  updateMeta({ calendars: j.calendars ?? [] });
  notify(done);
}

async function removeCalendar(id: string, name: string) {
  const j = (await (await fetch(`/api/calendars/${id}`, { method: "DELETE" })).json()) as { calendars?: FeedInfo[] };
  clearEvents();
  updateMeta({ calendars: j.calendars ?? [] });
  notify(`“${name}” removed. Paste its link again to bring it back.`);
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
async function saveDayHours(start: number, end: number) {
  const res = await fetch("/api/settings/hours", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ start, end }) });
  const j = (await res.json()) as { dayHours?: [number, number]; error?: string };
  if (!j.dayHours) return notify(j.error ?? "That didn't work.", { tone: "error" });
  updateMeta({ dayHours: j.dayHours });
  notify(`The week now shows ${hh(j.dayHours[0])}–${hh(j.dayHours[1])}.`);
}

