import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { applyOps, db, FILES_DIR, getSetting, insertRow, loadState, now, patchRow, setSetting } from "./db.ts";
import { extract, guessMime, looksLikeEmail } from "./extract.ts";
import { exportJson, exportZip } from "./export.ts";
import { authRequired, guard, login, logout, me, readAuth } from "./auth.ts";
import { addFeed, eventsBetween, feedInfo, probe, removeFeed, syncAll, takeLinkNotes, updateFeed, validZone } from "./calendar.ts";
import { today } from "../shared/dates.ts";
import type { FileRow, Op } from "../shared/types.ts";

const app = new Hono();

app.use("*", guard);
app.get("/api/auth/me", me);
app.post("/api/auth/login", login);
app.post("/api/auth/logout", (c) => logout(c));
app.post("/api/auth/logout-all", (c) => logout(c, true));

/**
 * Tickler: on its bring-back date an item comes back for a fresh decision, as GTD's tickler does. It stays exactly what
 * it was (its list, project, context, who it waits on, its dates and files); the Inbox gets an entry pointing at it,
 * "Due back: …", and clarifying that entry decides again (GTD critique: the old tickler copied the text and trashed the
 * original, losing everything else).
 */
function runTickler() {
  const t = today();
  const s = loadState();
  const ops: Op[] = [];
  const back = (title: string, kind: "action" | "project", id: string) =>
    ops.push({
      type: "create",
      table: "stuff",
      row: { id: randomUUID(), text: `Due back: ${title || "Untitled"}`, kind: "text", status: "inbox", created_at: now(), back_kind: kind, back_id: id },
    });
  for (const a of s.actions) {
    if (a.bring_back && a.bring_back <= t && ["next", "waiting", "someday", "later"].includes(a.status)) {
      back(a.title, "action", a.id);
      ops.push({ type: "patch", table: "actions", id: a.id, data: { bring_back: null } });
    }
  }
  for (const p of s.projects) {
    if (p.bring_back && p.bring_back <= t && ["active", "someday"].includes(p.status)) {
      back(p.title, "project", p.id);
      ops.push({ type: "patch", table: "projects", id: p.id, data: { bring_back: null } });
    }
  }
  if (ops.length) applyOps(ops);
}

app.get("/api/state", (c) => {
  runTickler();
  return c.json({ state: loadState(), meta: { today: today(), stallWeeks: stallWeeks(), trashDays: trashDays(), weekStart: weekStart(), calendars: feedInfo(), dayHours: dayHours() } });
});

app.post("/api/ops", async (c) => {
  const { ops } = (await c.req.json()) as { ops: Op[] };
  try {
    applyOps(ops);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 400);
  }
});

app.post("/api/upload", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const raw = body["file"];
  const list = (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => f instanceof File);
  const ownerKind = (body["owner_kind"] as string) || null;
  const ownerId = (body["owner_id"] as string) || null;
  const created: { stuff: unknown[]; files: FileRow[] } = { stuff: [], files: [] };
  for (const file of list) {
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = guessMime(file.name, file.type);
    const ex = await extract(file.name, mime, buf);
    const fid = randomUUID();
    writeFileSync(`${FILES_DIR}/${fid}`, buf);
    let owner_kind = ownerKind as FileRow["owner_kind"] | null;
    let owner_id = ownerId;
    if (!owner_kind || !owner_id) {
      const sid = randomUUID();
      const row = { id: sid, text: ex.title, kind: ex.kind, status: "inbox", created_at: now(), processed_at: null };
      insertRow("stuff", row);
      created.stuff.push(row);
      owner_kind = "stuff";
      owner_id = sid;
    }
    const frow: FileRow = {
      id: fid,
      name: file.name,
      mime,
      size: buf.length,
      preview: ex.text,
      owner_kind,
      owner_id,
      created_at: now(),
    };
    insertRow("files", frow as unknown as Record<string, unknown>);
    created.files.push(frow);
  }
  return c.json(created);
});

app.post("/api/capture", async (c) => {
  const { text, id } = (await c.req.json()) as { text: string; id?: string };
  const row = {
    id: id ?? randomUUID(),
    text: text.trim(),
    kind: looksLikeEmail(text) ? "email" : "text",
    status: "inbox",
    created_at: now(),
    processed_at: null,
  };
  insertRow("stuff", row);
  return c.json(row);
});

