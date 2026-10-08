import { forwardRef, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Search, Check, LogOut, Plus, Menu, X, ArrowUp } from "lucide-react";
import { capture, daysSinceReview, notify, signOut, useMeta, useNotice, useTables, isStalled, isChase, isLate, onHold } from "../store.ts";
import { useUI, VIEW_TITLES, type ViewId } from "../ui.tsx";
import { useCommands, keyLabel, keyAria, IS_MAC, activeCommands, layersVersion, subscribeLayers, type Command, type LayeredCommand } from "../keys.ts";
import { Kbd } from "./bits.tsx";
import { Pond } from "./Pond.tsx";
import { daysBetween, today } from "../../shared/dates.ts";
import { phoneAdder, type PhoneAdder } from "../phoneAdd.ts";
import { useOpenChecklist } from "../checklists.ts";
import { useOpenRefList } from "../refList.ts";

/**
 * The go-to keys follow the rail from the top, counted per group so every key sits under one hand (owner's request:
 * ⌃7–9 needed a second hand). The first group is Control+1–6 (Inbox, Calendar, Next Actions, Waiting For, Agendas,
 * Projects); the second group and the foot below it are Control+Shift+1–5 (Someday, Reference, Checklists, then Done
 * and Trash): Shift
 * means "the second group", counted from 1 again. Digits are read by their key, so it works on every layout. On the
 * Mac that is ⌃, not ⌘: ⌘⇧3–5 are macOS screenshots and ⌘1–8 are the browser's tabs. Elsewhere the page takes
 * Ctrl+1–6 over the browser's tab switching (Chrome and Firefox allow it); Ctrl+Shift+digits are free. Control with a
 * letter was ruled out: on the Mac those edit text (⌃A, ⌃E…), elsewhere the browser owns many (Ctrl+W, Ctrl+R).
 * The Weekly Review has no go-to key (⇧R starts it); Settings is ⌘⇧, (Ctrl+Shift+, elsewhere).
 */
// Control on every system: on the Mac that is "ctrl" (⌘ is "mod"), elsewhere Ctrl is "mod".
const go = (n: number) => (IS_MAC ? `ctrl+${n}` : `mod+${n}`);
/** The second group: Control+Shift and a digit. */
const go2 = (n: number) => (IS_MAC ? `ctrl+shift+${n}` : `mod+shift+${n}`);

export const RAIL: { id: ViewId; key?: string }[] = [
  { id: "inbox", key: go(1) },
  { id: "calendar", key: go(2) },
  { id: "next", key: go(3) },
  { id: "waiting", key: go(4) },
  // Agendas follow Waiting For (they gather it by person).
  { id: "agendas", key: go(5) },
  { id: "projects", key: go(6) },
  { id: "someday", key: go2(1) },
  { id: "reference", key: go2(2) },
  // Checklists follow Reference: both non-actionable, but GTD keeps checklists as their own category (reviewed, not filed).
  { id: "checklists", key: go2(3) },
  // Horizons has no rail stop or key (owner's decision after the rail critique: looked at quarterly, from the review's
  // Get creative and ⌘K). Done and Trash sit together at the foot, looking back, keys in the order they appear.
  { id: "done", key: go2(4) },
  { id: "trash", key: go2(5) },
  { id: "review" },
];

/**
 * The rail: the Inbox, the lists in the order they're used, and a system check that answers
 * GTD's weekly question ("is my system current?") with links to where each answer is fixed.
 */
// The calendar follows the Inbox: in GTD it is the hard landscape, checked before the lists are worked.
const LISTS: ViewId[][] = [
  ["inbox", "calendar", "next", "waiting", "agendas", "projects"],
  ["someday", "reference", "checklists"],
];

type Entry = { key: string; view: ViewId; label: string; name: string; start?: boolean };

/**
 * The rail's signals, shared by the desktop rail and the phone's menu: numbers only where they ask for something.
 */
