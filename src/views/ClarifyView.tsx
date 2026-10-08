import { NotesArea } from "../components/NotesArea.tsx";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileText, Mail, StickyNote } from "lucide-react";
import { quote, getState, mutate, newAction, newProject, notify, plural, stamp, uid, useStore, bareArea } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { RAIL } from "../components/Chrome.tsx";
import { AreaName, ContextCode, Energy, KeyChoices, KeyHints, Tag, stepChoice } from "../components/bits.tsx";
import { splitStuff, stuffTitle } from "./InboxView.tsx";
import { itemsFromText, newChecklist } from "../checklists.ts";
import { reminderChoices, reminderOf, reminderWhere } from "../reminders.ts";
import { areaItems, askWaitingOn, contextItems, nextAreaColor, projectItems, CONTEXT_COLORS } from "../actionCommands.tsx";
import { formatDate, formatLong, formatTime } from "../../shared/dates.ts";
import { usePhone } from "../phone.ts";
import { Viewer } from "../components/Viewer.tsx";
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

/** What the decision's cursor stops on, top to bottom, as the details pane's does: each block's fields in turn. */
const STOPS = ".clarify-fields .field-text, .clarify-fields .field-pick";

/**
 * Enter in one of Clarify's naming fields keeps the name and leaves the field, as Esc does (owner's request): the
 * cursor stays on the field and the pane keeps the keys. What is typed is kept as it is typed; ⌘Enter still accepts.
 */
