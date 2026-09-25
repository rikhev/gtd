import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Command } from "../keys.ts";
import { Tape } from "./bits.tsx";

export interface Column<T> {
  key: string;
  label: string;
  width: string;
  align?: "end";
  render: (row: T) => ReactNode;
}

export interface GridGroup<T> {
  key: string;
  label: string;
  /** Folder-tab header with a tape label (projects) vs. a plain ruled header. */
  folder?: boolean;
  meta?: ReactNode;
  rows: T[];
}

export const groupKey = (k: string) => `group:${k}`;
export const isGroupKey = (k: string | null) => Boolean(k?.startsWith("group:"));

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
/* Keyboard list navigation (Outlook on the web grammar)                */
/* ------------------------------------------------------------------ */

export interface ListNav {
  focus: string | null;
  setFocus: (k: string | null) => void;
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

  // After rows vanish (done, moved, trashed) the cursor lands on the row that took their place.
  useEffect(() => {
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
    if (extend) {
      const a = anchor ?? focus ?? k;
      if (!anchor) setAnchor(a);
      const i1 = items.indexOf(a);
      const range = items.slice(Math.min(i1, next), Math.max(i1, next) + 1).filter((x) => !isGroupKey(x));
      setSelected(new Set(range));
    } else {
      setAnchor(null);
    }
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
    {
      id: "nav.tick",
      label: "Tick / untick row",
      group: "Select",
      keys: ["space"],
      run: () => {
        if (!focus || isGroupKey(focus)) return;
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
      run: () => setSelected(new Set(items.filter((k) => !isGroupKey(k)))),
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
    return focus && !isGroupKey(focus) ? [focus] : [];
  };

  return { focus, setFocus, selected, setSelected, targets, commands, collapsed, toggleGroup };
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
}

export function Grid<T>({ listId, columns, groups, getKey, nav, active, rowClass, onOpen, empty, showHeaders }: GridProps<T>) {
  const template = columns.map((c) => c.width).join(" ");
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const multi = showHeaders ?? groups.length > 1;
  return (
    <div className={`grid ${active ? "is-active" : ""}`} data-list={listId} role="grid" aria-rowcount={total} style={{ ["--cols" as string]: template }}>
      <div className="grid-head" role="row">
        {columns.map((c) => (
          <div key={c.key} role="columnheader" className={`gh gh-${c.key} ${c.align === "end" ? "end" : ""}`}>
            {c.label}
          </div>
        ))}
      </div>
      {total === 0 && !groups.some((g) => multi && g.label) ? (
        <div className="grid-empty">{empty}</div>
      ) : (
        groups.map((g) => {
          const gk = groupKey(g.key);
          const collapsed = nav.collapsed.has(g.key);
          return (
            <div key={g.key} role="rowgroup" className="grid-group">
              {multi && (
                <div
                  role="row"
                  aria-expanded={!collapsed}
                  data-key={gk}
                  data-focused={nav.focus === gk || undefined}
                  className={`group-head ${g.folder ? "is-folder" : ""} ${nav.focus === gk ? "is-focus" : ""}`}
                  onClick={() => {
                    nav.setFocus(gk);
                    nav.toggleGroup(g.key);
                  }}
                >
                  <span className={`chev ${collapsed ? "" : "open"}`} aria-hidden />
                  {g.folder ? <Tape>{g.label}</Tape> : <span className="group-label">{g.label}</span>}
                  <span className="group-count">{g.rows.length}</span>
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
                      aria-selected={ticked || focused}
                      data-key={k}
                      data-focused={focused || undefined}
                      className={`row ${focused ? "is-focus" : ""} ${ticked ? "is-ticked" : ""} ${rowClass?.(row) ?? ""}`}
                      onClick={() => nav.setFocus(k)}
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