/** A stored file's id is a UUID: nothing with a dot or a slash can name a path outside the files folder. */
const fileId = (id: string) => (/^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null);

/**
 * Only what the browser shows safely opens in a tab: raster images, PDFs and plain text. Anything else (HTML, SVG,
 * scripts, office files) downloads, so an uploaded page can never run inside the app with your session. The file is
 * also sandboxed (no scripts, its own origin), except a PDF, whose viewer won't run sandboxed.
 */
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

app.get("/api/files/:id", (c) => {
  const id = fileId(c.req.param("id"));
  const row = id ? (db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined) : undefined;
  const path = `${FILES_DIR}/${id}`;
  if (!id || !row || !existsSync(path)) return c.text("File not found", 404);
  const inline = INLINE.has(row.mime);
  return c.body(readFileSync(path), 200, {
    "Content-Type": inline ? row.mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    ...(row.mime === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
  });
});

app.delete("/api/files/:id", (c) => {
  const id = fileId(c.req.param("id"));
  if (!id) return c.json({ error: "No such file" }, 404);
  db.prepare("DELETE FROM files WHERE id = ?").run(id);
  const path = `${FILES_DIR}/${id}`;
  if (existsSync(path)) unlinkSync(path);
  return c.json({ ok: true });
});

/**
 * Subscribed calendars (Outlook, iCloud… read-only ICS/webcal): their links stay here; the browser gets names, colours,
 * hosts and the appointments.
 */
app.post("/api/calendars/probe", async (c) => {
  const { url } = (await c.req.json().catch(() => ({}))) as { url?: string };
  const r = await probe(String(url ?? ""));
  return c.json(r, r.ok ? 200 : 400);
});
app.post("/api/calendars", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; color?: string; url?: string };
  const r = await addFeed(body);
  return c.json({ ...r, calendars: feedInfo() }, r.ok ? 200 : 400);
});
app.patch("/api/calendars/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; color?: string; url?: string };
  const r = await updateFeed(c.req.param("id"), body);
  return c.json({ ...r, calendars: feedInfo() }, r.ok ? 200 : 400);
});
app.post("/api/calendars/sync", async (c) => c.json({ ok: true, calendars: await syncAll(), linkNotes: takeLinkNotes() }));
app.delete("/api/calendars/:id", (c) => {
  removeFeed(c.req.param("id"));
  return c.json({ ok: true, calendars: feedInfo() });
});
app.get("/api/calendar/events", async (c) => {
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return c.json({ error: "from and to must be days, from first" }, 400);
  // Times are given in the owner's time zone (their browser's), never the server's.
  // Links to projects that followed their appointments (moved, or unlinked when gone) are said once, here.
  const got = await eventsBetween(from, to, validZone(c.req.query("tz")) ?? undefined);
  return c.json({ ...got, linkNotes: takeLinkNotes() });
});

/** Weeks without progress before a project counts as stalled (the owner can change it in Settings). */
const stallWeeks = () => Number(getSetting("stallWeeks", "3")) || 3;
app.put("/api/settings/stall", async (c) => {
  const { weeks } = (await c.req.json().catch(() => ({}))) as { weeks?: number };
  const w = Math.round(Number(weeks));
  if (!(w >= 1 && w <= 52)) return c.json({ error: "Choose between 1 and 52 weeks" }, 400);
  setSetting("stallWeeks", String(w));
  return c.json({ stallWeeks: w });
});

/** The calendar's first day of the week: 1 Monday (the default), 0 Sunday. */
const weekStart = () => (getSetting("weekStart", "1") === "0" ? 0 : 1);

