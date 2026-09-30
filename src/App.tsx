import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { archiveAllDone, capture, getState, load, notify, undo, upload, useMeta, useStore, isDeferred, isChase, plural, signOut } from "./store.ts";
import { installKeyHandler, useCommands, allCommandsForPalette, keyLabel, type Command } from "./keys.ts";
import { UIContext, VIEW_TITLES, type PickerSpec, type Region, type Target, type UI, type ViewId } from "./ui.tsx";
import { Rail, RAIL, TabBar, CaptureBar, SearchBox, Toast, Palette, HelpOverlay } from "./components/Chrome.tsx";
import { DropZone } from "./components/DropZone.tsx";
import { quickAddNextAction, quickAddWaiting } from "./actionCommands.tsx";
import { TrashView } from "./views/TrashView.tsx";
import { DoneView } from "./views/DoneView.tsx";
import { Picker } from "./components/Picker.tsx";
import { Detail } from "./components/Detail.tsx";
import { ActionsView } from "./views/ActionsView.tsx";
import { InboxView } from "./views/InboxView.tsx";
import { ProjectsView, projectEditors } from "./views/ProjectsView.tsx";
import { SomedayView, ReferenceView } from "./views/SimpleViews.tsx";
import { ClarifyView } from "./views/ClarifyView.tsx";
// Views opened now and then load when first opened, so the lists come up faster on a cold phone.
const CalendarView = lazy(() => import("./views/CalendarView.tsx").then((m) => ({ default: m.CalendarView })));
const ReviewView = lazy(() => import("./views/ReviewView.tsx").then((m) => ({ default: m.ReviewView })));
const SearchView = lazy(() => import("./views/SearchSettings.tsx").then((m) => ({ default: m.SearchView })));
const SettingsView = lazy(() => import("./views/SearchSettings.tsx").then((m) => ({ default: m.SettingsView })));
import { isEditable } from "./keys.ts";
import { isDark, setTheme, useTheme } from "./theme.ts";
import { promptApiKey } from "./apiKey.ts";
import { today } from "../shared/dates.ts";

/**
 * Views with their own address (#inbox, #projects, #reference…), so the browser's Back and Forward move between
 * them and a reload or bookmark lands on the same list. Search is a query, not a place, and gets no entry.
 */
const ROUTED: ViewId[] = ["inbox", "calendar", "next", "waiting", "projects", "someday", "reference", "done", "trash", "review", "settings", "clarify"];
function viewFromHash(): ViewId | null {
  const h = window.location.hash.slice(1) as ViewId;
  // Clarify can't be rebuilt from an address (it needs the run that opened it): it lands on the Inbox it clarifies.
  if (h === "clarify") return "inbox";
  return ROUTED.includes(h) ? h : null;
}

function homeOf(t: Target): ViewId {
  const s = getState();
  if (t.kind === "stuff") return "inbox";
  if (t.kind === "ref") return "reference";
  if (t.kind === "area") return "settings"; // areas are managed in Settings; Projects groups by them
  if (t.kind === "project") {
    const p = s.projects.find((x) => x.id === t.id);
    // An archived completed project is in Done, with everything else that is finished.
    return p?.status === "someday" ? "someday" : p?.status === "done" && p.archived_at ? "done" : "projects";
  }
  const a = s.actions.find((x) => x.id === t.id);
  if (!a) return "next";
  // Done but not archived yet: it is still on the list it was done on.
  if (a.status === "done" && !a.archived_at) return a.done_from ?? "next";
  return ({ next: "next", waiting: "waiting", someday: "someday", done: "done", trashed: "next" } as const)[a.status];
}

