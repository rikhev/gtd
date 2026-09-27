/**
 * The Weekly Review in progress. A review is a ritual you step out of to fix things
 * (a list, Clarify, a project), so its place and the steps you have been through live here rather than in the view: coming back resumes where you were.
 * Kept in localStorage so closing the tab keeps it too; Finish or "Start a new review" clears it,
 * and a review left untouched for a week starts over.
 */
export interface ReviewSession {
  startedAt: string;
  stepIdx: number;
  visited: string[];
}

const KEY = "gtd:review";

export function newSession(): ReviewSession {
  return { startedAt: new Date().toISOString(), stepIdx: 0, visited: [] };
}

export function loadSession(): ReviewSession {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...newSession(), ...(JSON.parse(raw) as Partial<ReviewSession>) };
      if (Date.now() - Date.parse(s.startedAt) < 7 * 86_400_000) return s;
    }
  } catch {
    /* no storage: a fresh review each time */
  }
  const s = newSession();
  saveSession(s);
  return s;
}

export function saveSession(s: ReviewSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* no storage */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
}
