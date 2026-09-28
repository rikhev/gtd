import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mail, Paperclip, StickyNote } from "lucide-react";
import { archiveDone, mutate, reopenActions, upload, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, usePersisted, useSort, sortGroups, type Column, type Sorters } from "../components/Grid.tsx";
import { DoneBox } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { doneNow, fileStuff, trashNow } from "../fileStuff.ts";
import { formatDate } from "../../shared/dates.ts";
import type { ID, Stuff } from "../../shared/types.ts";

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

/**
 * Captured text as a heading and the rest: the heading is the line the item is known by (an email's subject,
 * otherwise the first line), the rest is everything else. Joining puts the heading line first.
 */
export function splitStuff(st: Pick<Stuff, "text" | "kind">) {
  const lines = st.text.split("\n");
  const title = stuffTitle(st);
  let i = st.kind === "email" ? lines.findIndex((l) => /^(?:subject|ämne):/i.test(l.trim())) : -1;
  if (i < 0) i = lines.findIndex((l) => l.trim());
  if (i < 0) return { title: "", rest: "", prefix: "" };
  const prefix = st.kind === "email" ? (lines[i].match(/^\s*((?:subject|ämne):\s*)/i)?.[1] ?? "") : "";
  const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n").replace(/^\s*\n/, "").trimEnd();
  return { title, rest, prefix };
}
export function joinStuff(title: string, rest: string, prefix = "") {
  const head = title.trim() ? `${prefix}${title.trim()}` : "";
  return [head, rest.trim() ? (head ? `\n${rest.trimEnd()}` : rest.trimEnd()) : ""].join("");
}

