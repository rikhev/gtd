import { useSyncExternalStore } from "react";
import { routePath, routeView, setRoute } from "./route.ts";
import { isUnlocked, readSealedNotes, saveSealedNotes, useOpenedNotes } from "./lock.ts";
import { getState, mutate, plural } from "./store.ts";
import type { ID, Ref } from "../shared/types.ts";

/*
 * Reference lists (owner's request): a reference can be a list rather than a note, kept and edited like any list,
 * with nothing to tick (it is reference, not action). Its items are its notes, one a line, "## " marking a section
 * heading, so search, the export, ⌘Z and the lock work on a list as on any note, and switching between note and list
 * loses nothing.
 */

export type Line = { key: string; text: string; section: boolean };

const HEADING = /^#{1,6}\s+/;

/** A list's items, read from its notes: every line that has words; "## Shoes" is a section heading. */
export function linesOf(notes: string): Line[] {
  return notes
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => (HEADING.test(l) ? { key: `l${i}`, text: l.replace(HEADING, "").trim(), section: true } : { key: `l${i}`, text: l.trim(), section: false }));
}

/** Items back to notes. */
export const textOf = (lines: Pick<Line, "text" | "section">[]) => lines.map((l) => (l.section ? `## ${l.text}` : l.text)).join("\n");

/** How many items a list holds (section headings not counted). */
export const itemCount = (notes: string) => linesOf(notes).filter((l) => !l.section).length;

/**
 * A note read as a list: a line each, without the bullets, numbers or boxes it was typed with ("- ", "1.", "[ ]");
 * a Markdown heading, or a short line ending in a colon, becomes a section heading. Blank lines go.
 */
export function noteAsList(notes: string): string {
  return textOf(
    notes
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const heading = HEADING.test(line) || (/:$/.test(line) && line.length <= 60);
        let text = line
          .replace(HEADING, "")
          .replace(/^([-*•–]|\d+[.)])\s+/, "")
          .replace(/^\[[ xX]?\]\s*/, "")
          .trim();
        if (heading) text = text.replace(/:$/, "").trim();
        return { text, section: heading };
      })
      .filter((l) => l.text),
  );
}

/** Words added to a list: a line is one item; a pasted list, an item a line. */
export const linesFrom = (raw: string): Line[] => (raw.includes("\n") ? linesOf(noteAsList(raw)) : raw.trim() ? [{ key: "", text: raw.trim(), section: false }] : []);

/** Items added at the end of a list (the pane's add line, the phone's +); a locked list only while it is unlocked. */
export async function addToList(id: ID, raw: string) {
  const r = getState().refs.find((x) => x.id === id);
  const incoming = linesFrom(raw);
  if (!r || !incoming.length || (r.sealed && !isUnlocked())) return;
  const label = incoming.length === 1 ? `Added “${incoming[0].text}”` : `${plural(incoming.length, "item")} added`;
  const next = textOf([...linesOf(r.sealed ? await readSealedNotes(r) : r.notes), ...incoming]);
  if (r.sealed) void saveSealedNotes(r, next, label);
  else mutate(label, [{ type: "patch", table: "refs", id: r.id, data: { notes: next } }]);
}

/* ---------------- a reference's text, locked or not ---------------- */

/**
 * The text a reference holds, and the way to save it: its notes, or (locked) its notes opened with the lock's key and
 * saved encrypted. null while locked.
 */
export function useRefText(r: Ref): { text: string | null; save: (next: string, label?: string) => void } {
  const opened = useOpenedNotes(r);
  if (r.sealed) return { text: opened, save: (next, label = "Saved") => void saveSealedNotes(r, next, label) };
  return { text: r.notes, save: (next, label = "Saved") => mutate(label, [{ type: "patch", table: "refs", id: r.id, data: { notes: next } }]) };
}

/* ---------------- which list is open ---------------- */

/**
 * Reference has two levels, as Checklists has: every reference, and one list across the whole width, to keep up with
 * the list's keys. The open one has its own address (/reference/<id>), so Back and Forward step between them.
 */
const listeners = new Set<() => void>();
const fromPath = () => {
  const m = /^reference\/(.+)$/.exec(routePath());
  return m ? decodeURIComponent(m[1]) : null;
};
let open: ID | null = typeof window === "undefined" ? null : fromPath();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (routeView() !== "reference") return;
    const id = fromPath();
    if (id !== open) {
      open = id;
      emit();
    }
  });
}
export function useOpenRefList(): ID | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
export function openRefList(id: ID | null, history = true) {
  if (id === open) return;
  open = id;
  if (history) setRoute(id ? `reference/${encodeURIComponent(id)}` : "reference");
  emit();
}
