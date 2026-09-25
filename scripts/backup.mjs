// Nightly backup: a consistent SQLite snapshot plus uploaded files and login settings.
// Keeps the newest 14. Run as the service user: node scripts/backup.mjs
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DATA = process.env.GTD_DATA_DIR ?? "data";
const OUT = process.env.GTD_BACKUP_DIR ?? `${DATA}/backups`;
const KEEP = Number(process.env.GTD_BACKUP_KEEP ?? 14);
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const dir = `${OUT}/gtd-${stamp}`;
mkdirSync(dir, { recursive: true, mode: 0o700 });

// VACUUM INTO writes a consistent copy even while the app is running.
new DatabaseSync(`${DATA}/gtd.sqlite`).exec(`VACUUM INTO '${dir}/gtd.sqlite'`);
if (existsSync(`${DATA}/auth.json`)) copyFileSync(`${DATA}/auth.json`, `${dir}/auth.json`);
if (existsSync(`${DATA}/files`)) execFileSync("tar", ["-czf", `${dir}/files.tar.gz`, "-C", DATA, "files"]);

const old = readdirSync(OUT)
  .filter((n) => n.startsWith("gtd-"))
  .sort()
  .reverse()
  .slice(KEEP);
for (const n of old) rmSync(`${OUT}/${n}`, { recursive: true, force: true });
console.log(`Backup written to ${dir}${old.length ? ` · removed ${old.length} old` : ""}`);
