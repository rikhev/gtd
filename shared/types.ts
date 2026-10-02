export type ID = string;

/**
 * "later" is a planned step of a project (GTD: a project's plan lives in its support material; only its next actions
 * sit on the lists): it shows only in its project and becomes a next action when its turn comes.
 */
export type ActionStatus = "next" | "waiting" | "someday" | "later" | "done" | "trashed";
export type ProjectStatus = "active" | "someday" | "done" | "trashed";

export interface Action {
  id: ID;
  title: string;
  notes: string;
  project_id: ID | null;
  context_id: ID | null;
  due: string | null;
  defer: string | null;
  time_min: number | null;
  energy: 1 | 2 | 3 | null;
  flagged: 0 | 1;
  status: ActionStatus;
  waiting_who: string | null;
  /** Who this action is for or with (an agenda item to raise, a call to make): it shows on that person's agenda. */
  person?: string | null;
  waiting_since: string | null;
  followup: string | null;
  recurrence: string | null;
  bring_back: string | null;
  sort: number;
  created_at: string;
  completed_at: string | null;
  /** Last edited or completed; a project with nothing touched for the stall threshold is stalled. */
  updated_at: string | null;
  /** Done but not yet archived: the list it was done on, where it stays (struck through) until archived. */
  done_from: "next" | "waiting" | "someday" | "later" | "inbox" | null;
  /** When a done action was archived to the Done list; null while it still sits on its own list. */
  archived_at: string | null;
  /** When it was deleted (the Trash keeps it for the keep period), and the status it had. */
  trashed_at?: string | null;
  trashed_from?: string | null;
}

export interface Project {
  id: ID;
  title: string;
  outcome: string;
  notes: string;
  area_id: ID | null;
  status: ProjectStatus;
  due: string | null;
  bring_back: string | null;
  sort: number;
  created_at: string;
  completed_at: string | null;
  /** The day work on it starts; with a due date the calendar draws it as a bar between them. */
  start?: string | null;
  /** Natural planning (GTD): why it matters (its purpose) and the ideas for it (the brainstorm). "Done looks like" is `outcome`. */
  purpose?: string;
  ideas?: string;
  /** The goal it serves (a Horizons goal), if any. */
  goal_id?: ID | null;
  /** Set when a completed project is archived off the Projects list. */
  archived_at: string | null;
  /** When it was deleted (the Trash keeps it for the keep period), and the status it had. */
  trashed_at?: string | null;
  trashed_from?: string | null;
}

export interface Stuff {
  id: ID;
  text: string;
  kind: "text" | "email" | "file";
  status: "inbox" | "done" | "processed" | "trashed";
  created_at: string;
  processed_at: string | null;
  /**
   * A tickler entry ("Due back: Call Anna"): the item whose bring-back date has come, which stays as it was until this
   * entry is clarified (kept, made current, done, brought back later, gone to, or dropped).
   */
  back_kind?: "action" | "project" | null;
  back_id?: ID | null;
  /** When it was deleted (the Trash keeps it for the keep period), and the status it had. */
  trashed_at?: string | null;
  trashed_from?: string | null;
}

export interface Ref {
  id: ID;
  title: string;
  notes: string;
  project_id: ID | null;
  status: "active" | "trashed";
  created_at: string;
  /** Last edited (title, notes, project); null until it has been. */
  updated_at?: string | null;
  /** When it was deleted (the Trash keeps it for the keep period), and the status it had. */
  trashed_at?: string | null;
  trashed_from?: string | null;
}

export interface Context {
  id: ID;
  name: string;
  color: string;
  sort: number;
}

export interface Area {
  id: ID;
  name: string;
  sort: number;
  /** Shown only in the area's "#"; null draws a plain ink #. */
  color: string | null;
}

export interface FileRow {
  id: ID;
  name: string;
  mime: string;
  size: number;
  preview: string;
  owner_kind: "stuff" | "project" | "ref" | "action";
  owner_id: ID;
  created_at: string;
}

/**
 * An appointment from a subscribed calendar linked to a project (owner's request): an upcoming one is the project's
 * next step, so a project without a next action shows as scheduled rather than stalled. The appointment itself stays
 * in its calendar; this keeps what the project needs of it (title, day, time), so health never waits on a fetch.
 */
export interface Appointment {
  /** The appointment's key (its calendar, its UID and its day): one occurrence of a repeating meeting. */
  id: string;
  project_id: ID;
  title: string;
  date: string;
  time: string | null;
  end_time: string | null;
  /** The subscribed calendar it comes from. */
  feed: string;
  created_at: string;
}

