import { getState, mutate, notify, plural, stamp, uid, upload } from "./store.ts";
import { noteByTitle } from "./notes.ts";
import type { ID, Op } from "../shared/types.ts";

/*
 * Notes brought in from another notes app (owner's request after the Reference critique: Reference replaces OneNote
 * and Obsidian). Markdown files, or a whole folder of them (an Obsidian vault): each file becomes a note titled by its
 * name, its text kept as written. What the app reads differently is put the way it reads it:
 * - the properties block at the top (--- … ---) goes, its tags kept as a last line;
 * - [[Note#Heading]], [[folder/Note]] and [[Note|words]] link to the note by its title;
 * - a picture or file it shows (![[photo.png]], ![words](photo.png)) is attached to the note and shown as ![[photo.png]],
 *   when it is among the files chosen.
 * Folders aren't kept: notes are found by title, words and links here, not by where they were filed.
 * The notes come in as one step, so ⌘Z takes the whole import back (their attached files stay in the Trash's way).
 */

const MD = /\.(md|markdown)$/i;
const SKIP = /(^|\/)\.(obsidian|trash|git)\//;
const pathOf = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
const base = (p: string) => p.split("/").pop() ?? p;

/** The properties block, read for its tags (a list or one line), and the text after it. */
function splitFront(text: string): { body: string; tags: string[] } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { body: text, tags: [] };
  const tags: string[] = [];
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = /^tags:\s*(.*)$/i.exec(lines[i]);
    if (!t) continue;
    if (t[1].trim()) tags.push(...t[1].replace(/[[\]]/g, "").split(/[,\s]+/));
    else for (let j = i + 1; j < lines.length && /^\s*-\s+/.test(lines[j]); j++) tags.push(lines[j].replace(/^\s*-\s+/, ""));
  }
  return { body: text.slice(m[0].length), tags: tags.map((x) => x.trim().replace(/^#/, "")).filter(Boolean) };
}

export async function importNotes(list: FileList | File[]) {
  const all = Array.from(list).filter((f) => !SKIP.test(pathOf(f)));
  const mds = all.filter((f) => MD.test(f.name));
  if (!mds.length) return notify("No Markdown files there: notes come in from .md files", { tone: "error" });
  // Everything else chosen, by its name, for the pictures and files the notes show.
  const assets = new Map<string, File>();
  for (const f of all) if (!MD.test(f.name)) assets.set(f.name.toLowerCase(), f);
  notify(`Bringing in ${plural(mds.length, "note")}…`);

  const s = getState();
  const taken = new Set(s.refs.filter((r) => r.status === "active").map((r) => r.title.trim().toLowerCase()));
  const ops: Op[] = [];
  const attach: { id: ID; files: File[] }[] = [];
  const at = stamp();
  for (const f of mds.sort((a, b) => pathOf(a).localeCompare(pathOf(b)))) {
    let title = base(pathOf(f)).replace(MD, "").trim() || "Untitled";
    // A title already here gets a number, so the notes stay apart.
    if (taken.has(title.toLowerCase()) || noteByTitle(s, title)) {
      let n = 2;
      while (taken.has(`${title} (${n})`.toLowerCase())) n++;
      title = `${title} (${n})`;
    }
    taken.add(title.toLowerCase());
    const { body, tags } = splitFront((await f.text()).replace(/\r\n?/g, "\n"));
    const files: File[] = [];
    const want = (name: string) => {
      const a = assets.get(base(decodeURIComponent(name)).toLowerCase());
      if (a && !files.includes(a)) files.push(a);
      return a;
    };
    let notes = body
      // ![[photo.png|300]] or ![[folder/photo.png]]: the file, by its name.
      .replace(/!\[\[([^\]|#\n]+)(?:[#|][^\]\n]*)?\]\]/g, (all, name: string) => (want(name.trim()) ? `![[${base(name.trim())}]]` : all))
      // ![words](folder/photo.png): the same, when it is a file chosen (a web address stays as it is).
      .replace(/!\[[^\]\n]*\]\((?!https?:)([^)\n]+)\)/g, (all, path: string) => (want(path.trim().replace(/^<|>$/g, "")) ? `![[${base(decodeURIComponent(path.trim().replace(/^<|>$/g, "")))}]]` : all))
      // [[folder/Note#Heading|words]] links to the note "Note".
      .replace(/(?<!!)\[\[([^\]|\n]+?)(#[^\]|\n]*)?(\|[^\]\n]*)?\]\]/g, (_all, target: string, _h, alias: string | undefined) => `[[${base(target.trim())}${alias ?? ""}]]`)
      .trim();
    if (tags.length) notes += `${notes ? "\n\n" : ""}Tags: ${tags.map((t) => `#${t}`).join(" ")}`;
    const id = uid();
    ops.push({ type: "create", table: "refs", row: { id, title, notes, project_id: null, status: "active", created_at: at, form: null } });
    if (files.length) attach.push({ id, files });
  }

  // In batches the server takes comfortably, folded into one step.
  const key = `import:${uid()}`;
  for (let i = 0; i < ops.length; i += 200) {
    const ok = await mutate(`Imported ${plural(mds.length, "note")}`, ops.slice(i, i + 200), { silent: true, key, join: key });
    if (!ok) return;
  }
  for (const a of attach) await upload(a.files, { kind: "ref", id: a.id });
  const pics = attach.reduce((n, a) => n + a.files.length, 0);
  notify(`Imported ${plural(mds.length, "note")}${pics ? ` and ${plural(pics, "file")} they show` : ""}`, { undo: true });
}
