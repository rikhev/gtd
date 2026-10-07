import { getState, mutate, quote, stamp, uid } from "./store.ts";
import type { UI } from "./ui.tsx";
import { today } from "../shared/dates.ts";
import type { ID, Op, Ref, State } from "../shared/types.ts";

/*
 * Notes linked by title (owner's decision after the Reference critique: links and projects organise the notes, no
 * folders). [[Title]] in a note's text links to the note of that title; renaming a note rewrites the links to it, so
 * nothing has to be kept up by hand. A link to a title no note has yet makes that note when it is followed.
 */

const LINK = /(!?)\[\[([^\]\n|]+)(\|[^\]\n]*)?\]\]/g;
const norm = (t: string) => t.trim().toLowerCase();

/** The notes a reference's text links to, by title as written. */
export function linksIn(text: string): string[] {
  return [...text.matchAll(LINK)].filter((m) => !m[1]).map((m) => m[2].trim());
}

/** The active note of a title (case aside), if there is one. */
export function noteByTitle(s: State, title: string): Ref | undefined {
  const t = norm(title);
  return s.refs.find((r) => r.status === "active" && norm(r.title) === t);
}

/** The notes that link to this one (locked notes can't be read, so they never show). */
export function backlinks(s: State, r: Ref): Ref[] {
  const t = norm(r.title);
  if (!t) return [];
  return s.refs
    .filter((x) => x.id !== r.id && x.status === "active" && !x.sealed && x.notes.includes("[[") && linksIn(x.notes).some((l) => norm(l) === t))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
}

/** The line of a note's text where it links to a title: the backlink shows it, so you see why. */
export function linkContext(text: string, title: string): string {
  const t = norm(title);
  const line = text.split("\n").find((l) => linksIn(l).some((x) => norm(x) === t)) ?? "";
  return plainLine(line);
}

/**
 * Renames a note and every link to it, as one ⌘Z. Returns the ops (empty when nothing changes), so a caller can fold
 * them into a step of its own.
 */
export function renameOps(s: State, r: Ref, title: string): Op[] {
  const next = title.trim();
  if (next === r.title) return [];
  const ops: Op[] = [{ type: "patch", table: "refs", id: r.id, data: { title: next } }];
  const old = norm(r.title);
  // A rename that only changes case keeps the links as written; they still match.
  if (!old || !next || old === norm(next)) return ops;
  for (const x of s.refs) {
    if (x.sealed || x.status !== "active" || !x.notes.includes("[[")) continue;
    let changed = false;
    const notes = x.notes.replace(LINK, (all, bang: string, target: string, alias: string | undefined) => {
      if (bang || norm(target) !== old) return all;
      changed = true;
      return `[[${next}${alias ?? ""}]]`;
    });
    if (changed) ops.push({ type: "patch", table: "refs", id: x.id, data: { notes } });
  }
  return ops;
}
export function renameNote(r: Ref, title: string) {
  const ops = renameOps(getState(), r, title);
  if (!ops.length) return;
  const links = ops.length - 1;
  mutate(`Renamed ${quote(title)}${links ? `, ${links === 1 ? "1 link" : `${links} links`} to it updated` : ""}`, ops);
}

/* ---------------- making and opening notes ---------------- */

/*
 * A note is an item like any other (owner's decision: Reference is a list, and a note's text is written in the
 * details pane, at the pane's one width): opening one puts the list's cursor on it and its details in the pane, the
 * cursor in its text when it is to be written in.
 */
type Opener = Pick<UI, "reveal" | "openDetail">;

/** Where the pane's cursor goes when a note opens: into its text (at the start or the end), or nowhere (reading). */
export type NoteFocus = "notes" | "end" | "none";
let focusAsked: { id: ID; at: NoteFocus } | null = null;
/** Read by the note's text field once it is drawn (a field drawn twice in a row reads it both times). */
export function takeNoteFocus(id: ID): NoteFocus | null {
  if (focusAsked?.id !== id) return null;
  const at = focusAsked.at;
  window.setTimeout(() => focusAsked?.id === id && (focusAsked = null), 0);
  return at;
}

/** Opens a note: Reference, the cursor on its row, its details in the pane. */
export function showNote(ui: Opener, id: ID, at: NoteFocus = "none") {
  focusAsked = { id, at };
  ui.reveal({ kind: "ref", id });
  ui.openDetail({ kind: "ref", id }, true);
}

/** A new note with a title (a link followed to a note not yet written, today's note), opened to be written in. */
export function newNote(ui: Opener, title: string): ID {
  const id = uid();
  mutate(`New note ${quote(title)}`, [{ type: "create", table: "refs", row: { id, title, notes: "", project_id: null, status: "active", created_at: stamp(), form: null } }]);
  showNote(ui, id, "notes");
  return id;
}

/** Follows [[Title]]: to that note, or a new note of that title when there is none yet. */
export function followNote(ui: Opener, title: string) {
  const r = noteByTitle(getState(), title);
  if (r) showNote(ui, r.id);
  else newNote(ui, title.trim());
}

/** Today's note, titled with the day (ISO, as every date is): opened at its end to add to, or made the first time. */
export function openTodayNote(ui: Opener) {
  const r = noteByTitle(getState(), today());
  if (r) showNote(ui, r.id, "end");
  else newNote(ui, today());
}

/* ---------------- how a note reads in a list ---------------- */

/** A line without its Markdown: no heading or list marks, boxes, quote marks, bold stars or link brackets. */
export function plainLine(line: string): string {
  return line
    .replace(/^\s*(#{1,6}\s+|>\s?|([-*+]|\d{1,3}[.)])\s+)/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/!\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/(\*\*?)(\S[^*]*?\S|\S)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** The first line of a note that has words, as it reads (the list's grey line after the title); a heading that only
 * repeats the title is passed over. */
export function firstLine(notes: string, title = ""): string {
  const t = norm(title);
  for (const l of notes.split("\n")) {
    if (/^\s*```/.test(l)) continue;
    const p = plainLine(l);
    if (p && norm(p) !== t) return p;
  }
  return "";
}

/**
 * Where the words were found in a text: the line holding the first of them, trimmed to about `room` characters around
 * it, so a search hit shows why it matched.
 */
export function excerpt(text: string, words: string[], room = 90): string {
  const lines = text.split("\n").map(plainLine).filter(Boolean);
  for (const w of words) {
    const line = lines.find((l) => l.toLowerCase().includes(w));
    if (!line) continue;
    if (line.length <= room) return line;
    const i = line.toLowerCase().indexOf(w);
    let from = Math.max(0, Math.min(i - Math.floor(room / 3), line.length - room));
    // Start and end on whole words.
    if (from > 0) from = Math.min(i, line.indexOf(" ", from) + 1 || from);
    let to = Math.min(line.length, from + room);
    if (to < line.length) to = Math.max(i + w.length, line.lastIndexOf(" ", to));
    return `${from > 0 ? "…" : ""}${line.slice(from, to).trim()}${to < line.length ? "…" : ""}`;
  }
  return "";
}

/** Words in a note, for its page's heading ("312 words"). */
export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** A–Z the way people read titles: numbers in order ("Item 2" before "Item 11"), case aside. */
export const byTitle = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
