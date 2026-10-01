import { useEvent, type CalEvent } from "../calendarFeed.ts";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, Paperclip, Pin, Check, ChevronLeft, CircleHelp, CircleDashed, Video, BookOpen, ListChecks, Plus } from "lucide-react";
import { mutate, newAction, nextAppointment, notify, notStarted, projectHealth, refUpdated, stallReason, startsToday, upload, useMeta, useStore } from "../store.ts";
import { useUI, type Target } from "../ui.tsx";
import { isEditable, runWhenReady, useCommands } from "../keys.ts";
import { askContext, editors, linkAppointment, projectItems, quickAddNextAction, quickAddWaiting } from "../actionCommands.tsx";
import { projectEditors } from "../views/ProjectsView.tsx";
import { openChecklist, progress, progressLabel, repeatsLabel } from "../checklists.ts";
import { linkSupport } from "../support.ts";
import { joinStuff, splitStuff } from "../views/InboxView.tsx";
import { NotesArea } from "./NotesArea.tsx";
import { AreaName, ContextCode, Energy, EventMark, KeyHints, Lamp, Marker, useIsTouch } from "./bits.tsx";
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
      </span>
      {multiline ? (
        <NotesArea value={v} onValue={setV} onBlur={commit} placeholder={placeholder} aria-label={label} ref={area} rows={rows} className="field-text" aria-keyshortcuts={k} />
      ) : lead ? (
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

// The panes print no keys (owner's request: they are found in ⌘K and ⇧?, and each field announces its own). On a
// touch screen an Inbox item's two ways forward stay, as buttons to tap.
const STUFF_TOUCH: { k: string; label: string }[] = [
  { k: "v", label: "File as" },
  { k: "k", label: "Clarify" },
];

/** What the pane's cursor stops on, top to bottom: fields, the timeline's rows, the add line, the meeting link. */
const PANE_STOPS = ".detail-body .field .field-text, .detail-body .event-title, .detail-body .field-pick, .detail-body .mini-row, .detail-body .add-action, .detail-body .event-join";

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

      <ul>
        {files.map((f) => (
          <li key={f.id} className="file-row">
            <Paperclip size={13} strokeWidth={1.75} aria-hidden />
            <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="file-name">
              {f.name}
            </a>
            <span className="file-size">{fileSize(f.size)}</span>
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
      { id: "detail.a.addnext", label: "Add a next action (to this project)", group: "Details", keys: ["t"], run: () => (a.project_id ? projectEditors(ui).addNextAction(a.project_id) : quickAddNextAction(ui)) },
      { id: "detail.a.addwait", label: "Add a waiting for (to this project)", group: "Details", keys: ["w"], run: () => (a.project_id ? projectEditors(ui).addWaiting(a.project_id) : quickAddWaiting(ui)) },
    ],
    { priority: 21, active: paneActive },
  );
  // What kind of item this is decides its fields: a done or trashed item keeps the kind it had.
  const kind = (done ? a.done_from : a.status === "trashed" ? a.trashed_from : a.status) ?? "next";
  const waiting = kind === "waiting";
  // Each kind shows only the fields it needs (owner's request): a next action is planned (context, dates, time,
  // energy, repeat), a waiting item is chased (who, follow up, since, due), a someday item is parked (context, when to
  // look at it again). Done, nothing is planned any more, so start, repeat and bring back go. A field a kind doesn't
  // need still shows while it holds something, so nothing set is hidden.
  const NEEDS: Record<string, string[]> = {
    next: ["context", "due", "start", "time", "energy", "repeat", "person"],
    waiting: ["who", "followup", "since", "due"],
    someday: ["context", "back"],
  };
  const needs = new Set((NEEDS[kind] ?? NEEDS.next).filter((f) => !(done && ["start", "repeat", "back"].includes(f))));
  const has: Record<string, unknown> = { context: a.context_id, due: a.due, start: a.defer, time: a.time_min, energy: a.energy, repeat: a.recurrence, back: a.bring_back, person: a.person, who: a.waiting_who, followup: a.followup, since: a.waiting_since };
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
      "due",
      <PickField key="due" label="Due" k="D" onOpen={() => ed.date([a.id], "due")}>
        {a.due ? <DueLong date={a.due} done={done} /> : none}
      </PickField>,
    ],
    [
      "start",
      <PickField key="start" label="Start" k="S" onOpen={() => ed.date([a.id], "defer")}>
        {a.defer ? formatLong(a.defer) : none}
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
      <PickField key="followup" label="Follow up" onOpen={() => ed.date([a.id], "followup")}>
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
  // belongs to and who or where; when it comes up for you (start, follow up, or bring back) beside when it is due;
  // time and energy; how it recurs (or, waiting, since when) beside who it is with. A row keeps an empty cell rather than letting a field
  // slide across, so Due is always on the right. Fields this kind doesn't need but that hold a value follow.
  const rows: [string, string | null][] = [
    ["project", waiting ? "who" : "context"],
    [waiting ? "followup" : kind === "someday" ? "back" : "start", "due"],
    ["time", "energy"],
    [waiting ? "since" : "repeat", waiting ? null : "person"],
  ];
  const byKey = new Map(fields);
  const visible = (f: string | null): f is string => f !== null && (f === "project" || shown(f));
  const placed = new Set(rows.flat());
  const gap = (key: string) => <span key={key} className="field-gap" aria-hidden="true" />;
  const layout: ReactNode[] = [];
  rows.forEach(([l, r], i) => {
    if (!visible(l) && !visible(r)) return;
    layout.push(visible(l) ? byKey.get(l) : gap(`gl${i}`), r && visible(r) ? byKey.get(r) : gap(`gr${i}`));
  });
  for (const [f, el] of fields) if (!placed.has(f) && visible(f)) layout.push(el);
  return (
    <>
      {/* Important or done is the one thing the fields don't say, so its mark leads the subject, as on the list row. */}
      <TextField label="Subject" lead={a.flagged || done ? <Marker flagged={Boolean(a.flagged)} done={done} /> : undefined} value={a.title} onCommit={(v) => patch("actions", a.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      {/* The shared grid (see rows above): every kind's fields in the same places. */}
      <div className="field-grid">
        {layout}
      </div>
      <TextField label="Notes" value={a.notes} multiline rows={4} onCommit={(v) => patch("actions", a.id, { notes: v })} placeholder="Details, links, phone numbers…" />
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
 * it and who is coming, and what it's about. Only what the calendar's feed shares can be shown: a published Outlook
 * calendar leaves attendees out, so the pane says so rather than showing an empty list.
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
      { id: "detail.e.addnext", label: "Add a next action (from this appointment)", group: "Details", keys: ["t"], run: () => quickAddNextAction(ui) },
      { id: "detail.e.addwait", label: "Add a waiting for (from this appointment)", group: "Details", keys: ["w"], run: () => quickAddWaiting(ui) },
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
      <section className="event-people" aria-label="Attendees">
        <h3 className="detail-h">
          Attendees <span className="count">{e.attendees.length || ""}</span>
        </h3>
        {counts.length > 0 && <p className="event-counts">{counts.map(([st, n]) => `${n} ${STATUS_LABEL[st].toLowerCase()}`).join(" · ")}</p>}
        {people.length ? (
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
        ) : (
          <p className="muted-text small">This calendar's feed doesn't include who is invited (published and shared calendars usually leave that out); the full list is in the calendar itself.</p>
        )}
      </section>
      {e.description ? (
        <section className="event-about" aria-label="Description">
          <h3 className="detail-h">Description</h3>
          <p className="event-desc">
            <Linked text={e.description} />
          </p>
        </section>
      ) : (
        <p className="muted-text small">{/outlook|office365/i.test(feed?.host ?? "") ? "No description shared. A published Outlook calendar includes it only with “All details”." : "No description shared by this calendar."}</p>
      )}
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
      { id: "detail.support", label: "Link a reference or checklist to this project", group: "Details", run: () => linkSupport(ui, p.id) },
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
  // Its linked appointments, in the order they fall; those that have passed stay, faded, as a record.
  const appts = s.appointments.filter((x) => x.project_id === p.id).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const nextAppt = nextAppointment(s, p);
  const feedColor = (id: string) => meta.calendars.find((c) => c.id === id)?.color;
  return (
    <>
      {/* Area and status live in their own fields below; the head only carries the project's health, beside its name. */}
      <TextField label="Project" mark={<Lamp health={projectHealth(s, p)} start={p.start} appt={nextAppt} />} value={p.title} onCommit={(v) => patch("projects", p.id, { title: v }, "Renamed")} autoFocus className="field-title" />
      <div className="field-grid">
        <PickField label="Area" k="A" onOpen={() => ed.area([p.id])}>
          {area ? <AreaName name={area.name} color={area.color} /> : none}
        </PickField>
        <PickField label="Status" k="V" onOpen={() => ed.move([p.id])}>
          {{ active: "Active", someday: "Someday", done: "Done", trashed: "Trash" }[p.status]}
        </PickField>
        {/* The same grid as an action's: when it comes up for you (start, or for a someday project when to look at it
            again) on the left, Due always on the right. Each status shows the dates it needs; any date already set
            still shows, after them. */}
        {(() => {
          const someday = p.status === "someday";
          const startF = (
            <PickField key="start" label="Start" k="S" onOpen={() => ed.date([p.id], "start")}>
              {p.start ? formatLong(p.start) : none}
            </PickField>
          );
          const backF = (
            <PickField key="back" label="Bring back" k="B" onOpen={() => ed.date([p.id], "bring_back")}>
              {p.bring_back ? formatLong(p.bring_back) : none}
            </PickField>
          );
          const dueF = (
            <PickField key="due" label="Due" k="D" onOpen={() => ed.date([p.id], "due")}>
              {p.due ? <DueLong date={p.due} done={p.status === "done"} /> : none}
            </PickField>
          );
          const left = someday ? backF : p.status === "active" || p.start ? startF : null;
          const right = !someday || p.due ? dueF : null;
          const extra = someday ? (p.start ? startF : null) : p.bring_back ? backF : null;
          return (
            <>
              {(left || right) && (left ?? <span key="gl" className="field-gap" aria-hidden="true" />)}
              {(left || right) && (right ?? <span key="gr" className="field-gap" aria-hidden="true" />)}
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
        {p.status === "active" && !open.length && (notStarted(p) || startsToday(p)) && (
          <p className="badge-line is-quiet">{notStarted(p) ? `Starts ${formatLong(p.start!)}. No next action needed before then.` : "Starts today. Add its first next action below."}</p>
        )}
        {p.status === "active" && !open.some((a) => a.status === "next" || a.status === "waiting") && nextAppt && !notStarted(p) && (
          <p className="badge-line is-quiet">
            Next step: {nextAppt.title}, {nextAppt.date === today() ? "today" : formatLong(nextAppt.date)}
            {nextAppt.time ? ` ${nextAppt.time}` : ""}. Add a next action when it has happened.
          </p>
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
                  onClick={() => ui.drillDetail({ kind: "action", id: a.id })}
                >
                  <Marker flagged={!done && Boolean(a.flagged)} done={done} />
                  <span className="mini-title">{a.title || "Untitled action"}</span>
                  <span className="mini-meta">{a.status === "waiting" ? `Waiting · ${a.waiting_who ?? ""}` : done && a.done_from === "waiting" && a.waiting_who ? `Waited · ${a.waiting_who}` : a.status === "someday" ? "Someday" : ""}</span>
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
      <SupportMaterial projectId={p.id} />
      <TextField label="Support notes" value={p.notes} multiline rows={4} onCommit={(v) => patch("projects", p.id, { notes: v })} placeholder="Plans, meeting notes, phone numbers, links…" />
      <Files owner={{ kind: "project", id: p.id }} />
    </>
  );
}

/**
 * The project's support material (GTD keeps it with the project, apart from its actions): the references and
 * checklists linked to it, A–Z, references first. A reference opens here in the pane (Esc comes back); a checklist
 * opens in Checklists. The last row links another.
 */
function SupportMaterial({ projectId }: { projectId: string }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const refs = s.refs.filter((r) => r.status === "active" && r.project_id === projectId).sort((a, b) => a.title.localeCompare(b.title));
  const lists = s.checklists.filter((c) => c.status === "active" && c.project_id === projectId).sort((a, b) => a.title.localeCompare(b.title));
  const files = (id: string) => s.files.filter((f) => f.owner_kind === "ref" && f.owner_id === id).length;
  return (
    <section className="detail-actions" aria-label="Support material">
      <h3 className="detail-h">
        Support material {refs.length + lists.length > 0 && <span className="count">{refs.length + lists.length}</span>}
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
                title={`Checklist: ${c.title || "Untitled"}. Opens in Checklists`}
                onClick={() => {
                  ui.go("checklists");
                  openChecklist(c.id);
                }}
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
        <li>
          <button type="button" className="mini-row mini-link" onClick={() => linkSupport(ui, projectId)}>
            <span className="kind-icon">
              <Plus size={14} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="mini-title">Link a reference or checklist</span>
          </button>
        </li>
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
      <TextField label="Notes" value={parts.rest} multiline rows={4} placeholder="Details, links, phone numbers…" onCommit={(v) => patch("stuff", st.id, { text: joinStuff(parts.title, v, parts.prefix) }, "Edited")} />
      <Files owner={{ kind: "stuff", id: st.id }} />
      <p className="detail-meta">Captured {formatLong(st.created_at.slice(0, 10))}</p>
    </>
  );
}

function RefDetail({ r }: { r: Ref }) {
  const ui = useUI();
  const s = useStore((x) => x);
  // J, as on the Reference list: to the project it supports, and J there comes back.
  const active = useContext(DetailActive);
  useCommands("detail-ref", [{ id: "detail.r.jump", label: "Jump to the project it supports", group: "Details", keys: ["j"], run: () => ui.jumpFromSupport("ref", r.id) }], { priority: 21, active });
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
            // The same projects, in the same order, as everywhere a project is picked; the one it supports is marked.
            title: "Project it supports",
            items: projectItems(),
            current: r.project_id,
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
            : s.refs.find((x) => x.id === t.id)?.title;

  /*
   * The pane is a list of fields, walked like every other region (owner's decision): a cursor sits on one field, ↑↓
   * move it, Enter opens or edits it, and the field under it takes the blue a focused row takes (grey while you are
   * elsewhere). A field's letter key, a click, Tab or F2 moves the cursor to that field. Each new item starts it on
   * its first field, the title.
   */
  const stops = () => [...(root.current?.querySelectorAll<HTMLElement>(PANE_STOPS) ?? [])].filter((el) => el.offsetParent !== null);
  const setCursor = (el: HTMLElement | null | undefined) => {
    root.current?.querySelectorAll("[data-cursor]").forEach((x) => x !== el && x.removeAttribute("data-cursor"));
    if (!el) return;
    el.setAttribute("data-cursor", "");
    el.scrollIntoView({ block: "nearest" });
  };
  const cursorEl = () => root.current?.querySelector<HTMLElement>("[data-cursor]") ?? null;
  const moveCursor = (dir: 1 | -1) => {
    const list = stops();
    const i = list.findIndex((x) => x.hasAttribute("data-cursor"));
    setCursor(list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + dir))]);
  };
  useEffect(() => {
    const raf = requestAnimationFrame(() => setCursor(stops()[0]));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.id]);

  useCommands(
    "detail",
    [
      { id: "detail.down", label: "Next field", group: "Details", keys: ["arrowdown"], run: () => moveCursor(1) },
      { id: "detail.up", label: "Previous field", group: "Details", keys: ["arrowup"], run: () => moveCursor(-1) },
      {
        id: "detail.open",
        label: "Open or edit the field under the cursor",
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
        label: ui.detailTrail.length ? `Back to “${titleOf(ui.detailTrail[ui.detailTrail.length - 1]) || "the previous item"}”` : ui.detailPinned ? "Back to the list" : "Close details and go back to the list",
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

  // An appointment isn't in the store: it comes from the calendars' feed, looked up by its key.
  const eventHere = useEvent(target?.kind === "event" ? target.id : null);
  // The pane is announced by what it shows: "Action details: Pay the VAT for Q3".
  const paneName = (() => {
    if (!target) return "Details";
    const kind = ({ action: "Action", project: "Project", stuff: "Inbox item", ref: "Reference", event: "Appointment" } as Record<string, string>)[target.kind] ?? "Item";
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