function useRailSignals() {
  const s = useTables("stuff", "actions", "projects", "reviews");
  const { stallWeeks } = useMeta(); // recount stalled projects when the threshold changes
  const t = today();

  // Signals, not inventory: a number shows only where it asks for something.
  const sig = useMemo(() => {
    const inboxItems = s.stuff.filter((x) => x.status === "inbox");
    const nextActs = s.actions.filter((a) => a.status === "next" && !onHold(a, s));
    // Late: next actions whose day to do them has passed (owner's decision: one date, Do on).
    const late = nextActs.filter((a) => isLate(a, t)).length;
    const chase = s.actions.filter((a) => isChase(a, t)).length;
    const stalled = s.projects.filter((p) => isStalled(s, p)).length;
    const doneToday = s.actions.filter((a) => a.status === "done" && a.completed_at && a.completed_at.slice(0, 10) === t).length;
    const oldest = inboxItems.reduce<string | null>((m, x) => (m === null || x.created_at < m ? x.created_at : m), null);
    const oldestDays = oldest ? daysBetween(oldest.slice(0, 10), t) : null;
    // The oldest thing in the whole system: a review is only "due" once there is a week's worth to review.
    const firstDay = [...s.actions, ...s.projects, ...s.stuff].reduce<string | null>((m, x) => (m === null || x.created_at < m ? x.created_at : m), null);
    const systemAge = firstDay ? daysBetween(firstDay.slice(0, 10), t) : 0;
    // What the Calendar holds for today: actions and projects to do today, and follow-ups to make today.
    const scheduled =
      s.actions.filter((a) => ["next", "waiting"].includes(a.status) && !onHold(a, s) && ((a.status === "next" && a.defer === t) || (a.status === "waiting" && a.followup === t))).length +
      s.projects.filter((p) => p.status === "active" && p.start === t).length;
    return { inbox: inboxItems.length, late, chase, stalled, doneToday, oldestDays, systemAge, scheduled };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, t, stallWeeks]);
  const listMeta = (id: ViewId): { text: string; tone?: "due" | "quiet" } | null => {
    if (id === "inbox") return sig.inbox ? { text: String(sig.inbox) } : null;
    if (id === "next") return sig.late ? { text: `${sig.late} late`, tone: "due" } : null;
    if (id === "waiting") return sig.chase ? { text: `${sig.chase} to chase`, tone: "due" } : null;
    if (id === "projects") return sig.stalled ? { text: `${sig.stalled} stalled`, tone: "due" } : null;
    if (id === "done") return sig.doneToday ? { text: `${sig.doneToday} today`, tone: "quiet" } : null;
    // What today holds: what is to be done today (actions and projects on their day, follow-ups).
    // What the hard landscape asks of today; "today" stays Done's word for what was finished (rail critique).
    if (id === "calendar") return sig.scheduled ? { text: `${sig.scheduled} to do`, tone: "quiet" } : null;
    return null;
  };

  return { s, sig, listMeta };
}

