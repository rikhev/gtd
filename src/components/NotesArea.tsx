import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type FocusEvent, type HTMLAttributes, type KeyboardEvent, type Ref } from "react";
import { notify, upload, useStore } from "../store.ts";
import { IS_MAC } from "../keys.ts";
import type { FileRow, ID } from "../../shared/types.ts";

/**
 * A notes box with Markdown drawn as you type and stored as plain text (owner's request: no formatting panel). The
 * marks stay in the text, quiet, and what they mean is drawn:
 * - **word** is bold and *word* italic, `code` is set as code, a line opened and closed with ``` is a code block;
 * - "# ", "## " … start a heading, "> " a quote;
 * - "- ", "* ", "+ " or "1. " start a list item that keeps the very mark it was typed with, its text hanging after it;
 *   "[ ] " or "[x] " after it (or at the start of a line) is a box, ticked with a click (it is never an action);
 * - [[Title]] links to the note of that title and ![[name]] shows a file of the note's (a picture as itself), a web
 *   address or [words](https://…) is a link: ⌘-click or ⌘↵ follows one.
 * Enter carries a list (and its box) on, numbered on; Enter on an empty item ends it.
 *
 * The marks show only on the line being written (owner's request: the page read as code). Elsewhere they step aside:
 * a heading stands on its own, a dash is a bullet, a link is its words, a picture is itself. They are never removed
 * from the text, only from sight, so the caret and the stored text stay exactly as typed.
 *
 * A textarea can't hang an indent or draw a heading, so this is an editable block redrawn from its text after each
 * edit, line by line (a line that didn't change is left alone), the caret put back by its character offset. It keeps
 * its own undo history, since a redraw would wipe the browser's.
 */

