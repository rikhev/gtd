import { useEffect, useRef, type ReactNode } from "react";
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
  stalled: "Stalled: no next action",
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
          {i > 0 && <span className="key-hints-sep" aria-hidden>·</span>}
          <Kbd k={h.k} /> {h.label}
        </span>
      ))}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* The in-tray: a desk letter tray in three-quarter view, drawn in lines */
/* like the rest of the app (folder-ink outline, no fills of its own).   */
/* It holds plain paper only; every inbox item adds a sheet, so the pile */
/* of page edges visibly rises. Theme tokens only.                       */
/* ------------------------------------------------------------------ */

type P = [number, number];
const poly = (pts: P[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const wob = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v) - 0.5;
};

// Tray geometry: the floor is a perspective trapezoid; straight walls rise from it.
const FLOOR = { bl: [40, 58] as P, br: [160, 58] as P, fr: [182, 98] as P, fl: [18, 98] as P };
const BACK_TOP = 30;
const FRONT_TOP = 84;
const NOTCH = { l: 80, r: 120, y: 91 };
const MAX_SHEETS = 20;
const SHEET_LIFT = 2.2; // each sheet raises the pile this much
const MAX_PILE = 24; // a full tray heaps to just under the back wall's top

/** A point on the floor plane (u across, v back→front) raised by `lift`. */
function onFloor(u: number, v: number, lift: number): P {
  const { bl, br, fr, fl } = FLOOR;
  const back: P = [bl[0] + (br[0] - bl[0]) * u, bl[1]];
  const front: P = [fl[0] + (fr[0] - fl[0]) * u, fl[1]];
  return [back[0] + (front[0] - back[0]) * v, back[1] + (front[1] - back[1]) * v - lift];
}

/** One sheet lying in the tray: its top face, turned by a small angle, as four points. */
function sheetQuad(lift: number, shift: number, turn: number): P[] {
  const [u0, u1, v0, v1] = [0.06 + shift, 0.94 + shift, 0.05, 0.97];
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const ASPECT = 3.2; // v is foreshortened; this keeps a turned sheet rigid
  const rot = ([u, v]: P): P => {
    const du = u - cu;
    const dv = (v - cv) / ASPECT;
    return [cu + du * Math.cos(turn) - dv * Math.sin(turn), cv + (du * Math.sin(turn) + dv * Math.cos(turn)) * ASPECT];
  };
  return ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as P[]).map(rot).map(([u, v]) => onFloor(u, v, lift));
}

const lerpP = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** A point on a sheet's face [back-left, back-right, front-right, front-left] at (s across, t back→front). */
const onSheet = (q: P[], s: number, t: number): P => lerpP(lerpP(q[0], q[1], s), lerpP(q[3], q[2], s), t);

/** What is written on the top sheet: a heading, then lines of text, varied per sheet so each capture shows a new page. */
function writing(q: P[], seed: number) {
  const seg = (s0: number, s1: number, t: number) => {
    const a = onSheet(q, s0, t);
    const b = onSheet(q, s1, t);
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  };
  const heading = seg(0.1, 0.42 + (wob(seed, 5) + 0.5) * 0.18, 0.2);
  const rows = [0.36, 0.48, 0.6, 0.72, 0.84];
  const lines = rows
    .map((t, r) => {
      const last = r === rows.length - 1 || wob(seed, 10 + r) > 0.35; // a short line ends a paragraph
      const end = last ? 0.35 + (wob(seed, 20 + r) + 0.5) * 0.3 : 0.84 + (wob(seed, 30 + r) + 0.5) * 0.06;
      return seg(0.1, end, t);
    })
    .join("");
  return { heading, lines };
}

export function Tray({ count }: { count: number }) {
  const n = Math.min(count, MAX_SHEETS);
  const step = Math.min(SHEET_LIFT, MAX_PILE / Math.max(n, 1));
  const sheets = Array.from({ length: n }, (_, i) => {
    const top = i === n - 1;
    const q = sheetQuad((i + 1) * step, wob(i, 1) * 0.03, top ? wob(i, 3) * 0.03 : wob(i, 2) * 0.01);
    // The front edge: the two corners nearest the viewer, dropped by the sheet's thickness.
    const [a, b] = [...q].sort((m, k) => k[1] - m[1]).slice(0, 2).sort((m, k) => m[0] - k[0]);
    return { face: poly(q), edge: poly([a, b, [b[0], b[1] + step], [a[0], a[1] + step]]), text: top ? writing(q, count) : null };
  });
  const { bl, br, fr, fl } = FLOOR;
  const lip = `M${fl[0]} ${FRONT_TOP}H${NOTCH.l - 6}Q${NOTCH.l} ${FRONT_TOP} ${NOTCH.l + 2} ${NOTCH.y - 3}Q${NOTCH.l + 4} ${NOTCH.y} ${NOTCH.l + 10} ${NOTCH.y}H${NOTCH.r - 10}Q${NOTCH.r - 4} ${NOTCH.y} ${NOTCH.r - 2} ${NOTCH.y - 3}Q${NOTCH.r} ${FRONT_TOP} ${NOTCH.r + 6} ${FRONT_TOP}H${fr[0]}`;

  return (
    <svg className="tray-svg" viewBox="12 24 176 80" width="176" height="80" aria-hidden>
      {/* Behind the paper: the solid tray. Back wall, floor and the inner faces of both sides. */}
      <polygon className="t-back" points={poly([bl, br, [br[0], BACK_TOP], [bl[0], BACK_TOP]])} />
      <polygon className="t-floor" points={poly([bl, br, fr, fl])} />
      <polygon className="t-side" points={poly([bl, fl, [fl[0], FRONT_TOP], [bl[0], BACK_TOP]])} />
      <polygon className="t-side" points={poly([br, fr, [fr[0], FRONT_TOP], [br[0], BACK_TOP]])} />
      {/* Inner edges, a lighter 1px: the back wall's corners and where the walls meet the floor (the paper lies over them). */}
      <path className="t-edge" d={`M${bl[0]} ${BACK_TOP}V${bl[1]}M${br[0]} ${BACK_TOP}V${br[1]}M${bl[0]} ${bl[1]}L${fl[0]} ${fl[1]}M${br[0]} ${br[1]}L${fr[0]} ${fr[1]}M${bl[0]} ${bl[1]}H${br[0]}`} />
      {/* The rims: the tray's silhouette in the full 2px line. */}
      <path className="t-line" d={`M${fl[0]} ${FRONT_TOP}L${bl[0]} ${BACK_TOP}H${br[0]}L${fr[0]} ${FRONT_TOP}`} />

      {/* The paper: plain sheets, oldest at the bottom, newest on top and a little askew. */}
      {sheets.map((s, i) => (
        <g key={i} className="sheet" style={{ animationDelay: `${Math.min(i, 6) * 20}ms` }}>
          <polygon className="paper-edge" points={s.edge} />
          <polygon className="paper" points={s.face} />
          {s.text && (
            <>
              <path className="paper-heading" d={s.text.heading} />
              <path className="paper-text" d={s.text.lines} />
            </>
          )}
        </g>
      ))}

      {/* In front of the paper: the solid front lip with its finger notch. */}
      <path className="t-front" d={`${lip}V${fr[1]}H${fl[0]}Z`} />
      <path className="t-line" d={`${lip}V${fr[1]}H${fl[0]}Z`} />
    </svg>
  );
}

export function titleOr(a: Pick<Action, "title">) {
  return a.title.trim() || "Untitled action";
}
