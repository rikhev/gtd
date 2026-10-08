import { useEvent, type CalEvent } from "../calendarFeed.ts";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, Paperclip, Pin, Check, ChevronLeft, CircleHelp, CircleDashed, Video, BookOpen, ListChecks, Lock, StickyNote } from "lucide-react";
import { linesOf, noteAsList, openRefList, setForm, textOf, useRefText } from "../refList.ts";
import { lockNow, lockWithPassword, removeLock, saveSealedNotes, sealFile, unlock, useLock, useOpenedFile, useOpenedNotes } from "../lock.ts";
import { type MutateOpts, getState, quote, plural, completeActions, mutate, newAction, nextAppointment, notify, notStarted, projectHealth, refUpdated, reopenActions, stallReason, stamp, uid, upload, useMeta, useStore } from "../store.ts";
import { useUI, type Target } from "../ui.tsx";
import { isEditable, runWhenReady, useCommands } from "../keys.ts";
import { askContext, editors, linkAppointment, quickAddNextAction, quickAddWaiting, setProject } from "../actionCommands.tsx";
import { projectEditors } from "../views/ProjectsView.tsx";
import { habitStats, historyTitle, isTicked, itemsOf, longHistory, openChecklist, progress, progressLabel, repeatsLabel, setChecklistDay, startOver, streak, streakLabel, tickItems, touchChecklist, useChecklistDay } from "../checklists.ts";
import { linkSupport } from "../support.ts";
import { pickGoal } from "../horizons.ts";
import { joinStuff, splitStuff } from "../views/InboxView.tsx";
import { NotesArea, type Follow, type NotesApi } from "./NotesArea.tsx";
import { useAutosave } from "../noteSave.ts";
import { backlinks, byTitle, firstLine, followNote, linkContext, renameOps, takeNoteFocus } from "../notes.ts";
import { AreaName, ContextCode, DoneBox, Energy, EventMark, KeyHints, Lamp, Marker, useIsTouch } from "./bits.tsx";
import { formatDate, formatLong, formatTime, parseRecurrence, recurrenceLabel, today } from "../../shared/dates.ts";
import type { Action, Checklist, ChecklistItem, FileRow, Project, Ref, Stuff, TableName } from "../../shared/types.ts";