export function InboxView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const [editing, setEditing] = useState<ID | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const filesBy = useMemo(() => {
    const m = new Map<string, number>();
    // A ticked-off item's files ride on its logged action, which shares its id.
    s.files.forEach((f) => (f.owner_kind === "stuff" || f.owner_kind === "action") && m.set(f.owner_id, (m.get(f.owner_id) ?? 0) + 1));
    return m;
  }, [s.files]);
  // Oldest first is the Inbox's own order; a heading click sorts by that column instead.
  const [sort, setSort] = useSort("inbox");
  const sorters: Sorters<Stuff> = useMemo(() => ({ subject: (st) => stuffTitle(st), files: (st) => filesBy.get(st.id) ?? null, when: (st) => st.created_at }), [filesBy]);
  // Ticked-off items stay in the Inbox, struck through at the bottom, until archived (⇧E), as on every list.
  const [showDone, setShowDone] = usePersisted("showdone:inbox", true);
  const doneIds = useMemo(() => s.stuff.filter((x) => x.status === "done").map((x) => x.id), [s.stuff]);
  const [striking, setStriking] = useState<Set<ID>>(new Set());
  const rows = useMemo(() => {
    const open = s.stuff.filter((x) => x.status === "inbox" || (showDone && x.status === "done")).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const sorted = sortGroups([{ key: "inbox", label: "", rows: open }], sorters, sort)[0].rows;
    return [...sorted.filter((x) => x.status !== "done"), ...sorted.filter((x) => x.status === "done")];
  }, [s.stuff, sorters, sort, showDone]);

  const navGroups = useMemo(() => [{ key: "inbox", rowKeys: rows.map((r) => r.id), showHeader: false }], [rows]);
  const nav = useListNav("inbox", navGroups);
  const focusId = nav.focus;

  /** E and the Complete box: tick off (the pen strikes first), or untick when everything in hand is already done. */
  const toggleDone = (ids: ID[]) => {
    const items = s.stuff.filter((x) => ids.includes(x.id));
    if (!items.length) return;
    if (items.every((x) => x.status === "done")) return reopenActions(ids);
    const open = items.filter((x) => x.status === "inbox").map((x) => x.id);
    // The cursor stays in place, on the next open row, rather than following a done row to the bottom.
    if (focusId && open.includes(focusId)) {
      const i = rows.findIndex((x) => x.id === focusId);
      const next = rows.slice(i + 1).find((x) => x.status === "inbox" && !open.includes(x.id)) ?? [...rows.slice(0, i)].reverse().find((x) => x.status === "inbox" && !open.includes(x.id));
      if (next) nav.setFocus(next.id);
    }
    setStriking((prev) => new Set([...prev, ...open]));
    window.setTimeout(() => {
      doneNow(open);
      setStriking((prev) => new Set([...prev].filter((id) => !open.includes(id))));
    }, 280);
  };

  useEffect(() => {
    ui.followDetail(focusId ? { kind: "stuff", id: focusId } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (ui.revealTarget?.kind === "stuff") {
      nav.setFocus(ui.revealTarget.id);
      ui.clearReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.revealTarget]);

  const commands: Command[] = [
    ...nav.commands,
    { id: "inbox.new", label: "Capture", group: "Inbox", keys: ["n"], run: ui.focusCapture },
    { id: "inbox.clarify", label: "Clarify", group: "Inbox", keys: ["k"], run: () => ui.startClarify(), enabled: rows.length > 0 },
    { id: "inbox.open", label: "Open details", group: "Inbox", keys: ["enter"], run: () => focusId && ui.openDetail({ kind: "stuff", id: focusId }, true), enabled: Boolean(focusId) },
    { id: "inbox.rename", label: "Edit text", group: "Inbox", keys: ["f2"], run: () => focusId && setEditing(focusId), enabled: Boolean(focusId) },
    { id: "inbox.file", label: "File", group: "Inbox", keys: ["v"], run: () => fileStuff(ui, nav.targets()), enabled: Boolean(focusId) },
    {
      id: "inbox.done",
      label: "Done already (two-minute rule), or not done",
      group: "Inbox",
      keys: ["e"],
      enabled: Boolean(focusId),
      run: () => toggleDone(nav.targets()),
    },
    { id: "inbox.archive", label: `Archive done items to Done${doneIds.length ? ` (${doneIds.length})` : ""}`, group: "Inbox", keys: ["shift+e"], enabled: doneIds.length > 0, run: () => archiveDone(doneIds, "the Inbox") },
    { id: "inbox.showdone", label: showDone ? "Hide done items" : "Show done items", group: "View", run: () => setShowDone(!showDone) },
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
      run: () => trashNow(nav.targets(), true),
    },
    { id: "inbox.upload", label: "Upload files to the Inbox", group: "Inbox", keys: ["mod+o"], run: () => fileInput.current?.click() },
  ];
  useCommands("list:inbox", commands, { priority: 10, active: regionActive });

  const icon = (st: Stuff) =>
    st.kind === "email" ? <Mail size={14} strokeWidth={1.75} aria-label="Email" /> : st.kind === "file" ? <FileText size={14} strokeWidth={1.75} aria-label="File" /> : <StickyNote size={14} strokeWidth={1.75} aria-label="Note" />;

  const columns: Column<Stuff>[] = [
    { key: "kind", label: "", width: "30px", render: (st) => <span className="kind-icon">{icon(st)}</span> },
    {
      key: "done",
      label: "",
      width: "26px",
      render: (st) => <DoneBox done={st.status === "done" || striking.has(st.id)} title={stuffTitle(st) || "Untitled"} onToggle={() => !striking.has(st.id) && toggleDone([st.id])} />,
    },
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
      blank: (st) => !filesBy.get(st.id),
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
        sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
        listId="inbox"
        columns={columns}
        groups={[{ key: "inbox", label: "", rows }]}
        getKey={(st) => st.id}
        nav={nav}
        active={regionActive}
        showHeaders={false}
        rowClass={(st) => [striking.has(st.id) ? `is-striking ${showDone ? "" : "is-leaving"}` : "", st.status === "done" ? "is-done" : ""].join(" ")}
        onOpen={(k) => ui.openDetail({ kind: "stuff", id: k }, true)}
        // Touch: swipe right for done already (the two-minute rule), left to trash.
        swipe={{ right: { label: "Done", run: (id) => toggleDone([id]) }, left: { label: "Trash", run: (id) => trashNow([id]) } }}
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
