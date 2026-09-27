import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Search, Check } from "lucide-react";
import { capture, daysSinceReview, notify, useNotice, useStore, isStalled, isDeferred, isChase } from "../store.ts";
import { useUI, VIEW_TITLES, type ViewId } from "../ui.tsx";
import { allCommandsForPalette, activeCommands, useCommands, keyLabel, type Command } from "../keys.ts";
import { Kbd, Tape, Tray } from "./bits.tsx";
import { today } from "../../shared/dates.ts";

export const RAIL: { id: ViewId; key: string }[] = [
  { id: "inbox", key: "ctrl+shift+1" },
  { id: "next", key: "ctrl+shift+2" },
  { id: "projects", key: "ctrl+shift+3" },
  { id: "waiting", key: "ctrl+shift+4" },
  { id: "someday", key: "ctrl+shift+5" },
  { id: "reference", key: "ctrl+shift+6" },
  { id: "review", key: "ctrl+shift+7" },
  { id: "done", key: "ctrl+shift+8" },
  { id: "areas", key: "ctrl+shift+9" },
];

/** GTD's own stages group the drawer: lists you organise into, and what you reflect on. */
const RAIL_SECTIONS: { title: string; ids: ViewId[] }[] = [
  { title: "Organize", ids: ["next", "projects", "waiting", "someday", "reference"] },
  { title: "Reflect", ids: ["review", "done", "areas"] },
  { title: "Settings", ids: ["settings"] },
];

export function Rail({ active }: { active: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [cursor, setCursor] = useState(0);
  const t = today();
  const counts = useMemo(() => {
    const inbox = s.stuff.filter((x) => x.status === "inbox").length;
    return {
      inbox,
      next: s.actions.filter((a) => (a.status === "next" && !isDeferred(a, t)) || isChase(a, t)).length,
      projects: s.projects.filter((p) => p.status === "active").length,
      waiting: s.actions.filter((a) => a.status === "waiting").length,
      someday: s.actions.filter((a) => a.status === "someday").length + s.projects.filter((p) => p.status === "someday").length,
      reference: s.refs.filter((r) => r.status === "active").length,
      review: 0,
      done: s.actions.filter((a) => a.status === "done" && a.completed_at && a.completed_at.slice(0, 10) === t).length,
      areas: s.areas.length,
    } as Record<ViewId, number>;
  }, [s, t]);
  const stalled = useMemo(() => s.projects.filter((p) => isStalled(s, p)).length, [s]);
  const reviewAge = daysSinceReview(s);
  const items = [...RAIL.map((r) => r.id), "settings" as ViewId];

  useEffect(() => {
    if (active) setCursor(Math.max(0, items.indexOf(ui.view)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useCommands(
    "rail",
    [
      { id: "rail.down", label: "Next list", group: "Move", keys: ["arrowdown"], run: () => setCursor((c) => Math.min(items.length - 1, c + 1)) },
      { id: "rail.up", label: "Previous list", group: "Move", keys: ["arrowup"], run: () => setCursor((c) => Math.max(0, c - 1)) },
      {
        id: "rail.open",
        label: "Open list",
        group: "Move",
        keys: ["enter", "arrowright", "space"],
        run: () => {
          ui.go(items[cursor]);
          ui.setRegion("list");
        },
      },
      { id: "rail.leave", label: "Back to the list", group: "Move", keys: ["escape"], run: () => ui.setRegion("list") },
    ],
    { priority: 10, active },
  );
  // Spoken form of a rail entry: "Projects, 7, 1 stalled", "Weekly Review, last done 3 days ago".
  const railLabel = (id: ViewId) => {
    const name = VIEW_TITLES[id];
    if (id === "settings") return name;
    if (id === "review") return `${name}, ${reviewAge === null ? "not done yet" : reviewAge === 0 ? "done today" : `last done ${reviewAge} days ago`}`;
    if (id === "done") return counts.done ? `${name}, ${counts.done} today` : name;
    return `${name}, ${counts[id] ?? 0}${id === "projects" && stalled ? `, ${stalled} stalled` : ""}`;
  };
  // While the rail is the active region its cursor is real keyboard focus, so screen readers follow it.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active) navRef.current?.querySelector<HTMLElement>(`[data-rail="${cursor}"]`)?.focus({ preventScroll: true });
  }, [active, cursor]);

  return (
    <nav ref={navRef} className={`rail ${active ? "is-active" : ""}`} aria-label="Lists">
      <button type="button" data-rail={0} tabIndex={cursor === 0 ? 0 : -1} aria-current={ui.view === "inbox" ? "page" : undefined} className={`tray ${ui.view === "inbox" ? "is-current" : ""} ${active && cursor === 0 ? "is-cursor" : ""}`} onClick={() => ui.go("inbox")}>
        <span className="tray-label">
          <Tape size="md">In-tray</Tape>
          <span className="tray-count num" aria-label={`${counts.inbox} in the Inbox`}>
            {counts.inbox}
          </span>
        </span>
        <Tray count={counts.inbox} />
      </button>
      {RAIL_SECTIONS.map((section) => (
        <section key={section.title} className="rail-section" aria-label={section.title}>
          {section.title !== "Settings" && <h2 className="rail-heading">{section.title}</h2>}
          <ul className="rail-list">
            {section.ids.map((id) => {
              const i = items.indexOf(id);
              const current = ui.view === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`rail-item ${current ? "is-current" : ""} ${active && cursor === i ? "is-cursor" : ""}`}
                    data-rail={i}
                    tabIndex={cursor === i ? 0 : -1}
                    aria-current={current ? "page" : undefined}
                    aria-label={railLabel(id)}
                    onClick={() => ui.go(id)}
                  >
                    <span className="rail-name">{VIEW_TITLES[id]}</span>
                    <span className="rail-meta">
                      {id === "projects" && stalled > 0 && <span className="stamp tiny">{stalled} stalled</span>}
                      {id === "review" ? (
                        // Red only once a review is actually overdue; "never" on day one is a fact, not a scolding.
                        <span className={`num ${reviewAge !== null && reviewAge > 7 ? "is-due" : ""}`}>{reviewAge === null ? "not yet" : reviewAge === 0 ? "today" : `${reviewAge}d ago`}</span>
                      ) : id === "settings" ? null : (
                        // Done counts today's completions, and says so; the other lists count what is in them.
                        <span className="num">{id === "done" ? (counts.done ? `${counts.done} today` : "") : counts[id] || ""}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
/** Which heading a command falls under while browsing the palette. */
function paletteSection(c: Command): 0 | 1 | 2 | 3 {
  if (recentIds().includes(c.id)) return 0;
  const g = GENERIC_GROUPS[c.group];
  return g === 3 ? 3 : g === 2 ? 2 : 1;
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
      return r >= 0 ? r - 10 : (GENERIC_GROUPS[c.group] ?? 1);
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
          <Tape size="md">Keys on this screen</Tape>
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
