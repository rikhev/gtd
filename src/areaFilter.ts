import { useSyncExternalStore } from "react";
import type { UI } from "./ui.tsx";
import { areaLabel, getState } from "./store.ts";

/**
 * Projects narrowed to one or more areas of focus (F on Projects). Kept outside the list so the view heading, its
 * count and the list all read the same filter. Unlike What fits now it is a way of looking at the work, not a
 * moment, so it stays until it is cleared. "none" stands for projects without an area.
 */
const KEY = "gtd:projects:areas";
const listeners = new Set<() => void>();
let current: string[] = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
})();

export function setAreaFilter(ids: string[]) {
  current = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* no storage: the filter lasts this session */
  }
  listeners.forEach((l) => l());
}

// An area deleted since it was chosen drops out; when none is left, nothing is filtered.
let last: string[] | null = null;
const read = () => {
  const areas = getState().areas;
  const live = current.filter((id) => id === "none" || areas.some((a) => a.id === id));
  if (!live.length) return null;
  // The same array while nothing changed, as useSyncExternalStore asks.
  if (last && last.length === live.length && last.every((id, i) => id === live[i])) return last;
  return (last = live);
};

/** The areas Projects is narrowed to, or null for every area. */
export function useAreaFilter(): string[] | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}

export const inAreas = (areaId: string | null, ids: string[]) => ids.includes(areaId ?? "none");

export const areaFilterLabel = (ids: string[]) =>
  ids.map((id) => (id === "none" ? "No area" : areaLabel(getState().areas.find((a) => a.id === id)?.name ?? ""))).join(", ");

/** F on Projects: tick one or more areas (the picker comes back after each), then Show; Every area clears it. */
export function openAreaFilter(ui: UI, chosen: string[] = read() ?? []) {
  const on = read();
  const { areas, projects } = getState();
  const count = (id: string) => projects.filter((p) => ["active", "someday"].includes(p.status) && (p.area_id ?? "none") === id).length;
  ui.openPicker({
    type: "list",
    title: "Which areas?",
    items: [
      ...(on ? [{ id: "off", label: "Show every area", hint: "Clear" }] : []),
      { id: "go", label: chosen.length ? `Show ${chosen.length === 1 ? "this area" : `these ${chosen.length}`}` : "Every area", hint: chosen.length ? "" : "No filter" },
      ...areas
        .slice()
        .sort((a, b) => a.sort - b.sort)
        .map((a) => ({ id: `a:${a.id}`, label: areaLabel(a.name), color: a.color ?? undefined, hint: chosen.includes(a.id) ? "Shown" : String(count(a.id)) })),
      ...(count("none") || chosen.includes("none") ? [{ id: "a:none", label: "No area", hint: chosen.includes("none") ? "Shown" : String(count("none")) }] : []),
    ],
    onPick: (id) => {
      if (!id) return;
      if (id === "off") return setAreaFilter([]);
      if (id.startsWith("a:")) {
        const aid = id.slice(2);
        const next = chosen.includes(aid) ? chosen.filter((x) => x !== aid) : [...chosen, aid];
        return void window.setTimeout(() => openAreaFilter(ui, next));
      }
      setAreaFilter(chosen);
    },
  });
}
