import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeCommands, isEditable, IS_MAC, isTouchDevice, pressedByTouch, runKey, useCommands, type Command } from "../keys.ts";
import { useUI } from "../ui.tsx";
import { KeyHints } from "./bits.tsx";

export interface Column<T> {
  key: string;
  label: string;
  width: string;
  align?: "end";
  /** When the list gets too narrow (e.g. beside the detail pane), columns with the lowest number go first. */
  drop?: number;
  /** Offered but hidden until the owner shows it (Show or hide columns…). */
  optional?: boolean;
  /** An unlabelled column that still sorts (the project lamp): what it sorts by, and the small glyph its heading shows. */
  sortName?: string;
  headIcon?: ReactNode;
  /** Whether a row has nothing in this column. When no row in the list has anything, the column steps aside. */
  blank?: (row: T) => boolean;
  render: (row: T) => ReactNode;
}

/** On a phone the list keeps one column after the subject: the first of these it has. */
const COMPACT_HIDE = ["done", "kind"];
/** Names for the unlabelled lead columns, for screen readers. */
const LEAD_NAME: Record<string, string> = { mark: "Status", done: "Done", kind: "Kind" };
const COMPACT_TAIL = ["due", "follow", "when", "date", "left", "at", "state", "since", "back", "updated", "created"];

