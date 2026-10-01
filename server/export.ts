import { zipSync, strToU8 } from "fflate";
import { loadState } from "./db.ts";
import { formatTime, recurrenceLabel, parseRecurrence } from "../shared/dates.ts";
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
  if (a.due) bits.push(`due ${a.due}`);
  if (a.defer) bits.push(`start ${a.defer}`);
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

export function exportZip(): Uint8Array {
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
        return `## ${p.title}\n\n${area ? `Area: ${area}\n` : ""}${
          p.notes ? `\n${p.notes}\n` : ""
        }\n${acts.join("\n")}`;
      })
      .join("\n\n"),
  );
  md("reference.md", "Reference", s.refs.filter((r) => r.status === "active").map((r) => `## ${r.title}\n\n${r.notes}`).join("\n\n"));
  md(
    "checklists.md",
    "Checklists",
    s.checklists
      .filter((c) => c.status === "active")
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((c) => {
        const area = s.areas.find((a) => a.id === c.area_id)?.name;
        // A routine lists each habit with how often it was done in the last four weeks.
        const since = new Date(Date.now() - 27 * 86_400_000).toISOString().slice(0, 10);
        const daysDone = (id: string) => new Set(s.checklist_ticks.filter((k) => k.item_id === id && k.day >= since).map((k) => k.day)).size;
        const items = s.checklist_items
          .filter((i) => i.checklist_id === c.id)
          .sort((a, b) => a.sort - b.sort)
          .map((i) =>
            i.section ? `\n### ${i.title}\n` : c.repeats ? `- ${i.title}  _(done on ${daysDone(i.id)} of the last 28 days)_` : `- [${i.checked_at ? "x" : " "}] ${i.title}`,
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
