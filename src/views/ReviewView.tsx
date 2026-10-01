import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, ListChecks, Mail, Paperclip, StickyNote, Target } from "lucide-react";
import { capture, uid, mutate, newProject, completeActions, isChase, isStale, lastReview, nextAppointment, notStarted, startsToday, projectHealth, patchMany, plural, stallReason, useMeta, useStore, load, notify } from "../store.ts";
import { clearSession, loadSession, newSession, saveSession, type ReviewSession } from "../reviewSession.ts";
import { useUI } from "../ui.tsx";
import { useEvents } from "../calendarFeed.ts";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, useSort, sortGroups, type Column, type Sorters } from "../components/Grid.tsx";
import { DateCell, EventMark, KeyChoices, KeyHints, Lamp, Marker, Tag } from "../components/bits.tsx";
import { editors, linkAppointment, quickAddNextAction, quickAddWaiting } from "../actionCommands.tsx";
import { projectEditors } from "./ProjectsView.tsx";
import { InlineEdit } from "./ActionsView.tsx";
import { ClarifyView } from "./ClarifyView.tsx";
import { stuffTitle } from "./InboxView.tsx";
import { isTicked, itemsOf, openChecklist, periodOf, progress, progressLabel, repeatsLabel } from "../checklists.ts";
import { doneNow, fileStuff, trashNow } from "../fileStuff.ts";
import { addDays, formatLong, today, daysBetween } from "../../shared/dates.ts";
import type { Action, ID, Stuff } from "../../shared/types.ts";

/**
 * The Weekly Review in David Allen's order (2015), in his three phases (owner's decision after the GTD critique):
 * Get Clear (collect loose papers, the Inbox to zero, empty your head), Get Current (action lists, the previous
 * calendar, the upcoming calendar, Waiting For, projects, checklists), Get Creative (Someday/Maybe, then be creative).
 */
const STEPS = [
  { id: "papers", phase: "Get clear", title: "Loose papers", note: "Gather the scraps: notes, receipts, business cards, papers on the desk and in the bag, wallet and pockets. Type in anything that needs a decision; it goes to the Inbox." },
  { id: "clear", phase: "Get clear", title: "Inbox to zero", note: "Clarify everything in the Inbox, so nothing is left undecided." },
  { id: "sweep", phase: "Get clear", title: "Mind sweep", note: "Empty your head: read down the list and capture whatever it brings to mind. It lands in the Inbox; clarify it before you finish." },
  { id: "next", phase: "Get current", title: "Next actions", note: "Mark what's done. Rewrite anything vague." },
  { id: "lookback", phase: "Get current", title: "Look back", note: "What the last two weeks finished. Anything it left behind? Add the follow-up now." },
  { id: "upcoming", phase: "Get current", title: "Upcoming", note: "Due, starting, follow-ups and tickler dates in the next two weeks." },
  { id: "waiting", phase: "Get current", title: "Waiting for", note: "Chase what's overdue. Close what arrived." },
  { id: "projects", phase: "Get current", title: "Projects", note: "Every active project needs a next action. Complete, defer or drop the rest." },
  // GTD's last "get current" check: review any relevant checklists, as a trigger for new actions.
  { id: "checklists", phase: "Get current", title: "Checklists", note: "Look over the checklists that bear on the weeks ahead. Anything one brings to mind becomes a next action." },
  { id: "someday", phase: "Get creative", title: "Someday / Maybe", note: "Activate anything whose time has come. Drop what no longer matters." },
  // GTD's "be creative and courageous": the areas you're responsible for, and anything new they bring to mind.
  { id: "creative", phase: "Get creative", title: "Get creative", note: "Walk your goals and areas: does each have the projects it needs? Then capture anything new: projects, ideas, someday wishes." },
  { id: "finish", phase: "", title: "Finish", note: "Record the review." },
] as const;
/** The order before Allen's (and before Checklists was added after Upcoming), to find a review saved without step names. */
const OLD_ORDER = ["sweep", "clear", "projects", "next", "waiting", "someday", "lookback", "upcoming", "checklists", "creative", "finish"];
type StepId = (typeof STEPS)[number]["id"];
/** On Finish, a digit jumps back to a step not clear yet, counted down that list: 1–9, then 0 for the tenth. */
const stepKey = (i: number) => (i === 9 ? "0" : String(i + 1));

interface Row {
  key: string;
  kind: "project" | "action" | "stuff" | "area" | "event" | "checklist" | "goal";
  id: ID;
  title: string;
  info: string;
  date: string | null;
  /** An appointment's calendar colour. */
  color?: string;
  /** A built-in check that needs attention: stalled, overdue, untouched, follow-up due, due back. */
  note?: string;
}

