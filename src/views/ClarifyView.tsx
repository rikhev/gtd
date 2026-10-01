import { NotesArea } from "../components/NotesArea.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mail, StickyNote } from "lucide-react";
import { quote, getState, mutate, newAction, newProject, notify, plural, stamp, uid, useStore, bareArea } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { RAIL } from "../components/Chrome.tsx";
import { AreaName, ContextCode, Energy, KeyChoices, KeyHints, Tag } from "../components/bits.tsx";
import { splitStuff, stuffTitle } from "./InboxView.tsx";
import { itemsFromText, newChecklist } from "../checklists.ts";
import { reminderChoices, reminderOf, reminderWhere } from "../reminders.ts";
import { areaItems, askWaitingOn, contextItems, nextAreaColor, projectItems, CONTEXT_COLORS } from "../actionCommands.tsx";
import { formatLong, formatTime } from "../../shared/dates.ts";
import type { ID, Op, Proposal, ProposedAction, Stuff } from "../../shared/types.ts";

type Draft = Omit<Proposal, "actions"> & { actions: (ProposedAction & { done?: boolean })[] };

/** A Clarify run: the Inbox as it stood when it began, oldest first, each item with its blank decision. */
interface Session {
  order: string[];
  proposals: Record<string, Proposal>;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const normTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "");

/** An open project with the same title as the decision's new one (e.g. created by an earlier item this session). */
function matchingProject(title: string | undefined) {
  if (!title?.trim()) return undefined;
  return getState().projects.find((p) => (p.status === "active" || p.status === "someday") && normTitle(p.title) === normTitle(title));
}

/** A decision with nothing proposed: actionable, one next action named after the item's first line. */
function blankDecision(stuffId: string, text: string): Proposal {
  const first = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return {
    stuff_id: stuffId,
    disposition: "actionable",
    new_project: null,
    reference: null,
    actions: [{ title: first.slice(0, 120), kind: "next", project: null, context: null, due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false }],
  };
}

const DISPOSITIONS: Record<Draft["disposition"], string> = {
  actionable: "Actionable",
  someday: "Someday / Maybe",
  reference: "Reference",
  trash: "Trash",
};

/** Where a Clarify run lives: its own screen by default, or inside another view (the Weekly Review) that stays put. */
export interface ClarifyHost {
  leave: () => void;
  backLabel: string;
  /** Offer "Work from Next Actions" once the Inbox is clear. */
  offerNext: boolean;
}

/** Sizes a one-line-of-meaning textarea to its wrapped lines. */
/** The lines a checklist is made from: those under the title, or every line once the checklist is given a title of its own (as Reference keeps the whole capture). */
const checklistLines = (st: Stuff, title: string | undefined) => (!title?.trim() || title.trim() === stuffTitle(st) ? splitStuff(st).rest : st.text);

const fitHeight = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

