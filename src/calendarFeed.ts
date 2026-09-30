import { useEffect, useState, useSyncExternalStore } from "react";
import { useMeta } from "./store.ts";

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
}

/** A subscribed calendar as the browser knows it: never its link. */
export interface FeedInfo {
  id: string;
  name: string;
  color: string;
  host: string;
  error?: string;
}

// Fetched per range and kept for a few minutes, so moving between weeks and views doesn't ask again.
const cache = new Map<string, { at: number; events: CalEvent[] }>();
const FRESH_MS = 5 * 60_000;

/** The appointments on days from..to from every subscribed calendar that isn't hidden here. */
export function useEvents(from: string, to: string): { events: CalEvent[]; feeds: FeedInfo[] } {
  const { calendars } = useMeta();
  const hidden = useHiddenFeeds();
  const ids = calendars.map((c) => c.id).join(",");
  const key = `${ids}|${from}|${to}`;
  const hit = cache.get(key);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!ids) return;
    const c = cache.get(key);
    if (c && Date.now() - c.at < FRESH_MS) return;
    let live = true;
    fetch(`/api/calendar/events?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((j: { events?: CalEvent[] }) => {
        cache.set(key, { at: Date.now(), events: j.events ?? [] });
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

/** Forget what was fetched (a calendar added, changed or removed). */
export const clearEvents = () => cache.clear();

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