/**
 * A checklist (GTD's checklists: their own category apart from Reference, reusable lists run when relevant, such as
 * packing for a trip or closing the month). Its items can be ticked off as a run goes; starting over clears the ticks.
 */
export interface Checklist {
  id: ID;
  title: string;
  notes: string;
  area_id: ID | null;
  status: "active" | "trashed";
  sort: number;
  created_at: string;
  /** Last edited (renamed, its items changed); a tick is not an edit. */
  updated_at: string | null;
  /** When every item was last ticked: the last run that was finished. */
  finished_at: string | null;
  /**
   * A routine (habits): it starts over by itself every day or every week, and each tick is kept as a record of the day
   * it was done (ChecklistTick). Null for an ordinary checklist, whose ticks wait for Start over.
   */
  repeats?: "day" | "week" | null;
  /** The day it began repeating (YYYY-MM-DD): a habit's record counts from then, or from when the habit was added. */
  repeats_since?: string | null;
  /** The project it supports, if any: it shows among the project's support material. */
  project_id?: ID | null;
  /** When it was deleted (the Trash keeps it for the keep period), and the status it had. */
  trashed_at?: string | null;
  trashed_from?: string | null;
}

export interface ChecklistItem {
  id: ID;
  checklist_id: ID;
  title: string;
  /** A section heading ("Clothes", "Papers") rather than something to tick. */
  section: 0 | 1;
  /** Ticked in the current run, and when; null while it is still to do. */
  checked_at: string | null;
  sort: number;
  created_at: string;
}

/**
 * GTD's higher horizons of focus, above areas: purpose and principles, vision (3–5 years) and goals (1–2 years).
 * Projects serve goals; the Weekly Review's Get creative and the owner's own judgement of priority read them.
 */
export interface Horizon {
  id: ID;
  kind: "purpose" | "vision" | "goal";
  title: string;
  notes: string;
  /** A goal's area of focus, if any. */
  area_id: ID | null;
  /** A goal's target date, if any. */
  target: string | null;
  status: "active" | "done" | "trashed";
  sort: number;
  created_at: string;
  completed_at: string | null;
  trashed_at?: string | null;
  trashed_from?: string | null;
}

/** One day a habit (an item on a repeating checklist) was done. */
export interface ChecklistTick {
  id: ID;
  item_id: ID;
  checklist_id: ID;
  /** The day it was ticked (YYYY-MM-DD, the owner's own day). */
  day: string;
  created_at: string;
}

export interface Review {
  id: ID;
  completed_at: string;
}

export interface Tables {
  actions: Action;
  projects: Project;
  stuff: Stuff;
  refs: Ref;
  contexts: Context;
  areas: Area;
  files: FileRow;
  reviews: Review;
  appointments: Appointment;
  checklists: Checklist;
  checklist_items: ChecklistItem;
  checklist_ticks: ChecklistTick;
  horizons: Horizon;
}
export type TableName = keyof Tables;

export type State = { [K in TableName]: Tables[K][] };

export type Op =
  | { type: "create"; table: TableName; row: Record<string, unknown> }
  | { type: "patch"; table: TableName; id: ID; data: Record<string, unknown> }
  | { type: "delete"; table: TableName; id: ID };

/* ---- Clarify decisions (each Inbox item's outcome, as the owner sets it on the Clarify screen) ---- */

export type ProposedKind = "next" | "waiting" | "someday";

export interface ProposedAction {
  title: string;
  kind: ProposedKind;
  /** "new" = the proposal's new project, an existing project id, or null */
  project: string | null;
  context: string | null;
  due: string | null;
  defer: string | null;
  time_min: number | null;
  energy: 1 | 2 | 3 | null;
  waiting_who: string | null;
  two_minute: boolean;
  /** The tickler: on this day it comes back to the Inbox to be decided again (GTD's "incubate"). */
  bring_back?: string | null;
}

export interface Proposal {
  stuff_id: ID;
  disposition: "actionable" | "someday" | "reference" | "trash";
  /** A new project the item becomes part of; `outcome` is what done looks like (natural planning). */
  new_project: { title: string; area: string | null; outcome?: string } | null;
  actions: ProposedAction[];
  /** Kept as reference, or (checklist) as a checklist whose items are the item's lines. */
  reference: { title: string; notes: string; checklist?: boolean } | null;
}

