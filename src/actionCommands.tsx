import { projectEditors } from "./views/ProjectsView.tsx";
import { useRef, useState } from "react";
import type { Command } from "./keys.ts";
import type { CalEvent } from "./calendarFeed.ts";
import type { UI } from "./ui.tsx";
import { quote, completeActions, getState, isChase, mutate, named, newAction, newProject, notify, patchMany, reopenActions, stamp, uid, areaLabel, bareArea } from "./store.ts";
import type { Action, ActionStatus, ID, Op } from "../shared/types.ts";
import { addMonths, daysBetween, formatLong, parseRecurrence, recurrenceLabel, today, formatTime } from "../shared/dates.ts";

/** No red (kept for trouble: overdue, stalled, errors) and no green (kept for the "on track" lamp). */
export const CONTEXT_COLORS = ["#2f6fb5", "#5b6b7e", "#8a5a2b", "#9f691b", "#6b4fa0", "#0e8181", "#a3476e", "#5b6b2e"];
export const COLOR_NAMES: Record<string, string> = { "#2f6fb5": "Blue", "#5b6b7e": "Slate", "#8a5a2b": "Sienna", "#9f691b": "Ochre", "#6b4fa0": "Violet", "#0e8181": "Teal", "#a3476e": "Plum", "#5b6b2e": "Olive" };
/** Areas draw from the same palette (no red, no green), in an order that keeps neighbours apart. */
export const AREA_COLORS = ["#2f6fb5", "#0e8181", "#8a5a2b", "#6b4fa0", "#a3476e", "#9f691b", "#5b6b2e", "#5b6b7e"];
export const nextAreaColor = () => AREA_COLORS[getState().areas.length % AREA_COLORS.length];

export function createContextOp(name: string): { id: ID; op: Op } {
  const s = getState();
  const clean = name.startsWith("@") ? name : `@${name}`;
  const id = uid();
  return {
    id,
    op: {
      type: "create",
      table: "contexts",
      row: { id, name: clean, color: CONTEXT_COLORS[s.contexts.length % CONTEXT_COLORS.length], sort: s.contexts.length },
    },
  };
}

export function createAreaOp(name: string): { id: ID; op: Op } {
  const id = uid();
  return { id, op: { type: "create", table: "areas", row: { id, name: bareArea(name), sort: getState().areas.length, color: nextAreaColor() } } };
}

/** Everyone and everything the Waiting For list is waiting on right now, most recent first. */
export function waitingNames(): string[] {
  const waiting = getState().actions.filter((a) => a.status === "waiting");
  const seen = new Map<string, string>();
  for (const a of waiting) {
    const who = a.waiting_who?.trim();
    if (!who) continue;
    const when = a.waiting_since ?? a.created_at;
    const key = who.toLowerCase();
    if (!seen.has(key) || (seen.get(key) ?? "") < when) seen.set(key, when);
  }
  const names = new Map<string, string>();
  for (const a of waiting) if (a.waiting_who?.trim()) names.set(a.waiting_who.trim().toLowerCase(), a.waiting_who.trim());
  return [...seen.entries()].sort((x, y) => y[1].localeCompare(x[1])).map(([k]) => names.get(k)!);
}

/**
 * Waiting For always needs someone or something to wait on. This asks for it (pick a
 * previous name or type a new one) and only then applies; Esc leaves everything as it was.
 */
export function askWaitingOn(ui: UI, current: string | null, apply: (who: string) => void, title = "Waiting on") {
  ui.openPicker({
    type: "list",
    title,
    items: waitingNames().map((w) => ({ id: w, label: w })),
    current,
    mustChoose: true,
    placeholder: "Who or what are you waiting on?",
    createLabel: (q) => `Waiting on “${q}”`,
    onCreate: (q) => apply(q.trim()),
    onPick: (who) => who && apply(who),
  });
}

/**
 * Everyone the system knows: who you wait on and who actions are for, one spelling each (the latest), the most
 * recently used first. Trashed items don't count.
 */
export function peopleNames(): string[] {
  const seen = new Map<string, { name: string; when: string }>();
  for (const a of getState().actions) {
    if (a.status === "trashed") continue;
    for (const raw of [a.waiting_who, a.person]) {
      const name = raw?.trim();
      if (!name) continue;
      const when = a.updated_at ?? a.created_at;
      const key = name.toLowerCase();
      if (!seen.has(key) || seen.get(key)!.when < when) seen.set(key, { name, when });
    }
  }
  return [...seen.values()].sort((x, y) => y.when.localeCompare(x.when)).map((x) => x.name);
}

