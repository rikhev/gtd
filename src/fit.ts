import { useSyncExternalStore } from "react";
import type { UI } from "./ui.tsx";
import type { Action } from "../shared/types.ts";
import { getState } from "./store.ts";
import { today } from "../shared/dates.ts";

/**
 * What fits now (GTD's engage step: where you are decides what can be done). Kept outside the list so the view
 * heading, its count and the list all read the same filter. It is for the moment: it lapses at the end of the day,
 * so a stale one never hides tomorrow's list.
 */
export interface Fit {
  /** The contexts where you are (ids). */
  where: string[];
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

// A filter saved before it asked only where you are may name no place: it shows everything, so it is no filter.
const read = () => (current && current.day === today() && current.where?.length ? current : null);

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

export type FitVerdict = "fits" | "elsewhere";
/** Whether an action can be done where you are. A chase has no place of its own, so it always fits. */
export function fits(a: Action, f: Fit): FitVerdict {
  return a.status === "next" && !f.where.includes(a.context_id ?? "") ? "elsewhere" : "fits";
}

export const fitLabel = (f: Fit) =>
  f.where
    .map((id) => getState().contexts.find((c) => c.id === id)?.name ?? "")
    .filter(Boolean)
    .map((n) => (n.startsWith("@") ? n : `@${n}`))
    .join(", ") || "anywhere";

/** F: where you are, and only that. On again, it also offers to show everything. */
export function openFit(ui: UI, chosen: string[] = read()?.where ?? []) {
  const fit = read();
  // Tick one or more contexts (the picker comes back after each), then Show; Anywhere shows every next action.
  const ctxs = getState().contexts;
  const open = (id: string) => getState().actions.filter((a) => a.status === "next" && a.context_id === id).length;
  ui.openPicker({
    type: "list",
    title: "Where are you?",
    items: [
      ...(fit ? [{ id: "off", label: "Show every next action", hint: "Clear" }] : []),
      { id: "go", label: chosen.length ? `Show ${chosen.length === 1 ? "this place" : `these ${chosen.length}`}` : "Anywhere", hint: chosen.length ? "" : "Every context" },
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
      setFit(chosen.length ? { where: chosen, day: today() } : null);
    },
  });
}