export function Rail({ active }: { active: boolean }) {
  useHeldModifier();
  const ui = useUI();
  const { s, sig, listMeta } = useRailSignals();
  const { authRequired } = useMeta();
  const [cursor, setCursor] = useState(0);
  const reviewAge = daysSinceReview(s);
  // The Inbox count is spoken only when it grows (something new landed), never as it is worked down.
  const lastInbox = useRef(sig.inbox);
  const [inboxNews, setInboxNews] = useState("");
  useEffect(() => {
    if (sig.inbox > lastInbox.current) setInboxNews(sig.inbox === 1 ? "1 item in the Inbox" : `${sig.inbox} items in the Inbox`);
    lastInbox.current = sig.inbox;
  }, [sig.inbox]);
  const reviewDue = reviewAge === null ? sig.systemAge >= 7 : reviewAge >= 7;

  // Every stop the cursor can reach, in screen order.
  const health: Entry[] = [
    {
      key: "h-review",
      view: "review",
      name: "Weekly Review",
      start: true,
      label: `Weekly Review, ${reviewAge === null ? "not done yet" : reviewAge === 0 ? "done today" : `last done ${reviewAge} days ago`}${reviewDue ? ", due" : ""}`,
    },
    ...(sig.oldestDays !== null ? [{ key: "h-oldest", view: "inbox" as ViewId, name: "Oldest in Inbox", label: `Oldest in the Inbox: ${sig.oldestDays === 0 ? "today" : `${sig.oldestDays} ${sig.oldestDays === 1 ? "day" : "days"}`}${sig.oldestDays >= 7 ? ", due" : ""}. Clarify` }] : []),
  ];
  const entries: Entry[] = [
    ...LISTS.flat().map((id) => {
      const m = listMeta(id);
      return { key: id, view: id, name: VIEW_TITLES[id], label: `${VIEW_TITLES[id]}${m ? `, ${id === "inbox" ? `${m.text} ${m.text === "1" ? "item" : "items"}` : m.text}` : ""}` };
    }),
    ...health,
    // The foot: what is finished and what was deleted, both to look back at, then Settings.
    { key: "done", view: "done", name: VIEW_TITLES.done, label: `${VIEW_TITLES.done}${listMeta("done") ? `, ${listMeta("done")!.text}` : ""}` },
    { key: "trash", view: "trash", name: "Trash", label: "Trash" },
    { key: "settings", view: "settings", name: "Settings", label: "Settings" },
  ];
  const idx = (key: string) => entries.findIndex((e) => e.key === key);
  // Where you are: the open list's stop (the review's own row while it runs), or the Inbox for views off the rail.
  const here = Math.max(0, entries.findIndex((e) => e.view === ui.view));
  const open = (e: Entry) => {
    if (e.start) ui.startReview();
    // The oldest item is waiting to be clarified: the row does what its key (K) does, not the Inbox row's job.
    else if (e.key === "h-oldest") ui.startClarify();
    else ui.go(e.view);
    ui.setRegion("list");
  };

  useEffect(() => {
    if (active) setCursor((c) => (entries[c] && document.activeElement?.closest("nav.rail") ? c : here));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Letter jump: the first letter of a stop's name moves the cursor to the next stop starting with it.
  // K stays the app-wide "clarify" key, as the check line shows.
  const letters = [...new Set(entries.map((e) => e.name[0].toLowerCase()))].filter((ch) => ch !== "k");
  const jump = (ch: string) =>
    setCursor((c) => {
      for (let n = 1; n <= entries.length; n++) {
        const i = (c + n) % entries.length;
        if (entries[i].name.toLowerCase().startsWith(ch)) return i;
      }
      return c;
    });

  useCommands(
    "rail",
    [
      { id: "rail.down", label: "Go down the rail", group: "Move", keys: ["arrowdown"], run: () => setCursor((c) => Math.min(entries.length - 1, c + 1)) },
      { id: "rail.up", label: "Go up the rail", group: "Move", keys: ["arrowup"], run: () => setCursor((c) => Math.max(0, c - 1)) },
      { id: "rail.first", label: "Go to the top of the rail", group: "Move", keys: ["home", "mod+arrowup"], run: () => setCursor(0) },
      { id: "rail.last", label: "Go to the foot of the rail", group: "Move", keys: ["end", "mod+arrowdown"], run: () => setCursor(entries.length - 1) },
      { id: "rail.open", label: "Open", group: "Move", keys: ["enter", "arrowright", "space"], run: () => entries[cursor] && open(entries[cursor]) },
      { id: "rail.leave", label: "Back to the list", group: "Move", keys: ["escape"], run: () => ui.setRegion("list") },
      ...letters.map((ch) => ({ id: `rail.jump.${ch}`, label: `Jump to “${ch.toUpperCase()}…”`, group: "Move", keys: [ch], hidden: true, run: () => jump(ch) })),
    ],
    { priority: 10, active },
  );

  // While the rail is the active region its cursor is real keyboard focus, so screen readers follow it.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    const el = navRef.current?.querySelector<HTMLElement>(`[data-rail="${cursor}"]`);
    el?.focus({ preventScroll: true });
    // In a short window the rail scrolls: the cursor never rests on a row out of sight (rail critique).
    el?.scrollIntoView({ block: "nearest" });
  }, [active, cursor]);
  // Focus arriving by Tab (or a click) makes the rail the active region, so the keys act on what looks focused.
  const onFocusStop = (i: number) => () => {
    setCursor(i);
    if (!active) ui.setRegion("rail");
  };
  const stop = (e: Entry, extra = "") => {
    const i = idx(e.key);
    const current = !e.key.startsWith("h-") && ui.view === e.view;
    return {
      "data-rail": i,
      // Tab into an idle rail lands on where you are, not on whatever the cursor last touched.
      tabIndex: (active ? cursor : here) === i ? 0 : -1,
      "aria-current": current ? ("page" as const) : undefined,
      "aria-label": e.label,
      "aria-keyshortcuts": keyAria(e.start ? "shift+r" : e.key === "h-oldest" ? "k" : e.view === "settings" ? "mod+shift+," : (keyOf(e.view) ?? "")) || undefined,
      className: `${extra} ${current ? "is-current" : ""} ${active && cursor === i ? "is-cursor" : ""}`,
      onFocus: onFocusStop(i),
      onClick: () => open(e),
    };
  };

  return (
    <nav ref={navRef} className={`rail ${active ? "is-active" : ""}`} aria-label="Lists and status">
      <Pond />
      {/* A polite live region, so a new capture is announced; clarifying it away is not (rail critique: every
          decrement was spoken while clarifying). */}
      <span className="visually-hidden" aria-live="polite">
        {inboxNews}
      </span>

      {LISTS.map((group, gi) => (
        <ul key={gi} className="rail-list">
          {group.map((id) => {
            const m = listMeta(id);
            return (
              <li key={id}>
                <button type="button" {...stop(entries[idx(id)], "rail-item")}>
                  <span className="rail-name">{VIEW_TITLES[id]}</span>
                  <span className="rail-meta">
                    {m && <span className={`num ${m.tone === "due" ? "is-due" : m.tone === "quiet" ? "is-quiet" : ""}`}>{m.text}</span>}
                    <RailKey k={keyOf(id)} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ))}

      {/* The system check: is my system current? Each line goes where it is fixed. */}
      {/* No visible heading (owner's decision): the divider sets it apart; screen readers still hear the group. */}
      <section className="rail-health" aria-label="System check">
        <ul className="rail-list">
          {health.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                {...stop(e, "rail-item rail-check")}
                // Check rows do something (list rows only go somewhere): the tooltip says what, and its key.
                title={e.key === "h-review" ? `Start the Weekly Review (${keyLabel("shift+r")})` : `Clarify the Inbox, oldest first (${keyLabel("k")})`}
              >
                {e.key === "h-review" && (
                  <>
                    <Gauge due={reviewDue} />
                    <span className="rail-name">Weekly Review</span>
                    <span className="rail-meta">
                      <span className={`num ${reviewDue ? "is-due" : ""}`}>{reviewAge === null ? (reviewDue ? "due" : "not yet") : reviewAge === 0 ? "today" : `${reviewAge}d ago`}</span>
                      <RailKey k="shift+r" />
                    </span>
                  </>
                )}
                {e.key === "h-oldest" && (
                  <>
                    <Gauge due={sig.oldestDays !== null && sig.oldestDays >= 7} />
                    <span className="rail-name">Oldest in Inbox</span>
                    <span className="rail-meta">
                      <span className={`num ${sig.oldestDays !== null && sig.oldestDays >= 7 ? "is-due" : ""}`}>{sig.oldestDays === 0 ? "today" : `${sig.oldestDays}d`}</span>
                      <RailKey k="k" />
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ul className="rail-list rail-settings">
        {/* Out of the way at the foot, beside Settings: places to look back at, not lists to work. */}
        <li>
          <button type="button" {...stop(entries[idx("done")], "rail-item")}>
            <span className="rail-name">{VIEW_TITLES.done}</span>
            <span className="rail-meta">
              {listMeta("done") && <span className="num is-quiet">{listMeta("done")!.text}</span>}
              <RailKey k={keyOf("done")} />
            </span>
          </button>
        </li>
        <li>
          <button type="button" {...stop(entries[entries.length - 2], "rail-item")}>
            <span className="rail-name">Trash</span>
            <span className="rail-meta">
              <RailKey k={keyOf("trash")} />
            </span>
          </button>
        </li>
        <li>
          <button type="button" {...stop(entries[entries.length - 1], "rail-item")}>
            <span className="rail-name">Settings</span>
            <span className="rail-meta">
              <RailKey k="mod+shift+," />
            </span>
          </button>
        </li>
        {/* Signing out is an act, not a place: the last, quietest row, shown only where there is a login. It is not a
            rail stop (Enter while moving through the rail never signs out by accident); ⌘K › Sign out is the key route. */}
        {authRequired && (
          <li>
            <button type="button" className="rail-item rail-signout" tabIndex={-1} onClick={() => void signOut()}>
              <span className="rail-name">Sign out</span>
              <LogOut size={13} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

const keyOf = (v: ViewId) => RAIL.find((r) => r.id === v)?.key;

/**
 * The system check's rows are gauges, not places (rail critique: they looked like two more lists). Each leads with a
 * small light: a quiet filled dot while all is well, an alert-red ring with a dot in it when due, so it reads by shape
 * as well as colour. Visual only: the row's name says "due".
 */
function Gauge({ due }: { due: boolean }) {
  return (
    <svg className={`rail-gauge ${due ? "is-due" : ""}`} viewBox="0 0 10 10" aria-hidden="true">
      {due ? (
        <>
          <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="5" cy="5" r="1.75" />
        </>
      ) : (
        <circle cx="5" cy="5" r="3.5" />
      )}
    </svg>
  );
}

/**
 * The rail's key caps rest hidden and come up while a modifier is held, as the shortcuts in macOS menus do (owner's
 * decision: twelve standing caps crowded the counts). A short hold, so a quick ⌘K doesn't flash them.
 */
function useHeldModifier() {
  useEffect(() => {
    let timer = 0;
    const isMod = (k: string) => k === "Control" || k === "Meta";
    const clear = () => {
      window.clearTimeout(timer);
      timer = 0;
      document.body.classList.remove("keys-held");
    };
    const down = (e: KeyboardEvent) => {
      if (!isMod(e.key)) return clear();
      if (!timer) timer = window.setTimeout(() => document.body.classList.add("keys-held"), 220);
    };
    const up = (e: KeyboardEvent) => isMod(e.key) && clear();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
    };
  }, []);
}

/** Every rail stop has its shortcut as a key cap in one right-hand column, shown on demand (visual only; the key is in its accessible name). */
function RailKey({ k }: { k?: string }) {
  return k ? (
    <kbd className="kbd rail-key" aria-hidden="true">
      {keyLabel(k)}
    </kbd>
  ) : null;
}

/**
 * The phone (owner's request: content first, there is so little room): no bar across the foot and no standing capture
 * field. Two round buttons float where a thumb rests. Bottom left, the menu: the rail as a sheet, with the pond, search,
 * every list and its signal (the Inbox's count rides on the button), Done and the Trash. Bottom right, +: on a list,
 * what N does there, named in the sheet's field (owner's request), with the Inbox a tab beside it; elsewhere, capture
 * into the Inbox. The Weekly
 * Review, Settings and the system check stay on the desktop (the phone is slimmer).
 */
const PHONE_GROUPS: ViewId[][] = [
  ["inbox", "calendar", "next", "waiting", "agendas", "projects"],
  ["someday", "reference", "checklists"],
  ["done", "trash"],
];

/** The keyboard's height over the page, so a sheet with a field in it sits on the keyboard rather than under it. */
function useKeyboardInset(on: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv) return setInset(0);
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, [on]);
  return inset;
}

export function PhoneChrome() {
  const ui = useUI();
  useSyncExternalStore(subscribeLayers, layersVersion);
  const { sig, listMeta } = useRailSignals();
  const { authRequired } = useMeta();
  const [sheet, setSheet] = useState<"menu" | "capture" | null>(null);
  // The list's own add, read as the capture sheet opens (what N does on the list beneath it), not on the Inbox, where
  // N is capture itself.
  const [listAdd, setListAdd] = useState<Command | null>(null);
  const [draft, setDraft] = useState(false);
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardInset(sheet === "capture");
  // What + adds on this list, and where the sheet's field sends it: the list's own, or the Inbox (a tab away).
  const inChecklist = useOpenChecklist();
  const inRefList = useOpenRefList();
  const [adder, setAdder] = useState<PhoneAdder | null>(null);
  const [dest, setDest] = useState<"list" | "inbox">("inbox");
  const [listText, setListText] = useState("");
  const listRef = useRef<HTMLTextAreaElement>(null);

  const close = (back = true) => {
    const was = sheet;
    setSheet(null);
    if (back) (was === "menu" ? menuBtn : addBtn).current?.focus({ preventScroll: true });
  };
  useCommands("phonesheet", [{ id: "phone.close", label: sheet === "menu" ? "Close the menu" : "Close capture", group: "Move", keys: ["escape"], inInput: true, run: () => close() }], {
    priority: 60,
    active: sheet !== null,
  });
  // The menu takes focus as it opens, on where you are, so a screen reader starts there.
  useEffect(() => {
    if (sheet === "menu") menuRef.current?.querySelector<HTMLElement>('[aria-current="page"], button')?.focus({ preventScroll: true });
  }, [sheet]);

  const openMenu = () => setSheet("menu");
  const openCapture = () => {
    const a = phoneAdder(ui.view, inChecklist, inRefList);
    setAdder(a);
    setDest(a ? "list" : "inbox");
    setListAdd(a ? null : (activeCommands().find((c) => c.keys?.includes("n") && c.enabled !== false && !c.row && c.id !== "inbox.new") ?? null));
    // Rendered first, then focused within the tap itself: a phone raises its keyboard only for a focus the tap made.
    flushSync(() => setSheet("capture"));
    (a ? listRef : captureRef).current?.focus();
  };
  /** A tab of the sheet: the list's own, or the Inbox. The field it shows takes the focus, keeping the keyboard up. */
  const toDest = (d: "list" | "inbox") => {
    flushSync(() => setDest(d));
    (d === "list" ? listRef : captureRef).current?.focus();
  };
  const addToList = () => {
    const text = listText.trim();
    if (!text || !adder) return;
    setListText("");
    close(false);
    adder.run(ui, text);
  };
  const go = (v: ViewId) => {
    close(false);
    ui.go(v);
    ui.setRegion("list");
  };

  // The buttons step aside while a details sheet, a picker or the viewer has the screen.
  const covered = ui.detail || ui.pickerOpen || ui.viewer;
  const inboxLabel = sig.inbox ? `, ${sig.inbox} in the Inbox` : "";
  // Something asks for attention elsewhere (late, to chase, stalled): a small red dot, when the Inbox has no count.
  const asks = sig.late + sig.chase + sig.stalled > 0;

  return (
    <>
      {!covered && sheet === null && (
        <>
          <button ref={menuBtn} type="button" className="phone-fab phone-menu-btn" aria-label={`Menu${inboxLabel}`} aria-haspopup="dialog" aria-expanded={false} onClick={openMenu}>
            <Menu size={20} strokeWidth={2} aria-hidden="true" />
            {sig.inbox > 0 ? (
              <span className="phone-badge num" aria-hidden="true">
                {sig.inbox > 99 ? "99+" : sig.inbox}
              </span>
            ) : (
              asks && <span className="phone-dot" aria-hidden="true" />
            )}
          </button>
          <button ref={addBtn} type="button" className={`phone-fab phone-add ${draft ? "has-draft" : ""}`} aria-label={draft ? "Capture (a draft is waiting)" : "Capture"} aria-haspopup="dialog" onClick={openCapture}>
            <Plus size={22} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </>
      )}
      {sheet !== null && <div className="phone-scrim" onClick={() => close()} aria-hidden="true" />}

      {sheet === "menu" && (
        <div ref={menuRef} className="phone-sheet phone-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="phone-menu-head">
            <Pond />
            <button type="button" className="phone-close" aria-label="Close the menu" onClick={() => close()}>
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="phone-search"
            onClick={() => {
              close(false);
              ui.openSearch();
            }}
          >
            <Search size={16} strokeWidth={2} aria-hidden="true" />
            Search everything
          </button>
          <nav aria-label="Lists">
            {PHONE_GROUPS.map((group, gi) => (
              <ul key={gi} className="phone-menu-list">
                {group.map((v) => {
                  const m = listMeta(v);
                  const here = ui.view === v;
                  return (
                    <li key={v}>
                      <button type="button" className={here ? "is-current" : ""} aria-current={here ? "page" : undefined} onClick={() => go(v)}>
                        <span className="phone-menu-name">{VIEW_TITLES[v]}</span>
                        {m && <span className={`num phone-menu-meta ${m.tone === "due" ? "is-due" : m.tone === "quiet" ? "is-quiet" : ""}`}>{m.text}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ))}
            {authRequired && (
              <ul className="phone-menu-list">
                <li>
                  <button type="button" className="phone-signout" onClick={() => void signOut()}>
                    <span className="phone-menu-name">Sign out</span>
                    <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              </ul>
            )}
          </nav>
        </div>
      )}

      {/* Kept while closed (hidden), so a draft stays where it was typed until it is sent. */}
      <div className="phone-sheet phone-capture" role="dialog" aria-modal="true" aria-label="Capture to the Inbox" hidden={sheet !== "capture"} style={{ bottom: keyboard }}>
        <div className="phone-capture-head">
          {adder ? (
            // Where the field sends what is written: the list's own (the default on a list), or the Inbox. Tabs, as
            // every switch between the parts of a page is drawn.
            <div className="cal-modes phone-dest" role="tablist" aria-label="Add to">
              {(["list", "inbox"] as const).map((d) => (
                <button key={d} type="button" role="tab" aria-selected={dest === d} className={dest === d ? "is-current" : ""} onPointerDown={(e) => e.preventDefault()} onClick={() => toDest(d)}>
                  {d === "list" ? adder.tab : "Inbox"}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="phone-capture-title">Capture to the Inbox</h2>
          )}
          <button
            type="button"
            className="phone-close"
            aria-label="Close capture"
            onClick={() => {
              if (draft) notify("Draft kept. It isn't in the Inbox until you send it.");
              close();
            }}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div hidden={Boolean(adder) && dest !== "inbox"}>
          <CaptureBar ref={captureRef} sheet onDraft={setDraft} onDone={() => close()} />
        </div>
        {adder && (
          <div className="capture" hidden={dest !== "list"}>
            <textarea
              ref={listRef}
              className="capture-input"
              rows={Math.min(6, listText.split("\n").length)}
              value={listText}
              aria-label={`Add to ${adder.tab}`}
              onChange={(e) => setListText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addToList();
                }
              }}
            />
            <button type="button" className="capture-send" aria-label={`Add to ${adder.tab}`} disabled={!listText.trim()} onPointerDown={(e) => e.preventDefault()} onClick={addToList}>
              <ArrowUp size={18} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        )}
        {listAdd && (
          <button
            type="button"
            className="phone-list-add"
            onClick={() => {
              close(false);
              listAdd.run();
            }}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            {listAdd.label}
          </button>
        )}
      </div>
    </>
  );
}

export const CaptureBar = forwardRef<HTMLTextAreaElement, { onDone: () => void; sheet?: boolean; onDraft?: (has: boolean) => void }>(function CaptureBar({ onDone, sheet, onDraft }, ref) {
  const [text, setText] = useState("");
  const hasDraft = Boolean(text.trim());
  useEffect(() => onDraft?.(hasDraft), [hasDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filed, setFiled] = useState<{ id: number; text: string }[]>([]);
  const [focused, setFocused] = useState(false);
  const seq = useRef(0);

  useCommands(
    "capture",
    [
      {
        id: "capture.close",
        label: "Close capture",
        group: "Capture",
        keys: ["escape"],
        inInput: true,
        run: () => {
          (document.activeElement as HTMLElement | null)?.blur?.();
          // An unsent draft stays in the bar; say so, rather than leave it silently behind.
          if (text.trim()) notify(sheet ? "Draft kept. It isn't in the Inbox until you send it." : "Draft kept in the capture bar. It isn't in the Inbox until you send it.");
          onDone();
        },
      },
    ],
    { priority: 50, active: focused },
  );

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    void capture(v);
    setFiled((f) => [{ id: ++seq.current, text: v.split("\n")[0] }, ...f].slice(0, 5));
    setText("");
  };

  return (
    <div className={`capture ${focused ? "is-open" : ""}`}>
      <textarea
        ref={ref}
        className="capture-input"
        rows={Math.min(6, text.split("\n").length)}
        value={text}
        placeholder="Capture"
        aria-label="Capture to the Inbox"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // In the phone's sheet the Send button takes the tap, not the focus: what was filed stays listed.
          if (!sheet) setFiled([]);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {sheet && (
        <button
          type="button"
          className="capture-send"
          aria-label="Send to the Inbox"
          disabled={!hasDraft}
          // The field keeps its focus (and the phone its keyboard) for the next thing to capture.
          onPointerDown={(e) => e.preventDefault()}
          onClick={submit}
        >
          <ArrowUp size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}
      {(focused || sheet) && filed.length > 0 && (
        <ul className="capture-filed" aria-live="polite">
          {filed.map((f) => (
            <li key={f.id}>
              <Check size={12} strokeWidth={2.5} aria-hidden /> {f.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export const SearchBox = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; onLeave: () => void; onEnterResults: () => void }>(function SearchBox(
  { value, onChange, onLeave, onEnterResults },
  ref,
) {
  const [focused, setFocused] = useState(false);
  useCommands(
    "searchbox",
    [
      { id: "search.leave", label: "Close search", group: "Search", keys: ["escape"], inInput: true, run: onLeave },
      { id: "search.results", label: "Go to results", group: "Search", keys: ["arrowdown", "enter"], inInput: true, run: onEnterResults },
    ],
    { priority: 50, active: focused },
  );
  return (
    <label className={`search ${focused ? "is-open" : ""}`}>
      <Search size={14} strokeWidth={2} aria-hidden />
      <input
        ref={ref}
        value={value}
        placeholder="Search"
        aria-label="Search everything"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
});

/** Action feedback ("3 actions moved · ⌘Z undo", errors) as a small toast that appears only when something happens. */
export function Toast() {
  const n = useNotice();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!n) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), n.tone === "error" ? 12000 : 5000);
    return () => window.clearTimeout(t);
  }, [n]);
  return (
    <div className={`toast ${visible && n ? "is-on" : ""} ${n?.tone === "error" ? "is-error" : ""}`} role="status" aria-live="polite">
      {n && (
        <>
          <span className="toast-text">{n.text}</span>
          {n.undo && (
            <span className="toast-undo">
              <Kbd k="mod+z" /> undo
            </span>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Command palette and shortcut overlay                                 */
/* ------------------------------------------------------------------ */

const RECENT_KEY = "palette:recent";
function recentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function rememberCommand(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 5)));
  } catch {
    /* private window: no recents */
  }
}

// The app-wide keys, regrouped by what they are for (their palette groups are finer than a cheat sheet needs).
const EVERYWHERE: { title: string; groups: string[]; order?: string[] }[] = [
  { title: "Add", groups: ["Capture", "Projects", "Actions"], order: ["g.capture", "g.paste", "g.upload", "g.newaction", "g.newwaiting", "g.newproject"] },
  { title: "Go to", groups: ["Go to", "Clarify", "Review"] },
  { title: "Panes", groups: ["Move", "View"] },
  { title: "Help and undo", groups: ["Help", "Edit"] },
];
// A screen's own list movement is the same on every list: it goes after what the screen itself does.
const LAST = ["Move", "Select"];

/** Where the palette says it is: the topmost region that has keys of its own ("Details pane", "Weekly Review · Projects"). */
export function paletteScope(entries: LayeredCommand[], viewTitle: string): string {
  const top = entries.find((e) => e.layer !== "global" && e.layer !== "capture" && e.layer !== "searchbox");
  if (!top) return viewTitle;
  if (top.title) return top.title;
  if (top.layer.startsWith("detail")) return "Details pane";
  if (top.layer === "rail") return "Rail";
  if (top.layer === "clarify") return "Clarify";
  return viewTitle;
}

type Row = { c: Command; layer: string; head?: string; quiet?: boolean; named?: boolean; key: string };

/**
 * The command palette, ⌘K. It follows focus (owner's decision after the keys critique, which folded the ⇧? cheat sheet
 * into it): what you used lately first, then what you can do to the row (or item, or details pane) under the cursor,
 * under its name, then the rest of the place you are in by group, moving around last; the app-wide commands follow,
 * quieter, under Everywhere. Every command shows every key it answers to. Typing searches every command, nearest first.
 */
export function Palette({ entries, where, rowName, close }: { entries: LayeredCommand[]; where: string; rowName: string; close: () => void }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useCommands("palette", [{ id: "palette.close", label: "Close", group: "Palette", keys: ["escape"], inInput: true, run: close }], { priority: 300, exclusive: true });

  const rows: Row[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const recent = recentIds();
    // The details pane is about one item: all its commands act on it.
    const onRow = (e: LayeredCommand) => e.layer !== "global" && (e.command.row || e.layer.startsWith("detail"));
    // Nearest first: the row's commands, the place's own, app-wide ones, then moving around.
    const rank = (e: LayeredCommand) => (onRow(e) ? 0 : LAST.includes(e.command.group) ? 3 : e.layer === "global" ? 2 : 1);
    if (needle) {
      return entries
        .filter(({ command: c }) => needle.split(/\s+/).every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w)))
        .sort(
          (a, b) =>
            Number(!a.command.label.toLowerCase().startsWith(needle)) - Number(!b.command.label.toLowerCase().startsWith(needle)) ||
            (recent.indexOf(a.command.id) + 1 || 99) - (recent.indexOf(b.command.id) + 1 || 99) ||
            rank(a) - rank(b),
        )
        .map((e) => ({ c: e.command, layer: e.layer, key: e.command.id }));
    }
    // A key does one thing at a time: list only the command it would run now (the first claimant).
    const claimed = new Set<string>();
    const live = entries.filter(({ command: c }) => {
      const keys = c.keys?.length ? c.keys : (c.displayKeys ?? []);
      if (keys.length && keys.every((k) => claimed.has(k))) return false;
      keys.forEach((k) => claimed.add(k));
      return true;
    });
    const out: Row[] = [];
    const add = (list: LayeredCommand[], head: string, quiet = false, prefix = "", named = false) =>
      list.forEach((e, i) => out.push({ c: e.command, layer: e.layer, head: i === 0 ? head : undefined, quiet, named, key: `${prefix}${e.command.id}` }));
    // Recent: the last five used that can run here; they stay in their own places below as well.
    add(
      recent.map((id) => live.find((e) => e.command.id === id)).filter((e): e is LayeredCommand => Boolean(e)),
      "Recent",
      false,
      "recent:",
    );
    // The row under the cursor (or the item in the details pane), under its name: one group, what you do to it
    // first, its fields after (a second heading split a three-command appointment in two).
    const row = live.filter(onRow);
    add([...row.filter((e) => e.command.group !== "Fields"), ...row.filter((e) => e.command.group === "Fields")], rowName || "The row under the cursor", false, "", true);
    // The rest of this place, by group, moving around last.
    const page = new Map<string, LayeredCommand[]>();
    for (const e of live) if (e.layer !== "global" && !onRow(e)) page.set(e.command.group, [...(page.get(e.command.group) ?? []), e]);
    for (const [g, list] of [...page.entries()].sort(([a], [b]) => LAST.indexOf(a) - LAST.indexOf(b))) add(list, g === where ? where : `${where} · ${g}`);
    // Everywhere, quieter.
    const global = live.filter((e) => e.layer === "global");
    const used = new Set<string>();
    for (const { title, groups, order } of EVERYWHERE) {
      const list = global.filter((e) => groups.includes(e.command.group));
      if (order) list.sort((x, y) => (order.indexOf(x.command.id) + 1 || 99) - (order.indexOf(y.command.id) + 1 || 99));
      list.forEach((e) => used.add(e.command.id));
      add(list, `Everywhere · ${title}`, true);
    }
    add(
      global.filter((e) => !used.has(e.command.id)),
      "Everywhere · More",
      true,
    );
    return out;
  }, [q, entries, where, rowName]);
  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    document.getElementById(`pal-${hi}`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  const run = (c?: Command) => {
    if (!c) return;
    rememberCommand(c.id);
    close();
    window.setTimeout(() => c.run(), 0);
  };
  // Every key a command answers to, once each as it reads (Backspace and Delete are both "Del").
  const keysOf = (c: Command) => {
    const seen = new Set<string>();
    return [...(c.keys ?? []), ...(c.displayKeys ?? [])].filter((k) => !seen.has(keyLabel(k)) && Boolean(seen.add(keyLabel(k))));
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={`Commands: ${where}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-scope">
          <span className="palette-scope-name">{where}</span>
          <span className="muted-text">Type to find any command</span>
        </div>
        <input
          ref={input}
          className="palette-input"
          value={q}
          role="combobox"
          aria-label="Command"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="palette-list"
          aria-activedescendant={`pal-${hi}`}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(rows.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(rows[hi]?.c);
            } else if (e.key === "Tab") {
              // The palette is a modal: Tab stays on its line.
              e.preventDefault();
            }
          }}
        />
        <ul className="palette-list" id="palette-list" role="listbox" aria-label={`Commands: ${where}`}>
          {rows.map((r, i) => [
            r.head && (
              <li key={`h-${i}`} className={`pal-section ${r.quiet ? "is-quiet" : ""} ${r.named ? "is-named" : ""}`} role="presentation">
                {r.head}
              </li>
            ),
            <li
              key={r.key}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === hi}
              className={`${i === hi ? "is-hi" : ""} ${r.quiet && !q.trim() ? "is-quiet" : ""}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                run(r.c);
              }}
            >
              <span className="pal-label">{r.c.label}</span>
              {q.trim() && <span className="pal-group">{r.c.group}</span>}
              <span className="pal-keys">
                {keysOf(r.c).map((k) => (
                  <Kbd key={k} k={k} />
                ))}
              </span>
            </li>,
          ])}
          {rows.length === 0 && <li className="is-hint">No command matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