/** Who an action is for: someone already known, a new name, or no one. */
export function askPerson(ui: UI, current: string | null, apply: (who: string | null) => void, title = "Who is it with?") {
  ui.openPicker({
    type: "list",
    title,
    items: peopleNames().map((w) => ({ id: w, label: w })),
    current,
    noneLabel: "No one",
    placeholder: "A person to raise it with, call or write to",
    createLabel: (q) => `For “${q}”`,
    onCreate: (q) => apply(q.trim()),
    onPick: (who) => apply(who ?? null),
  });
}

/**
 * A next action always gets a context when it's clarified. Asks for one (existing, or type a new
 * name); `apply` receives the context id and any op that creates it. Esc applies nothing.
 */
export function askContext(ui: UI, title: string, apply: (contextId: ID, extra: Op[]) => void) {
  ui.openPicker({
    type: "list",
    title,
    items: contextItems(),
    mustChoose: true,
    placeholder: "Where can you do it? Pick or type a context",
    createLabel: (q) => `New context “${q.startsWith("@") ? q : "@" + q}”`,
    onCreate: (q) => {
      const { id, op } = createContextOp(q);
      apply(id, [op]);
    },
    onPick: (id) => id && apply(id, []),
  });
}

export function contextItems() {
  return getState()
    .contexts.slice()
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ id: c.id, label: c.name, color: c.color }));
}

/** Where an item can go, in one order and with one set of names everywhere (Move and the Inbox's File as). */
export function destinationItems(prefix = "") {
  return [
    { id: `${prefix}next`, label: "Next Actions", hint: "List", section: "lists" },
    { id: `${prefix}waiting`, label: "Waiting For", hint: "List", section: "lists" },
    { id: `${prefix}someday`, label: "Someday / Maybe", hint: "List", section: "lists" },
    { id: `${prefix}reference`, label: "Reference", hint: "Keep as reference", section: "lists" },
    ...projectItems().map((p) => ({ ...p, hint: p.hint ? `Project · ${p.hint}` : "Project", section: "projects" })),
  ];
}

/**
 * The last step of adding from anywhere: the item's project, if it has one ("No project" first; typing a new name
 * creates the project). `make` builds the action for the chosen project.
 */
function askProjectThenCreate(ui: UI, title: string, extra: Op[], make: (project_id: ID | null) => Action, what: string, project: ID | null = null) {
  window.setTimeout(
    () =>
      ui.openPicker({
        type: "list",
        title: `Project for “${title}”`,
        items: projectItems(),
        // Offered first when the words come from something that supports a project (a checklist's item).
        current: project && getState().projects.some((p) => p.id === project && p.status !== "trashed") ? project : null,
        noneLabel: "No project",
        createLabel: (q) => `New project “${q}”`,
        onCreate: (q) => {
          const p = newProject({ title: q });
          mutate(`${what} in new project “${q}”`, [...extra, { type: "create", table: "projects", row: { ...p } }, { type: "create", table: "actions", row: { ...make(p.id) } }]);
        },
        onPick: (project_id) => {
          const name = project_id ? getState().projects.find((p) => p.id === project_id)?.title : null;
          mutate(name ? `${what} added to “${name}”` : `${what} added: “${title}”`, [...extra, { type: "create", table: "actions", row: { ...make(project_id) } }]);
        },
      }),
    0,
  );
}

/**
 * A next action from anywhere (⌥T): what to do, where (a context, required as everywhere), then its project if it
 * has one. It lands on Next Actions; the view stays put.
 */
export function quickAddNextAction(ui: UI, words = "", project: ID | null = null) {
  ui.openPicker({
    type: "text",
    title: "New next action",
    current: words,
    placeholder: "What's the next physical step, verb first",
    onPick: (v) => {
      const title = (v ?? "").trim();
      if (!title) return;
      askContext(ui, `Context for “${title}”`, (context_id, extra) =>
        askProjectThenCreate(ui, title, extra, (project_id) => newAction({ title, context_id, project_id, status: "next" }), "Next action", project),
      );
    },
  });
}

/**
 * A Waiting For item from anywhere (⌥W): what you're waiting for, who or what you wait on (required, as everywhere
 * in Waiting For), then its project if it has one. Waiting since today; a follow-up date can be set on the item.
 */
