import { useLayoutEffect, useRef, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";

/**
 * A notes box with a little Markdown, drawn as you type and stored as plain text (owner's request: no formatting
 * panel). *word* or **word** is bold, and a paragraph that starts "- " or "1. " is a list item: the dash becomes a
 * bullet and Enter carries the list on (Enter on an empty item ends it).
 *
 * The textarea stays the real control (caret, selection, undo, spelling, IME); its text is invisible and a copy
 * drawn on top of it, with the same box and wrapping, shows the formatting. Bold is drawn with a stroke rather than a
 * heavier weight so every character keeps its width and the caret stays exactly on the letters.
 */

const LIST = /^(\s*)(- |\d{1,3}[.)] )/;
const BOLD = /(\*\*?)(?=[^\s*])([^*\n]*?[^\s*])\1/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(BOLD)) {
    const i = m.index ?? 0;
    if (i > at) out.push(text.slice(at, i));
    out.push(
      <b key={`${key}.${i}`}>
        <span className="md-mark">{m[1]}</span>
        {m[2]}
        <span className="md-mark">{m[1]}</span>
      </b>,
    );
    at = i + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

function render(value: string): ReactNode[] {
  return value.split("\n").flatMap((line, n) => {
    const key = String(n);
    const li = LIST.exec(line);
    const body = li ? (
      <span key={key} className="md-li">
        {li[1]}
        {li[2] === "- " ? <><span className="md-bullet">-</span> </> : <span className="md-num">{li[2]}</span>}
        {inline(line.slice(li[0].length), key)}
      </span>
    ) : (
      <span key={key}>{inline(line, key)}</span>
    );
    return n ? ["\n", body] : [body];
  });
}

/** Enter inside a list item: the next item, numbered on; on an item with nothing in it, the list ends. */
function continueList(el: HTMLTextAreaElement): boolean {
  const { value, selectionStart: s, selectionEnd: e } = el;
  if (s !== e) return false;
  const start = value.lastIndexOf("\n", s - 1) + 1;
  const li = LIST.exec(value.slice(start, s));
  if (!li) return false;
  const lineEnd = value.indexOf("\n", s) < 0 ? value.length : value.indexOf("\n", s);
  // The browser's own insert keeps the edit on the undo stack (a React state write would not).
  if (value.slice(start + li[0].length, lineEnd).trim() === "") {
    el.setSelectionRange(start, lineEnd);
    // WebKit ignores inserting nothing, so an unindented item is deleted instead.
    if (li[1]) document.execCommand("insertText", false, li[1]);
    else document.execCommand("delete");
    return true;
  }
  const num = /^\d+/.exec(li[2]);
  const marker = num ? `${Number(num[0]) + 1}${li[2].slice(num[0].length)}` : li[2];
  document.execCommand("insertText", false, `\n${li[1]}${marker}`);
  return true;
}

export function NotesArea({
  value,
  className,
  ref,
  onKeyDown,
  onScroll,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; ref?: Ref<HTMLTextAreaElement> }) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    area.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  // The copy follows the box: its scroll, and the room a scrollbar takes when a long note scrolls.
  useLayoutEffect(() => {
    const el = area.current;
    const m = mirror.current;
    if (!el || !m) return;
    const sync = () => {
      const cs = getComputedStyle(el);
      const bar = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      m.style.paddingRight = `${parseFloat(cs.paddingRight) + Math.max(0, bar)}px`;
      m.scrollTop = el.scrollTop;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  });

  return (
    <span className="md-wrap">
      <textarea
        {...rest}
        ref={setRef}
        value={value}
        className={`${className ?? ""} md-input`}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop;
          onScroll?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || e.key !== "Enter" || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return;
          if (continueList(e.currentTarget)) e.preventDefault();
        }}
      />
      <div ref={mirror} className={`${className ?? ""} md-mirror`} aria-hidden="true">
        {render(value)}
        {/* A last empty line still takes its height, as it does in the box. */}
        {"​"}
      </div>
    </span>
  );
}
