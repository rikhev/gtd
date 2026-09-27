import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, Check } from "lucide-react";
import { capture, daysSinceReview, notify, useMeta, useNotice, useStore, isStalled, isChase } from "../store.ts";
import { useUI, VIEW_TITLES, type ViewId } from "../ui.tsx";
import { allCommandsForPalette, activeCommands, layerOf, useCommands, keyLabel, keyAria, IS_MAC, type Command } from "../keys.ts";
import { Kbd, Tag } from "./bits.tsx";
import { Pond } from "./Pond.tsx";
import { daysBetween, today } from "../../shared/dates.ts";

/**
 * Control+1–7 on every system follow the rail from the top: the Inbox, then the lists in rail order.
 * On the Mac that is ⌃, not ⌘: ⌘⇧3–5 are macOS screenshots and ⌘1–8 are the browser's tabs.
 * Elsewhere the page takes Ctrl+1–7 over the browser's tab switching (Chrome and Firefox allow it).
 * The Weekly Review has no number (W starts it); Settings is ⌘⇧, (Ctrl+Shift+, elsewhere).
 */
// Control on every system: on the Mac that is "ctrl" (⌘ is "mod"), elsewhere Ctrl is "mod".
const go = (n: number) => (IS_MAC ? `ctrl+${n}` : `mod+${n}`);

export const RAIL: { id: ViewId; key?: string }[] = [
  { id: "inbox", key: go(1) },
  { id: "next", key: go(2) },
  { id: "waiting", key: go(3) },
  { id: "projects", key: go(4) },
  { id: "someday", key: go(5) },
  { id: "reference", key: go(6) },
  { id: "done", key: go(7) },
  { id: "review" },
];

/**
 * The rail: the Inbox, the lists in the order they're used, and a system check that answers
 * GTD's weekly question ("is my system current?") with links to where each answer is fixed.
 */
const LISTS: ViewId[][] = [
  ["inbox", "next", "waiting", "projects"],
  ["someday", "reference", "done"],
];

type Entry = { key: string; view: ViewId; label: string; name: string; start?: boolean };