export function quickAddWaiting(ui: UI) {
  ui.openPicker({
    type: "text",
    title: "New waiting for",
    current: "",
    placeholder: "What are you waiting for?",
    onPick: (v) => {
      const title = (v ?? "").trim();
      if (!title) return;
      window.setTimeout(
        () =>
          askWaitingOn(ui, null, (who) =>
            askProjectThenCreate(ui, title, [], (project_id) => newAction({ title, project_id, status: "waiting", waiting_who: who, waiting_since: today() }), `Waiting on ${who}`),
            `Waiting on, for “${title}”`,
          ),
        0,
      );
    },
  });
}

export function projectItems() {
  const s = getState();
  return s.projects
    .filter((p) => p.status === "active" || p.status === "someday")
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({ id: p.id, label: p.title || "Untitled project", hint: p.status === "someday" ? "Someday" : areaName(s.areas.find((a) => a.id === p.area_id)?.name) }));
}

/**
 * Link an appointment to a project (P on an appointment, owner's request), or change or drop the link. The link keeps
 * the appointment's title, day and time, so the project's health reads without the calendar.
 */
export function linkAppointment(ui: UI, e: Pick<CalEvent, "key" | "title" | "date" | "time" | "endTime" | "feed">) {
  const cur = getState().appointments.find((x) => x.id === e.key);
  const name = `“${e.title}”`;
  const link = (project_id: ID, extra: Op[] = [], projectTitle?: string) => {
    const row = { id: e.key, project_id, title: e.title, date: e.date, time: e.time, end_time: e.endTime, feed: e.feed, created_at: cur?.created_at ?? stamp() };
    const title = projectTitle ?? getState().projects.find((p) => p.id === project_id)?.title ?? "project";
    // Relinking patches, so ⌘Z puts back the project it had rather than dropping the link.
    mutate(`${name} → ${title}`, [...extra, cur ? { type: "patch", table: "appointments", id: e.key, data: row } : { type: "create", table: "appointments", row }]);
  };
  ui.openPicker({
    type: "list",
    title: `Project for ${name}`,
    items: projectItems(),
    current: cur?.project_id ?? null,
    noneLabel: "No project",
    createLabel: (q) => `New project “${q}”`,
    onCreate: (q) => {
      const p = newProject({ title: q });
      link(p.id, [{ type: "create", table: "projects", row: { ...p } }], q);
    },
    onPick: (id) => {
      if (id) return link(id);
      if (cur) mutate(`${name} no longer linked`, [{ type: "delete", table: "appointments", id: e.key }]);
    },
  });
}

export const areaName = (name: string | undefined) => (name === undefined ? undefined : areaLabel(name));

export function areaItems() {
  return getState()
    .areas.slice()
    .sort((a, b) => a.sort - b.sort)
    .map((a) => ({ id: a.id, label: areaLabel(a.name), color: a.color ?? undefined }));
}

const n = (ids: ID[]) => named("actions", ids, "action");

