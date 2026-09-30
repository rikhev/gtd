import { useEffect, useLayoutEffect, useRef, type FocusEvent, type HTMLAttributes, type KeyboardEvent, type Ref } from "react";

/**
 * A notes box with a little Markdown, drawn as you type and stored as plain text (owner's request: no formatting
 * panel). *word* or **word** is bold, and a paragraph that starts "- ", "* ", "+ " or "1. " is a list item: it keeps
 * the very mark it was typed with, and its text hangs indented after it, so a long item wraps under its own words.
 * Enter carries the list on (numbered on); Enter on an empty item ends it.
 *
 * A textarea can't hang an indent, so this is an editable block that is redrawn from its text after each edit, the
 * caret put back by its character offset. It keeps its own undo history, since a redraw would wipe the browser's.
 */

const LIST = /^(\s*)([-*+]|\d{1,3}[.)])( +)/;
const BOLD = /(\*\*?)(?=[^\s*])([^*\n]*?[^\s*])\1/g;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text: string): string {
  let out = "";
  let at = 0;
  for (const m of text.matchAll(BOLD)) {
    const i = m.index ?? 0;
    out += esc(text.slice(at, i));
    out += `<b><span class="md-mark">${esc(m[1])}</span>${esc(m[2])}<span class="md-mark">${esc(m[1])}</span></b>`;
    at = i + m[0].length;
  }
  return out + esc(text.slice(at));
}

/** One block per line: a list item is its mark (indent included) in a hanging gutter, then its text. */
function render(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      const li = LIST.exec(line);
      if (!li) return `<div class="md-p">${inline(line) || "<br>"}</div>`;
      const mark = li[1] + li[2] + li[3];
      // The gutter fits the mark: one width for a dash and a one-digit number alike, wider for longer numbers, plus a
      // level for every two spaces before it.
      const gutter = Math.floor(li[1].replace(/\t/g, "  ").length / 2) * 1.25 + (/\d/.test(li[2]) ? Math.max(1.2, 0.58 * (li[2].length - 1) + 0.62) : 1.2);
      const rest = line.slice(mark.length);
      return `<div class="md-li" style="--gutter:${gutter.toFixed(2)}em"><span class="md-marker">${esc(mark)}</span>${inline(rest) || "<br>"}</div>`;
    })
    .join("");
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
        if (left < l || (left === l && !(t.parentElement?.classList.contains("md-marker")))) return [t, left];
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

type Snap = { text: string; caret: [number, number] };

export function NotesArea({
  value,
  onValue,
  onBlur,
  placeholder,
  rows = 3,
  className,
  ref,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "onBlur" | "placeholder"> & {
  value: string;
  onValue: (v: string) => void;
  onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
  placeholder?: string;
  rows?: number;
  ref?: Ref<HTMLDivElement>;
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

  // Draw the text when it changes from outside (or first shows); edits made here are drawn as they happen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || shown.current === value) return;
    const caret = document.activeElement === el ? caretOf(el) : null;
    el.innerHTML = render(value);
    shown.current = value;
    if (caret) setCaret(el, caret);
  }, [value]);

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
    el.innerHTML = render(text);
    shown.current = text;
    setCaret(el, caret);
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

  const onInput = () => {
    if (composing.current) return;
    const el = box.current!;
    const caret = caretOf(el) ?? [0, 0];
    const text = textOf(el);
    const prev = shown.current ?? "";
    const was = Math.min(caret[0], prev.length);
    commit(text, caret, { text: prev, caret: [was, was] });
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
    if (e.key !== "Enter" || e.altKey || mod) return;
    e.preventDefault();
    const text = textOf(el);
    const [s, en] = caretOf(el) ?? [text.length, text.length];
    const start = text.lastIndexOf("\n", s - 1) + 1;
    const li = e.shiftKey || s !== en ? null : LIST.exec(text.slice(start, s));
    if (!li) return insert("\n");
    const lineEnd = text.indexOf("\n", s) < 0 ? text.length : text.indexOf("\n", s);
    // Enter on an empty item ends the list: the mark goes, the line stays.
    if (text.slice(start + li[0].length, lineEnd).trim() === "") {
      history.current.last = 0;
      commit(text.slice(0, start) + li[1] + text.slice(lineEnd), [start + li[1].length, start + li[1].length], { text, caret: [s, en] });
      return;
    }
    const num = /^\d+/.exec(li[2]);
    insert(`\n${li[1]}${num ? `${Number(num[0]) + 1}${li[2].slice(num[0].length)}` : li[2]}${li[3]}`);
  };

  return (
    <div
      {...rest}
      ref={setRef}
      className={`${className ?? ""} md-edit`}
      contentEditable="plaintext-only"
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
      onBlur={onBlur}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false;
        onInput();
      }}
      onPaste={(e) => {
        // Only text comes in, as typed: no styles from wherever it was copied.
        e.preventDefault();
        insert(e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"));
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
}