/** The hours the Calendar's week shows (the day is stretched for any appointment outside them): 07–19 by default. */
const dayHours = (): [number, number] => {
  const [a, b] = getSetting("dayHours", "7-19").split("-").map(Number);
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b <= 24 && b - a >= 4 ? [a, b] : [7, 19];
};
app.put("/api/settings/hours", async (c) => {
  const { start, end } = (await c.req.json().catch(() => ({}))) as { start?: number; end?: number };
  const a = Math.round(Number(start));
  const b = Math.round(Number(end));
  if (!(a >= 0 && b <= 24 && b - a >= 4)) return c.json({ error: "Choose at least four hours, within the day" }, 400);
  setSetting("dayHours", `${a}-${b}`);
  return c.json({ dayHours: [a, b] });
});
app.put("/api/settings/week", async (c) => {
  const { start } = (await c.req.json().catch(() => ({}))) as { start?: number };
  if (start !== 0 && start !== 1) return c.json({ error: "Choose Monday or Sunday" }, 400);
  setSetting("weekStart", String(start));
  return c.json({ weekStart: start });
});

/** Days a deleted item stays in the Trash before it is gone for good (the owner can change it in Settings). */
const trashDays = () => Number(getSetting("trashDays", "7")) || 7;
app.put("/api/settings/trash", async (c) => {
  const { days } = (await c.req.json().catch(() => ({}))) as { days?: number };
  const d = Math.round(Number(days));
  if (!(d >= 1 && d <= 365)) return c.json({ error: "Choose between 1 and 365 days" }, 400);
  setSetting("trashDays", String(d));
  purgeTrash();
  return c.json({ trashDays: d });
});

/** Deleted items past the keep period go for good, with their files. Runs at start, hourly and when the period changes. */
function purgeTrash() {
  const cutoff = new Date(Date.now() - trashDays() * 86_400_000).toISOString();
  const owner = { actions: "action", projects: "project", stuff: "stuff", refs: "ref", horizons: "horizon" } as const;
  for (const t of ["actions", "projects", "stuff", "refs", "horizons"] as const) {
    const gone = db.prepare(`SELECT id FROM ${t} WHERE status = 'trashed' AND trashed_at IS NOT NULL AND trashed_at < ?`).all(cutoff) as { id: string }[];
    for (const { id } of gone) {
      const files = db.prepare("SELECT id FROM files WHERE owner_kind = ? AND owner_id = ?").all(owner[t], id) as { id: string }[];
      for (const f of files) {
        if (existsSync(`${FILES_DIR}/${f.id}`)) unlinkSync(`${FILES_DIR}/${f.id}`);
        db.prepare("DELETE FROM files WHERE id = ?").run(f.id);
      }
      db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(id);
    }
  }
  // Goals gone for good leave their projects without a goal (they kept naming it while it was in the Trash).
  db.prepare("UPDATE projects SET goal_id = NULL WHERE goal_id IS NOT NULL AND goal_id NOT IN (SELECT id FROM horizons)").run();
  // A checklist goes for good with its items.
  const gone = db.prepare("SELECT id FROM checklists WHERE status = 'trashed' AND trashed_at IS NOT NULL AND trashed_at < ?").all(cutoff) as { id: string }[];
  for (const { id } of gone) {
    db.prepare("DELETE FROM checklist_items WHERE checklist_id = ?").run(id);
    db.prepare("DELETE FROM checklist_ticks WHERE checklist_id = ?").run(id);
    db.prepare("DELETE FROM checklists WHERE id = ?").run(id);
  }
}
purgeTrash();
setInterval(purgeTrash, 3_600_000).unref();

app.post("/api/review/complete", (c) => {
  const row = { id: randomUUID(), completed_at: now() };
  insertRow("reviews", row);
  return c.json(row);
});

app.patch("/api/stuff/:id/processed", (c) => {
  patchRow("stuff", c.req.param("id"), { status: "processed", processed_at: now() });
  return c.json({ ok: true });
});

app.get("/api/export/json", (c) =>
  c.body(exportJson(), 200, {
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="gtd-${today()}.json"`,
  }),
);

app.get("/api/export/zip", (c) =>
  c.body(Buffer.from(exportZip()), 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="gtd-${today()}.zip"`,
  }),
);

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", (c) => c.html(readFileSync("./dist/index.html", "utf8")));
}

const port = Number(process.env.PORT ?? (process.env.NODE_ENV === "production" ? 8787 : 5174));
const hostname = process.env.HOST ?? "127.0.0.1";
if (authRequired() && !readAuth()) {
  console.warn("[auth] Login is required but not set up. Run: npm run auth:setup");
}
serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(
    `GTD on http://${hostname}:${port}  ·  login ${authRequired() ? "required" : "off (local mode)"}`,
  );
});