/* Field editors shared by list keys and the detail pane. */
export function editors(ui: UI) {
  const actions = (ids: ID[]) => getState().actions.filter((a) => ids.includes(a.id));
  const one = (ids: ID[]) => (ids.length === 1 ? actions(ids)[0] : undefined);

  const api = {
    context(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "list",
        title: "Context",
        items: contextItems(),
        current: one(ids)?.context_id ?? null,
        noneLabel: "No context",
        createLabel: (q) => `New context “${q.startsWith("@") ? q : "@" + q}”`,
        onCreate: (q) => {
          const { id, op } = createContextOp(q);
          mutate(`${n(ids)} → new context`, [op, ...ids.map((a) => ({ type: "patch" as const, table: "actions" as const, id: a, data: { context_id: id } }))]);
        },
        onPick: (id) => {
          const name = getState().contexts.find((c) => c.id === id)?.name ?? "no context";
          patchMany("actions", ids, { context_id: id }, `${n(ids)} → ${name}`);
        },
      });
    },
    project(ids: ID[]) {
      setProject(ui, "actions", ids);
    },
    date(ids: ID[], field: "due" | "defer" | "followup" | "bring_back" | "waiting_since") {
      if (!ids.length) return;
      const titles = { due: "Due date", defer: "Start date (hidden until then)", followup: "Follow up on", bring_back: "Bring back to the Inbox on", waiting_since: "Waiting since" };
      ui.openPicker({
        type: "date",
        title: titles[field],
        current: one(ids)?.[field] ?? null,
        onPick: (d) => {
          // Waiting always has a since date: cleared, it goes back to today; it can't start in the future.
          if (field === "waiting_since") {
            let day = d ?? today();
            // "20 sep" typed after the 20th means the last 20 September, not next year's: dates are read forward, but
            // waiting looks back. Only a date months ahead is read that way; "tomorrow" or "fri" is simply refused.
            if (daysBetween(today(), day) > 60 && addMonths(day, -12) <= today()) day = addMonths(day, -12);
            if (day > today()) return notify("Waiting can't start in the future. Pick today or an earlier day.", { tone: "error" });
            return patchMany("actions", ids, { waiting_since: day }, `${n(ids)}: waiting since ${formatLong(day)}`);
          }
          const what = { due: "due", defer: "start", followup: "follow-up", bring_back: "bring back" }[field];
          patchMany("actions", ids, { [field]: d }, d ? `${n(ids)}: ${what} ${formatLong(d)}` : `${n(ids)}: ${what} date cleared`);
        },
      });
    },
    time(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "time",
        current: one(ids)?.time_min ?? null,
        onPick: (m) => patchMany("actions", ids, { time_min: m }, m ? `${n(ids)}: ${formatTime(m)}` : `${n(ids)}: estimate cleared`),
      });
    },
    energy(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "energy",
        current: one(ids)?.energy ?? null,
        onPick: (e) => patchMany("actions", ids, { energy: e }, e ? `${n(ids)}: ${["", "low", "medium", "high"][e]} energy` : `${n(ids)}: energy cleared`),
      });
    },
    recurrence(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "text",
        title: "Repeat",
        current: one(ids)?.recurrence ?? "",
        placeholder: "every mon, every 3 months, weekly",
        preview: (s) => {
          const r = parseRecurrence(s);
          if (r === null) return { ok: true, text: "Doesn’t repeat" };
          if (r === undefined) return { ok: false, text: "Try “weekly”, “every mon, thu”, “every 3 months”" };
          return { ok: true, text: `${recurrenceLabel(r)} · the next one appears when this is done` };
        },
        onPick: (s) => {
          const r = parseRecurrence(s);
          patchMany("actions", ids, { recurrence: r ? s.trim() : null }, r ? `${n(ids)}: ${recurrenceLabel(r).toLowerCase()}` : `${n(ids)}: no longer repeats`);
        },
      });
    },
    /** Who the actions are for: they then show on that person's agenda. */
    person(ids: ID[]) {
      if (!ids.length) return;
      askPerson(ui, one(ids)?.person ?? null, (who) => patchMany("actions", ids, { person: who }, who ? `${n(ids)} → ${who}'s agenda` : `${n(ids)}: no one`));
    },
    delegate(ids: ID[]) {
      if (!ids.length) return;
      askWaitingOn(ui, one(ids)?.waiting_who ?? null, (who) =>
        patchMany("actions", ids, { status: "waiting", waiting_who: who, waiting_since: today(), flagged: 0 }, `${n(ids)} → Waiting For (${who})`),
      );
    },
    /**
     * An action that turned out to need more than one step becomes a project: its title is the outcome, and its notes,
     * files, start and due dates and area go with it. A project needs a next action, so one is asked for straight away
     * (skipped, the project shows as stalled). One undo puts the action back.
     */
    convert(ids: ID[]) {
      const acts = actions(ids).filter((a) => a.status === "next" || a.status === "someday");
      if (!acts.length) return;
      const s = getState();
      const ops: Op[] = [];
      const made: { id: ID; title: string }[] = [];
      for (const a of acts) {
        const parent = a.project_id ? s.projects.find((p) => p.id === a.project_id) : undefined;
        const p = newProject({
          title: a.title,
          notes: parent ? [a.notes, `Split out of “${parent.title}”.`].filter((x) => x.trim()).join("\n\n") : a.notes,
          area_id: parent?.area_id ?? null,
          status: a.status === "someday" ? "someday" : "active",
          due: a.due,
          start: a.defer,
          bring_back: a.bring_back,
        });
        ops.push({ type: "create", table: "projects", row: { ...p } });
        for (const f of s.files.filter((f) => f.owner_kind === "action" && f.owner_id === a.id)) {
          ops.push({ type: "patch", table: "files", id: f.id, data: { owner_kind: "project", owner_id: p.id } });
        }
        ops.push({ type: "delete", table: "actions", id: a.id });
        made.push({ id: p.id, title: p.title || "Untitled project" });
      }
      mutate(made.length === 1 ? `“${made[0].title}” is now a project` : `${made.length} actions are now projects`, ops);
      if (made.length !== 1) return;
      const proj = made[0];
      const ctx = acts[0].context_id;
      ui.openPicker({
        type: "text",
        title: `First next action for “${proj.title}”`,
        current: "",
        placeholder: "What's the very next step?",
        onPick: (title) => {
          if (!title.trim()) return;
          const add = (contextId: ID, extra: Op[] = []) => {
            const next = newAction({ title: title.trim(), status: "next", project_id: proj.id, context_id: contextId });
            mutate(`“${next.title}” added to “${proj.title}”`, [...extra, { type: "create", table: "actions", row: { ...next } }]);
          };
          // It keeps the context the action had; without one, it asks, as every next action needs one.
          if (ctx) add(ctx);
          else askContext(ui, "Context", (c, extra) => add(c, extra));
        },
      });
    },
    move(ids: ID[]) {
      if (!ids.length) return;
      ui.openPicker({
        type: "list",
        title: "Move to",
        // Say where the item already is (for a single item), so the picker answers "where is it now?" too.
        items: [
          ...destinationItems("list:").map((it) => {
            const a = ids.length === 1 ? one(ids) : undefined;
            const here = a && (it.id === `list:${a.status}` || it.id === a.project_id);
            return here ? { ...it, hint: `${it.hint} · current` } : it;
          }),
          // A planned step: it stays in its project, off Next Actions, until its turn comes (GTD: the plan lives with the
          // project; only next actions sit on the lists).
          ...(actions(ids).every((a) => a.project_id)
            ? [{ id: "list:later", label: "Later: a planned step", hint: actions(ids).every((a) => a.status === "later") ? "In its project · current" : "In its project", section: "lists" }]
            : []),
          // It turned out to need more than one step: it becomes a project of its own.
          ...(actions(ids).every((a) => a.status === "next" || a.status === "someday")
            ? [{ id: "convert", label: ids.length === 1 ? "Turn into a project" : "Turn each into a project", hint: "Needs more than one step", section: "now" }]
            : []),
        ],
        createLabel: (q) => `New project “${q}”, and move there`,
        onCreate: (q) => {
          const p = newProject({ title: q });
          mutate(`${n(ids)} → new project “${q}”`, [
            { type: "create", table: "projects", row: { ...p } },
            ...ids.map((a) => ({ type: "patch" as const, table: "actions" as const, id: a, data: { project_id: p.id } })),
          ]);
        },
        onPick: (target) => {
          if (!target) return;
          if (target === "convert") return api.convert(ids);
          if (target === "list:reference") {
            const ops: Op[] = [];
            for (const a of actions(ids)) {
              const rid = uid();
              ops.push({ type: "create", table: "refs", row: { id: rid, title: a.title, notes: a.notes, project_id: a.project_id, status: "active", created_at: stamp() } });
              ops.push({ type: "patch", table: "actions", id: a.id, data: { status: "trashed" } });
              for (const f of getState().files.filter((f) => f.owner_kind === "action" && f.owner_id === a.id)) {
                ops.push({ type: "patch", table: "files", id: f.id, data: { owner_kind: "ref", owner_id: rid } });
              }
            }
            mutate(`${n(ids)} → Reference`, ops);
          } else if (target.startsWith("list:")) {
            const status = target.slice(5) as ActionStatus;
            if (status === "waiting") {
              askWaitingOn(ui, one(ids)?.waiting_who ?? null, (who) =>
                patchMany("actions", ids, { status: "waiting", waiting_who: who, waiting_since: today(), flagged: 0 }, `${n(ids)} → Waiting For (${who})`),
              );
              return;
            }
            if (status === "later") return patchMany("actions", ids, { status: "later", flagged: 0 }, `${n(ids)} planned for later, in ${ids.length === 1 ? "its project" : "their projects"}`);
            const label = { next: "Next Actions", someday: "Someday / Maybe" }[status as "next"];
            // A next action always has a context: one coming from Someday or a plan without one asks for it.
            const missing = status === "next" ? actions(ids).filter((a) => !a.context_id) : [];
            if (missing.length)
              return askContext(ui, "Context", (context_id, extra) =>
                mutate(`${n(ids)} → ${label}`, [...extra, ...ids.map((id): Op => ({ type: "patch", table: "actions", id, data: { status, ...(missing.some((m) => m.id === id) ? { context_id } : {}) } }))]),
              );
            patchMany("actions", ids, { status }, `${n(ids)} → ${label}`);
          } else {
            const name = getState().projects.find((p) => p.id === target)?.title ?? "project";
            patchMany("actions", ids, { project_id: target }, `${n(ids)} → ${name}`);
          }
        },
      });
    },
  };
  return api;
}