export default function App() {
  const meta = useMeta();
  const s = useStore((x) => x);
  const [view, setView] = useState<ViewId>(() => viewFromHash() ?? "next");
  const [region, setRegion] = useState<Region>("list");
  const [detail, setDetail] = useState<Target | null>(null);
  const [detailPinned, setDetailPinnedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gtd:detailPinned") === "1";
    } catch {
      return false;
    }
  });
  const pinnedRef = useRef(detailPinned);
  /** What the active list's cursor is on, so pinning can show it straight away. */
  const cursorTarget = useRef<Target | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  pinnedRef.current = detailPinned;
  const setDetailPinned = useCallback((on: boolean) => {
    setDetailPinnedState(on);
    try {
      localStorage.setItem("gtd:detailPinned", on ? "1" : "0");
    } catch {
      /* storage unavailable: pinned for this session only */
    }
  }, []);
  const [picker, setPicker] = useState<PickerSpec | null>(null);
  const [pickerSeq, setPickerSeq] = useState(0);
  const [palette, setPalette] = useState<Command[] | null>(null);
  const [help, setHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [revealTarget, setRevealTarget] = useState<Target | null>(null);
  const [clarifyRun, setClarifyRun] = useState(0);
  const clarifyReturn = useRef<ViewId>("inbox");
  const clarifyWithClaude = useRef(false);
  const prevView = useRef<ViewId>("next");
  const jumpOrigin = useRef<{ actionId: string; projectId: string } | null>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getState().actions.length && !getState().contexts.length) void load();
    const off = installKeyHandler();
    const left = sessionStorage.getItem("gtd:recoveryLeft");
    if (left !== null) {
      sessionStorage.removeItem("gtd:recoveryLeft");
      notify(`Signed in with a recovery code. ${left} left. Make a fresh set before they run out.`, { tone: "error" });
    }
    return off;
  }, []);

  // Refresh at midnight-ish and when returning to the tab, so tickler items and dates stay current.
  useEffect(() => {
    let day = today();
    const onFocus = () => {
      if (today() !== day) {
        day = today();
        void load();
      }
    };
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(onFocus, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, []);

  // Each view change becomes a browser history entry; Back and Forward (popstate) switch views without adding one.
  const popping = useRef(false);
  const viewNow = useRef(view);
  viewNow.current = view;
  useEffect(() => {
    document.title = `${VIEW_TITLES[view] ?? "Stiltje"} · Stiltje`;
    if (view === "search") return;
    const hash = `#${view}`;
    if (popping.current) {
      popping.current = false;
      if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
      return;
    }
    if (window.location.hash === hash) return;
    if (!window.location.hash) window.history.replaceState(null, "", hash);
    else window.history.pushState(null, "", hash);
  }, [view]);

  const go = useCallback((v: ViewId) => {
    setView((cur) => {
      if (cur !== "search") prevView.current = cur;
      return v;
    });
    setRegion("list");
    // A pinned pane stays open; on a new view it empties until that list's cursor fills it.
    if (v !== viewRef.current) {
      cursorTarget.current = null;
      setDetail(null);
    } else if (!pinnedRef.current) setDetail(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Land on the new view's list, so the keyboard and screen readers start where the cursor is.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".list-region .grid.is-active")?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    const onPop = () => {
      const v = viewFromHash() ?? "next";
      // An address that can't be shown as is (#clarify out of a run, or unknown) is rewritten to the view it lands on.
      if (window.location.hash !== `#${v}` && viewNow.current !== "clarify") window.history.replaceState(null, "", `#${v}`);
      if (v === viewNow.current) return;
      popping.current = true;
      go(v);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [go]);

  const ui: UI = useMemo(
    () => ({
      view,
      go,
      region,
      setRegion: (r) => {
        setRegion(r);
        if (r !== "detail") (document.activeElement as HTMLElement | null)?.blur?.();
        // Coming back to the list always puts focus on it (after capture, search, the detail pane),
        // even when the list was already the active region, so the cursor and screen readers never land on the page.
        if (r === "list") requestAnimationFrame(() => document.querySelector<HTMLElement>(".list-region .grid.is-active")?.focus({ preventScroll: true }));
      },
      detail,
      openDetail: (t, focus) => {
        setDetail(t);
        // Closing the pane on purpose also unpins it.
        if (!t) {
          setDetailPinned(false);
          setRegion("list");
        } else if (focus) setRegion("detail");
      },
      detailPinned,
      setDetailPinned: (on) => {
        setDetailPinned(on);
        if (on) setDetail((prev) => prev ?? cursorTarget.current);
        notify(on ? "Details pinned: the pane stays open and follows the cursor" : "Details unpinned");
      },
      followDetail: (t) => {
        cursorTarget.current = t;
        setDetail((prev) => {
          const same = prev?.kind === t?.kind && prev?.id === t?.id;
          if (same) return prev;
          if (pinnedRef.current) return t;
          return prev && t ? t : prev;
        });
      },
      openPicker: (p) => {
        // A new picker always starts empty, even when it follows straight on from another one.
        setPickerSeq((n) => n + 1);
        setPicker(p);
      },
      pickerOpen: Boolean(picker),
      focusCapture: () => captureRef.current?.focus(),
      openPalette: () => setPalette(allCommandsForPalette()),
      openHelp: () => setHelp(true),
      openSearch: () => {
        if (view !== "search") prevView.current = view;
        setView("search");
        setDetail(null);
        window.setTimeout(() => searchRef.current?.select(), 0);
      },
      searchQuery,
      setSearchQuery,
      startClarify: (returnTo?: ViewId, withClaude = false) => {
        clarifyReturn.current = returnTo ?? "inbox";
        clarifyWithClaude.current = withClaude;
        setClarifyRun((n) => n + 1);
        go("clarify");
      },
      leaveClarify: () => go(clarifyReturn.current),
      clarifyReturn: () => clarifyReturn.current,
      // Resumes the review in progress (see reviewSession.ts); a new one starts after Finish.
      startReview: () => go("review"),
      reveal: (t) => {
        const home = homeOf(t);
        go(home);
        setRevealTarget(t);
      },
      jumpToProject: (actionId) => {
        const s = getState();
        const a = s.actions.find((x) => x.id === actionId);
        const p = a?.project_id ? s.projects.find((x) => x.id === a.project_id && x.status !== "trashed") : undefined;
        if (!a || !p) {
          notify("This action isn't part of a project. P assigns one.");
          return;
        }
        jumpOrigin.current = { actionId, projectId: p.id };
        go(p.status === "someday" ? "someday" : "projects");
        setRevealTarget({ kind: "project", id: p.id });
        notify(`Project: ${p.title}`);
      },
      jumpToAction: (projectId) => {
        const s = getState();
        const open = (id: string) => s.actions.some((x) => x.id === id && ["next", "waiting", "someday"].includes(x.status));
        const origin = jumpOrigin.current;
        let target = origin && origin.projectId === projectId && open(origin.actionId) ? origin.actionId : undefined;
        if (!target) {
          const acts = s.actions.filter((x) => x.project_id === projectId).sort((a, b) => a.sort - b.sort);
          target = (acts.find((x) => x.status === "next") ?? acts.find((x) => x.status === "waiting") ?? acts.find((x) => x.status === "someday"))?.id;
        }
        if (!target) {
          notify("This project has no next action yet. Enter opens it so you can add one.");
          return;
        }
        const t = { kind: "action" as const, id: target };
        go(homeOf(t));
        setRevealTarget(t);
      },
      revealTarget,
      clearReveal: () => setRevealTarget(null),
    }),
    [view, go, region, detail, detailPinned, setDetailPinned, picker, searchQuery, revealTarget],
  );

  const cycleRegion = (dir: 1 | -1) => {
    const order: Region[] = detail || detailPinned ? ["rail", "list", "detail"] : ["rail", "list"];
    const i = order.indexOf(region);
    ui.setRegion(order[(i + dir + order.length) % order.length]);
  };

  const inboxCount = s.stuff.filter((x) => x.status === "inbox").length;
  const archivable = s.actions.filter((a) => a.status === "done" && !a.archived_at).length + s.projects.filter((p) => p.status === "done" && !p.archived_at).length;

  const theme = useTheme();
  const themeTo = (pref: "system" | "light" | "dark") => {
    setTheme(pref);
    notify(pref === "system" ? `Following the system theme (${isDark("system") ? "dark" : "light"} now)` : `${pref === "dark" ? "Dark" : "Light"} theme`);
  };

  const global: Command[] = [
    ...RAIL.map((r, i) => ({
      id: `go.${r.id}`,
      label: `Go to ${VIEW_TITLES[r.id]}`,
      group: "Go to",
      keys: r.key ? [r.key] : [],
      inInput: true,
      run: () => (r.id === "review" ? ui.startReview() : go(r.id)),
      hidden: i > 8,
    })),
    { id: "go.settings", label: "Go to Settings (rules, contexts, export)", group: "Go to", keys: ["mod+shift+,"], inInput: true, run: () => go("settings") },
    { id: "g.capture", label: "Capture to the Inbox", group: "Capture", keys: ["shift+n"], run: () => captureRef.current?.focus() },
    { id: "g.search", label: "Search", group: "Go to", keys: ["alt+q"], inInput: true, run: ui.openSearch },
    { id: "g.palette", label: "Command palette", group: "Help", keys: ["mod+k"], inInput: true, run: ui.openPalette },
    { id: "g.help", label: "Keys on this screen", group: "Help", keys: ["?"], run: () => setHelp(true) },
    { id: "g.undo", label: "Undo", group: "Edit", keys: ["mod+z"], run: undo },
    // K clarifies (you decide, one item at a time); ⌥K clarifies with Claude's proposals.
    { id: "g.clarify", label: `Clarify${inboxCount ? ` (${inboxCount})` : ""}`, group: "Clarify", keys: ["k"], hidden: view === "inbox", run: () => ui.startClarify() },
    { id: "g.clarifyclaude", label: `Clarify with Claude${inboxCount ? ` (${inboxCount})` : ""}`, group: "Clarify", keys: ["alt+k"], run: () => ui.startClarify(undefined, true) },
    // ⇧E archives what is done everywhere, not just on the list in view (owner's request); each list's View menu still
    // archives that list alone.
    { id: "g.archive", label: `Archive all done items to Done${archivable ? ` (${archivable})` : ""}`, group: "Actions", keys: ["shift+e"], run: archiveAllDone },
    { id: "g.review", label: "Start the Weekly Review", group: "Review", keys: ["shift+r"], run: ui.startReview },
    // A project from anywhere: its outcome, its area, its first next action (on Projects, N adds one in place).
    { id: "g.newproject", label: "New project", group: "Projects", keys: ["alt+n"], run: () => projectEditors(ui).create() },
    // A next action from anywhere: what, where (context), and its project if any (T on Projects adds to one).
    { id: "g.newaction", label: "New next action", group: "Actions", keys: ["alt+t"], run: () => quickAddNextAction(ui) },
    // Something you're waiting for, from anywhere: what, who or what you wait on, and its project if any.
    { id: "g.newwaiting", label: "New waiting for", group: "Actions", keys: ["alt+w"], run: () => quickAddWaiting(ui) },
    { id: "g.region", label: "Next region (lists → items → details)", group: "Move", keys: ["alt+tab", "mod+f6"], inInput: true, run: () => cycleRegion(1) },
    { id: "g.regionback", label: "Previous region", group: "Move", keys: ["alt+shift+tab", "mod+shift+f6"], inInput: true, run: () => cycleRegion(-1) },
    // Light, dark, or follow the system: the switch goes to the other theme from whatever is showing now.
    { id: "g.theme", label: theme.dark ? "Switch to the light theme" : "Switch to the dark theme", group: "View", run: () => themeTo(theme.dark ? "light" : "dark") },
    { id: "g.themesystem", label: "Follow the system theme", group: "View", enabled: theme.pref !== "system", run: () => themeTo("system") },
    { id: "g.detailtoggle", label: detail ? "Close details" : "Open details", group: "Move", run: () => (detail ? ui.openDetail(null) : undefined) },
    {
      id: "g.detailpin",
      label: detailPinned ? "Unpin details" : "Pin details (keep the pane open beside every list)",
      group: "Move",
      keys: ["alt+p"],
      run: () => ui.setDetailPinned(!detailPinned),
    },
    { id: "g.paste", label: "Paste into the Inbox", group: "Capture", displayKeys: ["mod+v"], run: () => notify(`Press ${keyLabel("mod+v")} with a list focused to paste into the Inbox`) },
    { id: "g.upload", label: "Upload files to the Inbox", group: "Capture", keys: ["mod+o"], hidden: view === "inbox", run: () => document.querySelector<HTMLInputElement>("#global-upload")?.click() },
    { id: "g.exportzip", label: "Export everything as Markdown (.zip)", group: "Data", run: () => (window.location.href = "/api/export/zip") },
    { id: "g.exportjson", label: "Export everything as JSON", group: "Data", run: () => (window.location.href = "/api/export/json") },
    { id: "g.rules", label: "Rules Claude follows", group: "Settings", run: () => go("settings") },
    // One API-key command at a time: on the Settings screen its own row command takes over.
    { id: "g.apikey", label: meta.hasKey ? "Change the Claude API key" : "Add a Claude API key", group: "Settings", hidden: view === "settings", run: () => promptApiKey(ui) },
    { id: "g.clarifyfresh", label: "Clarify again from scratch (ignore cached proposals)", group: "Clarify", enabled: meta.hasKey, run: () => {
      void fetch("/api/clarify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fresh: true }) }).then(() => ui.startClarify(undefined, true));
    } },
    { id: "g.reload", label: "Reload lists", group: "Data", run: () => void load().then(() => notify("Reloaded")) },
    { id: "g.signout", label: "Sign out", group: "Account", enabled: meta.authRequired, run: () => void signOut() },
    { id: "g.signoutall", label: "Sign out on every device", group: "Account", enabled: meta.authRequired, run: () => void signOut(true) },
  ];
  useCommands("global", global, { priority: 0 });

  // Paste anywhere outside a text field: files and text land in the Inbox.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || !e.clipboardData) return;
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        e.preventDefault();
        void upload(files);
        return;
      }
      const text = e.clipboardData.getData("text/plain");
      if (text.trim()) {
        e.preventDefault();
        void capture(text).then(() => notify(`Pasted into the Inbox: ${text.trim().split("\n")[0].slice(0, 60)}`, { undo: true }));
      }
    };
    // Dropped files are handled by the DropZone overlay.
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  const listActive = region === "list" && !picker && !palette && !help;
  const t = today();
  const deferredNext = s.actions.filter((a) => a.status === "next" && isDeferred(a, t)).length;
  const counts: Partial<Record<ViewId, string>> = {
    inbox: plural(inboxCount, "item"),
    // Deferred actions stay out of the count; the suffix says how many wait for their start date (⌥V shows them).
    next: [
      plural(s.actions.filter((a) => (a.status === "next" && !isDeferred(a, t)) || isChase(a, t)).length, "action"),
      ...(deferredNext ? [`${deferredNext} deferred`] : []),
    ].join(" · "),
    projects: plural(s.projects.filter((p) => p.status === "active").length, "active project"),
    waiting: plural(s.actions.filter((a) => a.status === "waiting").length, "item"),
    someday: plural(s.actions.filter((a) => a.status === "someday").length + s.projects.filter((p) => p.status === "someday").length, "item"),
    reference: plural(s.refs.filter((r) => r.status === "active").length, "reference"),
    done: plural(s.actions.filter((a) => a.status === "done" && a.archived_at).length + s.projects.filter((p) => p.status === "done" && p.archived_at).length, "item"),
    trash: `Kept ${plural(meta.trashDays, "day")}, then gone for good`,
  };

  let body;
  switch (view) {
    case "inbox":
      body = <InboxView regionActive={listActive} />;
      break;
    case "next":
      body = <ActionsView key="next" mode="next" regionActive={listActive} />;
      break;
    case "waiting":
      body = <ActionsView key="waiting" mode="waiting" regionActive={listActive} />;
      break;
    case "done":
      body = <DoneView regionActive={listActive} />;
      break;
    case "someday":
      body = <SomedayView regionActive={listActive} />;
      break;
    case "projects":
      body = <ProjectsView regionActive={listActive} />;
      break;
    case "reference":
      body = <ReferenceView regionActive={listActive} />;
      break;
    case "clarify":
      body = <ClarifyView key={clarifyRun} regionActive={listActive} withClaude={clarifyWithClaude.current} />;
      break;
    case "review":
      body = <ReviewView regionActive={listActive} />;
      break;
    case "search":
      body = <SearchView regionActive={listActive} query={searchQuery} />;
      break;
    case "calendar":
      body = <CalendarView regionActive={listActive} />;
      break;
    case "trash":
      body = <TrashView regionActive={listActive} />;
      break;
    case "settings":
      body = <SettingsView regionActive={listActive} />;
      break;
  }

  return (
    <UIContext.Provider value={ui}>
      <div className={`app ${detail || detailPinned ? "has-detail" : ""}`} data-region={region}>
        <Rail active={region === "rail" && !picker && !palette && !help} />
        <TabBar />
        <main className="main">
          <header className="topbar">
            <CaptureBar ref={captureRef} onDone={() => ui.setRegion("list")} />
            <SearchBox
              ref={searchRef}
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                if (view !== "search") {
                  prevView.current = view;
                  setView("search");
                }
              }}
              onLeave={() => {
                searchRef.current?.blur();
                if (view === "search") {
                  setView(prevView.current);
                  setSearchQuery("");
                }
                setRegion("list");
              }}
              onEnterResults={() => {
                searchRef.current?.blur();
                setRegion("list");
              }}
            />
          </header>
          <div className="viewhead">
            <h1 className="viewtitle" id="view-title">{VIEW_TITLES[view]}</h1>
            {counts[view] && <span className="viewcount">{counts[view]}</span>}
          </div>
          <div className="work">
            {/* On a phone the details sheet covers most of the list; the list stays reachable by keyboard behind it. */}
            <section
              className={`list-region ${region === "list" ? "is-active" : ""}`}
              aria-label={VIEW_TITLES[view]}
              tabIndex={(detail || detailPinned) && region !== "list" && window.matchMedia("(max-width: 820px)").matches ? 0 : undefined}
            >
              {meta.loaded ? <Suspense fallback={<div className="loading" aria-busy="true" />}>{body}</Suspense> : <div className="loading" aria-busy="true" />}
            </section>
            {(detail || detailPinned) && <Detail target={detail} active={region === "detail" && !picker && !palette && !help} />}
          </div>
        </main>
        <Toast />
        <DropZone detail={detail} />
        {picker && <Picker key={pickerSeq} spec={picker} close={() => setPicker(null)} />}
        {palette && <Palette commands={palette} close={() => setPalette(null)} />}
        {help && <HelpOverlay close={() => setHelp(false)} />}
        <input
          id="global-upload"
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </UIContext.Provider>
  );
}
