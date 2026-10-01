/**
 * The Weekly Review in progress. A review is a ritual you step out of to fix things
 * (a list, Clarify, a project), so its place and the steps you have been through live here rather than in the view: coming back resumes where you were.
 * Kept in localStorage so closing the tab keeps it too; Finish or "Start a new review" clears it,
 * and a review left untouched for a week starts over.
 */
export interface ReviewSession {
  startedAt: string;
  stepIdx: number;
  /** The step by name, so a step added to the review later can't move a review in progress onto another one. */
  stepId?: string;
  visited: string[];
  /** Steps with nothing to count as open (Mind sweep, Look back) are clear only once something was done in them. */
  acted?: string[];
  /**
   * What this review's own capture lines (the Mind sweep, Get creative) put in the Inbox. "Captured in this review"
   * lists exactly these (owner's bug report: going by time, a review left open for days also counted everything
   * captured elsewhere in between).
   */
  captured?: string[];
  /**
   * When the review screen was actually open (ISO from/to): the closing tally counts only what happened inside these,
   * never ordinary work done while a review stood open for days (critique).
   */
  spans?: { from: string; to: string }[];
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
