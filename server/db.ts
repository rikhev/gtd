import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Op, State, TableName } from "../shared/types.ts";

export const DATA_DIR = process.env.GTD_DATA_DIR ?? "data";
export const FILES_DIR = `${DATA_DIR}/files`;
mkdirSync(FILES_DIR, { recursive: true });

export const db = new DatabaseSync(`${DATA_DIR}/gtd.sqlite`);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;");

/** Column lists double as the write whitelist for generic ops. */
export const COLUMNS: Record<TableName, string[]> = {
  actions: [
    "id", "title", "notes", "project_id", "context_id", "due", "defer", "time_min", "energy", "flagged",
    "status", "waiting_who", "waiting_since", "followup", "recurrence", "bring_back", "sort", "created_at", "completed_at", "updated_at",
    "done_from", "archived_at", "trashed_at", "trashed_from", "person",
  ],
  projects: ["id", "title", "outcome", "notes", "area_id", "status", "due", "bring_back", "sort", "created_at", "completed_at", "archived_at", "trashed_at", "trashed_from", "start"],
  stuff: ["id", "text", "kind", "status", "created_at", "processed_at", "trashed_at", "trashed_from"],
  refs: ["id", "title", "notes", "project_id", "status", "created_at", "trashed_at", "trashed_from", "updated_at"],
  contexts: ["id", "name", "color", "sort"],
  areas: ["id", "name", "sort", "color"],
  files: ["id", "name", "mime", "size", "preview", "owner_kind", "owner_id", "created_at"],
  reviews: ["id", "completed_at"],
  appointments: ["id", "project_id", "title", "date", "time", "end_time", "feed", "created_at"],
  checklists: ["id", "title", "notes", "area_id", "status", "sort", "created_at", "updated_at", "finished_at", "trashed_at", "trashed_from", "repeats", "project_id"],
  checklist_items: ["id", "checklist_id", "title", "section", "checked_at", "sort", "created_at"],
  checklist_ticks: ["id", "item_id", "checklist_id", "day", "created_at"],
};

