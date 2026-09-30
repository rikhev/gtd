import { useEffect, useState, useSyncExternalStore } from "react";
import { load, notify, plural, updateMeta, useMeta } from "./store.ts";

/** One appointment from a subscribed calendar, in local time (server/calendar.ts). Read-only. */
export interface CalEvent {
  key: string;
  /** The subscribed calendar it comes from. */
  feed: string;
  title: string;
  location: string | null;
  date: string;
  endDate: string;
  time: string | null;
  endTime: string | null;
  /** What the feed shares beyond the time (published calendars often leave some of it out). */
  description: string | null;
  url: string | null;
  organizer: { name: string | null; email: string | null } | null;
  attendees: { name: string | null; email: string | null; status: "accepted" | "declined" | "tentative" | "none"; optional: boolean }[];
  tentative: boolean;
}

/** A subscribed calendar as the browser knows it: never its link. */
export interface FeedInfo {
  id: string;
  name: string;
  color: string;
  host: string;
  error?: string;
  syncedAt?: string;
}

// Fetched per range and kept for a few minutes, so moving between weeks and views doesn't ask again.
const cache = new Map<string, { at: number; events: CalEvent[] }>();
const FRESH_MS = 5 * 60_000;

/** The appointments on days from..to from every subscribed calendar that isn't hidden here. */
export function useEvents(from: string, to: string): { events: CalEvent[]; feeds: FeedInfo[] } {
  const { calendars } = useMeta();
  const hidden = useHiddenFeeds();
  // A sync (or a changed calendar) bumps the version, so every open view asks again.
  const version = useSyncExternalStore(subscribeVersion, () => version_);
  const ids = calendars.map((c) => c.id).join(",");
  const key = `${ids}|${from}|${to}|${version}`;
  const hit = cache.get(key);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!ids) return;
    const c = cache.get(key);
    if (c && Date.now() - c.at < FRESH_MS) return;
    let live = true;
    // The server converts every appointment to this browser's time zone (it may itself run on UTC).
    fetch(`/api/calendar/events?from=${from}&to=${to}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`)
      .then((r) => r.json())
      .then((j: { events?: CalEvent[]; linkNotes?: string[] }) => {
        linksFollowed(j.linkNotes);
        cache.set(key, { at: Date.now(), events: j.events ?? [] });
        for (const e of j.events ?? []) byKey.set(e.key, e);
        indexListeners.forEach((l) => l());
        if (live) bump((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key, ids, from, to]);
  if (!ids) return { events: [], feeds: [] };
  return { events: (hit?.events ?? []).filter((e) => !hidden.has(e.feed) && calendars.some((c) => c.id === e.feed)), feeds: calendars };
}

/** Every appointment seen, by key, for the details pane (appointments aren't kept in the store). */
const byKey = new Map<string, CalEvent>();
const indexListeners = new Set<() => void>();
export function useEvent(key: string | null): CalEvent | undefined {
  return useSyncExternalStore(
    (l) => {
      indexListeners.add(l);
      return () => indexListeners.delete(l);
    },
    () => (key ? byKey.get(key) : undefined),
  );
}

/**
 * The server moved or unlinked links to projects to follow their appointments: say what changed and load the lists
 * again, so the projects' health follows (a project whose appointment is gone needs a next action again).
 */
function linksFollowed(notes: string[] | undefined) {
  if (!notes?.length) return;
  notify(notes.length === 1 ? notes[0] : `${notes[0]} (and ${plural(notes.length - 1, "more link")} updated)`);
  void load();
}

let version_ = 0;
const versionListeners = new Set<() => void>();
const subscribeVersion = (l: () => void) => {
  versionListeners.add(l);
  return () => versionListeners.delete(l);
};
/** Forget what was fetched (a calendar added, changed or removed, or synced): open views fetch again. */
export const clearEvents = () => {
  cache.clear();
  version_++;
  versionListeners.forEach((l) => l());
};

let syncing: Promise<void> | null = null;
/**
 * Sync now: every subscribed calendar is read again at once (owner's request: all of them, not one), then shown.
 * The toast says what happened, naming any calendar that couldn't be read.
 */
export function syncCalendars(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const j = (await (await fetch("/api/calendars/sync", { method: "POST" })).json()) as { calendars?: FeedInfo[]; linkNotes?: string[] };
      linksFollowed(j.linkNotes);
      const cals = j.calendars ?? [];
      updateMeta({ calendars: cals });
      clearEvents();
      const failed = cals.filter((c) => c.error);
      notify(
        !cals.length
          ? "No calendars to sync. Add one in Settings › General."
          : failed.length
            ? `Synced, but ${failed.map((c) => `“${c.name}”`).join(" and ")} couldn't be read (the last copy is kept).`
            : `${plural(cals.length, "calendar")} synced.`,
        failed.length ? { tone: "error" } : {},
      );
    } catch {
      notify("Couldn't reach the server to sync the calendars.", { tone: "error" });
    } finally {
      syncing = null;
      syncListeners.forEach((l) => l());
    }
  })();
  syncListeners.forEach((l) => l());
  return syncing;
}
const syncListeners = new Set<() => void>();
/** Whether a sync is running (for the button's turning icon). */
export function useSyncing(): boolean {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => syncing !== null,
  );
}

/*
 * Calendars can be hidden for a while in this browser (the Calendar's legend), say the private one during work.
 * Kept per browser: it is a way of looking, not a setting.
 */
const HIDDEN_KEY = "gtd:calendars:hidden";
const listeners = new Set<() => void>();
let hiddenNow: Set<string> = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
})();
export function toggleFeed(id: string) {
  const next = new Set(hiddenNow);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  hiddenNow = next;
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
  } catch {
    /* no storage: hidden for this session */
  }
  listeners.forEach((l) => l());
}
export function useHiddenFeeds(): Set<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hiddenNow,
  );
}
