import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDate, formatTime, daysBetween, today } from "../../shared/dates.ts";
import type { Action, Context } from "../../shared/types.ts";
import { keyLabel } from "../keys.ts";

/** Label-maker tape: black tape, embossed white condensed caps. */
export function Tape({ children, tone = "black", size = "sm" }: { children: ReactNode; tone?: "black"; size?: "sm" | "md" }) {
  return <span className={`tape tape-${tone} tape-${size}`}>{children}</span>;
}

/**
 * The row marker: an empty ring; when flagged for today, the ring is inked in and circled by hand
 * (a loose pen loop that overshoots its start with a visible tail), so it differs in shape, not just size.
 */
export function Marker({ flagged, done, chase }: { flagged: boolean; done?: boolean; chase?: boolean }) {
  return (
    <span
      className={`marker ${flagged ? "is-flagged" : ""} ${done ? "is-done" : ""} ${chase ? "is-chase" : ""}`}
      role={flagged ? "img" : undefined}
      aria-label={flagged ? "Flagged for today" : undefined}
      title={flagged ? "Flagged for today" : undefined}
    >
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden>
        <circle className="ring" cx="11" cy="11" r="4.2" />
        <path
          className="pen"
          pathLength={1}
          d="M17.4 5.6C14.2 2.6 7.4 2.9 4.5 6.9 2.1 10.3 3.2 15.9 7.6 17.8c4.3 1.9 9.6.1 11-3.9 1.1-3.2-.4-6.6-3.3-8.1-2.6-1.4-6.1-1.6-8.9-.4l-2.6 1.4"
        />
        <path className="tick" pathLength={1} d="M7.4 11.3l2.4 2.4 4.9-5.2" />
      </svg>
    </span>
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

/* ------------------------------------------------------------------ */
/* The in-tray: the IN-TRAY tape is the tray's front lip, and the stuff   */
/* in it is a flat stack of sheet edges on top. One visible 2px step per  */
/* item up to 8; past that the top sheet heaps askew. Paper only.         */
/* ------------------------------------------------------------------ */

const STACK_STEPS = 8;
const shuffle = (i: number) => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v) - 0.5;
};

/** The stack of sheets that sits on the tape. Decorative: the count beside it is what's announced. */
export function InboxStack({ count }: { count: number }) {
  const n = Math.min(count, STACK_STEPS);
  const heaping = count > STACK_STEPS;
  // Only a sheet that has just arrived slides in; nothing replays on load. The flag is held for the
  // length of the animation, so re-renders right after a capture don't cut it short.
  const prev = useRef(count);
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const grew = count > prev.current;
    prev.current = count;
    if (!grew) return;
    setArrived(true);
    const t = window.setTimeout(() => setArrived(false), 260);
    return () => window.clearTimeout(t);
  }, [count]);
  return (
    <span className="stack" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const top = i === n - 1;
        return (
          <span
            key={i}
            className={`stack-sheet ${top && heaping ? "is-heap" : ""} ${top && arrived ? "is-new" : ""}`}
            style={{ bottom: `${i * 2}px`, left: `${4 + shuffle(i) * 4}px`, right: `${4 - shuffle(i) * 4}px` }}
          />
        );
      })}
    </span>
  );
}

export function titleOr(a: Pick<Action, "title">) {
  return a.title.trim() || "Untitled action";
}
