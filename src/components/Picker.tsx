import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { PickerSpec, ListItem } from "../ui.tsx";
import { useCommands } from "../keys.ts";
import { parseDate, formatLong, TIME_PRESETS, formatTime, parseTime, today, addDays, fromIso } from "../../shared/dates.ts";

interface Props {
  spec: PickerSpec;
  close: () => void;
}

type Option = { id: string | null; label: string; hint?: string; color?: string; create?: string; section?: string };

export function Picker({ spec, close }: Props) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 120, left: 320 });
  // Remember what had focus when the picker opened; by the time effects re-run, the picker's own input has it.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !document.activeElement.closest(".picker") ? document.activeElement : null,
  );

  useCommands("picker", [{ id: "picker.close", label: "Cancel", group: "Picker", keys: ["escape"], inInput: true, run: close }], {
    priority: 200,
    exclusive: true,
  });

  // Anchor under the focused row/field, clamped to the viewport.
  useLayoutEffect(() => {
    const act = opener;
    const anchor =
      (act?.closest(".detail, .clarify") ? act : null) ??
      document.querySelector(".is-active [data-focused]") ??
      document.querySelector("[data-focused]");
    const r = anchor?.getBoundingClientRect();
    const w = box.current?.offsetWidth ?? 320;
    const h = box.current?.offsetHeight ?? 280;
    let top = r ? r.bottom + 4 : 120;
    let left = r ? Math.max(r.left + 40, 12) : 320;
    if (top + h > window.innerHeight - 12) top = Math.max(12, (r ? r.top : top) - h - 4);
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
        out.push({ id: "__create__", label: spec.createLabel ? spec.createLabel(q.trim()) : `Create “${q.trim()}”`, create: q.trim() });
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
    if (spec.type === "list" && spec.current) {
      const i = options.findIndex((o) => o.id === spec.current);
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
      } else choose(options[hi]);
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
        type={spec.type === "text" && spec.secret ? "password" : "text"}
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
      <ul className="picker-list" id="picker-list" role="listbox">
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
              else choose(o);
            }}
          >
            {o.color && <span className="swatch" style={{ background: o.color }} />}
            <span className="po-label">{o.label}</span>
            {o.hint && <span className="po-hint">{o.hint}</span>}
          </li>,
        ])}
      </ul>
    </div>
  );
}
