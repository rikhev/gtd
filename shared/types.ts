export type ID = string;

export type ActionStatus = "next" | "waiting" | "someday" | "done" | "trashed";
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
  done_from: "next" | "waiting" | "someday" | "inbox" | null;
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

export interface Rule {
  id: ID;
  text: string;
  status: "suggested" | "active";
  created_at: string;
}

export interface Correction {
  id: ID;
  stuff_text: string;
  field: string;
  proposed: string;
  chosen: string;
  used: 0 | 1;
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
  rules: Rule;
  corrections: Correction;
  reviews: Review;
  appointments: Appointment;
}
export type TableName = keyof Tables;

export type State = { [K in TableName]: Tables[K][] };

export type Op =
  | { type: "create"; table: TableName; row: Record<string, unknown> }
  | { type: "patch"; table: TableName; id: ID; data: Record<string, unknown> }
  | { type: "delete"; table: TableName; id: ID };

/* ---- Clarify proposals (the shape Claude returns, edited by the owner) ---- */

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
}

export interface Proposal {
  stuff_id: ID;
  disposition: "actionable" | "someday" | "reference" | "trash";
  new_project: { title: string; area: string | null } | null;
  actions: ProposedAction[];
  reference: { title: string; notes: string } | null;
}

