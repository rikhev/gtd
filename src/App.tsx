import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { capture, getState, load, notify, undo, upload, useMeta, useStore, isDeferred, isChase, plural, signOut } from "./store.ts";
import { installKeyHandler, useCommands, allCommandsForPalette, type Command } from "./keys.ts";
import { UIContext, VIEW_TITLES, type PickerSpec, type Region, type Target, type UI, type ViewId } from "./ui.tsx";
import { Rail, RAIL, CaptureBar, SearchBox, StatusLine, Palette, HelpOverlay } from "./components/Chrome.tsx";
import { Picker } from "./components/Picker.tsx";
import { Detail } from "./components/Detail.tsx";
import { ActionsView } from "./views/ActionsView.tsx";
import { InboxView } from "./views/InboxView.tsx";
import { ProjectsView } from "./views/ProjectsView.tsx";
import { SomedayView, ReferenceView, AreasView } from "./views/SimpleViews.tsx";
import { ClarifyView } from "./views/ClarifyView.tsx";
import { ReviewView } from "./views/ReviewView.tsx";
import { SearchView, SettingsView } from "./views/SearchSettings.tsx";
import { isEditable } from "./keys.ts";
import { promptApiKey } from "./apiKey.ts";
import { today } from "../shared/dates.ts";

function homeOf(t: Target): ViewId {
  const s = getState();
  if (t.kind === "stuff") return "inbox";
  if (t.kind === "ref") return "reference";
  if (t.kind === "area") return "areas";
  if (t.kind === "project") {
    const p = s.projects.find((x) => x.id === t.id);
    return p?.status === "someday" ? "someday" : "projects";
  }
  const a = s.actions.find((x) => x.id === t.id);
  if (!a) return "next";
  return ({ next: "next", waiting: "waiting", someday: "someday", done: "done", trashed: "next" } as const)[a.status];
}

