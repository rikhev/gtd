import { createContext, useContext } from "react";
import type { ID } from "../shared/types.ts";

export type ViewId =
  | "inbox"
  | "next"
  | "projects"
  | "waiting"
  | "agendas"
  | "someday"
  | "reference"
  | "checklists"
  | "horizons"
  | "review"
  | "done"
  | "settings"
  | "search"
  | "clarify"
  | "trash"
  | "calendar";

export type Region = "rail" | "list" | "detail";

export type EntityKind = "action" | "project" | "stuff" | "ref" | "area" | "event";
export interface Target {
  kind: EntityKind;
  id: ID;
}

export interface ListItem {
  id: string;
  label: string;
  hint?: string;
  color?: string;
  /** Items sharing a section sit together; a hairline divides one section from the next. */
  section?: string;
}

export type PickerSpec =
  | {
      type: "list";
      title: string;
      items: ListItem[];
      current?: string | null;
      /** Where the highlight starts, without marking it as the current value (a filter coming back on the row just ticked). */
      highlight?: string | null;
      /**
       * ⇧↵ (or a ⇧- or ⌘-click) on an option: add it without closing, for a filter that can hold several. The picker
       * closes and the caller reopens it with the new state; a plain pick still chooses and closes.
       */
      onPickMore?: (id: string) => void;
      noneLabel?: string;
      createLabel?: (q: string) => string;
      onCreate?: (q: string) => void;
      /** Nothing is pre-highlighted: Enter does nothing until you type or arrow to a choice. */
      mustChoose?: boolean;
      placeholder?: string;
      /** Opened by the mouse (a right-click): the menu appears at this point instead of under the focused row. */
      at?: { x: number; y: number };
      onPick: (id: string | null) => void;
    }
  | { type: "date"; title: string; current: string | null; onPick: (d: string | null) => void }
  | { type: "time"; current: number | null; onPick: (m: number | null) => void }
  | { type: "energy"; current: number | null; onPick: (e: 1 | 2 | 3 | null) => void }
  | {
      type: "text";
      title: string;
      current: string;
      placeholder?: string;
      preview?: (s: string) => { ok: boolean; text: string };
      onPick: (s: string) => void;
    };

export interface UI {
  view: ViewId;
  go: (v: ViewId) => void;
  region: Region;
  setRegion: (r: Region) => void;
  detail: Target | null;
  openDetail: (t: Target | null, focus?: boolean) => void;
  /** Pinned, the detail pane stays open beside every list and follows the cursor; Esc only steps back to the list. */
  detailPinned: boolean;
  setDetailPinned: (on: boolean) => void;
  /** A list reports what its cursor is on: the pane follows it when pinned, or when it is already open. */
  followDetail: (t: Target | null) => void;
  /**
   * Open something from inside the pane (a project's action or appointment), remembering what the pane showed, so
   * Esc or the pane's back link returns to it. Anything opened from a list starts the trail afresh.
   */
  drillDetail: (t: Target) => void;
  /** What the pane showed before each drill, the last one last. */
  detailTrail: Target[];
  /** Back one step along the trail. */
  detailBack: () => void;
  openPicker: (p: PickerSpec) => void;
  pickerOpen: boolean;
  focusCapture: () => void;
  openPalette: () => void;
  openHelp: () => void;
  openSearch: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  /** Start Clarify; Esc, Stop and the end state return to `returnTo` (the Inbox by default). */
  /** Clarify the Inbox, one item at a time. */
  startClarify: (returnTo?: ViewId) => void;
  leaveClarify: () => void;
  clarifyReturn: () => ViewId;
  startReview: () => void;
  /** Jump to an entity in its home list and focus it. */
  reveal: (t: Target) => void;
  /** J on an action: go to its project, remembering where you came from. */
  jumpToProject: (actionId: ID) => void;
  /** J on a reference or a checklist: go to the project it supports, remembering it, so J on the project comes back. */
  jumpFromSupport: (kind: "ref" | "checklist", id: ID) => void;
  /** J on a project: back to the action, appointment, reference or checklist you jumped from, else its first next action. */
  jumpToAction: (projectId: ID) => void;
  /** J on an appointment linked to a project: go to the project, remembering the appointment, so J comes back. */
  jumpFromAppointment: (key: string) => void;
  revealTarget: Target | null;
  clearReveal: () => void;
}

export const UIContext = createContext<UI | null>(null);
export function useUI(): UI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error("UIContext missing");
  return ui;
}

export const VIEW_TITLES: Record<ViewId, string> = {
  inbox: "Inbox",
  next: "Next Actions",
  projects: "Projects",
  waiting: "Waiting For",
  agendas: "Agendas",
  someday: "Someday / Maybe",
  reference: "Reference",
  checklists: "Checklists",
  horizons: "Horizons",
  review: "Weekly Review",
  done: "Done",
  settings: "Settings",
  search: "Search",
  clarify: "Clarify",
  trash: "Trash",
  calendar: "Calendar",
};
