import { zipSync, strToU8 } from "fflate";
import { existsSync, readFileSync } from "node:fs";
import { FILES_DIR, loadState } from "./db.ts";
import { addDays, formatTime, fromIso, recurrenceLabel, parseRecurrence, today } from "../shared/dates.ts";
import type { Action, State } from "../shared/types.ts";

export function exportJson(): string {
  return JSON.stringify(loadState(), null, 2);
}

function actionLine(s: State, a: Action): string {
  const bits: string[] = [];
  const ctx = s.contexts.find((c) => c.id === a.context_id)?.name;
  const proj = s.projects.find((p) => p.id === a.project_id)?.title;
  if (ctx) bits.push(ctx);
  if (proj) bits.push(`project: ${proj}`);
  if (a.defer) bits.push(`do on ${a.defer}`);
  if (a.time_min) bits.push(formatTime(a.time_min));
  if (a.energy) bits.push(["", "low", "medium", "high"][a.energy] + " energy");
  if (a.waiting_who) bits.push(`waiting on ${a.waiting_who} since ${a.waiting_since ?? "?"}`);
  if (a.followup) bits.push(`follow up ${a.followup}`);
  if (a.recurrence) {
    const r = parseRecurrence(a.recurrence);
    if (r) bits.push(recurrenceLabel(r).toLowerCase());
  }
  const box = a.status === "done" ? "[x]" : "[ ]";
  const notes = a.notes ? `\n  ${a.notes.replace(/\n/g, "\n  ")}` : "";
  return `- ${box} ${a.title}${bits.length ? `  _(${bits.join(" · ")})_` : ""}${notes}`;
}

/**
 * `day` is the owner's today, as their browser has it (a server may keep another time zone); `weekStart` the week's
 * first day (0 Sunday, 1 Monday), for routines that repeat weekly.
 */
