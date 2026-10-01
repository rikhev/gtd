import { syncCalendars } from "./calendarFeed.ts";
import { fits, openFit, useFit } from "./fit.ts";
import { inAreas, openAreaFilter, useAreaFilter } from "./areaFilter.ts";
import { loadSession, saveSession } from "./reviewSession.ts";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { quote, archiveAllDone, capture, getState, load, notify, undo, upload, useMeta, useStore, isDeferred, isChase, nextAppointment, onHold, plural, signOut } from "./store.ts";
import { installKeyHandler, useCommands, paletteSnapshot, keyLabel, runKey, type Command, type LayeredCommand } from "./keys.ts";
import { UIContext, VIEW_TITLES, type PickerSpec, type Region, type Target, type UI, type ViewId } from "./ui.tsx";
import { Rail, RAIL, TabBar, CaptureBar, SearchBox, Toast, Palette, paletteScope } from "./components/Chrome.tsx";
import { DropZone } from "./components/DropZone.tsx";
import { quickAddNextAction, quickAddWaiting } from "./actionCommands.tsx";
import { TrashView } from "./views/TrashView.tsx";
import { DoneView } from "./views/DoneView.tsx";
import { AgendasView } from "./views/AgendasView.tsx";
import { Picker } from "./components/Picker.tsx";
import { Detail } from "./components/Detail.tsx";
import { ActionsView } from "./views/ActionsView.tsx";
import { InboxView } from "./views/InboxView.tsx";
import { ProjectsView, projectEditors } from "./views/ProjectsView.tsx";
import { SomedayView, ReferenceView } from "./views/SimpleViews.tsx";
import { ChecklistsView } from "./views/ChecklistsView.tsx";
import { HorizonsView } from "./views/HorizonsView.tsx";
import { openChecklist, progress, progressLabel, startOver, useOpenChecklist } from "./checklists.ts";
import { ClarifyView } from "./views/ClarifyView.tsx";
// Views opened now and then load when first opened, so the lists come up faster on a cold phone.
const CalendarView = lazy(() => import("./views/CalendarView.tsx").then((m) => ({ default: m.CalendarView })));
const ReviewView = lazy(() => import("./views/ReviewView.tsx").then((m) => ({ default: m.ReviewView })));
const SearchView = lazy(() => import("./views/SearchSettings.tsx").then((m) => ({ default: m.SearchView })));
const SettingsView = lazy(() => import("./views/SearchSettings.tsx").then((m) => ({ default: m.SettingsView })));
import { isEditable } from "./keys.ts";
import { isDark, setTheme, useTheme } from "./theme.ts";
import { today } from "../shared/dates.ts";

/**
 * Views with their own address (#inbox, #projects, #reference…), so the browser's Back and Forward move between
 * them and a reload or bookmark lands on the same list. Search is a query, not a place, and gets no entry.
 */
/** Lists with a View menu (⌥V), which touch reaches by a button in the heading. */
const LISTS_WITH_VIEW: ViewId[] = ["next", "waiting", "projects", "done", "agendas", "checklists"];
const ROUTED: ViewId[] = ["inbox", "calendar", "next", "waiting", "agendas", "projects", "someday", "reference", "checklists", "horizons", "done", "trash", "review", "settings", "clarify"];
/** The view an address belongs to: "#checklists/…" (one checklist, open) is still Checklists. */
const hashView = (hash: string) => hash.slice(1).split("/")[0];
/** The address of the checklist open in Checklists, if one is. */
/**
 * The name of what the cursor is on, for the palette's first group ("“Launch the site”"): the item in the details
 * pane when the pane has the keys, else the focused row of the active list, else the focused calendar item.
 */
function focusedName(): string {
  const pane = document.querySelector<HTMLElement>(".detail .field-title");
  if (pane && document.activeElement?.closest(".detail")) {
    const field = pane.matches("input, textarea") ? pane : pane.querySelector<HTMLElement>("input, textarea");
    return quote((field as HTMLInputElement | null)?.value ?? pane.textContent ?? "");
  }
  const row = document.querySelector<HTMLElement>(".grid.is-active .row.is-focus");
  if (row) return quote((row.querySelector(".subject-text") ?? row.querySelector(".c-subject") ?? row).textContent ?? "");
  const item = document.querySelector<HTMLElement>(".list-region [data-focused]");
  if (item) return quote((item.getAttribute("title") ?? item.innerText).split("\n")[0]);
  return "";
}

