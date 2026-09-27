import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mail, StickyNote, Timer } from "lucide-react";
import { getState, mutate, newAction, newProject, notify, plural, stamp, uid, useMeta, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { runWhenReady, useCommands, type Command } from "../keys.ts";
import { promptApiKey } from "../apiKey.ts";
import { suggestRules } from "../rules.ts";
import { ContextCode, Energy, KeyChoices, KeyHints, Tape } from "../components/bits.tsx";
import { areaItems, askWaitingOn, contextItems, projectItems, CONTEXT_COLORS } from "../actionCommands.tsx";
import { formatLong, formatTime } from "../../shared/dates.ts";
import type { ID, Op, Proposal, ProposedAction } from "../../shared/types.ts";

type Draft = Omit<Proposal, "actions"> & { actions: (ProposedAction & { done?: boolean })[] };

interface JobState {
  id: string;
  order: string[];
  proposals: Record<string, Proposal>;
  done: boolean;
  error: { code: string; message: string } | null;
  cancelled?: boolean;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const normTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "");

/** An open project with the same title as Claude's proposed new one (e.g. created by an earlier item this session). */
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

export function ClarifyView({ regionActive, withClaude = false }: { regionActive: boolean; withClaude?: boolean }) {
  const ui = useUI();
  const meta = useMeta();
  // Claude is optional: K clarifies by hand on this screen; ⌥K asks Claude for proposals.
  const byHand = !withClaude;
  const s = useStore((x) => x);
  const [job, setJob] = useState<JobState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const originals = useRef<Record<string, Proposal>>({});
  const [index, setIndex] = useState(0);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [row, setRow] = useState(0);
  const corrections = useRef(0);
  const card = useRef<HTMLDivElement>(null);

  const start = useCallback(async (fresh = false, isLive: () => boolean = () => true) => {
    setStartError(null);
    setJob(null);
    if (byHand) {
      // A session with no Claude: every Inbox item gets a blank decision, its first line as the first action.
      const items = getState()
        .stuff.filter((x) => x.status === "inbox")
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const proposals: Record<string, Proposal> = {};
      for (const st of items) proposals[st.id] = blankDecision(st.id, st.text);
      setJob({ id: "by-hand", order: items.map((x) => x.id), proposals, done: true, error: null });
      return;
    }
    try {
      const res = await fetch("/api/clarify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fresh }) });
      const j = (await res.json()) as JobState;
      // The screen closed while the job was starting: stop it rather than paying for it.
      if (!isLive()) {
        if (!j.done) void fetch(`/api/clarify/${j.id}`, { method: "DELETE" });
        return;
      }
      setJob(j);
    } catch (e) {
      if (isLive()) setStartError((e as Error).message);
    }
  }, [byHand]);

  useEffect(() => {
    let live = true;
    void start(false, () => live);
    return () => {
      live = false;
    };
  }, [start]);

  // Leaving Clarify (Esc, another list, closing the tab) stops Claude; finished proposals stay cached.
  const jobRef = useRef<JobState | null>(null);
  const handledRef = useRef(handled);
  jobRef.current = job;
  handledRef.current = handled;
  useEffect(
    () => () => {
      const j = jobRef.current;
      if (!j || j.done) return;
      void fetch(`/api/clarify/${j.id}`, { method: "DELETE", keepalive: true });
      // A job that failed never ran; there is nothing to report stopping.
      if (j.error) return;
      const ready = Object.keys(j.proposals).filter((id) => !handledRef.current.has(id)).length;
      notify(
        ready
          ? `Stopped Claude. ${plural(ready, "proposal")} ready for next time; the rest stay in the Inbox.`
          : "Stopped Claude. Your Inbox is unchanged.",
      );
    },
    [],
  );

  /** Stop Claude but keep reviewing what is already proposed. */
  const stop = async () => {
    if (!job || job.done) return;
    const res = await fetch(`/api/clarify/${job.id}`, { method: "DELETE" });
    const j = (await res.json()) as JobState;
    setJob(j);
    const ready = Object.keys(j.proposals).filter((id) => !handled.has(id)).length;
    if (!ready) {
      notify("Stopped Claude before any proposals were ready. Your Inbox is unchanged.");
      ui.leaveClarify();
    } else {
      notify(`Stopped Claude. Review the ${plural(ready, "proposal")} already made; the rest stay in the Inbox.`);
    }
  };

  // Poll while Claude works through the rest of the inbox.
  useEffect(() => {
    if (!job || job.done) return;
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/clarify/${job.id}`);
      if (res.ok) setJob(await res.json());
    }, 900);
    return () => window.clearTimeout(t);
  }, [job]);

  useEffect(() => {
    if (!job) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const [k, p] of Object.entries(job.proposals)) {
        if (!next[k]) {
          next[k] = clone(p);
          originals.current[k] = clone(p);
        }
      }
      return next;
    });
  }, [job]);

  const queue = useMemo(
    () =>
      job
        ? job.order.filter(
            (id) =>
              (s.stuff.some((x) => x.id === id && x.status === "inbox") || handled.has(id)) &&
              // After a stop, items Claude never reached drop out of this session.
              (!job.cancelled || Boolean(job.proposals[id]) || handled.has(id)),
          )
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

  const goNext = () => {
    const after = queue.findIndex((id, i) => i > index && !handled.has(id));
    if (after >= 0) setIndex(after);
    else {
      const any = queue.findIndex((id) => !handled.has(id));
      if (any >= 0) setIndex(any);
    }
  };
  const goPrev = () => {
    for (let i = index - 1; i >= 0; i--) {
      if (!handled.has(queue[i])) return setIndex(i);
    }
  };

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

  const recordCorrections = (id: string, d: Draft, ops: Op[]) => {
    if (byHand) return; // no proposal, so nothing Claude could learn from
    const o = originals.current[id];
    const text = current?.text ?? "";
    if (!o) return;
    const add = (field: string, proposed: string, chosen: string) => {
      if (proposed === chosen) return;
      corrections.current++;
      ops.push({ type: "create", table: "corrections", row: { id: uid(), stuff_text: text.slice(0, 400), field, proposed, chosen, used: 0, created_at: stamp() } });
    };
    add("outcome", o.disposition, d.disposition);
    const projName = (p: string | null, np: Draft["new_project"]) => (p === "new" ? `new project “${np?.title ?? ""}”` : getState().projects.find((x) => x.id === p)?.title ?? "none");
    d.actions.forEach((a, i) => {
      const oa = o.actions[i];
      if (!oa) return;
      add("context", oa.context ?? "none", a.context ?? "none");
      add("project", projName(oa.project, o.new_project), projName(a.project, d.new_project));
      add("list", oa.kind, a.kind);
    });
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
      label = "Trashed";
    } else if (d.disposition === "reference") {
      const rid = uid();
      const ref = d.reference ?? { title: current.text.split("\n")[0], notes: "" };
      ops.push({ type: "create", table: "refs", row: { id: rid, title: ref.title, notes: [ref.notes, current.text].filter(Boolean).join("\n\n---\n"), project_id: null, status: "active", created_at: stamp() } });
      moveFiles("ref", rid);
      label = `Filed as reference: ${ref.title}`;
    } else {
      // Contexts and areas named by Claude that don't exist yet are created on the fly.
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
          const area = st.areas.find((a) => a.name.toLowerCase() === d.new_project!.area!.toLowerCase());
          if (area) areaId = area.id;
          else {
            areaId = uid();
            ops.push({ type: "create", table: "areas", row: { id: areaId, name: d.new_project.area, sort: st.areas.length } });
          }
        }
        const p = newProject({ title: d.new_project.title, area_id: areaId, status: d.disposition === "someday" ? "someday" : "active" });
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
      // Keep the original capture text with the first action so nothing is lost.
      if (created[0] && current.text.trim() && current.text.trim() !== d.actions[0]?.title) {
        const i = ops.findIndex((o) => o.type === "create" && o.table === "actions" && (o.row as { id: string }).id === created[0]);
        if (i >= 0) (ops[i] as { row: Record<string, unknown> }).row.notes = `Captured: ${current.text.trim()}`;
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
    recordCorrections(current.id, d, ops);
    finishItem(current.id, label, ops);
  };

  const trashItem = () => {
    if (!current) return;
    finishItem(current.id, "Trashed", [{ type: "patch", table: "stuff", id: current.id, data: { status: "trashed", processed_at: stamp() } }]);
  };

  // Repeated corrections can become rules, but only when the owner asks Claude (R at the end, or Settings).
  const offerRules = corrections.current >= 3;
  const askRules = () => {
    corrections.current = 0;
    void suggestRules();
  };

  const pickFor = (i: number, field: "context" | "project" | "due" | "defer" | "time" | "energy" | "kind" | "who") => {
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
        createLabel: (q) => `Use new context “${q.startsWith("@") ? q : "@" + q}”`,
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
          { id: "item:reference", label: "Whole item → Reference" },
          { id: "item:trash", label: "Whole item → Trash" },
        ],
        current: a.kind,
        onPick: (k) => {
          if (!k) return;
          if (k.startsWith("item:")) update((d) => (d.disposition = k.slice(5) as Draft["disposition"]));
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

  const ready = Boolean(current && draft);
  const err = startError ?? job?.error?.message;
  const stopped = Boolean(err && !draft);
  const backLabel = ui.clarifyReturn() === "review" ? "Back to the Weekly Review" : "Back to the Inbox";
  const keyProblem = !meta.hasKey || /api key/i.test(err ?? "");
  // Ways forward when Claude can't run: add a key right here, or file the Inbox by hand.
  const addKey = () => promptApiKey(ui, () => void start(true));
  const fileByHand = () => {
    ui.go("inbox");
    runWhenReady("inbox.file");
  };
  const commands: Command[] = [
    { id: "cl.accept", label: "Accept proposal and continue", group: "Clarify", keys: ["mod+enter"], inInput: true, enabled: ready, run: () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.setTimeout(accept, 0);
    } },
    { id: "cl.next", label: "Skip to next item", group: "Clarify", keys: ["ctrl+."], inInput: true, run: goNext },
    { id: "cl.prev", label: "Previous item", group: "Clarify", keys: ["ctrl+,"], inInput: true, run: goPrev },
    { id: "cl.trash", label: "Trash this item", group: "Clarify", keys: ["backspace", "delete"], enabled: Boolean(current), run: trashItem },
    { id: "cl.done", label: "Done it now (two-minute rule)", group: "Clarify", keys: ["e"], enabled: ready, run: () => {
      const i = rowOfFocus();
      if (draft?.actions[i]) updateRow(i, { done: !draft.actions[i].done });
    } },
    { id: "cl.add", label: "Add an action", group: "Clarify", keys: ["n"], enabled: ready, run: addRow },
    { id: "cl.remove", label: "Remove this action", group: "Clarify", keys: ["alt+backspace"], inInput: true, enabled: ready, run: () => {
      const i = rowOfFocus();
      update((d) => d.actions.splice(i, 1));
    } },
    { id: "cl.context", label: "Context", group: "Fields", keys: ["c"], enabled: ready, run: () => pickFor(rowOfFocus(), "context") },
    { id: "cl.project", label: "Project", group: "Fields", keys: ["p"], enabled: ready, run: () => pickFor(rowOfFocus(), "project") },
    { id: "cl.due", label: "Due date", group: "Fields", keys: ["d"], enabled: ready, run: () => pickFor(rowOfFocus(), "due") },
    { id: "cl.defer", label: "Start date", group: "Fields", keys: ["s"], enabled: ready, run: () => pickFor(rowOfFocus(), "defer") },
    { id: "cl.time", label: "Time estimate (then 1–6)", group: "Fields", keys: ["t"], enabled: ready, run: () => pickFor(rowOfFocus(), "time") },
    { id: "cl.energy", label: "Energy (then 1–3)", group: "Fields", keys: ["g"], enabled: ready, run: () => pickFor(rowOfFocus(), "energy") },
    { id: "cl.kind", label: "File as (list or whole item)", group: "Fields", keys: ["v"], enabled: ready, run: () => pickFor(rowOfFocus(), "kind") },
    { id: "cl.delegate", label: "Delegate → Waiting For", group: "Fields", keys: ["shift+f"], enabled: ready, run: () => pickFor(rowOfFocus(), "who") },
    {
      id: "cl.retry",
      label: byHand ? "Clarify with Claude instead" : "Ask Claude again (fresh)",
      group: "Clarify",
      keys: ["alt+k"],
      run: () => {
        if (byHand) return ui.startClarify(ui.clarifyReturn(), true);
        if (job && !job.done) void fetch(`/api/clarify/${job.id}`, { method: "DELETE" });
        void start(true);
      },
    },
    {
      id: "cl.leave",
      label: "Leave the field, then Clarify",
      group: "Clarify",
      keys: ["escape"],
      inInput: true,
      run: () => {
        const el = document.activeElement as HTMLElement | null;
        const rowEl = el?.closest<HTMLElement>("[data-row]");
        if (el && rowEl && el !== rowEl) rowEl.focus();
        else if (el && card.current?.contains(el) && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
        else ui.leaveClarify();
      },
    },
    { id: "cl.stop", label: "Stop Claude (keep reviewing what's ready)", group: "Clarify", keys: ["shift+escape"], inInput: true, enabled: Boolean(job && !job.done), run: () => void stop() },
    { id: "cl.edit", label: "Edit the action text", group: "Clarify", keys: ["f2"], enabled: ready, run: () => card.current?.querySelector<HTMLElement>(`[data-row='${rowOfFocus()}'] .p-title`)?.focus() },
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
    { id: "cl.rowdown", label: "Next proposed action", group: "Clarify", keys: ["arrowdown"], enabled: ready, run: () => card.current?.querySelector<HTMLElement>(`[data-row='${rowOfFocus() + 1}']`)?.focus() },
    { id: "cl.rowup", label: "Previous proposed action", group: "Clarify", keys: ["arrowup"], enabled: ready, run: () => card.current?.querySelector<HTMLElement>(`[data-row='${Math.max(0, rowOfFocus() - 1)}']`)?.focus() },
  ];
  const finished = Boolean(job && queue.length > 0 && index >= queue.length);
  commands.push(
    { id: "cl.rules", label: "Ask Claude to turn your corrections into rules", group: "Clarify", keys: ["r"], enabled: finished && offerRules, run: askRules },
    { id: "cl.addkey", label: meta.hasKey ? "Change the API key" : "Add an API key", group: "Clarify", keys: ["enter"], enabled: stopped && keyProblem, run: addKey },
    { id: "cl.byhand", label: "File the Inbox", group: "Clarify", keys: ["v"], enabled: stopped, run: fileByHand },
    { id: "cl.hand", label: "Clarify without Claude", group: "Clarify", keys: ["k"], enabled: stopped, run: () => ui.startClarify(ui.clarifyReturn()) },
  );
  useCommands("clarify", commands, { priority: 15, active: regionActive });

  if (stopped) {
    return (
      <div className="clarify-state" role="alert">
        <Tape size="md">Clarify stopped</Tape>
        <p className="clarify-msg">{err}</p>
        <KeyChoices
          choices={[
            ...(keyProblem
              ? [{ k: "enter", label: meta.hasKey ? "Enter a working API key and start" : "Add your Claude API key and start", run: addKey }]
              : [{ k: "alt+k", label: "Ask Claude again", run: () => void start(true) }]),
            { k: "k", label: "Clarify without Claude", run: () => ui.startClarify(ui.clarifyReturn()) },
            { k: "v", label: "File the Inbox", run: fileByHand },
            { k: "escape", label: backLabel, run: ui.leaveClarify },
          ]}
        />
      </div>
    );
  }

  if (job && queue.length === 0) {
    return (
      <div className="clarify-state">
        <Tape size="md">Inbox zero</Tape>
        <p className="clarify-msg">Nothing left to clarify. Your lists are up to date.</p>
        <KeyChoices choices={[{ k: "escape", label: backLabel, run: ui.leaveClarify }]} />
      </div>
    );
  }

  if (job && index >= queue.length) {
    return (
      <div className="clarify-state">
        <Tape size="md">Inbox clear</Tape>
        <p className="clarify-msg">{plural(handled.size, "item")} clarified. Everything has a place.</p>
        <KeyChoices
          choices={[
            ...(offerRules ? [{ k: "r", label: "Ask Claude to turn your corrections into rules", run: askRules }] : []),
            { k: "escape", label: backLabel, run: ui.leaveClarify },
            ...(ui.clarifyReturn() === "review" ? [] : [{ k: "ctrl+shift+2", label: "Work from Next Actions", run: () => ui.go("next") }]),
          ]}
        />
      </div>
    );
  }

  const done = handled.size;
  const total = queue.length;

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
        {job && !job.done && (
          <span className="muted-text small clarify-reading">
            Claude is reading {plural(total - Object.keys(job.proposals).length, "more item")}…
            <button type="button" className="text-btn" onClick={() => void stop()}>
              Stop
            </button>
          </span>
        )}
        {job?.cancelled && <span className="muted-text small">Stopped. Items Claude didn't reach stay in the Inbox.</span>}
        {err && <span className="error-text small">{err}</span>}
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

        <section className="clarify-proposal" aria-label="Claude's proposal" aria-busy={!draft}>
          <h2 className="pane-h">
            {byHand ? "Your decision" : "Proposal"}
            {draft && <Tape>{DISPOSITIONS[draft.disposition]}</Tape>}
          </h2>
          {!draft ? (
            <div className="proposal-skeleton" aria-live="polite">
              <p className="muted-text">Claude is reading this item…</p>
              <i />
              <i />
              <i />
            </div>
          ) : (
            <>
              {draft.disposition === "reference" && (
                <div className="p-block">
                  <label className="field">
                    <span className="field-label">Reference title</span>
                    <input
                      className="field-text p-title"
                      value={draft.reference?.title ?? ""}
                      onChange={(e) => update((d) => (d.reference = { title: e.target.value, notes: d.reference?.notes ?? "" }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Notes</span>
                    <textarea className="field-text" rows={3} value={draft.reference?.notes ?? ""} onChange={(e) => update((d) => (d.reference = { title: d.reference?.title ?? "", notes: e.target.value }))} />
                  </label>
                </div>
              )}
              {draft.disposition === "trash" && <p className="p-note">Claude thinks this can go. Accept to trash it, or file it as something else.</p>}
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
                            items: areaItems().map((a) => ({ ...a, id: a.label })),
                            current: draft.new_project?.area ?? null,
                            noneLabel: "No area",
                            createLabel: (q) => `New area “${q}”`,
                            onCreate: (q) => update((d) => (d.new_project = { ...d.new_project!, area: q })),
                            onPick: (a) => update((d) => (d.new_project = { ...d.new_project!, area: a })),
                          })
                        }
                      >
                        {draft.new_project.area ? <Tape>{draft.new_project.area}</Tape> : <span className="dash">No area</span>}
                      </button>
                    </div>
                  )}
                  <ol className="p-actions">
                    {draft.actions.map((a, i) => (
                      <li key={i} data-row={i} tabIndex={0} aria-label={`Proposed action ${i + 1}: ${a.title}`} className={`p-row ${a.done ? "is-done" : ""}`} onFocus={() => setRow(i)}>
                        <div className="p-row-top">
                          <span className="p-kind">{a.kind === "next" ? "Next" : a.kind === "waiting" ? "Waiting" : "Someday"}</span>
                          <input className="p-title" value={a.title} aria-label={`Action ${i + 1}`} placeholder="Describe the next action" onChange={(e) => updateRow(i, { title: e.target.value })} />
                          {a.two_minute && (
                            <span className={`two-min ${a.done ? "is-on" : ""}`} title="Under two minutes: E marks it done now">
                              <Timer size={12} strokeWidth={2} aria-hidden /> 2 min
                            </span>
                          )}
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
                          <button type="button" className="p-field" onClick={() => pickFor(i, "time")}>
                            <span className="p-lbl">Time</span>
                            {a.time_min ? formatTime(a.time_min) : <span className="dash" aria-hidden="true">–</span>}
                          </button>
                          <button type="button" className="p-field" onClick={() => pickFor(i, "energy")}>
                            <span className="p-lbl">Energy</span>
                            <Energy level={a.energy} />
                          </button>
                        </div>
                        {a.done && <p className="p-done-note">Done now: goes straight to the Done log.</p>}
                      </li>
                    ))}
                  </ol>
                  {draft.actions.length === 0 && <p className="p-note">No actions proposed. Add one if this needs doing.</p>}
                </>
              )}

            </>
          )}
        </section>
      </div>
      <KeyHints
        hints={[
          { k: "mod+enter", label: "Accept" },
          ...(byHand ? [{ k: "n", label: "Add action" }] : []),
          { k: "v", label: "File as" },
          { k: "e", label: "Done now" },
          { k: "backspace", label: "Trash" },
          { k: "ctrl+.", label: "Skip" },
        ]}
      />
    </div>
  );
}
