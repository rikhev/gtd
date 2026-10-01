import { getState, mutate, named, stamp, uid } from "./store.ts";
import type { UI } from "./ui.tsx";
import type { Horizon, ID, Op } from "../shared/types.ts";

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

/** How many active projects serve a goal. */
export const projectsServing = (goalId: ID) => getState().projects.filter((p) => p.goal_id === goalId && p.status === "active").length;