const LIST = /^(\s*)([-*+]|\d{1,3}[.)])( +)/;
const BOX = /^\[([ xX])\] /;
const HEADING = /^(#{1,6})( +)/;
const QUOTE = /^(\s*>\s?)/;
const FENCE = /^\s*```/;
// One pass over a line's text: `code`, ![[embed]], [[link]], [words](url), a bare address, or *bold* / **bold**.
const INLINE = /(`[^`\n]+`)|(!\[\[([^\]\n]+)\]\])|(\[\[([^\]\n]+)\]\])|(\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"\])])|(\*\*?)(?=[^\s*])([^*\n]*?[^\s*])\10/g;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mark = (t: string) => `<span class="md-mark">${esc(t)}</span>`;
const linkTitle = IS_MAC ? "⌘-click to open" : "Ctrl+click to open";

/** What an embed shows: a picture inline, any other file as a link to the viewer. */
export type Embed = { id: ID; url: string; image: boolean };
type Resolve = (name: string) => Embed | null;

function inline(text: string, resolve: Resolve, pictures: Embed[]): string {
  let out = "";
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0;
    out += esc(text.slice(at, i));
    at = i + m[0].length;
    if (m[1]) out += `<code class="md-code-in">${mark("`")}${esc(m[1].slice(1, -1))}${mark("`")}</code>`;
    else if (m[2]) {
      const name = m[3].split("|")[0].trim();
      const e = resolve(name);
      if (e?.image) pictures.push(e);
      out += `${mark("![[")}<span class="md-link md-file${e?.image ? " is-pic" : ""}" data-file="${e ? esc(e.id) : ""}" title="${e ? linkTitle : "No file of this name on the note"}">${esc(m[3])}</span>${mark("]]")}`;
    } else if (m[4]) {
      // [[Title|words]] shows the words as the link, the title quietly before them.
      const bar = m[5].indexOf("|");
      const target = (bar < 0 ? m[5] : m[5].slice(0, bar)).trim();
      out += `${mark(bar < 0 ? "[[" : `[[${m[5].slice(0, bar + 1)}`)}<span class="md-link" data-note="${esc(target)}" title="${linkTitle}">${esc(bar < 0 ? m[5] : m[5].slice(bar + 1))}</span>${mark("]]")}`;
    }
    else if (m[6]) out += `${mark("[")}<span class="md-link" data-href="${esc(m[8])}" title="${linkTitle}">${esc(m[7])}</span>${mark(`](${m[8]})`)}`;
    else if (m[9]) out += `<span class="md-link md-url" data-href="${esc(m[9])}" title="${linkTitle}">${esc(m[9])}</span>`;
    else {
      // **bold**, *italic*: weight and style only, never size.
      const tag = m[10] === "**" ? "b" : "i";
      out += `<${tag}>${mark(m[10])}${esc(m[11])}${mark(m[10])}</${tag}>`;
    }
  }
  return out + esc(text.slice(at));
}

/** A list item's mark in a hanging gutter as wide as itself, a level further in for every two spaces before it. */
function gutterOf(lead: string, sym: string) {
  return Math.floor(lead.replace(/\t/g, "  ").length / 2) * 1.25 + (/\d/.test(sym) ? Math.max(1.2, 0.58 * (sym.length - 1) + 0.62) : 1.2);
}

const tick = (c: string) => `<span class="md-box" data-done="${c.trim() ? "1" : "0"}" role="checkbox" aria-checked="${c.trim() ? "true" : "false"}">[${esc(c)}] </span>`;

/** One block per line, as HTML. A block's text is always exactly its line, so offsets read straight off the text. */
function render(value: string, resolve: Resolve): string[] {
  let fence = false;
  return value.split("\n").map((line) => {
    if (FENCE.test(line)) {
      const html = `<div class="md-code md-fence${fence ? " md-fence-end" : ""}">${mark(line) || "<br>"}</div>`;
      fence = !fence;
      return html;
    }
    if (fence) return `<div class="md-code">${esc(line) || "<br>"}</div>`;
    const pictures: Embed[] = [];
    let html: string;
    let cls = "md-p";
    let style = "";
    const h = HEADING.exec(line);
    const li = LIST.exec(line);
    const q = QUOTE.exec(line);
    if (h) {
      cls = `md-h md-h${h[1].length}`;
      html = mark(h[0]) + inline(line.slice(h[0].length), resolve, pictures);
    } else if (li) {
      const lead = li[0];
      let rest = line.slice(lead.length);
      const b = BOX.exec(rest);
      cls = `md-li${b?.[1].trim() ? " is-done" : ""}`;
      style = ` style="--gutter:${gutterOf(li[1], li[2]).toFixed(2)}em"`;
      let boxHtml = "";
      if (b) {
        boxHtml = tick(b[1]);
        rest = rest.slice(b[0].length);
      }
      html = `<span class="md-marker${b ? " has-box" : /\d/.test(li[2]) ? "" : " is-bullet"}">${esc(lead)}</span>${boxHtml}${inline(rest, resolve, pictures)}`;
    } else if (BOX.test(line)) {
      const b = BOX.exec(line)!;
      cls = `md-task${b[1].trim() ? " is-done" : ""}`;
      html = tick(b[1]) + inline(line.slice(b[0].length), resolve, pictures);
    } else if (/^\s*\|.*\|\s*$/.test(line)) {
      // A table row keeps its pipes, set in monospace so typed-in columns line up.
      cls = "md-table";
      // The pipes quiet, so the cells read first.
      html = inline(line, resolve, pictures).replace(/\|/g, '<span class="md-pipe">|</span>');
    } else if (q) {
      cls = "md-quote";
      html = mark(q[0]) + inline(line.slice(q[0].length), resolve, pictures);
    } else html = inline(line, resolve, pictures);
    const pics = pictures.map((p) => `<span class="md-pic" contenteditable="false"><img src="${esc(p.url)}" alt="" data-file="${esc(p.id)}" loading="lazy" draggable="false"></span>`).join("");
    return `<div class="${cls}"${style}>${html || (pics ? "" : "<br>")}${pics}</div>`;
  });
}

/** Lines are redrawn only where they changed: a long note stays quick, and screen readers keep their place. */
type Block = HTMLElement & { _md?: string };
function draw(root: HTMLElement, blocks: string[], lines: string[]) {
  // A stray text node or line break the browser left at the top level means a full redraw.
  if ([...root.childNodes].some((n) => n.nodeType !== Node.ELEMENT_NODE || (n as Element).tagName !== "DIV")) root.textContent = "";
  const kids = root.children;
  const tpl = document.createElement("template");
  for (let i = 0; i < blocks.length; i++) {
    const cur = kids[i] as Block | undefined;
    if (cur && cur._md === blocks[i] && cur.textContent === lines[i]) continue;
    tpl.innerHTML = blocks[i];
    const next = tpl.content.firstElementChild as Block;
    next._md = blocks[i];
    if (cur) root.replaceChild(next, cur);
    else root.appendChild(next);
  }
  while (kids.length > blocks.length) root.lastElementChild!.remove();
}

/** The plain text back out of the blocks (the browser may leave stray text or a line break at the top level). */
function textOf(root: HTMLElement): string {
  const lines: string[] = [];
  let loose: string | null = null;
  for (const n of root.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) loose = (loose ?? "") + (n.textContent ?? "");
    else if (n instanceof HTMLElement && n.tagName !== "BR") {
      if (loose !== null) {
        lines.push(loose);
        loose = null;
      }
      lines.push(n.textContent ?? "");
    }
  }
  if (loose !== null) lines.push(loose);
  return lines.join("\n");
}

