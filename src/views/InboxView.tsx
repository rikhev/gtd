import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mail, Paperclip, StickyNote } from "lucide-react";
import { getState, mutate, named, newAction, newProject, stamp, upload, useStore, uid } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, type Column } from "../components/Grid.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { askContext, askWaitingOn, destinationItems } from "../actionCommands.tsx";
import { formatDate } from "../../shared/dates.ts";
import type { ID, Op, Stuff } from "../../shared/types.ts";

export function firstLine(text: string) {
  return text.split("\n").find((l) => l.trim())?.trim() ?? "";
}

/** Emails read best by their subject; everything else by its first line. */
export function stuffTitle(st: Pick<Stuff, "text" | "kind">) {
  if (st.kind === "email") {
    const m = st.text.match(/^(?:subject|ämne):\s*(.+)$/im);
    if (m) return m[1].trim();
  }
  return firstLine(st.text);
}

export function InboxView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [editing, setEditing] = useState<ID | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => s.stuff.filter((x) => x.status === "inbox").sort((a, b) => a.created_at.localeCompare(b.created_at)), [s.stuff]);
  const filesBy = useMemo(() => {
    const m = new Map<string, number>();
    s.files.forEach((f) => f.owner_kind === "stuff" && m.set(f.owner_id, (m.get(f.owner_id) ?? 0) + 1));
    return m;
  }, [s.files]);

  const navGroups = useMemo(() => [{ key: "inbox", rowKeys: rows.map((r) => r.id), showHeader: false }], [rows]);
  const nav = useListNav("inbox", navGroups);
  const focusId = nav.focus;
  const n = (ids: ID[]) => named("stuff", ids, "item");

  useEffect(() => {
    if (focusId && ui.detail?.kind === "stuff" && ui.detail.id !== focusId) ui.openDetail({ kind: "stuff", id: focusId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (ui.revealTarget?.kind === "stuff") {
      nav.setFocus(ui.revealTarget.id);
      ui.clearReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget]);

  /** Done already: log it as a completed action (the two-minute rule). */
  const doneNow = (ids: ID[]) => {
    const ops: Op[] = [];
    for (const st of getState().stuff.filter((x) => ids.includes(x.id))) {
      const a = newAction({ title: firstLine(st.text), status: "done", completed_at: stamp() });
      ops.push({ type: "create", table: "actions", row: { ...a } });
      ops.push({ type: "patch", table: "stuff", id: st.id, data: { status: "processed", processed_at: stamp() } });
    }
    mutate(`${n(ids)} done and logged`, ops);
  };
  const trashNow = (ids: ID[]) => mutate(`${n(ids)} trashed`, ids.map((id) => ({ type: "patch", table: "stuff", id, data: { status: "trashed" } })));

  /**
   * File: the whole clarify decision in one picker. A list, an existing project,
   * a new project (type its name), done now, or trash.
   */
  const quickFile = (ids: ID[]) => {
    if (!ids.length) return;
    ui.openPicker({
      type: "list",
      title: "File as",
      // GTD order: the lists, then "under two minutes? do it now" (or trash it), then the projects.
      items: [
        ...destinationItems().filter((it) => it.section === "lists"),
        { id: "__done", label: "Done already (two-minute rule)", section: "now" },
        { id: "__trash", label: "Trash", section: "now" },
        ...destinationItems().filter((it) => it.section === "projects"),
      ],
      placeholder: "Filter, or name a new project",
      createLabel: (q) => `New project “${q}”, with this as its first action`,
      onCreate: (q) => {
        const p = newProject({ title: q });
        // A project's first action is a next action, so it needs a context too.
        askContext(ui, `Context for the first action of “${q}”`, (ctx, extra) => file(p.id, undefined, [{ type: "create", table: "projects", row: { ...p } }, ...extra], `project “${q}”`, ctx));
      },
      onPick: (target) => {
        if (!target) return;
        if (target === "__done") doneNow(ids);
        else if (target === "__trash") trashNow(ids);
        else if (target === "waiting") askWaitingOn(ui, null, (who) => file(target, who));
        else if (target === "someday" || target === "reference") file(target);
        // A next action (on its own or in a project) always gets a context.
        else askContext(ui, "Context", (ctx, extra) => file(target, undefined, extra, undefined, ctx));
      },
    });
    function file(target: string, who?: string, first: Op[] = [], into?: string, contextId?: ID) {
        const ops: Op[] = [...first];
        for (const st of getState().stuff.filter((x) => ids.includes(x.id))) {
          const title = stuffTitle(st);
          const rest = st.text.slice(st.text.indexOf(title) + title.length).trim();
          const files = getState().files.filter((f) => f.owner_kind === "stuff" && f.owner_id === st.id);
          let owner: { kind: string; id: ID };
          if (target === "reference") {
            const rid = uid();
            ops.push({ type: "create", table: "refs", row: { id: rid, title, notes: rest, project_id: null, status: "active", created_at: stamp() } });
            owner = { kind: "ref", id: rid };
          } else {
            const isList = ["next", "someday", "waiting"].includes(target);
            const a = newAction({
              title,
              notes: rest,
              status: isList ? (target as "next") : "next",
              project_id: isList ? null : target,
              waiting_since: target === "waiting" ? new Date().toISOString().slice(0, 10) : null,
              waiting_who: target === "waiting" ? (who ?? null) : null,
              context_id: contextId ?? null,
            });
            ops.push({ type: "create", table: "actions", row: { ...a } });
            owner = { kind: "action", id: a.id };
          }
          files.forEach((f) => ops.push({ type: "patch", table: "files", id: f.id, data: { owner_kind: owner.kind, owner_id: owner.id } }));
          ops.push({ type: "patch", table: "stuff", id: st.id, data: { status: "processed", processed_at: stamp() } });
        }
        mutate(target === "waiting" ? `${n(ids)} → Waiting For (${who})` : into ? `${n(ids)} → new ${into}` : `${n(ids)} filed`, ops);
    }
  };

  const commands: Command[] = [
    ...nav.commands,
    { id: "inbox.new", label: "Capture", group: "Inbox", keys: ["n"], run: ui.focusCapture },
    { id: "inbox.clarify", label: "Clarify", group: "Inbox", keys: ["k"], run: () => ui.startClarify(), enabled: rows.length > 0 },
    { id: "inbox.open", label: "Open details", group: "Inbox", keys: ["enter"], run: () => focusId && ui.openDetail({ kind: "stuff", id: focusId }, true), enabled: Boolean(focusId) },
    { id: "inbox.rename", label: "Edit text", group: "Inbox", keys: ["f2"], run: () => focusId && setEditing(focusId), enabled: Boolean(focusId) },
    { id: "inbox.file", label: "File", group: "Inbox", keys: ["v"], run: () => quickFile(nav.targets()), enabled: Boolean(focusId) },
    {
      id: "inbox.done",
      label: "Done already (two-minute rule)",
      group: "Inbox",
      keys: ["e"],
      enabled: Boolean(focusId),
      run: () => doneNow(nav.targets()),
    },
    {
      id: "inbox.trash",
      label: "Trash",
      group: "Inbox",
      keys: ["backspace", "delete"],
      enabled: Boolean(focusId),
      run: () => trashNow(nav.targets()),
    },
    {
      id: "inbox.delete",
      label: "Delete permanently",
      group: "Inbox",
      keys: ["shift+backspace", "shift+delete"],
      enabled: Boolean(focusId),
      run: () => {
        const ids = nav.targets();
        mutate(`${n(ids)} deleted permanently`, ids.map((id) => ({ type: "delete", table: "stuff", id })));
      },
    },
    { id: "inbox.upload", label: "Upload files to the Inbox", group: "Inbox", keys: ["mod+o"], run: () => fileInput.current?.click() },
  ];
  useCommands("list:inbox", commands, { priority: 10, active: regionActive });

  const icon = (st: Stuff) =>
    st.kind === "email" ? <Mail size={14} strokeWidth={1.75} aria-label="Email" /> : st.kind === "file" ? <FileText size={14} strokeWidth={1.75} aria-label="File" /> : <StickyNote size={14} strokeWidth={1.75} aria-label="Note" />;

  const columns: Column<Stuff>[] = [
    { key: "kind", label: "", width: "30px", render: (st) => <span className="kind-icon">{icon(st)}</span> },
    {
      key: "subject",
      label: "Stuff",
      width: "minmax(240px, 1fr)",
      render: (st) =>
        editing === st.id ? (
          <InlineEdit
            value={st.text}
            placeholder="Capture anything"
            onDone={(v) => {
              setEditing(null);
              if (v.trim() && v !== st.text) mutate("Edited", [{ type: "patch", table: "stuff", id: st.id, data: { text: v } }]);
            }}
          />
        ) : (
          <span className="subject">
            <span className="subject-text">{stuffTitle(st) || "Untitled"}</span>
            {st.text.includes("\n") && <span className="subject-more">{st.kind === "email" ? (st.text.match(/^(?:from|från):\s*(.+)$/im)?.[1] ?? "") : st.text.split("\n").filter((l) => l.trim()).slice(1, 2).join(" ")}</span>}
          </span>
        ),
    },
    {
      key: "files",
      label: "Files",
      width: "64px",
      render: (st) =>
        filesBy.get(st.id) ? (
          <span className="files-count">
            <Paperclip size={12} strokeWidth={2} aria-hidden /> {filesBy.get(st.id)}
          </span>
        ) : (
          <span className="dash" aria-hidden="true">–</span>
        ),
    },
    { key: "when", label: "Captured", width: "96px", render: (st) => <span className="date">{formatDate(st.created_at.slice(0, 10))}</span> },
  ];

  return (
    <>
      <Grid
        listId="inbox"
        columns={columns}
        groups={[{ key: "inbox", label: "", rows }]}
        getKey={(st) => st.id}
        nav={nav}
        active={regionActive}
        showHeaders={false}
        onOpen={(k) => ui.openDetail({ kind: "stuff", id: k }, true)}
        empty={
          <EmptyState
            title="Inbox zero"
            note="Everything you've captured has been clarified."
            lines={["Capture a thought, upload documents or email files, or paste text straight into the Inbox."]}
          />
        }
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.txt,.md,.eml,.msg,.csv,.json,.html,image/*"
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