export function ClarifyView({ regionActive, host: hosted }: { regionActive: boolean; host?: ClarifyHost }) {
  const ui = useUI();
  const host: ClarifyHost = hosted ?? {
    leave: ui.leaveClarify,
    backLabel: ui.clarifyReturn() === "review" ? "Back to the Weekly Review" : "Back to the Inbox",
    offerNext: ui.clarifyReturn() !== "review",
  };
  const s = useStore((x) => x);
  const [job, setJob] = useState<Session | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [index, setIndex] = useState(0);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  // Each item is first asked GTD's question, "is it actionable?", before any action is written (owner's decision
  // after the GTD critique: the capture used to pass straight through as the next action).
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [row, setRow] = useState(0);
  const card = useRef<HTMLDivElement>(null);

  // Every Inbox item gets a blank decision, its first line as the first action, in the order it was captured.
  useEffect(() => {
    const items = getState()
      .stuff.filter((x) => x.status === "inbox")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const proposals: Record<string, Proposal> = {};
    for (const st of items) proposals[st.id] = blankDecision(st.id, st.text);
    setJob({ order: items.map((x) => x.id), proposals });
    setDrafts(Object.fromEntries(Object.entries(proposals).map(([k, p]) => [k, clone(p)])));
  }, []);

  const queue = useMemo(
    () =>
      job
        ? job.order.filter((id) => s.stuff.some((x) => x.id === id && x.status === "inbox") || handled.has(id))
        : [],
    [job, s.stuff, handled],
  );
  const currentId = queue[index];
  const current = s.stuff.find((x) => x.id === currentId);
  const draft = currentId ? drafts[currentId] : undefined;
  const files = s.files.filter((f) => f.owner_kind === "stuff" && f.owner_id === currentId);

  useEffect(() => {
    setRow(0);
    card.current?.querySelector<HTMLElement>("[data-row='0']")?.focus();
  }, [currentId, Boolean(draft)]);

  const update = (fn: (d: Draft) => void) => {
    if (!currentId || !draft) return;
    const d = clone(draft);
    fn(d);
    setDrafts({ ...drafts, [currentId]: d });
  };
  const updateRow = (i: number, data: Partial<ProposedAction & { done?: boolean }>) => update((d) => Object.assign(d.actions[i], data));

  // No Skip (owner's decision after the GTD critique): GTD never puts anything back in the in-tray. Every item gets a
  // decision in turn, even if that is Someday or the tickler.

  const finishItem = (id: string, label: string, ops: Op[]) => {
    mutate(label, ops);
    const h = new Set(handled).add(id);
    setHandled(h);
    const after = queue.findIndex((q, i) => i > index && !h.has(q));
    const any = queue.findIndex((q) => !h.has(q));
    if (after >= 0) setIndex(after);
    else if (any >= 0) setIndex(any);
    else setIndex(queue.length);
  };

  const accept = () => {
    if (!current || !draft) return;
    // Every Waiting For action needs someone or something to wait on before it's filed.
    const missing = draft.disposition !== "trash" && draft.disposition !== "reference" ? draft.actions.findIndex((a) => a.kind === "waiting" && !a.done && !a.waiting_who?.trim()) : -1;
    if (missing >= 0) {
      notify("Who or what is this waiting on? Name it, then accept again.");
      askWaitingOn(ui, null, (who) => updateRow(missing, { waiting_who: who }));
      return;
    }
    // A next action is written in words, never left blank: back to the first empty one.
    const blank = draft.disposition === "actionable" ? draft.actions.findIndex((a) => a.kind !== "someday" && !a.done && !a.title.trim()) : -1;
    if (blank >= 0) {
      card.current?.querySelector<HTMLElement>(`[data-row='${blank}'] .p-title`)?.focus();
      notify("Write the next action first: the very next physical step.");
      return;
    }
    // Every next action needs a context before it's filed (owner's rule): go to the first one without.
    const noCtx = draft.disposition === "actionable" ? draft.actions.findIndex((a) => a.kind === "next" && !a.done && !a.context?.trim()) : -1;
    if (noCtx >= 0) {
      card.current?.querySelector<HTMLElement>(`[data-row='${noCtx}']`)?.focus();
      notify(`“${draft.actions[noCtx].title || "This action"}” needs a context. Pick one, then accept again.`);
      pickFor(noCtx, "context");
      return;
    }
    const st = getState();
    const ops: Op[] = [];
    const d = draft;
    const filesHere = st.files.filter((f) => f.owner_kind === "stuff" && f.owner_id === current.id);
    const moveFiles = (kind: string, id: ID) => filesHere.forEach((f) => ops.push({ type: "patch", table: "files", id: f.id, data: { owner_kind: kind, owner_id: id } }));
    let label = "";

    if (d.disposition === "trash") {
      ops.push({ type: "patch", table: "stuff", id: current.id, data: { status: "trashed", processed_at: stamp() } });
      label = `${quote(current.text)} trashed`;
    } else if (d.disposition === "reference" && d.reference?.checklist) {
      // A checklist (non-actionable, but its own category in GTD, not reference): the item's lines under its first become the items to tick.
      if (filesHere.length) {
        notify("This item has files attached, and a checklist can't keep files. File it as Reference to keep them.", { tone: "error" });
        return;
      }
      const c = newChecklist({ title: d.reference.title.trim() || stuffTitle(current) || "Untitled checklist" });
      ops.push({ type: "create", table: "checklists", row: { ...c } });
      for (const item of itemsFromText(checklistLines(current, d.reference.title), c.id)) ops.push({ type: "create", table: "checklist_items", row: { ...item } });
      label = `Filed as checklist: ${c.title}`;
    } else if (d.disposition === "reference") {
      const rid = uid();
      const ref = d.reference ?? { title: stuffTitle(current), notes: "" };
      // The captured words follow your notes, as V › Reference keeps them: the title line stays out unless you retitled it.
      const kept = ref.title.trim() === stuffTitle(current) ? splitStuff(current).rest : current.text;
      ops.push({ type: "create", table: "refs", row: { id: rid, title: ref.title, notes: [ref.notes, kept].filter(Boolean).join("\n\n---\n"), project_id: null, status: "active", created_at: stamp() } });
      moveFiles("ref", rid);
      label = `Filed as reference: ${ref.title}`;
    } else {
      // Contexts and areas typed as new ones are created on the fly.
      const ctxByName = new Map(st.contexts.map((c) => [c.name.toLowerCase(), c.id]));
      const ctxId = (name: string | null) => {
        if (!name) return null;
        const key = (name.startsWith("@") ? name : `@${name}`).toLowerCase();
        let id = ctxByName.get(key);
        if (!id) {
          id = uid();
          ctxByName.set(key, id);
          ops.push({ type: "create", table: "contexts", row: { id, name: key, color: CONTEXT_COLORS[(st.contexts.length + ctxByName.size) % CONTEXT_COLORS.length], sort: st.contexts.length + ctxByName.size } });
        }
        return id;
      };
      let newProjectId: ID | null = null;
      const usesNew = d.actions.some((a) => a.project === "new");
      const existing = matchingProject(d.new_project?.title);
      if (d.new_project && existing && (usesNew || d.actions.length === 0)) {
        newProjectId = existing.id;
      } else if (d.new_project && (usesNew || d.actions.length === 0)) {
        let areaId: ID | null = null;
        if (d.new_project.area) {
          const area = st.areas.find((a) => a.name.toLowerCase() === bareArea(d.new_project!.area!).toLowerCase());
          if (area) areaId = area.id;
          else {
            areaId = uid();
            ops.push({ type: "create", table: "areas", row: { id: areaId, name: bareArea(d.new_project.area), sort: st.areas.length, color: nextAreaColor() } });
          }
        }
        const p = newProject({ title: d.new_project.title, area_id: areaId, status: d.disposition === "someday" ? "someday" : "active", outcome: d.new_project.outcome?.trim() ?? "" });
        newProjectId = p.id;
        ops.push({ type: "create", table: "projects", row: { ...p } });
      }
      let sort = Math.max(0, ...st.actions.map((a) => a.sort)) + 1;
      const created: ID[] = [];
      for (const a of d.actions) {
        const projectId = a.project === "new" ? newProjectId : a.project && st.projects.some((p) => p.id === a.project) ? a.project : null;
        const row = newAction({
          title: a.title,
          notes: "",
          status: a.done ? "done" : a.kind,
          completed_at: a.done ? stamp() : null,
          project_id: projectId,
          context_id: ctxId(a.context),
          due: a.due,
          defer: a.defer,
          bring_back: a.bring_back ?? null,
          time_min: a.time_min,
          energy: a.energy,
          waiting_who: a.kind === "waiting" ? a.waiting_who : null,
          waiting_since: a.kind === "waiting" ? new Date().toISOString().slice(0, 10) : null,
          sort: sort++,
        });
        created.push(row.id);
        ops.push({ type: "create", table: "actions", row: { ...row } });
      }
      if (newProjectId) moveFiles("project", newProjectId);
      else if (created[0]) moveFiles("action", created[0]);
      // The item's own notes (everything under its first line, as the Inbox pane shows them) go over to the first
      // action, as they are: no "Captured:" copy of the whole capture (owner's decision).
      const carried = splitStuff(current).rest.trim();
      if (carried && created[0]) {
        const i = ops.findIndex((o) => o.type === "create" && o.table === "actions" && (o.row as { id: string }).id === created[0]);
        if (i >= 0) (ops[i] as { row: Record<string, unknown> }).row.notes = carried;
      }
      const doneCount = d.actions.filter((a) => a.done).length;
      label = [
        newProjectId && !existing ? `project “${d.new_project?.title}”` : existing ? `added to “${existing.title}”` : "",
        d.actions.length - doneCount ? plural(d.actions.length - doneCount, "action") : "",
        doneCount ? `${doneCount} done now` : "",
      ]
        .filter(Boolean)
        .join(" + ");
      label = label ? `Clarified: ${label}` : "Clarified";
    }
    ops.push({ type: "patch", table: "stuff", id: current.id, data: { status: d.disposition === "trash" ? "trashed" : "processed", processed_at: stamp() } });
    finishItem(current.id, label, ops);
  };

  const trashItem = () => {
    if (!current) return;
    finishItem(current.id, `${quote(current.text)} trashed`, [{ type: "patch", table: "stuff", id: current.id, data: { status: "trashed", processed_at: stamp() } }]);
  };

  const pickFor = (i: number, field: "context" | "project" | "due" | "defer" | "back" | "time" | "energy" | "kind" | "who") => {
    if (!draft || !draft.actions[i]) return;
    const a = draft.actions[i];
    if (field === "context")
      ui.openPicker({
        type: "list",
        title: "Context",
        items: contextItems().map((c) => ({ ...c, id: c.label })),
        current: a.context,
        // A next action must have a context, so "No context" is only offered for other kinds.
        noneLabel: a.kind === "next" && !a.done ? undefined : "No context",
        mustChoose: !a.context,
        createLabel: (q) => `New context “${q.startsWith("@") ? q : "@" + q}”`,
        onCreate: (q) => updateRow(i, { context: q.startsWith("@") ? q : `@${q}` }),
        onPick: (name) => updateRow(i, { context: name }),
      });
    if (field === "project")
      ui.openPicker({
        type: "list",
        title: "Project",
        items: [...(draft.new_project ? [{ id: "new", label: draft.new_project.title, hint: "New project" }] : []), ...projectItems()],
        current: a.project,
        noneLabel: "No project",
        createLabel: (q) => `New project “${q}”`,
        onCreate: (q) =>
          update((d) => {
            d.new_project = { title: q, area: d.new_project?.area ?? null };
            d.actions[i].project = "new";
          }),
        onPick: (id) => updateRow(i, { project: id }),
      });
    if (field === "due" || field === "defer")
      ui.openPicker({ type: "date", title: field === "due" ? "Due date" : "Start date", current: a[field], onPick: (d) => updateRow(i, { [field]: d }) });
    if (field === "back") ui.openPicker({ type: "date", title: "Bring back on (the tickler)", current: a.bring_back ?? null, onPick: (d) => updateRow(i, { bring_back: d }) });
    if (field === "time") ui.openPicker({ type: "time", current: a.time_min, onPick: (m) => updateRow(i, { time_min: m }) });
    if (field === "energy") ui.openPicker({ type: "energy", current: a.energy, onPick: (e) => updateRow(i, { energy: e }) });
    if (field === "who") askWaitingOn(ui, a.waiting_who, (who) => updateRow(i, { kind: "waiting", waiting_who: who }));
    if (field === "kind")
      ui.openPicker({
        type: "list",
        title: "File as",
        items: [
          { id: "next", label: "Next action" },
          { id: "waiting", label: "Waiting for" },
          { id: "someday", label: "Someday / Maybe" },
          { id: "item:project", label: "Whole item → New project" },
          { id: "item:reference", label: "Whole item → Reference" },
          { id: "item:checklist", label: "Whole item → New checklist" },
          { id: "item:trash", label: "Whole item → Trash" },
        ],
        current: a.kind,
        onPick: (k) => {
          if (!k) return;
          if (k === "item:project") makeProject();
          else if (k === "item:checklist" || k === "item:reference")
            update((d) => {
              d.disposition = "reference";
              d.reference = { title: d.reference?.title || stuffTitle(current!), notes: d.reference?.notes ?? "", checklist: k === "item:checklist" };
            });
          else if (k.startsWith("item:")) update((d) => (d.disposition = k.slice(5) as Draft["disposition"]));
          else if (k === "waiting") askWaitingOn(ui, a.waiting_who, (who) => update((d) => {
            d.actions[i].kind = "waiting";
            d.actions[i].waiting_who = who;
            d.disposition = "actionable";
          }));
          else
            update((d) => {
              d.actions[i].kind = k as ProposedAction["kind"];
              d.disposition = k === "someday" && d.actions.every((x, j) => j === i || x.kind === "someday") ? "someday" : "actionable";
            });
        },
      });
  };

  /**
   * The item is a project: more than one step to the outcome. The project is named after the item, every action in
   * the proposal goes into it, and the cursor lands on the first action to name the very next step (a project needs
   * one). If that action only repeated the item's words, it is cleared to be written afresh.
   */
  const makeProject = () => {
    if (!draft || !current) return;
    const title = draft.new_project?.title || stuffTitle(current) || draft.actions[0]?.title || "New project";
    update((d) => {
      d.disposition = d.disposition === "someday" ? "someday" : "actionable";
      d.new_project = { title, area: d.new_project?.area ?? null };
      if (!d.actions.length) d.actions.push({ title: "", kind: "next", project: "new", context: null, due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false });
      for (const a of d.actions) if (a.kind !== "someday" || d.disposition === "someday") a.project = "new";
      if (normTitle(d.actions[0].title) === normTitle(title)) d.actions[0].title = "";
    });
    window.setTimeout(() => card.current?.querySelector<HTMLElement>("[data-row='0'] .p-title")?.focus(), 0);
  };

  const addRow = () =>
    update((d) => {
      d.disposition = d.disposition === "trash" || d.disposition === "reference" ? "actionable" : d.disposition;
      d.actions.push({ title: "", kind: "next", project: d.new_project ? "new" : null, context: null, due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false });
      window.setTimeout(() => card.current?.querySelector<HTMLElement>(`[data-row='${d.actions.length - 1}'] .p-title`)?.focus(), 0);
    });

  const rowOfFocus = () => {
    const el = document.activeElement?.closest<HTMLElement>("[data-row]");
    return el ? Number(el.dataset.row) : row;
  };

  // A tickler entry ("Due back: …") isn't new stuff: it brings back an item already filed, to be decided again.
  const reminder = reminderOf(s, current);
  // A "Due back" entry whose item has since been deleted: say so, and let it be clarified afresh or trashed.
  const orphan = Boolean(current?.back_id) && !reminder;
  const reminderPicks =
    current && reminder
      ? reminderChoices(ui, current, reminder, (label, ops) => finishItem(current.id, label, ops))
      : current && orphan
        ? [
            { k: "enter", label: "Clarify it as new stuff", run: () => mutate("Clarifying it afresh", [{ type: "patch", table: "stuff", id: current.id, data: { back_kind: null, back_id: null } }], { silent: true }) },
            { k: "backspace", label: "Trash this entry", run: () => finishItem(current.id, `${quote(current.text)} trashed`, [{ type: "patch", table: "stuff", id: current.id, data: { status: "trashed", processed_at: stamp() } }]) },
          ]
        : [];
  useCommands(
    "clarify-reminder",
    reminderPicks.map((c) => ({ id: `cl.r.${c.k}`, label: c.label, group: "Clarify", keys: c.k === "backspace" ? ["backspace", "delete"] : [c.k], run: c.run })),
    { priority: 16, active: regionActive && (Boolean(reminder) || orphan) },
  );
  const gating = Boolean(current && draft) && !answered.has(current!.id) && !reminder && !orphan;
  const ready = Boolean(current && draft) && !gating && !reminder && !orphan;
  /** The answer to "is it actionable?": Yes starts an empty next action to put into words; the rest file the item. */
  const answer = (a: "yes" | "someday" | "reference" | "trash") => {
    if (!current || !draft) return;
    if (a === "trash") return trashItem();
    const title = stuffTitle(current);
    update((d) => {
      if (a === "yes") {
        d.disposition = "actionable";
        d.actions = [{ ...d.actions[0], title: "", kind: "next" }];
      } else if (a === "someday") {
        d.disposition = "someday";
        d.actions = [{ ...d.actions[0], title, kind: "someday" }];
      } else {
        d.disposition = "reference";
        d.reference = { title, notes: "" };
      }
    });
    setAnswered((prev) => new Set(prev).add(current.id));
    // Yes: the cursor waits in the empty action, the capture beside it as the source.
    if (a === "yes") window.setTimeout(() => card.current?.querySelector<HTMLElement>("[data-row='0'] .p-title")?.focus(), 0);
  };
  const backLabel = host.backLabel;
  const commands: Command[] = [
    { id: "cl.yes", label: "Actionable: decide the next action", group: "Clarify", keys: ["y"], enabled: gating, run: () => answer("yes") },
    { id: "cl.someday", label: "Not now: Someday / Maybe", group: "Clarify", keys: ["s"], enabled: gating, run: () => answer("someday") },
    { id: "cl.reference", label: "Not actionable: keep as Reference", group: "Clarify", keys: ["r"], enabled: gating, run: () => answer("reference") },
    // GTD's incubate has two homes: Someday/Maybe, and the tickler. B is the tickler: on Someday until the day it comes back.
    {
      id: "cl.tickler",
      label: "Not now: bring it back on a day (the tickler)",
      group: "Clarify",
      keys: ["b"],
      enabled: gating,
      run: () => {
        if (!current) return;
        // The day first, then one update: Someday/Maybe until then, decided again when it comes back.
        ui.openPicker({
          type: "date",
          title: "Bring it back on",
          current: null,
          onPick: (day) => {
            if (!day || !current) return;
            const title = stuffTitle(current);
            update((d) => {
              d.disposition = "someday";
              d.actions = [{ ...d.actions[0], title, kind: "someday", bring_back: day }];
            });
            setAnswered((prev) => new Set(prev).add(current.id));
          },
        });
      },
    },
    { id: "cl.accept", label: "Accept and continue", group: "Clarify", keys: ["mod+enter"], inInput: true, enabled: ready, run: () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.setTimeout(accept, 0);
    } },
    { id: "cl.trash", label: "Trash this item", group: "Clarify", keys: ["backspace", "delete"], enabled: Boolean(current) && !reminder && !orphan, run: trashItem },
    { id: "cl.done", label: "Done it now (two-minute rule)", group: "Clarify", keys: ["e"], enabled: ready, run: () => {
      const i = rowOfFocus();
      if (draft?.actions[i]) updateRow(i, { done: !draft.actions[i].done });
    } },
    { id: "cl.add", label: "Add an action", group: "Clarify", keys: ["n"], enabled: ready, run: addRow },
    { id: "cl.remove", label: "Remove this action", group: "Clarify", keys: ["alt+backspace"], enabled: ready, run: () => {
      const i = rowOfFocus();
      update((d) => d.actions.splice(i, 1));
    } },
    { id: "cl.context", label: "Set context", group: "Fields", keys: ["c"], enabled: ready, run: () => pickFor(rowOfFocus(), "context") },
    { id: "cl.project", label: "Set project", group: "Fields", keys: ["p"], enabled: ready, run: () => pickFor(rowOfFocus(), "project") },
    { id: "cl.makeproject", label: "Make this a project (more than one step)", group: "Clarify", keys: ["shift+p"], inInput: false, enabled: ready, run: makeProject },
    { id: "cl.due", label: "Set due date", group: "Fields", keys: ["d"], enabled: ready, run: () => pickFor(rowOfFocus(), "due") },
    { id: "cl.defer", label: "Set start date", group: "Fields", keys: ["s"], enabled: ready, run: () => pickFor(rowOfFocus(), "defer") },
    { id: "cl.back", label: "Bring back on (tickler)", group: "Fields", keys: ["b"], enabled: ready, run: () => pickFor(rowOfFocus(), "back") },
    { id: "cl.time", label: "Set time estimate (then 1–6)", group: "Fields", keys: ["m"], enabled: ready, run: () => pickFor(rowOfFocus(), "time") },
    { id: "cl.energy", label: "Set energy (then 1–3)", group: "Fields", keys: ["g"], enabled: ready, run: () => pickFor(rowOfFocus(), "energy") },
    { id: "cl.kind", label: "File as (list or whole item)", group: "Fields", keys: ["v"], enabled: ready, run: () => pickFor(rowOfFocus(), "kind") },
    { id: "cl.delegate", label: "Delegate → Waiting For", group: "Fields", keys: ["shift+f"], enabled: ready, run: () => pickFor(rowOfFocus(), "who") },
    {
      id: "cl.leave",
      // One level at a time: out of a field first, then out of Clarify.
      label: "Back (out of the field, then out of Clarify)",
      group: "Clarify",
      keys: ["escape"],
      inInput: true,
      run: () => {
        const el = document.activeElement as HTMLElement | null;
        const rowEl = el?.closest<HTMLElement>("[data-row]");
        if (el && rowEl && el !== rowEl) rowEl.focus();
        else if (el && card.current?.contains(el) && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) el.blur();
        else host.leave();
      },
    },
    { id: "cl.edit", label: "Rename", group: "Clarify", keys: ["f2"], enabled: ready, run: () => card.current?.querySelector<HTMLElement>(`[data-row='${rowOfFocus()}'] .p-title`)?.focus() },
    {
      id: "cl.enter",
      label: "Edit the focused row or field",
      group: "Clarify",
      keys: ["enter"],
      enabled: ready,
      run: () => {
        const el = document.activeElement as HTMLElement | null;
        if (el?.tagName === "BUTTON") el.click();
        else card.current?.querySelector<HTMLElement>(`[data-row='${rowOfFocus()}'] .p-title`)?.focus();
      },
    },
    { id: "cl.rowdown", label: "Next action in the decision", group: "Clarify", keys: ["arrowdown"], enabled: ready, run: () => card.current?.querySelector<HTMLElement>(`[data-row='${rowOfFocus() + 1}']`)?.focus() },
    { id: "cl.rowup", label: "Previous action in the decision", group: "Clarify", keys: ["arrowup"], enabled: ready, run: () => card.current?.querySelector<HTMLElement>(`[data-row='${Math.max(0, rowOfFocus() - 1)}']`)?.focus() },
  ];
  useCommands("clarify", commands, { priority: 15, active: regionActive });

  if (job && queue.length === 0) {
    return (
      <div className="clarify-state">
        <Tag size="md">Inbox zero</Tag>
        <p className="clarify-msg">Nothing left to clarify. Your lists are up to date.</p>
        <KeyChoices choices={[{ k: "escape", label: backLabel, run: host.leave }]} />
      </div>
    );
  }

  if (job && index >= queue.length) {
    return (
      <div className="clarify-state">
        <Tag size="md">Inbox clear</Tag>
        <p className="clarify-msg">{plural(handled.size, "item")} clarified. Everything has a place.</p>
        <KeyChoices
          choices={[
            { k: "escape", label: backLabel, run: host.leave },
            ...(!host.offerNext ? [] : [{ k: RAIL.find((r) => r.id === "next")!.key!, label: "Work from Next Actions", run: () => ui.go("next") }]),
          ]}
        />
      </div>
    );
  }

  const done = handled.size;
  const total = queue.length;
  // The queue, felt: the next few items wait below, dimmer the further off they are.
  const ahead = [...queue.slice(index + 1), ...queue.slice(0, index)].filter((id) => !handled.has(id));
  const upNext = ahead.slice(0, 3).map((id) => s.stuff.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <div className="clarify" ref={card}>
      <div className="clarify-progress" aria-label={`${done} of ${total} clarified`}>
        <span className="num">
          {Math.min(done + 1, total)} / {total}
        </span>
        <span className="clarify-track">
          {queue.map((id, i) => (
            <i key={id} className={`${handled.has(id) ? "is-done" : ""} ${i === index ? "is-current" : ""} ${drafts[id] ? "is-ready" : ""}`} />
          ))}
        </span>
      </div>

      <div className="clarify-card">
        <section className="clarify-stuff" aria-label="Captured stuff">
          <h2 className="pane-h">
            {current?.kind === "email" ? <Mail size={14} strokeWidth={1.75} aria-hidden /> : current?.kind === "file" ? <FileText size={14} strokeWidth={1.75} aria-hidden /> : <StickyNote size={14} strokeWidth={1.75} aria-hidden />}
            Stuff
            <span className="muted-text small">captured {current ? formatLong(current.created_at.slice(0, 10)) : ""}</span>
          </h2>
          <div className="sheet">
            <p className="sheet-text">{current?.text}</p>
            {files.map((f) => (
              <div key={f.id} className="sheet-file">
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
                {f.mime.startsWith("image/") ? <img src={`/api/files/${f.id}`} alt={f.name} /> : f.preview ? <pre>{f.preview.slice(0, 2400)}</pre> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="clarify-proposal" aria-label="Your decision">
          <h2 className="pane-h">
            Your decision
            {draft && !gating && !reminder && !orphan && <Tag>{draft.disposition === "reference" && draft.reference?.checklist ? "Checklist" : DISPOSITIONS[draft.disposition]}</Tag>}
          </h2>
          {orphan ? (
            <>
              <div className="clarify-ask">
                <p className="clarify-q">It was due back, but it's gone.</p>
                <p className="muted-text">The item it brought back has been deleted since. Clarify this entry as new stuff, or trash it.</p>
              </div>
              <KeyChoices choices={reminderPicks} />
            </>
          ) : reminder ? (
            <>
              <div className="clarify-ask">
                <p className="clarify-q">It's back. Is it still right?</p>
                <p className="muted-text">
                  {reminder.item.title || "Untitled"}, on {reminderWhere(s, reminder)}. It stays as it is unless you change it here.
                </p>
              </div>
              <KeyChoices choices={reminderPicks} />
            </>
          ) : gating ? (
            <div className="clarify-ask">
              <p className="clarify-q">Is it actionable?</p>
              <p className="muted-text">Is there anything you, or someone, should do about it? Decide that before writing any action.</p>
            </div>
          ) : !draft ? null : (
            <>
              {draft.disposition === "reference" && (
                <div className="p-block">
                  <label className="field">
                    <span className="field-label">{draft.reference?.checklist ? "Checklist title" : "Reference title"}</span>
                    <input
                      className="field-text p-title"
                      value={draft.reference?.title ?? ""}
                      onChange={(e) => update((d) => (d.reference = { title: e.target.value, notes: d.reference?.notes ?? "", checklist: d.reference?.checklist }))}
                    />
                  </label>
                  {draft.reference?.checklist ? (
                    <ChecklistPreview text={current ? checklistLines(current, draft.reference?.title) : ""} />
                  ) : (
                  <label className="field">
                    <span className="field-label">Notes</span>
                    <NotesArea
                      className="field-text"
                      rows={3}
                      aria-label="Reference notes"
                      value={draft.reference?.notes ?? ""}
                      onValue={(notes) => update((d) => (d.reference = { title: d.reference?.title ?? "", notes }))}
                    />
                  </label>
                  )}
                </div>
              )}
              {draft.disposition === "trash" && <p className="p-note">Accept to trash it, or file it as something else.</p>}
              {(draft.disposition === "actionable" || draft.disposition === "someday") && (
                <>
                  {draft.new_project && (
                    <div className="p-project">
                      <span className="field-label">{matchingProject(draft.new_project.title) ? "Existing project (same title)" : "New project"}</span>
                      <input
                        className="field-text p-project-title"
                        value={draft.new_project.title}
                        aria-label="New project title"
                        onChange={(e) => update((d) => (d.new_project = { ...d.new_project!, title: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="field-pick"
                        onClick={() =>
                          ui.openPicker({
                            type: "list",
                            title: "Area",
                            items: areaItems().map((a) => ({ ...a, id: bareArea(a.label) })),
                            current: draft.new_project?.area ?? null,
                            noneLabel: "No area",
                            createLabel: (q) => `New area “#${q.replace(/^#+\s*/, "")}”`,
                            onCreate: (q) => update((d) => (d.new_project = { ...d.new_project!, area: bareArea(q) })),
                            onPick: (a) => update((d) => (d.new_project = { ...d.new_project!, area: a })),
                          })
                        }
                      >
                        {draft.new_project.area ? <AreaName name={draft.new_project.area} color={s.areas.find((x) => x.name.toLowerCase() === bareArea(draft.new_project!.area!).toLowerCase())?.color} /> : <span className="dash">No area</span>}
                      </button>
                    </div>
                  )}
                  <ol className="p-actions">
                    {draft.actions.map((a, i) => {
                      // By hand, the first action starts as the capture's own words: until it is rewritten it is drawn
                      // as raw material, with a prompt, and focusing it selects it so typing replaces it.
                      const raw = Boolean(current) && a.title.trim() !== "" && a.title.trim() === stuffTitle(current!).trim();
                      return (
                      <li key={i} data-row={i} tabIndex={0} aria-label={`Proposed action ${i + 1}: ${a.title}`} className={`p-row ${a.done ? "is-done" : ""}`} onFocus={() => setRow(i)}>
                        <div className="p-row-top">
                          <span className="p-kind">{a.kind === "next" ? "Next" : a.kind === "waiting" ? "Waiting" : "Someday"}</span>
                          {/* A title wraps rather than being cut off: the field grows to its lines (it stays one line of
                              meaning, so Enter never adds a break). */}
                          <textarea
                            rows={1}
                            ref={fitHeight}
                            className={`p-title ${raw ? "is-raw" : ""}`}
                            value={a.title}
                            aria-label={`Action ${i + 1}`}
                            aria-describedby={raw ? `p-raw-${i}` : undefined}
                            placeholder="What is the very next physical step?"
                            onFocus={(e) => raw && e.currentTarget.select()}
                            onKeyDown={(e) => e.key === "Enter" && !e.metaKey && !e.ctrlKey && e.preventDefault()}
                            onChange={(e) => {
                              fitHeight(e.currentTarget);
                              updateRow(i, { title: e.target.value.replace(/\n/g, " ") });
                            }}
                          />
                        </div>
                        <div className="p-fields">
                          <button type="button" className="p-field" onClick={() => pickFor(i, "project")}>
                            <span className="p-lbl">Project</span>
                            {a.project === "new" ? draft.new_project?.title : a.project ? s.projects.find((p) => p.id === a.project)?.title ?? <span className="dash" aria-hidden="true">–</span> : <span className="dash" aria-hidden="true">–</span>}
                          </button>
                          <button type="button" className={`p-field ${a.kind === "next" && !a.done && !a.context ? "is-needed" : ""}`} onClick={() => pickFor(i, "context")}>
                            <span className="p-lbl">Context</span>
                            {a.context ? (
                              <ContextCode ctx={s.contexts.find((c) => c.name.toLowerCase() === a.context!.toLowerCase()) ?? { id: "", name: a.context, color: "var(--ink-3)", sort: 0 }} />
                            ) : a.kind === "next" && !a.done ? (
                              <span className="p-needed">needed</span>
                            ) : (
                              <span className="dash" aria-hidden="true">–</span>
                            )}
                          </button>
                          {a.kind === "waiting" && (
                            <button type="button" className="p-field" onClick={() => pickFor(i, "who")}>
                              <span className="p-lbl">Waiting on</span>
                              {a.waiting_who ?? <span className="dash" aria-hidden="true">–</span>}
                            </button>
                          )}
                          <button type="button" className="p-field" onClick={() => pickFor(i, "due")}>
                            <span className="p-lbl">Due</span>
                            {a.due ? formatLong(a.due) : <span className="dash" aria-hidden="true">–</span>}
                          </button>
                          <button type="button" className="p-field" onClick={() => pickFor(i, "defer")}>
                            <span className="p-lbl">Start</span>
                            {a.defer ? formatLong(a.defer) : <span className="dash" aria-hidden="true">–</span>}
                          </button>
                          {(a.kind === "someday" || a.bring_back) && (
                            <button type="button" className="p-field" onClick={() => pickFor(i, "back")}>
                              <span className="p-lbl">Bring back</span>
                              {a.bring_back ? formatLong(a.bring_back) : <span className="dash" aria-hidden="true">–</span>}
                            </button>
                          )}
                          <button type="button" className="p-field" onClick={() => pickFor(i, "time")}>
                            <span className="p-lbl">Time</span>
                            {a.time_min ? formatTime(a.time_min) : <span className="dash" aria-hidden="true">–</span>}
                          </button>
                          <button type="button" className="p-field" onClick={() => pickFor(i, "energy")}>
                            <span className="p-lbl">Energy</span>
                            <Energy level={a.energy} />
                          </button>
                        </div>
                        {raw && (
                          <p className="p-raw-note" id={`p-raw-${i}`}>
                            Rewrite as a next action, verb first: what is the very next thing you'd do?
                          </p>
                        )}
                        {a.done && <p className="p-done-note">Done now: goes straight to the Done log.</p>}
                      </li>
                      );
                    })}
                  </ol>
                  {draft.actions.length === 0 && <p className="p-note">No actions yet. Add one if this needs doing.</p>}
                </>
              )}

            </>
          )}
        </section>
      </div>
      <KeyHints
        hints={reminder || orphan ? [] : gating ? [
          { k: "y", label: "Yes, actionable", primary: true },
          { k: "s", label: "Someday" },
          { k: "r", label: "Reference" },
          { k: "b", label: "Bring back on…", touch: "more" as const },
          { k: "backspace", label: "Trash" },
        ] : [
          { k: "mod+enter", label: "Accept", primary: true },
          { k: "n", label: "Add action", touch: "more" as const },
          { k: "v", label: "File as" },
          { k: "shift+p", label: "Project", touch: "more" as const },
          { k: "e", label: "Done now" },
          { k: "backspace", label: "Trash", touch: "more" as const },
        ]}
      />
      {upNext.length > 0 && (
        <section className="clarify-next" aria-label="Up next">
          <h2 className="pane-h">
            Up next
            {ahead.length > upNext.length && <span className="muted-text small">and {ahead.length - upNext.length} more</span>}
          </h2>
          <ol>
            {upNext.map((st) => (
              <li key={st.id}>
                {st.kind === "email" ? <Mail size={13} strokeWidth={1.75} aria-hidden /> : st.kind === "file" ? <FileText size={13} strokeWidth={1.75} aria-hidden /> : <StickyNote size={13} strokeWidth={1.75} aria-hidden />}
                <span>{stuffTitle(st) || "Untitled"}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Filing as a checklist: what its items will be, from the item's lines under its title. */
function ChecklistPreview({ text }: { text: string }) {
  const items = itemsFromText(text, "preview");
  const toTick = items.filter((i) => !i.section).length;
  if (!items.length) return <p className="p-note">The item has nothing under its title, so the checklist starts empty, ready to fill.</p>;
  return (
    <div className="field">
      <span className="field-label">{plural(toTick, "item")} to tick, from the item's lines</span>
      <ul className="cl-preview">
        {items.slice(0, 8).map((i) => (
          <li key={i.id} className={i.section ? "is-section" : ""}>
            {i.title}
          </li>
        ))}
        {items.length > 8 && <li className="cl-preview-more">and {items.length - 8} more</li>}
      </ul>
    </div>
  );
}
