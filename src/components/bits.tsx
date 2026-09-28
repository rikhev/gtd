import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react";
import { formatDate, formatTime, daysBetween, today } from "../../shared/dates.ts";
import type { Action, Context } from "../../shared/types.ts";
import { keyLabel } from "../keys.ts";

/** A disposition or section name as a quiet chip; md is a state's title in plain caps. */
export function Tag({ children, size = "sm" }: { children: ReactNode; size?: "sm" | "md" }) {
  return <span className={`tag tag-${size}`}>{children}</span>;
}

/**
 * The row marker: an empty ring, a tick when done. Flagged for today, it becomes a red flag on a pole,
 * the mark classic Outlook uses for a task flagged for follow-up.
 */
export function Marker({ flagged, done, chase, quiet }: { flagged: boolean; done?: boolean; chase?: boolean; quiet?: boolean }) {
  const today = flagged && !done;
  // Beside a Done box the plain ring and the done tick would say what the box says: only the marks worth marking stay.
  if (quiet && !today && !chase) return <span className="marker" aria-hidden="true" />;
  return (
    <span
      className={`marker ${today ? "is-flagged" : ""} ${done ? "is-done" : ""} ${chase ? "is-chase" : ""}`}
      role={today ? "img" : undefined}
      aria-label={today ? "Flagged for today" : undefined}
      title={today ? "Flagged for today" : undefined}
    >
      {today ? (
        <svg className="leaf" viewBox="0 0 22 22" width="22" height="22" aria-hidden>
          {/* A flag on a pole, as classic Outlook flags a task for follow-up. */}
          <path className="flag-pole" d="M6.5 4v14.5" />
          <path className="flag-cloth" d="M7 4.6h9.2l-2.4 3.4 2.4 3.4H7z" />
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
 * The flag column, as in classic Outlook: the row's marker is a button. One click flags the action for today
 * (the red flag drops in); clicking the flag takes it off. Unflagged, hovering shows a faint outline flag so the
 * target is findable. Mouse-only like the Complete box; the keyboard has Ins.
 */
export function FlagButton({ flagged, chase, title, onToggle }: { flagged: boolean; chase?: boolean; title: string; onToggle: () => void }) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      aria-pressed={flagged}
      aria-label={flagged ? `Remove the today flag from “${title}”` : `Flag “${title}” for today`}
      title={flagged ? "Flagged for today: click to remove" : "Flag for today"}
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
          <path d="M6.5 4v14.5" />
          <path d="M7 4.6h9.2l-2.4 3.4 2.4 3.4H7z" />
        </svg>
      )}
    </button>
  );
}

const HEALTH_LABEL = {
  ok: "On track: has a next action",
  waiting: "Waiting: only waiting on others",
  stalled: "Stalled: no next action, or nothing touched for weeks",
  someday: "Someday / Maybe",
  done: "Completed",
} as const;

/** Traffic-light lamp for a project's health. */
export function Lamp({ health }: { health: keyof typeof HEALTH_LABEL }) {
  return <span className={`lamp ${health}`} role="img" aria-label={HEALTH_LABEL[health]} title={HEALTH_LABEL[health]} />;
}

export function ContextCode({ ctx }: { ctx?: Context }) {
  if (!ctx) return <span className="dash" aria-hidden="true">–</span>;
  return (
    <span className="ctx" style={{ ["--ctx" as string]: ctx.color }}>
      {ctx.name}
    </span>
  );
}

/** An area as "#Work": plain text, its colour only in the # (a context's colour is its underline instead). */
export function AreaName({ name, color }: { name: string; color?: string | null }) {
  const bare = name.trim().replace(/^#+\s*/, "") || "Untitled";
  return (
    <span className="area-name">
      <span className="area-hash" style={color ? { ["--area" as string]: color } : undefined}>#</span>
      {bare}
    </span>
  );
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
export function KeyHints({ hints }: { hints: { k: string; label: string }[] }) {
  return (
    <p className="key-hints" aria-label="Keyboard shortcuts">
      {hints.map((h, i) => (
        <span key={h.k + h.label}>
          <Kbd k={h.k} /> {h.label}
        </span>
      ))}
    </p>
  );
}

export function titleOr(a: Pick<Action, "title">) {
  return a.title.trim() || "Untitled action";
}
