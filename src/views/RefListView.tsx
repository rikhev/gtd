import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, type Column } from "../components/Grid.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { setProject } from "../actionCommands.tsx";
import { askUnlock } from "../lock.ts";
import { linesOf, noteAsList, openRefList, setForm, textOf, useRefText, type Line } from "../refList.ts";
import { plural } from "../store.ts";
import type { Ref } from "../../shared/types.ts";

/** A row on screen: a saved line, or the new one being typed (not saved until it has words). */
type Row = Line & { draft?: boolean };

const short = (t: string) => `“${t.length > 42 ? `${t.slice(0, 40).trimEnd()}…` : t || "Untitled"}”`;

/**
 * A reference list across the whole width (owner's request): kept like a checklist (N adds below, L makes a section
 * heading, F2 rewrites, ⌥↑↓ or a drag reorders, Delete removes, a pasted list becomes items) with nothing to tick: it
 * is reference, not action. Every change is one save of the list's lines, so ⌘Z takes back each.
 */
export function RefListView({ r, regionActive }: { r: Ref; regionActive: boolean }) {
  const ui = useUI();
  const { text, save } = useRefText(r);
  const lines = useMemo(() => (text === null ? [] : linesOf(text)), [text]);
  const [editing, setEditing] = useState<{ key: string; draft?: { at: number; section: boolean } } | null>(null);

  // The new row sits where it will land, until it is named (or left empty, and gone).
  const rows: Row[] = useMemo(() => {
    if (!editing?.draft) return lines;
    const out: Row[] = [...lines];
    out.splice(editing.draft.at, 0, { key: editing.key, text: "", section: editing.draft.section, draft: true });
    return out;
  }, [lines, editing]);

  const nav = useListNav("reflist", useMemo(() => [{ key: "lines", rowKeys: rows.map((l) => l.key), showHeader: false }], [rows]));
  const focus = rows.find((l) => l.key === nav.focus);
  const targets = () => nav.targets().filter((k) => lines.some((l) => l.key === k));
  const at = (key: string | undefined) => lines.findIndex((l) => l.key === key);
  // The list has no details of its own beyond the reference: a pinned pane rests while you work here.
  useEffect(() => {
    ui.followDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = (next: Pick<Line, "text" | "section">[], label: string, focusAt?: number) => {
    save(textOf(next), label);
    if (focusAt !== undefined) window.setTimeout(() => nav.setFocus(`l${Math.max(0, Math.min(focusAt, next.length - 1))}`), 0);
  };
  const add = (section = false) => {
    const i = at(focus?.key);
    const key = `new${Date.now()}`;
    setEditing({ key, draft: { at: i >= 0 ? i + 1 : lines.length, section } });
    nav.setFocus(key);
  };
  const finishDraft = (v: string, how: "enter" | "cancel" | "blur") => {
    const d = editing?.draft;
    setEditing(null);
    const words = v.trim();
    if (!d || !words || how === "cancel") return nav.setFocus(lines[Math.max(0, (d?.at ?? 1) - 1)]?.key ?? null);
    const next = [...lines];
    next.splice(d.at, 0, { key: "", text: words, section: d.section });
    write(next, d.section ? `Section ${short(words)} added` : `Added ${short(words)}`, d.at);
    // Enter after a new item starts the next one, so a list is typed in one go; Enter on an empty one stops.
    if (how === "enter") window.setTimeout(() => {
      const key = `new${Date.now()}`;
      setEditing({ key, draft: { at: d.at + 1, section: false } });
      nav.setFocus(key);
    }, 0);
  };
  /** A list pasted into a row becomes items, one a line, at that row. */
  const pasteLines = (row: Row, pasted: string, current: string) => {
    const incoming = linesOf(noteAsList(pasted));
    if (incoming.length < 2) return false;
    const i = row.draft ? editing!.draft!.at : at(row.key);
    const next = [...lines];
    if (!row.draft) next.splice(i, 1);
    const first = current.trim() ? [{ key: "", text: current.trim(), section: row.section }] : [];
    next.splice(i, 0, ...first, ...incoming);
    setEditing(null);
    write(next, `${plural(incoming.length + first.length, "item")} pasted`, i + first.length + incoming.length - 1);
    return true;
  };
  const rename = (key: string, v: string) => {
    const i = at(key);
    const words = v.trim();
    if (i < 0 || words === lines[i].text) return;
    const next = [...lines];
    if (!words) next.splice(i, 1);
    else next[i] = { ...next[i], text: words };
    write(next, words ? "Rewritten" : `${short(lines[i].text)} removed`);
  };
  const remove = (keys: string[]) => {
    const gone = lines.filter((l) => keys.includes(l.key));
    if (!gone.length) return;
    const first = at(gone[0].key);
    write(
      lines.filter((l) => !keys.includes(l.key)),
      gone.length === 1 ? `${short(gone[0].text)} removed` : `${plural(gone.length, "item")} removed`,
      first,
    );
  };
  const toggleSection = (keys: string[]) => {
    const picked = lines.filter((l) => keys.includes(l.key));
    if (!picked.length) return;
    const make = picked.some((l) => !l.section);
    write(
      lines.map((l) => (keys.includes(l.key) ? { ...l, section: make } : l)),
      make ? `${plural(picked.length, "row")} made section ${picked.length === 1 ? "heading" : "headings"}` : `${plural(picked.length, "heading")} made ${picked.length === 1 ? "an item" : "items"}`,
    );
  };
  /** ⌥↑↓: the ticked rows (or the cursor's) step one place, together; a block at the edge stays put. */
  const move = (dir: -1 | 1) => {
    const keys = new Set(targets());
    if (!keys.size) return;
    const next = [...lines];
    const order = dir < 0 ? next.map((_, i) => i) : next.map((_, i) => next.length - 1 - i);
    for (const i of order) {
      const j = i + dir;
      if (!keys.has(next[i].key) || j < 0 || j >= next.length || keys.has(next[j].key)) continue;
      [next[i], next[j]] = [next[j], next[i]];
    }
    const focusKey = focus?.key;
    write(next, "Reordered");
    const to = next.findIndex((l) => l.key === focusKey);
    // The moved rows keep their selection under their new keys.
    window.setTimeout(() => nav.setFocus(`l${to}`), 0);
  };
  const back = () => openRefList(null);

  const commands: Command[] = [
    ...nav.commands,
    { id: "rl.new", label: "New item below", group: "List", keys: ["n"], enabled: text !== null, run: () => add(false) },
    { id: "rl.section", label: "New section heading below", group: "List", enabled: text !== null, run: () => add(true) },
    { id: "rl.makesection", row: true, label: focus?.section ? "Make it an item" : "Make it a section heading", group: "List", keys: ["l"], enabled: Boolean(focus && !focus.draft), run: () => toggleSection(targets()) },
    { id: "rl.rename", row: true, label: "Rewrite", group: "List", keys: ["f2", "enter"], enabled: Boolean(focus && !focus.draft), run: () => focus && setEditing({ key: focus.key }) },
    { id: "rl.remove", row: true, label: "Remove", group: "List", keys: ["backspace", "delete"], enabled: Boolean(focus && !focus.draft), run: () => remove(targets()) },
    { id: "rl.up", row: true, label: "Move row up", group: "List", keys: ["alt+arrowup"], enabled: Boolean(focus && !focus.draft), run: () => move(-1) },
    { id: "rl.down", row: true, label: "Move row down", group: "List", keys: ["alt+arrowdown"], enabled: Boolean(focus && !focus.draft), run: () => move(1) },
    { id: "rl.project", label: "Set the project it supports", group: "Fields", keys: ["p"], run: () => setProject(ui, "refs", [r.id]) },
    { id: "rl.jump", label: "Jump to the project it supports", group: "List", keys: ["shift+j"], run: () => ui.jumpFromSupport("ref", r.id) },
    { id: "rl.details", label: "Open its details", group: "List", run: () => ui.openDetail({ kind: "ref", id: r.id }, true) },
    {
      id: "rl.note",
      label: "Show as a note",
      group: "List",
      enabled: text !== null,
      run: () => {
        back();
        void setForm([r.id], null);
      },
    },
    // After the selection is cleared (nav's Esc), Esc goes back up to every reference.
    { id: "rl.back", label: "Back to every reference", group: "Move", keys: ["escape"], run: back },
  ];
  useCommands("list:reflist", commands, { priority: 10, active: regionActive });

  // Empty, the list is opened to be filled: the first item is ready to be typed, once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !regionActive || text === null) return;
    started.current = true;
    if (!lines.length) add(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionActive, text]);

  const columns: Column<Row>[] = [
    { key: "mark", label: "", width: "30px", inline: true, render: (l) => (l.section ? null : <span className="ref-bullet" aria-hidden="true" />) },
    {
      key: "subject",
      label: "Item",
      width: "minmax(220px, 1fr)",
      render: (l) =>
        editing?.key === l.key ? (
          <InlineEdit
            value={l.text}
            label={l.section ? "Section heading" : "Item"}
            onPasteLines={(t, cur) => pasteLines(l, t, cur)}
            onDone={(v, how) => {
              if (l.draft) return finishDraft(v, how);
              setEditing(null);
              if (how !== "cancel") rename(l.key, v);
            }}
          />
        ) : l.section ? (
          <span className="cl-section">
            <span className="visually-hidden">Section: </span>
            {l.text}
          </span>
        ) : (
          <span className="subject">
            <span className="subject-text">{l.text}</span>
          </span>
        ),
    },
  ];

  if (text === null)
    return (
      <EmptyState
        title="Locked"
        lines={["This list is encrypted. The lock password opens every locked reference for 5 minutes."]}
        action={{ label: "Unlock", run: () => askUnlock(ui) }}
      />
    );

  return (
    <Grid
      listId="reflist"
      label={r.title || "List"}
      columns={columns}
      groups={[{ key: "lines", label: "", rows }]}
      getKey={(l) => l.key}
      nav={nav}
      active={regionActive}
      showHeaders={false}
      rowClass={(l) => (l.section ? "is-section" : "")}
      onOpen={(k) => !k.startsWith("new") && setEditing({ key: k })}
      reorder={{
        onMove: (keys, beforeKey) => {
          const moving = lines.filter((l) => keys.includes(l.key));
          const rest = lines.filter((l) => !keys.includes(l.key));
          const i = beforeKey ? rest.findIndex((l) => l.key === beforeKey) : rest.length;
          rest.splice(i < 0 ? rest.length : i, 0, ...moving);
          write(rest, "Moved", i);
        },
      }}
      empty={<EmptyState title="Nothing on this list yet" lines={["Add the first item. Enter after each one starts the next."]} action={{ label: "Add an item", run: () => add(false) }} />}
    />
  );
}