export function ReviewView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const meta = useMeta();
  const s = useStore((x) => x);
  // The review in progress survives leaving the view: stepping out to fix something resumes here.
  const [sess, setSess] = useState<ReviewSession>(() => {
    const s = loadSession();
    // Back on the step it was on, by name; a review saved before steps had names, and before Checklists was added
    // after Upcoming (index 8), is moved one on from there.
    // A review saved before steps had names is found by its place in the old order (before Checklists, one less).
    const legacy = OLD_ORDER[s.stepIdx >= 8 ? s.stepIdx + 1 : s.stepIdx];
    const found = STEPS.findIndex((st) => st.id === (s.stepId ?? legacy));
    const at = Math.max(0, Math.min(STEPS.length - 1, found));
    // Named from now on, so the move above happens once.
    const fixed = { ...s, stepIdx: at, stepId: STEPS[at].id };
    saveSession(fixed);
    return fixed;
  });
  const update = (patch: Partial<ReviewSession>) =>
    setSess((cur) => {
      const next = { ...cur, ...patch };
      saveSession(next);
      return next;
    });
  const { stepIdx } = sess;
  // The review's own capture lines: the new item is remembered as captured in this review, and only such items are.
  const captureHere = (text: string) => {
    const id = uid();
    setSess((cur) => {
      const next = { ...cur, captured: [...(cur.captured ?? []), id] };
      saveSession(next);
      return next;
    });
    void capture(text, id);
  };
  const capturedHere = s.stuff.filter((x) => (sess.captured ?? []).includes(x.id));
  // The time the review screen is open is its time: a span opens on arrival, is kept current while it stays open,
  // and closes on leaving. The closing tally counts only inside these spans.
  useEffect(() => {
    const stampNow = () => new Date().toISOString();
    const at = stampNow();
    setSess((cur) => {
      const next = { ...cur, spans: [...(cur.spans ?? []), { from: at, to: at }] };
      saveSession(next);
      return next;
    });
    const close = () =>
      setSess((cur) => {
        const spans = [...(cur.spans ?? [])];
        if (spans.length) spans[spans.length - 1] = { ...spans[spans.length - 1], to: stampNow() };
        const next = { ...cur, spans };
        saveSession(next);
        return next;
      });
    const tick = window.setInterval(close, 20_000);
    return () => {
      window.clearInterval(tick);
      close();
    };
  }, []);
  const inReview = (iso: string | null | undefined) => {
    if (!iso) return false;
    const spans = sess.spans ?? [];
    // The span in progress runs to now.
    return spans.some((sp, i) => iso >= sp.from && (i === spans.length - 1 || iso <= sp.to));
  };
  // F2 renames the row under the cursor in place ("Rewrite anything vague").
  const [renaming, setRenaming] = useState<string | null>(null);
  const markActed = (id: string) => !(sess.acted ?? []).includes(id) && update({ acted: [...(sess.acted ?? []), id] });
  const setStepIdx = (n: number) => update({ stepIdx: n, stepId: STEPS[n].id });
  const step = STEPS[stepIdx];
  const t = today();
  // A step is only struck through once it has been visited and nothing in it is left open.
  useEffect(() => {
    if (!sess.visited.includes(step.id)) update({ visited: [...sess.visited, step.id] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  const ed = editors(ui);
  // Clarify runs inside the Get clear step, so the review never goes away underneath it.
  const [clarifying, setClarifying] = useState<{ run: number } | null>(null);
  const clarify = () => setClarifying((c) => ({ run: (c?.run ?? 0) + 1 }));
  useEffect(() => setClarifying(null), [step.id]);
  // Steps without a list (Get clear, Finish) still need somewhere for focus to land.
  useEffect(() => {
    if (!regionActive) return;
    requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!el || el === document.body) document.querySelector<HTMLElement>(".review-title")?.focus({ preventScroll: true });
    });
  }, [step.id, regionActive]);

  const startOver = () => {
    // The screen stays open, so the new review's time starts now.
    const now = new Date().toISOString();
    const fresh = { ...newSession(), spans: [{ from: now, to: now }] };
    saveSession(fresh);
    setSess(fresh);
    notify("New review started.");
  };

  const projectNext = (pid: ID) => {
    const mine = s.actions.filter((a) => a.project_id === pid).sort((a, b) => a.sort - b.sort);
    const next = mine.find((a) => a.status === "next");
    if (next) return next.title;
    const waiting = mine.find((a) => a.status === "waiting");
    return waiting ? `Waiting · ${waiting.waiting_who ?? "someone"}` : "";
  };
  // The review's checks are built in: each returns a short note, or nothing when all is well.
  const weeks = meta.stallWeeks;
  const projectNote = (p: (typeof s.projects)[number]) => {
    const r = stallReason(s, p);
    // A project that hasn't begun is listed every week all the same, with the day it begins, so a start date can't
    // quietly park it for good; on that day it asks for its first next action.
    const hasNext = s.actions.some((a) => a.project_id === p.id && (a.status === "next" || a.status === "waiting"));
    if (notStarted(p, t)) return `Starts ${formatLong(p.start!)}`;
    if (startsToday(p, t) && !hasNext) return "Starts today: add a next action";
    // The red lamp already says stalled; the note says why.
    return r === "no-next" ? "No next action" : r === "idle" ? `Nothing touched in ${weeks}+ weeks` : undefined;
  };
  const actionNote = (a: Action) => {
    if (a.status === "next" && a.due && a.due < t) return "Overdue";
    if (a.status === "waiting" && isChase(a, t)) return "Follow-up due";
    if (isStale(a)) return a.status === "waiting" ? `Waiting ${weeks}+ weeks without change` : `Untouched for ${weeks}+ weeks`;
    return undefined;
  };
  const projectTitle = (id: ID | null) => s.projects.find((p) => p.id === id)?.title ?? "";
  /** Back from the tickler and not yet decided again: its "Due back" entry waits in the Inbox (or its date has come). */
  const dueBack = (id: ID, back: string | null) => Boolean((back && back <= t) || s.stuff.some((x) => x.status === "inbox" && x.back_id === id));
  /**
   * How a routine's week went, to ask whether each habit still serves you: a daily one counts the days of the last
   * seven on which everything was done, a weekly one whether it was all done this week.
   */
  const routineWeek = (id: ID, repeats: "day" | "week") => {
    const habits = itemsOf(s, id).filter((i) => !i.section);
    if (!habits.length) return repeatsLabel(repeats);
    if (repeats === "week") return `${repeatsLabel(repeats)} · ${habits.every((i) => isTicked(s, i, t)) ? "all done this week" : `${habits.filter((i) => isTicked(s, i, t)).length} of ${habits.length} done this week`}`;
    const days = Array.from({ length: 7 }, (_, k) => addDays(t, -k));
    const full = days.filter((d) => habits.every((i) => s.checklist_ticks.some((k) => k.item_id === i.id && periodOf(k.day, "day") === d))).length;
    return `${repeatsLabel(repeats)} · all done ${full} of the last 7 days`;
  };

  // The subscribed Outlook calendar, two weeks either side: Look back reads what meetings left behind, Upcoming what's ahead.
  const { events, feeds } = useEvents(addDays(t, -14), addDays(t, 14));
  const feedOf = (id: string) => feeds.find((f) => f.id === id);
  const linkedTo = (key: string) => {
    const x = s.appointments.find((a) => a.id === key);
    return x ? projectTitle(x.project_id) || "Untitled project" : "";
  };
  const eventRow = (e: (typeof events)[number]): Row => ({
    key: `e:${e.key}`,
    kind: "event",
    id: e.key,
    title: e.title,
    // Which calendar, and when: "Work · 09:30", "Private · all day".
    // A linked appointment also names its project: "Work · 09:30–10:00 · Launch the new website".
    info: `${feedOf(e.feed)?.name ?? "Calendar"} · ${e.time ? `${e.time}${e.endTime ? `–${e.endTime}` : ""}` : "all day"}${linkedTo(e.key) ? ` · ${linkedTo(e.key)}` : ""}`,
    date: e.date,
    color: feedOf(e.feed)?.color,
  });
  const stepRows: Row[] = useMemo(() => {
    switch (step.id as StepId) {
      case "clear": {
        // The Inbox as a list like every other step, oldest first: clarify or file it without leaving the review.
        const files = new Map<string, number>();
        s.files.forEach((f) => f.owner_kind === "stuff" && files.set(f.owner_id, (files.get(f.owner_id) ?? 0) + 1));
        return s.stuff
          .filter((x) => x.status === "inbox")
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((st) => ({ key: st.id, kind: "stuff", id: st.id, title: stuffTitle(st), info: files.get(st.id) ? plural(files.get(st.id)!, "file") : "", date: st.created_at.slice(0, 10) }));
      }
      case "projects":
        return s.projects
          .filter((p) => p.status === "active")
          .sort((a, b) => Number(Boolean(stallReason(s, b))) - Number(Boolean(stallReason(s, a))) || a.sort - b.sort)
          .map((p) => ({
            key: p.id,
            kind: "project",
            id: p.id,
            title: p.title,
            // The GTD question for each project: what is its next action? (A waiting-only project names who.)
            info: stallReason(s, p) === "no-next" ? "" : projectNext(p.id),
            date: p.due,
            note: projectNote(p),
          }));
      case "next":
        return s.actions
          .filter((a) => a.status === "next")
          .sort((a, b) => Number(Boolean(actionNote(b))) - Number(Boolean(actionNote(a))) || a.sort - b.sort)
          .map((a) => ({ key: a.id, kind: "action", id: a.id, title: a.title, info: projectTitle(a.project_id), date: a.due, note: actionNote(a) }));
      case "waiting":
        // "Chase what's overdue": items to chase first, then by follow-up date.
        return s.actions
          .filter((a) => a.status === "waiting")
          .sort((a, b) => Number(isChase(b, t)) - Number(isChase(a, t)) || (a.followup ?? "9999").localeCompare(b.followup ?? "9999"))
          .map((a) => ({
            key: a.id,
            kind: "action",
            id: a.id,
            title: a.title,
            info: `${a.waiting_who ?? "?"}${a.waiting_since ? ` · ${waitedFor(daysBetween(a.waiting_since, t))}` : ""}`,
            date: a.followup,
            note: actionNote(a),
          }));
      case "someday":
        return [
          ...s.projects.filter((p) => p.status === "someday").map((p) => ({ key: p.id, kind: "project" as const, id: p.id, title: p.title, info: "Project", date: p.bring_back, note: dueBack(p.id, p.bring_back) ? "Due back" : undefined })),
          ...s.actions.filter((a) => a.status === "someday").map((a) => ({ key: a.id, kind: "action" as const, id: a.id, title: a.title, info: projectTitle(a.project_id), date: a.bring_back, note: dueBack(a.id, a.bring_back) ? "Due back" : undefined })),
        ];
      case "lookback": {
        // GTD's "review the previous calendar": everything finished in the last two weeks, newest first, since a
        // finished action or project is where a follow-up most often hides.
        const from = addDays(t, -14);
        const recent = (d: string | null) => Boolean(d && d.slice(0, 10) >= from);
        return [
          ...s.projects.filter((p) => p.status === "done" && recent(p.completed_at)).map((p) => ({ key: p.id, kind: "project" as const, id: p.id, title: p.title, info: "Project completed", date: p.completed_at!.slice(0, 10) })),
          ...s.actions.filter((a) => a.status === "done" && recent(a.completed_at)).map((a) => ({ key: a.id, kind: "action" as const, id: a.id, title: a.title, info: projectTitle(a.project_id), date: a.completed_at!.slice(0, 10) })),
          ...events.filter((e) => e.date < t).map(eventRow),
        ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      }
      case "creative": {
        // Each area with the active projects looking after it; an area with none is noted (it may be deliberate).
        const active = (id: ID) => s.projects.filter((p) => p.status === "active" && p.area_id === id).length;
        // GTD's higher horizons too: each goal with the projects serving it; a goal with none is noted.
        const serving = (id: ID) => s.projects.filter((p) => p.status === "active" && p.goal_id === id).length;
        return [
          ...s.horizons
            .filter((h) => h.kind === "goal" && h.status === "active")
            .sort((a, b) => a.sort - b.sort)
            .map((g) => ({ key: g.id, kind: "goal" as const, id: g.id, title: g.title || "Untitled goal", info: plural(serving(g.id), "active project"), date: g.target, note: serving(g.id) ? undefined : "No project serves it" })),
          ...[...s.areas]
            .sort((a, b) => a.sort - b.sort)
            .map((a) => ({ key: a.id, kind: "area" as const, id: a.id, title: `#${a.name}`, info: plural(active(a.id), "active project"), date: null, note: active(a.id) ? undefined : "No active project" })),
        ];
      }
      case "checklists": {
        // Every checklist, with its area and how far a run under way has got.
        const areaOf = (id: ID | null) => s.areas.find((a) => a.id === id);
        return s.checklists
          .filter((c) => c.status === "active")
          .sort((a, b) => a.sort - b.sort)
          .map((c) => {
            const p = progress(s, c.id);
            const area = areaOf(c.area_id);
            return { key: c.id, kind: "checklist" as const, id: c.id, title: c.title || "Untitled checklist", info: [area ? `#${area.name}` : "", c.repeats ? routineWeek(c.id, c.repeats) : progressLabel(p) || plural(p.total, "item")].filter(Boolean).join(" · "), date: c.finished_at?.slice(0, 10) ?? null };
          });
      }
      case "upcoming": {
        const end = addDays(t, 14);
        const within = (d: string | null) => Boolean(d && d <= end);
        const out: Row[] = [];
        for (const a of s.actions.filter((a) => ["next", "waiting", "someday"].includes(a.status))) {
          const pairs: [string, string | null][] = [
            ["Due", a.due],
            ["Starts", a.defer],
            ["Follow up", a.status === "waiting" ? a.followup : null],
            ["Comes back", a.bring_back],
          ];
          for (const [label, d] of pairs) if (within(d)) out.push({ key: `${a.id}:${label}`, kind: "action", id: a.id, title: a.title, info: label, date: d });
        }
        for (const p of s.projects.filter((p) => p.status === "active" || p.status === "someday")) {
          if (within(p.due)) out.push({ key: `${p.id}:due`, kind: "project", id: p.id, title: p.title, info: "Project due", date: p.due });
          if (within(p.bring_back)) out.push({ key: `${p.id}:back`, kind: "project", id: p.id, title: p.title, info: "Comes back", date: p.bring_back });
        }
        for (const e of events.filter((e) => e.date >= t)) out.push(eventRow(e));
        return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      }
      default:
        return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, step.id, weeks, events, feeds]);
  // Each step's list sorts from its headings too, remembered per step.
  const [sort, setSort] = useSort(`review:${step.id}`);
  const sorters: Sorters<Row> = useMemo(() => ({ subject: (r) => r.title, info: (r) => r.info, date: (r) => r.date }), []);
  const rows = useMemo(() => sortGroups([{ key: step.id, label: "", rows: stepRows }], sorters, sort)[0].rows, [stepRows, sorters, sort, step.id]);

  const nav = useListNav(`review:${step.id}`, useMemo(() => [{ key: step.id, rowKeys: rows.map((r) => r.key), showHeader: false }], [rows, step.id]));
  const focusRow = rows.find((r) => r.key === nav.focus);
  useEffect(() => {
    ui.followDetail(focusRow && focusRow.kind !== "area" && focusRow.kind !== "checklist" && focusRow.kind !== "goal" ? { kind: focusRow.kind, id: focusRow.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow?.key]);
  /** ⌘↵ on any step: you've been through it; it counts as clear once nothing in it is open. Then the next step. */
  const doneHere = () => {
    markActed(step.id);
    setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1));
  };
  const targetsOf = (kind: Row["kind"]) =>
    [...new Set(nav.targets().map((k) => rows.find((r) => r.key === k)).filter((r): r is Row => Boolean(r && r.kind === kind)).map((r) => r.id))];

  const finish = async () => {
    await fetch("/api/review/complete", { method: "POST" });
    await load();
    clearSession();
    // Say what is true: only a review with nothing left open earns "your system is current".
    notify(
      notClear.length
        ? `Weekly review recorded ${formatLong(t)}. ${plural(notClear.length, "step")} not clear.`
        : `Weekly review recorded ${formatLong(t)}. Your system is current.`,
    );
    ui.go("next");
  };

  /** The GTD fix for a stalled project: give it a next action, right here (same flow as T on Projects). */
  const addNextAction = (projectId: ID) => projectEditors(ui).addNextAction(projectId);

  const inboxItems = s.stuff.filter((x) => x.status === "inbox").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const inboxCount = inboxItems.length;

  /** What is still open in each step: the number shown beside it, and what keeps it from being struck through. */
  const openCount = (id: StepId): number => {
    switch (id) {
      case "clear":
        return inboxCount;
      case "projects":
        // Stalled (no next action) and idle (untouched for weeks) are both open here: the review asks about each.
        return s.projects.filter((p) => stallReason(s, p) !== null).length;
      case "next":
        return s.actions.filter((a) => a.status === "next" && actionNote(a)).length;
      case "waiting":
        return s.actions.filter((a) => a.status === "waiting" && actionNote(a)).length;
      case "someday":
        return [...s.projects, ...s.actions].filter((x) => x.status === "someday" && dueBack(x.id, x.bring_back)).length;
      case "upcoming": {
        // Anything whose date has already passed is open: a missed due date, follow-up, start or tickler.
        const past = (d: string | null) => Boolean(d && d < t);
        const acts = s.actions.filter((a) => ["next", "waiting", "someday"].includes(a.status) && (past(a.due) || (a.status === "waiting" && past(a.followup)) || past(a.bring_back)));
        const projs = s.projects.filter((p) => (p.status === "active" || p.status === "someday") && (past(p.due) || past(p.bring_back)));
        return acts.length + projs.length;
      }
      default:
        return 0;
    }
  };
  // What this review did: the closing tally, counted only while the review screen was open (see the spans above).
  const tally = [
    [s.stuff.filter((x) => inReview(x.processed_at)).length, "item", "clarified"],
    [s.actions.filter((a) => a.status === "done" && inReview(a.completed_at)).length, "action", "done"],
    [s.actions.filter((a) => inReview(a.created_at) && ["next", "waiting"].includes(a.status)).length, "new action", "added"],
    [s.projects.filter((p) => p.status === "done" && inReview(p.completed_at)).length, "project", "completed"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, noun, verb]) => `${plural(n as number, noun as string)} ${verb}`);
  // Visiting is not reviewing (owner's decision after the GTD critique): a step is clear only once you've said so with
  // ⌘↵ "Reviewed", and while nothing in it is left open.
  const isDone = (id: StepId) => id !== "finish" && (sess.acted ?? []).includes(id) && openCount(id) === 0;
  const notClear = STEPS.slice(0, -1)
    .map((st, i) => ({ st, i, n: openCount(st.id) }))
    .filter((x) => !isDone(x.st.id));
  const clearSteps = STEPS.length - 1 - notClear.length;
  /** Why a step is not clear yet, in a few words. */
  const whyOpen = ({ st, n }: { st: (typeof STEPS)[number]; n: number }) =>
    n > 0 ? `${n} open` : "not marked reviewed";

  /**
   * "Reviewed, still current" (critique: an untouched-for-weeks flag could only be cleared by editing). It counts as
   * touching what is under the cursor, or ticked, that carries that flag, and changes nothing else: the flag clears
   * and the stall clock restarts. Other flags (overdue, follow-up due, no next action) are cleared by acting on them.
   */
  const stillCurrent = () => {
    const now = new Date().toISOString();
    // Only the untouched-for-weeks warning is about being current; overdue, chase and no-next-action are not.
    const acts = targetsOf("action").filter((id) => {
      const a = s.actions.find((x) => x.id === id);
      return Boolean(a && isStale(a));
    });
    const projs = targetsOf("project").filter((id) => {
      const p = s.projects.find((x) => x.id === id);
      return Boolean(p && stallReason(s, p) === "idle");
    });
    if (!acts.length && !projs.length) {
      notify("Nothing here is flagged as untouched: R clears that flag only. Overdue and follow-ups are cleared by acting on them.");
      return;
    }
    // A stale project always has open actions (one with none is stalled for want of a next action, not staleness):
    // it is touched through them.
    const viaProjects = s.actions.filter((a) => a.project_id && projs.includes(a.project_id) && ["next", "waiting"].includes(a.status)).map((a) => a.id);
    const n = acts.length + projs.length;
    patchMany("actions", [...new Set([...acts, ...viaProjects])], { updated_at: now }, `${n === 1 ? "Still current" : `${n} still current`}: reviewed`);
  };
  /** A row flagged only for being untouched for the stall threshold: the one flag R ("still current") clears. */
  function isStaleRow(r: Row) {
    if (r.kind === "action") {
      const a = s.actions.find((x) => x.id === r.id);
      return Boolean(a && isStale(a));
    }
    if (r.kind === "project") {
      const p = s.projects.find((x) => x.id === r.id);
      return Boolean(p && stallReason(s, p) === "idle");
    }
    return false;
  }
  /** Get creative: a goal no project serves gets one here, serving it, then its first next action. */
  const newProjectFor = (goalId: ID) => {
    const goal = s.horizons.find((h) => h.id === goalId);
    ui.openPicker({
      type: "text",
      title: `New project for “${goal?.title ?? "the goal"}”`,
      current: "",
      placeholder: "The outcome, verb first",
      onPick: (v) => {
        const title = (v ?? "").trim();
        if (!title) return;
        const p = newProject({ title, goal_id: goalId, area_id: goal?.area_id ?? null });
        mutate(`New project “${title}”`, [{ type: "create", table: "projects", row: { ...p } }]);
        window.setTimeout(() => addNextAction(p.id), 0);
      },
    });
  };
  /** Get creative: an area without the project it needs gets one here, filed in it, then its first next action. */
  const newProjectIn = (areaId: ID) => {
    const area = s.areas.find((a) => a.id === areaId);
    ui.openPicker({
      type: "text",
      title: `New project in #${area?.name ?? "area"}`,
      current: "",
      placeholder: "The outcome, verb first",
      onPick: (v) => {
        const title = (v ?? "").trim();
        if (!title) return;
        const p = newProject({ title, area_id: areaId });
        mutate(`New project “${title}”`, [{ type: "create", table: "projects", row: { ...p } }]);
        window.setTimeout(() => addNextAction(p.id), 0);
      },
    });
  };

  const commands: Command[] = [
    ...nav.commands,
    { id: "rv.next", label: "Next step", group: "Review", keys: ["mod+."], inInput: true, run: () => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1)) },
    { id: "rv.prev", label: "Previous step", group: "Review", keys: ["mod+,"], inInput: true, run: () => setStepIdx(Math.max(0, stepIdx - 1)) },
    { id: "rv.clarify", label: "Clarify", group: "Review", keys: ["k"], enabled: step.id === "clear" && inboxCount > 0, run: clarify },
    {
      id: "rv.addnext",
      label: "Add a next action to this project",
      group: "Review",
      keys: ["t", "n"],
      enabled: step.id === "projects" && focusRow?.kind === "project",
      run: () => focusRow && addNextAction(focusRow.id),
    },
    {
      id: "rv.addwaiting",
      label: "Add a waiting for to this project",
      group: "Review",
      keys: ["w"],
      enabled: step.id === "projects" && focusRow?.kind === "project",
      run: () => focusRow && projectEditors(ui).addWaiting(focusRow.id),
    },
    // Look back: a finished item's loose end becomes a next action or a waiting for, in the same project.
    {
      id: "rv.followup",
      label: "Add a follow-up next action",
      group: "Review",
      keys: ["t"],
      enabled: step.id === "lookback",
      run: () => {
        const pid = focusRow ? (focusRow.kind === "project" ? focusRow.id : s.actions.find((a) => a.id === focusRow.id)?.project_id) : null;
        if (pid) addNextAction(pid);
        else quickAddNextAction(ui);
      },
    },
    {
      id: "rv.followwait",
      label: "Add a follow-up waiting for",
      group: "Review",
      keys: ["w"],
      enabled: step.id === "lookback",
      run: () => {
        const pid = focusRow ? (focusRow.kind === "project" ? focusRow.id : s.actions.find((a) => a.id === focusRow.id)?.project_id) : null;
        if (pid) projectEditors(ui).addWaiting(pid);
        else quickAddWaiting(ui);
      },
    },
    // Checklists: a checklist is a trigger for new actions (GTD); its items stay as they are.
    { id: "rv.checkaction", label: "New next action", group: "Review", keys: ["t"], enabled: step.id === "checklists", run: () => quickAddNextAction(ui) },
    ...notClear.slice(0, 10).map((x, n) => ({
      id: `rv.jump${n + 1}`,
      label: `Go to step: ${x.st.title}`,
      group: "Review",
      keys: [stepKey(n)],
      enabled: step.id === "finish",
      hidden: true,
      run: () => setStepIdx(x.i),
    })),
    { id: "rv.file", label: "File", group: "Review", keys: ["v"], enabled: targetsOf("stuff").length > 0, run: () => fileStuff(ui, targetsOf("stuff")) },
    { id: "rv.new", label: "Start a new review (forget this one's progress)", group: "Review", keys: [], run: startOver },
    { id: "rv.finish", label: "Record the review", group: "Review", keys: ["mod+enter"], enabled: step.id === "finish", run: () => void finish() },
    { id: "rv.here", label: step.id === "sweep" ? "My head is empty: next step" : step.id === "papers" ? "All collected: next step" : "Reviewed: next step", group: "Review", keys: ["mod+enter"], inInput: true, enabled: step.id !== "finish", run: doneHere },
    {
      id: "rv.project",
      label: "Link the appointment to a project",
      group: "Review",
      keys: ["p"],
      enabled: focusRow?.kind === "event",
      run: () => {
        const e = events.find((x) => x.key === focusRow?.id);
        if (e) linkAppointment(ui, e);
      },
    },
    {
      id: "rv.open",
      label: focusRow?.kind === "checklist" ? "Open the checklist" : "Open details",
      group: "Review",
      keys: ["enter"],
      enabled: Boolean(focusRow) && focusRow?.kind !== "area",
      run: () => {
        if (!focusRow || focusRow.kind === "area") return;
        // A checklist opens in Checklists; the review keeps its place for when you come back.
        if (focusRow.kind === "checklist") {
          ui.go("checklists");
          openChecklist(focusRow.id);
        } else if (focusRow.kind === "goal") ui.go("horizons");
        else ui.openDetail({ kind: focusRow.kind, id: focusRow.id }, true);
      },
    },
    {
      id: "rv.done",
      label: step.id === "someday" ? "Activate" : "Mark done",
      group: "Review",
      // E is Done everywhere; bringing a someday item back to life is A (Activate).
      keys: [step.id === "someday" ? "a" : "e"],
      enabled: Boolean(focusRow) && !["lookback", "creative", "checklists"].includes(step.id),
      run: () => {
        const a = targetsOf("action");
        const p = targetsOf("project");
        if (targetsOf("stuff").length) doneNow(targetsOf("stuff"));
        if (step.id === "someday") {
          if (a.length) patchMany("actions", a, { status: "next" }, `${plural(a.length, "action")} activated`);
          if (p.length) patchMany("projects", p, { status: "active" }, `${plural(p.length, "project")} activated`);
        } else {
          if (a.length) completeActions(a);
          if (p.length) projectEditors(ui).complete(p);
        }
      },
    },
    { id: "rv.move", label: "Move", group: "Review", keys: ["v"], enabled: targetsOf("action").length > 0 && step.id !== "lookback", run: () => ed.move(targetsOf("action")) },
    {
      id: "rv.current",
      label: "Reviewed: still current",
      group: "Review",
      keys: ["r"],
      enabled: ["next", "waiting", "projects"].includes(step.id) && Boolean(focusRow),
      run: stillCurrent,
    },
    {
      id: "rv.rename",
      label: "Rename",
      group: "Review",
      keys: ["f2"],
      enabled: Boolean(focusRow) && (focusRow?.kind === "action" || focusRow?.kind === "project") && !["lookback", "upcoming"].includes(step.id),
      run: () => focusRow && setRenaming(focusRow.key),
    },
    {
      id: "rv.newproject",
      label: focusRow?.kind === "goal" ? "New project for this goal" : "New project in this area",
      group: "Review",
      keys: ["n"],
      enabled: step.id === "creative" && (focusRow?.kind === "area" || focusRow?.kind === "goal"),
      run: () => focusRow && (focusRow.kind === "goal" ? newProjectFor(focusRow.id) : newProjectIn(focusRow.id)),
    },
    { id: "rv.due", label: step.id === "waiting" ? "Follow-up date" : "Due date", group: "Fields", keys: ["d"], enabled: targetsOf("action").length > 0 && step.id !== "lookback", run: () => ed.date(targetsOf("action"), step.id === "waiting" ? "followup" : "due") },
    { id: "rv.back", label: "Bring back on", group: "Fields", keys: ["b"], enabled: targetsOf("action").length > 0 && step.id !== "lookback", run: () => ed.date(targetsOf("action"), "bring_back") },
    {
      id: "rv.trash",
      label: "Trash",
      group: "Review",
      keys: ["backspace", "delete"],
      enabled: Boolean(focusRow) && !["lookback", "creative", "checklists"].includes(step.id),
      run: () => {
        const a = targetsOf("action");
        const p = targetsOf("project");
        if (targetsOf("stuff").length) trashNow(targetsOf("stuff"));
        if (a.length) patchMany("actions", a, { status: "trashed" }, `${plural(a.length, "action")} trashed`);
        if (p.length) patchMany("projects", p, { status: "trashed" }, `${plural(p.length, "project")} trashed`);
      },
    },
  ];
  // While Clarify runs in the step, its keys are the only ones live.
  useCommands("review", commands, { priority: 12, active: regionActive && !clarifying });

  const last = lastReview(s);
  const clarifyHost = {
    leave: () => setClarifying(null),
    backLabel: "Back to Get clear",
    offerNext: false,
  };

  const columns: Column<Row>[] = [
    { key: "mark", label: "", width: "30px", render: (r) => (r.kind === "area" ? null : r.kind === "goal" ? <span className="kind-icon"><Target size={14} strokeWidth={1.75} aria-hidden /></span> : r.kind === "checklist" ? <span className="kind-icon"><ListChecks size={14} strokeWidth={1.75} aria-hidden /></span> : r.kind === "event" ? <EventMark color={r.color} /> : r.kind === "project" ? <Lamp health={healthOf(r.id)} start={s.projects.find((x) => x.id === r.id)?.start} appt={apptOf(r.id)} /> : r.kind === "stuff" ? <span className="kind-icon">{stuffIcon(s.stuff.find((x) => x.id === r.id))}</span> : <Marker />) },
    {
      key: "subject",
      // Name what the rows are; the step title is already on the tab and the heading.
      label: ({ clear: "Stuff", projects: "Project", next: "Action", waiting: "Waiting for", someday: "Item", lookback: "Finished", upcoming: "Item", creative: "Goal or area", checklists: "Checklist" } as Record<string, string>)[step.id] ?? "",
      width: "minmax(220px, 2fr)",
      render: (r) =>
        renaming === r.key ? (
          <InlineEdit
            value={r.title}
            placeholder={r.kind === "project" ? "Name the project" : "Describe the next action"}
            onDone={(v) => {
              setRenaming(null);
              const title = v.trim();
              if (title && title !== r.title) mutate("Renamed", [{ type: "patch", table: r.kind === "project" ? "projects" : "actions", id: r.id, data: { title } }]);
            }}
          />
        ) : (
          <span className="subject">
            <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title || "Untitled"}</span>
            {r.note && <span className="flag-note">{r.note}</span>}
          </span>
        ),
    },
    { key: "info", blank: (r) => !r.info, label: ({ clear: "Files", projects: "Next action", next: "Project", waiting: "Waiting on", someday: "Project", lookback: "Project", upcoming: "What", creative: "Projects", checklists: "Items" } as Record<string, string>)[step.id] ?? "", width: "minmax(120px, 1fr)", render: (r) => (r.info ? <span className="muted-text">{r.kind === "stuff" && <Paperclip size={12} strokeWidth={2} aria-hidden />} {r.info}</span> : <span className="dash" aria-hidden="true">–</span>) },
    // Name the date each step shows, rather than a generic "Date".
    { key: "date", blank: (r) => !r.date, label: ({ clear: "Captured", projects: "Due", next: "Due", waiting: "Follow up", someday: "Comes back", lookback: "Done", upcoming: "Date", checklists: "Last finished" } as Record<string, string>)[step.id] ?? "Date", width: "96px", render: (r) => <DateCell date={r.date} kind={["someday", "clear", "lookback", "checklists"].includes(step.id) ? "plain" : "due"} /> },
  ];
  /** A project's next linked appointment, which its lamp names. */
  function apptOf(id: ID) {
    const p = s.projects.find((x) => x.id === id);
    return p ? nextAppointment(s, p) : null;
  }
  function healthOf(id: ID) {
    const p = s.projects.find((x) => x.id === id);
    return p ? projectHealth(s, p) : "done";
  }

  // During the Mind sweep its own capture line is the one to use: the app's capture bar steps aside on a phone.
  useEffect(() => {
    if (step.id !== "sweep") return;
    document.body.dataset.sweep = "1";
    return () => void delete document.body.dataset.sweep;
  }, [step.id]);
  // On a phone the steps are one sideways-scrolling strip: keep the current one in view.
  useEffect(() => {
    document.querySelector(".review-steps .is-current")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [stepIdx]);
  return (
    <div className="review">
      <ol className="review-steps" aria-label="Review steps">
        {STEPS.map((st, i) => [
          // Allen's three phases name themselves where each begins; screen readers hear the phase in each step's name.
          st.phase && st.phase !== STEPS[i - 1]?.phase && (
            <li key={`phase-${st.phase}`} className="review-phase" aria-hidden="true">
              {st.phase}
            </li>
          ),
          <li key={st.id} className={`${i === stepIdx ? "is-current" : ""} ${isDone(st.id) ? "is-done" : ""}`} aria-current={i === stepIdx ? "step" : undefined}>
            <button type="button" onClick={() => setStepIdx(i)}>
              {st.phase && <span className="visually-hidden">{st.phase}: </span>}
              {st.title}
              {openCount(st.id) > 0 && (
                <>
                  <span className="step-count" aria-hidden="true">
                    {openCount(st.id)}
                  </span>
                  <span className="visually-hidden">, {openCount(st.id)} open</span>
                </>
              )}
              {isDone(st.id) && <span className="visually-hidden">(done)</span>}
            </button>
          </li>,
        ])}
      </ol>
      <div className="review-head">
        <h2 className="review-title" tabIndex={-1}>
          <span className="visually-hidden">
            Step {stepIdx + 1} of {STEPS.length}:{" "}
          </span>
          {step.title}
        </h2>
        {/* On a phone the step strip scrolls out of sight: say where in the review you are. */}
        <span className="step-of" aria-hidden="true">
          {step.phase ? `${step.phase} · ` : ""}Step {stepIdx + 1} of {STEPS.length}
        </span>
        <p className="muted-text">{step.note}</p>

      </div>
      {step.id === "clear" && clarifying ? (
        <ClarifyView key={clarifying.run} regionActive={regionActive} host={clarifyHost} />
      ) : step.id === "papers" ? (
        <div className="review-panel">
          <IdeaCapture
            onCapture={captureHere}
            captured={capturedHere.filter((x) => x.status === "inbox").length}
            label="A paper or note that needs a decision"
            placeholder="Enter puts it in the Inbox; the paper itself can go once it's typed"
          />
        </div>
      ) : step.id === "sweep" ? (
        <MindSweep onDone={doneHere} captured={[...capturedHere].sort((a, b) => b.created_at.localeCompare(a.created_at))} onCapture={captureHere} active={regionActive} />
      ) : step.id === "finish" ? (
        <div className="review-panel review-finish">
          {/* The end of the week leads with what you cleared, then what is still open. */}
          <Tag size="md">{notClear.length ? "Ready to record" : "Everything reviewed"}</Tag>
          <p className="clarify-msg">
            {clearSteps} of {STEPS.length - 1} steps clear{tally.length ? ` · ${tally.join(" · ")}` : ""}.
          </p>
          {notClear.length ? (
            <>
              <p className="muted-text">Not clear yet, if you want to go back:</p>
              <KeyChoices choices={notClear.slice(0, 10).map((x, n) => ({ k: stepKey(n), label: `${x.st.title}: ${whyOpen(x)}`, run: () => setStepIdx(x.i) }))} />
            </>
          ) : (
            <p className="muted-text">Every list has been through the review and nothing is left open.</p>
          )}
          <p className="muted-text">
            {last ? `Last review: ${formatLong(last.slice(0, 10))}.` : "This is your first review."} Recording it takes you back to Next Actions.
          </p>
        </div>
      ) : (
        <>
        {step.id === "creative" && <IdeaCapture onCapture={captureHere} captured={capturedHere.filter((x) => x.status === "inbox").length} />}
        <Grid
          listId={`review:${step.id}`}
          sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
          label={`Weekly Review, ${step.title}`}
          columns={columns}
          groups={[{ key: step.id, label: "", rows }]}
          getKey={(r) => r.key}
          nav={nav}
          active={regionActive}
          showHeaders={false}
          rowClass={(r) => (r.note ? "is-flagged-row" : "")}
          empty={<p className="muted-text">{step.id === "clear" ? "The Inbox is empty. Move on to the next step." : step.id === "lookback" ? "Nothing was finished in the last two weeks. Move on to the next step." : step.id === "creative" ? "No areas yet. Add them in Settings › Areas; until then, capture anything new above." : step.id === "checklists" ? "No checklists yet. Keep the lists you run again and again in Checklists. Move on to the next step." : "Nothing here. Move on to the next step."}</p>}
        />
        </>
      )}
      {!clarifying && (
        <KeyHints
          hints={[
            // On touch the step bar is right above: moving between steps is a tap there, not a button here.
            ...(step.id !== "finish" ? [{ k: "mod+.", label: "Next step", touch: "hide" as const }] : []),
            { k: "mod+,", label: "Previous", touch: "hide" as const },
            ...(step.id === "projects" && focusRow?.kind === "project" ? [{ k: "t", label: "Add next action" }, { k: "w", label: "Add waiting for" }] : []),
            ...(["next", "waiting", "projects"].includes(step.id) && rows.some(isStaleRow) ? [{ k: "r", label: "Still current" }] : []),
            ...(step.id === "next" && rows.length > 0 ? [{ k: "f2", label: "Rewrite" }] : []),
            ...(step.id === "creative" && (focusRow?.kind === "area" || focusRow?.kind === "goal") ? [{ k: "n", label: focusRow?.kind === "goal" ? "New project for it" : "New project here" }] : []),
            ...(step.id === "clear" && inboxCount > 0 ? [{ k: "k", label: "Clarify" }, { k: "v", label: "File" }] : []),
            ...(step.id === "finish" ? [{ k: "mod+enter", label: "Record the review" }] : []),
            ...(step.id === "lookback" && rows.length > 0 ? [{ k: "enter", label: "Open" }, { k: "t", label: "Add follow-up" }, { k: "w", label: "Add waiting for" }] : []),
            ...(step.id === "checklists" ? [...(rows.length > 0 ? [{ k: "enter", label: "Open" }] : []), { k: "t", label: "New next action" }] : []),
            ...(step.id !== "finish" ? [{ k: "mod+enter", label: step.id === "sweep" ? "Head empty" : step.id === "papers" ? "All collected" : "Reviewed", primary: true }] : []),
            ...(!["finish", "lookback", "sweep", "papers", "creative", "checklists"].includes(step.id) && rows.length > 0 ? [{ k: "enter", label: "Open" }, { k: step.id === "someday" ? "a" : "e", label: step.id === "someday" ? "Activate" : "Done" }] : []),
          ]}
        />
      )}
    </div>
  );
}

