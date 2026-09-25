import type { ReactNode } from "react";
import { formatDate, formatTime, daysBetween, today } from "../../shared/dates.ts";
import type { Action, Context } from "../../shared/types.ts";
import { keyLabel } from "../keys.ts";

/** Label-maker tape: black tape, embossed white condensed caps. */
export function Tape({ children, tone = "black", size = "sm" }: { children: ReactNode; tone?: "black" | "yellow"; size?: "sm" | "md" }) {
  return <span className={`tape tape-${tone} tape-${size}`}>{children}</span>;
}

/** The row marker: an empty ring, or a hand-drawn pen circle when flagged for today. */
export function Marker({ flagged, done, chase }: { flagged: boolean; done?: boolean; chase?: boolean }) {
  return (
    <span className={`marker ${flagged ? "is-flagged" : ""} ${done ? "is-done" : ""} ${chase ? "is-chase" : ""}`} aria-label={flagged ? "Flagged for today" : undefined}>
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden>
        <circle className="ring" cx="11" cy="11" r="4.2" />
        <path
          className="pen"
          pathLength={1}
          d="M13.6 4.1C10.1 2.6 5.2 4.3 3.6 8.2 2.2 11.8 3.9 16.4 7.9 17.9c3.9 1.4 8.6-.4 10.1-4.3 1.2-3.1.2-6.9-2.8-8.8-2.3-1.5-5.6-1.9-8.3-.6-.9.5-1.6 1.1-2.1 1.8"
        />
        <path className="tick" pathLength={1} d="M7.4 11.3l2.4 2.4 4.9-5.2" />
      </svg>
    </span>
  );
}

export function ContextCode({ ctx }: { ctx?: Context }) {
  if (!ctx) return <span className="dash">–</span>;
  return (
    <span className="ctx" style={{ ["--ctx" as string]: ctx.color }}>
      {ctx.name}
    </span>
  );
}

export function DateCell({ date, kind = "due" }: { date: string | null; kind?: "due" | "defer" | "plain" }) {
  if (!date) return <span className="dash">–</span>;
  const d = daysBetween(today(), date);
  const overdue = kind === "due" && d < 0;
  const soon = kind === "due" && d >= 0 && d <= 1;
  return (
    <span className={`date ${overdue ? "is-overdue" : ""} ${soon ? "is-soon" : ""}`} title={date}>
      {formatDate(date)}
    </span>
  );
}

export function TimeCell({ min }: { min: number | null }) {
  return min ? <span className="num">{formatTime(min)}</span> : <span className="dash">–</span>;
}

/** Energy as a stepped tonal ramp: three cells, filled up to the level. */
export function Energy({ level }: { level: number | null }) {
  if (!level) return <span className="dash">–</span>;
  return (
    <span className="energy" aria-label={["", "Low", "Medium", "High"][level] + " energy"} title={["", "Low", "Medium", "High"][level] + " energy"}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? `on e${level}` : ""} />
      ))}
    </span>
  );
}

export function Kbd({ k }: { k: string }) {
  return <kbd className="kbd">{keyLabel(k)}</kbd>;
}

/** The wire in-tray: sheet edges stack up with the inbox count. */
export function Tray({ count }: { count: number }) {
  const sheets = Math.min(count, 9);
  return (
    <svg className="tray-svg" viewBox="0 0 64 30" width="64" height="30" aria-hidden>
      {Array.from({ length: sheets }).map((_, i) => (
        <path
          key={i}
          className="sheet"
          d={`M${9 + (i % 3)} ${21 - i * 2} h${44 - ((i * 5) % 7)} l1.5 -1.5`}
          style={{ animationDelay: `${i * 30}ms` }}
        />
      ))}
      <path className="wire" d="M3 13 v11 a3 3 0 0 0 3 3 h52 a3 3 0 0 0 3 -3 v-11" />
      <path className="wire thin" d="M3 18 h58 M12 27 v-9 M22 27 v-9 M32 27 v-9 M42 27 v-9 M52 27 v-9" />
    </svg>
  );
}

export function titleOr(a: Pick<Action, "title">) {
  return a.title.trim() || "Untitled action";
}
