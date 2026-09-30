import { useSyncExternalStore } from "react";
import type { UI } from "./ui.tsx";
import type { Action } from "../shared/types.ts";
import { getState } from "./store.ts";
import { today } from "../shared/dates.ts";

/**
 * What fits now (GTD's engage step: context, then time available, then energy). Kept outside the list so the view
 * heading, its count and the list all read the same filter. It is for the moment: it lapses at the end of the day,
 * so a stale one never hides tomorrow's list.
 */
export interface Fit {
  /** The contexts where you are (ids), or null for anywhere. GTD's first criterion. */
  where?: string[] | null;
  /** Minutes you have, or null for any length. */
  time: number | null;
  /** 1 low, 2 medium, 3 high (anything goes), or null. */
  energy: number | null;
  day: string;
}

const KEY = "gtd:fit:next";
const listeners = new Set<() => void>();
let current: Fit | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Fit | null;
  } catch {
    return null;
  }
})();

export function setFit(f: Fit | null) {
  current = f;
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* no storage: the filter lasts this session */
  }
  listeners.forEach((l) => l());
}

const read = () => (current && current.day === today() ? current : null);

/** Today's filter, or null. */
export function useFit(): Fit | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}

export type FitVerdict = "fits" | "unknown" | "no" | "elsewhere";
/**
 * Whether an action fits: its time and energy within what you have. An estimate that isn't there can't be judged,
 * so it is "unknown" (listed apart, below), never simply counted as fitting.
 */
export function fits(a: Action, f: Fit): FitVerdict {
  // Where you are comes first: a next action for another context can't be done here (a chase has no place of its own).
  if (f.where?.length && a.status === "next" && !f.where.includes(a.context_id ?? "")) return "elsewhere";
  if (f.time !== null) {
    if (a.time_min === null) return "unknown";
    if (a.time_min > f.time) return "no";
  }
  if (f.energy !== null && f.energy < 3) {
    if (a.energy === null) return "unknown";
    if (a.energy > f.energy) return "no";
  }
  return "fits";
}

export const FIT_TIMES: [number | null, string][] = [[5, "5 minutes"], [15, "15 minutes"], [30, "30 minutes"], [60, "An hour"], [120, "Two hours"], [null, "Any length of time"]];
export const FIT_ENERGY: [number, string][] = [[1, "Low: something easy"], [2, "Medium"], [3, "High: anything goes"]];

export const fitLabel = (f: Fit) =>
  [
    f.where?.length ? f.where.map((id) => getState().contexts.find((c) => c.id === id)?.name ?? "").filter(Boolean).map((n) => (n.startsWith("@") ? n : `@${n}`)).join(", ") : null,
    f.time === null ? null : f.time < 60 ? `${f.time} min` : f.time === 60 ? "an hour" : `${f.time / 60} hours`, f.energy === null || f.energy === 3 ? null : `${["", "low", "medium"][f.energy]} energy`]
    .filter(Boolean)
    .join(" · ") || "anything";

/** F: where you are, then how much time, then how much energy. On again, it also offers to show everything. */
export function openFit(ui: UI, chosen: string[] = read()?.where ?? []) {
  const fit = read();
  // Where: tick one or more contexts (the picker comes back after each), then Continue; or Anywhere.
  const ctxs = getState().contexts;
  const open = (id: string) => getState().actions.filter((a) => a.status === "next" && a.context_id === id).length;
  ui.openPicker({
    type: "list",
    title: "Where are you?",
    items: [
      ...(fit ? [{ id: "off", label: "Show every next action", hint: "Clear" }] : []),
      { id: "go", label: chosen.length ? `Continue with ${chosen.length === 1 ? "this place" : `these ${chosen.length}`}` : "Anywhere", hint: chosen.length ? "" : "Every context" },
      ...ctxs
        .filter((c) => open(c.id) > 0 || chosen.includes(c.id))
        .map((c) => ({ id: `c:${c.id}`, label: c.name.startsWith("@") ? c.name : `@${c.name}`, hint: chosen.includes(c.id) ? "Here" : String(open(c.id)) })),
    ],
    onPick: (id) => {
      if (!id) return;
      if (id === "off") return setFit(null);
      if (id.startsWith("c:")) {
        const cid = id.slice(2);
        const next = chosen.includes(cid) ? chosen.filter((x) => x !== cid) : [...chosen, cid];
        return void window.setTimeout(() => openFit(ui, next));
      }
      window.setTimeout(() => askTime(ui, chosen.length ? chosen : null));
    },
  });
}

function askTime(ui: UI, where: string[] | null) {
  const fit = read();
  ui.openPicker({
    type: "list",
    title: "How much time do you have?",
    items: [
      ...FIT_TIMES.map(([m, label]) => ({ id: m === null ? "any" : String(m), label, hint: fit && fit.time === m ? "Current" : "" })),
    ],
    onPick: (id) => {
      if (!id) return;
      const time = id === "any" ? null : Number(id);
      window.setTimeout(() =>
        ui.openPicker({
          type: "list",
          title: "And how much energy?",
          items: FIT_ENERGY.map(([e, label]) => ({ id: String(e), label, hint: fit && fit.energy === e ? "Current" : "" })),
          onPick: (e) => e && setFit({ where, time, energy: Number(e), day: today() }),
        }),
      );
    },
  });
}