/** A one-line text field that commits on blur (one undo step per edit, not per keystroke). Notes are a NotesField. */
function TextField({
  label,
  value,
  onCommit,
  autoFocus,
  className,
  mark,
  lead,
}: {
  label: string;
  /** A small mark after the label, such as the project's health lamp. */
  mark?: ReactNode;
  /** A mark inside the field, before the text, as the list row has it (an action's importance or done mark). */
  lead?: ReactNode;
  value: string;
  /** Return false to refuse the edit; the field then snaps back to the saved value. */
  onCommit: (v: string) => void | boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  // Every pane marks its fields the same way: the heading field takes F2 (the pane's edit key) and the notes take N.
  const k = autoFocus ? "F2" : undefined;
  const commit = () => {
    if (v !== value && onCommit(v) === false) setV(value);
  };
  const common = {
    value: v,
    // Marked when empty: the printout leaves an empty field out.
    "data-empty": v.trim() === "" || undefined,
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
      </span>
      {lead ? (
        <span className="field-lead-wrap">
          <span className="field-lead" aria-hidden="true">
            {lead}
          </span>
          <input
            {...common}
            className="field-text has-lead"
            data-autofocus={autoFocus || undefined}
            aria-keyshortcuts={k}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </span>
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

/**
 * A notes field, the same in every pane, and a field like any other (owner's decision): at rest it shows the text as
 * it reads (no Markdown syntax; links and boxes answer a click); Enter on it (the pane's edit key), N, or a click into
 * it writes, as the plain Markdown in monospace, and leaving it shows the text again. Saved a second after typing
 * stops (and on leaving it, hiding the tab or closing the page), a stretch of typing one ⌘Z; `local` keeps unsaved
 * typing in this browser (never a locked note's). A pasted or dropped file joins the item's files and is named in the
 * text. A note's field (`note`) also offers the notes to link on "[[" and takes the cursor when the note was opened
 * to be written in.
 */
function NotesField({
  label,
  value,
  saveKey,
  save,
  local = true,
  owner,
  onFollow,
  note,
}: {
  label: string;
  value: string;
  saveKey: string;
  save: (text: string, opts: MutateOpts) => Promise<boolean> | void;
  local?: boolean;
  owner?: { kind: FileRow["owner_kind"]; id: string };
  onFollow?: (f: Follow) => void;
  note?: Ref;
}) {
  const ui = useUI();
  const active = useContext(DetailActive);
  const area = useRef<HTMLDivElement>(null);
  const api = useRef<NotesApi | null>(null);
  const auto = useAutosave({ key: saveKey, value, save, local });
  const [writing, setWriting] = useState(false);
  // While the "[[" picker is open the text keeps writing (focus is in the picker only for the moment).
  const linking = useRef(false);
  // Where a click into the text landed, so writing starts there.
  const clickedAt = useRef<number | null>(null);
  /** Into the text to write, the caret at `at` (or where it was clicked, or at the end). */
  const write = (at?: number) => {
    const to = at ?? clickedAt.current ?? auto.text.length;
    clickedAt.current = null;
    setWriting(true);
    requestAnimationFrame(() => api.current?.focus(to));
  };
  // A note opened to be written in (N's new note, today's note, a link to a note not yet written) takes the cursor.
  useEffect(() => {
    const at = note ? takeNoteFocus(note.id) : null;
    if (at === "notes" || at === "end") requestAnimationFrame(() => requestAnimationFrame(() => write(at === "end" ? auto.text.length : 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);
  useCommands(`detail-notes:${label}`, [{ id: `detail.notes.${label}`, label: `Edit ${label.toLowerCase()}`, group: "Details", keys: ["n"], run: () => write() }], {
    priority: 21,
    active,
  });
  /** "[[" typed in a note: the notes to link, and the link written in on a pick. */
  const linkStart = (at: number) => {
    const put = (title: string) => window.setTimeout(() => api.current?.replace(at, at, `${title}]]`), 0);
    linking.current = true;
    ui.openPicker({
      type: "list",
      title: "Link to a note",
      wide: true,
      items: getState()
        .refs.filter((x) => x.status === "active" && x.id !== note?.id && x.title.trim())
        .sort((a, b) => byTitle(a.title, b.title))
        .map((x) => ({ id: x.id, label: x.title })),
      createLabel: (q) => `Link to “${q}”, a new note`,
      onCreate: (q) => put(q),
      onPick: (id) => {
        const t = getState().refs.find((x) => x.id === id)?.title;
        if (t) put(t);
        else api.current?.focus(at);
      },
    });
  };
  return (
    <label className="field">
      <span className="field-head">
        <span className="field-label">{label}</span>
      </span>
      <NotesArea
        value={auto.text}
        onValue={auto.change}
        onFocus={() => {
          // Reached at rest (Enter under the pane's cursor, Tab, a click): it opens to be written in.
          linking.current = false;
          if (!writing) write();
          auto.focus();
        }}
        onBlur={() => {
          auto.blur();
          // A picker opened from the text ("[[") keeps it open to be written in when it closes.
          if (!linking.current) setWriting(false);
        }}
        onClickAt={(at) => (clickedAt.current = at)}
        aria-label={label}
        ref={area}
        rows={4}
        className="field-text"
        aria-keyshortcuts="Enter N"
        owner={owner}
        onFollow={onFollow}
        onLinkStart={note && !note.sealed && writing ? linkStart : undefined}
        view={writing ? "source" : "read"}
        api={api}
      />
    </label>
  );
}

// The panes print no keys (owner's request: they are found in ⌘K, and each field announces its own). On a
// touch screen an Inbox item's two ways forward stay, as buttons to tap.
const STUFF_TOUCH: { k: string; label: string }[] = [
  { k: "v", label: "File as" },
  { k: "k", label: "Clarify" },
];

/** What the pane's cursor stops on, top to bottom: fields, the timeline's rows, the add line, the meeting link, files. */
const PANE_STOPS = ".detail-body .field .field-text, .detail-body .event-title, .detail-body .field-pick, .detail-body .mini-row, .detail-body .add-action, .detail-body .event-join, .detail-body .file-name";

/** Whether the detail pane is the active region: its fields' letter keys only work then. */
const DetailActive = createContext(false);

/** A pane field's key reads as the same command does on the lists ("Set context", "Set due date"), in ⌘K: a command says what it does. */
const FIELD_COMMAND: Record<string, string> = {
  Context: "Set context",
  Project: "Set project",
  "Do on": "Set the day to do it",
  Time: "Set time estimate",
  Energy: "Set energy",
  Repeat: "Set repeat",
  "Bring back": "Bring back on a day",
  With: "Set who it's with",
  "Follow up": "Set follow-up date",
  Since: "Set waiting since",
};

function PickField({ label, children, onOpen, k }: { label: string; children: ReactNode; onOpen: () => void; k?: string }) {
  // The key shown beside a field (D for Due, P for Project…) opens its picker while the pane has focus.
  const active = useContext(DetailActive);
  useCommands(`detail-field:${label}`, k ? [{ id: `detail.field.${label}`, label: FIELD_COMMAND[label] ?? `Set ${label.toLowerCase()}`, group: "Fields", keys: [k.toLowerCase()], run: () => open() }] : [], { priority: 21, active: active && Boolean(k) });
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

/** A Do on or follow-up date in the pane, styled and spoken like the list does when it has passed (late, or a chase). */
function DueLong({ date, done, word = "late" }: { date: string; done?: boolean; word?: string }) {
  const past = !done && date < today();
  return (
    <span className={`date ${past ? "is-overdue" : ""}`}>
      {formatLong(date)}
      {past && <span className="visually-hidden">, {word}</span>}
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

/** Removing a file is a row change like any other, so ⌘Z puts it back; the server lets the stored file go a day later. */
function removeFile(f: FileRow) {
  mutate(`“${f.name}” removed`, [{ type: "delete", table: "files", id: f.id }]);
}

export function Files({ owner, layer, title }: { owner: { kind: FileRow["owner_kind"]; id: string }; layer?: string; title?: string }) {
  const ui = useUI();
  const files = useStore((s) => s.files).filter((f) => f.owner_kind === owner.kind && f.owner_id === owner.id);
  // Only a list of files, no thumbnails or text previews (owner's request: several files made the pane too busy).
  // A click (or Enter under the pane's cursor) opens a file in the viewer, with the item's other files a step away.
  const view = (id: string) => ui.openViewer(files.map((f) => f.id), files.findIndex((f) => f.id === id));
  const input = useRef<HTMLInputElement>(null);
  // Delete on a file under the pane's cursor removes it, as the × does; both are a row change ⌘Z takes back.
  const active = useContext(DetailActive);
  const cursorFile = () => {
    const id = document.querySelector<HTMLElement>(".detail-body .file-name[data-cursor]")?.dataset.file;
    return files.find((f) => f.id === id);
  };
  useCommands(
    layer ?? `detail-files:${owner.id}`,
    [
      { id: "detail.attach", label: "Attach file", group: "Details", keys: ["mod+o"], inInput: true, run: () => input.current?.click() },
      {
        id: "detail.unattach",
        label: "Remove the file under the cursor",
        group: "Details",
        keys: ["backspace", "delete"],
        enabled: active && files.length > 0,
        run: () => {
          const f = cursorFile();
          if (f) removeFile(f);
        },
      },
    ],
    { priority: 30, title },
  );
  return (
    <section className="detail-files">
      <h3 className="detail-h">
        Files <span className="count">{files.length || ""}</span>
      </h3>

      <ul>
        {files.map((f) =>
          f.sealed ? (
            <SealedFile key={f.id} f={f} onOpen={() => view(f.id)} />
          ) : (
          <li key={f.id} className="file-row">
            <Paperclip size={13} strokeWidth={1.75} aria-hidden />
            <a
              href={`/api/files/${f.id}`}
              className="file-name"
              data-file={f.id}
              onClick={(e) => {
                // ⌘-click still opens it in a tab of its own, as a link does.
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                view(f.id);
              }}
            >
              {f.name}
            </a>
            <span className="file-size">{fileSize(f.size)}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${f.name}`}
              onClick={() => removeFile(f)}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </li>
          ),
        )}
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

/**
 * The pane keeps room for its scrollbar at all times (scrollbar-gutter in CSS), so fields never narrow when a long
 * item starts to scroll. Where the scrollbar takes room of its own, the right padding gives that room back, so the
 * fields sit as far from both edges as they would without it.
 */
const evenGutter = (el: HTMLDivElement | null) => {
  if (!el) return;
  const bar = el.offsetWidth - el.clientWidth;
  el.style.paddingRight = bar > 0 ? `${Math.max(4, 16 - bar)}px` : "";
};

/**
 * A file's size in decimal units, as the Finder gives them: kB up to 999, then MB, then GB; one decimal below 10
 * ("1.2 MB"), whole numbers above ("34 MB"). A value that rounds to 1000 moves up a unit, so it never reads "1000 kB".
 */
function fileSize(bytes: number) {
  const units = ["kB", "MB", "GB"];
  let v = Math.max(bytes, 1) / 1000;
  let u = 0;
  while (u < units.length - 1 && Math.round(v) >= 1000) {
    v /= 1000;
    u++;
  }
  const shown = u > 0 && v < 10 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.max(1, Math.round(v)));
  return `${shown} ${units[u]}`;
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
  // T and W add, in every pane and list: a next action or a waiting for in this action's project (or on its own).
  const paneActive = useContext(DetailActive);
  useCommands(
    "detail-action-add",
    [
      { id: "detail.a.addnext", label: "Add a next action", group: "Details", keys: ["t"], run: () => (a.project_id ? projectEditors(ui).addNextAction(a.project_id) : quickAddNextAction(ui)) },
      { id: "detail.a.addwait", label: "Add a waiting for", group: "Details", keys: ["w"], run: () => (a.project_id ? projectEditors(ui).addWaiting(a.project_id) : quickAddWaiting(ui)) },
    ],
    { priority: 21, active: paneActive },
  );
  // What kind of item this is decides its fields: a done or trashed item keeps the kind it had.
  const kind = (done ? a.done_from : a.status === "trashed" ? a.trashed_from : a.status) ?? "next";
  const waiting = kind === "waiting";
  // Each kind shows only the fields it needs (owner's request): a next action is planned (context, the day to do it,
  // time, energy, repeat), a waiting item is chased (who, follow up, since), a someday item is parked (context, when
  // to look at it again). Done, nothing is planned any more, so Do on, repeat and bring back go. A field a kind
  // doesn't need still shows while it holds something, so nothing set is hidden.
  const NEEDS: Record<string, string[]> = {
    next: ["context", "doon", "time", "energy", "repeat", "person"],
    waiting: ["who", "followup", "since"],
    someday: ["context", "back"],
  };
  const needs = new Set((NEEDS[kind] ?? NEEDS.next).filter((f) => !(done && ["doon", "repeat", "back"].includes(f))));
  const has: Record<string, unknown> = { context: a.context_id, doon: a.defer, time: a.time_min, energy: a.energy, repeat: a.recurrence, back: a.bring_back, person: a.person, who: a.waiting_who, followup: a.followup, since: a.waiting_since };
  const shown = (f: string) => needs.has(f) || Boolean(has[f]);
  const fields: [string, ReactNode][] = [
    [
      "project",
      <PickField key="project" label="Project" k="P" onOpen={() => ed.project([a.id])}>
        {proj ? proj.title : none}
      </PickField>,
    ],
    [
      "context",
      <PickField key="context" label="Context" k="C" onOpen={() => ed.context([a.id])}>
        <ContextCode ctx={ctx} />
      </PickField>,
    ],
    [
      "doon",
      // The one date (owner's decision): the day to do it. D, except on a waiting item, where D is the follow-up.
      <PickField key="doon" label="Do on" k={waiting ? undefined : "D"} onOpen={() => ed.date([a.id], "defer")}>
        {a.defer ? kind === "next" ? <DueLong date={a.defer} done={done} /> : formatLong(a.defer) : none}
      </PickField>,
    ],
    [
      "time",
      <PickField key="time" label="Time" k="M" onOpen={() => ed.time([a.id])}>
        {a.time_min ? formatTime(a.time_min) : none}
      </PickField>,
    ],
    [
      "energy",
      <PickField key="energy" label="Energy" k="G" onOpen={() => ed.energy([a.id])}>
        <Energy level={a.energy} />
      </PickField>,
    ],
    [
      "repeat",
      <PickField key="repeat" label="Repeat" k="R" onOpen={() => ed.recurrence([a.id])}>
        {rec ? recurrenceLabel(rec) : none}
      </PickField>,
    ],
    [
      "back",
      <PickField key="back" label="Bring back" k="B" onOpen={() => ed.date([a.id], "bring_back")}>
        {a.bring_back ? formatLong(a.bring_back) : none}
      </PickField>,
    ],
  ];
  fields.push(
    [
      // Who it is for: it then shows on their agenda, beside what they owe you.
      "person",
      <PickField key="person" label="With" k="H" onOpen={() => ed.person([a.id])}>
        {a.person || none}
      </PickField>,
    ],
    [
      "who",
      <TextField
        key="who"
        label="Waiting on"
        value={a.waiting_who ?? ""}
        onCommit={(v) => {
          if (!v.trim()) {
            notify("A Waiting For item needs someone or something to wait on. Move it with V to take it out of Waiting For.", { tone: "error" });
            return false;
          }
          patch("actions", a.id, { waiting_who: v.trim() });
        }}
      />,
    ],
    [
      "followup",
      <PickField key="followup" label="Follow up" k={waiting ? "D" : undefined} onOpen={() => ed.date([a.id], "followup")}>
        {a.followup ? <DueLong date={a.followup} done={a.status !== "waiting"} /> : none}
      </PickField>,
    ],
    [
      // When the waiting began: today by default, set back to the real day when it is filed later.
      "since",
      <PickField key="since" label="Since" k="I" onOpen={() => ed.date([a.id], "waiting_since")}>
        {a.waiting_since ? formatLong(a.waiting_since) : none}
      </PickField>,
    ],
  );
  // One grid for every kind (owner's request): a field keeps its place whatever the item is. Row by row: what it
  // belongs to and who or where; when it comes up for you (the day to do it, follow up, or bring back) beside how it
  // recurs (or, waiting, since when); time and energy; who it is with. A row keeps an empty cell rather than letting a
  // field slide across. Fields this kind doesn't need but that hold a value follow.
  const rows: [string | null, string | null][] = [
    ["project", waiting ? "who" : "context"],
    [waiting ? "followup" : kind === "someday" ? "back" : "doon", waiting ? "since" : "repeat"],
    ["time", "energy"],
    [waiting ? null : "person", null],
  ];
  const byKey = new Map(fields);
  const visible = (f: string | null): f is string => f !== null && (f === "project" || shown(f));
  const placed = new Set(rows.flat());
  const gap = (key: string) => <span key={key} className="field-gap" aria-hidden="true" />;
  const layout: ReactNode[] = [];
  rows.forEach(([l, r], i) => {
    if (!visible(l) && !visible(r)) return;
    layout.push(l && visible(l) ? byKey.get(l) : gap(`gl${i}`), r && visible(r) ? byKey.get(r) : gap(`gr${i}`));
  });
  for (const [f, el] of fields) if (!placed.has(f) && visible(f)) layout.push(el);
  return (
    <>
      {/* Important or done is the one thing the fields don't say, so its mark leads the subject, as on the list row. */}
      <TextField label="Subject" lead={done ? <Marker done /> : undefined} value={a.title} onCommit={(v) => patch("actions", a.id, { title: v }, `Renamed ${quote(v)}`)} autoFocus className="field-title" />
      {/* The shared grid (see rows above): every kind's fields in the same places. */}
      <div className="field-grid">
        {layout}
      </div>
      <NotesField label="Notes" value={a.notes} saveKey={`actions:${a.id}:notes`} save={(v, o) => mutate("Notes saved", [{ type: "patch", table: "actions", id: a.id, data: { notes: v } }], o)} owner={{ kind: "action", id: a.id }} />
      <Files owner={{ kind: "action", id: a.id }} />
      <p className="detail-meta">
        Created {formatLong(a.created_at.slice(0, 10))}
        {a.completed_at ? ` · done ${formatLong(a.completed_at.slice(0, 10))}` : ""}
      </p>
    </>
  );
}

/** A description or location with its links made clickable (and Outlook's rows of underscores left out). */
function Linked({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => !/^[_\-=\s]{8,}$/.test(l));
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="event-line">
          {line.split(/(https?:\/\/[^\s<>]+)/g).map((part, j) =>
            /^https?:\/\//.test(part) ? (
              <a key={j} href={part} target="_blank" rel="noreferrer">
                {part.length > 60 ? `${part.slice(0, 57)}…` : part}
              </a>
            ) : (
              part
            ),
          )}
        </span>
      ))}
    </>
  );
}

const JOIN = /https?:\/\/[^\s<>]*(teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet|zoom\.us\/j\/|meet\.google\.com\/|webex\.com\/)[^\s<>]*/i;
const STATUS_ORDER = { accepted: 0, tentative: 1, none: 2, declined: 3 } as const;
const STATUS_LABEL = { accepted: "Accepted", tentative: "Tentative", none: "No answer yet", declined: "Declined" } as const;

/**
 * An appointment from a subscribed calendar, read-only (owner's request): when and where, how to join, who organised
 * it, and who is coming when the feed says (a published Outlook calendar leaves attendees out, and then nothing is
 * said about them). Its description is never shown (owner's decision: the feeds in use don't share one).
 */
function EventDetail({ e }: { e: CalEvent }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const { calendars } = useMeta();
  const linked = s.appointments.find((x) => x.id === e.key);
  const proj = linked ? s.projects.find((p) => p.id === linked.project_id) : undefined;
  const feed = calendars.find((f) => f.id === e.feed);
  const active = useContext(DetailActive);
  // T and W add, as in every pane: something to do, or to wait for, that came out of the meeting.
  useCommands(
    "detail-event",
    [
      { id: "detail.e.addnext", label: "Add a next action", group: "Details", keys: ["t"], run: () => quickAddNextAction(ui) },
      { id: "detail.e.addwait", label: "Add a waiting for", group: "Details", keys: ["w"], run: () => quickAddWaiting(ui) },
      { id: "detail.e.jump", label: "Jump to its project", group: "Details", keys: ["j"], run: () => ui.jumpFromAppointment(e.key) },
    ],
    { priority: 21, active },
  );
  const when =
    e.date === e.endDate
      ? `${formatLong(e.date)}${e.time ? ` · ${e.time}${e.endTime ? `–${e.endTime}` : ""}` : " · all day"}`
      : `${formatLong(e.date)}${e.time ? ` ${e.time}` : ""} to ${formatLong(e.endDate)}${e.endTime ? ` ${e.endTime}` : ""}`;
  const join = [e.url, e.location, e.description].map((x) => (x ? JOIN.exec(x)?.[0] : null)).find(Boolean) ?? null;
  const people = [...e.attendees].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
  const counts = (["accepted", "tentative", "none", "declined"] as const).map((st) => [st, e.attendees.filter((a) => a.status === st).length] as const).filter(([, n]) => n);
  const nameOf = (p: { name: string | null; email: string | null }) => p.name ?? p.email ?? "Someone";
  return (
    <>
      <div className="event-head">
        <h3 className="event-title">{e.title}</h3>
        <span className="event-from">
          <span className="feed-swatch" style={{ background: feed?.color }} aria-hidden="true" />
          {feed?.name ?? "Calendar"} · read-only{e.tentative ? " · tentative" : ""}
        </span>
      </div>
      {/* The one thing here that can be set: the project this appointment moves forward (P). */}
      <div className="field-grid">
        <PickField label="Project" k="P" onOpen={() => linkAppointment(ui, e)}>
          {proj ? (
            <span className="event-project">
              <Lamp health={projectHealth(s, proj)} start={proj.start} appt={nextAppointment(s, proj)} />
              {proj.title || "Untitled project"}
            </span>
          ) : (
            none
          )}
        </PickField>
      </div>
      <dl className="event-facts">
        <div>
          <dt className="field-label">When</dt>
          <dd>{when}</dd>
        </div>
        {e.location && (
          <div>
            <dt className="field-label">Where</dt>
            <dd>
              <Linked text={e.location} />
            </dd>
          </div>
        )}
        {e.organizer && (
          <div>
            <dt className="field-label">Organizer</dt>
            <dd>
              {nameOf(e.organizer)}
              {e.organizer.name && e.organizer.email && <span className="muted-text"> · {e.organizer.email}</span>}
            </dd>
          </div>
        )}
      </dl>
      {join && (
        <a className="event-join" href={join} target="_blank" rel="noreferrer">
          <Video size={14} strokeWidth={2} aria-hidden /> Join the online meeting
        </a>
      )}
      {/* Who is coming, only when the feed says: feeds that leave it out show nothing about it (owner's request). */}
      {people.length > 0 && (
      <section className="event-people" aria-label="Attendees">
        <h3 className="detail-h">
          Attendees <span className="count">{e.attendees.length}</span>
        </h3>
        {counts.length > 0 && <p className="event-counts">{counts.map(([st, n]) => `${n} ${STATUS_LABEL[st].toLowerCase()}`).join(" · ")}</p>}
          <ul>
            {people.map((a, i) => (
              <li key={i} className={`is-${a.status}`}>
                <span className="event-status" role="img" aria-label={STATUS_LABEL[a.status]} title={STATUS_LABEL[a.status]}>
                  {a.status === "accepted" ? <Check size={13} strokeWidth={2.5} /> : a.status === "declined" ? <X size={13} strokeWidth={2.5} /> : a.status === "tentative" ? <CircleHelp size={13} strokeWidth={2} /> : <CircleDashed size={13} strokeWidth={2} />}
                </span>
                <span className="event-person">{nameOf(a)}</span>
                {a.optional && <span className="muted-text small">optional</span>}
              </li>
            ))}
          </ul>
      </section>
      )}
      {/* No description (owner's decision): the feeds in use never share one. It is only read for a meeting link. */}
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
  const goal = s.horizons.find((h) => h.id === p.goal_id && h.status !== "trashed");
  // T and W, as on the Projects list: T goes straight into "Add a next action" while the pane has focus, W adds a
  // waiting for (what, then who or what it waits on).
  const active = useContext(DetailActive);
  const addInput = useRef<HTMLInputElement>(null);
  useCommands(
    "detail-addnext",
    [
      { id: "detail.addnext", label: "Add a next action", group: "Details", keys: ["t"], run: () => addInput.current?.focus() },
      { id: "detail.addwaiting", label: "Add a waiting for", group: "Details", keys: ["w"], run: () => ed.addWaiting(p.id) },
      { id: "detail.support", label: "Link support material", group: "Details", run: () => linkSupport(ui, p.id) },
      { id: "detail.plan", label: "Plan a later step", group: "Details", run: () => planLater() },
      // E, as on every list: the action under the pane's cursor is done (or, already done, not done after all).
      { id: "detail.actdone", label: "Mark the action done", group: "Details", keys: ["e"], run: () => toggleDone(cursorAction()) },
    ],
    { priority: 21, active },
  );
  const cursorAction = () => addInput.current?.closest(".detail")?.querySelector<HTMLElement>("[data-cursor][data-action]")?.dataset.action;
  const toggleDone = (id: string | undefined) => {
    const a = id && s.actions.find((x) => x.id === id);
    if (!a) return notify("Put the cursor on an action (↑↓), then E marks it done.");
    if (a.status === "done") reopenActions([a.id]);
    else completeActions([a.id]);
  };
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
  const open = timeline.filter((a) => ["next", "waiting", "someday", "later"].includes(a.status));
  /** A later step for the plan: in words, no context yet (it is asked when the step becomes current). */
  const planLater = () =>
    ui.openPicker({
      type: "text",
      title: `Plan a later step for “${p.title || "Untitled project"}”`,
      current: "",
      onPick: (v) => {
        const title = (v ?? "").trim();
        if (title) mutate(`Planned for later: “${title}”`, [{ type: "create", table: "actions", row: { ...newAction({ title, project_id: p.id, status: "later" }) } }]);
      },
    });
  const doneCount = timeline.length - open.length;
  // Its linked appointments, in the order they fall; those that have passed stay, faded, as a record.
  const appts = s.appointments.filter((x) => x.project_id === p.id).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const nextAppt = nextAppointment(s, p);
  const feedColor = (id: string) => meta.calendars.find((c) => c.id === id)?.color;
  return (
    <>
      {/* Area and status live in their own fields below; the head only carries the project's health, beside its name. */}
      <TextField label="Project" mark={<Lamp health={projectHealth(s, p)} start={p.start} appt={nextAppt} />} value={p.title} onCommit={(v) => patch("projects", p.id, { title: v }, `Renamed ${quote(v)}`)} autoFocus className="field-title" />
      {/* GTD's one planning question, optional and on one line (owner's rule: faithful, but no routine admin). */}
      <TextField label="Done looks like" value={p.outcome ?? ""} onCommit={(v) => patch("projects", p.id, { outcome: v })} />
      <div className="field-grid">
        <PickField label="Area" k="A" onOpen={() => ed.area([p.id])}>
          {area ? <AreaName name={area.name} color={area.color} /> : none}
        </PickField>
        {/* Only once there are goals to serve (Horizons); G still sets one from the keyboard. */}
        {(goal || s.horizons.some((h) => h.kind === "goal" && h.status === "active")) && (
          <PickField label="Goal" k="G" onOpen={() => pickGoal(ui, [p.id])}>
            {goal ? goal.title || "Untitled goal" : none}
          </PickField>
        )}
        <PickField label="Status" k="V" onOpen={() => ed.move([p.id])}>
          {{ active: "Active", someday: "Someday", done: "Done", trashed: "Trash" }[p.status]}
        </PickField>
        {/* The same grid as an action's: the day to do it (or, for a someday project, when to look at it again) on
            the left. A someday project's Do on, if it has one, still shows after it. */}
        {(() => {
          const someday = p.status === "someday";
          const startF = (
            <PickField key="start" label="Do on" k="D" onOpen={() => ed.date([p.id], "start")}>
              {p.start ? formatLong(p.start) : none}
            </PickField>
          );
          const backF = (
            <PickField key="back" label="Bring back" k="B" onOpen={() => ed.date([p.id], "bring_back")}>
              {p.bring_back ? formatLong(p.bring_back) : none}
            </PickField>
          );
          const left = someday ? backF : p.status === "active" || p.start ? startF : null;
          const extra = someday && p.start ? startF : null;
          return (
            <>
              {left}
              {left && <span key="gr" className="field-gap" aria-hidden="true" />}
              {extra}
            </>
          );
        })()}
      </div>
      {appts.length > 0 && (
        <section className="detail-actions">
          <h3 className="detail-h">
            Appointments <span className="count">{appts.filter((x) => x.date >= today()).length}</span>
          </h3>
          <ul className="timeline">
            {appts.map((x) => {
              const past = x.date < today();
              const when = `${x.date === today() ? "Today" : formatDate(x.date)}${x.time ? ` ${x.time}` : ""}`;
              return (
                <li key={x.id}>
                  <button type="button" className={`mini-row ${past ? "is-past" : ""}`} title={`${x.title}, ${formatLong(x.date)}${x.time ? ` ${x.time}${x.end_time ? `–${x.end_time}` : ""}` : ""}`} onClick={() => ui.drillDetail({ kind: "event", id: x.id })}>
                    <EventMark color={feedColor(x.feed)} />
                    <span className="mini-title">{x.title}</span>
                    <span className="mini-meta">{meta.calendars.find((c) => c.id === x.feed)?.name ?? ""}</span>
                    <span className="mini-date">{when}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="detail-actions">
        <h3 className="detail-h">
          Actions <span className="count">{open.length}</span>
          {doneCount > 0 && <span className="detail-h-note">{doneCount} done</span>}
        </h3>
        {p.status === "active" && !open.length && notStarted(p) && (
          <p className="badge-line is-quiet">{`Do on ${formatLong(p.start!)}. No next action needed before then.`}</p>
        )}
        {p.status === "active" && !open.some((a) => a.status === "next" || a.status === "waiting") && nextAppt && !notStarted(p) && (
          <p className="badge-line is-quiet">
            Next step: {nextAppt.title}, {nextAppt.date === today() ? "today" : formatLong(nextAppt.date)}
            {nextAppt.time ? ` ${nextAppt.time}` : ""}. Add a next action when it has happened.
          </p>
        )}
        {stallReason(s, p) && (
          <p className={`badge-line ${stallReason(s, p) === "idle" ? "is-quiet" : ""}`}>
            {stallReason(s, p) === "no-next" ? "No next action. Add one below." : `Nothing here touched in ${meta.stallWeeks}+ weeks. Is it still current? The Weekly Review asks.`}
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
                  data-action={a.id}
                  title={done ? `Done ${when ? formatLong(when.slice(0, 10)) : ""}` : `Added ${formatLong(a.created_at.slice(0, 10))}`}
                  onClick={() => ui.drillDetail({ kind: "action", id: a.id })}
                >
                  <Marker quiet />
                  <span className="mini-title">{a.title || "Untitled action"}</span>
                  <span className="mini-meta">{a.status === "waiting" ? `Waiting · ${a.waiting_who ?? ""}` : done && a.done_from === "waiting" && a.waiting_who ? `Waited · ${a.waiting_who}` : a.status === "someday" ? "Someday" : a.status === "later" ? "Later" : ""}</span>
                  <span className="mini-date">{when ? formatDate(when.slice(0, 10)) : ""}</span>
                </button>
                {/* The Complete box, as on the lists, over the row's marker column: a sibling, so the row stays one button. */}
                <DoneBox done={done} title={a.title || "Untitled action"} onToggle={() => toggleDone(a.id)} />
              </li>
            );
          })}
        </ul>
        <input
          ref={addInput}
          className="field-text add-action"
          value={draft}
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
      <SupportMaterial projectId={p.id} />
      <NotesField label="Support notes" value={p.notes} saveKey={`projects:${p.id}:notes`} save={(v, o) => mutate("Notes saved", [{ type: "patch", table: "projects", id: p.id, data: { notes: v } }], o)} owner={{ kind: "project", id: p.id }} />
      <Files owner={{ kind: "project", id: p.id }} />
    </>
  );
}

/**
 * The project's support material (GTD keeps it with the project, apart from its actions): the references and
 * checklists linked to it, A–Z, references first. Both open here in the pane (Esc comes back): a checklist to be run
 * (ticked and added to) while working the project, with the way to Checklists for the rest (owner's request).
 */
function SupportMaterial({ projectId }: { projectId: string }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const refs = s.refs.filter((r) => r.status === "active" && r.project_id === projectId).sort((a, b) => a.title.localeCompare(b.title));
  const lists = s.checklists.filter((c) => c.status === "active" && c.project_id === projectId).sort((a, b) => a.title.localeCompare(b.title));
  const files = (id: string) => s.files.filter((f) => f.owner_kind === "ref" && f.owner_id === id).length;
  // Shown only when something supports the project; P on a reference or checklist (or ⌘K here) links one.
  if (!refs.length && !lists.length) return null;
  return (
    <section className="detail-actions" aria-label="Support material">
      <h3 className="detail-h">
        Support material <span className="count">{refs.length + lists.length}</span>
      </h3>
      <ul className="timeline">
        {refs.map((r) => (
          <li key={r.id}>
            <button type="button" className="mini-row" title={`Reference: ${r.title || "Untitled"}`} onClick={() => ui.drillDetail({ kind: "ref", id: r.id })}>
              <span className="kind-icon">
                <BookOpen size={14} strokeWidth={1.75} aria-label="Reference" />
              </span>
              <span className="mini-title">{r.title || "Untitled reference"}</span>
              <span className="mini-meta">{files(r.id) ? `${files(r.id)} ${files(r.id) === 1 ? "file" : "files"}` : r.notes.trim() ? "Note" : ""}</span>
              <span className="mini-date">{formatDate(refUpdated(s, r).slice(0, 10))}</span>
            </button>
          </li>
        ))}
        {lists.map((c) => {
          const pr = progress(s, c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                className="mini-row"
                title={`Checklist: ${c.title || "Untitled"}`}
                onClick={() => ui.drillDetail({ kind: "checklist", id: c.id })}
              >
                <span className="kind-icon">
                  <ListChecks size={14} strokeWidth={1.75} aria-label="Checklist" />
                </span>
                <span className="mini-title">{c.title || "Untitled checklist"}</span>
                <span className="mini-meta">{[repeatsLabel(c.repeats), progressLabel(pr) || `${pr.total} ${pr.total === 1 ? "item" : "items"}`].filter(Boolean).join(" · ")}</span>
                <span className="mini-date" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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
      <NotesField
        label="Notes"
        value={parts.rest}
        saveKey={`stuff:${st.id}:notes`}
        save={(v, o) => mutate("Edited", [{ type: "patch", table: "stuff", id: st.id, data: { text: joinStuff(parts.title, v, parts.prefix) } }], o)}
        owner={{ kind: "stuff", id: st.id }}
      />
      <Files owner={{ kind: "stuff", id: st.id }} />
      <p className="detail-meta">Captured {formatLong(st.created_at.slice(0, 10))}</p>
    </>
  );
}

/**
 * A checklist run from the pane (opened from a project's support material): its items to tick (a routine ticks
 * today), a line to add one at the end, and Start over. Building it (sections, order, a routine's four weeks, an
 * earlier day) stays in Checklists, one click away. Items are pane stops like the project's actions: ↑↓ walk them and
 * Enter (or a click) ticks.
 */
function ChecklistDetail({ c }: { c: Checklist }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const active = useContext(DetailActive);
  const items = itemsOf(s, c.id);
  const p = progress(s, c.id);
  const [draft, setDraft] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  const proj = s.projects.find((x) => x.id === c.project_id);
  const openFull = () => {
    ui.go("checklists");
    openChecklist(c.id);
  };
  const addItem = () => {
    const title = draft.trim();
    if (!title) return;
    const row: ChecklistItem = { id: uid(), checklist_id: c.id, title, section: 0, checked_at: null, sort: Math.max(0, ...items.map((x) => x.sort)) + 1, created_at: stamp() };
    mutate(`Added “${title}”`, [{ type: "create", table: "checklist_items", row: { ...row } }, touchChecklist(c.id)]);
    setDraft("");
  };
  useCommands(
    "detail-checklist",
    [
      { id: "detail.cl.full", label: "Open in Checklists", group: "Details", run: openFull },
      { id: "detail.cl.add", label: "Add an item", group: "Details", keys: ["n"], run: () => addInput.current?.focus() },
      ...(proj ? [{ id: "detail.cl.jump", label: "Jump to the project it supports", group: "Details", keys: ["shift+j"], run: () => ui.jumpFromSupport("checklist", c.id) }] : []),
      ...(!c.repeats && p.ticked > 0 ? [{ id: "detail.cl.over", label: "Start over", group: "Details", run: () => startOver([c.id]) }] : []),
    ],
    { priority: 21, active },
  );
  return (
    <>
      <TextField label="Checklist" value={c.title} onCommit={(v) => patch("checklists", c.id, { title: v.trim(), updated_at: stamp() }, `Renamed ${quote(v)}`)} autoFocus className="field-title" />
      <section className="detail-actions">
        <h3 className="detail-h">
          {c.repeats ? "Habits" : "Items"} <span className="count">{p.total || ""}</span>
          <span className="detail-h-note">{[repeatsLabel(c.repeats), p.total ? progressLabel(p) || (c.repeats ? `0 of ${p.total} ${c.repeats === "week" ? "this week" : "today"}` : "") : ""].filter(Boolean).join(" · ")}</span>
        </h3>
        <ul className="timeline">
          {items.map((i) =>
            i.section ? (
              <li key={i.id} className="mini-section">
                {i.title || "Untitled section"}
              </li>
            ) : (
              (() => {
                const done = isTicked(s, i);
                const run = c.repeats ? streakLabel(streak(s, i, c.repeats), c.repeats) : "";
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      className={`mini-row is-tickable ${done ? "is-done" : ""}`}
                      title={run ? `${run} in a row` : undefined}
                      onClick={() => tickItems([i.id])}
                    >
                      <span className={`done-box ${done ? "is-checked" : ""}`} aria-hidden="true">
                        <svg viewBox="0 0 14 14" width="14" height="14">
                          <rect className="box" x="1" y="1" width="12" height="12" rx="2" />
                          <path className="check" d="M3.8 7.2l2.2 2.2 4.3-4.8" />
                        </svg>
                      </span>
                      <span className="mini-title">{i.title || "Untitled"}</span>
                      <span className="mini-meta num">{run}</span>
                    </button>
                  </li>
                );
              })()
            ),
          )}
        </ul>
        <input
          ref={addInput}
          className="field-text add-action"
          value={draft}
          aria-label={c.repeats ? "Add a habit" : "Add an item"}
          aria-keyshortcuts="N"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              addItem();
            }
          }}
        />
      </section>
      <p className="checklist-pane-foot">
        <button type="button" className="text-btn" onClick={openFull}>
          Open in Checklists
        </button>
        {!c.repeats && p.ticked > 0 && (
          <button type="button" className="text-btn" onClick={() => startOver([c.id])}>
            Start over
          </button>
        )}
        <span className="muted-text">{c.repeats ? "Earlier days, sections and order are there" : "Sections and order are there"}</span>
      </p>
    </>
  );
}

const WEEKDAY = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * A checklist item. On a routine it is a habit, and the pane gives its record (owner's request): how often it was done
 * since it became a habit, the last four weeks against the four before, its longest run, on a daily habit the
 * weekdays it slips, and half a year of squares, each opening its day to tick there. All of it is read from the
 * ticks; nothing here asks for upkeep, and nothing celebrates (no totals that only grow, no badges).
 */
function ChecklistItemDetail({ item }: { item: ChecklistItem }) {
  const s = useStore((x) => x);
  const list = s.checklists.find((c) => c.id === item.checklist_id);
  const repeats = list?.repeats ?? null;
  const viewDay = useChecklistDay();
  const unit = repeats === "week" ? "week" : "day";
  const rate = (k: number, of: number) => (of ? ` (${Math.round((100 * k) / of)}%)` : "");
  const stats = repeats && !item.section ? habitStats(s, item, repeats) : null;
  // The weekday it slips on: well under its usual rate, and seen at least three times.
  const slip = (() => {
    if (!stats || stats.weekdays.length === 0) return null;
    const seen = stats.weekdays.filter((d) => d.of >= 3);
    if (seen.length < 7) return null;
    const avg = stats.kept / Math.max(1, stats.of);
    const worst = [...seen].sort((a, b) => a.done / a.of - b.done / b.of)[0];
    return worst.done / worst.of < Math.min(0.6, avg - 0.2) ? worst : null;
  })();
  const ticked = !repeats && item.checked_at;
  return (
    <>
      <TextField label={item.section ? "Section" : repeats ? "Habit" : "Item"} value={item.title} onCommit={(v) => patch("checklist_items", item.id, { title: v }, `Renamed ${quote(v)}`)} autoFocus className="field-title" />
      <p className="detail-meta">
        In {quote(list?.title ?? "", "Untitled checklist")}
        {repeats ? ` · ${repeatsLabel(repeats)}` : ""}
        {ticked ? ` · ticked ${formatLong(item.checked_at!.slice(0, 10))}` : ""}
      </p>
      {stats && repeats && (
        <>
          <section className="habit-record" aria-label="Record">
            <h3 className="detail-h">Record</h3>
            <p>
              Done <strong>{stats.kept}</strong> of {plural(stats.of, unit)}
              {rate(stats.kept, stats.of)} since {formatLong(stats.since)}
            </p>
            {stats.recent.of > 0 && (
              <p>
                Last 4 weeks <strong>{stats.recent.kept}</strong> of {stats.recent.of}
                {stats.before.of > 0 && (
                  <span className="muted-text">
                    {" "}
                    · the 4 before {stats.before.kept} of {stats.before.of}
                  </span>
                )}
              </p>
            )}
            {stats.longest > 0 && (
              <p>
                Longest run <strong>{plural(stats.longest, unit)}</strong>
                {stats.longestEnd && stats.longest > stats.current ? <span className="muted-text">, to {formatLong(stats.longestEnd)}</span> : null}
                <span className="muted-text"> · now {plural(stats.current, unit)}</span>
              </p>
            )}
            {stats.weekdays.length > 0 && (
              <>
                <div className="habit-weekdays" role="img" aria-label={stats.weekdays.map((d) => `${WEEKDAY[d.wd]} ${d.done} of ${d.of}`).join(", ")}>
                  {stats.weekdays.map((d) => (
                    <span key={d.wd} className={slip?.wd === d.wd ? "is-slip" : ""}>
                      <i style={{ height: `${d.of ? Math.max(2, Math.round((18 * d.done) / d.of)) : 0}px` }} />
                      <b>{WEEKDAY_LETTER[d.wd]}</b>
                    </span>
                  ))}
                </div>
                {slip && (
                  <p className="muted-text">
                    Slips most on {WEEKDAY[slip.wd]} ({slip.done} of {slip.of})
                  </p>
                )}
              </>
            )}
          </section>
          <section className="habit-record" aria-label="Half a year">
            <h3 className="detail-h">Half a year</h3>
            <span className={`habit-year is-${repeats}`} role="img" aria-label={`Done ${stats.recent.kept} of the last ${stats.recent.of} ${unit}s; each square opens its ${unit}`}>
              {longHistory(s, item, repeats).map((c) => (
                <i
                  key={c.day}
                  // Days before it was a habit are no misses: they fade.
                  className={`${c.done ? "is-on" : ""} ${(viewDay ? c.day === viewDay : c.now) ? "is-now" : ""} ${c.future ? "is-future" : ""} ${c.day < stats.since && !c.done ? "is-before" : ""}`}
                  title={c.future ? undefined : historyTitle(c, repeats)}
                  onClick={() => !c.future && setChecklistDay(c.day, repeats)}
                />
              ))}
            </span>
          </section>
        </>
      )}
      <p className="detail-meta">Added {formatLong(item.created_at.slice(0, 10))}</p>
    </>
  );
}

/** A locked reference's file, while unlocked: its real name (kept encrypted in its row), opened by decrypting it here. */
function SealedFile({ f, onOpen }: { f: FileRow; onOpen: () => void }) {
  const m = useOpenedFile(f);
  const name = m?.name ?? "Opening…";
  return (
    <li className="file-row">
      <Paperclip size={13} strokeWidth={1.75} aria-hidden />
      <a
        href={`/api/files/${f.id}`}
        className="file-name"
        data-file={f.id}
        onClick={(e) => {
          e.preventDefault();
          onOpen();
        }}
      >
        {name}
      </a>
      <span className="file-size">{fileSize(f.size)}</span>
      <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={() => mutate(`“${name}” removed`, [{ type: "delete", table: "files", id: f.id }])}>
        <X size={13} strokeWidth={2} />
      </button>
    </li>
  );
}

/**
 * A locked reference while the lock is shut: the pane says what is locked and takes the password right here, where
 * you are looking, rather than in a picker.
 */
export function RefUnlock({ files, autoFocus }: { files: number; autoFocus?: boolean }) {
  const [pw, setPw] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "wrong">("idle");
  const field = useRef<HTMLInputElement>(null);
  const active = useContext(DetailActive) || Boolean(autoFocus);
  useEffect(() => {
    if (active) field.current?.focus({ preventScroll: true });
  }, [active]);
  const submit = async () => {
    if (!pw || state === "busy") return;
    setState("busy");
    const ok = await unlock(pw);
    setPw("");
    setState(ok ? "idle" : "wrong");
    if (!ok) field.current?.focus();
  };
  return (
    <section className="ref-locked" aria-labelledby="ref-locked-h">
      <h3 className="ref-locked-h" id="ref-locked-h">
        <Lock size={14} strokeWidth={2} aria-hidden />
        Locked
      </h3>
      <p className="ref-locked-text">Its notes{files ? ` and ${plural(files, "file")}` : ""} are encrypted. The lock password opens every locked reference for 5 minutes.</p>
      <form
        className="ref-locked-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={field}
          type="password"
          className="field-text"
          value={pw}
          placeholder="Lock password"
          aria-label="Lock password"
          aria-invalid={state === "wrong" || undefined}
          aria-describedby={state === "wrong" ? "ref-locked-err" : undefined}
          autoComplete="current-password"
          onChange={(e) => {
            setPw(e.target.value);
            if (state === "wrong") setState("idle");
          }}
        />
        <button type="submit" className="lock-button" disabled={!pw || state === "busy"}>
          {state === "busy" ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      {state === "wrong" && (
        <p className="ref-locked-err" id="ref-locked-err" role="alert">
          That isn't the lock password.
        </p>
      )}
    </section>
  );
}

/**
 * A reference list in the pane: its items as rows (a click or Enter rewrites one; emptied, it goes), its section
 * headings as quiet labels, a line to add at the end (N; a pasted list becomes items), and the way to the whole list,
 * where it is reordered and kept with the list's keys.
 */
function RefListPane({ r }: { r: Ref }) {
  const ui = useUI();
  const active = useContext(DetailActive);
  const { text, save } = useRefText(r);
  const lines = text === null ? [] : linesOf(text);
  const [edit, setEdit] = useState<{ key: string; v: string } | null>(null);
  const [draft, setDraft] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  useCommands("detail-reflist", [{ id: "detail.rl.add", label: "Add an item", group: "Details", keys: ["n"], run: () => addInput.current?.focus() }], { priority: 21, active });
  if (text === null) return null;
  const commitEdit = () => {
    if (!edit) return;
    const i = lines.findIndex((l) => l.key === edit.key);
    setEdit(null);
    if (i < 0 || edit.v.trim() === lines[i].text) return;
    const next = [...lines];
    if (!edit.v.trim()) next.splice(i, 1);
    else next[i] = { ...next[i], text: edit.v.trim() };
    save(textOf(next), edit.v.trim() ? "Rewritten" : `“${lines[i].text}” removed`);
  };
  const addItems = (raw: string) => {
    const incoming = raw.includes("\n") ? linesOf(noteAsList(raw)) : raw.trim() ? [{ key: "", text: raw.trim(), section: false }] : [];
    if (!incoming.length) return;
    save(textOf([...lines, ...incoming]), incoming.length === 1 ? `Added “${incoming[0].text}”` : `${plural(incoming.length, "item")} added`);
    setDraft("");
  };
  const items = lines.filter((l) => !l.section).length;
  return (
    <section className="detail-actions" aria-label="List">
      <h3 className="detail-h">
        List <span className="count">{items || ""}</span>
      </h3>
      <ul className="timeline">
        {lines.map((l) =>
          l.section ? (
            <li key={l.key} className="mini-section">
              {l.text}
            </li>
          ) : edit?.key === l.key ? (
            <li key={l.key}>
              <input
                className="field-text ref-line-edit"
                value={edit.v}
                autoFocus
                aria-label="Item"
                onChange={(e) => setEdit({ key: l.key, v: e.target.value })}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </li>
          ) : (
            <li key={l.key}>
              <button type="button" className="mini-row" title="Rewrite (empty it to remove)" onClick={() => setEdit({ key: l.key, v: l.text })}>
                <span className="ref-bullet" aria-hidden="true" />
                <span className="mini-title">{l.text}</span>
                <span className="mini-meta" />
              </button>
            </li>
          ),
        )}
      </ul>
      <input
        ref={addInput}
        className="field-text add-action"
        value={draft}
        aria-label="Add an item"
        aria-keyshortcuts="N"
        onChange={(e) => setDraft(e.target.value)}
        onPaste={(e) => {
          const t = e.clipboardData.getData("text");
          if (t.includes("\n")) {
            e.preventDefault();
            addItems(t);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            addItems(draft);
          }
        }}
      />
      <p className="checklist-pane-foot">
        <button type="button" className="text-btn" onClick={() => (ui.go("reference"), openRefList(r.id))}>
          Open the list
        </button>
        <span className="muted-text">Sections and order are kept there</span>
      </p>
    </section>
  );
}

function RefDetail({ r }: { r: Ref }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const lock = useLock();
  const notes = useOpenedNotes(r);
  // ⇧J, as on the Reference list: to the project it supports, and ⇧J there comes back.
  const active = useContext(DetailActive);
  useCommands(
    "detail-ref",
    [
      { id: "detail.r.jump", label: "Jump to the project it supports", group: "Details", keys: ["shift+j"], run: () => ui.jumpFromSupport("ref", r.id) },
      ...(!r.sealed || lock.unlocked ? [{ id: "detail.r.form", label: r.form === "list" ? "Show as a note" : "Show as a list", group: "Details", run: () => void setForm([r.id], r.form === "list" ? null : "list") }] : []),
      r.sealed
        ? { id: "detail.r.unseal", label: "Remove the lock", group: "Details", run: () => removeLock(ui, [r.id]) }
        : { id: "detail.r.seal", label: "Lock with password", group: "Details", run: () => lockWithPassword(ui, [r.id]) },
      ...(lock.unlocked ? [{ id: "detail.r.locknow", label: "Lock now", group: "Details", run: () => lockNow() }] : []),
    ],
    { priority: 21, active },
  );
  const proj = s.projects.find((p) => p.id === r.project_id);
  const files = s.files.filter((f) => f.owner_kind === "ref" && f.owner_id === r.id);
  // A file left in the clear on a locked reference (locking was cut short) is encrypted as soon as it is open.
  useEffect(() => {
    if (r.sealed && lock.unlocked) files.filter((f) => !f.sealed).forEach((f) => void sealFile(f).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.sealed, lock.unlocked, files.length]);
  const open = !r.sealed || lock.unlocked;
  const links = r.form === "list" ? [] : backlinks(s, r);
  return (
    <>
      <TextField
        label="Title"
        value={r.title}
        // A rename takes the links to it along ([[Old]] becomes [[New]]), as one step.
        onCommit={(v) => {
          const ops = renameOps(getState(), r, v);
          if (!ops.length) return;
          const n = ops.length - 1;
          mutate(`Renamed ${quote(v)}${n ? `, ${n === 1 ? "1 link" : `${n} links`} to it updated` : ""}`, ops);
        }}
        autoFocus
        className="field-title"
      />
      <PickField
        label="Project"
        k="P"
        // The one project picker every list's P opens.
        onOpen={() => setProject(ui, "refs", [r.id])}
      >
        {proj ? proj.title : none}
      </PickField>
      {!open ? (
        <RefUnlock files={files.length} />
      ) : r.form === "list" ? (
        <RefListPane r={r} />
      ) : r.sealed && notes === null ? (
        <p className="detail-meta">Opening…</p>
      ) : (
        <NotesField
            label="Notes"
            note={r}
            value={(r.sealed ? notes : r.notes) ?? ""}
            saveKey={`refs:${r.id}:notes`}
            local={!r.sealed}
            save={(v, o) => (r.sealed ? saveSealedNotes(r, v, "Notes saved", {}, o) : mutate("Notes saved", [{ type: "patch", table: "refs", id: r.id, data: { notes: v } }], o))}
            owner={{ kind: "ref", id: r.id }}
            onFollow={(f) => {
              if (f.kind === "note") return followNote(ui, f.title);
              if (f.kind === "url") return void window.open(f.href, "_blank", "noopener");
              const ids = files.map((x) => x.id);
              ui.openViewer(ids, Math.max(0, ids.indexOf(f.id)));
            }}
          />
      )}
      {open && <Files owner={{ kind: "ref", id: r.id }} />}
      {/* The notes that link to this one, each with the line that does: a click opens it here. */}
      {links.length > 0 && (
        <section className="detail-actions" aria-label="Linked from">
          <h3 className="detail-h">
            Linked from <span className="count">{links.length}</span>
          </h3>
          <ul className="timeline">
            {links.map((x) => (
              <li key={x.id}>
                {/* As support material opens: in the pane, Esc back to this note. */}
                <button type="button" className="mini-row" onClick={() => ui.drillDetail({ kind: "ref", id: x.id })} title={linkContext(x.notes, r.title) || firstLine(x.notes, x.title)}>
                  <span className="kind-icon">
                    <StickyNote size={14} strokeWidth={1.75} aria-label="Note" />
                  </span>
                  <span className="mini-title">{x.title || "Untitled"}</span>
                  <span className="mini-meta" />
                  <span className="mini-date">{formatDate(refUpdated(s, x).slice(0, 10))}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.sealed && lock.unlocked && (
        <p className="ref-lock-line">
          <Lock size={12} strokeWidth={2} aria-hidden />
          <span>Locked: notes and files are encrypted before they are saved.</span>
          <button type="button" className="text-btn" onClick={() => lockNow()}>
            Lock now
          </button>
          <button type="button" className="text-btn" onClick={() => removeLock(ui, [r.id])}>
            Remove the lock
          </button>
        </p>
      )}
      {!r.sealed && (
        <button type="button" className="text-btn ref-lock-btn" onClick={() => lockWithPassword(ui, [r.id])}>
          <Lock size={12} strokeWidth={2} aria-hidden />
          Lock with password
        </button>
      )}
      <p className="detail-meta">
        Created {formatLong(r.created_at.slice(0, 10))}
        {refUpdated(s, r) > r.created_at ? ` · updated ${formatLong(refUpdated(s, r).slice(0, 10))}` : ""}
      </p>
    </>
  );
}

export function Detail({ target, active }: { target: Target | null; active: boolean }) {
  const touch = useIsTouch();
  const ui = useUI();
  const s = useStore((x) => x);
  const root = useRef<HTMLElement>(null);
  /** What an item is called, for the pane's name and its back link. An appointment is known by its link, if any. */
  const titleOf = (t: Target) =>
    t.kind === "action"
      ? s.actions.find((x) => x.id === t.id)?.title
      : t.kind === "project"
        ? s.projects.find((x) => x.id === t.id)?.title
        : t.kind === "stuff"
          ? s.stuff.find((x) => x.id === t.id)?.text.split("\n")[0]
          : t.kind === "event"
            ? s.appointments.find((x) => x.id === t.id)?.title
            : t.kind === "checkitem"
              ? s.checklist_items.find((x) => x.id === t.id)?.title
              : t.kind === "checklist"
                ? s.checklists.find((x) => x.id === t.id)?.title
              : s.refs.find((x) => x.id === t.id)?.title;

  /*
   * The pane is a list of fields, walked like every other region (owner's decision): a cursor sits on one field, ↑↓
   * move it, Enter opens or edits it, and the field under it takes the blue a focused row takes (grey while you are
   * elsewhere). A field's letter key, a click, Tab or F2 moves the cursor to that field. Each new item starts it on
   * its first field, the title.
   */
  const stops = () => [...(root.current?.querySelectorAll<HTMLElement>(PANE_STOPS) ?? [])].filter((el) => el.offsetParent !== null);
  // Where the cursor was in each item the pane has shown on this trail, so Esc back from an item opened inside the
  // pane (support material, a project's action) lands where you were, not on the first field (owner's rule: Esc
  // always takes you back to where you were).
  const cursorAt = useRef(new Map<string, number>());
  const shownKey = target ? `${target.kind}:${target.id}` : "";
  const shownKeyRef = useRef(shownKey);
  shownKeyRef.current = shownKey;
  const setCursor = (el: HTMLElement | null | undefined) => {
    root.current?.querySelectorAll("[data-cursor]").forEach((x) => x !== el && x.removeAttribute("data-cursor"));
    if (!el) return;
    el.setAttribute("data-cursor", "");
    el.scrollIntoView({ block: "nearest" });
    const i = stops().indexOf(el);
    if (i >= 0) cursorAt.current.set(shownKeyRef.current, i);
  };
  const cursorEl = () => root.current?.querySelector<HTMLElement>("[data-cursor]") ?? null;
  const moveCursor = (dir: 1 | -1) => {
    const list = stops();
    const i = list.findIndex((x) => x.hasAttribute("data-cursor"));
    setCursor(list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + dir))]);
  };
  // A new item starts the cursor on its first field; one come back to along the trail (Esc, the back link) puts it back
  // where it was. Anything opened from a list starts the trail, and the memory, afresh.
  const trailWas = useRef(ui.detailTrail.length);
  useEffect(() => {
    const back = ui.detailTrail.length < trailWas.current;
    trailWas.current = ui.detailTrail.length;
    if (!ui.detailTrail.length && !back) cursorAt.current = new Map();
    const raf = requestAnimationFrame(() => {
      const list = stops();
      const at = back ? cursorAt.current.get(shownKey) : undefined;
      setCursor(list[at !== undefined ? Math.min(at, list.length - 1) : 0]);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.id]);

  useCommands(
    "detail",
    [
      { id: "detail.down", label: "Go to the next field", group: "Details", keys: ["arrowdown"], run: () => moveCursor(1) },
      { id: "detail.up", label: "Go to the previous field", group: "Details", keys: ["arrowup"], run: () => moveCursor(-1) },
      {
        id: "detail.open",
        label: "Edit this field",
        group: "Details",
        keys: ["enter"],
        run: () => {
          const el = cursorEl();
          if (!el) return;
          if (el.matches("button, a")) el.click();
          else el.focus();
        },
      },
      {
        // Escape steps out one level. In a text field it only leaves the field (the edit is saved on blur) and the pane keeps
        // focus, so its field keys work again; from the pane it closes it (unless pinned) and you're back on the row.
        id: "detail.back",
        label: ui.detailTrail.length ? `Back to “${titleOf(ui.detailTrail[ui.detailTrail.length - 1]) || "the previous item"}”` : ui.detailPinned ? "Back to the list" : "Close details",
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
          // Opened from inside the pane (a project's action or appointment): back to where it was opened from.
          if (ui.detailTrail.length) {
            ui.detailBack();
            root.current?.focus({ preventScroll: true });
            return;
          }
          el?.blur?.();
          if (!ui.detailPinned) ui.openDetail(null);
          ui.setRegion("list");
        },
      },
      {
        id: "detail.edit",
        label: "Rename",
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
      { id: "detail.close", label: "Close details, pinned or not", group: "Details", keys: ["mod+backspace"], run: () => ui.openDetail(null) },
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

  // An appointment isn't in the store: it comes from the calendars' feed, looked up by its key.
  const eventHere = useEvent(target?.kind === "event" ? target.id : null);
  // The pane is announced by what it shows: "Action details: Pay the VAT for Q3".
  const paneName = (() => {
    if (!target) return "Details";
    const kind = ({ action: "Action", project: "Project", stuff: "Inbox item", ref: "Reference", event: "Appointment", checkitem: "Checklist item" } as Record<string, string>)[target.kind] ?? "Item";
    const title = (target.kind === "event" ? eventHere?.title : undefined) ?? titleOf(target);
    return `${kind} details${title ? `: ${title}` : ""}`;
  })();
  // Where the pane was drilled from, for its back link.
  const from = ui.detailTrail[ui.detailTrail.length - 1];

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
  } else if (target.kind === "checklist") {
    const c = s.checklists.find((x) => x.id === target.id);
    body = c ? <ChecklistDetail key={c.id} c={c} /> : null;
  } else if (target.kind === "checkitem") {
    const item = s.checklist_items.find((x) => x.id === target.id);
    body = item ? <ChecklistItemDetail key={item.id} item={item} /> : null;
  } else if (target.kind === "event") {
    // An appointment linked to a project opens from the project even when its week hasn't been fetched: what the link
    // kept of it (title, day, time) stands in until the calendar has it.
    const kept = s.appointments.find((x) => x.id === target.id);
    const e: CalEvent | undefined =
      eventHere ??
      (kept ? { key: kept.id, feed: kept.feed, title: kept.title, location: null, date: kept.date, endDate: kept.date, time: kept.time, endTime: kept.end_time, description: null, url: null, organizer: null, attendees: [], tentative: false } : undefined);
    body = e ? <EventDetail key={e.key} e={e} /> : null;
  }

  return (
    <aside
      ref={root}
      className={`detail ${active ? "is-active" : ""}`}
      aria-label={paneName}
      tabIndex={-1}
      // Focus arriving in the pane by any route (a click into its notes, Tab) makes it the active region, so its
      // keys work there: Esc leaves a field and saves it, even in a pinned pane opened from the list.
      onFocus={(e) => {
        if (!active) ui.setRegion("detail");
        // Whatever field takes focus (a click, Tab, its letter key, F2) takes the cursor with it.
        const stop = (e.target as HTMLElement).closest<HTMLElement>(PANE_STOPS);
        if (stop && root.current?.contains(stop)) setCursor(stop);
      }}
    >
      <div className="detail-bar">
        {/* Drilled in from a project: the way back, named, in place of the heading (Esc does the same). */}
        {from ? (
          <>
            <h2 className="visually-hidden" id="detail-title">
              Details
            </h2>
            <button type="button" className="detail-back" onClick={() => ui.detailBack()} aria-keyshortcuts="Escape" title={`Back to “${titleOf(from) || "the previous item"}” (Esc)`}>
              <ChevronLeft size={14} strokeWidth={2} aria-hidden />
              <span className="detail-back-name">{titleOf(from) || "Back"}</span>
            </button>
          </>
        ) : (
          <h2 className="detail-title" id="detail-title">
            Details
          </h2>
        )}
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
        <div className="detail-body" ref={evenGutter}>
          {body ?? <p className="muted-text">{target ? "This item no longer exists." : "Nothing here has details. Move the cursor onto an item, action or project."}</p>}
          {touch && body && target?.kind === "stuff" && <KeyHints hints={STUFF_TOUCH} />}
        </div>
      </DetailActive.Provider>
    </aside>
  );
}