export function exportZip({ day = today(), weekStart = 1 }: { day?: string; weekStart?: 0 | 1 } = {}): Uint8Array {
  const s = loadState();
  const files: Record<string, Uint8Array> = {};
  const md = (name: string, title: string, body: string) => (files[name] = strToU8(`# ${title}\n\n${body.trim()}\n`));

  md("inbox.md", "Inbox", s.stuff.filter((x) => x.status === "inbox").map((x) => `- ${x.text.replace(/\n/g, "\n  ")}`).join("\n"));
  md("next-actions.md", "Next Actions", s.actions.filter((a) => a.status === "next").map((a) => actionLine(s, a)).join("\n"));
  md("waiting-for.md", "Waiting For", s.actions.filter((a) => a.status === "waiting").map((a) => actionLine(s, a)).join("\n"));
  md(
    "someday-maybe.md",
    "Someday/Maybe",
    [
      ...s.projects.filter((p) => p.status === "someday").map((p) => `- Project: ${p.title}`),
      ...s.actions.filter((a) => a.status === "someday").map((a) => actionLine(s, a)),
    ].join("\n"),
  );
  md(
    "projects.md",
    "Projects",
    s.projects
      .filter((p) => p.status === "active")
      .map((p) => {
        const area = s.areas.find((a) => a.id === p.area_id)?.name;
        const acts = s.actions.filter((a) => a.project_id === p.id && a.status !== "trashed").map((a) => actionLine(s, a));
        const goal = s.horizons.find((h) => h.id === p.goal_id && h.status !== "trashed")?.title;
        // Natural planning first (why, done looks like, ideas), then the notes and the actions.
        const plan = [p.purpose && `Why: ${p.purpose}`, p.outcome && `Done looks like: ${p.outcome}`, goal && `Goal: ${goal}`, p.ideas && `Ideas:\n${p.ideas}`].filter(Boolean).join("\n");
        return `## ${p.title}\n\n${area ? `Area: ${area}\n` : ""}${plan ? `${plan}\n` : ""}${
          p.notes ? `\n${p.notes}\n` : ""
        }\n${acts.join("\n")}`;
      })
      .join("\n\n"),
  );
  // Each reference with the project it supports and the names of its files (the files themselves stay in the app).
  md(
    "reference.md",
    "Reference",
    s.refs
      .filter((r) => r.status === "active")
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((r) => {
        const project = s.projects.find((p) => p.id === r.project_id)?.title;
        const files = s.files.filter((f) => f.owner_kind === "ref" && f.owner_id === r.id).map((f) => f.name);
        // A locked reference exports only what the server can read: its title and project. Its notes and files stay encrypted.
        if (r.sealed) return `## ${r.title}\n\n${project ? `Project: ${project}\n` : ""}Locked: its notes${files.length ? ` and ${files.length === 1 ? "file" : `${files.length} files`}` : ""} are encrypted with the lock password.`;
        // A list exports as one: "- " for each item, a section heading one level under the reference's.
        const body =
          r.form === "list"
            ? r.notes
                .split("\n")
                .filter((l) => l.trim())
                .map((l) => (/^#{1,6}\s+/.test(l) ? `\n### ${l.replace(/^#{1,6}\s+/, "").trim()}\n` : `- ${l.trim()}`))
                .join("\n")
                .trim()
            : r.notes;
        return `## ${r.title}\n\n${project ? `Project: ${project}\n` : ""}${files.length ? `Files: ${files.join("; ")}\n` : ""}${body ? `\n${body}` : ""}`;
      })
      .join("\n\n"),
  );
  // And each note as a file of its own, as a notes app keeps them (owner's request after the Reference critique: the
  // notes go back out as they came in): notes/<Title>.md, the project it supports as a property, a list as a Markdown
  // list, and its files beside it in notes/files, which its ![[name]] embeds name. Locked notes stay encrypted.
  const used = new Set<string>();
  const unique = (base: string, ext: string) => {
    let name = `${base}${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
    used.add(name.toLowerCase());
    return name;
  };
  const safe = (t: string) => t.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
  const fileNames = new Set<string>();
  for (const r of s.refs.filter((x) => x.status === "active" && !x.sealed)) {
    const project = s.projects.find((p) => p.id === r.project_id)?.title;
    const body =
      r.form === "list"
        ? r.notes
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => (/^#{1,6}\s+/.test(l) ? `\n## ${l.replace(/^#{1,6}\s+/, "").trim()}\n` : `- ${l.trim()}`))
            .join("\n")
            .trim()
        : r.notes;
    const props = [project && `project: "${project.replace(/"/g, '\\"')}"`, `created: ${r.created_at.slice(0, 10)}`].filter(Boolean).join("\n");
    files[`notes/${unique(safe(r.title), ".md")}`] = strToU8(`---\n${props}\n---\n\n${body.trim()}\n`);
    for (const f of s.files.filter((x) => x.owner_kind === "ref" && x.owner_id === r.id && !x.sealed)) {
      const path = `${FILES_DIR}/${f.id}`;
      if (fileNames.has(f.name.toLowerCase()) || !existsSync(path)) continue;
      fileNames.add(f.name.toLowerCase());
      files[`notes/files/${f.name.replace(/[\\/]/g, "-")}`] = new Uint8Array(readFileSync(path));
    }
  }
  md(
    "horizons.md",
    "Horizons",
    (["purpose", "vision", "goal"] as const)
      .map((kind) => {
        const rows = s.horizons.filter((h) => h.kind === kind && h.status !== "trashed").sort((a, b) => a.sort - b.sort);
        const heading = { purpose: "Purpose and principles", vision: "Vision (3–5 years)", goal: "Goals (1–2 years)" }[kind];
        const line = (h: (typeof rows)[number]) => {
          const projects = s.projects.filter((p) => p.goal_id === h.id && p.status === "active").map((p) => p.title);
          return `- ${h.status === "done" ? "~~" : ""}${h.title}${h.status === "done" ? "~~ (achieved)" : ""}${h.target ? `  _(by ${h.target})_` : ""}${projects.length ? `\n  Projects: ${projects.join("; ")}` : ""}`;
        };
        return rows.length ? `## ${heading}\n\n${rows.map(line).join("\n")}` : "";
      })
      .filter(Boolean)
      .join("\n\n"),
  );
  md(
    "checklists.md",
    "Checklists",
    s.checklists
      .filter((c) => c.status === "active")
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((c) => {
        const area = s.areas.find((a) => a.id === c.area_id)?.name;
        // A routine lists each habit with how often it was done in the last four weeks: in days, or in weeks.
        const weekOf = (d: string) => addDays(d, -((fromIso(d).getDay() - weekStart + 7) % 7));
        const since = c.repeats === "week" ? addDays(weekOf(day), -21) : addDays(day, -27);
        const kept = (id: string) =>
          new Set(s.checklist_ticks.filter((k) => k.item_id === id && k.day >= since && k.day <= day).map((k) => (c.repeats === "week" ? weekOf(k.day) : k.day))).size;
        const record = (id: string) => (c.repeats === "week" ? `done in ${kept(id)} of the last 4 weeks` : `done on ${kept(id)} of the last 28 days`);
        const items = s.checklist_items
          .filter((i) => i.checklist_id === c.id)
          .sort((a, b) => a.sort - b.sort)
          .map((i) =>
            i.section ? `\n### ${i.title}\n` : c.repeats ? `- ${i.title}  _(${record(i.id)})_` : `- [${i.checked_at ? "x" : " "}] ${i.title}`,
          );
        const repeats = c.repeats === "day" ? "Repeats every day\n" : c.repeats === "week" ? "Repeats every week\n" : "";
        const project = s.projects.find((p) => p.id === c.project_id)?.title;
        const forProject = project ? `Project: ${project}\n` : "";
        return `## ${c.title}\n\n${area ? `Area: ${area}\n` : ""}${forProject}${repeats}${c.notes ? `\n${c.notes}\n` : ""}\n${items.join("\n")}`;
      })
      .join("\n\n"),
  );
  md(
    "done.md",
    "Done",
    s.actions
      .filter((a) => a.status === "done")
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
      .map((a) => `- ${a.completed_at?.slice(0, 10)} ${a.title}`)
      .join("\n"),
  );
  files["gtd.json"] = strToU8(JSON.stringify(s, null, 2));
  return zipSync(files);
}
