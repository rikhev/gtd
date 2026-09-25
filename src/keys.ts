import { useEffect, useRef } from "react";

/**
 * Keyboard engine.
 * Key strings: modifiers "mod" (⌘), "ctrl" (⌃), "alt" (⌥), "shift" (⇧) + a key.
 * Letters/digits match physical keys (e.code), so ⌥ combos and Swedish layouts work;
 * punctuation matches the produced character (e.key), so "?" works on any layout.
 */

export interface Command {
  id: string;
  label: string;
  group: string;
  keys?: string[];
  /** Shown in the palette and overlay but never matched (e.g. native ⌘V paste). */
  displayKeys?: string[];
  run: () => void;
  /** Also fire while a text field has focus. */
  inInput?: boolean;
  enabled?: boolean;
  /** Hidden from palette/help (e.g. aliases). */
  hidden?: boolean;
}

interface Layer {
  id: string;
  priority: number;
  exclusive: boolean;
  commands: Command[];
}

const layers = new Map<string, Layer>();
const subscribers = new Set<() => void>();
let version = 0;
const bump = () => {
  version++;
  subscribers.forEach((s) => s());
};

export function subscribeLayers(fn: () => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
export const layersVersion = () => version;

/** Commands visible right now (topmost exclusive layer and everything above it). */
export function activeCommands(): Command[] {
  const sorted = [...layers.values()].sort((a, b) => b.priority - a.priority);
  const out: Command[] = [];
  for (const l of sorted) {
    out.push(...l.commands.filter((c) => c.enabled !== false));
    if (l.exclusive) break;
  }
  return out;
}

export function allCommandsForPalette(): Command[] {
  const seen = new Set<string>();
  return activeCommands().filter((c) => {
    if (c.hidden || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

export function useCommands(
  id: string,
  commands: Command[],
  opts: { priority?: number; exclusive?: boolean; active?: boolean } = {},
) {
  const { priority = 10, exclusive = false, active = true } = opts;
  const ref = useRef(commands);
  ref.current = commands;
  const sig = commands.map((c) => `${c.id}:${c.enabled !== false}:${(c.keys ?? []).join("|")}:${c.label}`).join(",");
  useEffect(() => {
    if (!active) return;
    layers.set(id, {
      id,
      priority,
      exclusive,
      get commands() {
        return ref.current;
      },
    });
    bump();
    return () => {
      layers.delete(id);
      bump();
    };
  }, [id, priority, exclusive, active]);
  useEffect(() => {
    if (active) bump();
  }, [sig, active]);
}

export function eventToKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("mod");
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (e.key === " ") key = "space";
  else key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  // Shift is implicit in produced punctuation such as "?".
  const punct = key.length === 1 && !/[a-z0-9]/.test(key);
  if (e.shiftKey && !punct) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** Mac aliases: the "Del" key on a MacBook reports Backspace. */
function aliases(k: string): string[] {
  const out = [k];
  if (k.endsWith("backspace")) out.push(k.replace(/backspace$/, "delete"));
  return out;
}

export function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "file"].includes(el.type);
  }
  return el instanceof HTMLSelectElement;
}

export function installKeyHandler() {
  const handler = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    const key = eventToKey(e);
    const candidates = aliases(key);
    const editing = isEditable(e.target);
    for (const cmd of activeCommands()) {
      if (!cmd.keys) continue;
      if (!cmd.keys.some((k) => candidates.includes(k))) continue;
      if (editing && !cmd.inInput) continue;
      e.preventDefault();
      e.stopPropagation();
      cmd.run();
      return;
    }
  };
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}

const SYMBOLS: Record<string, string> = {
  mod: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  enter: "↵",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  backspace: "Del",
  delete: "Del",
  space: "Space",
  tab: "Tab",
  insert: "Ins",
  pageup: "PgUp",
  pagedown: "PgDn",
  home: "Home",
  end: "End",
};

export function keyLabel(k: string): string {
  return k
    .split("+")
    .map((p) => SYMBOLS[p] ?? (p.length === 1 ? p.toUpperCase() : p.toUpperCase()))
    .join("");
}