/** Whether a point is over a glyph of text (not merely inside an element that holds text): where a press selects text. */
function overText(x: number, y: number): boolean {
  type CaretDoc = Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const doc = document as CaretDoc;
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) {
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    const r = doc.caretRangeFromPoint?.(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
  // The caret lands beside the nearest character even past the end of a line: check the characters on either side.
  const len = node.textContent.length;
  for (const i of [offset - 1, offset]) {
    if (i < 0 || i >= len) continue;
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const b = range.getBoundingClientRect();
    if (x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1) return true;
  }
  return false;
}

/** Smallest width a column can take: a fixed px width, or the minimum of a minmax(). */
const minWidth = (w: string) => Number((/^minmax\((\d+)px/.exec(w) ?? /^(\d+)px/.exec(w))?.[1] ?? 0);
/** The column that takes the room left over (the subject): it has no width of its own to set. */
const isFlexible = (w: string) => w.includes("fr");
const MIN_COL = 36;
const MAX_COL = 640;
const clampCol = (px: number) => Math.round(Math.max(MIN_COL, Math.min(MAX_COL, px)));

export interface GridGroup<T> {
  key: string;
  label: string;
  /** Context colour: the @ tile before the group label. */
  color?: string;
  /** Area colour: the group label is "#Name" and its # takes this colour ("" for a plain #). */
  areaColor?: string;
  meta?: ReactNode;
  rows: T[];
  /** No count after the label (for groups whose size says nothing, like a single settings row). */
  hideCount?: boolean;
}

export const groupKey = (k: string) => `group:${k}`;
export const isGroupKey = (k: string | null) => Boolean(k?.startsWith("group:"));
const tickable = (k: string) => !isGroupKey(k);

/* ------------------------------------------------------------------ */
/* Remembered per-list view settings                                    */
/* ------------------------------------------------------------------ */

export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`gtd:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T | ((p: T) => T)) =>
    setV((prev) => {
      const val = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try {
        localStorage.setItem(`gtd:${key}`, JSON.stringify(val));
      } catch {
        /* storage unavailable: keep in memory */
      }
      return val;
    });
  return [v, set];
}

/* ------------------------------------------------------------------ */
/* Column sorting: click a heading, as in Outlook                       */
/* ------------------------------------------------------------------ */

/** The column a list is sorted by, and which way; null is the list's own order (manual, or by date). */
export type SortState = { key: string; dir: 1 | -1 } | null;
/** What each sortable column sorts by. A column without a sorter has a plain heading. */
export type Sorters<T> = Record<string, (row: T) => string | number | null | undefined>;

/** The sort for one list, remembered per list like its grouping. */
export function useSort(listId: string): [SortState, (s: SortState) => void] {
  return usePersisted<SortState>(`colsort:${listId}`, null);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Dropping rows into a list that is sorted by a column: the list switches to its own (manual) order without
 * anything jumping. The open rows' existing manual positions are handed out again in the order now on screen,
 * with the dragged rows taken out and put back at the drop line; returns each row's new position.
 */
export function bakeDrop<T>(
  groups: GridGroup<T>[],
  keyOf: (r: T) => string,
  sortOf: (r: T) => number,
  isOpen: (r: T) => boolean,
  keys: string[],
  beforeKey: string | null,
  groupKey: string,
): Map<string, number> {
  const all = groups.flatMap((g) => g.rows.filter(isOpen).map((r) => ({ r, g: g.key })));
  const slots = all.map((x) => sortOf(x.r)).sort((a, b) => a - b);
  const movers = keys.map((k) => all.find((x) => keyOf(x.r) === k)).filter((x): x is { r: T; g: string } => Boolean(x));
  const rest = all.filter((x) => !keys.includes(keyOf(x.r)));
  let at = beforeKey ? rest.findIndex((x) => keyOf(x.r) === beforeKey) : -1;
  if (at < 0) {
    // After the last open row of the drop group, or where that group starts when it has none.
    const last = rest.map((x) => x.g).lastIndexOf(groupKey);
    at = last >= 0 ? last + 1 : rest.findIndex((x) => groups.findIndex((g) => g.key === x.g) > groups.findIndex((g) => g.key === groupKey));
    if (at < 0) at = rest.length;
  }
  const order = [...rest.slice(0, at), ...movers, ...rest.slice(at)];
  return new Map(order.map((x, i) => [keyOf(x.r), slots[i]]));
}

/**
 * ⌥↑/⌥↓: every selected row steps one place within its own group, hopping the unselected row beside it. A block
 * already at the group's edge stays put, and the rows behind it close up against it. Returns the new sort value of
 * each row that changes (the open rows' existing values, reassigned in the new on-screen order), or null when
 * nothing can move.
 */
export function stepRows<T>(
  groups: GridGroup<T>[],
  keyOf: (r: T) => string,
  sortOf: (r: T) => number,
  isOpen: (r: T) => boolean,
  keys: string[],
  dir: -1 | 1,
): Map<string, number> | null {
  const picked = new Set(keys);
  let moved = false;
  const order = groups.flatMap((g) => {
    const rows = g.rows.filter(isOpen);
    const idx = dir < 0 ? rows.map((_, i) => i) : rows.map((_, i) => rows.length - 1 - i);
    for (const i of idx) {
      const j = i + dir;
      if (!picked.has(keyOf(rows[i])) || j < 0 || j >= rows.length || picked.has(keyOf(rows[j]))) continue;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      moved = true;
    }
    return rows;
  });
  if (!moved) return null;
  const slots = order.map(sortOf).sort((a, b) => a - b);
  const out = new Map<string, number>();
  order.forEach((r, i) => sortOf(r) !== slots[i] && out.set(keyOf(r), slots[i]));
  return out;
}

/** Sorts the rows inside each group (groups keep their own order). Empty values always go last, whichever way. */
export function sortGroups<T>(groups: GridGroup<T>[], sorters: Sorters<T>, sort: SortState): GridGroup<T>[] {
  const by = sort && sorters[sort.key];
  if (!sort || !by) return groups;
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  return groups.map((g) => ({
    ...g,
    rows: g.rows
      .map((row, i) => ({ row, i, v: by(row) }))
      .sort((a, b) => {
        if (empty(a.v) || empty(b.v)) return empty(a.v) === empty(b.v) ? a.i - b.i : empty(a.v) ? 1 : -1;
        const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : collator.compare(String(a.v), String(b.v));
        return c * sort.dir || a.i - b.i;
      })
      .map((x) => x.row),
  }));
}

/* ------------------------------------------------------------------ */
/* Keyboard list navigation (Outlook on the web grammar)                */
/* ------------------------------------------------------------------ */

export interface ListNav {
  focus: string | null;
  setFocus: (k: string | null) => void;
  /** A rectangle drag: ticks `keys` on top of `base`, puts the cursor on `focusKey`. */
  band: (base: Set<string>, keys: string[], focusKey: string | null) => void;
  /** A mouse click on a row: plain, ⇧ (range) or ⌘/Ctrl (tick). */
  click: (k: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  /** Rows an action applies to: the ticked rows, else the focused row. */
  targets: () => string[];
  commands: Command[];
  collapsed: Set<string>;
  toggleGroup: (g: string, open?: boolean) => void;
}

export function useListNav(
  listId: string,
  groups: { key: string; rowKeys: string[]; showHeader: boolean }[],
): ListNav {
  const [focus, setFocusState] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [collapsedArr, setCollapsed] = usePersisted<string[]>(`collapsed:${listId}`, []);
  const collapsed = useMemo(() => new Set(collapsedArr), [collapsedArr]);
  const lastIndex = useRef(0);

  const items = useMemo(() => {
    const out: string[] = [];
    for (const g of groups) {
      if (g.showHeader) out.push(groupKey(g.key));
      if (!collapsed.has(g.key) || !g.showHeader) out.push(...g.rowKeys);
    }
    return out;
  }, [groups, collapsed]);

  const rowOwner = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const r of g.rowKeys) m.set(r, g.key);
    return m;
  }, [groups]);

  // After ⌘Z, the cursor goes to the row that came back (if it is in this list).
  const restored = useRef<string[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      restored.current = (e as CustomEvent<string[]>).detail;
      window.setTimeout(() => (restored.current = []), 600); // only for the re-render the undo causes
    };
    window.addEventListener("gtd:undo", on);
    return () => window.removeEventListener("gtd:undo", on);
  }, []);

  // After rows vanish (done, moved, trashed) the cursor lands on the row that took their place.
  useEffect(() => {
    const back = restored.current.find((id) => items.includes(id));
    if (back) {
      restored.current = [];
      lastIndex.current = items.indexOf(back);
      if (back !== focus) setFocusState(back);
      return;
    }
    if (focus && items.includes(focus)) {
      lastIndex.current = items.indexOf(focus);
      return;
    }
    if (!items.length) {
      if (focus !== null) setFocusState(null);
      return;
    }
    const firstRow = items.findIndex((k) => !isGroupKey(k));
    const idx = focus ? Math.min(lastIndex.current, items.length - 1) : Math.max(firstRow, 0);
    setFocusState(items[idx]);
  }, [items, focus]);

  // Drop ticks on rows that no longer exist.
  useEffect(() => {
    if (![...selected].every((k) => items.includes(k))) {
      setSelected(new Set([...selected].filter((k) => items.includes(k))));
    }
  }, [items, selected]);

  useEffect(() => {
    if (!focus) return;
    const el = document.querySelector(`[data-list="${listId}"] [data-key="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focus, listId]);

  const setFocus = (k: string | null) => {
    setFocusState(k);
    if (k) lastIndex.current = Math.max(0, items.indexOf(k));
  };

  const move = (delta: number, extend = false) => {
    if (!items.length) return;
    const cur = focus ? items.indexOf(focus) : -1;
    const next = Math.max(0, Math.min(items.length - 1, cur + delta));
    const k = items[next];
    if (extend) selectRange(anchor ?? focus ?? k, k);
    else collapseSelection();
    setFocus(k);
  };

  /** Ticks every row from the anchor to `to`, as ⇧ does in Finder and Explorer. */
  const selectRange = (from: string, to: string) => {
    if (!anchor) setAnchor(from);
    const i1 = items.indexOf(from);
    const i2 = items.indexOf(to);
    setSelected(new Set(items.slice(Math.min(i1, i2), Math.max(i1, i2) + 1).filter(tickable)));
  };

  /** A plain move or click drops the selection, as in Finder and Explorer: the cursor row alone is the target again. */
  const collapseSelection = () => {
    setAnchor(null);
    if (selected.size) setSelected(new Set());
  };

  /** Mouse: a click selects just that row, ⇧-click extends from the anchor, ⌘-click (Ctrl elsewhere) ticks or unticks it. */
  const click = (k: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (e.shiftKey && tickable(k)) selectRange(anchor ?? focus ?? k, k);
    else if ((IS_MAC ? e.metaKey : e.ctrlKey) && tickable(k)) {
      const s = new Set(selected);
      // The first ⌘-click keeps the cursor row too, so it joins the selection instead of being dropped.
      if (!s.size && focus && tickable(focus) && focus !== k) s.add(focus);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      setSelected(s);
      setAnchor(k);
    } else collapseSelection();
    setFocus(k);
  };

  const toggleGroup = (g: string, open?: boolean) => {
    setCollapsed((prev) => {
      const s = new Set(prev);
      const shouldOpen = open ?? s.has(g);
      if (shouldOpen) s.delete(g);
      else s.add(g);
      return [...s];
    });
  };

  const page = () => Math.max(5, Math.floor((window.innerHeight - 160) / 30));

  // The keys view lists only what can act here: no row moves on an empty list, no ticking where nothing can be
  // ticked, no folding without groups. The keys still answer (so ⌘A never selects the page's text instead).
  const rowCount = items.filter((k) => !isGroupKey(k)).length;
  const tickCount = items.filter(tickable).length;
  const hasGroups = items.some(isGroupKey);
  const quiet = (cmds: Command[], when: boolean): Command[] => cmds.map((c) => ({ ...c, hidden: c.hidden || !when }));
  const commands: Command[] = [
    ...quiet(
      [
        { id: "nav.down", label: "Go to the next row", group: "Move", keys: ["arrowdown"], run: () => move(1) },
        { id: "nav.up", label: "Go to the previous row", group: "Move", keys: ["arrowup"], run: () => move(-1) },
        { id: "nav.first", label: "Go to the first row", group: "Move", keys: ["mod+arrowup", "home"], run: () => move(-1e6) },
        { id: "nav.last", label: "Go to the last row", group: "Move", keys: ["mod+arrowdown", "end"], run: () => move(1e6) },
        { id: "nav.pagedown", label: "Go down a page", group: "Move", keys: ["pagedown"], run: () => move(page()) },
        { id: "nav.pageup", label: "Go up a page", group: "Move", keys: ["pageup"], run: () => move(-page()) },
      ],
      rowCount > 1,
    ),
    ...quiet(
      [
        { id: "nav.extdown", label: "Extend selection down", group: "Select", keys: ["shift+arrowdown"], run: () => move(1, true) },
        { id: "nav.extup", label: "Extend selection up", group: "Select", keys: ["shift+arrowup"], run: () => move(-1, true) },
        { id: "nav.extfirst", label: "Extend selection to the first row", group: "Select", keys: ["shift+home", "mod+shift+arrowup"], run: () => move(-1e6, true) },
        { id: "nav.extlast", label: "Extend selection to the last row", group: "Select", keys: ["shift+end", "mod+shift+arrowdown"], run: () => move(1e6, true) },
        { id: "nav.extpagedown", label: "Extend selection a page down", group: "Select", keys: ["shift+pagedown"], run: () => move(page(), true) },
        { id: "nav.extpageup", label: "Extend selection a page up", group: "Select", keys: ["shift+pageup"], run: () => move(-page(), true) },
        {
          id: "nav.tick",
          label: "Tick or untick the row",
          group: "Select",
          keys: ["space"],
          run: () => {
            if (!focus || !tickable(focus)) return;
            const s = new Set(selected);
            if (s.has(focus)) s.delete(focus);
            else s.add(focus);
            setSelected(s);
            setAnchor(focus);
          },
        },
        {
          id: "nav.all",
          label: "Select all",
          group: "Select",
          keys: ["mod+a"],
          run: () => setSelected(new Set(items.filter(tickable))),
        },
      ],
      tickCount > 1,
    ),
    ...quiet(
      [
        {
          id: "nav.collapse",
          label: "Collapse group",
          group: "Move",
          keys: ["arrowleft"],
          run: () => {
            if (!focus) return;
            if (isGroupKey(focus)) toggleGroup(focus.slice(6), false);
            else {
              const g = rowOwner.get(focus);
              const header = g ? groupKey(g) : null;
              if (header && items.includes(header)) setFocus(header);
            }
          },
        },
        {
          id: "nav.expand",
          label: "Expand group",
          group: "Move",
          keys: ["arrowright"],
          run: () => {
            if (focus && isGroupKey(focus)) toggleGroup(focus.slice(6), true);
          },
        },
      ],
      hasGroups,
    ),
    {
      id: "nav.clear",
      label: "Clear selection",
      group: "Select",
      keys: ["escape"],
      enabled: selected.size > 0,
      run: () => setSelected(new Set()),
    },
  ];

  const targets = () => {
    if (selected.size) return [...selected];
    return focus && tickable(focus) ? [focus] : [];
  };

  const band = (base: Set<string>, keys: string[], focusKey: string | null) => {
    const hit = keys.filter(tickable);
    setSelected(new Set([...base, ...hit]));
    if (hit.length) setAnchor(hit[0]);
    if (focusKey) setFocus(focusKey);
  };

  return { focus, setFocus, click, band, selected, setSelected, targets, commands, collapsed, toggleGroup };
}

/* ------------------------------------------------------------------ */
/* Grid                                                                 */
/* ------------------------------------------------------------------ */

interface GridProps<T> {
  listId: string;
  columns: Column<T>[];
  groups: GridGroup<T>[];
  getKey: (row: T) => string;
  nav: ListNav;
  active: boolean;
  rowClass?: (row: T) => string;
  onOpen?: (key: string) => void;
  empty: ReactNode;
  showHeaders?: boolean;
  /** Column headings; off for lists whose rows explain themselves (Settings). */
  head?: boolean;
  /** Accessible name, when the view title alone doesn't say what the list is (e.g. a review step). */
  label?: string;
  /** Column sorting: the current sort, which column keys can sort, and what a heading click sets. */
  sort?: { state: SortState; keys: string[]; onSort: (s: SortState) => void };
  /**
   * Drag to reorder (the list is in its own, manual order): the dragged rows (the whole selection when the pressed
   * row is ticked, in list order) move before `beforeKey`, or to the end of the group's open rows; dropped into
   * another group, the view updates the field that group stands for on each of them.
   */
  /**
   * Touch: swipe a row sideways for its two most common actions (right: done, left: trash, say). The row follows the
   * finger over a band that names the action, and acts once pulled past a third of the way.
   */
  swipe?: { right?: { label: string; run: (key: string) => void }; left?: { label: string; run: (key: string) => void } };
  reorder?: {
    onMove: (keys: string[], beforeKey: string | null, groupKey: string) => void;
    canDrag?: (key: string) => boolean;
    /** Whether a row may be dropped into this group (e.g. never "No context" on Next Actions). */
    canDrop?: (groupKey: string) => boolean;
  };
}

/** DOM id for a row, so the focused grid can point screen readers at it. */
const rowDomId = (listId: string, key: string) => `r-${listId}-${key}`.replace(/[^A-Za-z0-9_-]/g, "_");

export function Grid<T>({ listId, columns: allColumns, groups, getKey, nav, active, rowClass, onOpen, empty, showHeaders, head = true, label, sort, reorder, swipe }: GridProps<T>) {
  const box = useRef<HTMLDivElement>(null);
  // Shed the least useful columns rather than scroll sideways when space runs out.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Columns can be put in any order, per list, and the order is remembered. The unlabelled columns at the start
  // (marker, done box, kind icon) stay where they are: they belong to the row, not to the data.
  const [colOrder, setColOrder] = usePersisted<string[]>(`colorder:${listId}`, []);
  const lead = useMemo(() => {
    const i = allColumns.findIndex((c) => c.label);
    return i < 0 ? allColumns.length : i;
  }, [allColumns]);
  // Which columns show, per list: every column can be hidden except the first named one (the subject), and optional
  // ones can be shown. Remembered as overrides of each column's default.
  const [colShow, setColShow] = usePersisted<Record<string, boolean>>(`colshow:${listId}`, {});
  const lockedKey = allColumns[lead]?.key;
  const isShown = (c: Column<T>) => c.key === lockedKey || (colShow[c.key] ?? !c.optional);
  const ordered = useMemo(() => {
    const fixed = allColumns.slice(0, lead);
    const rank = (c: Column<T>, i: number) => {
      const at = colOrder.indexOf(c.key);
      return at < 0 ? 1000 + i : at;
    };
    const movable = allColumns.slice(lead).map((c, i) => ({ c, r: rank(c, i) })).sort((a, b) => a.r - b.r).map((x) => x.c);
    return [...fixed, ...movable];
  }, [allColumns, colOrder, lead]);
  const toggleable = ordered.slice(lead).filter((c) => c.key !== lockedKey);
  const chooseColumns = (current?: string, at?: { x: number; y: number }) =>
    ui.openPicker({
      type: "list",
      title: "Show columns",
      at,
      items: toggleable.map((c) => ({ id: c.key, label: c.label, hint: !isShown(c) ? "Hidden" : blankKeys.has(c.key) ? "Shown when filled" : "Shown", section: "columns" })),
      current: current ?? null,
      onPick: (key) => {
        if (!key) return;
        const c = toggleable.find((x) => x.key === key);
        if (!c) return;
        setColShow((m) => ({ ...m, [key]: !isShown(c) }));
        // The picker comes back on the same column, so several can be switched in a row.
        window.setTimeout(() => chooseColumns(key, at), 0);
      },
    });
  // A column no row has anything in (Files in an Inbox of notes, Follow up when nothing needs chasing) steps aside
  // instead of showing a column of blanks; it comes back with the first value.
  const blankKeys = useMemo(() => {
    const rows = groups.flatMap((g) => g.rows);
    return new Set(rows.length ? allColumns.filter((c) => c.blank && rows.every(c.blank)).map((c) => c.key) : []);
  }, [groups, allColumns]);
  const visible = useMemo(() => ordered.filter((c, i) => i < lead || (isShown(c) && !blankKeys.has(c.key))), [ordered, lead, colShow, blankKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const movableKeys = visible.slice(lead).map((c) => c.key);
  const moveColumn = (key: string, to: number) => {
    const keys = movableKeys.filter((k) => k !== key);
    keys.splice(Math.max(0, Math.min(to, keys.length)), 0, key);
    setColOrder(keys);
  };
  const ui = useUI();
  // The columns on screen right now (after narrow lists shed some), for the resize handlers defined before them.
  const columnsRef = useRef<Column<T>[]>([]);
  const leadOf = (cs: Column<T>[]) => {
    const i = cs.findIndex((c) => c.label);
    return i < 0 ? cs.length : i;
  };
  const colName = (k: string) => {
    const c = ordered.find((x) => x.key === k);
    return typeof c?.label === "string" && c.label ? c.label : k;
  };

  // Column widths, per list: drag the edge of a heading, double-click the edge to fit the contents, or Resize columns…
  // from the keyboard. Kept as px overrides of each column's own width; the subject always takes the room left over.
  const [colWidth, setColWidth] = usePersisted<Record<string, number>>(`colwidth:${listId}`, {});
  const [liveWidth, setLiveWidth] = useState<{ key: string; px: number } | null>(null);
  const widthOf = (c: Column<T>) => {
    if (c.label === "" || isFlexible(c.width)) return c.width;
    const px = liveWidth?.key === c.key ? liveWidth.px : colWidth[c.key];
    return px === undefined ? c.width : `${px}px`;
  };
  const setColumnWidth = (key: string, px: number | null) =>
    setColWidth((m) => {
      const next = { ...m };
      if (px === null) delete next[key];
      else next[key] = clampCol(px);
      return next;
    });
  const headCell = (key: string) => box.current?.querySelector<HTMLElement>(`.grid-head .gh[data-col="${CSS.escape(key)}"]`) ?? null;
  const renderedWidth = (key: string) => Math.round(headCell(key)?.getBoundingClientRect().width ?? 0);
  /** The widest the column's heading or any of its cells wants to be, so nothing in it is cut off. */
  const fitWidth = (key: string) => {
    const el = box.current;
    if (!el) return null;
    let w = 0;
    const measure = (cell: HTMLElement) => {
      // A cell's content can be narrower than the cell (a date, a tile): measure what it holds, plus its padding.
      const cs = getComputedStyle(cell);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      let inner = 0;
      for (const ch of cell.children) inner += (ch as HTMLElement).scrollWidth || ch.getBoundingClientRect().width;
      if (!cell.children.length) {
        const r = document.createRange();
        r.selectNodeContents(cell);
        inner = r.getBoundingClientRect().width;
      }
      w = Math.max(w, Math.ceil(inner + pad));
    };
    const h = headCell(key);
    if (h) measure(h.querySelector<HTMLElement>(".gh-sort")?.parentElement ?? h);
    el.querySelectorAll<HTMLElement>(`.row .cell.c-${CSS.escape(key)}`).forEach(measure);
    return w ? clampCol(w + 2) : null;
  };

  // Resizing from the keyboard: pick a column, then ← → set its width until ↵ keeps it or Esc puts it back.
  const [resizing, setResizing] = useState<{ key: string; before: Record<string, number> } | null>(null);
  const resizable = (cs: Column<T>[]) => cs.filter((c, i) => i >= leadOf(cs) && c.label !== "" && !isFlexible(c.width));
  const resizeBy = (d: number) => {
    if (!resizing) return;
    const now = colWidth[resizing.key] ?? renderedWidth(resizing.key);
    setColumnWidth(resizing.key, now + d);
  };
  const resizeStep = (dir: 1 | -1) => {
    if (!resizing) return;
    const keys = resizable(columnsRef.current).map((c) => c.key);
    const i = keys.indexOf(resizing.key);
    const next = keys[(i + dir + keys.length) % keys.length];
    if (next) setResizing({ ...resizing, key: next });
  };
  const chooseResize = () =>
    ui.openPicker({
      type: "list",
      title: "Resize which column?",
      items: [
        ...resizable(columnsRef.current).map((c) => ({ id: c.key, label: colName(c.key), hint: `${renderedWidth(c.key)} px`, section: "columns" })),
        ...(Object.keys(colWidth).length ? [{ id: "__reset", label: "Reset column widths", section: "reset" }] : []),
      ],
      onPick: (key) => {
        if (!key) return;
        if (key === "__reset") return setColWidth({});
        setResizing({ key, before: colWidth });
      },
    });
  useCommands(
    `grid-resize:${listId}`,
    [
      { id: "grid.resize.wider", label: "Make it wider", group: "Column width", keys: ["arrowright"], run: () => resizeBy(8) },
      { id: "grid.resize.narrower", label: "Make it narrower", group: "Column width", keys: ["arrowleft"], run: () => resizeBy(-8) },
      { id: "grid.resize.wider1", label: "Make it a pixel wider", group: "Column width", keys: ["shift+arrowright"], run: () => resizeBy(1) },
      { id: "grid.resize.narrower1", label: "Make it a pixel narrower", group: "Column width", keys: ["shift+arrowleft"], run: () => resizeBy(-1) },
      { id: "grid.resize.next", label: "Go to the next column", group: "Column width", keys: ["tab"], run: () => resizeStep(1) },
      { id: "grid.resize.prev", label: "Go to the previous column", group: "Column width", keys: ["shift+tab"], run: () => resizeStep(-1) },
      {
        id: "grid.resize.fit",
        label: "Fit it to its contents",
        group: "Column width",
        keys: ["f"],
        run: () => {
          const w = resizing && fitWidth(resizing.key);
          if (resizing && w) setColumnWidth(resizing.key, w);
        },
      },
      { id: "grid.resize.default", label: "Restore its default width", group: "Column width", keys: ["0"], run: () => resizing && setColumnWidth(resizing.key, null) },
      { id: "grid.resize.done", label: "Keep these widths", group: "Column width", keys: ["enter"], run: () => setResizing(null) },
      {
        id: "grid.resize.cancel",
        label: "Cancel",
        group: "Column width",
        keys: ["escape"],
        run: () => {
          if (resizing) setColWidth(resizing.before);
          setResizing(null);
        },
      },
    ],
    { priority: 60, exclusive: true, active: active && resizing !== null },
  );
  // The list changing under the mode (another view, the column hidden) ends it, keeping what was set.
  useEffect(() => {
    if (resizing && (!active || !visible.some((c) => c.key === resizing.key))) setResizing(null);
  }, [active, resizing, visible]);

  // Drag the edge of a heading. Between a set-width column and the next, the edge sizes the column on its left; the
  // subject's right edge sizes the column after it instead (dragging it left widens that one), since the subject
  // only ever takes what is left.
  const edgeTarget = (i: number): { key: string; sign: 1 | -1 } | null => {
    const cs = columnsRef.current;
    const c = cs[i];
    if (!c || i < leadOf(cs) || c.label === "") return null;
    if (!isFlexible(c.width)) return { key: c.key, sign: 1 };
    const n = cs[i + 1];
    return n && n.label !== "" && !isFlexible(n.width) ? { key: n.key, sign: -1 } : null;
  };
  const startResize = (e: React.MouseEvent, i: number) => {
    const t = edgeTarget(i);
    if (e.button !== 0 || !t) return;
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = renderedWidth(t.key);
    let last = w0;
    document.body.classList.add("is-col-resizing");
    const move = (ev: MouseEvent) => {
      last = clampCol(w0 + t.sign * (ev.clientX - x0));
      setLiveWidth({ key: t.key, px: last });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("is-col-resizing");
      setLiveWidth(null);
      if (last !== w0) setColumnWidth(t.key, last);
      // Letting go over a heading is not a click on it: don't let it sort.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  /** Under the column being sized: from its left edge, or up to its right edge when it sits in the right half. */
  const hintsPlace = (key: string) => {
    const cell = headCell(key);
    const row = cell?.parentElement;
    if (!cell || !row) return { left: 0 };
    return cell.offsetLeft + cell.offsetWidth / 2 > row.clientWidth / 2
      ? { right: Math.max(0, row.clientWidth - cell.offsetLeft - cell.offsetWidth) }
      : { left: cell.offsetLeft };
  };
  const fitEdge = (i: number) => {
    const t = edgeTarget(i);
    const w = t && fitWidth(t.key);
    if (t && w) setColumnWidth(t.key, w);
  };
  useCommands(
    `grid-cols:${listId}`,
    [
      ...(toggleable.length ? [{ id: "grid.columns", label: "Show or hide columns…", group: "View", run: () => chooseColumns() }] : []),
      ...(movableKeys.length > 1
      ? [
          {
            id: "grid.arrange",
            label: "Arrange columns…",
            group: "View",
            run: () =>
              ui.openPicker({
                type: "list",
                title: "Move which column?",
                items: [
                  ...movableKeys.map((k, i) => ({ id: k, label: colName(k), hint: `Column ${i + 1}`, section: "columns" })),
                  ...(colOrder.length ? [{ id: "__reset", label: "Reset column order", section: "reset" }] : []),
                ],
                onPick: (key) => {
                  if (!key) return;
                  if (key === "__reset") return setColOrder([]);
                  const others = movableKeys.filter((k) => k !== key);
                  ui.openPicker({
                    type: "list",
                    title: `Put ${colName(key)}…`,
                    items: [...others.map((k, i) => ({ id: String(i), label: `Before ${colName(k)}` })), { id: String(others.length), label: "At the end" }],
                    onPick: (to) => to !== null && moveColumn(key, Number(to)),
                  });
                },
              }),
          },
        ]
      : []),
      ...(resizable(visible).length ? [{ id: "grid.resize", label: "Resize columns…", group: "View", run: chooseResize }] : []),
      ...(Object.keys(colWidth).length ? [{ id: "grid.resize.reset", label: "Reset column widths", group: "View", run: () => setColWidth({}) }] : []),
    ],
    { priority: 5, active },
  );
  // Drag a heading sideways to move its column; a click without a drag still sorts.
  const [colDrop, setColDrop] = useState<number | null>(null);
  const [colDragging, setColDragging] = useState<string | null>(null);
  const startColDrag = (e: { button: number; clientX: number; clientY: number; stopPropagation: () => void; preventDefault: () => void; currentTarget: HTMLElement }, key: string) => {
    if (e.button !== 0 || !movableKeys.includes(key)) return;
    e.stopPropagation();
    const head = e.currentTarget.closest<HTMLElement>(".grid-head");
    if (!head) return;
    const x0 = e.clientX;
    let dragging = false;
    let to = -1;
    const cells = () => [...head.querySelectorAll<HTMLElement>(".gh[data-col]")].filter((el) => movableKeys.includes(el.dataset.col!));
    const move = (ev: MouseEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - x0) < 6) return;
        dragging = true;
        setColDragging(key);
        document.body.classList.add("is-col-dragging");
      }
      ev.preventDefault();
      const cs = cells();
      const others = cs.filter((el) => el.dataset.col !== key);
      let i = others.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return ev.clientX < r.left + r.width / 2;
      });
      if (i < 0) i = others.length;
      to = i;
      const hr = head.getBoundingClientRect();
      const ref = others[i] ?? others[others.length - 1];
      const rr = ref?.getBoundingClientRect();
      setColDrop(rr ? (others[i] ? rr.left : rr.right) - hr.left : null);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("is-col-dragging");
      setColDrop(null);
      setColDragging(null);
      if (!dragging) return;
      if (to >= 0) moveColumn(key, to);
      // The drag isn't a click: don't let it sort.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const sized = useMemo(() => visible.map((c) => ({ ...c, width: widthOf(c) })), [visible, colWidth, liveWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns = useMemo(() => {
    const visible = sized;
    if (!width) return visible;
    // On a phone-width list, keep what identifies a row: its marker (flag, lamp), the subject with all the remaining
    // room, and one date or value column. The done box and the kind icon go (owner's request: room for the text; a
    // swipe right does what the box did). Chosen by what the columns are, never by their position.
    if (width < 560) {
      const lead = visible.slice(0, visible.findIndex((c) => c.label) < 0 ? 0 : visible.findIndex((c) => c.label)).filter((c) => !COMPACT_HIDE.includes(c.key));
      const subject = visible.find((c) => c.key === lockedKey);
      const tail = COMPACT_TAIL.map((k) => visible.find((c) => c.key === k)).find(Boolean);
      return [...lead, ...(subject ? [{ ...subject, width: "minmax(0, 1fr)" }] : []), ...(tail ? [tail] : [])];
    }
    let cols = visible;
    const need = (cs: Column<T>[]) => cs.reduce((n, c) => n + minWidth(c.width), 0) + 16;
    const order = visible.filter((c) => c.drop !== undefined).sort((a, b) => a.drop! - b.drop!);
    for (const c of order) {
      if (need(cols) <= width) break;
      cols = cols.filter((x) => x !== c);
    }
    return cols;
  }, [sized, width]); // eslint-disable-line react-hooks/exhaustive-deps
  columnsRef.current = columns;
  const template = columns.map((c) => c.width).join(" ");

  // Rectangle select: press and drag over the rows, as on a Finder or Explorer desktop. Rows the band touches are ticked
  // (added to the selection with ⌘/Ctrl held); near the list's top or bottom edge it scrolls. A press without a drag stays a click.
  const [bandRect, setBandRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const navRef = useRef(nav);
  navRef.current = nav;
  const startBand = (x0: number, y0: number, additive: boolean, onEmpty: boolean) => {
    const el = box.current;
    const scroller = el?.closest<HTMLElement>(".list-region") ?? el?.parentElement;
    if (!el || !scroller) return;
    const base = additive ? new Set(navRef.current.selected) : new Set<string>();
    // A band started inside the list keeps its anchor on the content as it scrolls; one started above it stays put.
    const sr0 = scroller.getBoundingClientRect();
    const anchored = y0 >= sr0.top && y0 <= sr0.bottom;
    const startTop = scroller.scrollTop;
    let lastX = x0;
    let lastY = y0;
    let dragging = false;
    let raf = 0;

    const update = () => {
      const sr = scroller.getBoundingClientRect();
      // The band lives in the main column: from the rail's edge to the detail pane's (or the window's), top bar to bottom.
      const main = el.closest(".main")?.getBoundingClientRect() ?? sr;
      const detail = document.querySelector(".work .detail")?.getBoundingClientRect();
      const colLeft = main.left;
      const colRight = detail ? detail.left : main.right;
      const colTop = main.top;
      const colBottom = main.bottom;
      const px = Math.max(colLeft, Math.min(colRight - 1, lastX));
      const py = Math.max(colTop, Math.min(colBottom - 1, lastY));
      // The start point moves with the content when the list scrolls under the band, but never out of the column.
      const sy = Math.max(colTop, anchored ? y0 - (scroller.scrollTop - startTop) : y0);
      const top = Math.min(sy, py);
      const bottom = Math.max(sy, py);
      const left = Math.min(x0, px);
      const right = Math.max(x0, px);
      setBandRect({ x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) });
      const keys: string[] = [];
      el.querySelectorAll<HTMLElement>(".row[data-key]").forEach((r) => {
        const rr = r.getBoundingClientRect();
        if (rr.bottom > top && rr.top < bottom && rr.right > left && rr.left < right) keys.push(r.dataset.key!);
      });
      // The cursor goes to the row the band reached last: the bottom one dragging down, the top one dragging up,
      // wherever the pointer is let go (on a row or on empty space).
      const up = py < sy;
      const ticked = keys.filter((k) => !k.startsWith("group:"));
      navRef.current.band(base, keys, (up ? ticked[0] : ticked[ticked.length - 1]) ?? null);
      // Edge scrolling: the closer to the edge, the faster.
      const edge = 28;
      const dy = lastY < sr.top + edge ? -(sr.top + edge - lastY) : lastY > sr.bottom - edge ? lastY - (sr.bottom - edge) : 0;
      if (dy) {
        scroller.scrollTop += Math.max(-18, Math.min(18, dy / 2));
        raf = requestAnimationFrame(update);
      } else raf = 0;
    };
    const move = (ev: MouseEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.hypot(lastX - x0, lastY - y0) < 5) return;
        dragging = true;
        document.body.classList.add("is-banding");
      }
      window.getSelection()?.removeAllRanges();
      if (!raf) raf = requestAnimationFrame(update);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      cancelAnimationFrame(raf);
      // A click on empty space, as on a desktop, lets go of the selection.
      if (!dragging) {
        if (onEmpty && !additive) navRef.current.band(new Set(), [], null);
        return;
      }
      document.body.classList.remove("is-banding");
      setBandRect(null);
      // The mouseup would also count as a click on the row under it; that click must not undo the band.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const startBandRef = useRef(startBand);
  startBandRef.current = startBand;

  // Drag to reorder, as in Finder: press on a row and drag; a line shows where it lands. Only inside its own group,
  // never onto done rows (they stay at the bottom). A press without a drag stays a click.
  const [dropLine, setDropLine] = useState<{ x: number; y: number; w: number } | null>(null);
  const [dragging, setDragging] = useState<Set<string>>(new Set());
  const reorderRef = useRef(reorder);
  reorderRef.current = reorder;
  const startDrag = (key: string, rowEl: HTMLElement, x0: number, y0: number) => {
    const el = box.current;
    const scroller = el?.closest<HTMLElement>(".list-region") ?? el?.parentElement;
    const homeEl = rowEl.closest<HTMLElement>(".grid-group");
    if (!el || !scroller || !homeEl) return;
    const home = homeEl.dataset.group ?? "";
    const can = (k: string) => reorderRef.current?.canDrag?.(k) !== false;
    // Pressing a ticked row drags every ticked row with it, as in Finder; otherwise just the one.
    const sel = navRef.current.selected;
    const inOrder = [...el.querySelectorAll<HTMLElement>(".row[data-key]")].map((r) => r.dataset.key!);
    const keys = sel.size > 1 && sel.has(key) ? inOrder.filter((k) => sel.has(k) && can(k)) : [key];
    const moving = new Set(keys);
    let dragging = false;
    let lastY = y0;
    let target: { group: string; before: string | null } | null = null;
    let raf = 0;
    const update = () => {
      // The group under the pointer (or the nearest one above or below the list), then the gap inside it.
      const groupEls = [...el.querySelectorAll<HTMLElement>(".grid-group")];
      const g =
        groupEls.find((x) => {
          const r = x.getBoundingClientRect();
          return lastY >= r.top && lastY < r.bottom;
        }) ?? (lastY < (groupEls[0]?.getBoundingClientRect().top ?? 0) ? groupEls[0] : groupEls[groupEls.length - 1]);
      const gk = g?.dataset.group ?? "";
      if (!g || (gk !== home && reorderRef.current?.canDrop?.(gk) === false)) {
        target = null;
        setDropLine(null);
      } else {
        const rows = [...g.querySelectorAll<HTMLElement>(".row[data-key]")].filter((r) => !moving.has(r.dataset.key!) && can(r.dataset.key!));
        const hit = rows.find((r) => {
          const rr = r.getBoundingClientRect();
          return lastY < rr.top + rr.height / 2;
        });
        target = { group: gk, before: hit ? hit.dataset.key! : null };
        const ref = hit ?? rows[rows.length - 1] ?? (gk === home ? rowEl : null) ?? g.querySelector<HTMLElement>(".group-head") ?? g;
        const rr = ref.getBoundingClientRect();
        const gr = (g.querySelector(".row, .group-head") ?? g).getBoundingClientRect();
        setDropLine({ x: gr.left, w: gr.width, y: hit ? rr.top : rr.bottom });
      }
      const sr = scroller.getBoundingClientRect();
      const edge = 28;
      const dy = lastY < sr.top + edge ? -(sr.top + edge - lastY) : lastY > sr.bottom - edge ? lastY - (sr.bottom - edge) : 0;
      if (dy) {
        scroller.scrollTop += Math.max(-18, Math.min(18, dy / 2));
        raf = requestAnimationFrame(update);
      } else raf = 0;
    };
    const move = (ev: MouseEvent) => {
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.hypot(ev.clientX - x0, lastY - y0) < 5) return;
        dragging = true;
        setDragging(moving);
        document.body.classList.add("is-banding", "is-dragging-row");
      }
      window.getSelection()?.removeAllRanges();
      if (!raf) raf = requestAnimationFrame(update);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      cancelAnimationFrame(raf);
      if (!dragging) return;
      document.body.classList.remove("is-banding", "is-dragging-row");
      setDropLine(null);
      setDragging(new Set());
      if (target) {
        // Dropping a single row where it already was changes nothing.
        const rows = [...homeEl.querySelectorAll<HTMLElement>(".row[data-key]")].filter((r) => can(r.dataset.key!));
        const i = rows.findIndex((r) => r.dataset.key === key);
        const nextNow = rows[i + 1]?.dataset.key ?? null;
        const same = keys.length === 1 && target.group === home && (target.before === nextNow || target.before === key);
        if (!same) reorderRef.current?.onMove(keys, target.before, target.group);
      }
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const startDragRef = useRef(startDrag);
  startDragRef.current = startDrag;

  // The band can start anywhere in the main column: on a row, in the empty space around and below the list, on the
  // view title or the top bar. Not on the rail, the detail pane, a field, a button or an open picker.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = box.current;
      if (!el || e.button !== 0) return;
      // A finger scrolls and taps; rectangle select and drag to reorder are for the mouse.
      if (pressedByTouch()) return;
      if (document.querySelector(".list-region .grid") !== el) return; // one list owns the page: the first in the list region
      const t = e.target as HTMLElement;
      if (!t.closest(".main") || t.closest(".detail, .picker, .overlay, .toast, .tabbar")) return;
      if (isEditable(t) || t.closest("button, a, input, textarea, select, label, [role=button], .chev")) return;
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      const onRow = Boolean(t.closest(".row, .group-head"));
      // A press on text outside the rows (the view title, its count, an empty state's words) selects that text, as
      // anywhere else; the band starts from empty space. Rows stay items: they drag or draw the band.
      if (!onRow && !mod && !e.shiftKey && overText(e.clientX, e.clientY)) return;
      // ⇧-click and ⌘/Ctrl-click select rows, as in Finder; the browser would otherwise select the text between the clicks.
      if ((e.shiftKey || mod) && onRow) {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
      }
      // In manual order a row drags to a new place; elsewhere (and from empty space) the press draws the band.
      const rowEl = t.closest<HTMLElement>(".row[data-key]");
      const key = rowEl?.dataset.key;
      if (!e.shiftKey && !mod && rowEl && key && reorderRef.current && reorderRef.current.canDrag?.(key) !== false) {
        startDragRef.current(key, rowEl, e.clientX, e.clientY);
        return;
      }
      if (!e.shiftKey) startBandRef.current(e.clientX, e.clientY, mod, !onRow);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);
  // Swipe a row (touch): the cells follow the finger over a band naming the action; past a third of the row it acts.
  const swipedRef = useRef(false);
  const swipeRef = useRef(swipe);
  swipeRef.current = swipe;
  const startSwipe = (e: { clientX: number; clientY: number; currentTarget: HTMLElement; pointerId: number }, key: string) => {
    const row = e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let dx = 0;
    let on = false;
    swipedRef.current = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const mx = ev.clientX - x0;
      const my = ev.clientY - y0;
      if (!on) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return end();
        if (Math.abs(mx) < 12) return;
        const side = mx > 0 ? swipeRef.current?.right : swipeRef.current?.left;
        if (!side) return;
        on = true;
      }
      const side = mx > 0 ? swipeRef.current?.right : swipeRef.current?.left;
      dx = side ? mx : 0;
      const past = Math.abs(dx) > row.offsetWidth / 3;
      row.classList.add("is-swiping");
      row.classList.toggle("swipe-right", dx > 0);
      row.classList.toggle("swipe-left", dx < 0);
      row.classList.toggle("swipe-armed", past);
      row.dataset.swipe = side?.label ?? "";
      row.style.setProperty("--dx", `${dx}px`);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", end);
      row.classList.remove("is-swiping", "swipe-right", "swipe-left", "swipe-armed");
      row.style.removeProperty("--dx");
    };
    const up = () => {
      const act = Math.abs(dx) > row.offsetWidth / 3 ? (dx > 0 ? swipeRef.current?.right : swipeRef.current?.left) : undefined;
      if (on) {
        swipedRef.current = true;
        window.setTimeout(() => (swipedRef.current = false), 0);
      }
      end();
      act?.run(key);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", end);
  };

  // The grid holds real keyboard focus while its region is active, so screen readers follow the cursor.
  useEffect(() => {
    if (!active || !box.current) return;
    const el = document.activeElement;
    const busy = el && el !== document.body && (isEditable(el) || el.closest(".picker, .palette, .overlay, .detail"));
    if (!busy && !box.current.contains(el)) box.current.focus({ preventScroll: true });
  }, [active, listId]);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const multi = showHeaders ?? groups.length > 1;
  // An empty list (Inbox zero, a search with no hits) is not a grid of nothing: it is a plain group that still takes
  // focus, and its empty state is announced. A list with an empty state shows it even when its groups are fixed
  // (Someday's Projects and Actions, Horizons' three): headings over nothing are scaffolding, not content.
  const isEmpty = total === 0 && (Boolean(empty) || !groups.some((g) => multi && g.label));
  const showHead = head && !isEmpty && (total > 0 || (multi && groups.some((g) => g.label)));
  return (
    <div
      ref={box}
      className={`grid ${active ? "is-active" : ""} ${width && width < 560 ? "is-compact" : ""}`}
      // Text cut short with an ellipsis (a long project, subject or next action) shows in full on hover: the first
      // clipped element under the pointer, up to its cell, takes its own text as a title.
      onMouseOver={(e) => {
        let el = e.target as HTMLElement | null;
        while (el && el !== e.currentTarget) {
          if (el.scrollWidth > el.clientWidth + 1) {
            if (!el.title) el.title = el.innerText.trim();
            return;
          }
          if (el.classList.contains("cell")) return;
          el = el.parentElement;
        }
      }}
      data-list={listId}
      // A treegrid, so a group heading can say whether it is open (aria-expanded is only valid on a row there).
      role={isEmpty ? "group" : "treegrid"}
      aria-labelledby={label ? undefined : "view-title"}
      aria-label={label}
      aria-multiselectable={isEmpty ? undefined : "true"}
      aria-rowcount={isEmpty ? undefined : total + (multi ? groups.filter((g) => g.label).length : 0) + (showHead ? 1 : 0)}
      aria-activedescendant={!isEmpty && nav.focus ? rowDomId(listId, nav.focus) : undefined}
      tabIndex={active ? 0 : -1}
      style={{ ["--cols" as string]: template }}
    >
      {bandRect && <div className="band" style={{ left: bandRect.x, top: bandRect.y, width: bandRect.w, height: bandRect.h }} aria-hidden />}
      {dropLine && <div className="drop-line" style={{ left: dropLine.x, top: dropLine.y - 1, width: dropLine.w }} aria-hidden />}
      {/* No column headings over an empty list: they would label nothing. */}
      {showHead && (
        <div
          className="grid-head"
          role="row"
          title={toggleable.length ? "Right-click to show or hide columns" : undefined}
          onContextMenu={(e) => {
            if (!toggleable.length) return;
            e.preventDefault();
            chooseColumns(undefined, { x: e.clientX, y: e.clientY });
          }}
        >
          {colDrop !== null && <span className="col-drop" style={{ left: colDrop }} aria-hidden />}
          {resizing && (
            <div className="col-resize-hints" style={hintsPlace(resizing.key)} role="status">
              <span className="crh-what">
                {colName(resizing.key)} · {colWidth[resizing.key] ?? renderedWidth(resizing.key)} px
              </span>
              <KeyHints
                hints={[
                  { k: "arrowright", label: "Wider" },
                  { k: "arrowleft", label: "Narrower" },
                  { k: "tab", label: "Next" },
                  { k: "f", label: "Fit" },
                  { k: "0", label: "Default" },
                  { k: "enter", label: "Keep" },
                  { k: "escape", label: "Cancel" },
                ]}
              />
            </div>
          )}
          {columns.map((c, i) => {
            const name = c.label || c.sortName || "";
            const sortable = Boolean(sort && name && sort.keys.includes(c.key));
            const on = sortable && sort!.state?.key === c.key ? sort!.state!.dir : 0;
            return (
              <div
                key={c.key}
                role="columnheader"
                aria-sort={on === 1 ? "ascending" : on === -1 ? "descending" : sortable ? "none" : undefined}
                data-col={c.key}
                className={`gh gh-${c.key} ${c.align === "end" ? "end" : ""} ${on ? "is-sorted" : ""} ${movableKeys.includes(c.key) ? "is-movable" : ""} ${colDragging === c.key ? "is-dragging" : ""} ${resizing?.key === c.key || liveWidth?.key === c.key ? "is-resizing" : ""}`}
                onMouseDown={(e) => movableKeys.includes(c.key) && startColDrag(e, c.key)}
              >
                {sortable ? (
                  // Click: ascending, again: descending, a third time: back to the list's own order.
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`gh-sort ${c.label ? "" : "is-icon"}`}
                    aria-label={c.label ? undefined : `Sort by ${name.toLowerCase()}`}
                    title={on === 1 ? `Sorted by ${name.toLowerCase()}, A–Z: click for Z–A` : on === -1 ? `Sorted by ${name.toLowerCase()}, Z–A: click for the list's own order` : `Sort by ${name.toLowerCase()}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      startColDrag({ ...e, currentTarget: e.currentTarget.parentElement as HTMLElement, stopPropagation: () => {}, preventDefault: () => {} }, c.key);
                    }}
                    onClick={() => sort!.onSort(on === 0 ? { key: c.key, dir: 1 } : on === 1 ? { key: c.key, dir: -1 } : null)}
                  >
                    {c.label || c.headIcon}
                    <svg className="gh-arrow" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                      <path d={on === -1 ? "M2 3.5l3 3 3-3" : "M2 6.5l3-3 3 3"} />
                    </svg>
                  </button>
                ) : c.label ? (
                  c.label
                ) : (
                  // The unlabelled lead columns still name themselves to screen readers.
                  <span className="visually-hidden">{LEAD_NAME[c.key] ?? c.key}</span>
                )}
                {edgeTarget(i) && (
                  <span
                    className="gh-edge"
                    aria-hidden="true"
                    title="Drag to resize · double-click to fit"
                    onMouseDown={(e) => startResize(e, i)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      fitEdge(i);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {isEmpty ? (
        <div className="grid-empty" role="status">
          {empty}
        </div>
      ) : (
        groups.map((g) => {
          const gk = groupKey(g.key);
          const collapsed = nav.collapsed.has(g.key);
          return (
            <div key={g.key} role="rowgroup" className="grid-group" data-group={g.key}>
              {multi && (
                <div
                  role="row"
                  id={rowDomId(listId, gk)}
                  aria-expanded={!collapsed}
                  aria-label={`${g.label || "Group"}, ${g.rows.length} ${g.rows.length === 1 ? "item" : "items"}`}
                  data-key={gk}
                  data-focused={nav.focus === gk || undefined}
                  className={`group-head ${nav.focus === gk ? "is-focus" : ""}`}
                  onClick={(e) => {
                    nav.click(gk, e);
                    nav.toggleGroup(g.key);
                  }}
                >
                  {/* One cell spanning the row, so the heading is a proper row with a cell (display: contents keeps the look). */}
                  <div role="gridcell" aria-colspan={columns.length} className="group-cell">
                  <span className={`chev ${collapsed ? "" : "open"}`} aria-hidden />
                  {/* One look for every list's group heads (owner's decision): Label Caps over a rule, then the count. */}
                  <span className={`group-label ${g.color ? "is-ctx" : ""} ${g.areaColor !== undefined ? "is-area" : ""}`}>
                    {g.color && g.label.startsWith("@") ? (
                      <>
                        <span className="named-tile" style={{ ["--tile" as string]: g.color }}>@</span>
                        {g.label.slice(1)}
                      </>
                    ) : g.areaColor !== undefined && g.label.startsWith("#") ? (
                      <>
                        <span className="named-tile" style={g.areaColor ? { ["--tile" as string]: g.areaColor } : undefined}>#</span>
                        {g.label.slice(1)}
                      </>
                    ) : (
                      g.label
                    )}
                  </span>
                  {!g.hideCount && <span className="group-count">{g.rows.length}</span>}
                  {g.meta && <span className="group-meta">{g.meta}</span>}
                  </div>
                </div>
              )}
              {(!collapsed || !multi) &&
                g.rows.map((row) => {
                  const k = getKey(row);
                  const focused = nav.focus === k;
                  const ticked = nav.selected.has(k);
                  return (
                    <div
                      key={k}
                      role="row"
                      id={rowDomId(listId, k)}
                      aria-selected={ticked}
                      data-key={k}
                      data-focused={focused || undefined}
                      className={`row ${focused ? "is-focus" : ""} ${ticked ? "is-ticked" : ""} ${dragging.has(k) ? "is-dragging" : ""} ${rowClass?.(row) ?? ""}`}
                      onClick={(e) => {
                        if (swipedRef.current) return;
                        nav.click(k, e);
                        // A tap opens the row on a touch screen, where there is no Enter and no double-click.
                        if (pressedByTouch() && isTouchDevice()) onOpen?.(k);
                      }}
                      // Double-click the subject to rename it in place (the list's own F2), anywhere else to open
                      // the row's details, as in a file list. Lists without a rename open.
                      onDoubleClick={(e) => {
                        const onSubject = Boolean(lockedKey && (e.target as HTMLElement).closest(`.cell.c-${lockedKey}`));
                        if (onSubject && !isEditable(e.target) && activeCommands().some((c) => c.keys?.includes("f2") && c.enabled !== false)) {
                          window.getSelection()?.removeAllRanges();
                          runKey("f2");
                        } else onOpen?.(k);
                      }}
                      onPointerDown={(e) => swipe && e.pointerType !== "mouse" && startSwipe(e, k)}
                    >
                      {columns.map((c) => (
                        <div key={c.key} role="gridcell" className={`cell c-${c.key} ${c.align === "end" ? "end" : ""}`}>
                          {c.render(row)}
                        </div>
                      ))}
                    </div>
                  );
                })}
            </div>
          );
        })
      )}
    </div>
  );
}