/**
 * Keyboard commands for any list of actions. `status` decides where N creates
 * new rows; `step` moves the selected rows one place for ⌥↑/⌥↓.
 */
/**
 * The keys a row that is an action answers to, the same on every list that shows actions (Next Actions, Waiting For,
 * Someday, Agendas, Done, the Calendar, the Weekly Review's steps), so a letter means one thing wherever the action
 * is: Enter opens it, J jumps to its project, F2 renames, V moves, ⇧P makes it a project, C P D S M G R B H set its
 * fields (D is the follow-up on a waiting item, the due date otherwise), ⇧F delegates, Delete trashes and ⇧Delete
 * deletes for good. Each list adds its own verbs (new, done, reorder) and leaves out with `skip` what it does its
 * own way. `targets` names the actions to act on: a heading under the cursor says so instead of doing nothing.
 */
export function actionRowCommands(
  ui: UI,
  o: { targets: () => ID[]; focusId: ID | null; group: string; rename?: (id: ID) => void; waiting?: boolean; skip?: string[]; enabled?: boolean },
): Command[] {
  const ed = editors(ui);
  const ids = () => o.targets();
  const has = (o.enabled ?? true) && Boolean(o.focusId);
  const focus = o.focusId ? getState().actions.find((a) => a.id === o.focusId) : undefined;
  // D is the follow-up on a waiting item (what the list shows), the due date on anything else.
  const waiting = o.waiting ?? focus?.status === "waiting";
  const rename = (id: ID) =>
    o.rename
      ? o.rename(id)
      : ui.openPicker({
          type: "text",
          title: "Rename",
          current: getState().actions.find((a) => a.id === id)?.title ?? "",
          onPick: (v) => {
            const title = (v ?? "").trim();
            const a = getState().actions.find((x) => x.id === id);
            if (a && title && title !== a.title) mutate(`Renamed ${quote(title)}`, [{ type: "patch", table: "actions", id, data: { title } }]);
          },
        });
  const trash = (permanent: boolean) => {
    const t = ids();
    if (!t.length) return;
    if (permanent) mutate(`${n(t)} deleted permanently`, t.map((id): Op => ({ type: "delete", table: "actions", id })));
    else patchMany("actions", t, { status: "trashed" }, `${n(t)} trashed`);
  };
  const all: Command[] = [
    { id: "row.open", label: "Open details", group: o.group, keys: ["enter"], run: () => o.focusId && ui.openDetail({ kind: "action", id: o.focusId }, true) },
    { id: "row.jump", label: "Jump to its project", group: o.group, keys: ["j"], run: () => o.focusId && ui.jumpToProject(o.focusId) },
    { id: "row.rename", label: "Rename", group: o.group, keys: ["f2"], run: () => o.focusId && rename(o.focusId) },
    { id: "row.move", label: "Move to project or list", group: o.group, keys: ["v"], run: () => ed.move(ids()) },
    { id: "row.convert", label: "Turn into a project", group: o.group, keys: ["shift+p"], run: () => ed.convert(ids()) },
    { id: "row.context", label: "Set context", group: "Fields", keys: ["c"], run: () => ed.context(ids()) },
    { id: "row.project", label: "Set project", group: "Fields", keys: ["p"], run: () => ed.project(ids()) },
    waiting
      ? { id: "row.date", label: "Follow-up date", group: "Fields", keys: ["d"], run: () => ed.date(ids(), "followup") }
      : { id: "row.date", label: "Due date", group: "Fields", keys: ["d"], run: () => ed.date(ids(), "due") },
    ...(waiting ? [{ id: "row.since", label: "Waiting since", group: "Fields", keys: ["i"], run: () => ed.date(ids(), "waiting_since") }] : []),
    { id: "row.defer", label: "Start date", group: "Fields", keys: ["s"], run: () => ed.date(ids(), "defer") },
    // M for minutes: T and W add, everywhere (owner's decision after the critique found T editing here and adding elsewhere).
    { id: "row.time", label: "Time estimate (then 1–6)", group: "Fields", keys: ["m"], run: () => ed.time(ids()) },
    { id: "row.energy", label: "Energy (then 1–3)", group: "Fields", keys: ["g"], run: () => ed.energy(ids()) },
    { id: "row.repeat", label: "Repeat", group: "Fields", keys: ["r"], run: () => ed.recurrence(ids()) },
    { id: "row.bringback", label: "Bring back on (tickler)", group: "Fields", keys: ["b"], run: () => ed.date(ids(), "bring_back") },
    { id: "row.person", label: "Who it's with (their agenda)", group: "Fields", keys: ["h"], run: () => ed.person(ids()) },
    { id: "row.delegate", label: "Delegate → Waiting For", group: o.group, keys: ["shift+f"], run: () => ed.delegate(ids()) },
    { id: "row.trash", label: "Trash", group: o.group, keys: ["backspace", "delete"], run: () => trash(false) },
    { id: "row.delete", label: "Delete permanently", group: o.group, keys: ["shift+backspace", "shift+delete"], run: () => trash(true) },
  ];
  return all.filter((c) => !o.skip?.includes(c.id)).map((c) => ({ ...c, enabled: has, row: true }));
}