export function Rail({ active }: { active: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const { stallWeeks } = useMeta(); // recount stalled projects when the threshold changes
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
    return { inbox: inboxItems.length, overdue, flagged, chase, stalled, doneToday, oldestDays, systemAge };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, t, stallWeeks]);
  const reviewAge = daysSinceReview(s);
  const reviewDue = reviewAge === null ? sig.systemAge >= 7 : reviewAge >= 7;

  const listMeta = (id: ViewId): { text: string; tone?: "due" | "quiet" } | null => {
    if (id === "inbox") return sig.inbox ? { text: String(sig.inbox) } : null;
    if (id === "next") return sig.overdue ? { text: `${sig.overdue} overdue`, tone: "due" } : sig.flagged ? { text: `${sig.flagged} today` } : null;
    if (id === "waiting") return sig.chase ? { text: `${sig.chase} to chase`, tone: "due" } : null;
    if (id === "done") return sig.doneToday ? { text: `${sig.doneToday} today`, tone: "quiet" } : null;
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
    ...(sig.stalled ? [{ key: "h-stalled", view: "projects" as ViewId, name: "Stalled projects", label: `${sig.stalled} stalled ${sig.stalled === 1 ? "project" : "projects"}` }] : []),
    ...(sig.chase ? [{ key: "h-chase", view: "waiting" as ViewId, name: "Follow-ups", label: `${sig.chase} ${sig.chase === 1 ? "follow-up" : "follow-ups"} due` }] : []),
    ...(sig.oldestDays !== null ? [{ key: "h-oldest", view: "inbox" as ViewId, name: "Oldest in Inbox", label: `Oldest in the Inbox: ${sig.oldestDays === 0 ? "today" : `${sig.oldestDays} days`}` }] : []),
  ];
  const entries: Entry[] = [
    ...LISTS.flat().map((id) => {
      const m = listMeta(id);
      return { key: id, view: id, name: VIEW_TITLES[id], label: `${VIEW_TITLES[id]}${m ? `, ${id === "inbox" ? `${m.text} ${m.text === "1" ? "item" : "items"}` : m.text}` : ""}${id === "projects" && sig.stalled ? `, ${sig.stalled} stalled` : ""}` };
    }),
    ...health,
    { key: "settings", view: "settings", name: "Settings", label: "Settings" },
  ];
  const idx = (key: string) => entries.findIndex((e) => e.key === key);
  const open = (e: Entry) => {
    if (e.start) ui.startReview();
    else ui.go(e.view);
    ui.setRegion("list");
  };

  useEffect(() => {
    if (active) setCursor((c) => (entries[c] && document.activeElement?.closest("nav.rail") ? c : Math.max(0, idx(ui.view))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Letter jump: the first letter of a stop's name moves the cursor to the next stop starting with it.
  // W and K stay the app-wide "start the review" and "clarify" keys, as the check lines show.
  const letters = [...new Set(entries.map((e) => e.name[0].toLowerCase()))].filter((ch) => ch !== "w" && ch !== "k");
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
      tabIndex: cursor === i ? 0 : -1,
      "aria-current": current ? ("page" as const) : undefined,
      "aria-label": e.label,
      "aria-keyshortcuts": keyAria(e.start ? "w" : e.key === "h-oldest" ? "k" : e.view === "settings" ? "mod+shift+," : (keyOf(e.view) ?? "")) || undefined,
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
                    {id === "projects" && sig.stalled > 0 && <span className="badge tiny">{sig.stalled} stalled</span>}
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
      <section className="rail-health" aria-labelledby="rail-health-h">
        <h2 className="rail-heading" id="rail-health-h">
          System check
        </h2>
        <ul className="rail-list">
          {health.map((e) => (
            <li key={e.key}>
              <button type="button" {...stop(e, "rail-item rail-check")}>
                {e.key === "h-review" && (
                  <>
                    <span className="rail-name">Weekly Review</span>
                    <span className="rail-meta">
                      <span className={`num ${reviewDue ? "is-due" : ""}`}>{reviewAge === null ? (reviewDue ? "due" : "not yet") : reviewAge === 0 ? "today" : `${reviewAge}d ago`}</span>
                      <RailKey k="w" />
                    </span>
                  </>
                )}
                {e.key === "h-stalled" && (
                  <>
                    <span className="rail-name">Stalled projects</span>
                    <span className="rail-meta">
                      <span className="num is-due">{sig.stalled}</span>
                      <RailKey k={keyOf("projects")} />
                    </span>
                  </>
                )}
                {e.key === "h-chase" && (
                  <>
                    <span className="rail-name">Follow-ups due</span>
                    <span className="rail-meta">
                      <span className="num is-due">{sig.chase}</span>
                      <RailKey k={keyOf("waiting")} />
                    </span>
                  </>
                )}
                {e.key === "h-oldest" && (
                  <>
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
          {health.length === 1 && <li className="rail-clear">Nothing stalled, overdue or waiting.</li>}
        </ul>
      </section>

      <ul className="rail-list rail-settings">
        <li>
          <button type="button" {...stop(entries[entries.length - 1], "rail-item")}>
            <span className="rail-name">Settings</span>
            <span className="rail-meta">
              <RailKey k="mod+shift+," />
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

const keyOf = (v: ViewId) => RAIL.find((r) => r.id === v)?.key;

/** Every rail stop shows its shortcut as a key cap, in one right-hand column (visual only; the key is in its accessible name). */
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
  const s = useStore((x) => x);
  const [more, setMore] = useState(false);
  const inbox = s.stuff.filter((x) => x.status === "inbox").length;
  const rest: ViewId[] = ["projects", "someday", "reference", "review", "done", "settings"];
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
    <nav className="tabbar" aria-label="Lists">
      {more && (
        <ul className="tabbar-more">
          {rest.map((v) => (
            <li key={v}>
              <button type="button" className={ui.view === v ? "is-current" : ""} aria-current={ui.view === v ? "page" : undefined} onClick={() => go(v)}>
                {VIEW_TITLES[v]}
              </button>
            </li>
          ))}
        </ul>
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

export function HelpOverlay({ close }: { close: () => void }) {
  const [snapshot] = useState(() => activeCommands().filter((c) => (c.keys?.length || c.displayKeys?.length) && !c.hidden));
  // Take focus so a screen reader reads the dialog, and hand it back on close.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus?.({ preventScroll: true });
  }, []);
  useCommands("help", [{ id: "help.close", label: "Close", group: "Help", keys: ["escape", "?"], inInput: true, run: close }], { priority: 300, exclusive: true });
  const groups = useMemo(() => {
    const m = new Map<string, Command[]>();
    // A key does one thing at a time: list only the command it would run now (the first claimant).
    const claimed = new Set<string>();
    for (const c of snapshot) {
      const keys = c.keys?.length ? c.keys : (c.displayKeys ?? []);
      if (keys.length && keys.every((k) => claimed.has(k))) continue;
      keys.forEach((k) => claimed.add(k));
      m.set(c.group, [...(m.get(c.group) ?? []), c]);
    }
    return [...m.entries()];
  }, [snapshot]);
  return (
    <div className="overlay" onMouseDown={close}>
      <div ref={box} className="help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts on this screen" tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <Tag size="md">Keys on this screen</Tag>
          <span className="muted-text small">
            <Kbd k="mod+k" /> finds every command
          </span>
        </div>
        <div className="help-cols">
          {groups.map(([g, cmds]) => (
            <section key={g}>
              <h3>{g}</h3>
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
                    <dd>{c.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export { allCommandsForPalette };
