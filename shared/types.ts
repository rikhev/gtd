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
  waiting_since: string | null;
  followup: string | null;
  recurrence: string | null;
  bring_back: string | null;
  sort: number;
  created_at: string;
  completed_at: string | null;
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
}

export interface Stuff {
  id: ID;
  text: string;
  kind: "text" | "email" | "file";
  status: "inbox" | "processed" | "trashed";
  created_at: string;
  processed_at: string | null;
}

export interface Ref {
  id: ID;
  title: string;
  notes: string;
  project_id: ID | null;
  status: "active" | "trashed";
  created_at: string;
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

export interface ReviewFlag {
  kind: "project" | "action" | "waiting" | "someday";
  id: ID;
  issue: "stalled" | "stale" | "vague" | "overdue" | "other";
  message: string;
  suggested_title: string | null;
  suggested_next_action: string | null;
}
