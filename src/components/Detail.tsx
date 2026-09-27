import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, Paperclip, Pin } from "lucide-react";
import { mutate, newAction, notify, projectHealth, stallReason, upload, useMeta, useStore } from "../store.ts";
import { useUI, type Target } from "../ui.tsx";
import { runWhenReady, useCommands } from "../keys.ts";
import { askContext, editors } from "../actionCommands.tsx";
import { projectEditors } from "../views/ProjectsView.tsx";
import { ContextCode, Energy, KeyHints, Lamp, Marker } from "./bits.tsx";
import { formatLong, formatTime, parseRecurrence, recurrenceLabel, today } from "../../shared/dates.ts";
import type { Action, FileRow, Project, Ref, Stuff, TableName } from "../../shared/types.ts";

/** Text field that commits on blur (one undo step per edit, not per keystroke). */
function TextField({
  label,
  value,
  onCommit,
  multiline,
  rows = 3,
  placeholder,
  autoFocus,
  className,
  mark,
}: {
  label: string;
  /** A small mark after the label, such as the project's health lamp. */
  mark?: ReactNode;
  value: string;
  /** Return false to refuse the edit; the field then snaps back to the saved value. */
  onCommit: (v: string) => void | boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value && onCommit(v) === false) setV(value);
  };
  const common = {
    value: v,
    placeholder,
    "aria-label": label,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: commit,
    spellCheck: true,
  };
  return (
    <label className={`field ${className ?? ""}`}>
      <span className="field-label">
        {label}
        {mark}
      </span>
      {multiline ? (
        <textarea {...common} rows={rows} className="field-text" data-autofocus={autoFocus || undefined} />
      ) : (
        <input
          {...common}
          className="field-text"
          data-autofocus={autoFocus || undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
    </label>
  );
}

// Field keys sit on the fields themselves; the line keeps only what isn't a field.
const DETAIL_HINTS: Record<string, { k: string; label: string }[]> = {
  stuff: [
    { k: "v", label: "File as" },
    { k: "k", label: "Clarify" },
    { k: "f2", label: "Edit" },
    { k: "escape", label: "Close" },
  ],
  project: [
    { k: "t", label: "Add next action" },
    { k: "f2", label: "Edit" },
    { k: "escape", label: "Close" },
  ],
  other: [
    { k: "f2", label: "Edit" },
    { k: "escape", label: "Close" },
  ],
};

/** Whether the detail pane is the active region: its fields' letter keys only work then. */
const DetailActive = createContext(false);

function PickField({ label, children, onOpen, k }: { label: string; children: ReactNode; onOpen: () => void; k?: string }) {
  // The key shown beside a field (D for Due, P for Project…) opens its picker while the pane has focus.
  const active = useContext(DetailActive);
  useCommands(`detail-field:${label}`, k ? [{ id: `detail.field.${label}`, label: `${label}…`, group: "Details", keys: [k.toLowerCase()], run: () => open() }] : [], { priority: 21, active: active && Boolean(k) });
  // Screen readers hear the field, its value and its key: "Due, Fri 25 Sep 2026, D".
  const id = useId();
  // Opening from the key or a click first puts focus on this field, so the picker anchors under it.
  const btn = useRef<HTMLButtonElement>(null);
  const open = () => {
    btn.current?.focus({ preventScroll: true });
    onOpen();
  };
  return (
    <div className="field">
      <span className="field-head">
        <span className="field-label" id={`${id}-l`}>
          {label}
        </span>
        {/* Each field shows its own key while the pane has focus (the key is also announced via aria-keyshortcuts). */}
        {k && active && (
          <kbd className="kbd field-key" aria-hidden="true">
            {k}
          </kbd>
        )}
      </span>
      <button
        type="button"
        ref={btn}
        className="field-pick"
        onClick={open}
        aria-labelledby={`${id}-l ${id}-v`}
        aria-keyshortcuts={k}
        title={typeof children === "string" ? children : undefined}
      >
        <span className="field-pick-value" id={`${id}-v`}>
          {children}
        </span>
      </button>
    </div>
  );
}

/** A due or follow-up date in the pane, styled and spoken like the list does when it has passed. */
function DueLong({ date, done }: { date: string; done?: boolean }) {
  const overdue = !done && date < today();
  return (
    <span className={`date ${overdue ? "is-overdue" : ""}`}>
      {formatLong(date)}
      {overdue && <span className="visually-hidden">, overdue</span>}
    </span>
  );
}

const none = (
  <>
    <span className="dash" aria-hidden="true">
      –
    </span>
    <span className="visually-hidden">not set</span>
  </>
);

function Files({ owner }: { owner: { kind: FileRow["owner_kind"]; id: string } }) {
  const files = useStore((s) => s.files).filter((f) => f.owner_kind === owner.kind && f.owner_id === owner.id);
  const input = useRef<HTMLInputElement>(null);
  useCommands(`detail-files:${owner.id}`, [{ id: "detail.attach", label: "Attach file", group: "Details", keys: ["mod+o"], inInput: true, run: () => input.current?.click() }], {
    priority: 30,
  });
  return (
    <section className="detail-files">
      <h3 className="detail-h">
        Files <span className="count">{files.length || ""}</span>
      </h3>
      {files.length === 0 && <p className="muted-text small">No files attached.</p>}
      <ul>
        {files.map((f) => (
          <li key={f.id} className="file-row">
            <Paperclip size={13} strokeWidth={1.75} aria-hidden />
            <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="file-name">
              {f.name}
            </a>
            <span className="file-size">{Math.max(1, Math.round(f.size / 1024))} KB</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${f.name}`}
              onClick={async () => {
                await fetch(`/api/files/${f.id}`, { method: "DELETE" });
                mutate("File removed", [{ type: "delete", table: "files", id: f.id }], {});
              }}
            >
              <X size={13} strokeWidth={2} />
            </button>
            {f.mime.startsWith("image/") && <img className="file-thumb" src={`/api/files/${f.id}`} alt={f.name} />}
            {f.preview && !f.mime.startsWith("image/") && owner.kind === "stuff" && <pre className="file-preview">{f.preview.slice(0, 1600)}</pre>}
          </li>
        ))}
      </ul>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files, owner);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function patch(table: TableName, id: string, data: Record<string, unknown>, label = "Saved") {
  mutate(label, [{ type: "patch", table, id, data }]);
}

function ActionDetail({ a }: { a: Action }) {
  const ui = useUI();
  const ed = editors(ui);
  const s = useStore((x) => x);
  const ctx = s.contexts.find((c) => c.id === a.context_id);
  const proj = s.projects.find((p) => p.id === a.project_id);
  const rec = a.recurrence ? parseRecurrence(a.recurrence) : null;
  const done = a.status === "done";
  return (
    <>
      {/* Flagged for today or done is the one thing the fields don't say, so its mark rides after the label. */}
      <TextField label="Subject" mark={a.flagged || done ? <Marker flagged={Boolean(a.flagged)} done={done} /> : undefined} value={a.title} onCommit={(v) => patch("actions", a.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      <div className="field-grid">
        <PickField label="Project" k="P" onOpen={() => ed.project([a.id])}>
          {proj ? proj.title : none}
        </PickField>
        <PickField label="Context" k="C" onOpen={() => ed.context([a.id])}>
          <ContextCode ctx={ctx} />
        </PickField>
        <PickField label="Due" k="D" onOpen={() => ed.date([a.id], "due")}>
          {a.due ? <DueLong date={a.due} done={a.status === "done"} /> : none}
        </PickField>
        <PickField label="Start" k="S" onOpen={() => ed.date([a.id], "defer")}>
          {a.defer ? formatLong(a.defer) : none}
        </PickField>
        <PickField label="Time" k="T" onOpen={() => ed.time([a.id])}>
          {a.time_min ? formatTime(a.time_min) : none}
        </PickField>
        <PickField label="Energy" k="G" onOpen={() => ed.energy([a.id])}>
          <Energy level={a.energy} />
        </PickField>
        <PickField label="Repeat" k="R" onOpen={() => ed.recurrence([a.id])}>
          {rec ? recurrenceLabel(rec) : none}
        </PickField>
        <PickField label="Bring back" k="B" onOpen={() => ed.date([a.id], "bring_back")}>
          {a.bring_back ? formatLong(a.bring_back) : none}
        </PickField>
      </div>
      {a.status === "waiting" && (
        <div className="field-grid">
          <TextField
            label="Waiting on"
            value={a.waiting_who ?? ""}
            onCommit={(v) => {
              if (!v.trim()) {
                notify("A Waiting For item needs someone or something to wait on. Move it with V to take it out of Waiting For.", { tone: "error" });
                return false;
              }
              patch("actions", a.id, { waiting_who: v.trim() });
            }}
          />
          <PickField label="Follow up" onOpen={() => ed.date([a.id], "followup")}>
            {a.followup ? <DueLong date={a.followup} done={a.status !== "waiting"} /> : none}
          </PickField>
          <div className="field">
            <span className="field-label">Since</span>
            <span className="field-static">{a.waiting_since ? formatLong(a.waiting_since) : "–"}</span>
          </div>
        </div>
      )}
      <TextField label="Notes" value={a.notes} multiline rows={6} onCommit={(v) => patch("actions", a.id, { notes: v })} placeholder="Details, links, phone numbers…" />
      <Files owner={{ kind: "action", id: a.id }} />
      <p className="detail-meta">
        Created {formatLong(a.created_at.slice(0, 10))}
        {a.completed_at ? ` · done ${formatLong(a.completed_at.slice(0, 10))}` : ""}
      </p>
    </>
  );
}

function ProjectDetail({ p }: { p: Project }) {
  const ui = useUI();
  const ed = projectEditors(ui);
  const s = useStore((x) => x);
  const meta = useMeta();
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState("");
  const area = s.areas.find((a) => a.id === p.area_id);
  // T, as on the Projects list: straight into "Add a next action" while the pane has focus.
  const active = useContext(DetailActive);
  const addInput = useRef<HTMLInputElement>(null);
  useCommands("detail-addnext", [{ id: "detail.addnext", label: "Add a next action to this project", group: "Details", keys: ["t"], run: () => addInput.current?.focus() }], { priority: 21, active });
  // A next action needs a context, as everywhere else: Enter asks for it, then adds the action.
  const addNext = () => {
    const title = draft.trim();
    if (!title) return;
    askContext(ui, `Context for “${title}”`, (context_id, extra) => {
      const a = newAction({ title, project_id: p.id, context_id, status: "next" });
      mutate(`Next action added to “${p.title || "Untitled project"}”`, [...extra, { type: "create", table: "actions", row: { ...a } }]);
      setDraft("");
      window.setTimeout(() => addInput.current?.focus(), 0);
    });
  };
  const acts = s.actions.filter((a) => a.project_id === p.id).sort((a, b) => a.sort - b.sort);
  const open = acts.filter((a) => ["next", "waiting", "someday"].includes(a.status));
  const done = acts.filter((a) => a.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return (
    <>
      {/* Area and status live in their own fields below; the head only carries the project's health, beside its name. */}
      <TextField label="Project" mark={<Lamp health={projectHealth(s, p)} />} value={p.title} onCommit={(v) => patch("projects", p.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      <div className="field-grid">
        <PickField label="Area" k="A" onOpen={() => ed.area([p.id])}>
          {area ? area.name : none}
        </PickField>
        <PickField label="Status" k="V" onOpen={() => ed.move([p.id])}>
          {{ active: "Active", someday: "Someday", done: "Done", trashed: "Trash" }[p.status]}
        </PickField>
        <PickField label="Due" k="D" onOpen={() => ed.date([p.id], "due")}>
          {p.due ? <DueLong date={p.due} done={p.status === "done"} /> : none}
        </PickField>
        <PickField label="Bring back" k="B" onOpen={() => ed.date([p.id], "bring_back")}>
          {p.bring_back ? formatLong(p.bring_back) : none}
        </PickField>
      </div>
      <section className="detail-actions">
        <h3 className="detail-h">
          Actions <span className="count">{open.length}</span>
          {active && (
            <kbd className="kbd field-key detail-h-key" aria-hidden="true">
              T
            </kbd>
          )}
        </h3>
        {stallReason(s, p) && (
          <p className="badge-line">
            <span className="badge">Stalled</span>{" "}
            {stallReason(s, p) === "no-next" ? "No next action. Add one below." : `Nothing here touched in ${meta.stallWeeks}+ weeks. Move it forward, or put it on hold.`}
          </p>
        )}
        <ul>
          {open.map((a) => (
            <li key={a.id}>
              <button type="button" className="mini-row" onClick={() => ui.openDetail({ kind: "action", id: a.id }, true)}>
                <Marker flagged={Boolean(a.flagged)} />
                <span className="mini-title">{a.title || "Untitled action"}</span>
                <span className="mini-meta">{a.status === "waiting" ? `Waiting · ${a.waiting_who ?? ""}` : a.status === "someday" ? "Someday" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={addInput}
          className="field-text add-action"
          value={draft}
          placeholder="Add a next action"
          aria-label="Add a next action"
          aria-keyshortcuts="T"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              addNext();
            }
          }}
        />
        {done.length > 0 && (
          <>
            <button type="button" className="group-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              <span className={`chev ${showDone ? "open" : ""}`} aria-hidden /> Done <span className="count">{done.length}</span>
            </button>
            {showDone && (
              <ul className="done-list">
                {done.map((a) => (
                  <li key={a.id} className="mini-row is-done">
                    <Marker flagged={false} done />
                    <span className="mini-title">{a.title}</span>
                    <span className="mini-meta">{a.completed_at ? formatLong(a.completed_at.slice(0, 10)) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <TextField label="Support notes" value={p.notes} multiline rows={10} onCommit={(v) => patch("projects", p.id, { notes: v })} placeholder="Plans, meeting notes, phone numbers, links…" className="notes-page" />
      <Files owner={{ kind: "project", id: p.id }} />
    </>
  );
}

function StuffDetail({ st }: { st: Stuff }) {
  return (
    <>
      <TextField label="Stuff" value={st.text} multiline rows={8} autoFocus onCommit={(v) => patch("stuff", st.id, { text: v }, "Edited")} />
      <Files owner={{ kind: "stuff", id: st.id }} />
      <p className="detail-meta">Captured {formatLong(st.created_at.slice(0, 10))}</p>
    </>
  );
}

function RefDetail({ r }: { r: Ref }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const proj = s.projects.find((p) => p.id === r.project_id);
  return (
    <>
      <TextField label="Title" value={r.title} onCommit={(v) => patch("refs", r.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      <PickField
        label="Project"
        onOpen={() =>
          ui.openPicker({
            type: "list",
            title: "Project",
            items: s.projects.filter((p) => p.status === "active").map((p) => ({ id: p.id, label: p.title })),
            noneLabel: "No project",
            onPick: (id) => patch("refs", r.id, { project_id: id }),
          })
        }
      >
        {proj ? proj.title : none}
      </PickField>
      <TextField label="Notes" value={r.notes} multiline rows={12} onCommit={(v) => patch("refs", r.id, { notes: v })} className="notes-page" />
      <Files owner={{ kind: "ref", id: r.id }} />
    </>
  );
}

export function Detail({ target, active }: { target: Target | null; active: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const root = useRef<HTMLElement>(null);

  useCommands(
    "detail",
    [
      {
        // One Escape, from anywhere in the pane: edits are saved on blur, the pane closes (unless pinned), you're back on the row.
        id: "detail.back",
        label: ui.detailPinned ? "Back to the list" : "Close details and go back to the list",
        group: "Details",
        keys: ["escape"],
        inInput: true,
        run: () => {
          (document.activeElement as HTMLElement | null)?.blur?.();
          if (!ui.detailPinned) ui.openDetail(null);
          ui.setRegion("list");
        },
      },
      {
        id: "detail.edit",
        label: "Edit the subject",
        group: "Details",
        keys: ["f2"],
        run: () => root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(),
      },
      {
        id: "detail.save",
        label: "Save and go back",
        group: "Details",
        keys: ["mod+enter"],
        inInput: true,
        run: () => {
          (document.activeElement as HTMLElement | null)?.blur?.();
          ui.setRegion("list");
        },
      },
      { id: "detail.close", label: "Close details", group: "Details", keys: ["mod+backspace"], inInput: true, run: () => ui.openDetail(null) },
      // An Inbox item's pane offers the Inbox's own two verbs.
      {
        id: "detail.file",
        label: "File as…",
        group: "Details",
        keys: ["v"],
        enabled: target?.kind === "stuff",
        run: () => {
          if (!ui.detailPinned) ui.openDetail(null);
          ui.setRegion("list");
          runWhenReady("inbox.file");
        },
      },
      { id: "detail.clarify", label: "Clarify", group: "Details", keys: ["k"], enabled: target?.kind === "stuff", run: () => ui.startClarify() },
    ],
    { priority: 20, active },
  );

  // Opening the pane puts focus on the pane itself, not in a field: a stray letter can't edit the title.
  // Tab or F2 goes into the subject.
  useEffect(() => {
    if (active) root.current?.focus({ preventScroll: true });
  }, [active, target?.id]);

  // The pane is announced by what it shows: "Action details: Pay the VAT for Q3".
  const paneName = (() => {
    if (!target) return "Details";
    const kind = ({ action: "Action", project: "Project", stuff: "Inbox item", ref: "Reference" } as Record<string, string>)[target.kind] ?? "Item";
    const title =
      target.kind === "action"
        ? s.actions.find((x) => x.id === target.id)?.title
        : target.kind === "project"
          ? s.projects.find((x) => x.id === target.id)?.title
          : target.kind === "stuff"
            ? s.stuff.find((x) => x.id === target.id)?.text.split("\n")[0]
            : s.refs.find((x) => x.id === target.id)?.title;
    return `${kind} details${title ? `: ${title}` : ""}`;
  })();

  let body: ReactNode = null;
  if (!target) body = null;
  else if (target.kind === "action") {
    const a = s.actions.find((x) => x.id === target.id);
    body = a ? <ActionDetail key={a.id} a={a} /> : null;
  } else if (target.kind === "project") {
    const p = s.projects.find((x) => x.id === target.id);
    body = p ? <ProjectDetail key={p.id} p={p} /> : null;
  } else if (target.kind === "stuff") {
    const st = s.stuff.find((x) => x.id === target.id);
    body = st ? <StuffDetail key={st.id} st={st} /> : null;
  } else if (target.kind === "ref") {
    const r = s.refs.find((x) => x.id === target.id);
    body = r ? <RefDetail key={r.id} r={r} /> : null;
  }

  return (
    <aside ref={root} className={`detail ${active ? "is-active" : ""}`} aria-label={paneName} tabIndex={-1}>
      <div className="detail-bar">
        <h2 className="detail-title" id="detail-title">
          Details
        </h2>
        <span className="detail-bar-tools">
          <button
            type="button"
            className={`icon-btn pin-btn ${ui.detailPinned ? "is-on" : ""}`}
            aria-label="Pin details"
            aria-pressed={ui.detailPinned}
            aria-keyshortcuts="Alt+P"
            title={ui.detailPinned ? "Pinned: stays open beside every list (⌥P)" : "Pin: keep the pane open beside every list (⌥P)"}
            onClick={() => ui.setDetailPinned(!ui.detailPinned)}
          >
            <Pin size={14} strokeWidth={2} />
          </button>
          <button type="button" className="icon-btn" aria-label="Close details" onClick={() => ui.openDetail(null)}>
            <X size={14} strokeWidth={2} />
          </button>
        </span>
      </div>
      <DetailActive.Provider value={active}>
        <div className="detail-body">
          {body ?? <p className="muted-text">{target ? "This item no longer exists." : "Nothing here has details. Move the cursor onto an item, action or project."}</p>}
          {/* The pane is a letter-key mode, so while it has focus it names its few keys (owner's decision). */}
          {active && body && target && <KeyHints hints={DETAIL_HINTS[target.kind] ?? DETAIL_HINTS.other} />}
        </div>
      </DetailActive.Provider>
    </aside>
  );
}