const openChecklistHash = () => (/^#checklists\/.+/.test(window.location.hash) ? window.location.hash : null);
function viewFromHash(): ViewId | null {
  const h = hashView(window.location.hash) as ViewId;
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
  if (a.status === "done" && !a.archived_at) return a.done_from === "later" ? "projects" : (a.done_from ?? "next");
  // A planned (later) step lives in its project, not on a list.
  return ({ next: "next", waiting: "waiting", someday: "someday", later: "projects", done: "done", trashed: "next" } as const)[a.status];
}

// On a touch screen the cursor row means nothing until you use the list: the fill waits for the first key or tap.
if (typeof window !== "undefined") {
  const engage = () => {
    document.documentElement.classList.add("engaged");
    window.removeEventListener("keydown", engage, true);
    window.removeEventListener("pointerdown", engage, true);
  };
  window.addEventListener("keydown", engage, true);
  window.addEventListener("pointerdown", engage, true);
}

export default function App() {
  const meta = useMeta();
  const s = useStore((x) => x);
  const [view, setView] = useState<ViewId>(() => viewFromHash() ?? "next");
  const [region, setRegion] = useState<Region>("list");
  const [detail, setDetail] = useState<Target | null>(null);
  // What the pane showed before each drill into a related item (a project's action or appointment).
  const [detailTrail, setDetailTrail] = useState<Target[]>([]);
  // Set while the pane moves along the trail, so the change below doesn't clear it.
  const alongTrail = useRef(false);
  useEffect(() => {
    if (alongTrail.current) alongTrail.current = false;
    else setDetailTrail((t) => (t.length ? [] : t));
  }, [detail]);
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
  // The palette, ⌘K: what it lists is taken as it opens, before it takes the keys, with where the focus is.
  const [palette, setPalette] = useState<{ entries: LayeredCommand[]; where: string; rowName: string } | null>(null);

  // A press outside the detail pane takes the keys out of it (owner's request): on a list row the row's list becomes
  // the active region with that row under the cursor, anywhere else the list does, and a control outside (the rail,
  // capture, search) takes focus as it would anyway. While a picker or dialog is open the press belongs to it.
  const outside = useRef({ region, overlay: false });
  outside.current = { region, overlay: Boolean(picker || palette) };
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || outside.current.region !== "detail" || outside.current.overlay) return;
      const t = e.target as Element | null;
      if (!t || t.closest(".detail, .picker, .overlay, .toast, .dropzone")) return;
      const was = document.activeElement as HTMLElement | null;
      if (was?.closest(".detail")) was.blur(); // an open field saves on blur, as a click away always did
      setRegion("list");
      // The press's own focus lands first (a rail stop or a field claims its region); if it left focus nowhere,
      // the list takes it, so the keys and screen readers follow the row that was clicked.
      requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body)
          document.querySelector<HTMLElement>(".list-region .grid.is-active")?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [revealTarget, setRevealTarget] = useState<Target | null>(null);
  const [clarifyRun, setClarifyRun] = useState(0);
  const clarifyReturn = useRef<ViewId>("inbox");
  const prevView = useRef<ViewId>("next");
  // Where J came from (an action, or an appointment in the Calendar), so J on the project goes back there.
  const jumpOrigin = useRef<{ actionId?: string; eventKey?: string; refId?: string; checklistId?: string; projectId: string } | null>(null);
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
  // The tab names the view, and inside a checklist the checklist ("Packing for a trip · Checklists · Stiltje").
  const openListId = useOpenChecklist();
  const openList = view === "checklists" && openListId ? s.checklists.find((c) => c.id === openListId && c.status === "active") : undefined;
  useEffect(() => {
    document.title = `${openList ? `${openList.title || "Untitled checklist"} · ` : ""}${VIEW_TITLES[view] ?? "Stiltje"} · Stiltje`;
  }, [view, openList?.title, openList]);
  const viewNow = useRef(view);
  viewNow.current = view;
  useEffect(() => {
    if (view === "search") return;
    // Checklists keeps a checklist that is open in its address (#checklists/…).
    const hash = view === "checklists" && openChecklistHash() ? openChecklistHash()! : `#${view}`;
    if (popping.current) {
      popping.current = false;
      if (hashView(window.location.hash) !== view) window.history.replaceState(null, "", hash);
      return;
    }
    if (window.location.hash === hash) return;
    if (!window.location.hash) window.history.replaceState(null, "", hash);
    else window.history.pushState(null, "", hash);
  }, [view]);

  const go = useCallback((v: ViewId, popped = false) => {
    // Going to Checklists lands on every checklist; Back and Forward land where their address says.
    if (v === "checklists" && !popped) openChecklist(null, viewRef.current === "checklists");
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
      // A picker belongs to the list it was opened on: Back or Forward to another place closes it.
      setPicker(null);
      const v = viewFromHash() ?? "next";
      // An address that can't be shown as is (#clarify out of a run, or unknown) is rewritten to the view it lands on.
      if (hashView(window.location.hash) !== v && viewNow.current !== "clarify") window.history.replaceState(null, "", `#${v}`);
      if (v === viewNow.current) return;
      popping.current = true;
      go(v, true);
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
      drillDetail: (t) => {
        if (!detail || (detail.kind === t.kind && detail.id === t.id)) return;
        alongTrail.current = true;
        setDetailTrail((tr) => [...tr, detail]);
        setDetail(t);
        setRegion("detail");
      },
      detailTrail,
      detailBack: () => {
        const prev = detailTrail[detailTrail.length - 1];
        if (!prev) return;
        alongTrail.current = true;
        setDetailTrail((tr) => tr.slice(0, -1));
        setDetail(prev);
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
      openPalette: () => {
        const entries = paletteSnapshot();
        setPalette({ entries, where: paletteScope(entries, VIEW_TITLES[viewNow.current] ?? "This screen"), rowName: focusedName() });
      },
      openSearch: () => {
        if (view !== "search") prevView.current = view;
        setView("search");
        setDetail(null);
        window.setTimeout(() => searchRef.current?.select(), 0);
      },
      searchQuery,
      setSearchQuery,
      startClarify: (returnTo?: ViewId) => {
        clarifyReturn.current = returnTo ?? "inbox";
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
        // A planned step is shown in its project: the project under the cursor, the step open in the pane.
        const a = t.kind === "action" ? getState().actions.find((x) => x.id === t.id) : undefined;
        if (a?.status === "later" && a.project_id) {
          setRevealTarget({ kind: "project", id: a.project_id });
          setDetail({ kind: "action", id: a.id });
          return;
        }
        setRevealTarget(t);
      },
      jumpToProject: (actionId) => {
        const s = getState();
        const a = s.actions.find((x) => x.id === actionId);
        const p = a?.project_id ? s.projects.find((x) => x.id === a.project_id && x.status !== "trashed") : undefined;
        if (!a || !p) {
          notify("This action isn't part of a project. P sets one.");
          return;
        }
        jumpOrigin.current = { actionId, projectId: p.id };
        go(p.status === "someday" ? "someday" : "projects");
        setRevealTarget({ kind: "project", id: p.id });
        notify(`Project: ${p.title}`);
      },
      jumpFromAppointment: (key) => {
        const s = getState();
        const link = s.appointments.find((x) => x.id === key);
        const p = link ? s.projects.find((x) => x.id === link.project_id && x.status !== "trashed") : undefined;
        if (!link || !p) {
          notify("This appointment isn't linked to a project. P links one.");
          return;
        }
        jumpOrigin.current = { eventKey: key, projectId: p.id };
        go(p.status === "someday" ? "someday" : "projects");
        setRevealTarget({ kind: "project", id: p.id });
        notify(`Project: ${p.title}`);
      },
      jumpFromSupport: (kind, id) => {
        const s = getState();
        const row = kind === "ref" ? s.refs.find((x) => x.id === id) : s.checklists.find((x) => x.id === id);
        const p = row?.project_id ? s.projects.find((x) => x.id === row.project_id && x.status !== "trashed") : undefined;
        if (!row || !p) {
          notify(`This ${kind === "ref" ? "reference" : "checklist"} doesn't support a project. P links one.`);
          return;
        }
        jumpOrigin.current = kind === "ref" ? { refId: id, projectId: p.id } : { checklistId: id, projectId: p.id };
        go(p.status === "someday" ? "someday" : "projects");
        setRevealTarget({ kind: "project", id: p.id });
        notify(`Project: ${p.title}`);
      },
      // Where J on a project goes back to, if it came from somewhere still linked (else it goes to its next action).
      jumpBackTo: (projectId) => {
        const s = getState();
        const o = jumpOrigin.current;
        if (o?.projectId !== projectId) return null;
        if (o.refId && s.refs.some((x) => x.id === o.refId && x.status === "active" && x.project_id === projectId)) return "reference";
        if (o.checklistId && s.checklists.some((x) => x.id === o.checklistId && x.status === "active" && x.project_id === projectId)) return "checklist";
        if (o.eventKey && s.appointments.some((x) => x.id === o.eventKey && x.project_id === projectId)) return "appointment";
        return null;
      },
      jumpToAction: (projectId) => {
        const s = getState();
        const open = (id: string) => s.actions.some((x) => x.id === id && ["next", "waiting", "someday"].includes(x.status));
        const origin = jumpOrigin.current;
        // Jumped here from its support material, still linked: back to that reference or checklist.
        if (origin?.projectId === projectId && origin.refId && s.refs.some((x) => x.id === origin.refId && x.status === "active" && x.project_id === projectId)) {
          go("reference");
          setRevealTarget({ kind: "ref", id: origin.refId });
          return;
        }
        if (origin?.projectId === projectId && origin.checklistId && s.checklists.some((x) => x.id === origin.checklistId && x.status === "active" && x.project_id === projectId)) {
          go("checklists");
          openChecklist(origin.checklistId);
          return;
        }
        const toCalendar = (key: string) => {
          go("calendar");
          setRevealTarget({ kind: "event", id: key });
        };
        // Jumped here from an appointment that is still linked: back to it in the Calendar.
        if (origin?.eventKey && origin.projectId === projectId && s.appointments.some((x) => x.id === origin.eventKey && x.project_id === projectId)) return toCalendar(origin.eventKey);
        let target = origin?.actionId && origin.projectId === projectId && open(origin.actionId) ? origin.actionId : undefined;
        if (!target) {
          const acts = s.actions.filter((x) => x.project_id === projectId).sort((a, b) => a.sort - b.sort);
          target = (acts.find((x) => x.status === "next") ?? acts.find((x) => x.status === "waiting") ?? acts.find((x) => x.status === "someday"))?.id;
        }
        if (!target) {
          // No action to go to, but an appointment ahead is its next step: that, in the Calendar.
          const p = s.projects.find((x) => x.id === projectId);
          const appt = p ? nextAppointment(s, p) : null;
          if (appt) return toCalendar(appt.id);
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
    [view, go, region, detail, detailTrail, detailPinned, setDetailPinned, picker, searchQuery, revealTarget],
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
      // The review has its own entry (Start the Weekly Review); every list is offered.
      hidden: r.id === "review",
    })),
    { id: "go.settings", label: "Go to Settings", group: "Go to", keys: ["mod+shift+,"], inInput: true, run: () => go("settings") },
    // Horizons has no rail stop or key (owner's decision): looked at quarterly, from ⌘K and the review's Get creative.
    { id: "go.horizons", label: "Go to Horizons", group: "Go to", run: () => go("horizons") },
    { id: "g.capture", label: "Capture to the Inbox", group: "Capture", keys: ["shift+n"], run: () => captureRef.current?.focus() },
    { id: "g.search", label: "Search", group: "Go to", keys: ["alt+q"], inInput: true, run: ui.openSearch },
    { id: "g.palette", label: "Open the command palette", group: "Help", keys: ["mod+k"], inInput: true, run: ui.openPalette },
    { id: "g.undo", label: "Undo", group: "Edit", keys: ["mod+z"], run: undo },
    // K clarifies: you decide, one item at a time.
    { id: "g.clarify", label: `Clarify${inboxCount ? ` (${inboxCount})` : ""}`, group: "Clarify", keys: ["k"], hidden: view === "inbox", run: () => ui.startClarify() },
    // ⇧E archives what is done everywhere, not just on the list in view (owner's request); each list's View menu still
    // archives that list alone.
    { id: "g.archive", label: `Archive all done items to Done${archivable ? ` (${archivable})` : ""}`, group: "Actions", keys: ["shift+e"], run: archiveAllDone },
    // A mind sweep on its own: the Weekly Review opened at its first step.
    {
      id: "g.sweep",
      label: "Start a mind sweep",
      group: "Review",
      enabled: view !== "review",
      run: () => {
        saveSession({ ...loadSession(), stepIdx: 0, stepId: "sweep" });
        ui.startReview();
      },
    },
    // Sync the subscribed calendars from anywhere (in the Calendar also ⌥S and its toolbar button).
    { id: "g.synccal", label: "Sync calendars", group: "Calendar", enabled: meta.calendars.length > 0 && view !== "calendar", run: () => void syncCalendars() },
    { id: "g.review", label: "Start the Weekly Review", group: "Review", keys: ["shift+r"], run: ui.startReview },
    // A project from anywhere: its outcome, its area, its first next action (on Projects, N adds one in place).
    { id: "g.newproject", label: "New project", group: "Projects", keys: ["alt+n"], run: () => projectEditors(ui).create() },
    // A next action from anywhere: what, where (context), and its project if any (T on Projects adds to one).
    { id: "g.newaction", label: "New next action", group: "Actions", keys: ["alt+t"], run: () => quickAddNextAction(ui) },
    // Something you're waiting for, from anywhere: what, who or what you wait on, and its project if any.
    { id: "g.newwaiting", label: "New waiting for", group: "Actions", keys: ["alt+w"], run: () => quickAddWaiting(ui) },
    { id: "g.region", label: "Go to the next region", group: "Move", keys: ["alt+tab", "mod+f6"], inInput: true, run: () => cycleRegion(1) },
    { id: "g.regionback", label: "Go to the previous region", group: "Move", keys: ["alt+shift+tab", "mod+shift+f6"], inInput: true, run: () => cycleRegion(-1) },
    // Light, dark, or follow the system: the switch goes to the other theme from whatever is showing now.
    { id: "g.theme", label: theme.dark ? "Switch to the light theme" : "Switch to the dark theme", group: "View", run: () => themeTo(theme.dark ? "light" : "dark") },
    { id: "g.themesystem", label: "Follow the system theme", group: "View", enabled: theme.pref !== "system", run: () => themeTo("system") },
    { id: "g.detailtoggle", label: detail ? "Close details" : "Open details", group: "Move", run: () => (detail ? ui.openDetail(null) : undefined) },
    {
      id: "g.detailpin",
      label: detailPinned ? "Unpin details" : "Pin details",
      group: "Move",
      keys: ["alt+p"],
      run: () => ui.setDetailPinned(!detailPinned),
    },
    { id: "g.paste", label: "Paste into the Inbox", group: "Capture", displayKeys: ["mod+v"], run: () => notify(`Press ${keyLabel("mod+v")} with a list focused to paste into the Inbox`) },
    { id: "g.upload", label: "Upload files to the Inbox", group: "Capture", keys: ["mod+o"], hidden: view === "inbox", run: () => document.querySelector<HTMLInputElement>("#global-upload")?.click() },
    { id: "g.exportzip", label: "Export everything as Markdown (.zip)", group: "Data", run: () => (window.location.href = `/api/export/zip?today=${today()}`) },
    { id: "g.exportjson", label: "Export everything as JSON", group: "Data", run: () => (window.location.href = "/api/export/json") },
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

  const listActive = region === "list" && !picker && !palette;
  const t = today();
  const deferredNext = s.actions.filter((a) => a.status === "next" && !onHold(a, s) && isDeferred(a, t)).length;
  const fitNow = useFit();
  const areaFilter = useAreaFilter();
  const activeProjects = s.projects.filter((p) => p.status === "active");
  const nextShown = s.actions.filter((a) => (a.status === "next" && !onHold(a, s) && !isDeferred(a, t)) || isChase(a, t));
  // A count says how many there are; none is said by the list's empty state, so the heading carries no "0 items".
  const some = (n: number, noun: string) => (n ? plural(n, noun) : "");
  const counts: Partial<Record<ViewId, string>> = {
    inbox: some(inboxCount, "item"),
    // Deferred actions stay out of the count; the suffix says how many wait for their start date (⌥V shows them).
    next: [
      // While What fits now is on, the count says how many of them fit.
      fitNow
        ? `${nextShown.filter((a) => fits(a, fitNow) === "fits").length} of ${plural(nextShown.length, "action")} fit`
        : some(nextShown.length, "action"),
      ...(deferredNext ? [`${deferredNext} deferred`] : []),
    ]
      .filter(Boolean)
      .join(" · "),
    // While Projects is narrowed to areas, the count says how many of them are shown.
    projects: areaFilter
      ? `${activeProjects.filter((p) => inAreas(p.area_id, areaFilter)).length} of ${plural(activeProjects.length, "active project")}`
      : some(activeProjects.length, "active project"),
    waiting: some(s.actions.filter((a) => a.status === "waiting" && !onHold(a, s)).length, "item"),
    agendas: (() => {
      const n = new Set(s.actions.flatMap((a) => (a.status === "next" ? [a.person] : a.status === "waiting" ? [a.waiting_who] : [])).filter((w): w is string => Boolean(w?.trim())).map((w) => w.trim().toLowerCase())).size;
      return n ? `${n} ${n === 1 ? "person" : "people"}` : "";
    })(),
    someday: some(s.actions.filter((a) => a.status === "someday").length + s.projects.filter((p) => p.status === "someday").length, "item"),
    reference: some(s.refs.filter((r) => r.status === "active").length, "reference"),
    // Inside a checklist, how far this run has got; otherwise how many checklists there are.
    checklists: openList
      ? (() => {
          const p = progress(s, openList.id);
          // Nothing to tick yet is said by the empty checklist itself; a routine always counts its day or week ("0 of 5 today", "All 5 done this week").
          if (!p.total) return "";
          if (p.repeats) return progressLabel(p) || `0 of ${p.total} ${p.repeats === "day" ? "today" : "this week"}`;
          return !p.ticked ? plural(p.total, "item") : p.ticked === p.total ? progressLabel(p) : `${p.ticked} of ${p.total} ticked`;
        })()
      : some(s.checklists.filter((c) => c.status === "active").length, "checklist"),
    horizons: some(s.horizons.filter((h) => h.kind === "goal" && h.status === "active").length, "goal"),
    done: some(s.actions.filter((a) => a.status === "done" && a.archived_at).length + s.projects.filter((p) => p.status === "done" && p.archived_at).length, "item"),
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
    case "agendas":
      body = <AgendasView regionActive={listActive} />;
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
    case "checklists":
      body = <ChecklistsView regionActive={listActive} />;
      break;
    case "horizons":
      body = <HorizonsView regionActive={listActive} />;
      break;
    case "clarify":
      body = <ClarifyView key={clarifyRun} regionActive={listActive} />;
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
        <Rail active={region === "rail" && !picker && !palette} />
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
            {openList ? (
              // Inside a checklist: the way back up to every checklist, then the checklist's own name.
              <>
                <button type="button" className="viewcrumb" onClick={() => openChecklist(null)} title={`Every checklist (${keyLabel("escape")})`}>
                  Checklists
                </button>
                <ChevronRight className="viewcrumb-sep" size={14} strokeWidth={2} aria-hidden />
                <h1 className="viewtitle" id="view-title">{openList.title || "Untitled checklist"}</h1>
              </>
            ) : (
              <h1 className="viewtitle" id="view-title">{VIEW_TITLES[view]}</h1>
            )}
            {counts[view] && <span className="viewcount">{counts[view]}</span>}
            <span className="viewtools">
              {/* What fits now, in sight where it is used; while it is on, the line above the list takes over. */}
              {view === "next" && !fitNow && (
                <button type="button" className="text-btn" onClick={() => openFit(ui)}>
                  What fits now
                </button>
              )}
              {view === "projects" && !areaFilter && s.areas.length > 0 && (
                <button type="button" className="text-btn" onClick={() => openAreaFilter(ui)}>
                  Filter by area
                </button>
              )}
              {/* A run under way can be started over from here: it has no key of its own (⌥V and ⌘K have it). */}
              {openList && !openList.repeats && progress(s, openList.id).ticked > 0 && (
                <button type="button" className="text-btn" onClick={() => startOver([openList.id])}>
                  Start over
                </button>
              )}
              {/* Touch has no ⌥V: the list's View menu (group, sort, show) as a button. */}
              {LISTS_WITH_VIEW.includes(view) && (
                <button type="button" className="text-btn touch-only" onClick={() => runKey("alt+v")}>
                  View
                </button>
              )}
            </span>
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
            {(detail || detailPinned) && <Detail target={detail} active={region === "detail" && !picker && !palette} />}
          </div>
        </main>
        <Toast />
        <DropZone detail={detail} />
        {picker && <Picker key={pickerSeq} spec={picker} close={() => setPicker(null)} />}
        {palette && <Palette {...palette} close={() => setPalette(null)} />}
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
