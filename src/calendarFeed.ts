import { useEffect, useMemo, useSyncExternalStore } from "react";
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

/*
 * Every appointment the calendars have given, kept in this browser (owner's request: the calendar was empty each time
 * the app opened, and emptied when a click moved it into a month not yet fetched). Any view shows what is known for its
 * days at once; each range is asked for again when it hasn't been for a few minutes, and the answer replaces what was
 * known on those days, so a deleted or moved appointment goes. Only the weeks around today are saved.
 */
const STORE_KEY = "gtd:calendar:known";
const FRESH_MS = 5 * 60_000;
const byKey = new Map<string, CalEvent>(
  (() => {
    try {
      return (JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as CalEvent[]).map((e) => [e.key, e] as [string, CalEvent]);
    } catch {
      return [];
    }
  })(),
);
/** When each range (calendars, days, version) was last asked for. */
const askedAt = new Map<string, number>();
const indexListeners = new Set<() => void>();
const subscribeKnown = (l: () => void) => {
  indexListeners.add(l);
  return () => indexListeners.delete(l);
};
let knownVersion = 0;
const overlaps = (e: CalEvent, from: string, to: string) => e.endDate >= from && e.date <= to;

let saveTimer: number | undefined;
function saveKnown() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const d = new Date();
    const iso = (n: number) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
    const [lo, hi] = [iso(-45), iso(120)];
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...byKey.values()].filter((e) => overlaps(e, lo, hi))));
    } catch {
      /* no storage, or full: the calendar still works, it only starts empty next time */
    }
  }, 400);
}

/** A fresh answer for days from..to: it replaces everything known on those days. */
function absorb(from: string, to: string, events: CalEvent[]) {
  for (const [k, e] of byKey) if (overlaps(e, from, to)) byKey.delete(k);
  for (const e of events) byKey.set(e.key, e);
  knownVersion++;
  indexListeners.forEach((l) => l());
  saveKnown();
}

/** The appointments on days from..to from every subscribed calendar that isn't hidden here. */
export function useEvents(from: string, to: string): { events: CalEvent[]; feeds: FeedInfo[] } {
  const { calendars } = useMeta();
  const hidden = useHiddenFeeds();
  // A sync (or a changed calendar) bumps the version, so every open view asks again.
  const version = useSyncExternalStore(subscribeVersion, () => version_);
  const known = useSyncExternalStore(subscribeKnown, () => knownVersion);
  const ids = calendars.map((c) => c.id).join(",");
  const key = `${ids}|${from}|${to}|${version}`;
  useEffect(() => {
    if (!ids) return;
    const at = askedAt.get(key);
    if (at && Date.now() - at < FRESH_MS) return;
    askedAt.set(key, Date.now());
    // The server converts every appointment to this browser's time zone (it may itself run on UTC).
    fetch(`/api/calendar/events?from=${from}&to=${to}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`)
      .then((r) => r.json())
      .then((j: { events?: CalEvent[]; linkNotes?: string[] }) => {
        linksFollowed(j.linkNotes);
        if (j.events) absorb(from, to, j.events);
      })
      .catch(() => askedAt.delete(key));
  }, [key, ids, from, to]);
  const events = useMemo(
    () =>
      ids
        ? [...byKey.values()]
            .filter((e) => overlaps(e, from, to) && !hidden.has(e.feed) && calendars.some((c) => c.id === e.feed))
            .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [known, ids, from, to, hidden],
  );
  return { events, feeds: ids ? calendars : [] };
}

/** One appointment, by key, for the details pane (appointments aren't kept in the store). */
export function useEvent(key: string | null): CalEvent | undefined {
  return useSyncExternalStore(subscribeKnown, () => (key ? byKey.get(key) : undefined));
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
  // What is known stays on screen until the fresh answers replace it: nothing empties while a sync runs.
  askedAt.clear();
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