db.exec(`
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  project_id TEXT, context_id TEXT, due TEXT, defer TEXT, time_min INTEGER, energy INTEGER,
  flagged INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'next',
  waiting_who TEXT, waiting_since TEXT, followup TEXT, recurrence TEXT, bring_back TEXT,
  sort REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  area_id TEXT, status TEXT NOT NULL DEFAULT 'active', due TEXT, bring_back TEXT,
  sort REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS stuff (
  id TEXT PRIMARY KEY, text TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'inbox', created_at TEXT NOT NULL, processed_at TEXT
);
CREATE TABLE IF NOT EXISTS refs (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  project_id TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS areas (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort REAL NOT NULL DEFAULT 0, color TEXT);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  preview TEXT NOT NULL DEFAULT '', owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, completed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', date TEXT NOT NULL,
  time TEXT, end_time TEXT, feed TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', area_id TEXT,
  status TEXT NOT NULL DEFAULT 'active', sort REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  updated_at TEXT, finished_at TEXT, trashed_at TEXT, trashed_from TEXT
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY, checklist_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', section INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT, sort REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist_ticks (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, checklist_id TEXT NOT NULL, day TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// "Last touched": when an action was last edited or completed. Older databases get the column,
// backfilled with the best date we have (completed, else created).
if (!(db.prepare("PRAGMA table_info(actions)").all() as { name: string }[]).some((c) => c.name === "updated_at")) {
  db.exec("ALTER TABLE actions ADD COLUMN updated_at TEXT");
}
db.exec("UPDATE actions SET updated_at = COALESCE(completed_at, created_at) WHERE updated_at IS NULL");

// Done stays on its list until archived, as in classic Outlook: an action remembers the list it was done
// from, and archiving moves it to Done. When the columns first appear, everything already done counts as
// archived (it was already in Done), once; after that a done, unarchived action stays on its list.
if (!(db.prepare("PRAGMA table_info(actions)").all() as { name: string }[]).some((c) => c.name === "archived_at")) {
  db.exec("ALTER TABLE actions ADD COLUMN done_from TEXT");
  db.exec("ALTER TABLE actions ADD COLUMN archived_at TEXT");
  db.exec("UPDATE actions SET archived_at = COALESCE(completed_at, created_at) WHERE status = 'done'");
}
// Completed projects likewise stay on Projects, struck through, until archived; the ones finished before that are archived once.
if (!(db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).some((c) => c.name === "archived_at")) {
  db.exec("ALTER TABLE projects ADD COLUMN archived_at TEXT");
  db.exec("UPDATE projects SET archived_at = COALESCE(completed_at, created_at) WHERE status = 'done'");
}
// Deleted items are kept (the Trash) until the keep period runs out: each remembers when it was deleted and
// the status it had, so it can be put back. Anything already deleted gets the full period from now, once.
for (const t of ["actions", "projects", "stuff", "refs"]) {
  if (!(db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === "trashed_at")) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN trashed_at TEXT`);
    db.exec(`ALTER TABLE ${t} ADD COLUMN trashed_from TEXT`);
    db.prepare(`UPDATE ${t} SET trashed_at = ? WHERE status = 'trashed'`).run(new Date().toISOString());
  }
}
// References remember when they were last changed; until then, that is when they were filed.
if (!(db.prepare("PRAGMA table_info(refs)").all() as { name: string }[]).some((c) => c.name === "updated_at")) {
  db.exec("ALTER TABLE refs ADD COLUMN updated_at TEXT");
  db.exec("UPDATE refs SET updated_at = created_at");
}
// Projects can start on a date, so the calendar draws them as a bar from start to due.
if (!(db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).some((c) => c.name === "start")) {
  db.exec("ALTER TABLE projects ADD COLUMN start TEXT");
}
// Agendas: an action can name the person it is for (raise it with them, call them, send them something), so each
// person's agenda gathers it with what they owe you.
if (!(db.prepare("PRAGMA table_info(actions)").all() as { name: string }[]).some((c) => c.name === "person")) {
  db.exec("ALTER TABLE actions ADD COLUMN person TEXT");
}
// Areas carry a colour, shown only in their "#". Existing areas take the palette in their order, once.
if (!(db.prepare("PRAGMA table_info(areas)").all() as { name: string }[]).some((c) => c.name === "color")) {
  db.exec("ALTER TABLE areas ADD COLUMN color TEXT");
  const palette = ["#2f6fb5", "#0e8181", "#8a5a2b", "#6b4fa0", "#a3476e", "#9f691b", "#5b6b2e", "#5b6b7e"];
  const rows = db.prepare("SELECT id FROM areas ORDER BY sort").all() as { id: string }[];
  const set = db.prepare("UPDATE areas SET color = ? WHERE id = ?");
  rows.forEach((r, i) => set.run(palette[i % palette.length], r.id));
}
// Teal and Ochre were darkened so the white "@" or "#" on them reads (4.5:1, after the critique): contexts and areas
// that already carry the old values take the new ones. Runs every start and changes nothing once done.
for (const [was, now] of [["#0f8a8a", "#0e8181"], ["#b7791f", "#9f691b"]]) {
  for (const t of ["contexts", "areas"]) db.prepare(`UPDATE ${t} SET color = ? WHERE lower(color) = ?`).run(now, was);
}

// Checklists can repeat (habits): every day or every week.
if (!(db.prepare("PRAGMA table_info(checklists)").all() as { name: string }[]).some((c) => c.name === "repeats")) {
  db.exec("ALTER TABLE checklists ADD COLUMN repeats TEXT");
}
// A checklist can support a project, as a reference can.
if (!(db.prepare("PRAGMA table_info(checklists)").all() as { name: string }[]).some((c) => c.name === "project_id")) {
  db.exec("ALTER TABLE checklists ADD COLUMN project_id TEXT");
}

/** Owner preferences kept on the server (so every browser agrees). */
export function getSetting(key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}
export function setSetting(key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export const now = () => new Date().toISOString();

function seed() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM contexts").get() as { n: number };
  if (count.n > 0) return;
  const contexts: [string, string][] = [
    ["@computer", "#2f6fb5"],
    ["@phone", "#5b6b7e"],
    ["@errands", "#8a5a2b"],
    ["@home", "#9f691b"],
    ["@office", "#6b4fa0"],
    ["@agenda", "#0e8181"],
  ];
  const ins = db.prepare("INSERT INTO contexts (id, name, color, sort) VALUES (?, ?, ?, ?)");
  contexts.forEach(([name, color], i) => ins.run(randomUUID(), name, color, i));
  const insA = db.prepare("INSERT INTO areas (id, name, sort, color) VALUES (?, ?, ?, ?)");
  ([["Work", "#2f6fb5"], ["Home", "#0e8181"], ["Health", "#8a5a2b"], ["Finance", "#6b4fa0"]] as const).forEach(([name, color], i) => insA.run(randomUUID(), name, i, color));
}
seed();