/** Where a point in the blocks falls in the text. */
function offsetOf(root: HTMLElement, node: Node, off: number): number {
  if (node === root) {
    let at = 0;
    for (let i = 0; i < off && i < root.childNodes.length; i++) {
      const n = root.childNodes[i];
      if (n instanceof HTMLElement && n.tagName === "BR") continue;
      at += (n.textContent ?? "").length + (n.nodeType === Node.TEXT_NODE ? 0 : 1);
    }
    return at;
  }
  let line: Node | null = node;
  while (line && line.parentNode !== root) line = line.parentNode;
  if (!line) return 0;
  let at = 0;
  for (const n of root.childNodes) {
    if (n === line) break;
    if (n instanceof HTMLElement && n.tagName === "BR") continue;
    at += (n.textContent ?? "").length + (n.nodeType === Node.TEXT_NODE ? 0 : 1);
  }
  const r = document.createRange();
  r.setStart(line, 0);
  r.setEnd(node, off);
  return at + r.toString().length;
}

function caretOf(root: HTMLElement): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  return [offsetOf(root, r.startContainer, r.startOffset), offsetOf(root, r.endContainer, r.endOffset)];
}

/** The DOM point for a text offset. */
function pointAt(root: HTMLElement, at: number): [Node, number] {
  let left = at;
  for (const line of root.children) {
    const len = (line.textContent ?? "").length;
    if (left <= len) {
      const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let t: Node | null;
      let last: Node | null = null;
      while ((t = walk.nextNode())) {
        const l = (t.textContent ?? "").length;
        // At a boundary, stay at the end of the earlier node unless it is the list mark (typing goes after it).
        if (left < l || (left === l && !t.parentElement?.classList.contains("md-marker"))) return [t, left];
        left -= l;
        last = t;
      }
      return last ? [last, (last.textContent ?? "").length] : [line, 0];
    }
    left -= len + 1;
  }
  const last = root.lastElementChild ?? root;
  return [last, last.childNodes.length];
}

function setCaret(root: HTMLElement, [s, e]: [number, number]) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.setStart(...pointAt(root, s));
  r.setEnd(...pointAt(root, e));
  sel.removeAllRanges();
  sel.addRange(r);
}

/** What a link points at: a note by its title, a web address, or a file of the note's. */
export type Follow = { kind: "note"; title: string } | { kind: "url"; href: string } | { kind: "file"; id: ID };
function followOf(el: Element | null): Follow | null {
  const a = el?.closest<HTMLElement>(".md-link, .md-pic img");
  if (!a) return null;
  if (a.dataset.note) return { kind: "note", title: a.dataset.note };
  if (a.dataset.href) return { kind: "url", href: a.dataset.href };
  if (a.dataset.file) return { kind: "file", id: a.dataset.file };
  return null;
}