/**
 * GTD's incompletion triggers, condensed: prompts to read down during a mind sweep, each with a few examples to jog
 * the memory. Nothing here is a list to tick; it is only there to bring open loops to mind.
 */
const TRIGGERS: { title: string; items: [string, string][] }[] = [
  {
    title: "Work",
    items: [
      ["Projects started, not finished", "anything begun and left hanging"],
      ["Projects to start", "ideas, improvements, things you mean to set up"],
      ["Promises to others", "your manager, colleagues, customers, suppliers"],
      ["Calls and emails", "to make, to answer, to follow up"],
      ["Meetings", "coming up, to arrange, to prepare, to follow up"],
      ["Waiting on others", "replies, decisions, deliveries, approvals"],
      ["Documents", "to write, finish, review or sign"],
      ["Money", "invoices, expenses, budgets, orders"],
      ["People", "hiring, feedback, one-to-ones, thanks owed"],
      ["Systems", "computer, software, files, the workplace"],
      ["Learning", "courses, reading, skills to build"],
    ],
  },
  {
    title: "Home",
    items: [
      ["Promises to family and friends", "visits, favours, things you said you'd do"],
      ["The home", "repairs, improvements, garden, car"],
      ["Errands", "shopping, returns, things to pick up"],
      ["Health", "appointments, check-ups, exercise"],
      ["Money", "bills, taxes, insurance, subscriptions"],
      ["Paperwork", "contracts, renewals, passports, forms"],
      ["Occasions", "birthdays, holidays, travel, celebrations"],
      ["Hobbies and rest", "things you want to do, see or learn"],
      ["Anything else", "whatever is on your mind right now"],
    ],
  },
];

