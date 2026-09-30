import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, Paperclip, Pin } from "lucide-react";
import { mutate, newAction, notify, notStarted, projectHealth, refUpdated, stallReason, startsToday, upload, useMeta, useStore } from "../store.ts";
import { useUI, type Target } from "../ui.tsx";
import { isEditable, keyLabel, runWhenReady, useCommands } from "../keys.ts";
import { askContext, editors } from "../actionCommands.tsx";
import { projectEditors } from "../views/ProjectsView.tsx";
import { joinStuff, splitStuff } from "../views/InboxView.tsx";
import { NotesArea } from "./NotesArea.tsx";
import { AreaName, ContextCode, Energy, KeyHints, Lamp, Marker } from "./bits.tsx";
import { formatDate, formatLong, formatTime, parseRecurrence, recurrenceLabel, today } from "../../shared/dates.ts";
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
  // Every pane marks its fields the same way: the heading field takes F2 (the pane's edit key) and the notes take N.
  const active = useContext(DetailActive);
  const area = useRef<HTMLDivElement>(null);
  const k = autoFocus ? "F2" : multiline ? "N" : undefined;
  useCommands(
    `detail-notes:${label}`,
    multiline ? [{ id: `detail.notes.${label}`, label: `${label}…`, group: "Details", keys: ["n"], run: () => area.current?.focus() }] : [],
    { priority: 21, active: active && Boolean(multiline) },
  );
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
      <span className="field-head">
        <span className="field-label">
          {label}
          {mark}
        </span>
        {k && active && (
          <kbd className="kbd field-key" aria-hidden="true">
            {keyLabel(k.toLowerCase())}
          </kbd>
        )}
      </span>
      {multiline ? (
        <NotesArea value={v} onValue={setV} onBlur={commit} placeholder={placeholder} aria-label={label} ref={area} rows={rows} className="field-text" aria-keyshortcuts={k} />
      ) : (
        <input
          {...common}
          className="field-text"
          data-autofocus={autoFocus || undefined}
          aria-keyshortcuts={k}
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
    { k: "escape", label: "Close" },
  ],
  project: [{ k: "escape", label: "Close" }],
  other: [{ k: "escape", label: "Close" }],
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
  const active = useContext(DetailActive);
  return (
    <section className="detail-files">
      <h3 className="detail-h">
        Files <span className="count">{files.length || ""}</span>
        {active && (
          <kbd className="kbd field-key detail-h-key" aria-hidden="true">
            {keyLabel("mod+o")}
          </kbd>
        )}
      </h3>

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
      {/* The mouse's way in, beside ⌘O and dropping files on the pane. */}
      <button type="button" className="text-btn attach-btn" onClick={() => input.current?.click()}>
        <Paperclip size={13} strokeWidth={1.75} aria-hidden />
        {files.length ? "Attach another file" : "Attach a file"}
        <span className="muted-text">or drop one here</span>
      </button>
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
  const waiting = a.status === "waiting";
  const projectField = (
    <PickField label="Project" k="P" onOpen={() => ed.project([a.id])}>
      {proj ? proj.title : none}
    </PickField>
  );
  const contextField = (
    <PickField label="Context" k="C" onOpen={() => ed.context([a.id])}>
      <ContextCode ctx={ctx} />
    </PickField>
  );
  const nextFields = (
    <>
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
    </>
  );
  const waitingFields = (
    <>
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
      {/* When the waiting began: today by default, set back to the real day when it is filed later. */}
      <PickField label="Since" k="I" onOpen={() => ed.date([a.id], "waiting_since")}>
        {a.waiting_since ? formatLong(a.waiting_since) : none}
      </PickField>
    </>
  );
  return (
    <>
      {/* Important or done is the one thing the fields don't say, so its mark rides after the label. */}
      <TextField label="Subject" mark={a.flagged || done ? <Marker flagged={Boolean(a.flagged)} done={done} /> : undefined} value={a.title} onCommit={(v) => patch("actions", a.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      {/* Fields in the order the item's kind asks for them: a waiting item leads with who it waits on, when to
          follow up and since when, right after its project; a next action's own fields follow. */}
      <div className="field-grid">
        {projectField}
        {waiting ? (
          waitingFields
        ) : (
          <>
            {contextField}
            {nextFields}
          </>
        )}
      </div>
      {waiting && (
        <div className="field-grid">
          {contextField}
          {nextFields}
        </div>
      )}
      <TextField label="Notes" value={a.notes} multiline rows={4} onCommit={(v) => patch("actions", a.id, { notes: v })} placeholder="Details, links, phone numbers…" />
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
  const [draft, setDraft] = useState("");
  const area = s.areas.find((a) => a.id === p.area_id);
  // T and W, as on the Projects list: T goes straight into "Add a next action" while the pane has focus, W adds a
  // waiting for (what, then who or what it waits on).
  const active = useContext(DetailActive);
  const addInput = useRef<HTMLInputElement>(null);
  useCommands(
    "detail-addnext",
    [
      { id: "detail.addnext", label: "Add a next action to this project", group: "Details", keys: ["t"], run: () => addInput.current?.focus() },
      { id: "detail.addwaiting", label: "Add a waiting for to this project", group: "Details", keys: ["w"], run: () => ed.addWaiting(p.id) },
    ],
    { priority: 21, active },
  );
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
  // The project's timeline (owner's request): every action it has had, open or done (archived to Done included), in
  // the order they were created, oldest first, so the newest sits just above "Add a next action". Deleted ones don't show.
  const timeline = s.actions.filter((a) => a.project_id === p.id && a.status !== "trashed").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const open = timeline.filter((a) => ["next", "waiting", "someday"].includes(a.status));
  const doneCount = timeline.length - open.length;
  return (
    <>
      {/* Area and status live in their own fields below; the head only carries the project's health, beside its name. */}
      <TextField label="Project" mark={<Lamp health={projectHealth(s, p)} start={p.start} />} value={p.title} onCommit={(v) => patch("projects", p.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      <div className="field-grid">
        <PickField label="Area" k="A" onOpen={() => ed.area([p.id])}>
          {area ? <AreaName name={area.name} color={area.color} /> : none}
        </PickField>
        <PickField label="Status" k="V" onOpen={() => ed.move([p.id])}>
          {{ active: "Active", someday: "Someday", done: "Done", trashed: "Trash" }[p.status]}
        </PickField>
        <PickField label="Start" k="S" onOpen={() => ed.date([p.id], "start")}>
          {p.start ? formatLong(p.start) : none}
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
          {doneCount > 0 && <span className="detail-h-note">{doneCount} done</span>}
          {active && (
            <span className="detail-h-key" aria-hidden="true">
              <kbd className="kbd field-key">T</kbd>
              <kbd className="kbd field-key">W</kbd>
            </span>
          )}
        </h3>
        {p.status === "active" && !open.length && (notStarted(p) || startsToday(p)) && (
          <p className="badge-line is-quiet">{notStarted(p) ? `Starts ${formatLong(p.start!)}. No next action needed before then.` : "Starts today. Add its first next action below."}</p>
        )}
        {stallReason(s, p) && (
          <p className="badge-line">
            {stallReason(s, p) === "no-next" ? "No next action. Add one below." : `Nothing here touched in ${meta.stallWeeks}+ weeks. Move it forward, or put it on hold.`}
          </p>
        )}
        <ul className="timeline">
          {timeline.map((a) => {
            const done = a.status === "done";
            const when = done ? a.completed_at : a.created_at;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className={`mini-row ${done ? "is-done" : ""}`}
                  title={done ? `Done ${when ? formatLong(when.slice(0, 10)) : ""}` : `Added ${formatLong(a.created_at.slice(0, 10))}`}
                  onClick={() => ui.openDetail({ kind: "action", id: a.id }, true)}
                >
                  <Marker flagged={!done && Boolean(a.flagged)} done={done} />
                  <span className="mini-title">{a.title || "Untitled action"}</span>
                  <span className="mini-meta">{a.status === "waiting" ? `Waiting · ${a.waiting_who ?? ""}` : a.status === "someday" ? "Someday" : ""}</span>
                  <span className="mini-date">{when ? formatDate(when.slice(0, 10)) : ""}</span>
                </button>
              </li>
            );
          })}
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
      </section>
      <TextField label="Support notes" value={p.notes} multiline rows={4} onCommit={(v) => patch("projects", p.id, { notes: v })} placeholder="Plans, meeting notes, phone numbers, links…" />
      <Files owner={{ kind: "project", id: p.id }} />
    </>
  );
}

function StuffDetail({ st }: { st: Stuff }) {
  const parts = splitStuff(st);
  return (
    <>
      {/* One heading line, as on every other pane; the rest of what was captured reads as its notes. */}
      <TextField
        label="Stuff"
        value={parts.title}
        autoFocus
        className="field-title"
        onCommit={(v) => {
          if (!v.trim() && !parts.rest.trim()) return false;
          patch("stuff", st.id, { text: joinStuff(v, parts.rest, parts.prefix) }, "Edited");
        }}
      />
      <TextField label="Notes" value={parts.rest} multiline rows={4} placeholder="Details, links, phone numbers…" onCommit={(v) => patch("stuff", st.id, { text: joinStuff(parts.title, v, parts.prefix) }, "Edited")} />
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
        k="P"
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
      <TextField label="Notes" value={r.notes} multiline rows={4} placeholder="Details, links, phone numbers…" onCommit={(v) => patch("refs", r.id, { notes: v })} />
      <Files owner={{ kind: "ref", id: r.id }} />
      <p className="detail-meta">
        Created {formatLong(r.created_at.slice(0, 10))}
        {refUpdated(s, r) > r.created_at ? ` · updated ${formatLong(refUpdated(s, r).slice(0, 10))}` : ""}
      </p>
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
        // Escape steps out one level. In a text field it only leaves the field (the edit is saved on blur) and the pane keeps
        // focus, so its field keys work again; from the pane it closes it (unless pinned) and you're back on the row.
        id: "detail.back",
        label: ui.detailPinned ? "Back to the list" : "Close details and go back to the list",
        group: "Details",
        keys: ["escape"],
        inInput: true,
        run: () => {
          const el = document.activeElement as HTMLElement | null;
          if (el && root.current?.contains(el) && isEditable(el)) {
            el.blur();
            root.current.focus({ preventScroll: true });
            return;
          }
          el?.blur?.();
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
      { id: "detail.close", label: "Close details", group: "Details", keys: ["mod+backspace"], run: () => ui.openDetail(null) },
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
    <aside
      ref={root}
      className={`detail ${active ? "is-active" : ""}`}
      aria-label={paneName}
      tabIndex={-1}
      // Focus arriving in the pane by any route (a click into its notes, Tab) makes it the active region, so its
      // keys work there: Esc leaves a field and saves it, even in a pinned pane opened from the list.
      onFocus={() => !active && ui.setRegion("detail")}
    >
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