const enterLeaves = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return;
  e.preventDefault();
  const pane = e.currentTarget.closest<HTMLElement>(".clarify-pane");
  e.currentTarget.blur();
  pane?.focus({ preventScroll: true });
};

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
  // Answered no (owner's request: the question is yes or no): then what it is, among the things that aren't actions.
  const [declined, setDeclined] = useState<Set<string>>(new Set());
  // Answered yes, then asked whether it is a project (owner's request: nothing is written before that is known).
  const [actionable, setActionable] = useState<Set<string>>(new Set());
  // Items answered at least once: answering one the same way again keeps what was written.
  const touched = useRef<Set<string>>(new Set());
  // Items whose do, delegate or defer has been answered, so it stays marked when stepped back to. Whether it is a project
  // isn't asked (owner's decision): the action is linked to a project, or a new one, with P, as on every list.
  const routed = useRef<Set<string>>(new Set());
  // A project taken off an item, kept so making it a project again brings back its name, area and outcome.
  const shelved = useRef<Record<string, NonNullable<Draft["new_project"]>>>({});
  const [row, setRow] = useState(0);
  // The decision pane: every proposed action, its fields and the naming fields live here.
  const card = useRef<HTMLElement>(null);
  const phone = usePhone();
  // A long first line is cut in its row (rows are one line): then the opened item starts with it whole.
  const subjectRef = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  // Which of the item's files the viewer shows (← → step through them).
  const [fileAt, setFileAt] = useState(0);
  // The pane stands where the details pane does, beside the column (not on a phone, where it follows the item).
  const [work, setWork] = useState<Element | null>(null);
  useEffect(() => setWork(document.querySelector(".work")), []);

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
  useEffect(() => setFileAt(0), [currentId]);
  useEffect(() => {
    const el = subjectRef.current;
    if (!el) return setCut(false);
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentId]);

  useEffect(() => {
    setRow(0);
    card.current?.querySelectorAll("[data-cursor]").forEach((x) => x.removeAttribute("data-cursor"));
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
    // A project is named before it is filed: back to its name.
    if (draft.new_project && !draft.new_project.title.trim()) {
      card.current?.querySelector<HTMLElement>("[data-row='project'] .p-title")?.focus();
      notify("Name the project first: the outcome, verb first.");
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
      cursorTo(`[data-row='${noCtx}'] .field-pick.is-needed`);
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
          due: null,
          defer: a.defer,
          bring_back: a.kind === "someday" ? (a.bring_back ?? null) : null,
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

  const pickFor = (i: number, field: "context" | "project" | "defer" | "back" | "time" | "energy" | "kind" | "who") => {
    if (!draft || !draft.actions[i]) return;
    const a = draft.actions[i];
    // A field's key takes the cursor to its field, as in the details pane.
    const named = { context: "Context", project: "Project", defer: "Do on", back: "Bring back", time: "Time", energy: "Energy", who: "Waiting on" }[field as string];
    if (named) cursorTo(`[data-row='${i}'] [data-field='${named}']`);
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
        // Linked elsewhere (or to none), a new project no action is in any longer goes, rather than standing empty.
        onPick: (id) =>
          update((d) => {
            d.actions[i].project = id;
            if (d.new_project && !d.actions.some((x) => x.project === "new")) {
              shelved.current[current!.id] = d.new_project;
              d.new_project = null;
            }
          }),
      });
    if (field === "defer") ui.openPicker({ type: "date", title: "Do on", current: a.defer, onPick: (d) => updateRow(i, { defer: d }) });
    // Only a someday row has a bring back day: anything current is already decided.
    if (field === "back" && a.kind === "someday") ui.openPicker({ type: "date", title: "Bring back on a day", current: a.bring_back ?? null, onPick: (d) => updateRow(i, { bring_back: d }) });
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
          if (k === "item:project") setProject(true);
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
   * Whether the item is a project: more than one step to the outcome. A project is named after the item (or the name
   * it had before it was taken off) and leads the decision's actions. Taken off, the actions stay as they were
   * written, now on their own, so moving between the two loses nothing. Answering the question puts the cursor in the
   * name to write (the project's, selected, or the action's); switching with ⇧P leaves it on the block, so ⇧P again
   * switches back.
   */
  const setProject = (on: boolean, write = false, quiet = false) => {
    if (!draft || !current) return;
    const id = current.id;
    update((d) => {
      d.disposition = d.disposition === "someday" ? "someday" : "actionable";
      if (on) {
        const title = d.new_project?.title || shelved.current[id]?.title || stuffTitle(current) || d.actions[0]?.title || "New project";
        d.new_project = d.new_project ?? shelved.current[id] ?? { title, area: null, outcome: "" };
        if (!d.actions.length) d.actions.push({ title: "", kind: "next", project: "new", context: null, due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false });
        for (const a of d.actions) if (a.kind !== "someday" || d.disposition === "someday") a.project = "new";
        // The project's name isn't its next action: an action that only repeats it is cleared to be written afresh.
        if (normTitle(d.actions[0].title) === normTitle(d.new_project.title)) d.actions[0].title = "";
      } else {
        if (d.new_project) shelved.current[id] = d.new_project;
        d.new_project = null;
        for (const a of d.actions) if (a.project === "new") a.project = null;
        if (!d.actions.length) d.actions.push({ title: "", kind: "next", project: null, context: null, due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false });
      }
    });
    if (quiet) return;
    window.setTimeout(() => {
      const name = card.current?.querySelector<HTMLTextAreaElement>(on ? "[data-row='project'] .p-title" : "[data-row='0'] .p-title");
      if (!write) return cursorTo(on ? "[data-row='project'] .p-title" : "[data-row='0'] .p-title");
      name?.focus();
      if (on) name?.select();
    }, 0);
  };

  /** The project's area, from the same picker the details pane uses. */
  const pickArea = () => {
    if (!draft?.new_project) return;
    cursorTo("[data-row='project'] [data-field='Area']");
    ui.openPicker({
      type: "list",
      title: "Area",
      items: areaItems().map((a) => ({ ...a, id: bareArea(a.label) })),
      current: draft.new_project.area ?? null,
      noneLabel: "No area",
      createLabel: (q) => `New area “#${q.replace(/^#+\s*/, "")}”`,
      onCreate: (q) => update((d) => (d.new_project = { ...d.new_project!, area: bareArea(q) })),
      onPick: (a) => update((d) => (d.new_project = { ...d.new_project!, area: a })),
    });
  };

  const addRow = () =>
    update((d) => {
      d.disposition = d.disposition === "trash" || d.disposition === "reference" ? "actionable" : d.disposition;
      d.actions.push({ title: "", kind: "next", project: d.new_project ? "new" : null, context: null, due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false });
      window.setTimeout(() => titleOf(d.actions.length - 1)?.focus(), 0);
    });

  /*
   * The decision is walked as the details pane is (owner's rule: the same in every side pane): a cursor sits on one
   * field, ↑↓ move it through every block's fields (the project's, then each action's), Enter edits or opens the field
   * under it, and the field takes the blue a focused row takes. A click, Tab or a field's key moves it there too. The
   * block the cursor is in is the one C, D, P… set (the project is row -1, "project" in the markup).
   */
  const stops = () => [...(card.current?.querySelectorAll<HTMLElement>(STOPS) ?? [])].filter((el) => el.offsetParent !== null);
  const cursorEl = () => card.current?.querySelector<HTMLElement>("[data-cursor]") ?? null;
  const rowOf = (el: Element | null | undefined) => {
    const r = el?.closest<HTMLElement>("[data-row]");
    return !r ? row : r.dataset.row === "project" ? -1 : Number(r.dataset.row);
  };
  const setCursor = (el: HTMLElement | null | undefined) => {
    card.current?.querySelectorAll("[data-cursor]").forEach((x) => x !== el && x.removeAttribute("data-cursor"));
    if (!el) return;
    el.setAttribute("data-cursor", "");
    el.scrollIntoView({ block: "nearest" });
    setRow(rowOf(el));
  };
  /** The cursor onto a field, out of any field being typed in: the pane keeps the keys. */
  const cursorTo = (selector: string) => {
    setCursor(card.current?.querySelector<HTMLElement>(selector));
    card.current?.focus({ preventScroll: true });
  };
  const moveCursor = (dir: 1 | -1) => {
    const list = stops();
    const i = list.findIndex((x) => x.hasAttribute("data-cursor"));
    setCursor(list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + dir))]);
    card.current?.focus({ preventScroll: true });
  };
  const rowOfFocus = () => rowOf(cursorEl());
  const titleOf = (i: number) => card.current?.querySelector<HTMLElement>(`[data-row='${i === -1 ? "project" : i}'] .p-title`);

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
  const asking = gating && !declined.has(current!.id) && !actionable.has(current!.id);
  const notActionable = gating && declined.has(current!.id);
  // Answered yes: of the next action, do it now, delegate it, or put it on Next Actions?
  const routing = gating && actionable.has(current!.id) && !declined.has(current!.id);
  const onProject = ready && row === -1 && Boolean(draft?.new_project);
  /** The open question takes the cursor: its marked answer if it has one, else its first. */
  const focusQuestion = () =>
    window.setTimeout(() => {
      const asks = card.current?.querySelectorAll<HTMLElement>(".clarify-ask");
      const open = asks?.[asks.length - 1];
      (open?.querySelector<HTMLElement>(".is-current button") ?? open?.querySelector<HTMLElement>("button"))?.focus();
    }, 0);
  const without = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };
  const decline = (no: boolean) => {
    if (!current) return;
    setDeclined((prev) => (no ? new Set(prev).add(current.id) : without(prev, current.id)));
    setActionable((prev) => without(prev, current.id));
  };
  /** One answer back (Esc, or choosing another): the answered question is open again, what was written kept. */
  const stepBack = () => {
    if (!current) return;
    const yes = draft?.disposition === "actionable";
    setAnswered((prev) => without(prev, current.id));
    setActionable((prev) => (yes ? new Set(prev).add(current.id) : without(prev, current.id)));
    setDeclined((prev) => (yes ? without(prev, current.id) : new Set(prev).add(current.id)));
    focusQuestion();
  };
  // No, after yes: back to the second question, the fields still beneath until it is answered.
  const answerNo = () => {
    if (!current) return;
    if (answered.has(current.id)) stepBack();
    decline(true);
    // The cursor goes on to the question the answer opens, as it does after yes.
    focusQuestion();
  };
  /** The answer to "is it actionable?": Yes starts an empty next action to put into words; the rest file the item. */
  const answer = (a: "yes" | "someday" | "reference" | "checklist" | "trash") => {
    if (!current || !draft) return;
    if (a === "trash") return trashItem();
    const title = stuffTitle(current);
    // Answered again after stepping back: the same answer keeps what was written under it; another starts afresh.
    const again = touched.current.has(current.id);
    touched.current.add(current.id);
    update((d) => {
      if (a === "yes") {
        if (again && d.disposition === "actionable" && d.actions.length) return;
        routed.current.delete(current.id);
        d.disposition = "actionable";
        d.new_project = null;
        d.actions = [{ ...d.actions[0], title: "", kind: "next", project: null, bring_back: null, done: false }];
      } else if (a === "someday") {
        if (again && d.disposition === "someday" && !d.actions.some((x) => x.bring_back)) return;
        d.disposition = "someday";
        d.actions = [{ ...d.actions[0], title, kind: "someday", bring_back: null, done: false }];
      } else {
        // Reference, or a checklist: GTD keeps both as support material, kept to be looked at, not done.
        const checklist = a === "checklist";
        if (again && d.disposition === "reference" && Boolean(d.reference?.checklist) === checklist) return;
        d.disposition = "reference";
        d.reference = { title, notes: "", checklist };
      }
    });
    // Yes asks what happens to the next action before anything is written; the other answers file the item as they are.
    if (a === "yes") {
      setActionable((prev) => new Set(prev).add(current.id));
      setDeclined((prev) => without(prev, current.id));
      focusQuestion();
      return;
    }
    setAnswered((prev) => new Set(prev).add(current.id));
    setActionable((prev) => without(prev, current.id));
    setDeclined((prev) => new Set(prev).add(current.id));
    toFields();
  };
  /** Answered, the cursor leaves the questions for the decision's first field (its name), the pane keeping the keys. */
  const toFields = () =>
    window.setTimeout(() => {
      setCursor(stops()[0]);
      card.current?.focus({ preventScroll: true });
    }, 0);
  /**
   * GTD's flowchart for the next action: under two minutes, do it now; someone else's to do, delegate it (who it waits
   * on is asked first, as every way into Waiting For asks, and cancelling changes nothing); otherwise it goes on Next Actions, a next
   * action. Then the decision's fields, the cursor in the name to write: the project's, or the action's.
   */
  const answerHow = (how: "now" | "delegate" | "defer") => {
    if (!current || !draft) return;
    const id = current.id;
    const settle = (data: Partial<ProposedAction & { done?: boolean }>) => {
      routed.current.add(id);
      update((d) => {
        if (!d.actions.length) d.actions.push({ title: "", kind: "next", project: d.new_project ? "new" : null, context: null, due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false });
        Object.assign(d.actions[0], data);
      });
      setAnswered((prev) => new Set(prev).add(id));
      window.setTimeout(() => {
        const name = titleOf(draft.new_project ? -1 : 0) as HTMLTextAreaElement | null | undefined;
        name?.focus();
        if (draft.new_project) name?.select();
      }, 0);
    };
    const first = draft.actions[0];
    if (how === "now") settle({ kind: "next", done: true, title: first?.title.trim() || stuffTitle(current) });
    else if (how === "defer") settle({ kind: "next", done: false });
    else askWaitingOn(ui, first?.kind === "waiting" ? first.waiting_who : null, (who) => settle({ kind: "waiting", waiting_who: who, done: false }));
  };
  const backLabel = host.backLabel;
  const commands: Command[] = [
    { id: "cl.yes", label: "Yes, actionable", group: "Clarify", keys: ["y"], enabled: asking || notActionable, run: () => answer("yes") },
    { id: "cl.no", label: "No, not actionable", group: "Clarify", keys: ["n"], enabled: asking, run: answerNo },
    { id: "cl.someday", label: "Incubate it on Someday / Maybe", group: "Clarify", keys: ["s"], enabled: notActionable, run: () => answer("someday") },
    { id: "cl.reference", label: "File it in Reference", group: "Clarify", keys: ["r"], enabled: notActionable, run: () => answer("reference") },
    { id: "cl.checklist", label: "Make it a checklist", group: "Clarify", keys: ["c"], enabled: notActionable, run: () => answer("checklist") },
    { id: "cl.how.now", label: "Do it now", group: "Clarify", keys: ["e"], enabled: routing, run: () => answerHow("now") },
    { id: "cl.how.delegate", label: "Delegate it to Waiting For", group: "Clarify", keys: ["w"], enabled: routing, run: () => answerHow("delegate") },
    { id: "cl.how.defer", label: "Put it on Next Actions", group: "Clarify", keys: ["t"], enabled: routing, run: () => answerHow("defer") },
    // GTD's incubate has two homes: Someday/Maybe, and the tickler. B is the tickler: on Someday until the day it comes back.
    {
      id: "cl.tickler",
      label: "Incubate it until a day",
      group: "Clarify",
      keys: ["b"],
      enabled: notActionable,
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
            setActionable((prev) => without(prev, current.id));
            setDeclined((prev) => new Set(prev).add(current.id));
            toFields();
          },
        });
      },
    },
    { id: "cl.accept", label: "Accept and continue", group: "Clarify", keys: ["mod+enter"], inInput: true, enabled: ready, run: () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.setTimeout(accept, 0);
    } },
    // Trash is one of the answers to "no", so the question is answered first (owner's request).
    { id: "cl.trash", label: "Trash this item", group: "Clarify", keys: ["backspace", "delete"], enabled: Boolean(current) && !reminder && !orphan && !asking, run: trashItem },
    { id: "cl.done", label: "Mark done", group: "Clarify", keys: ["e"], enabled: ready && !onProject && draft?.disposition === "actionable", run: () => {
      const i = rowOfFocus();
      if (draft?.actions[i]) updateRow(i, { done: !draft.actions[i].done });
    } },
    { id: "cl.add", label: "Add an action", group: "Clarify", keys: ["n"], enabled: ready, run: addRow },
    { id: "cl.remove", label: onProject ? "Make it a single next action" : "Remove this action", group: "Clarify", keys: ["alt+backspace"], enabled: ready, run: () => {
      const i = rowOfFocus();
      if (i === -1) return setProject(false);
      update((d) => d.actions.splice(i, 1));
    } },
    { id: "cl.context", label: "Set context", group: "Fields", keys: ["c"], enabled: ready && !onProject, run: () => pickFor(rowOfFocus(), "context") },
    { id: "cl.project", label: "Set project", group: "Fields", keys: ["p"], enabled: ready && !onProject, run: () => pickFor(rowOfFocus(), "project") },
    { id: "cl.makeproject", label: draft?.new_project ? "Make it a single next action" : "Make it a project", group: "Clarify", keys: ["shift+p"], inInput: false, enabled: ready, run: () => setProject(!draft?.new_project) },
    { id: "cl.area", label: "Set area", group: "Fields", keys: ["a"], enabled: ready && Boolean(draft?.new_project), run: pickArea },
    { id: "cl.defer", label: "Set the day to do it", group: "Fields", keys: ["s"], enabled: ready && !onProject, run: () => pickFor(rowOfFocus(), "defer") },
    { id: "cl.back", label: "Bring back on a day", group: "Fields", keys: ["b"], enabled: ready && !onProject && Boolean(draft?.actions.some((a) => a.kind === "someday")), run: () => pickFor(rowOfFocus(), "back") },
    { id: "cl.time", label: "Set time estimate", group: "Fields", keys: ["m"], enabled: ready && !onProject, run: () => pickFor(rowOfFocus(), "time") },
    { id: "cl.energy", label: "Set energy", group: "Fields", keys: ["g"], enabled: ready && !onProject, run: () => pickFor(rowOfFocus(), "energy") },
    // V moves items between lists and has no place in a pane (owner's rule): File as is in ⌘K alone.
    { id: "cl.kind", label: "File as", group: "Fields", keys: [], enabled: ready && !onProject, run: () => pickFor(rowOfFocus(), "kind") },
    { id: "cl.delegate", label: "Delegate → Waiting For", group: "Fields", keys: ["shift+f"], enabled: ready && !onProject, run: () => pickFor(rowOfFocus(), "who") },
    {
      id: "cl.leave",
      // One level at a time: out of a field first, then out of Clarify.
      label: "Go back",
      group: "Clarify",
      keys: ["escape"],
      inInput: true,
      run: () => {
        const el = document.activeElement as HTMLElement | null;
        if (el && card.current?.contains(el) && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
          el.blur();
          card.current.focus({ preventScroll: true });
        } else if (ready && answered.has(current!.id)) stepBack();
        else if (routing) {
          setActionable((prev) => without(prev, current!.id));
          focusQuestion();
        } else if (notActionable) {
          decline(false);
          focusQuestion();
        }
        else host.leave();
      },
    },
    { id: "cl.edit", label: "Rename", group: "Clarify", keys: ["f2"], enabled: ready, run: () => titleOf(rowOfFocus())?.focus() },
    {
      id: "cl.enter",
      label: "Edit the focused row or field",
      group: "Clarify",
      keys: ["enter"],
      enabled: ready,
      run: () => {
        const el = cursorEl();
        const focused = document.activeElement as HTMLElement | null;
        if (el) el.matches("button") ? el.click() : el.focus();
        else if (focused?.tagName === "BUTTON") focused.click();
        else titleOf(rowOfFocus())?.focus();
      },
    },
    { id: "cl.rowdown", label: "Go to the next field", group: "Clarify", keys: ["arrowdown"], enabled: ready, run: () => moveCursor(1) },
    { id: "cl.rowup", label: "Go to the previous field", group: "Clarify", keys: ["arrowup"], enabled: ready, run: () => moveCursor(-1) },
    // While a question is open (or on the screens that end a run), ↑↓ move between its answers, as between rows.
    { id: "cl.choicedown", label: "Go to the next answer", group: "Clarify", keys: ["arrowdown"], enabled: !ready, run: () => stepChoice(1) },
    { id: "cl.choiceup", label: "Go to the previous answer", group: "Clarify", keys: ["arrowup"], enabled: !ready, run: () => stepChoice(-1) },
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

  // The queue, felt: everything still to clarify waits under the item, in the order it will come.
  const ahead = [...queue.slice(index + 1), ...queue.slice(0, index)].filter((id) => !handled.has(id));
  const waiting = ahead.map((id) => s.stuff.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const kindIcon = (st: Stuff, size = 14) => (st.kind === "email" ? <Mail size={size} strokeWidth={1.75} aria-hidden /> : st.kind === "file" ? <FileText size={size} strokeWidth={1.75} aria-hidden /> : <StickyNote size={size} strokeWidth={1.75} aria-hidden />);
  const from = (st: Stuff) => (st.kind === "email" ? (st.text.match(/^(?:from|från):\s*(.+)$/im)?.[1] ?? "") : "");
  // An email's From line is shown beside its subject, so its body starts after the header lines.
  const body = current ? (current.kind === "email" ? splitStuff(current).rest.replace(/^(?:from|från|to|till|date|datum|cc):.*\n?/gim, "").trim() : splitStuff(current).rest) : "";
  const none = (
    <>
      <span className="dash" aria-hidden="true">
        –
      </span>
      <span className="visually-hidden">not set</span>
    </>
  );
  /** A field of the decision, drawn and spoken as the details pane draws its fields. */
  const pick = (label: string, value: ReactNode, onOpen: () => void, needed = false) => (
    <div className="field" key={label}>
      <span className="field-head">
        <span className="field-label">{label}</span>
      </span>
      <button type="button" className={`field-pick ${needed ? "is-needed" : ""}`} data-field={label} onClick={onOpen}>
        <span className="visually-hidden">{label}: </span>
        <span className="field-pick-value">{value}</span>
      </button>
    </div>
  );
  const kindName = (a: Draft["actions"][number]) => (a.done ? "Done now" : a.kind === "next" ? "Next action" : a.kind === "waiting" ? "Waiting for" : "Someday / Maybe");

  // The answers shown as made: from the decision itself once answered (File as can change it), else from the steps.
  // Stepped back, the earlier answer stays marked until another is chosen.
  const made = ready || (Boolean(current) && touched.current.has(current!.id));
  const first: string | null = !draft || reminder || orphan ? null : notActionable ? "n" : made ? (draft.disposition === "actionable" ? "y" : "n") : null;
  const how: string | null =
    !draft || first !== "y" || !(ready || routed.current.has(current!.id)) ? null : draft.actions[0]?.done ? "e" : draft.actions[0]?.kind === "waiting" ? "w" : "t";
  const second: string | null =
    !made || !draft || first !== "n" || draft.disposition === "actionable" ? null : draft.disposition === "reference" ? (draft.reference?.checklist ? "c" : "r") : draft.disposition === "trash" ? "backspace" : draft.actions.some((a) => a.bring_back) ? "b" : "s";
  const decision = (
    <>
      {orphan ? (
        <div className="clarify-ask">
          <p className="clarify-q">It was due back, but it's gone.</p>
          <p className="clarify-sub">The item it brought back has been deleted since. Clarify this entry as new stuff, or trash it.</p>
          <KeyChoices choices={reminderPicks} />
        </div>
      ) : reminder ? (
        <div className="clarify-ask">
          <p className="clarify-q">It's back. Is it still right?</p>
          <p className="clarify-sub">
            {reminder.item.title || "Untitled"}, on {reminderWhere(s, reminder)}. It stays as it is unless you change it here.
          </p>
          <KeyChoices choices={reminderPicks} />
        </div>
      ) : !draft ? null : (
        <>
          {/* GTD's questions stay in the pane once answered, each answer marked, the decision's fields under them;
              choosing another answer (or Esc) changes it (owner's request). */}
          <div className="clarify-ask">
            <p className="clarify-q">Is it actionable?</p>
            <p className="clarify-sub">Is there anything you, or someone, should do about it?</p>
            <KeyChoices
              key="ask"
              autoFocus={asking}
              current={first}
              choices={[
                { k: "y", label: "Yes", run: () => answer("yes") },
                { k: "n", label: "No", run: answerNo },
              ]}
            />
          </div>
          {first === "y" && !asking && (
            <div className="clarify-ask">
              <p className="clarify-q">What happens to the next action?</p>
              <p className="clarify-sub">If it takes less than two minutes, do it now. If someone else should do it, delegate it. Otherwise, do it as soon as you can.</p>
              <KeyChoices
                key="how"
                autoFocus={false}
                current={how}
                choices={[
                  { k: "e", label: "Done: do it now", run: () => answerHow("now") },
                  { k: "w", label: "Waiting For: delegate it", run: () => answerHow("delegate") },
                  { k: "t", label: "Next Actions: do it as soon as you can", run: () => answerHow("defer") },
                ]}
              />
            </div>
          )}
          {first === "n" && !asking && (
            <div className="clarify-ask">
              <p className="clarify-q">What is it, then?</p>
              <p className="clarify-sub">Trash it, incubate it, or file it as reference.</p>
              <KeyChoices
                key="no"
                autoFocus={false}
                current={second}
                choices={[
                  { k: "s", label: "Someday / Maybe: incubate it", run: () => answer("someday") },
                  { k: "b", label: "Someday / Maybe: incubate it until a day…", run: () => commands.find((c) => c.id === "cl.tickler")?.run() },
                  { k: "r", label: "Reference: file it", run: () => answer("reference") },
                  { k: "c", label: "Checklists: make it a checklist", run: () => answer("checklist") },
                  { k: "backspace", label: "Trash: throw it away", run: trashItem },
                ]}
              />
            </div>
          )}
          {ready && (
            <div className="clarify-fields">
          {draft.disposition === "reference" && (
            <>
              <label className="field field-title">
                <span className="field-head">
                  <span className="field-label">{draft.reference?.checklist ? "Checklist" : "Reference"}</span>
                </span>
                <input
                  className="field-text"
                  value={draft.reference?.title ?? ""}
                  onKeyDown={enterLeaves}
                  onChange={(e) => update((d) => (d.reference = { title: e.target.value, notes: d.reference?.notes ?? "", checklist: d.reference?.checklist }))}
                />
              </label>
              {draft.reference?.checklist ? (
                <ChecklistPreview text={current ? checklistLines(current, draft.reference?.title) : ""} />
              ) : (
                <label className="field">
                  <span className="field-head">
                    <span className="field-label">Notes</span>
                  </span>
                  <NotesArea
                    className="field-text"
                    rows={3}
                    aria-label="Reference notes"
                    value={draft.reference?.notes ?? ""}
                    onValue={(notes) => update((d) => (d.reference = { title: d.reference?.title ?? "", notes }))}
                  />
                </label>
              )}
              {!draft.reference?.checklist && <p className="detail-meta">The captured words follow your notes.</p>}
            </>
          )}
          {draft.disposition === "trash" && <p className="p-note">Accept to trash it, or file it as something else.</p>}
          {(draft.disposition === "actionable" || draft.disposition === "someday") && (
            <>
              {draft.new_project && (
                // The project is a block of the decision like each action, walked with ↑↓ and taking the cursor alike.
                <section
                  className="p-row p-project"
                  data-row="project"
                  aria-label={`${matchingProject(draft.new_project.title) ? "Existing project" : "New project"}: ${draft.new_project.title}`}
                >
                  <div className="field field-title">
                    <span className="field-head">
                      <span className="field-label">{matchingProject(draft.new_project.title) ? "Existing project (same title)" : "New project"}</span>
                    </span>
                    <textarea
                      rows={1}
                      ref={fitHeight}
                      className="field-text p-title"
                      value={draft.new_project.title}
                      aria-label="Project"
                      onKeyDown={enterLeaves}
                      onChange={(e) => {
                        fitHeight(e.currentTarget);
                        const title = e.target.value.replace(/\n/g, " ");
                        update((d) => (d.new_project = { ...d.new_project!, title }));
                      }}
                    />
                  </div>
                  <div className="field-grid">{pick("Area", draft.new_project.area ? <AreaName name={draft.new_project.area} color={s.areas.find((x) => x.name.toLowerCase() === bareArea(draft.new_project!.area!).toLowerCase())?.color} /> : none, pickArea)}</div>
                  {!matchingProject(draft.new_project.title) && (
                    <label className="field">
                      <span className="field-head">
                        <span className="field-label">Done looks like</span>
                      </span>
                      <input
                        className="field-text"
                        value={draft.new_project.outcome ?? ""}
                        onKeyDown={enterLeaves}
                        onChange={(e) => update((d) => (d.new_project = { ...d.new_project!, outcome: e.target.value }))}
                      />
                    </label>
                  )}
                </section>
              )}
              <ol className="p-actions">
                {draft.actions.map((a, i) => {
                  // By hand, the first action starts as the capture's own words: until it is rewritten it is drawn
                  // as raw material, with a prompt, and focusing it selects it so typing replaces it.
                  const raw = a.kind === "next" && !a.done && Boolean(current) && a.title.trim() !== "" && a.title.trim() === stuffTitle(current!).trim();
                  const projectName = a.project === "new" ? draft.new_project?.title : a.project ? s.projects.find((p) => p.id === a.project)?.title : undefined;
                  const ctx = a.context ? s.contexts.find((c) => c.name.toLowerCase() === a.context!.toLowerCase()) ?? { id: "", name: a.context, color: "var(--ink-3)", sort: 0 } : null;
                  const needsCtx = a.kind === "next" && !a.done && !a.context;
                  return (
                    <li key={i} data-row={i} aria-label={`${kindName(a)}${draft.actions.length > 1 ? ` ${i + 1}` : ""}: ${a.title}`} className={`p-row ${a.done ? "is-done" : ""}`}>
                      <div className="field field-title">
                        <span className="field-head">
                          <span className="field-label">{kindName(a)}</span>
                        </span>
                        {/* A title wraps rather than being cut off: the field grows to its lines (it stays one line of
                            meaning, so Enter never adds a break). */}
                        <textarea
                          rows={1}
                          ref={fitHeight}
                          className={`field-text p-title ${raw ? "is-raw" : ""}`}
                          value={a.title}
                          aria-label={`${kindName(a)} ${i + 1}`}
                          aria-describedby={raw ? `p-raw-${i}` : undefined}
                          onFocus={(e) => raw && e.currentTarget.select()}
                          onKeyDown={enterLeaves}
                          onChange={(e) => {
                            fitHeight(e.currentTarget);
                            updateRow(i, { title: e.target.value.replace(/\n/g, " ") });
                          }}
                        />
                      </div>
                      {raw && (
                        <p className="p-raw-note" id={`p-raw-${i}`}>
                          Rewrite it as a next action, verb first: what is the very next thing you'd do?
                        </p>
                      )}
                      {/* The details pane's grid, row by row: what it belongs to and where, the day to do it (or when
                          to bring it back), then time and energy. */}
                      <div className="field-grid">
                        {pick("Project", projectName ?? none, () => pickFor(i, "project"))}
                        {a.kind === "waiting"
                          ? pick("Waiting on", a.waiting_who ?? none, () => pickFor(i, "who"))
                          : pick("Context", ctx ? <ContextCode ctx={ctx} /> : needsCtx ? <span className="p-needed">Needed</span> : none, () => pickFor(i, "context"), needsCtx)}
                        {a.kind === "someday" ? pick("Bring back", a.bring_back ? formatLong(a.bring_back) : none, () => pickFor(i, "back")) : pick("Do on", a.defer ? formatLong(a.defer) : none, () => pickFor(i, "defer"))}
                        <span className="field-gap" aria-hidden="true" />
                        {pick("Time", a.time_min ? formatTime(a.time_min) : none, () => pickFor(i, "time"))}
                        {pick("Energy", a.energy ? <Energy level={a.energy} /> : none, () => pickFor(i, "energy"))}
                      </div>
                      {a.done && <p className="p-done-note">Done now: it goes straight to the Done log.</p>}
                    </li>
                  );
                })}
              </ol>
              {draft.actions.length === 0 && <p className="p-note">No actions yet. Add one if this needs doing.</p>}
            </>
          )}
            </div>
          )}
        </>
      )}
    </>
  );

  // The key line names what this decision can take: an action can be added to, made a project or done now; a
  // reference, checklist or trash only accepted, filed as something else or trashed.
  const acting = draft?.disposition === "actionable" || draft?.disposition === "someday";
  const hints = ready ? (
    <KeyHints
      hints={[
        { k: "mod+enter", label: "Accept", primary: true },
        ...(acting ? [{ k: "n", label: "Add action", touch: "more" as const }] : []),
        ...(acting ? [{ k: "shift+p", label: draft?.new_project ? "Single action" : "Project", touch: "more" as const }] : []),
        ...(draft?.disposition === "actionable" ? [{ k: "e", label: "Done now" }] : []),
        { k: "backspace", label: "Trash", touch: "more" as const },
        { k: "escape", label: "Change answer", touch: "hide" as const },
      ]}
    />
  ) : null;

  const pane = (
    <aside
      className="clarify-pane"
      aria-label="Decision"
      ref={card}
      tabIndex={-1}
      // Whatever field takes focus (a click, Tab, F2, its picker's key) takes the cursor with it.
      onFocus={(e) => {
        const stop = (e.target as HTMLElement).closest<HTMLElement>(STOPS);
        if (stop && card.current?.contains(stop)) setCursor(stop);
      }}
    >
      <div className="clarify-pane-bar">
        <h2 className="detail-title">Decision</h2>
      </div>
      <div className="clarify-pane-body">{decision}</div>
      {hints && <div className="clarify-pane-foot">{hints}</div>}
    </aside>
  );

  return (
    <div className="clarify">
      <div className="clarify-list" role="group" aria-label="Clarifying">
        <div className="grid-head clarify-cols" aria-hidden="true">
          <span />
          <span className="gh">Stuff</span>
          <span className="gh">Captured</span>
        </div>
        {current && (
          <section className="clarify-item" aria-label={`Clarifying: ${stuffTitle(current) || "Untitled"}`}>
            <div className="row clarify-cols is-current">
              <span className="cell c-mark kind-icon">{kindIcon(current)}</span>
              <span className="cell">
                <span className="subject">
                  <span className="subject-text" ref={subjectRef}>
                    {stuffTitle(current) || "Untitled"}
                  </span>
                  {from(current) && <span className="subject-more">{from(current)}</span>}
                </span>
              </span>
              <span className="cell">
                <span className="date">{formatDate(current.created_at.slice(0, 10))}</span>
              </span>
            </div>
            {(body || cut) && (
              <div className="clarify-body">
                {cut && <p className="sheet-text clarify-whole">{stuffTitle(current)}</p>}
                {body && <p className="sheet-text">{body}</p>}
              </div>
            )}
            {/* A document or an email is read in the app's own viewer, opened where the item is (owner's request). */}
            {files.length > 0 && <Viewer key={current.id} ids={files.map((f) => f.id)} at={Math.min(fileAt, files.length - 1)} active={regionActive} onStep={setFileAt} embedded />}
          </section>
        )}
        {phone && pane}
        {waiting.length > 0 && (
          <section className="clarify-queue" aria-label="Up next">
            <h2 className="group-head">
              <span className="group-label">Up next</span>
              <span className="group-meta">{plural(waiting.length, "item")}</span>
            </h2>
            <ol>
              {waiting.map((st) => (
                <li key={st.id} className="row clarify-cols">
                  <span className="cell c-mark kind-icon">{kindIcon(st)}</span>
                  <span className="cell">
                    <span className="subject">
                      <span className="subject-text">{stuffTitle(st) || "Untitled"}</span>
                      {from(st) && <span className="subject-more">{from(st)}</span>}
                    </span>
                  </span>
                  <span className="cell">
                    <span className="date">{formatDate(st.created_at.slice(0, 10))}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {!phone && work && createPortal(pane, work)}
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
      <span className="field-head">
        <span className="field-label">{plural(toTick, "item")} to tick, from the item's lines</span>
      </span>
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
