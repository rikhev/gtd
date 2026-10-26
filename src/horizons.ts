import { getState, mutate, named, plural, stamp, uid } from "./store.ts";
import type { UI } from "./ui.tsx";
import { goalCount, goalLabel, keeperOf, lengthLabel, parseLength, runStart } from "./checklists.ts";
import type { ChecklistItem, Horizon, ID, Op } from "../shared/types.ts";

/**
 * GTD's higher horizons of focus (owner's decision after the second GTD critique): purpose and principles, vision
 * (3–5 years) and goals (1–2 years), above areas. Projects serve goals; Get creative and the owner's own sense of
 * priority read them.
 */

export const HORIZON_KINDS: { kind: Horizon["kind"]; label: string; note: string }[] = [
  { kind: "purpose", label: "Purpose and principles", note: "why you do it all, and how" },
  { kind: "vision", label: "Vision", note: "3–5 years" },
  { kind: "goal", label: "Goals", note: "1–2 years" },
];

export function newHorizon(kind: Horizon["kind"], data: Partial<Horizon> = {}): Horizon {
  const s = getState();
  return {
    id: uid(),
    kind,
    title: "",
    notes: "",
    area_id: null,
    target: null,
    status: "active",
    sort: Math.max(0, ...s.horizons.map((h) => h.sort)) + 1,
    created_at: stamp(),
    completed_at: null,
    ...data,
  };
}

export const activeGoals = () =>
  getState()
    .horizons.filter((h) => h.kind === "goal" && h.status === "active")
    .sort((a, b) => a.sort - b.sort);

/** G on a project: the goal it serves, or none; a new goal can be typed. */
export function pickGoal(ui: UI, ids: ID[]) {
  if (!ids.length) return;
  const s = getState();
  const cur = ids.length === 1 ? (s.projects.find((p) => p.id === ids[0])?.goal_id ?? null) : null;
  const apply = (goal_id: ID | null, extra: Op[] = [], title?: string) =>
    mutate(`${named("projects", ids, "project")} → ${goal_id ? `goal “${title ?? s.horizons.find((h) => h.id === goal_id)?.title ?? ""}”` : "no goal"}`, [
      ...extra,
      ...ids.map((id): Op => ({ type: "patch", table: "projects", id, data: { goal_id } })),
    ]);
  ui.openPicker({
    type: "list",
    title: "Goal it serves",
    items: activeGoals().map((g) => ({ id: g.id, label: g.title || "Untitled goal", hint: g.target ? `by ${g.target}` : "" })),
    current: cur,
    noneLabel: "No goal",
    createLabel: (q) => `New goal “${q}”`,
    onCreate: (q) => {
      const g = newHorizon("goal", { title: q });
      apply(g.id, [{ type: "create", table: "horizons", row: { ...g } }], q);
    },
    onPick: (id) => apply(id),
  });
}


/**
 * G on a habit: the goal it keeps (owner's request: 90 days of nofap), or none; a new goal can be typed. One habit
 * keeps a goal, so one kept by another moves over. Its count begins where the habit's unbroken run of ticks began,
 * and a goal without a length is asked for one next.
 */
export function pickHabitGoal(ui: UI, item: ChecklistItem) {
  const s = getState();
  const repeats = s.checklists.find((c) => c.id === item.checklist_id)?.repeats;
  if (!repeats || item.section) return;
  const habit = `“${item.title || "Untitled"}”`;
  const apply = (goal: Horizon | null, extra: Op[] = []) => {
    if (!goal) return mutate(`${habit} keeps no goal`, [{ type: "patch", table: "checklist_items", id: item.id, data: { goal_id: null } }]);
    const since = runStart(s, item, repeats);
    const other = s.checklist_items.filter((i) => i.goal_id === goal.id && i.id !== item.id);
    const count = goalCount(s, item, repeats, { length: goal.length, since });
    mutate(`${habit} keeps “${goal.title || "Untitled goal"}”${count ? ` · ${goalLabel(count, repeats)}` : ""}`, [
      ...extra,
      ...other.map((i): Op => ({ type: "patch", table: "checklist_items", id: i.id, data: { goal_id: null } })),
      { type: "patch", table: "checklist_items", id: item.id, data: { goal_id: goal.id } },
      { type: "patch", table: "horizons", id: goal.id, data: { since } },
    ]);
    if (!goal.length) window.setTimeout(() => pickLength(ui, [goal.id]), 0);
  };
  ui.openPicker({
    type: "list",
    title: "Goal it keeps",
    items: activeGoals().map((g) => {
      const keeper = keeperOf(s, g.id);
      return { id: g.id, label: g.title || "Untitled goal", hint: keeper && keeper.item.id !== item.id ? `kept by “${keeper.item.title || "Untitled"}”` : g.length ? lengthLabel(g.length, repeats) : "" };
    }),
    current: item.goal_id ?? null,
    noneLabel: "No goal",
    createLabel: (q) => `New goal “${q}”`,
    onCreate: (q) => {
      const g = newHorizon("goal", { title: q });
      apply(g, [{ type: "create", table: "horizons", row: { ...g } }]);
    },
    onPick: (id) => apply(id ? (getState().horizons.find((h) => h.id === id) ?? null) : null),
  });
}

/** I on a goal: how long it runs, typed as "90" or "90 days" (weeks when a weekly habit keeps it); empty for none. */
export function pickLength(ui: UI, ids: ID[]) {
  const s = getState();
  const goals = s.horizons.filter((h) => ids.includes(h.id) && h.kind === "goal");
  if (!goals.length) return;
  const repeats = goals.length === 1 ? keeperOf(s, goals[0].id)?.repeats : undefined;
  ui.openPicker({
    type: "text",
    title: "Length",
    current: goals.length === 1 && goals[0].length ? String(goals[0].length) : "",
    preview: (v) => {
      const n = parseLength(v);
      if (n === undefined) return { ok: false, text: `Try “90” for ${lengthLabel(90, repeats)}` };
      return { ok: true, text: n ? `${lengthLabel(n, repeats)} in a row` : "No length" };
    },
    onPick: (v) => {
      const length = parseLength(v);
      if (length === undefined) return;
      const name = goals.length === 1 ? `“${goals[0].title || "Untitled goal"}”` : plural(goals.length, "goal");
      mutate(length ? `${name}: ${lengthLabel(length, repeats)}` : `${name}: no length`, goals.map((g): Op => ({ type: "patch", table: "horizons", id: g.id, data: { length } })));
    },
  });
}
