import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, Check, LogOut } from "lucide-react";
import { capture, daysSinceReview, notify, signOut, useMeta, useNotice, useTables, isStalled, isChase } from "../store.ts";
import { useUI, VIEW_TITLES, type ViewId } from "../ui.tsx";
import { allCommandsForPalette, activeCommandsByLayer, layerOf, useCommands, keyLabel, keyAria, IS_MAC, type Command } from "../keys.ts";
import { Kbd, Tag } from "./bits.tsx";
import { Pond } from "./Pond.tsx";
import { daysBetween, today } from "../../shared/dates.ts";

/**
 * The go-to keys follow the rail from the top, counted per group so every key sits under one hand (owner's request:
 * ⌃7–9 needed a second hand). The first group is Control+1–6 (Inbox, Calendar, Next Actions, Waiting For, Agendas,
 * Projects); the second group and the Trash below it are Control+Shift+1–5 (Someday, Reference, Checklists, Done,
 * Trash): Shift
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
  // GTD keeps checklists with the other support material, beside Reference.
  { id: "checklists", key: go2(3) },
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
  ["someday", "reference", "checklists", "done"],
];

type Entry = { key: string; view: ViewId; label: string; name: string; start?: boolean };

export function Rail({ active }: { active: boolean }) {
  useHeldModifier();
  const ui = useUI();
  const s = useTables("stuff", "actions", "projects", "reviews");
  const { stallWeeks, authRequired } = useMeta(); // recount stalled projects when the threshold changes
  const [cursor, setCursor] = useState(0);
  const t = today();

  // Signals, not inventory: a number shows only where it asks for something.
  const sig = useMemo(() => {
    const inboxItems = s.stuff.filter((x) => x.status === "inbox");
    const nextActs = s.actions.filter((a) => a.status === "next");
    const overdue = nextActs.filter((a) => a.due && a.due < t).length;
    const flagged = nextActs.filter((a) => a.flagged).length;
    const chase = s.actions.filter((a) => isChase(a, t)).length;
    const stalled = s.projects.filter((p) => isStalled(s, p)).length;
    const doneToday = s.actions.filter((a) => a.status === "done" && a.completed_at && a.completed_at.slice(0, 10) === t).length;
    const oldest = inboxItems.reduce<string | null>((m, x) => (m === null || x.created_at < m ? x.created_at : m), null);
    const oldestDays = oldest ? daysBetween(oldest.slice(0, 10), t) : null;
    // The oldest thing in the whole system: a review is only "due" once there is a week's worth to review.
    const firstDay = [...s.actions, ...s.projects, ...s.stuff].reduce<string | null>((m, x) => (m === null || x.created_at < m ? x.created_at : m), null);
    const systemAge = firstDay ? daysBetween(firstDay.slice(0, 10), t) : 0;
    const scheduled =
      s.actions.filter((a) => ["next", "waiting"].includes(a.status) && (a.due === t || a.defer === t)).length +
      s.projects.filter((p) => p.status === "active" && (p.due === t || p.start === t)).length;
    return { inbox: inboxItems.length, overdue, flagged, chase, stalled, doneToday, oldestDays, systemAge, scheduled };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, t, stallWeeks]);
  const reviewAge = daysSinceReview(s);
  const reviewDue = reviewAge === null ? sig.systemAge >= 7 : reviewAge >= 7;

  const listMeta = (id: ViewId): { text: string; tone?: "due" | "quiet" } | null => {
    if (id === "inbox") return sig.inbox ? { text: String(sig.inbox) } : null;
    if (id === "next") return sig.overdue ? { text: `${sig.overdue} overdue`, tone: "due" } : sig.flagged ? { text: `${sig.flagged} important` } : null;
    if (id === "waiting") return sig.chase ? { text: `${sig.chase} to chase`, tone: "due" } : null;
    if (id === "projects") return sig.stalled ? { text: `${sig.stalled} stalled`, tone: "due" } : null;
    if (id === "done") return sig.doneToday ? { text: `${sig.doneToday} today`, tone: "quiet" } : null;
    // What today's landscape holds: things due or starting today.
    if (id === "calendar") return sig.scheduled ? { text: `${sig.scheduled} today`, tone: "quiet" } : null;
    return null;
  };

  // Every stop the cursor can reach, in screen order.
  const health: Entry[] = [
    {
      key: "h-review",
      view: "review",
      name: "Weekly Review",
      start: true,
      label: `Weekly Review, ${reviewAge === null ? "not done yet" : reviewAge === 0 ? "done today" : `last done ${reviewAge} days ago`}${reviewDue ? ", due" : ""}`,
    },
    ...(sig.oldestDays !== null ? [{ key: "h-oldest", view: "inbox" as ViewId, name: "Oldest in Inbox", label: `Oldest in the Inbox: ${sig.oldestDays === 0 ? "today" : `${sig.oldestDays} days`}${sig.oldestDays >= 7 ? ", due" : ""}. Clarify` }] : []),
  ];
  const entries: Entry[] = [
    ...LISTS.flat().map((id) => {
      const m = listMeta(id);
      return { key: id, view: id, name: VIEW_TITLES[id], label: `${VIEW_TITLES[id]}${m ? `, ${id === "inbox" ? `${m.text} ${m.text === "1" ? "item" : "items"}` : m.text}` : ""}` };
    }),
    ...health,
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
      { id: "rail.down", label: "Next in the rail", group: "Move", keys: ["arrowdown"], run: () => setCursor((c) => Math.min(entries.length - 1, c + 1)) },
      { id: "rail.up", label: "Previous in the rail", group: "Move", keys: ["arrowup"], run: () => setCursor((c) => Math.max(0, c - 1)) },
      { id: "rail.first", label: "First in the rail", group: "Move", keys: ["home", "mod+arrowup"], run: () => setCursor(0) },
      { id: "rail.last", label: "Last in the rail", group: "Move", keys: ["end", "mod+arrowdown"], run: () => setCursor(entries.length - 1) },
      { id: "rail.open", label: "Open", group: "Move", keys: ["enter", "arrowright", "space"], run: () => entries[cursor] && open(entries[cursor]) },
      { id: "rail.leave", label: "Back to the list", group: "Move", keys: ["escape"], run: () => ui.setRegion("list") },
      ...letters.map((ch) => ({ id: `rail.jump.${ch}`, label: `Jump to “${ch.toUpperCase()}…”`, group: "Move", keys: [ch], hidden: true, run: () => jump(ch) })),
    ],
    { priority: 10, active },
  );

  // While the rail is the active region its cursor is real keyboard focus, so screen readers follow it.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active) navRef.current?.querySelector<HTMLElement>(`[data-rail="${cursor}"]`)?.focus({ preventScroll: true });
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
    <nav ref={navRef} className={`rail ${active ? "is-active" : ""}`} aria-label="Lists">
      <Pond />
      {/* A polite live region, so a new capture's count is announced. */}
      <span className="visually-hidden" aria-live="polite">
        {sig.inbox === 1 ? "1 item in the Inbox" : `${sig.inbox} items in the Inbox`}
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
        {/* Out of the way at the foot, beside Settings: a place to look back, not a list to work. */}
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

