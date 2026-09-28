import { createContext, useContext } from "react";
import type { ID } from "../shared/types.ts";

export type ViewId =
  | "inbox"
  | "next"
  | "projects"
  | "waiting"
  | "someday"
  | "reference"
  | "review"
  | "done"
  | "settings"
  | "search"
  | "clarify"
  | "trash"
  | "calendar";

export type Region = "rail" | "list" | "detail";

export type EntityKind = "action" | "project" | "stuff" | "ref" | "area";
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
      noneLabel?: string;
      createLabel?: (q: string) => string;
      onCreate?: (q: string) => void;
      /** Nothing is pre-highlighted: Enter does nothing until you type or arrow to a choice. */
      mustChoose?: boolean;
      placeholder?: string;
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
      /** Masked input for secrets such as the API key. */
      secret?: boolean;
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
  openPicker: (p: PickerSpec) => void;
  pickerOpen: boolean;
  focusCapture: () => void;
  openPalette: () => void;
  openHelp: () => void;
  openSearch: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  /** Start Clarify; Esc, Stop and the end state return to `returnTo` (the Inbox by default). */
  /** Clarify the Inbox, by hand, or with Claude's proposals when `withClaude`. */
  startClarify: (returnTo?: ViewId, withClaude?: boolean) => void;
  leaveClarify: () => void;
  clarifyReturn: () => ViewId;
  startReview: () => void;
  /** Jump to an entity in its home list and focus it. */
  reveal: (t: Target) => void;
  /** J on an action: go to its project, remembering where you came from. */
  jumpToProject: (actionId: ID) => void;
  /** J on a project: back to the action you jumped from, else its first next action. */
  jumpToAction: (projectId: ID) => void;
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
  someday: "Someday / Maybe",
  reference: "Reference",
  review: "Weekly Review",
  done: "Done",
  settings: "Settings",
  search: "Search",
  clarify: "Clarify",
  trash: "Trash",
  calendar: "Calendar",
};