/** Get creative's capture line: anything new goes to the Inbox, to be clarified like everything else. */
function IdeaCapture({
  captured,
  onCapture,
  label = "Anything new? A project, an idea, a someday wish",
  placeholder = "Enter puts it in the Inbox",
}: {
  captured: number;
  onCapture: (text: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  return (
    <label className="field idea-capture">
      <span className="field-label">{label}</span>
      <input
        className="field-text"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey || e.defaultPrevented) return;
          if (e.key === "Enter" && text.trim()) {
            e.preventDefault();
            onCapture(text);
            setText("");
          } else if (e.key === "Escape") e.currentTarget.blur();
        }}
      />
      {captured > 0 && <span className="sweep-help">{plural(captured, "item")} captured in this review wait in the Inbox; clarify them before you finish.</span>}
    </label>
  );
}

/**
 * The review's first step: a capture line beside the trigger list. Each line is captured to the Inbox as it is
 * entered (no deciding yet: Get clear, next, is where it is clarified), and what this review has captured is listed
 * under the line, newest first.
 */
function MindSweep({ captured, active, onDone, onCapture }: { captured: Stuff[]; active: boolean; onDone: () => void; onCapture: (text: string) => void }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Arriving on the step puts the cursor in the line, after the click or key that brought you here has settled.
  useEffect(() => {
    if (!active) return;
    const f = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(f);
  }, [active]);
  return (
    <div className="sweep">
      <div className="sweep-capture">
        <label className="field">
          <span className="field-label">What does this bring to mind?</span>
          <input
            ref={input}
            className="field-text"
            value={text}
            placeholder="One thought at a time"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // ⌘↵ is "my head is empty" (the review's own key), not a capture.
              if (e.metaKey || e.ctrlKey || e.defaultPrevented) return;
              if (e.key === "Enter" && text.trim()) {
                e.preventDefault();
                onCapture(text);
                setText("");
              } else if (e.key === "Escape") {
                e.currentTarget.blur();
                document.querySelector<HTMLElement>(".review-title")?.focus({ preventScroll: true });
              }
            }}
          />
        </label>
        <p className="sweep-help">Enter puts it in the Inbox. No need to decide anything yet.</p>
        {/* Each capture is confirmed to screen readers as it lands (critique: the list grew silently). */}
        <span className="visually-hidden" aria-live="polite">
          {captured.length ? `Captured: ${stuffTitle(captured[0]) || "Untitled"}. ${captured.length} in this review.` : ""}
        </span>
        {/* Nothing captured can still be a clear head: say so, rather than the step counting as done by being passed. */}
        <button type="button" className="text-btn sweep-empty" onClick={onDone}>
          {captured.length ? "That's everything: next step" : "My head is empty: next step"}
        </button>
        {captured.length > 0 && (
          <section className="sweep-captured" aria-label="Captured in this review">
            <h3 className="detail-h">
              Captured in this review <span className="count">{captured.length}</span>
            </h3>
            <ul>
              {captured.map((x) => (
                <li key={x.id}>{stuffTitle(x) || "Untitled"}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="sweep-triggers">
        {TRIGGERS.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="sweep-h">{g.title}</h3>
            <ul>
              {g.items.map(([what, ex]) => (
                <li key={what}>
                  <span className="sweep-what">{what}</span>
                  <span className="sweep-ex">{ex}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** How long something has been waited on, in one format: "today", "1 day", "4 days". */
function stuffIcon(st: Stuff | undefined) {
  return st?.kind === "email" ? <Mail size={14} strokeWidth={1.75} aria-label="Email" /> : st?.kind === "file" ? <FileText size={14} strokeWidth={1.75} aria-label="File" /> : <StickyNote size={14} strokeWidth={1.75} aria-label="Note" />;
}

function waitedFor(days: number) {
  return days <= 0 ? "today" : plural(days, "day");
}