/** On a phone the rail becomes a bottom tab bar: the Inbox, Next, Waiting, and More for the rest. */
export function TabBar() {
  const ui = useUI();
  const s = useTables("stuff", "actions", "projects", "reviews");
  const { authRequired } = useMeta();
  const [more, setMore] = useState(false);
  const inboxItems = s.stuff.filter((x) => x.status === "inbox");
  const inbox = inboxItems.length;
  const rest: ViewId[] = ["agendas", "calendar", "projects", "someday", "reference", "checklists", "done", "trash", "settings"];
  // The phone's system check, as in the rail: is the review due, and how old is the oldest thing in the Inbox?
  const t = today();
  const reviewAge = daysSinceReview(s);
  const firstDay = [...s.actions, ...s.projects, ...s.stuff].reduce<string | null>((m, x) => (m === null || x.created_at < m ? x.created_at : m), null);
  const reviewDue = reviewAge === null ? (firstDay ? daysBetween(firstDay.slice(0, 10), t) >= 7 : false) : reviewAge >= 7;
  const oldest = inboxItems.reduce<string | null>((m, x) => (m === null || x.created_at < m ? x.created_at : m), null);
  const oldestDays = oldest ? daysBetween(oldest.slice(0, 10), t) : null;
  const checkDue = reviewDue || (oldestDays !== null && oldestDays >= 7);
  // The More sheet closes on a tap anywhere outside it (the More tab itself toggles it).
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!more) return;
    const outside = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMore(false);
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [more]);
  const go = (v: ViewId) => {
    setMore(false);
    if (v === "review") ui.startReview();
    else ui.go(v);
  };
  const tab = (v: ViewId, label: ReactNode) => (
    <button type="button" className={`tab ${ui.view === v ? "is-current" : ""}`} aria-current={ui.view === v ? "page" : undefined} onClick={() => go(v)}>
      {label}
    </button>
  );
  return (
    <nav ref={barRef} className="tabbar" aria-label="Lists">
      {more && (
        // The phone's rail: the pond and its name, the system check, then the rest of the lists.
        <div className="tabbar-more">
          <div className="more-pond" aria-hidden="true">
            <span className="pond-name">Stiltje</span>
            <span className="pond-name pond-mirror">Stiltje</span>
          </div>
          <ul className="more-check" aria-label="System check">
            <li>
              <button type="button" className={ui.view === "review" ? "is-current" : ""} onClick={() => go("review")}>
                Weekly Review
                <span className={reviewDue ? "is-due" : "more-meta"}>{reviewDue ? "due" : reviewAge === null ? "not yet" : reviewAge === 0 ? "today" : `${reviewAge}d ago`}</span>
              </button>
            </li>
            {oldestDays !== null && (
              <li>
                <button type="button" onClick={() => go("inbox")}>
                  Oldest in Inbox
                  <span className={oldestDays >= 7 ? "is-due" : "more-meta"}>{oldestDays === 0 ? "today" : `${oldestDays}d`}</span>
                </button>
              </li>
            )}
          </ul>
          <ul className="more-list">
            {rest.map((v) => (
              <li key={v}>
                <button type="button" className={ui.view === v ? "is-current" : ""} aria-current={ui.view === v ? "page" : undefined} onClick={() => go(v)}>
                  {VIEW_TITLES[v]}
                </button>
              </li>
            ))}
          </ul>
          {authRequired && (
            <ul className="more-signout">
              <li>
                <button type="button" onClick={() => void signOut()}>
                  Sign out
                  <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
      {tab(
        "inbox",
        <>
          <span className="tab-name">Inbox</span>
          {inbox > 0 && <span className="tab-count num">{inbox}</span>}
        </>,
      )}
      {tab("next", <span className="tab-name">Next</span>)}
      {tab("waiting", <span className="tab-name">Waiting</span>)}
      <button type="button" className={`tab ${more || rest.includes(ui.view) ? "is-current" : ""}`} aria-expanded={more} onClick={() => setMore(!more)}>
        <span className="tab-name">{rest.includes(ui.view) && !more ? VIEW_TITLES[ui.view] : "More"}</span>
        {/* Something in the system check wants attention: a small alert dot, named for screen readers. */}
        {/* The dot belongs to "More" (the system check is in there), not to a list whose name the tab is showing. */}
        {checkDue && !more && !rest.includes(ui.view) && <span className="tab-dot" role="img" aria-label="The Weekly Review or the Inbox needs attention" />}
      </button>
    </nav>
  );
}

export const CaptureBar = forwardRef<HTMLTextAreaElement, { onDone: () => void }>(function CaptureBar({ onDone }, ref) {
  const [text, setText] = useState("");
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
          if (text.trim()) notify("Draft kept in the capture bar. It isn't in the Inbox until you send it.");
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
        placeholder="Capture anything"
        aria-label="Capture to the Inbox"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setFiled([]);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {focused && filed.length > 0 && (
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

/** Palette order: what you used lately, then this screen's own commands, then going places, then cursor movement. */
const GENERIC_GROUPS: Record<string, number> = { Details: 2, "Go to": 2, Capture: 2, Help: 2, Edit: 2, Data: 2, Settings: 2, Move: 3, Select: 3 };
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

const PALETTE_SECTIONS = ["Recent", "This screen", "Go to and more", "Moving around"] as const;
/**
 * Which heading a command falls under while browsing the palette. "This screen" means registered by
 * the screen or pane you're on; everything app-wide goes under "Go to and more"; cursor moves go last.
 */
function paletteSection(c: Command): 0 | 1 | 2 | 3 {
  if (recentIds().includes(c.id)) return 0;
  if (GENERIC_GROUPS[c.group] === 3) return 3;
  return layerOf(c) === "global" ? 2 : 1;
}

export function Palette({ commands, close }: { commands: Command[]; close: () => void }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useCommands("palette", [{ id: "palette.close", label: "Close", group: "Palette", keys: ["escape"], inInput: true, run: close }], { priority: 300, exclusive: true });

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const recent = recentIds();
    const rank = (c: Command) => {
      const r = recent.indexOf(c.id);
      return r >= 0 ? r - 10 : paletteSection(c);
    };
    if (!needle) return [...commands].sort((a, b) => rank(a) - rank(b));
    const words = needle.split(/\s+/);
    return commands
      .filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(!a.label.toLowerCase().startsWith(needle)) - Number(!b.label.toLowerCase().startsWith(needle)) || rank(a) - rank(b));
  }, [q, commands]);
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

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="palette-input"
          value={q}
          placeholder="Type a command"
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
              setHi((h) => Math.min(list.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(list[hi]);
            }
          }}
        />
        <ul className="palette-list" id="palette-list" role="listbox">
          {list.map((c, i) => [
            // Section headings (only while browsing, not filtering): Recent · This screen · Go to and more · Moving around.
            !q.trim() && (i === 0 || paletteSection(list[i - 1]) !== paletteSection(c)) && (
              <li key={`h-${paletteSection(c)}`} className="pal-section" role="presentation">
                {PALETTE_SECTIONS[paletteSection(c)]}
              </li>
            ),
            <li
              key={c.id}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? "is-hi" : ""}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                run(c);
              }}
            >
              <span className="pal-label">{c.label}</span>
              <span className="pal-group">{c.group}</span>
              <span className="pal-keys">{(c.keys?.[0] ?? c.displayKeys?.[0]) && <Kbd k={(c.keys?.[0] ?? c.displayKeys?.[0])!} />}</span>
            </li>,
          ])}
          {list.length === 0 && <li className="is-hint">No command matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
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

export function HelpOverlay({ close }: { close: () => void }) {
  const ui = useUI();
  const [snapshot] = useState(() => activeCommandsByLayer().filter(({ command: c }) => (c.keys?.length || c.displayKeys?.length) && !c.hidden));
  // Take focus so a screen reader reads the dialog, and hand it back on close.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus?.({ preventScroll: true });
  }, []);
  useCommands("help", [{ id: "help.close", label: "Close", group: "Help", keys: ["escape", "?"], inInput: true, run: close }], { priority: 300, exclusive: true });
  const { here, everywhere, where } = useMemo(() => {
    // A key does one thing at a time: list only the command it would run now (the first claimant).
    const claimed = new Set<string>();
    const page = new Map<string, Command[]>();
    const global: Command[] = [];
    for (const { layer, command: c } of snapshot) {
      const keys = c.keys?.length ? c.keys : (c.displayKeys ?? []);
      if (keys.length && keys.every((k) => claimed.has(k))) continue;
      keys.forEach((k) => claimed.add(k));
      if (layer === "global") global.push(c);
      else page.set(c.group, [...(page.get(c.group) ?? []), c]);
    }
    const rank = (g: string) => LAST.indexOf(g);
    const here = [...page.entries()].sort(([a], [b]) => rank(a) - rank(b));
    const used = new Set<string>();
    const everywhere = EVERYWHERE.map(({ title, groups, order }) => {
      const cmds = global.filter((c) => groups.includes(c.group));
      cmds.forEach((c) => used.add(c.id));
      if (order) cmds.sort((x, y) => (order.indexOf(x.id) + 1 || 99) - (order.indexOf(y.id) + 1 || 99));
      return [title, cmds] as [string, Command[]];
    });
    const rest = global.filter((c) => !used.has(c.id));
    if (rest.length) everywhere.push(["More", rest]);
    const inClarify = snapshot.some((x) => x.layer === "clarify");
    return { here, everywhere: everywhere.filter(([, c]) => c.length), where: inClarify ? "Clarify" : (VIEW_TITLES[ui.view] ?? "This screen") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);
  // Under "Go to" the heading already says it: "Inbox", not "Go to Inbox"; "Weekly Review", not "Start the Weekly Review".
  const label = (c: Command, section: string) => (section === "Go to" ? c.label.replace(/^(Go to|Start the) /, "").replace(/ \(.*\)$/, "") : c.label);
  const list = (groups: [string, Command[]][]) =>
    groups.map(([g, cmds]) => (
      <section key={g} className="help-group" aria-label={g}>
        <h4>{g}</h4>
        <dl>
          {cmds.map((c) => (
            <div key={c.id}>
              <dt>
                {[...new Set([...(c.keys ?? []), ...(c.displayKeys ?? [])].map(keyLabel))].slice(0, 2).map((l) => (
                  <kbd key={l} className="kbd">
                    {l}
                  </kbd>
                ))}
              </dt>
              <dd>{label(c, g)}</dd>
            </div>
          ))}
        </dl>
      </section>
    ));
  return (
    <div className="overlay" onMouseDown={close}>
      <div ref={box} className="help" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <h2 className="help-title" id="help-title">
            <Tag size="md">Keys</Tag>
          </h2>
          <span className="muted-text small">
            <Kbd k="mod+k" /> finds every command
          </span>
        </div>
        <div className="help-body">
          {here.length > 0 && (
            <section className="help-scope" aria-labelledby="help-here">
              <h3 id="help-here">
                On {where}
              </h3>
              <div className="help-cols">{list(here)}</div>
            </section>
          )}
          <section className="help-scope" aria-labelledby="help-everywhere">
            <h3 id="help-everywhere">Everywhere</h3>
            <div className="help-cols">{list(everywhere)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}

export { allCommandsForPalette };