/** The link the caret is in, if any (⌘↵ follows it). */
export function linkAtCaret(): Follow | null {
  const sel = window.getSelection();
  const n = sel?.anchorNode;
  const el = n instanceof Element ? n : (n?.parentElement ?? null);
  // On a link's brackets ("[[" or "]]", where typing one leaves the caret) counts as on the link.
  const mark = el?.closest(".md-mark");
  const beside = mark && ([mark.previousElementSibling, mark.nextElementSibling].find((x) => x?.classList.contains("md-link")) ?? null);
  return followOf(beside ?? el);
}

export interface NotesApi {
  focus: (at?: number) => void;
  /** Where the caret is in the text, if it is in here. */
  caret: () => number | null;
  /** Replace a stretch of the text, as its own undo step, and put the caret after it. */
  replace: (from: number, to: number, text: string) => void;
}

type Snap = { text: string; caret: [number, number] };

/** A file pasted or dropped: a picture is named for when it came (a screenshot arrives as "image.png"). */
function named(f: File): File {
  if (!/^image\.(png|jpe?g|gif|webp)$/i.test(f.name)) return f;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ext = f.name.split(".").pop()!.toLowerCase();
  return new File([f], `Pasted ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.${ext}`, { type: f.type });
}

export function NotesArea({
  value,
  onValue,
  onBlur,
  placeholder,
  rows = 3,
  className,
  ref,
  owner,
  onFollow,
  onLinkStart,
  api,
  view = "live",
  onClickAt,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "onBlur" | "placeholder"> & {
  value: string;
  onValue: (v: string) => void;
  onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
  placeholder?: string;
  rows?: number;
  ref?: Ref<HTMLDivElement>;
  /** The item whose files a pasted or dropped file joins, and whose files ![[name]] shows. */
  owner?: { kind: FileRow["owner_kind"]; id: ID };
  /** ⌘-click or ⌘↵ on a link. Without it, web addresses open in a tab and file embeds do nothing. */
  onFollow?: (f: Follow) => void;
  /** "[[" was just typed, the caret after it: offer the notes to link. */
  onLinkStart?: (at: number) => void;
  api?: Ref<NotesApi>;
  /**
   * How the text shows. "live": the marks only on the line being written (the details pane). "source": the plain
   * Markdown, every mark in sight, in monospace (a note's editing view). "read": nothing of the syntax, not editable;
   * a click follows a link or ticks a box (a note's reading view).
   */
  view?: "live" | "source" | "read";
  /** A press in the reading view (not on a link or box): where in the text it landed, so writing can start there. */
  onClickAt?: (at: number) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const shown = useRef<string | null>(null);
  const composing = useRef(false);
  const history = useRef<{ past: Snap[]; future: Snap[]; last: number }>({ past: [], future: [], last: 0 });
  const setRef = (el: HTMLDivElement | null) => {
    box.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  // The owner's files, by name, for ![[name]]: the newest of a name wins. A locked file's name is encrypted, so it
  // is never found (the note says which file it means; the picture shows once the lock is off).
  const files = useStore((s) => s.files);
  const mine = owner ? files.filter((f) => f.owner_kind === owner.kind && f.owner_id === owner.id && !f.sealed) : [];
  const sig = mine.map((f) => `${f.id}:${f.name}`).join("|");
  const resolve = useRef<Resolve>(() => null);
  resolve.current = (name) => {
    const f = [...mine].reverse().find((x) => x.name.toLowerCase() === name.toLowerCase());
    return f ? { id: f.id, url: `/api/files/${f.id}`, image: /^image\/(png|jpeg|gif|webp)$/.test(f.mime) } : null;
  };

  const paint = (el: HTMLElement, text: string) => draw(el, render(text, resolve.current), text.split("\n"));

  /** The lines the caret (or the selection's ends) is on show their marks; every other line hides them. */
  const markCaret = () => {
    const el = box.current;
    if (!el) return;
    const on = new Set<Element>();
    const sel = window.getSelection();
    if (sel?.rangeCount && document.activeElement === el)
      for (const n of [sel.anchorNode, sel.focusNode]) {
        let x: Node | null = n;
        while (x && x.parentNode !== el) x = x.parentNode;
        if (x instanceof Element) on.add(x);
      }
    for (const c of el.querySelectorAll(":scope > [data-caret]")) if (!on.has(c)) c.removeAttribute("data-caret");
    on.forEach((l) => l.setAttribute("data-caret", ""));
  };
  useEffect(() => {
    const onSel = () => markCaret();
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the text when it changes from outside (or first shows); edits made here are drawn as they happen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || shown.current === value) return;
    const caret = document.activeElement === el ? caretOf(el) : null;
    paint(el, value);
    shown.current = value;
    if (caret) setCaret(el, caret);
    markCaret();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // A file attached (or renamed) changes what an embed shows.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || shown.current === null) return;
    const caret = document.activeElement === el ? caretOf(el) : null;
    paint(el, shown.current);
    if (caret) setCaret(el, caret);
    markCaret();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // A new item's notes start a new history.
  const label = rest["aria-label"];
  useEffect(() => {
    history.current = { past: [], future: [], last: 0 };
  }, [label]);

  const commit = (text: string, caret: [number, number], record: Snap | null) => {
    const el = box.current!;
    if (record) {
      const h = history.current;
      // Typing runs together into one undo step; a pause, a line break or a paste starts a new one.
      const now = Date.now();
      if (now - h.last > 800 || !h.past.length) h.past.push(record);
      h.last = now;
      h.future = [];
    }
    paint(el, text);
    shown.current = text;
    setCaret(el, caret);
    markCaret();
    onValue(text);
  };

  /** Replace the selection with text, as its own undo step. */
  const insert = (t: string) => {
    const el = box.current!;
    const text = textOf(el);
    const [s, e] = caretOf(el) ?? [text.length, text.length];
    history.current.last = 0;
    commit(text.slice(0, s) + t + text.slice(e), [s + t.length, s + t.length], { text, caret: [s, e] });
    history.current.last = 0;
  };

  useImperativeHandle(api, () => ({
    focus: (at) => {
      const el = box.current;
      if (!el) return;
      el.focus({ preventScroll: at === undefined });
      if (at !== undefined) setCaret(el, [at, at]);
    },
    caret: () => (box.current ? (caretOf(box.current)?.[0] ?? null) : null),
    replace: (from, to, t) => {
      const el = box.current;
      if (!el) return;
      const text = textOf(el);
      el.focus({ preventScroll: true });
      history.current.last = 0;
      commit(text.slice(0, from) + t + text.slice(to), [from + t.length, from + t.length], { text, caret: [from, to] });
      history.current.last = 0;
    },
  }));

  /** Files pasted or dropped: attached to the item, and named in the text where the caret is. */
  const takeFiles = (list: File[]) => {
    if (!owner) {
      notify("Files can't go in here", { tone: "error" });
      return;
    }
    const files = list.map(named);
    void upload(files, owner);
    // Each on a line of its own, so a picture shows under the words before it.
    const el = box.current!;
    const text = textOf(el);
    const [s, e] = caretOf(el) ?? [text.length, text.length];
    const before = s > 0 && text[s - 1] !== "\n" ? "\n" : "";
    const after = e < text.length && text[e] !== "\n" ? "\n" : "";
    insert(before + files.map((f) => `![[${f.name}]]`).join("\n") + after);
  };

  const onInput = () => {
    if (composing.current) return;
    const el = box.current!;
    const caret = caretOf(el) ?? [0, 0];
    const text = textOf(el);
    const prev = shown.current ?? "";
    const was = Math.min(caret[0], prev.length);
    commit(text, caret, { text: prev, caret: [was, was] });
    // "[[" just typed: the notes to link to are offered.
    if (onLinkStart && caret[0] === caret[1] && text.length === prev.length + 1 && text.slice(caret[0] - 2, caret[0]) === "[[" && text[caret[0] - 3] !== "!") onLinkStart(caret[0]);
  };

  const follow = (f: Follow | null) => {
    if (!f) return false;
    if (onFollow) onFollow(f);
    else if (f.kind === "url") window.open(f.href, "_blank", "noopener");
    else return false;
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    rest.onKeyDown?.(e);
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    const el = box.current!;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      const h = history.current;
      const [from, to] = e.shiftKey ? [h.future, h.past] : [h.past, h.future];
      const snap = from.pop();
      if (!snap) return;
      to.push({ text: textOf(el), caret: caretOf(el) ?? [0, 0] });
      h.last = 0;
      commit(snap.text, snap.caret, null);
      return;
    }
    // ⌘↵ in a link follows it.
    if (mod && e.key === "Enter") {
      if (follow(linkAtCaret())) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.key !== "Enter" || e.altKey || mod) return;
    e.preventDefault();
    const text = textOf(el);
    const [s, en] = caretOf(el) ?? [text.length, text.length];
    const start = text.lastIndexOf("\n", s - 1) + 1;
    const li = e.shiftKey || s !== en ? null : LIST.exec(text.slice(start, s));
    if (!li) return insert("\n");
    const lineEnd = text.indexOf("\n", s) < 0 ? text.length : text.indexOf("\n", s);
    const b = BOX.exec(text.slice(start + li[0].length));
    const lead = li[0] + (b ? b[0] : "");
    // Enter on an empty item ends the list: the mark goes, the line stays.
    if (text.slice(start + lead.length, lineEnd).trim() === "") {
      history.current.last = 0;
      commit(text.slice(0, start) + li[1] + text.slice(lineEnd), [start + li[1].length, start + li[1].length], { text, caret: [s, en] });
      return;
    }
    const num = /^\d+/.exec(li[2]);
    insert(`\n${li[1]}${num ? `${Number(num[0]) + 1}${li[2].slice(num[0].length)}` : li[2]}${li[3]}${b ? "[ ] " : ""}`);
  };

  return (
    <div
      {...rest}
      ref={setRef}
      className={`${className ?? ""} md-edit is-${view}`}
      contentEditable={view === "read" ? "false" : "plaintext-only"}
      // At rest a field still takes focus (Enter under the pane's cursor, Tab, a click), to be written in.
      tabIndex={view === "read" ? 0 : undefined}
      aria-readonly={view === "read" || undefined}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      data-empty={value === "" || undefined}
      spellCheck
      style={{ ["--rows" as string]: rows }}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        onBlur?.(e);
        requestAnimationFrame(markCaret);
      }}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false;
        onInput();
      }}
      onMouseDown={(e) => {
        const el = box.current!;
        const target = e.target as HTMLElement;
        // A box is ticked with a click, and the caret stays where it was.
        const b = target.closest<HTMLElement>(".md-box");
        if (b && e.button === 0) {
          e.preventDefault();
          const text = textOf(el);
          const at = offsetOf(el, b.firstChild ?? b, 0) + 1;
          const caret = caretOf(el) ?? [at, at];
          history.current.last = 0;
          commit(text.slice(0, at) + (text[at] === " " ? "x" : " ") + text.slice(at + 1), caret, { text, caret });
          history.current.last = 0;
          return;
        }
        // ⌘-click follows a link; a click on a picture opens it. In the reading view a plain click follows.
        if (e.button === 0 && (view === "read" || e.metaKey || e.ctrlKey || target.tagName === "IMG") && follow(followOf(target))) {
          e.preventDefault();
          return;
        }
        // Anywhere else in the reading view: where it landed, for the writing that follows.
        if (view === "read" && onClickAt && e.button === 0) {
          const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
          const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
          const range = pos ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
          const node = pos?.offsetNode ?? range?.startContainer;
          if (node && el.contains(node)) onClickAt(offsetOf(el, node, pos?.offset ?? range!.startOffset));
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = Array.from(e.clipboardData.files);
        if (pasted.length) return takeFiles(pasted);
        // Only text comes in, as typed: no styles from wherever it was copied.
        insert(e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"));
      }}
      onDragOver={(e) => {
        if (owner && [...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const dropped = Array.from(e.dataTransfer.files);
        if (!dropped.length) return;
        e.stopPropagation();
        // The file goes where it was let go.
        const el = box.current!;
        const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
        const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
        const range = pos ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
        const node = pos?.offsetNode ?? range?.startContainer;
        if (node && el.contains(node)) {
          el.focus({ preventScroll: true });
          const at = offsetOf(el, node, pos?.offset ?? range!.startOffset);
          setCaret(el, [at, at]);
        }
        takeFiles(dropped);
      }}
    />
  );
}
