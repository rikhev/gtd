import { useSyncExternalStore } from "react";
import { notify } from "./store.ts";
import { addDays, today } from "../shared/dates.ts";
import { eventsFor, onEventsChange, type CalEvent } from "./calendarFeed.ts";

/*
 * Appointment reminders (owner's request): a system notification 15 minutes and again 5 minutes before each
 * appointment with a time, from every subscribed calendar. They come from this browser tab, so the app has to be open
 * somewhere; the choice is kept per browser, like the theme, since each browser asks its own permission. A reminder
 * is shown silently, or with the app's own chime: the system's notification sound is the browser's to give, and
 * neither Firefox nor Edge lets a page rely on it.
 */

export type AlertMode = "off" | "visual" | "sound";
export const ALERT_LABEL: Record<AlertMode, string> = { off: "Off", visual: "Visual only", sound: "With sound" };

/** Minutes before the start, latest last. */
const LEADS = [15, 5];
const KEY = "gtd:alerts";
const FIRED_KEY = "gtd:alerts:fired";
const TICK_MS = 20_000;

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export const supported = () => typeof window !== "undefined" && "Notification" in window;
export const permission = (): NotificationPermission | "unsupported" => (supported() ? Notification.permission : "unsupported");

export function alertMode(): AlertMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "visual" || v === "sound" ? v : "off";
  } catch {
    return "off";
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("focus", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("focus", l);
  };
};
/** The mode and the browser's permission, re-rendering when either changes (a permission can change in the browser's own settings). */
export function useAlerts(): { mode: AlertMode; permission: NotificationPermission | "unsupported" } {
  return { mode: useSyncExternalStore(subscribe, alertMode), permission: useSyncExternalStore(subscribe, permission) };
}

/**
 * Change how reminders come. Turning them on asks the browser's permission the first time (it must be asked while
 * the owner is choosing), then shows one at once so the owner sees, and hears, what they will get.
 */
export async function setAlertMode(mode: AlertMode) {
  if (mode !== "off") {
    if (!supported()) return notify("This browser can't show notifications.", { tone: "error" });
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    changed();
    if (p !== "granted") return notify("The browser blocks notifications for this page. Allow them in its site settings, then choose again.", { tone: "error" });
  }
  try {
    if (mode === "off") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable: the choice holds for this session */
  }
  changed();
  if (mode === "off") return notify("Appointment reminders off");
  if (mode === "sound") chime();
  show("Reminders are on", `15 and 5 minutes before each appointment${mode === "sound" ? ", with this sound" : ""}.`, "gtd:alerts:sample", null);
  notify(mode === "sound" ? "Appointment reminders on, with a sound" : "Appointment reminders on, without a sound");
}

/* ---------------- the clock ---------------- */

/** When it starts, as a timestamp in this browser's time zone (the server already converted it). */
const startOf = (e: CalEvent) => {
  const [y, m, d] = e.date.split("-").map(Number);
  const [h, min] = (e.time ?? "0:0").split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
};

/** Reminders already given, by appointment, start and lead, with the start: kept so a reload or a second tab doesn't repeat one. */
function readFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function writeFired(fired: Record<string, number>) {
  const old = Date.now() - 3_600_000;
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(Object.fromEntries(Object.entries(fired).filter(([, at]) => at > old))));
  } catch {
    /* no storage: a reload may repeat a reminder */
  }
}

let opener: ((key: string) => void) | null = null;

/**
 * Give the reminders that are due. Each appointment gets the latest lead it has reached: opened 10 minutes before,
 * the app says "in 10 minutes" once, not 15 too late; after a sleep past the start, nothing. A moved appointment
 * starts afresh, since its start is part of what was given.
 */
function tick() {
  if (alertMode() === "off" || permission() !== "granted") return;
  const now = Date.now();
  const t = today();
  const fired = readFired();
  let gave = false;
  for (const e of eventsFor(t, addDays(t, 1))) {
    if (!e.time) continue;
    const start = startOf(e);
    const mins = (start - now) / 60_000;
    if (mins <= 0 || mins > LEADS[0]) continue;
    const lead = Math.min(...LEADS.filter((l) => mins <= l));
    const id = `${e.key}|${e.date} ${e.time}|${lead}`;
    if (fired[id]) continue;
    fired[id] = start;
    gave = true;
    const n = Math.max(1, Math.round(mins));
    const when = `${n === 1 ? "In a minute" : `In ${n} minutes`} · ${e.time}${e.endTime && e.endDate === e.date ? `–${e.endTime}` : ""}`;
    show(e.title || "Appointment", [when, e.location].filter(Boolean).join(" · "), id, e.key);
  }
  if (gave) {
    writeFired(fired);
    if (alertMode() === "sound") chime();
  }
}

function show(title: string, body: string, tag: string, key: string | null) {
  try {
    const n = new Notification(title, { body, tag, silent: true, icon: "/apple-touch-icon.png" });
    n.onclick = () => {
      window.focus();
      if (key) opener?.(key);
      n.close();
    };
  } catch {
    /* the browser refused this one: the next is tried as usual */
  }
}

/**
 * Keep the clock going while the app is open; a click on a reminder calls `open` with the appointment's key. The
 * clock also looks when the tab comes back into view and when fresh appointments arrive.
 */
export function startAlerts(open: (key: string) => void): () => void {
  opener = open;
  tick();
  const timer = window.setInterval(tick, TICK_MS);
  const unsub = onEventsChange(tick);
  const visible = () => document.visibilityState === "visible" && tick();
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("pointerdown", unlockAudio, true);
  window.addEventListener("keydown", unlockAudio, true);
  return () => {
    opener = null;
    window.clearInterval(timer);
    unsub();
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("pointerdown", unlockAudio, true);
    window.removeEventListener("keydown", unlockAudio, true);
  };
}

/* ---------------- the chime ---------------- */

/*
 * A drop into still water: two soft sine notes a fifth apart, each starting with a slight upward bend and dying away
 * like a ring spreading out. Made here, not loaded, so it needs no file and sounds the same in every browser.
 * Browsers only let a page play sound after the owner has used it, so the first key or click wakes the audio.
 */
let audio: AudioContext | null = null;
function unlockAudio() {
  if (alertMode() !== "sound") return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* no audio here: reminders still show */
  }
}

export function chime() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const ctx = audio;
    const out = ctx.createGain();
    out.gain.value = 0.22;
    out.connect(ctx.destination);
    const note = (freq: number, at: number, length: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * 0.94, at);
      o.frequency.exponentialRampToValueAtTime(freq, at + 0.06);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(1, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + length);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + length + 0.05);
    };
    const now = ctx.currentTime + 0.02;
    note(784, now, 1.1);
    note(1175, now + 0.16, 1.4);
  } catch {
    /* no audio here: the reminder still shows */
  }
}
