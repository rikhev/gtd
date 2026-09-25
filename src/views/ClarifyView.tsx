import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mail, StickyNote, Timer } from "lucide-react";
import { getState, load, mutate, newAction, newProject, notify, plural, stamp, uid, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { ContextCode, Energy, Tape } from "../components/bits.tsx";
import { areaItems, contextItems, projectItems, CONTEXT_COLORS } from "../actionCommands.tsx";
import { formatLong, formatTime } from "../../shared/dates.ts";
import type { ID, Op, Proposal, ProposedAction } from "../../shared/types.ts";

type Draft = Omit<Proposal, "actions"> & { actions: (ProposedAction & { done?: boolean })[] };

interface JobState {
  id: string;
  order: string[];
  proposals: Record<string, Proposal>;
  done: boolean;
  error: { code: string; message: string } | null;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const DISPOSITIONS: Record<Draft["disposition"], string> = {
  actionable: "Actionable",
  someday: "Someday / Maybe",
  reference: "Reference",
  trash: "Trash",
};

export function ClarifyView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
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

  const start = useCallback(async (fresh = false) => {
    setStartError(null);
    setJob(null);
    try {
      const res = await fetch("/api/clarify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fresh }) });
      const j = (await res.json()) as JobState;
      setJob(j);
    } catch (e) {
      setStartError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

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

  const queue = useMemo(() => (job ? job.order.filter((id) => s.stuff.some((x) => x.id === id && x.status === "inbox") || handled.has(id)) : []), [job, s.stuff, handled]);
  const pending = queue.filter((id) => !handled.has(id));
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
      if (d.new_project && (usesNew || d.actions.length === 0)) {
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
        newProjectId ? `project “${d.new_project?.title}”` : "",
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

  // When the queue is empty, look for repeated corrections worth turning into rules.
  const allDone = job && pending.length === 0 && (job.done || queue.length > 0);
  useEffect(() => {
    if (!allDone || corrections.current < 3) return;
    corrections.current = 0;
    void fetch("/api/rules/suggest", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (j.rules?.length) {
          notify(`Claude suggests ${plural(j.rules.length, "rule")} from your corrections · ⌘K › Rules to review`);
          void load();
        }
      })
      .catch(() => undefined);
  }, [allDone]);

  const pickFor = (i: number, field: "context" | "project" | "due" | "defer" | "time" | "energy" | "kind" | "who") => {
    if (!draft || !draft.actions[i]) return;
    const a = draft.actions[i];
    if (field === "context")
      ui.openPicker({
        type: "list",
        title: "Context",
        items: contextItems().map((c) => ({ ...c, id: c.label })),
        current: a.context,
        noneLabel: "No context",
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
    if (field === "who")
      ui.openPicker({
        type: "text",
        title: "Delegate to",
        current: a.waiting_who ?? "",
        placeholder: "Who is it waiting on?",
        onPick: (who) => updateRow(i, { kind: "waiting", waiting_who: who.trim() || null }),
      });
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
    { id: "cl.retry", label: "Ask Claude again (fresh)", group: "Clarify", keys: ["k"], run: () => void start(true) },
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
        else ui.go("inbox");
      },
    },
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
  useCommands("clarify", commands, { priority: 15, active: regionActive });

  const err = startError ?? job?.error?.message;

  if (err && !draft) {
    return (
      <div className="clarify-state">
        <Tape size="md">Clarify stopped</Tape>
        <p className="clarify-msg">{err}</p>
        <p className="muted-text">
          Fix that, then ask Claude again, or go back to the Inbox.
        </p>
      </div>
    );
  }

  if (job && queue.length === 0) {
    return (
      <div className="clarify-state">
        <Tape size="md">Inbox zero</Tape>
        <p className="clarify-msg">Nothing left to clarify.</p>
        <p className="muted-text">
          Your lists are up to date.
        </p>
      </div>
    );
  }

  if (job && index >= queue.length) {
    return (
      <div className="clarify-state">
        <Tape size="md">Inbox clear</Tape>
        <p className="clarify-msg">{plural(handled.size, "item")} clarified. Everything has a place.</p>
        <p className="muted-text">
          Work from Next Actions, or check your Projects.
        </p>
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
        {job && !job.done && <span className="muted-text small">Claude is reading {plural(total - Object.keys(job.proposals).length, "more item")}…</span>}
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
            Proposal
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
                      <span className="field-label">New project</span>
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
                          <input className="p-title" value={a.title} aria-label={`Action ${i + 1}`} placeholder="Verb-first next action" onChange={(e) => updateRow(i, { title: e.target.value })} />
                          {a.two_minute && (
                            <span className={`two-min ${a.done ? "is-on" : ""}`} title="Under two minutes: E marks it done now">
                              <Timer size={12} strokeWidth={2} aria-hidden /> 2 min
                            </span>
                          )}
                        </div>
                        <div className="p-fields">
                          <button type="button" className="p-field" onClick={() => pickFor(i, "project")}>
                            <span className="p-lbl">Project</span>
                            {a.project === "new" ? draft.new_project?.title : a.project ? s.projects.find((p) => p.id === a.project)?.title ?? <span className="dash">–</span> : <span className="dash">–</span>}
                          </button>
                          <button type="button" className="p-field" onClick={() => pickFor(i, "context")}>
                            <span className="p-lbl">Context</span>
                            {a.context ? <ContextCode ctx={s.contexts.find((c) => c.name.toLowerCase() === a.context!.toLowerCase()) ?? { id: "", name: a.context, color: "var(--ink-3)", sort: 0 }} /> : <span className="dash">–</span>}
                          </button>
                          {a.kind === "waiting" && (
                            <button type="button" className="p-field" onClick={() => pickFor(i, "who")}>
                              <span className="p-lbl">Waiting on</span>
                              {a.waiting_who ?? <span className="dash">–</span>}
                            </button>
                          )}
                          <button type="button" className="p-field" onClick={() => pickFor(i, "due")}>
                            <span className="p-lbl">Due</span>
                            {a.due ? formatLong(a.due) : <span className="dash">–</span>}
                          </button>
                          <button type="button" className="p-field" onClick={() => pickFor(i, "defer")}>
                            <span className="p-lbl">Start</span>
                            {a.defer ? formatLong(a.defer) : <span className="dash">–</span>}
                          </button>
                          <button type="button" className="p-field" onClick={() => pickFor(i, "time")}>
                            <span className="p-lbl">Time</span>
                            {a.time_min ? formatTime(a.time_min) : <span className="dash">–</span>}
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
    </div>
  );
}
