import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { formatDate, formatLong, formatTime, daysBetween, today } from "../../shared/dates.ts";
import type { Action, Appointment, Context } from "../../shared/types.ts";
import { keyLabel, keySpoken, runKey } from "../keys.ts";

/** A disposition or section name as a quiet chip; md is a state's title in plain caps. */
export function Tag({ children, size = "sm" }: { children: ReactNode; size?: "sm" | "md" }) {
  return <span className={`tag tag-${size}`}>{children}</span>;
}

/**
 * The row marker: an empty ring, a tick when done; a chase (a waiting item due a follow-up) has its own mark. The
 * Important marker was retired after the second GTD critique (owner's decision: priority is judged in the moment,
 * against the horizons, not coded on actions).
 */
export function Marker({ done, chase, quiet }: { done?: boolean; chase?: boolean; quiet?: boolean }) {
  // Beside a Done box the plain ring and the done tick would say what the box says: only the chase mark stays.
  if (quiet && !chase) return <span className="marker" aria-hidden="true" />;
  return (
    <span className={`marker ${done ? "is-done" : ""} ${chase ? "is-chase" : ""}`}>
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden>
        <circle className="ring" cx="11" cy="11" r="4.2" />
        <path className="tick" pathLength={1} d="M7.4 11.3l2.4 2.4 4.9-5.2" />
      </svg>
    </span>
  );
}

/**
 * The Complete box, as in classic Outlook's task list: one click marks the action done (the pen strikes it
 * through), and in Done one click brings it back. It is mouse-only on purpose; the keyboard has E and ⇧E.
 */
export function DoneBox({ done, title, onToggle, label }: { done: boolean; title: string; onToggle: () => void; label?: [string, string] }) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      // A checklist ticks rather than marks done: its box keeps one name ("Tick “Passport”") and says checked or not,
      // so a screen reader never hears "Untick …, checked".
      aria-label={label ? `${label[0]} “${title}”` : done ? `Mark “${title}” not done` : `Mark “${title}” done`}
      title={label ? (done ? label[1] : label[0]) : done ? "Mark not done" : "Mark done"}
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


const HEALTH_LABEL = {
  ok: "On track: has a next action",
  waiting: "Waiting: only waiting on others",
  stalled: "Stalled: no current next action",
  someday: "Someday / Maybe",
  done: "Completed",
  scheduled: "Not started yet",
} as const;

/**
 * An appointment from a subscribed calendar, in the marker column: a calendar leaf drawn on the marker's 22px grid,
 * the ring's size and stroke. Square where actions are round and projects are lights, since an appointment is fixed
 * in time (the hard landscape) rather than something to do; its header strip carries the calendar's colour.
 */
export function EventMark({ color, label = "Appointment" }: { color?: string | null; label?: string }) {
  return (
    <span className="marker event-mark" role="img" aria-label={label} title={label} style={color ? { ["--feed" as string]: color } : undefined}>
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden>
        <rect className="leaf-edge" x="6.625" y="6.625" width="8.75" height="8.75" rx="1.5" />
        <path className="leaf-head" d="M6 8.1a2.1 2.1 0 0 1 2.1-2.1h5.8a2.1 2.1 0 0 1 2.1 2.1v1.4H6z" />
      </svg>
    </span>
  );
}

/**
 * Traffic-light lamp for a project's health. A scheduled project's lamp names why: its start day, or the linked
 * appointment that is its next step.
 */
export function Lamp({ health, start, appt }: { health: keyof typeof HEALTH_LABEL; start?: string | null; appt?: Pick<Appointment, "title" | "date" | "time"> | null }) {
  const label =
    health !== "scheduled"
      ? HEALTH_LABEL[health]
      : start && start > today()
        ? `Not started yet: starts ${formatLong(start)}`
        : appt
          ? `Next: ${appt.title}, ${appt.date === today() ? "today" : formatLong(appt.date)}${appt.time ? ` ${appt.time}` : ""}`
          : start === today()
            ? "Starts today: add a next action"
            : HEALTH_LABEL.scheduled;
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
    <span className={`date ${overdue ? "is-overdue" : ""} ${soon ? "is-soon" : ""}`} title={overdue ? `${formatLong(date)}, overdue` : formatLong(date)}>
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

/** A key cap. Its glyphs are for the eye; a screen reader hears the key's name ("Command Shift K", not "place of interest sign"). */
export function Kbd({ k }: { k: string }) {
  return (
    <kbd className="kbd">
      <span aria-hidden="true">{keyLabel(k)}</span>
      <span className="visually-hidden">{keySpoken(k)}</span>
    </kbd>
  );
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