export default function App() {
  const meta = useMeta();
  const s = useStore((x) => x);
  const [view, setView] = useState<ViewId>("next");
  const [region, setRegion] = useState<Region>("list");
  const [detail, setDetail] = useState<Target | null>(null);
  const [picker, setPicker] = useState<PickerSpec | null>(null);
  const [palette, setPalette] = useState<Command[] | null>(null);
  const [help, setHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [revealTarget, setRevealTarget] = useState<Target | null>(null);
  const [clarifyRun, setClarifyRun] = useState(0);
  const [reviewRun, setReviewRun] = useState(0);
  const prevView = useRef<ViewId>("next");
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getState().actions.length && !getState().contexts.length) void load();
    const off = installKeyHandler();
    const left = sessionStorage.getItem("gtd:recoveryLeft");
    if (left !== null) {
      sessionStorage.removeItem("gtd:recoveryLeft");
      notify(`Signed in with a recovery code. ${left} left. Run npm run auth:setup -- --recovery on the server for a fresh set.`, { tone: "error" });
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

  const go = useCallback((v: ViewId) => {
    setView((cur) => {
      if (cur !== "search") prevView.current = cur;
      return v;
    });
    setRegion("list");
    setDetail(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  const ui: UI = useMemo(
    () => ({
      view,
      go,
      region,
      setRegion: (r) => {
        setRegion(r);
        if (r !== "detail") (document.activeElement as HTMLElement | null)?.blur?.();
      },
      detail,
      openDetail: (t, focus) => {
        setDetail(t);
        if (!t) setRegion("list");
        else if (focus) setRegion("detail");
      },
      openPicker: (p) => setPicker(p),
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
      startClarify: () => {
        setClarifyRun((n) => n + 1);
        go("clarify");
      },
      startReview: () => {
        setReviewRun((n) => n + 1);
        go("review");
      },
      reveal: (t) => {
        const home = homeOf(t);
        go(home);
        setRevealTarget(t);
      },
      revealTarget,
      clearReveal: () => setRevealTarget(null),
    }),
    [view, go, region, detail, picker, searchQuery, revealTarget],
  );

  const cycleRegion = (dir: 1 | -1) => {
    const order: Region[] = detail ? ["rail", "list", "detail"] : ["rail", "list"];
    const i = order.indexOf(region);
    ui.setRegion(order[(i + dir + order.length) % order.length]);
  };

  const inboxCount = s.stuff.filter((x) => x.status === "inbox").length;

  const global: Command[] = [
    ...RAIL.map((r, i) => ({
      id: `go.${r.id}`,
      label: `Go to ${VIEW_TITLES[r.id]}`,
      group: "Go to",
      keys: [r.key],
      inInput: true,
      run: () => (r.id === "review" ? ui.startReview() : go(r.id)),
      hidden: i > 8,
    })),
    { id: "go.settings", label: "Go to Settings (rules, contexts, export)", group: "Go to", run: () => go("settings") },
    { id: "g.capture", label: "Capture to the Inbox", group: "Capture", keys: ["shift+n"], run: () => captureRef.current?.focus() },
    { id: "g.search", label: "Search", group: "Go to", keys: ["alt+q"], inInput: true, run: ui.openSearch },
    { id: "g.palette", label: "Command palette", group: "Help", keys: ["mod+k"], inInput: true, run: ui.openPalette },
    { id: "g.help", label: "Keys on this screen", group: "Help", keys: ["?"], run: () => setHelp(true) },
    { id: "g.undo", label: "Undo", group: "Edit", keys: ["mod+z"], run: undo },
    { id: "g.clarify", label: `Clarify the Inbox with Claude${inboxCount ? ` (${inboxCount})` : ""}`, group: "Clarify", keys: ["k"], run: ui.startClarify },
    { id: "g.review", label: "Start the Weekly Review", group: "Review", keys: ["w"], run: ui.startReview },
    { id: "g.region", label: "Next region (lists → items → details)", group: "Move", keys: ["alt+tab", "ctrl+f6"], inInput: true, run: () => cycleRegion(1) },
    { id: "g.regionback", label: "Previous region", group: "Move", keys: ["alt+shift+tab", "ctrl+shift+f6"], inInput: true, run: () => cycleRegion(-1) },
    { id: "g.detailtoggle", label: detail ? "Close details" : "Open details", group: "Move", run: () => (detail ? ui.openDetail(null) : undefined) },
    { id: "g.paste", label: "Paste text, an email or a file into the Inbox", group: "Capture", displayKeys: ["mod+v"], run: () => notify("Press ⌘V with a list focused to paste into the Inbox") },
    { id: "g.upload", label: "Upload files to the Inbox", group: "Capture", keys: ["mod+o"], run: () => document.querySelector<HTMLInputElement>("#global-upload")?.click() },
    { id: "g.exportzip", label: "Export everything as Markdown (.zip)", group: "Data", run: () => (window.location.href = "/api/export/zip") },
    { id: "g.exportjson", label: "Export everything as JSON", group: "Data", run: () => (window.location.href = "/api/export/json") },
    { id: "g.rules", label: "Rules Claude follows", group: "Settings", run: () => go("settings") },
    { id: "g.apikey", label: meta.hasKey ? "Change the Claude API key" : "Add a Claude API key", group: "Settings", run: () => promptApiKey(ui) },
    { id: "g.clarifyfresh", label: "Clarify again from scratch (ignore cached proposals)", group: "Clarify", run: () => {
      void fetch("/api/clarify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fresh: true }) }).then(() => ui.startClarify());
    } },
    { id: "g.reload", label: "Reload lists from disk", group: "Data", run: () => void load().then(() => notify("Reloaded")) },
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
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      void upload(e.dataTransfer.files);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    document.addEventListener("paste", onPaste);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, []);

  const listActive = region === "list" && !picker && !palette && !help;
  const t = today();
  const counts: Partial<Record<ViewId, string>> = {
    inbox: plural(inboxCount, "item"),
    next: plural(s.actions.filter((a) => (a.status === "next" && !isDeferred(a, t)) || isChase(a, t)).length, "action"),
    projects: plural(s.projects.filter((p) => p.status === "active").length, "active project"),
    waiting: plural(s.actions.filter((a) => a.status === "waiting").length, "item"),
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
      body = <ActionsView key="done" mode="done" regionActive={listActive} />;
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
    case "areas":
      body = <AreasView regionActive={listActive} />;
      break;
    case "clarify":
      body = <ClarifyView key={clarifyRun} regionActive={listActive} />;
      break;
    case "review":
      body = <ReviewView key={reviewRun} regionActive={listActive} />;
      break;
    case "search":
      body = <SearchView regionActive={listActive} query={searchQuery} />;
      break;
    case "settings":
      body = <SettingsView regionActive={listActive} />;
      break;
  }

  return (
    <UIContext.Provider value={ui}>
      <div className={`app ${detail ? "has-detail" : ""}`} data-region={region}>
        <Rail active={region === "rail" && !picker && !palette && !help} />
        <div className="main">
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
            <h1 className="viewtitle">{VIEW_TITLES[view]}</h1>
            {counts[view] && <span className="viewcount">{counts[view]}</span>}
          </div>
          <div className="work">
            <section className={`list-region ${region === "list" ? "is-active" : ""}`} aria-label={VIEW_TITLES[view]}>
              {meta.loaded ? body : <div className="loading" aria-busy="true" />}
            </section>
            {detail && <Detail target={detail} active={region === "detail" && !picker && !palette && !help} />}
          </div>
        </div>
        <StatusLine />
        {picker && <Picker spec={picker} close={() => setPicker(null)} />}
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
