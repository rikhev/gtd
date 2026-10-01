import { useSyncExternalStore } from "react";
import type { UI } from "./ui.tsx";
import type { Action } from "../shared/types.ts";
import { getState, onHold } from "./store.ts";
import { today } from "../shared/dates.ts";

/**
 * What fits now (GTD's engage step, Allen's four criteria in his order: where you are, how much time you have, how much
 * energy, then priority, which stays your own judgement). Kept outside the list so the view heading, its count and the
 * list all read the same filter. It is for the moment: it lapses at the end of the day, so a stale one never hides
 * tomorrow's list. Time and energy were added after the second GTD critique (owner's decision, reversing context-only).
 */
export interface Fit {
  /** The contexts where you are (ids); empty is anywhere. */
  where: string[];
  /** Minutes you have; an action estimated longer doesn't fit. Null or absent: any length. */
  minutes?: number | null;
  /** The energy you have (1 low, 2 medium, 3 high); an action needing more doesn't fit. Null or absent: any. */
  energy?: 1 | 2 | 3 | null;
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
  // A filter that asks nothing is no filter.
  current = f && (f.where.length || f.minutes || f.energy) ? f : null;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* no storage: the filter lasts this session */
  }
  listeners.forEach((l) => l());
}

const read = () => (current && current.day === today() && (current.where?.length || current.minutes || current.energy) ? current : null);

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
/**
 * Whether an action can be done now: in a place you are, within the time you have, at the energy you have. An action
 * without an estimate or an energy counts as fitting those. A chase has no place of its own, so it always fits.
 */
export function fits(a: Action, f: Fit): FitVerdict {
  if (a.status !== "next") return "fits";
  if (f.where.length && !f.where.includes(a.context_id ?? "")) return "elsewhere";
  if (f.minutes && a.time_min && a.time_min > f.minutes) return "elsewhere";
  if (f.energy && a.energy && a.energy > f.energy) return "elsewhere";
  return "fits";
}

const ENERGY = { 1: "low energy", 2: "medium energy", 3: "high energy" } as const;
const minutesLabel = (m: number) => (m >= 60 ? `${m / 60} h` : `${m} min`);

/** "@computer · 30 min · low energy", or "anywhere". */
export const fitLabel = (f: Fit) => {
  const places = f.where
    .map((id) => getState().contexts.find((c) => c.id === id)?.name ?? "")
    .filter(Boolean)
    .map((n) => (n.startsWith("@") ? n : `@${n}`))
    .join(", ");
  return [places || (f.minutes || f.energy ? "anywhere" : ""), f.minutes ? minutesLabel(f.minutes) : "", f.energy ? ENERGY[f.energy] : ""].filter(Boolean).join(" · ") || "anywhere";
};

/**
 * F: where are you? (⇧↵ adds another place). That is all F asks (owner's decision: faithful, but no routine admin);
 * time and energy, Allen's next two questions, are there when wanted, from the View menu and ⌘K (askTime, askEnergy).
 */
export function openFit(ui: UI, chosen: string[] = read()?.where ?? [], at: string | null = null) {
  const prev = read();
  const ctxs = getState().contexts;
  const open = (id: string) => getState().actions.filter((a) => a.status === "next" && !onHold(a) && a.context_id === id).length;
  const toggle = (cid: string) => (chosen.includes(cid) ? chosen.filter((x) => x !== cid) : [...chosen, cid]);
  const then = (where: string[]) => setFit({ where, minutes: prev?.minutes ?? null, energy: prev?.energy ?? null, day: today() });
  ui.openPicker({
    type: "list",
    title: "Where are you?",
    placeholder: "Pick a place · ⇧↵ adds another",
    items: [
      { id: "off", label: "Anywhere", hint: chosen.length ? "Clear" : "Every context" },
      ...(prev ? [{ id: "clear", label: "Show every next action", hint: "Clear the filter" }] : []),
      ...ctxs
        .filter((c) => open(c.id) > 0 || chosen.includes(c.id))
        .map((c) => ({ id: `c:${c.id}`, label: c.name.startsWith("@") ? c.name : `@${c.name}`, hint: chosen.includes(c.id) ? "Here" : String(open(c.id)) })),
    ],
    highlight: at,
    onPick: (id) => {
      if (!id) return;
      if (id === "clear") return setFit(null);
      then(id === "off" ? [] : [id.slice(2)]);
    },
    onPickMore: (id) => {
      if (id === "off" || id === "clear") return then([]);
      const next = toggle(id.slice(2));
      setFit({ where: next, minutes: prev?.minutes ?? null, energy: prev?.energy ?? null, day: today() });
      window.setTimeout(() => openFit(ui, next, id));
    },
  });
}

/** How long do you have? Narrows What fits now to actions that fit the time (⌘K, View menu). */
export function askTime(ui: UI) {
  const f = read();
  const fitting = (m: number | null) => getState().actions.filter((a) => a.status === "next" && !onHold(a) && fits(a, { where: f?.where ?? [], minutes: m, energy: f?.energy ?? null, day: today() }) === "fits").length;
  ui.openPicker({
    type: "list",
    title: "How long do you have?",
    items: [
      { id: "0", label: "Any length", hint: `${fitting(null)} fit` },
      ...[15, 30, 60, 120].map((m) => ({ id: String(m), label: minutesLabel(m), hint: `${fitting(m)} fit` })),
    ],
    current: f?.minutes ? String(f.minutes) : "0",
    onPick: (id) => {
      if (id === null) return;
      setFit({ where: f?.where ?? [], minutes: Number(id) || null, energy: f?.energy ?? null, day: today() });
    },
  });
}

/** How is your energy? Narrows What fits now to actions you have the energy for (⌘K, View menu). */
export function askEnergy(ui: UI) {
  const f = read();
  const fitting = (e: 1 | 2 | 3 | null) => getState().actions.filter((a) => a.status === "next" && !onHold(a) && fits(a, { where: f?.where ?? [], minutes: f?.minutes ?? null, energy: e, day: today() }) === "fits").length;
  ui.openPicker({
    type: "list",
    title: "How is your energy?",
    items: [
      { id: "0", label: "Any", hint: `${fitting(null)} fit` },
      { id: "1", label: "Low", hint: `${fitting(1)} fit` },
      { id: "2", label: "Medium", hint: `${fitting(2)} fit` },
      { id: "3", label: "High", hint: `${fitting(3)} fit` },
    ],
    current: f?.energy ? String(f.energy) : "0",
    onPick: (id) => {
      if (id === null) return;
      setFit({ where: f?.where ?? [], minutes: f?.minutes ?? null, energy: (Number(id) || null) as 1 | 2 | 3 | null, day: today() });
    },
  });
}
