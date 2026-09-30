import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { formatDate, formatLong, formatTime, daysBetween, today } from "../../shared/dates.ts";
import type { Action, Context } from "../../shared/types.ts";
import { keyLabel, runKey } from "../keys.ts";

/** A disposition or section name as a quiet chip; md is a state's title in plain caps. */
export function Tag({ children, size = "sm" }: { children: ReactNode; size?: "sm" | "md" }) {
  return <span className={`tag tag-${size}`}>{children}</span>;
}

/**
 * The row marker: an empty ring, a tick when done. Marked important, it becomes a red exclamation mark, the mark
 * classic Outlook uses for a task of high importance (owner's decision: importance, not "flagged for today").
 */
export function Marker({ flagged, done, chase, quiet }: { flagged: boolean; done?: boolean; chase?: boolean; quiet?: boolean }) {
  const today = flagged && !done;
  // Beside a Done box the plain ring and the done tick would say what the box says: only the marks worth marking stay.
  if (quiet && !today && !chase) return <span className="marker" aria-hidden="true" />;
  return (
    <span
      className={`marker ${today ? "is-flagged" : ""} ${done ? "is-done" : ""} ${chase ? "is-chase" : ""}`}
      role={today ? "img" : undefined}
      aria-label={today ? "Important" : undefined}
      title={today ? "Important" : undefined}
    >
      {today ? (
        <svg className="leaf" viewBox="0 0 22 22" width="22" height="22" aria-hidden>
          <ImportantGlyph />
        </svg>
      ) : (
        <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden>
          <circle className="ring" cx="11" cy="11" r="4.2" />
          <path className="tick" pathLength={1} d="M7.4 11.3l2.4 2.4 4.9-5.2" />
        </svg>
      )}
    </span>
  );
}

/**
 * The Complete box, as in classic Outlook's task list: one click marks the action done (the pen strikes it
 * through), and in Done one click brings it back. It is mouse-only on purpose; the keyboard has E and ⇧E.
 */