// The project title is the outcome; any text left in the old separate outcome field moves into the notes once.
db.exec(`UPDATE projects
  SET notes = CASE WHEN trim(notes) = '' THEN 'Outcome: ' || outcome ELSE 'Outcome: ' || outcome || char(10) || char(10) || notes END,
      outcome = ''
  WHERE trim(outcome) <> ''`);

// Actions back on Next or Someday no longer wait on anyone; clear what earlier versions left behind.
db.exec(`UPDATE actions SET waiting_who = NULL, waiting_since = NULL, followup = NULL
  WHERE status IN ('next', 'someday') AND (waiting_who IS NOT NULL OR waiting_since IS NOT NULL OR followup IS NOT NULL)`);

// Red belongs to trouble (overdue, stalled, errors), so contexts no longer use it.
db.exec(`UPDATE contexts SET color = '#5b6b7e' WHERE lower(color) = '#c0392b'`);
// Green belongs to the "on track" lamp, so contexts no longer use it either.
db.exec(`UPDATE contexts SET color = '#8a5a2b' WHERE lower(color) = '#1f8a4c'`);

export function loadState(): State {
  const all = <T,>(t: string) => db.prepare(`SELECT * FROM ${t}`).all() as T[];
  return {
    actions: all("actions"),
    projects: all("projects"),
    stuff: all("stuff"),
    refs: all("refs"),
    contexts: all("contexts"),
    areas: all("areas"),
    files: all("files"),
    reviews: all("reviews"),
    appointments: all("appointments"),
    checklists: all("checklists"),
    checklist_items: all("checklist_items"),
    checklist_ticks: all("checklist_ticks"),
  };
}

function clean(table: TableName, data: Record<string, unknown>) {
  const cols = COLUMNS[table];
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!cols.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number | null);
  }
  return out;
}

/** An action counts as touched by any change except a pure reorder. */
function touch(table: TableName, data: Record<string, string | number | null>) {
  if ((table !== "actions" && table !== "refs") || "updated_at" in data) return;
  if (Object.keys(data).every((k) => k === "sort" || k === "id")) return;
  // Deleting or restoring a reference is not an edit of it.
  if (table === "refs" && Object.keys(data).every((k) => ["sort", "id", "status", "trashed_at", "trashed_from"].includes(k))) return;
  data.updated_at = now();
}

export function insertRow(table: TableName, row: Record<string, unknown>) {
  const data = clean(table, row);
  touch(table, data);
  const keys = Object.keys(data);
  db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(
    ...keys.map((k) => data[k]),
  );
}

export function patchRow(table: TableName, id: string, patch: Record<string, unknown>) {
  const data = clean(table, patch);
  delete data.id;
  touch(table, data);
  const keys = Object.keys(data);
  if (!keys.length) return;
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
    ...keys.map((k) => data[k]),
    id,
  );
}

export function deleteRow(table: TableName, id: string) {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

const TRASHABLE = new Set(["actions", "projects", "stuff", "refs", "checklists"]);

/**
 * Deleting is a status: when a row turns "trashed" it records when (one time for the whole batch, so a project
 * and the actions deleted with it share it) and what it was; any other status clears both.
 */
function stampTrash(table: TableName, id: string, data: Record<string, unknown>, at: string) {
  if (!TRASHABLE.has(table) || !("status" in data) || "trashed_at" in data) return data;
  const cur = db.prepare(`SELECT status FROM ${table} WHERE id = ?`).get(id) as { status: string } | undefined;
  if (data.status === "trashed") {
    if (cur?.status === "trashed") return data;
    return { ...data, trashed_at: at, trashed_from: cur?.status ?? null };
  }
  return { ...data, trashed_at: null, trashed_from: null };
}

export function applyOps(ops: Op[]) {
  const at = now();
  db.exec("BEGIN");
  try {
    for (const op of ops) {
      if (!(op.table in COLUMNS)) throw new Error(`Unknown table ${op.table}`);
      if (op.type === "create") insertRow(op.table, op.row.status === "trashed" && !op.row.trashed_at && TRASHABLE.has(op.table) ? { ...op.row, trashed_at: at } : op.row);
      else if (op.type === "patch") patchRow(op.table, op.id, stampTrash(op.table, op.id, op.data, at));
      else if (op.type === "delete") deleteRow(op.table, op.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
