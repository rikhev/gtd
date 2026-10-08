import { useEffect, useRef, useState } from "react";
import { getState, mutate, notify, quote, type MutateOpts } from "./store.ts";
import type { TableName } from "../shared/types.ts";

/*
 * Notes save as they are typed (owner's request, after the Reference critique: a note had saved only when you left
 * it, so a reload or a closed tab lost it). A second after typing stops the text is saved, and again when the field
 * is left, the tab is hidden or the page closes. A stretch of typing is one ⌘Z.
 *
 * Until the server has it, the text is also kept in this browser (never for a locked note: that would leave its words
 * in the clear), so a crash or a failed save loses nothing: the next time the app opens, what was typed is saved
 * then, and an open note gets it back.
 */

const DELAY = 1000;
const PREFIX = "gtd:draft:";

type Draft = { text: string; base: string };

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, d: Draft) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(d));
  } catch {
    /* no storage: the save a second later still holds it */
  }
}
function dropDraft(key: string, text?: string) {
  try {
    if (text === undefined || readDraft(key)?.text === text) localStorage.removeItem(PREFIX + key);
  } catch {
    /* no storage */
  }
}

/* ---------------- everything waiting to be saved ---------------- */

const pending = new Map<string, () => Promise<void>>();
/** Saves every note being typed in now: as the tab is hidden or closed, and before the lock shuts. */
export async function flushAll() {
  await Promise.all([...pending.values()].map((f) => f()));
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flushAll());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flushAll());
}

let sessions = 0;

/**
 * A notes field's text, saved as it is typed. `key` names the field ("refs:<id>:notes"); `save` stores a text with
 * the mutate options given (silent, and joined into one undo step while the field keeps focus); `local` keeps the
 * unsaved text in this browser until it is stored.
 */
export function useAutosave({ key, value, save, local }: { key: string; value: string; save: (text: string, opts: MutateOpts) => Promise<boolean> | void; local: boolean }) {
  const [text, setText] = useState(value);
  const live = useRef({ text: value, dirty: false, focused: false, base: value, session: "", timer: 0, save, local, key });
  live.current.save = save;
  live.current.local = local;
  live.current.key = key;

  // A change from outside (⌘Z, another pane, a reload) shows here unless this field holds unsaved typing.
  useEffect(() => {
    const l = live.current;
    if (l.dirty) return;
    l.text = value;
    l.base = value;
    setText(value);
  }, [value]);

  const flush = useRef(async () => {
    const l = live.current;
    window.clearTimeout(l.timer);
    if (!l.dirty) return;
    l.dirty = false;
    const t = l.text;
    // Typing that starts with no focus (a link written in from a picker) still gets a step of its own.
    const session = l.session || `notes:${l.key}:${++sessions}`;
    if (!l.focused) l.session = "";
    const ok = await l.save(t, { silent: true, key: session, join: session });
    if (ok === false) return;
    l.base = t;
    if (l.local) dropDraft(l.key, t);
  }).current;

  useEffect(() => {
    pending.set(key, flush);
    // Restore typing that never reached the server: a crash, a failed save, a page closed mid-sentence.
    const d = local ? readDraft(key) : null;
    if (d && d.text !== value) {
      const l = live.current;
      l.text = d.text;
      l.dirty = true;
      setText(d.text);
      notify("Restored notes that hadn't been saved");
      void flush();
    } else if (d) dropDraft(key);
    return () => {
      void flush();
      pending.delete(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    text,
    change(next: string) {
      const l = live.current;
      if (next === l.text) return;
      l.text = next;
      l.dirty = true;
      setText(next);
      if (l.local) writeDraft(l.key, { text: next, base: l.base });
      window.clearTimeout(l.timer);
      l.timer = window.setTimeout(() => void flush(), DELAY);
    },
    focus() {
      live.current.focused = true;
      live.current.session = `notes:${key}:${++sessions}`;
    },
    blur() {
      live.current.focused = false;
      void flush().then(() => (live.current.session = ""));
    },
    flush,
  };
}

/**
 * Typing kept in this browser for fields not open now: saved as the app loads, when the field still holds what it
 * held when the typing began (else it waits for the field to open, which restores it).
 */
export function replayDrafts() {
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return;
  }
  const s = getState();
  let saved = 0;
  for (const full of keys) {
    const key = full.slice(PREFIX.length);
    const [table, id, field] = key.split(":") as [TableName, string, string];
    const d = readDraft(key);
    const row = (s[table] as unknown as Record<string, unknown>[] | undefined)?.find((r) => r.id === id);
    if (!d || !row) {
      dropDraft(key);
      continue;
    }
    if (row[field] === d.text) dropDraft(key);
    else if (row[field] === d.base && !pending.has(key)) {
      void mutate("Restored notes", [{ type: "patch", table, id, data: { [field]: d.text } }], { silent: true }).then((ok) => ok && dropDraft(key, d.text));
      saved++;
      const title = (row.title as string | undefined) ?? "";
      if (saved === 1) notify(`Saved notes that hadn't been saved${title ? ` to ${quote(title)}` : ""}`, { undo: true });
    }
  }
}
