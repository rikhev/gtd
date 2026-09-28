import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isEditable, IS_MAC, type Command } from "../keys.ts";

export interface Column<T> {
  key: string;
  label: string;
  width: string;
  align?: "end";
  /** When the list gets too narrow (e.g. beside the detail pane), columns with the lowest number go first. */
  drop?: number;
  render: (row: T) => ReactNode;
}

/** Smallest width a column can take: a fixed px width, or the minimum of a minmax(). */
const minWidth = (w: string) => Number((/^minmax\((\d+)px/.exec(w) ?? /^(\d+)px/.exec(w))?.[1] ?? 0);

export interface GridGroup<T> {
  key: string;
  label: string;
  /** Context colour: drawn as the 2px hairline code under the group label. */
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

  const commands: Command[] = [
    { id: "nav.down", label: "Next row", group: "Move", keys: ["arrowdown"], run: () => move(1) },
    { id: "nav.up", label: "Previous row", group: "Move", keys: ["arrowup"], run: () => move(-1) },
    { id: "nav.first", label: "First row", group: "Move", keys: ["mod+arrowup", "home"], run: () => move(-1e6) },
    { id: "nav.last", label: "Last row", group: "Move", keys: ["mod+arrowdown", "end"], run: () => move(1e6) },
    { id: "nav.pagedown", label: "Page down", group: "Move", keys: ["pagedown"], run: () => move(page()) },
    { id: "nav.pageup", label: "Page up", group: "Move", keys: ["pageup"], run: () => move(-page()) },
    { id: "nav.extdown", label: "Extend selection down", group: "Select", keys: ["shift+arrowdown"], run: () => move(1, true) },
    { id: "nav.extup", label: "Extend selection up", group: "Select", keys: ["shift+arrowup"], run: () => move(-1, true) },
    { id: "nav.extfirst", label: "Extend selection to the first row", group: "Select", keys: ["shift+home", "mod+shift+arrowup"], run: () => move(-1e6, true) },
    { id: "nav.extlast", label: "Extend selection to the last row", group: "Select", keys: ["shift+end", "mod+shift+arrowdown"], run: () => move(1e6, true) },
    { id: "nav.extpagedown", label: "Extend selection a page down", group: "Select", keys: ["shift+pagedown"], hidden: true, run: () => move(page(), true) },
    { id: "nav.extpageup", label: "Extend selection a page up", group: "Select", keys: ["shift+pageup"], hidden: true, run: () => move(-page(), true) },
    {
      id: "nav.tick",
      label: "Tick / untick row",
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
  reorder?: {
    onMove: (keys: string[], beforeKey: string | null, groupKey: string) => void;
    canDrag?: (key: string) => boolean;
    /** Whether a row may be dropped into this group (e.g. never "No context" on Next Actions). */
    canDrop?: (groupKey: string) => boolean;
  };
}

/** DOM id for a row, so the focused grid can point screen readers at it. */
const rowDomId = (listId: string, key: string) => `r-${listId}-${key}`.replace(/[^A-Za-z0-9_-]/g, "_");

export function Grid<T>({ listId, columns: allColumns, groups, getKey, nav, active, rowClass, onOpen, empty, showHeaders, head = true, label, sort, reorder }: GridProps<T>) {
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
  const columns = useMemo(() => {
    if (!width) return allColumns;
    let cols = allColumns;
    const need = (cs: Column<T>[]) => cs.reduce((n, c) => n + minWidth(c.width), 0) + 16;
    const order = allColumns.filter((c) => c.drop !== undefined).sort((a, b) => a.drop! - b.drop!);
    for (const c of order) {
      if (need(cols) <= width) break;
      cols = cols.filter((x) => x !== c);
    }
    return cols;
  }, [allColumns, width]);
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
      if (document.querySelector(".list-region .grid") !== el) return; // one list owns the page: the first in the list region
      const t = e.target as HTMLElement;
      if (!t.closest(".main") || t.closest(".detail, .picker, .overlay, .toast, .tabbar")) return;
      if (isEditable(t) || t.closest("button, a, input, textarea, select, label, [role=button], .chev")) return;
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      const onRow = Boolean(t.closest(".row, .group-head"));
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
  // The grid holds real keyboard focus while its region is active, so screen readers follow the cursor.
  useEffect(() => {
    if (!active || !box.current) return;
    const el = document.activeElement;
    const busy = el && el !== document.body && (isEditable(el) || el.closest(".picker, .palette, .overlay, .detail"));
    if (!busy && !box.current.contains(el)) box.current.focus({ preventScroll: true });
  }, [active, listId]);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const multi = showHeaders ?? groups.length > 1;
  const showHead = head && (total > 0 || (multi && groups.some((g) => g.label)));
  return (
    <div
      ref={box}
      className={`grid ${active ? "is-active" : ""}`}
      data-list={listId}
      role="grid"
      aria-labelledby={label ? undefined : "view-title"}
      aria-label={label}
      aria-multiselectable="true"
      aria-rowcount={total + (multi ? groups.filter((g) => g.label).length : 0) + (showHead ? 1 : 0)}
      aria-activedescendant={nav.focus ? rowDomId(listId, nav.focus) : undefined}
      tabIndex={active ? 0 : -1}
      style={{ ["--cols" as string]: template }}
    >
      {bandRect && <div className="band" style={{ left: bandRect.x, top: bandRect.y, width: bandRect.w, height: bandRect.h }} aria-hidden />}
      {dropLine && <div className="drop-line" style={{ left: dropLine.x, top: dropLine.y - 1, width: dropLine.w }} aria-hidden />}
      {/* No column headings over an empty list: they would label nothing. */}
      {showHead && (
        <div className="grid-head" role="row">
          {columns.map((c) => {
            const sortable = Boolean(sort && c.label && sort.keys.includes(c.key));
            const on = sortable && sort!.state?.key === c.key ? sort!.state!.dir : 0;
            return (
              <div
                key={c.key}
                role="columnheader"
                aria-sort={on === 1 ? "ascending" : on === -1 ? "descending" : sortable ? "none" : undefined}
                className={`gh gh-${c.key} ${c.align === "end" ? "end" : ""} ${on ? "is-sorted" : ""}`}
              >
                {sortable ? (
                  // Click: ascending, again: descending, a third time: back to the list's own order.
                  <button
                    type="button"
                    tabIndex={-1}
                    className="gh-sort"
                    title={on === 1 ? `Sorted by ${c.label.toLowerCase()}, A–Z: click for Z–A` : on === -1 ? `Sorted by ${c.label.toLowerCase()}, Z–A: click for the list's own order` : `Sort by ${c.label.toLowerCase()}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => sort!.onSort(on === 0 ? { key: c.key, dir: 1 } : on === 1 ? { key: c.key, dir: -1 } : null)}
                  >
                    {c.label}
                    <svg className="gh-arrow" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                      <path d={on === -1 ? "M2 3.5l3 3 3-3" : "M2 6.5l3-3 3 3"} />
                    </svg>
                  </button>
                ) : (
                  c.label
                )}
              </div>
            );
          })}
        </div>
      )}
      {total === 0 && !groups.some((g) => multi && g.label) ? (
        <div className="grid-empty">{empty}</div>
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
                  <span className={`chev ${collapsed ? "" : "open"}`} aria-hidden />
                  {/* One look for every list's group heads (owner's decision): Label Caps over a rule, then the count. */}
                  <span className={`group-label ${g.color ? "is-ctx" : ""} ${g.areaColor !== undefined ? "is-area" : ""}`}>
                    {g.areaColor !== undefined && g.label.startsWith("#") ? (
                      <>
                        <span className="area-hash" style={g.areaColor ? { ["--area" as string]: g.areaColor } : undefined}>#</span>
                        {g.label.slice(1)}
                      </>
                    ) : (
                      g.label
                    )}
                  </span>
                  {!g.hideCount && <span className="group-count">{g.rows.length}</span>}
                  {g.meta && <span className="group-meta">{g.meta}</span>}
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
                      onClick={(e) => nav.click(k, e)}
                      onDoubleClick={() => onOpen?.(k)}
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
