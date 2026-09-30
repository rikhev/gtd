import { useEffect, useRef } from "react";

/**
 * Keyboard engine.
 * Key strings: modifiers "mod" (⌘ on the Mac, Ctrl elsewhere), "ctrl" (the Mac's own ⌃; never matches
 * elsewhere, where Ctrl is "mod"), "alt" (⌥), "shift" (⇧) + a key.
 * Letters/digits match physical keys (e.code), so ⌥ combos and Swedish layouts work;
 * punctuation matches the produced character (e.key), so "?" works on any layout.
 */

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

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

/** The same, each with the id of the layer it came from (the help overlay tells app-wide keys from the screen's). */
export function activeCommandsByLayer(): { layer: string; command: Command }[] {
  const sorted = [...layers.values()].sort((a, b) => b.priority - a.priority);
  const out: { layer: string; command: Command }[] = [];
  for (const l of sorted) {
    out.push(...l.commands.filter((c) => c.enabled !== false).map((command) => ({ layer: l.id, command })));
    if (l.exclusive) break;
  }
  return out;
}

/** Run whatever the key does right now, as if it were pressed: lets a tap on a key hint do the key's work. */
export function runKey(k: string) {
  const c = activeCommands().find((x) => x.keys?.includes(k));
  c?.run();
}

/**
 * Whether the last press came from a finger. Touch devices send mouse events after a tap, so mouse-only gestures
 * (rectangle select, drag to reorder) check this to stay out of a finger's way.
 */
let lastPointer = "mouse";
if (typeof window !== "undefined") window.addEventListener("pointerdown", (e) => (lastPointer = e.pointerType), true);
export const pressedByTouch = () => lastPointer === "touch" || lastPointer === "pen";
/** A touch-first device: a coarse pointer and no hover. */
export const isTouchDevice = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** Run a command as soon as it becomes available, e.g. right after switching to its view. */
export function runWhenReady(id: string, frames = 120) {
  const c = activeCommands().find((x) => x.id === id);
  if (c) c.run();
  else if (frames > 0) requestAnimationFrame(() => runWhenReady(id, frames - 1));
}

/** The layer a command was registered in ("global" for the app-wide ones, a view or pane id otherwise). */
export function layerOf(cmd: Command): string | undefined {
  // By id: command objects are rebuilt on every render, so identity can't be relied on.
  for (const l of layers.values()) if (l.commands.some((c) => c.id === cmd.id)) return l.id;
  return undefined;
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
  // "mod" is the platform's command key: ⌘ on the Mac, Ctrl elsewhere (where the Windows key is left to the OS).
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push("mod");
  if (IS_MAC && e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  // The comma key by position, so ⌘⇧, reads as "mod+shift+," even where ⇧, types "<".
  else if (e.code === "Comma" && (e.metaKey || e.ctrlKey)) key = ",";
  else if (e.key === " ") key = "space";
  else key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  // Shift is implicit in produced punctuation such as "?".
  const punct = key.length === 1 && !/[a-z0-9]/.test(key) && !(e.code === "Comma" && (e.metaKey || e.ctrlKey));
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
    // While typing, Backspace and Delete belong to the text, with any modifier: the system's delete word (⌥⌫,
    // Ctrl+⌫), delete to line start (⌘⌫) and forward delete must never close a pane or remove a row instead.
    if (editing && /(^|\+)(backspace|delete)$/.test(key)) return;
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

/**
 * Key legends read the same on every system, in compact symbols (owner's decision): ⌃ Control, ⇧ Shift, and Alt as
 * ⌥ on the Mac (Option) or the old Meta key's hollow diamond ◇ elsewhere, run together with no "+". The command key is ⌘ on the Mac and Control (⌃) elsewhere, since that is the key
 * pressed there. Screen readers get the spelled-out names from keyAria.
 */
export function keyLabel(k: string): string {
  return k
    .split("+")
    .map((p) => (p === "mod" && !IS_MAC ? "⌃" : p === "alt" && !IS_MAC ? "◇" : (SYMBOLS[p] ?? p.toUpperCase())))
    .join("");
}

const ARIA: Record<string, string> = { mod: IS_MAC ? "Meta" : "Control", ctrl: "Control", alt: "Alt", shift: "Shift", ",": "Comma", ".": "Period", space: "Space" };

/** The key string as an aria-keyshortcuts value, e.g. "Control+1". */
export function keyAria(k: string): string {
  // No key (a rail list without a go-to number, such as Agendas) announces nothing.
  if (!k) return "";
  return k
    .split("+")
    .map((p) => ARIA[p] ?? (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join("+");
}
