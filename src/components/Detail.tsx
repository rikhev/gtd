import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Paperclip } from "lucide-react";
import { mutate, newAction, upload, useStore } from "../store.ts";
import { useUI, type Target } from "../ui.tsx";
import { useCommands } from "../keys.ts";
import { editors } from "../actionCommands.tsx";
import { projectEditors } from "../views/ProjectsView.tsx";
import { ContextCode, Energy, Marker, Tape } from "./bits.tsx";
import { formatLong, formatTime, parseRecurrence, recurrenceLabel } from "../../shared/dates.ts";
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
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
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
      <span className="field-label">{label}</span>
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

function PickField({ label, children, onOpen, k }: { label: string; children: ReactNode; onOpen: () => void; k?: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button type="button" className="field-pick" onClick={onOpen} aria-label={`${label}${k ? ` (${k})` : ""}`}>
        {children}
      </button>
    </div>
  );
}

const none = <span className="dash">–</span>;

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
  const where = { next: "Next Actions", waiting: "Waiting For", someday: "Someday / Maybe", done: "Done", trashed: "Trash" }[a.status];
  return (
    <>
      <div className="detail-head">
        <Marker flagged={Boolean(a.flagged)} done={a.status === "done"} />
        <span className="detail-where">{where}</span>
      </div>
      <TextField label="Subject" value={a.title} onCommit={(v) => patch("actions", a.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      <div className="field-grid">
        <PickField label="Project" k="P" onOpen={() => ed.project([a.id])}>
          {proj ? proj.title : none}
        </PickField>
        <PickField label="Context" k="C" onOpen={() => ed.context([a.id])}>
          <ContextCode ctx={ctx} />
        </PickField>
        <PickField label="Due" k="D" onOpen={() => ed.date([a.id], "due")}>
          {a.due ? formatLong(a.due) : none}
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
          <TextField label="Waiting on" value={a.waiting_who ?? ""} onCommit={(v) => patch("actions", a.id, { waiting_who: v || null })} />
          <PickField label="Follow up" onOpen={() => ed.date([a.id], "followup")}>
            {a.followup ? formatLong(a.followup) : none}
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
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState("");
  const area = s.areas.find((a) => a.id === p.area_id);
  const acts = s.actions.filter((a) => a.project_id === p.id).sort((a, b) => a.sort - b.sort);
  const open = acts.filter((a) => ["next", "waiting", "someday"].includes(a.status));
  const done = acts.filter((a) => a.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return (
    <>
      <div className="detail-head">
        {area ? <Tape>{area.name}</Tape> : <span className="detail-where">No area</span>}
        <span className="detail-where">{{ active: "Active project", someday: "Someday / Maybe", done: "Completed", trashed: "Trash" }[p.status]}</span>
      </div>
      <TextField label="Project" value={p.title} onCommit={(v) => patch("projects", p.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      <TextField
        label="Successful outcome"
        value={p.outcome}
        multiline
        rows={2}
        onCommit={(v) => patch("projects", p.id, { outcome: v })}
        placeholder="What does done look like?"
      />
      <div className="field-grid">
        <PickField label="Area" k="A" onOpen={() => ed.area([p.id])}>
          {area ? area.name : none}
        </PickField>
        <PickField label="Status" k="V" onOpen={() => ed.move([p.id])}>
          {{ active: "Active", someday: "Someday", done: "Done", trashed: "Trash" }[p.status]}
        </PickField>
        <PickField label="Due" k="D" onOpen={() => ed.date([p.id], "due")}>
          {p.due ? formatLong(p.due) : none}
        </PickField>
        <PickField label="Bring back" k="B" onOpen={() => ed.date([p.id], "bring_back")}>
          {p.bring_back ? formatLong(p.bring_back) : none}
        </PickField>
      </div>
      <section className="detail-actions">
        <h3 className="detail-h">
          Actions <span className="count">{open.length}</span>
        </h3>
        {open.length === 0 && <p className="stamp-line"><span className="stamp">Stalled</span> No next action. Add one below.</p>}
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
          className="field-text add-action"
          value={draft}
          placeholder="Add a next action and press Enter"
          aria-label="Add a next action"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              const a = newAction({ title: draft.trim(), project_id: p.id });
              mutate("Action added", [{ type: "create", table: "actions", row: { ...a } }]);
              setDraft("");
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
      <div className="detail-head">
        <span className="detail-where">Inbox · {st.kind === "email" ? "email" : st.kind === "file" ? "document" : "note"}</span>
      </div>
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
      <div className="detail-head">
        <span className="detail-where">Reference</span>
      </div>
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

export function Detail({ target, active }: { target: Target; active: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const root = useRef<HTMLElement>(null);

  useCommands(
    "detail",
    [
      {
        id: "detail.back",
        label: "Back to the list",
        group: "Details",
        keys: ["escape"],
        inInput: true,
        run: () => {
          (document.activeElement as HTMLElement | null)?.blur?.();
          ui.setRegion("list");
        },
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
    ],
    { priority: 20, active },
  );

  useEffect(() => {
    if (active) {
      const el = root.current?.querySelector<HTMLElement>("[data-autofocus]") ?? root.current?.querySelector<HTMLElement>("input, textarea, button");
      el?.focus();
    }
  }, [active, target.id]);

  let body: ReactNode = null;
  if (target.kind === "action") {
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
    <aside ref={root} className={`detail ${active ? "is-active" : ""}`} aria-label="Details">
      <div className="detail-bar">
        <span className="detail-title">Details</span>
        <button type="button" className="icon-btn" aria-label="Close details" onClick={() => ui.openDetail(null)}>
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="detail-body">{body ?? <p className="muted-text">This item no longer exists.</p>}</div>
    </aside>
  );
}