export function useActionCommands(opts: {
  ui: UI;
  targets: () => ID[];
  focusId: ID | null;
  status: ActionStatus;
  defaults?: () => Partial<Action>;
  step: (ids: ID[], dir: -1 | 1) => void;
  onCreated?: (id: ID) => void;
  /** Rows about to be marked done: the list moves its cursor off them (they stay, struck through, at the bottom). */
  onCompleting?: (ids: ID[]) => void;
  waitingView?: boolean;
  doneView?: boolean;
}) {
  const { ui, targets, status } = opts;
  const [editing, setEditing] = useState<ID | null>(null);
  const [striking, setStriking] = useState<Set<ID>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  // A command on a group heading has nothing to act on: say so instead of doing nothing.
  const pick = () => {
    const ids = targets();
    if (!ids.length) notify("That's a group heading. Move onto an action first.");
    return ids;
  };

  const complete = () => {
    const ids = pick();
    if (!ids.length) return;
    // E on done rows (still on their list) takes them back: E toggles, like the Complete box.
    const acts = getState().actions.filter((a) => ids.includes(a.id));
    if (acts.length && acts.every((a) => a.status === "done")) return reopenActions(ids);
    opts.onCompleting?.(ids);
    // The pen strikes through first, then the row is done (struck through at the bottom of its group, or gone when done is hidden).
    setStriking(new Set(ids));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      completeActions(ids);
      setStriking(new Set());
    }, 280);
  };

  // Back to the list each was done on.
  const reopen = () => {
    const ids = targets();
    if (!ids.length) return;
    reopenActions(ids);
  };

  // The whole selection moves, not just the row under the cursor.
  const reorder = (dir: -1 | 1) => {
    const ids = targets();
    if (ids.length) opts.step(ids, dir);
  };

  const create = () => {
    const defaults = opts.defaults?.() ?? {};
    const make = (extra: Partial<Action> = {}) => {
      const a = newAction({ status, ...defaults, ...extra });
      mutate("New action", [{ type: "create", table: "actions", row: { ...a } }], { silent: true });
      opts.onCreated?.(a.id);
      setEditing(a.id);
    };
    // A new Waiting For item starts with who or what it waits on (the cursor's group is
    // offered first); Esc creates nothing.
    if (status === "waiting") askWaitingOn(ui, defaults.waiting_who ?? null, (who) => make({ waiting_who: who, waiting_since: today() }), "New item: waiting on");
    else make();
  };

  const addBeside = (kind: "next" | "waiting") => {
    const row = opts.focusId ? getState().actions.find((a) => a.id === opts.focusId) : undefined;
    // T on a chase (a waiting item due a follow-up): the chase becomes a real next action, with its context (GTD).
    if (kind === "next" && row && isChase(row)) return chaseAction(ui, row);
    const pid = row?.project_id;
    if (pid) return kind === "next" ? projectEditors(ui).addNextAction(pid) : projectEditors(ui).addWaiting(pid);
    return kind === "next" ? quickAddNextAction(ui) : quickAddWaiting(ui);
  };

  const has = () => targets().length > 0;

  const commands: Command[] = [
    { id: "act.new", label: "New action", group: "Actions", keys: ["n"], run: create },
    // T and W add, as on Projects and Agendas: a next action or a waiting for in the focused row's project (or on its own).
    {
      id: "act.addnext",
      row: true,
      label: (() => {
        const row = opts.focusId ? getState().actions.find((a) => a.id === opts.focusId) : undefined;
        return row && isChase(row) ? "Chase it: make the follow-up a next action" : "Add a next action (to this row's project)";
      })(),
      group: "Actions",
      keys: ["t"],
      run: () => addBeside("next"),
    },
    { id: "act.addwait", row: true, label: "Add a waiting for (to this row's project)", group: "Actions", keys: ["w"], run: () => addBeside("waiting") },
    opts.doneView
      ? { id: "act.reopen", row: true, label: "Not done (put back)", group: "Actions", keys: ["e"], run: reopen }
      : { id: "act.done", row: true, label: "Mark done", group: "Actions", keys: ["e"], run: complete, enabled: true },
    ...actionRowCommands(ui, { targets: pick, focusId: opts.focusId, group: "Actions", rename: setEditing, waiting: opts.waitingView }),
    { id: "act.up", row: true, label: "Move row up", group: "Actions", keys: ["alt+arrowup"], run: () => reorder(-1) },
    { id: "act.down", row: true, label: "Move row down", group: "Actions", keys: ["alt+arrowdown"], run: () => reorder(1) },
  ].map((c) => (["act.new", "act.addnext", "act.addwait"].includes(c.id) || c.id.startsWith("row.") ? c : { ...c, enabled: c.enabled ?? has() }));

  const commitTitle = (id: ID, title: string) => {
    setEditing(null);
    const a = getState().actions.find((x) => x.id === id);
    if (!a) return;
    if (!title.trim() && !a.title) {
      mutate("Discarded empty action", [{ type: "delete", table: "actions", id }], { silent: true });
      return;
    }
    if (title.trim() !== a.title) mutate(`Renamed ${quote(title)}`, [{ type: "patch", table: "actions", id, data: { title: title.trim() } }]);
  };

  // The Complete box acts on its own row, not on the selection: strike through and complete, or bring back.
  const completeOne = (id: ID) => {
    opts.onCompleting?.([id]);
    setStriking((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      completeActions([id]);
      setStriking((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }, 280);
  };
  const reopenOne = (id: ID) => reopenActions([id]);

  return { commands, create, editing, setEditing, commitTitle, striking, completeOne, reopenOne };
}

/**
 * A follow-up that is due is itself a next action in GTD ("@calls Chase Anna about the NDA"). T on a chase words it,
 * asks its context, and files it in the waiting item's project; the waiting item stays in Waiting For, its follow-up
 * date handed over to the new action (so the chase isn't listed twice). One ⌘Z undoes both.
 */
export function chaseAction(ui: UI, w: Action) {
  ui.openPicker({
    type: "text",
    title: "Chase it: the next action",
    current: `Chase ${w.waiting_who ?? "them"} about ${w.title}`,
    placeholder: "Verb first: Call Anna about the NDA",
    onPick: (v) => {
      const title = (v ?? "").trim();
      if (!title) return;
      window.setTimeout(() =>
        askContext(ui, `Context for “${title}”`, (context_id, extra) => {
          // No due date: the follow-up was a reminder, not a deadline (GTD keeps hard dates for what must happen).
          const a = newAction({ title, context_id, project_id: w.project_id, status: "next" });
          mutate(`“${title}” added · follow-up handed over`, [...extra, { type: "create", table: "actions", row: { ...a } }, { type: "patch", table: "actions", id: w.id, data: { followup: null } }]);
        }),
      );
    },
  });
}

/**
 * P everywhere (owner's request: link to a project from the list itself, the same way on every list): the project an
 * action, a reference or a checklist belongs to or supports. One picker, one order, the current project marked, "No
 * project" first, and a new project can be typed. One ⌘Z.
 */
export function setProject(ui: UI, table: "actions" | "refs" | "checklists", ids: ID[]) {
  if (!ids.length) return;
  const s = getState();
  const rows = (s[table] as { id: ID; title: string; project_id?: ID | null }[]).filter((r) => ids.includes(r.id));
  if (!rows.length) return;
  const noun = { actions: "action", refs: "reference", checklists: "checklist" }[table];
  const what = rows.length === 1 ? `“${rows[0].title || `Untitled ${noun}`}”` : `${rows.length} ${noun}s`;
  const patch = (project_id: ID | null): Op[] => rows.map((r) => ({ type: "patch", table, id: r.id, data: { project_id } }));
  ui.openPicker({
    type: "list",
    title: "Project",
    items: projectItems(),
    current: rows.length === 1 ? (rows[0].project_id ?? null) : null,
    noneLabel: "No project",
    createLabel: (q) => `New project “${q}”`,
    onCreate: (q) => {
      const p = newProject({ title: q });
      mutate(`${what} → new project “${q}”`, [{ type: "create", table: "projects", row: { ...p } }, ...patch(p.id)]);
    },
    onPick: (id) => mutate(`${what} → ${id ? (getState().projects.find((p) => p.id === id)?.title ?? "project") : "no project"}`, patch(id)),
  });
}