export function DoneBox({ done, title, onToggle }: { done: boolean; title: string; onToggle: () => void }) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark “${title}” not done` : `Mark “${title}” done`}
      title={done ? "Mark not done" : "Mark done"}
      tabIndex={-1}
      className={`done-box ${done ? "is-checked" : ""}`}
      onMouseDown={stop}
      onDoubleClick={stop}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <rect className="box" x="1" y="1" width="12" height="12" rx="2" />
        <path className="check" d="M3.8 7.2l2.2 2.2 4.3-4.8" />
      </svg>
    </button>
  );
}

/**
 * The importance column, as in classic Outlook: the row's marker is a button. One click marks the action important
 * (the red exclamation mark drops in); clicking it takes it off. Otherwise hovering shows a faint outline of the mark
 * so the target is findable. Mouse-only like the Complete box; the keyboard has Ins.
 */
export function FlagButton({ flagged, chase, title, onToggle }: { flagged: boolean; chase?: boolean; title: string; onToggle: () => void }) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      aria-pressed={flagged}
      aria-label={flagged ? `Mark “${title}” as not important` : `Mark “${title}” as important`}
      title={flagged ? "Important: click to unmark" : "Mark as important"}
      tabIndex={-1}
      className={`flag-btn ${flagged ? "is-on" : ""}`}
      onMouseDown={stop}
      onDoubleClick={stop}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Marker quiet flagged={flagged} chase={chase} />
      {!flagged && (
        <svg className="flag-ghost" viewBox="0 0 22 22" width="22" height="22" aria-hidden>
          <ImportantGlyph />
        </svg>
      )}
    </button>
  );
}

/**
 * High importance, drawn (not a typed "!"): a tapering bar over a round dot, in a 22px box. The same shape fills the
 * marker in alert red and, outlined, is the hover hint on an unmarked row.
 */
export function ImportantGlyph() {
  return (
    <>
      <path className="imp-bar" d="M9.6 4.4h2.8l-0.55 9.2h-1.7z" />
      <circle className="imp-dot" cx="11" cy="16.9" r="1.55" />
    </>
  );
}

const HEALTH_LABEL = {
  ok: "On track: has a next action",
  waiting: "Waiting: only waiting on others",
  stalled: "Stalled: no next action, or nothing touched for weeks",
  someday: "Someday / Maybe",
  done: "Completed",
  scheduled: "Not started yet",
} as const;

/** Traffic-light lamp for a project's health. A scheduled project's lamp names its start day. */
export function Lamp({ health, start }: { health: keyof typeof HEALTH_LABEL; start?: string | null }) {
  const label = health === "scheduled" && start ? (start === today() ? "Starts today: give it a next action" : `Not started yet: starts ${formatLong(start)}`) : HEALTH_LABEL[health];
  return (
    <svg className={`lamp ${health}`} viewBox="0 0 12 12" role="img" aria-label={label}>
      <title>{label}</title>
      {LAMP_SHAPE[health]}
    </svg>
  );
}

/*
 * Drawn on a 12px grid (a 10px light with a pixel of air), so a light stays round and crisp on a 1× screen: health is
 * told by shape as well as colour, so it reads without colour vision. On track is a solid light; waiting a dot held in
 * a ring; stalled a no-entry sign (a light with a bar cut out of it, its edges on whole pixels); not started a ring with
 * clock hands; someday a half-lit ring; completed a dimmed light.
 */
const RING = <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />;
const LAMP_SHAPE: Record<keyof typeof HEALTH_LABEL, ReactNode> = {
  ok: <circle cx="6" cy="6" r="5" />,
  done: <circle cx="6" cy="6" r="5" />,
  waiting: (
    <>
      {RING}
      <circle cx="6" cy="6" r="2" />
    </>
  ),
  stalled: <path fillRule="evenodd" d="M1 6a5 5 0 1 0 10 0a5 5 0 1 0-10 0ZM3 5h6v2H3Z" />,
  scheduled: (
    <>
      {RING}
      <path d="M6 3.6V6.2H8.3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  someday: (
    <>
      {RING}
      <path d="M6 1.75a4.25 4.25 0 0 0 0 8.5Z" />
    </>
  ),
};

/**
 * Areas and contexts read alike (owner's decision): the mark in a small tile of the item's colour, then the name in plain
 * ink. An area's mark is #, a context's @. The tile carries the colour so it can be seen at a glance.
 */
export function Named({ mark, name, color }: { mark: "#" | "@"; name: string; color?: string | null }) {
  const bare = name.trim().replace(/^[#@]+\s*/, "") || "Untitled";
  return (
    <span className="named">
      <span className="named-tile" style={color ? { ["--tile" as string]: color } : undefined}>
        {mark}
      </span>
      <span className="named-text">{bare}</span>
    </span>
  );
}

export function ContextCode({ ctx }: { ctx?: Context }) {
  if (!ctx) return <span className="dash" aria-hidden="true">–</span>;
  return <Named mark="@" name={ctx.name} color={ctx.color} />;
}

/** An area as "#Work": its # in a small tile of the area's colour, the name in plain ink (a context's colour is its underline instead). */
export function AreaName({ name, color }: { name: string; color?: string | null }) {
  return <Named mark="#" name={name} color={color} />;
}

export function DateCell({ date, kind = "due" }: { date: string | null; kind?: "due" | "defer" | "plain" }) {
  if (!date) return <span className="dash" aria-hidden="true">–</span>;
  const d = daysBetween(today(), date);
  const overdue = kind === "due" && d < 0;
  const soon = kind === "due" && d >= 0 && d <= 1;
  return (
    <span className={`date ${overdue ? "is-overdue" : ""} ${soon ? "is-soon" : ""}`} title={overdue ? `${date}, overdue` : date}>
      {formatDate(date)}
      {/* Colour alone doesn't reach a screen reader. */}
      {overdue && <span className="visually-hidden">, overdue</span>}
    </span>
  );
}

export function TimeCell({ min }: { min: number | null }) {
  return min ? <span className="num">{formatTime(min)}</span> : <span className="dash" aria-hidden="true">–</span>;
}

/** Energy as a stepped tonal ramp: three cells, filled up to the level. */
export function Energy({ level }: { level: number | null }) {
  if (!level) return <span className="dash" aria-hidden="true">–</span>;
  return (
    <span className="energy" role="img" aria-label={["", "Low", "Medium", "High"][level] + " energy"} title={["", "Low", "Medium", "High"][level] + " energy"}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? `on e${level}` : ""} />
      ))}
    </span>
  );
}

export function Kbd({ k }: { k: string }) {
  return <kbd className="kbd">{keyLabel(k)}</kbd>;
}

/** The ways forward from a stopped or finished state, each with its key. The keys themselves are bound by the view. */
export function KeyChoices({ choices, autoFocus = true }: { choices: { k: string; label: string; run: () => void }[]; autoFocus?: boolean }) {
  // The first way forward takes focus, so a screen reader lands on the choices rather than on nothing.
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = document.activeElement;
    if (autoFocus && (!el || el === document.body)) first.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <ul className="key-choices">
      {choices.map((c, i) => (
        <li key={c.k}>
          <button type="button" ref={i === 0 ? first : undefined} onClick={c.run}>
            <Kbd k={c.k} />
            <span>{c.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One quiet line naming the few keys that matter in a rarely used mode (Clarify, Weekly Review). */
/**
 * The keys a screen offers. Each hint is also a button that does what its key does, so the screen works by touch
 * (where the line becomes a row of tap targets and the key caps hide) and by mouse.
 */
/**
 * On a touch screen the hints are the screen's buttons, so they are given an order: the one `primary` hint is a full
 * width filled button, `touch: "more"` hints wait behind a More button, and `touch: "hide"` hints (moving between
 * tabs or steps the screen already shows) are left out. With a keyboard every hint shows as its key, in order.
 */
export type KeyHint = { k: string; label: string; primary?: boolean; touch?: "more" | "hide" };
export function KeyHints({ hints }: { hints: KeyHint[] }) {
  const touch = useIsTouch();
  const [more, setMore] = useState(false);
  const btn = (h: KeyHint, extra = "") => (
    <button key={h.k + h.label} type="button" className={`kh ${extra}`} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => runKey(h.k)}>
      <Kbd k={h.k} /> {h.label}
    </button>
  );
  if (!touch) return <p className="key-hints" aria-label="Keyboard shortcuts">{hints.map((h) => btn(h))}</p>;
  const shown = hints.filter((h) => h.touch !== "hide");
  const primary = shown.filter((h) => h.primary);
  const rest = shown.filter((h) => !h.primary && h.touch !== "more");
  const extra = shown.filter((h) => h.touch === "more");
  return (
    <div className="key-hints is-touch" aria-label="Actions">
      {primary.map((h) => btn(h, "is-primary"))}
      <div className="kh-row">
        {rest.map((h) => btn(h))}
        {extra.length > 0 && (
          <button type="button" className={`kh ${more ? "is-open" : ""}`} aria-expanded={more} onClick={() => setMore(!more)}>
            More
          </button>
        )}
      </div>
      {more && <div className="kh-row">{extra.map((h) => btn(h))}</div>}
    </div>
  );
}

/** A touch-first device (coarse pointer), kept current if the device changes mode. */
export function useIsTouch() {
  const q = "(pointer: coarse)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return on;
}

export function titleOr(a: Pick<Action, "title">) {
  return a.title.trim() || "Untitled action";
}
