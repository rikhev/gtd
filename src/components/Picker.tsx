import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Named } from "./bits.tsx";
import type { PickerSpec, ListItem } from "../ui.tsx";
import { useCommands } from "../keys.ts";
import { useUI } from "../ui.tsx";
import { parseDate, formatLong, TIME_PRESETS, formatTime, parseTime, today, addDays, fromIso } from "../../shared/dates.ts";

/*
 * How the last thing was asked for (owner's rule): a picker opened with the mouse opens at the pointer; one opened
 * from the keyboard opens at what has focus. Whichever came last, a press or a key, decides.
 */
let lastPointer: { x: number; y: number; at: number } | null = null;
let lastKeyAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => (lastPointer = { x: e.clientX, y: e.clientY, at: performance.now() }), true);
  window.addEventListener("keydown", () => (lastKeyAt = performance.now()), true);
}
/** Where the pointer was, if the picker is being opened by a press just now (not by a key, nor long after a click). */
const pointerOpening = () => (lastPointer && lastPointer.at > lastKeyAt && performance.now() - lastPointer.at < 1500 ? lastPointer : null);

interface Props {
  spec: PickerSpec;
  close: () => void;
}

type Option = { id: string | null; label: string; hint?: string; color?: string; create?: string; section?: string };

export function Picker({ spec, close }: Props) {
  const ui = useUI();
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 120, left: 320 });
  // Remember what had focus when the picker opened; by the time effects re-run, the picker's own input has it.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !document.activeElement.closest(".picker") ? document.activeElement : null,
  );

  // A click (or tap) anywhere outside the menu closes it, as Esc does, and is spent on closing it: it doesn't also
  // press whatever was under it, as with a macOS menu.
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
      close();
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [close]);

  // The picker's own keys (its field handles them) are listed for the palette, which ⌘K opens here too.
  const noop = () => {};
  useCommands(
    "picker",
    [
      { id: "picker.close", label: "Cancel", group: "Picker", keys: ["escape"], inInput: true, run: close },
      { id: "picker.move", label: "Move up or down the choices", group: "Picker", displayKeys: ["arrowup", "arrowdown"], run: noop },
      { id: "picker.pick", label: spec.type === "text" ? "Done" : "Pick", group: "Picker", displayKeys: ["enter"], run: noop },
      ...(spec.type === "list" && spec.onPickMore ? [{ id: "picker.more", label: "Pick this and keep choosing", group: "Picker", displayKeys: ["shift+enter"], run: noop }] : []),
      ...(spec.type === "time" ? [{ id: "picker.digits", label: "A length by its number (0 clears)", group: "Picker", displayKeys: ["1–6"], run: noop }] : []),
      ...(spec.type === "energy" ? [{ id: "picker.digits", label: "A level by its number (0 clears)", group: "Picker", displayKeys: ["1–3"], run: noop }] : []),
      // ⌘K works in a picker too, listing its keys (it holds every other key while it is open).
      { id: "picker.palette", label: "Command palette", group: "Help", keys: ["mod+k"], inInput: true, run: ui.openPalette },
    ],
    { priority: 200, exclusive: true, title: spec.type === "time" ? "Time estimate" : spec.type === "energy" ? "Energy" : spec.title },
  );

  // Anchor at the pointer when opened by a press, else under the focused row, field or calendar item; clamped to the viewport.
  useLayoutEffect(() => {
    const act = opener;
    // A row whose value is its own control (a setting) opens the picker under that value, by mouse or by Enter.
    const valueEl = document.querySelector<HTMLElement>("[data-focused] .set-value");
    const anchor =
      (act?.closest(".detail, .clarify") ? act : null) ??
      valueEl ??
      document.querySelector(".is-active [data-focused]") ??
      document.querySelector("[data-focused]");
    const r = anchor?.getBoundingClientRect();
    const w = box.current?.offsetWidth ?? 320;
    const h = box.current?.offsetHeight ?? 280;
    // A menu opened with the mouse opens at the pointer; one opened from the keyboard, under the focused row.
    const at = (spec.type === "list" ? spec.at : undefined) ?? pointerOpening() ?? undefined;
    let top = at ? at.y + 2 : r ? r.bottom + 4 : 120;
    // A list row opens past its marker column; a field, a setting's value or a calendar item at its own left edge.
    const inset = anchor === valueEl || anchor?.closest(".calendar, .detail, .clarify") ? 0 : 40;
    let left = at ? at.x + 2 : r ? Math.max(r.left + inset, 12) : 320;
    if (top + h > window.innerHeight - 12) top = Math.max(12, (at ? at.y : r ? r.top : top) - h - 4);
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
    setPos({ top, left });
    input.current?.focus();
  }, []);

  const options: Option[] = useMemo(() => {
    if (spec.type === "list") {
      const needle = q.trim().toLowerCase();
      const scored = spec.items
        .map((it: ListItem) => {
          const l = it.label.toLowerCase();
          const bare = l.replace(/^@/, "");
          const score = !needle ? 1 : l.startsWith(needle) || bare.startsWith(needle) ? 3 : l.includes(needle) ? 2 : 0;
          return { it, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const out: Option[] = [];
      if (spec.noneLabel && !needle) out.push({ id: null, label: spec.noneLabel });
      out.push(...scored.map(({ it }) => ({ id: it.id, label: it.label, hint: it.hint, color: it.color, section: it.section })));
      const exact = spec.items.some((it) => it.label.toLowerCase() === needle || it.label.toLowerCase() === `@${needle}`);
      if (spec.onCreate && needle && !exact) {
        out.push({ id: "__create__", label: spec.createLabel ? spec.createLabel(q.trim()) : `New “${q.trim()}”`, create: q.trim() });
      }
      return out;
    }
    if (spec.type === "date") {
      const t = today();
      const sat = (() => {
        const d = fromIso(t).getDay();
        return addDays(t, (6 - d + 7) % 7 || 7);
      })();
      const mon = (() => {
        const d = fromIso(t).getDay();
        return addDays(t, (8 - d) % 7 || 7);
      })();
      const quick: Option[] = [
        { id: t, label: "Today", hint: formatLong(t) },
        { id: addDays(t, 1), label: "Tomorrow", hint: formatLong(addDays(t, 1)) },
        { id: sat, label: "This weekend", hint: formatLong(sat) },
        { id: mon, label: "Next week", hint: formatLong(mon) },
        { id: addDays(t, 30), label: "In a month", hint: formatLong(addDays(t, 30)) },
      ];
      if (spec.current) quick.push({ id: null, label: "Clear date" });
      const parsed = q.trim() ? parseDate(q) : undefined;
      if (parsed !== undefined && q.trim()) return [{ id: parsed, label: parsed ? formatLong(parsed) : "Clear date", hint: "↵" }];
      if (q.trim()) return [{ id: "__invalid__", label: "Try “fri”, “+3d”, “next week” or “3 oct”" }];
      return quick;
    }
    if (spec.type === "time") {
      const parsed = q.trim() ? parseTime(q) : undefined;
      if (q.trim() && !/^\d$/.test(q.trim())) {
        return parsed !== undefined ? [{ id: String(parsed ?? ""), label: parsed ? formatTime(parsed) : "Clear estimate", hint: "↵" }] : [{ id: "__invalid__", label: "Try “45m” or “1.5h”" }];
      }
      const out: Option[] = TIME_PRESETS.map((m, i) => ({ id: String(m), label: formatTime(m), hint: String(i + 1) }));
      if (spec.current) out.push({ id: "", label: "Clear estimate", hint: "0" });
      return out;
    }
    if (spec.type === "energy") {
      const out: Option[] = [
        { id: "1", label: "Low energy", hint: "1" },
        { id: "2", label: "Medium energy", hint: "2" },
        { id: "3", label: "High energy", hint: "3" },
      ];
      if (spec.current) out.push({ id: "", label: "Clear", hint: "0" });
      return out;
    }
    const pv = spec.preview?.(q);
    return pv ? [{ id: pv.ok ? "__ok__" : "__invalid__", label: pv.text }] : [];
  }, [spec, q]);

  useEffect(() => {
    if (spec.type === "list" && (spec.highlight || spec.current)) {
      const i = options.findIndex((o) => o.id === (spec.highlight ?? spec.current));
      setHi(i >= 0 ? i : 0);
    } else if (spec.type === "list" && spec.mustChoose && !q.trim()) setHi(-1);
    else setHi(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (spec.type !== "text") return;
    setQ(spec.current);
    // The current value is selected, so typing replaces it (e.g. "3" → type "14").
    requestAnimationFrame(() => input.current?.select());
  }, [spec]);

  const choose = (o: Option | undefined) => {
    if (!o || o.id === "__invalid__") return;
    close();
    switch (spec.type) {
      case "list":
        if (o.create) spec.onCreate?.(o.create);
        else spec.onPick(o.id);
        break;
      case "date":
        spec.onPick(o.id);
        break;
      case "time":
        spec.onPick(o.id ? Number(o.id) : null);
        break;
      case "energy":
        spec.onPick(o.id ? (Number(o.id) as 1 | 2 | 3) : null);
        break;
      case "text":
        spec.onPick(q);
        break;
    }
  };

  /** Add an option to a filter of several: the caller reopens the picker with it ticked. */
  const more = (o: Option) => {
    if (spec.type !== "list" || !o.id) return;
    close();
    spec.onPickMore?.(o.id);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (spec.type === "text") {
        const pv = spec.preview?.(q);
        if (!pv || pv.ok) choose({ id: "__ok__", label: q });
      } else if (e.shiftKey && spec.type === "list" && spec.onPickMore && options[hi]?.id && !options[hi].create) more(options[hi]);
      else choose(options[hi]);
    } else if ((spec.type === "time" || spec.type === "energy") && q === "" && /^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const n = Number(e.key);
      if (n === 0) choose({ id: "", label: "" });
      else if (spec.type === "time" && n <= TIME_PRESETS.length) choose({ id: String(TIME_PRESETS[n - 1]), label: "" });
      else if (spec.type === "energy" && n <= 3) choose({ id: String(n), label: "" });
    }
  };

  const title =
    spec.type === "time" ? "Time estimate" : spec.type === "energy" ? "Energy" : spec.title;
  const placeholder =
    spec.type === "list"
      ? (spec.placeholder ?? "Type to filter")
      : spec.type === "date"
        ? "fri, +3d, next week, 3 oct"
        : spec.type === "time"
          ? "Press 1–6, or type 45m"
          : spec.type === "energy"
            ? "Press 1–3"
            : spec.placeholder;

  return (
    <div className="picker" ref={box} style={{ top: pos.top, left: pos.left }} role="dialog" aria-label={title}>
      <div className="picker-title">{title}</div>
      <input
        ref={input}
        className="picker-input"
        type="text"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        role={spec.type === "text" ? undefined : "combobox"}
        aria-label={title}
        aria-expanded={spec.type === "text" ? undefined : true}
        aria-autocomplete={spec.type === "text" ? undefined : "list"}
        aria-controls="picker-list"
        aria-activedescendant={options[hi] ? `po-${hi}` : undefined}
        spellCheck={false}
        autoComplete="off"
      />
      <ul className="picker-list" id="picker-list" role="listbox" aria-label={title}>
        {options.map((o, i) => [
          i > 0 && o.section !== options[i - 1].section && <li key={`sep-${i}`} className="picker-sep" role="separator" aria-hidden="true" />,
          <li
            key={`${o.id}-${i}`}
            id={`po-${i}`}
            role="option"
            aria-selected={i === hi}
            className={`${i === hi ? "is-hi" : ""} ${spec.type === "text" ? "is-preview" : ""} ${o.id === "__invalid__" ? "is-hint" : ""} ${o.create ? "is-create" : ""} ${
              spec.type === "list" && spec.current === o.id ? "is-current" : ""
            }`}
            onMouseEnter={() => setHi(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              if (spec.type === "text") choose({ id: "__ok__", label: q });
              else if ((e.shiftKey || e.metaKey || e.ctrlKey) && spec.type === "list" && spec.onPickMore && o.id && !o.create) more(o);
              else choose(o);
            }}
          >
            {/* Contexts and areas show as they do everywhere: their mark in a tile of their colour, then the name. Plain
                colour choices (Settings › colour) keep the swatch. */}
            {o.color && /^[@#]/.test(o.label) ? (
              <span className="po-label">
                <Named mark={o.label[0] as "@" | "#"} name={o.label} color={o.color} />
              </span>
            ) : (
              <>
                {o.color && <span className="swatch" style={{ background: o.color }} />}
                <span className="po-label">{o.label}</span>
              </>
            )}
            {o.hint && <span className="po-hint">{o.hint}</span>}
          </li>,
        ])}
      </ul>
    </div>
  );
}
