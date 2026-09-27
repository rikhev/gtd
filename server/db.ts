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
    "status", "waiting_who", "waiting_since", "followup", "recurrence", "bring_back", "sort", "created_at", "completed_at",
  ],
  projects: ["id", "title", "outcome", "notes", "area_id", "status", "due", "bring_back", "sort", "created_at", "completed_at"],
  stuff: ["id", "text", "kind", "status", "created_at", "processed_at"],
  refs: ["id", "title", "notes", "project_id", "status", "created_at"],
  contexts: ["id", "name", "color", "sort"],
  areas: ["id", "name", "sort"],
  files: ["id", "name", "mime", "size", "preview", "owner_kind", "owner_id", "created_at"],
  rules: ["id", "text", "status", "created_at"],
  corrections: ["id", "stuff_text", "field", "proposed", "chosen", "used", "created_at"],
  reviews: ["id", "completed_at"],
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
CREATE TABLE IF NOT EXISTS areas (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  preview TEXT NOT NULL DEFAULT '', owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, text TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY, stuff_text TEXT NOT NULL, field TEXT NOT NULL, proposed TEXT NOT NULL,
  chosen TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, completed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS proposals (stuff_id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
`);

export const now = () => new Date().toISOString();

function seed() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM contexts").get() as { n: number };
  if (count.n > 0) return;
  const contexts: [string, string][] = [
    ["@computer", "#2f6fb5"],
    ["@phone", "#5b6b7e"],
    ["@errands", "#8a5a2b"],
    ["@home", "#b7791f"],
    ["@office", "#6b4fa0"],
    ["@agenda", "#0f8a8a"],
  ];
  const ins = db.prepare("INSERT INTO contexts (id, name, color, sort) VALUES (?, ?, ?, ?)");
  contexts.forEach(([name, color], i) => ins.run(randomUUID(), name, color, i));
  const insA = db.prepare("INSERT INTO areas (id, name, sort) VALUES (?, ?, ?)");
  ["Work", "Home", "Health", "Finance"].forEach((name, i) => insA.run(randomUUID(), name, i));
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
    rules: all("rules"),
    corrections: all("corrections"),
    reviews: all("reviews"),
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

export function insertRow(table: TableName, row: Record<string, unknown>) {
  const data = clean(table, row);
  const keys = Object.keys(data);
  db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(
    ...keys.map((k) => data[k]),
  );
}

export function patchRow(table: TableName, id: string, patch: Record<string, unknown>) {
  const data = clean(table, patch);
  delete data.id;
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

export function applyOps(ops: Op[]) {
  db.exec("BEGIN");
  try {
    for (const op of ops) {
      if (!(op.table in COLUMNS)) throw new Error(`Unknown table ${op.table}`);
      if (op.type === "create") insertRow(op.table, op.row);
      else if (op.type === "patch") patchRow(op.table, op.id, op.data);
      else if (op.type === "delete") deleteRow(op.table, op.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
