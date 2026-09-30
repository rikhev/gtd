import { useEffect, useMemo, useState } from "react";
import { FileText, Mail, Paperclip, StickyNote } from "lucide-react";
import { completeActions, isChase, isStale, isStalled, lastReview, notStarted, startsToday, projectHealth, patchMany, plural, stallReason, useMeta, useStore, load, notify } from "../store.ts";
import { clearSession, loadSession, newSession, saveSession, type ReviewSession } from "../reviewSession.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, useSort, sortGroups, type Column, type Sorters } from "../components/Grid.tsx";
import { DateCell, KeyChoices, KeyHints, Lamp, Marker, Tag } from "../components/bits.tsx";
import { editors } from "../actionCommands.tsx";
import { projectEditors } from "./ProjectsView.tsx";
import { ClarifyView } from "./ClarifyView.tsx";
import { stuffTitle } from "./InboxView.tsx";
import { doneNow, fileStuff, trashNow } from "../fileStuff.ts";
import { addDays, formatLong, today, daysBetween } from "../../shared/dates.ts";
import type { Action, ID, Stuff } from "../../shared/types.ts";

const STEPS = [
  { id: "clear", title: "Get clear", note: "Empty the Inbox so nothing is floating around." },
  { id: "projects", title: "Projects", note: "Every active project needs a next action. Complete, defer or drop the rest." },
  { id: "next", title: "Next actions", note: "Mark what's done. Rewrite anything vague." },
  { id: "waiting", title: "Waiting for", note: "Chase what's overdue. Close what arrived." },
  { id: "someday", title: "Someday / Maybe", note: "Activate anything whose time has come. Drop what no longer matters." },
  { id: "upcoming", title: "Upcoming", note: "Due, starting, follow-ups and tickler dates in the next two weeks." },
  { id: "finish", title: "Finish", note: "Record the review." },
] as const;
type StepId = (typeof STEPS)[number]["id"];

interface Row {
  key: string;
  kind: "project" | "action" | "stuff";
  id: ID;
  title: string;
  info: string;
  date: string | null;
  /** A built-in check that needs attention: stalled, overdue, untouched, follow-up due, due back. */
  note?: string;
}

export function ReviewView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const meta = useMeta();
  const s = useStore((x) => x);
  // The review in progress survives leaving the view: stepping out to fix something resumes here.
  const [sess, setSess] = useState<ReviewSession>(loadSession);
  const update = (patch: Partial<ReviewSession>) =>
    setSess((cur) => {
      const next = { ...cur, ...patch };
      saveSession(next);
      return next;
    });
  const { stepIdx } = sess;
  const visited = useMemo(() => new Set(sess.visited), [sess.visited]);
  const setStepIdx = (n: number) => update({ stepIdx: n });
  const step = STEPS[stepIdx];
  const t = today();
  // A step is only struck through once it has been visited and nothing in it is left open.
  useEffect(() => {
    if (!sess.visited.includes(step.id)) update({ visited: [...sess.visited, step.id] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  const ed = editors(ui);
  // Clarify runs inside the Get clear step, so the review never goes away underneath it.
  const [clarifying, setClarifying] = useState<{ run: number; withClaude: boolean } | null>(null);
  const clarify = (withClaude: boolean) => setClarifying((c) => ({ run: (c?.run ?? 0) + 1, withClaude }));
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
    const fresh = newSession();
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
  // The review's checks are built in (no Claude): each returns a short note, or nothing when all is well.
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
          .sort((a, b) => Number(isStalled(s, b)) - Number(isStalled(s, a)) || a.sort - b.sort)
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
          ...s.projects.filter((p) => p.status === "someday").map((p) => ({ key: p.id, kind: "project" as const, id: p.id, title: p.title, info: "Project", date: p.bring_back, note: p.bring_back && p.bring_back <= t ? "Due back" : undefined })),
          ...s.actions.filter((a) => a.status === "someday").map((a) => ({ key: a.id, kind: "action" as const, id: a.id, title: a.title, info: projectTitle(a.project_id), date: a.bring_back, note: a.bring_back && a.bring_back <= t ? "Due back" : undefined })),
        ];
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
        return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      }
      default:
        return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, step.id, weeks]);
  // Each step's list sorts from its headings too, remembered per step.
  const [sort, setSort] = useSort(`review:${step.id}`);
  const sorters: Sorters<Row> = useMemo(() => ({ subject: (r) => r.title, info: (r) => r.info, date: (r) => r.date }), []);
  const rows = useMemo(() => sortGroups([{ key: step.id, label: "", rows: stepRows }], sorters, sort)[0].rows, [stepRows, sorters, sort, step.id]);

  const nav = useListNav(`review:${step.id}`, useMemo(() => [{ key: step.id, rowKeys: rows.map((r) => r.key), showHeader: false }], [rows, step.id]));
  const focusRow = rows.find((r) => r.key === nav.focus);
  useEffect(() => {
    ui.followDetail(focusRow ? { kind: focusRow.kind, id: focusRow.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow?.key]);
  const targetsOf = (kind: Row["kind"]) =>
    [...new Set(nav.targets().map((k) => rows.find((r) => r.key === k)).filter((r): r is Row => Boolean(r && r.kind === kind)).map((r) => r.id))];

  const finish = async () => {
    await fetch("/api/review/complete", { method: "POST" });
    await load();
    clearSession();
    // Say what is true: only a review with nothing left open earns "your system is current".
    notify(
      openSteps.length
        ? `Weekly review recorded ${formatLong(t)}. ${plural(openSteps.length, "step")} left open.`
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
        return s.projects.filter((p) => isStalled(s, p)).length;
      case "next":
        return s.actions.filter((a) => a.status === "next" && actionNote(a)).length;
      case "waiting":
        return s.actions.filter((a) => a.status === "waiting" && actionNote(a)).length;
      case "someday":
        return [...s.projects, ...s.actions].filter((x) => x.status === "someday" && x.bring_back && x.bring_back <= t).length;
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
  const clearSteps = STEPS.slice(0, -1).filter((st) => openCount(st.id) === 0).length;
  const openSteps = STEPS.slice(0, -1)
    .map((st, i) => ({ st, i, n: openCount(st.id) }))
    .filter((x) => x.n > 0);
  // What this review did, counted from its start: the closing tally.
  const since = sess.startedAt;
  const tally = [
    [s.stuff.filter((x) => x.processed_at && x.processed_at >= since).length, "item", "clarified"],
    [s.actions.filter((a) => a.status === "done" && a.completed_at && a.completed_at >= since).length, "action", "done"],
    [s.actions.filter((a) => a.created_at >= since && ["next", "waiting"].includes(a.status)).length, "new action", "added"],
    [s.projects.filter((p) => p.status === "done" && p.completed_at && p.completed_at >= since).length, "project", "completed"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, noun, verb]) => `${plural(n as number, noun as string)} ${verb}`);
  const isDone = (id: StepId) => (id === "finish" ? false : visited.has(id) && openCount(id) === 0);

  const commands: Command[] = [
    ...nav.commands,
    { id: "rv.next", label: "Next step", group: "Review", keys: ["mod+."], inInput: true, run: () => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1)) },
    { id: "rv.prev", label: "Previous step", group: "Review", keys: ["mod+,"], inInput: true, run: () => setStepIdx(Math.max(0, stepIdx - 1)) },
    { id: "rv.clarify", label: "Clarify", group: "Review", keys: ["k"], enabled: step.id === "clear" && inboxCount > 0, run: () => clarify(false) },
    { id: "rv.clarifyclaude", label: "Clarify with Claude", group: "Review", keys: ["alt+k"], enabled: step.id === "clear" && inboxCount > 0, run: () => clarify(true) },
    {
      id: "rv.addnext",
      label: "Add a next action to this project",
      group: "Review",
      keys: ["n", "t"],
      enabled: step.id === "projects" && focusRow?.kind === "project",
      run: () => focusRow && addNextAction(focusRow.id),
    },
    {
      id: "rv.addwaiting",
      label: "Add a waiting for to this project",
      group: "Review",
      keys: ["shift+w"],
      enabled: step.id === "projects" && focusRow?.kind === "project",
      run: () => focusRow && projectEditors(ui).addWaiting(focusRow.id),
    },
    ...STEPS.slice(0, -1).map((st, i) => ({
      id: `rv.jump${i + 1}`,
      label: `Go to step: ${st.title}`,
      group: "Review",
      keys: [String(i + 1)],
      enabled: step.id === "finish",
      hidden: true,
      run: () => setStepIdx(i),
    })),
    { id: "rv.file", label: "File", group: "Review", keys: ["v"], enabled: targetsOf("stuff").length > 0, run: () => fileStuff(ui, targetsOf("stuff")) },
    { id: "rv.new", label: "Start a new review (forget this one's progress)", group: "Review", keys: [], run: startOver },
    { id: "rv.finish", label: "Record the review", group: "Review", keys: ["mod+enter"], enabled: step.id === "finish", run: () => void finish() },
    { id: "rv.open", label: "Open details", group: "Review", keys: ["enter"], enabled: Boolean(focusRow), run: () => focusRow && ui.openDetail({ kind: focusRow.kind, id: focusRow.id }, true) },
    {
      id: "rv.done",
      label: step.id === "someday" ? "Activate" : "Mark done",
      group: "Review",
      keys: ["e"],
      enabled: Boolean(focusRow),
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
    { id: "rv.move", label: "Move", group: "Review", keys: ["v"], enabled: targetsOf("action").length > 0, run: () => ed.move(targetsOf("action")) },
    { id: "rv.due", label: "Due date", group: "Fields", keys: ["d"], enabled: targetsOf("action").length > 0, run: () => ed.date(targetsOf("action"), step.id === "waiting" ? "followup" : "due") },
    { id: "rv.back", label: "Bring back on", group: "Fields", keys: ["b"], enabled: targetsOf("action").length > 0, run: () => ed.date(targetsOf("action"), "bring_back") },
    {
      id: "rv.trash",
      label: "Trash",
      group: "Review",
      keys: ["backspace", "delete"],
      enabled: Boolean(focusRow),
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
    restart: clarify,
    // Clarify can't run: back to the list with the filing picker open on the item in hand.
    fileInbox: () => {
      setClarifying(null);
      const id = nav.focus ?? rows[0]?.key;
      if (id) fileStuff(ui, [id]);
    },
    backLabel: "Back to Get clear",
    offerNext: false,
  };

  const columns: Column<Row>[] = [
    { key: "mark", label: "", width: "30px", render: (r) => (r.kind === "project" ? <Lamp health={healthOf(r.id)} start={s.projects.find((x) => x.id === r.id)?.start} /> : r.kind === "stuff" ? <span className="kind-icon">{stuffIcon(s.stuff.find((x) => x.id === r.id))}</span> : <Marker flagged={false} />) },
    {
      key: "subject",
      // Name what the rows are; the step title is already on the tab and the heading.
      label: ({ clear: "Stuff", projects: "Project", next: "Action", waiting: "Waiting for", someday: "Item", upcoming: "Item" } as Record<string, string>)[step.id] ?? "",
      width: "minmax(220px, 1fr)",
      render: (r) => (
        <span className="subject">
          <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title || "Untitled"}</span>
          {r.note && <span className="flag-note">{r.note}</span>}
        </span>
      ),
    },
    { key: "info", blank: (r) => !r.info, label: ({ clear: "Files", projects: "Next action", next: "Project", waiting: "Waiting on", someday: "Project", upcoming: "What" } as Record<string, string>)[step.id] ?? "", width: "minmax(120px, 260px)", render: (r) => (r.info ? <span className="muted-text">{r.kind === "stuff" && <Paperclip size={12} strokeWidth={2} aria-hidden />} {r.info}</span> : <span className="dash" aria-hidden="true">–</span>) },
    // Name the date each step shows, rather than a generic "Date".
    { key: "date", label: ({ clear: "Captured", projects: "Due", next: "Due", waiting: "Follow up", someday: "Comes back", upcoming: "Date" } as Record<string, string>)[step.id] ?? "Date", width: "96px", render: (r) => <DateCell date={r.date} kind={step.id === "someday" || step.id === "clear" ? "plain" : "due"} /> },
  ];
  function healthOf(id: ID) {
    const p = s.projects.find((x) => x.id === id);
    return p ? projectHealth(s, p) : "done";
  }

  // On a phone the steps are one sideways-scrolling strip: keep the current one in view.
  useEffect(() => {
    document.querySelector(".review-steps .is-current")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [stepIdx]);
  return (
    <div className="review">
      <ol className="review-steps" aria-label="Review steps">
        {STEPS.map((st, i) => (
          <li key={st.id} className={`${i === stepIdx ? "is-current" : ""} ${isDone(st.id) ? "is-done" : ""}`} aria-current={i === stepIdx ? "step" : undefined}>
            <button type="button" onClick={() => setStepIdx(i)}>
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
          </li>
        ))}
      </ol>
      <div className="review-head">
        <h2 className="review-title" tabIndex={-1}>
          <span className="visually-hidden">
            Step {stepIdx + 1} of {STEPS.length}:{" "}
          </span>
          {step.title}
        </h2>
        <p className="muted-text">{step.note}</p>

      </div>
      {step.id === "clear" && clarifying ? (
        <ClarifyView key={clarifying.run} regionActive={regionActive} withClaude={clarifying.withClaude} host={clarifyHost} />
      ) : step.id === "finish" ? (
        <div className="review-panel review-finish">
          {/* The end of the week leads with what you cleared, then what is still open. */}
          <Tag size="md">{openSteps.length ? "Ready to record" : "Everything reviewed"}</Tag>
          <p className="clarify-msg">
            {clearSteps} of {STEPS.length - 1} steps clear{tally.length ? ` · ${tally.join(" · ")}` : ""}.
          </p>
          {openSteps.length ? (
            <>
              <p className="muted-text">Still open, if you want to go back:</p>
              <KeyChoices choices={openSteps.map(({ st, i, n }) => ({ k: String(i + 1), label: `${st.title}: ${n} open`, run: () => setStepIdx(i) }))} />
            </>
          ) : (
            <p className="muted-text">Every list has been through the review and nothing is left open.</p>
          )}
          <p className="muted-text">
            {last ? `Last review: ${formatLong(last.slice(0, 10))}.` : "This is your first review."} Recording it takes you back to Next Actions.
          </p>
        </div>
      ) : (
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
          empty={<p className="muted-text">{step.id === "clear" ? "The Inbox is empty. Move on to the next step." : "Nothing here. Move on to the next step."}</p>}
        />
      )}
      {!clarifying && (
        <KeyHints
          hints={[
            // On touch the step bar is right above: moving between steps is a tap there, not a button here.
            ...(step.id !== "finish" ? [{ k: "mod+.", label: "Next step", touch: "hide" as const }] : []),
            { k: "mod+,", label: "Previous", touch: "hide" as const },
            ...(step.id === "projects" && focusRow?.kind === "project" ? [{ k: "n", label: "Add next action" }, { k: "shift+w", label: "Add waiting for" }] : []),
            ...(step.id === "clear" && inboxCount > 0 ? [{ k: "k", label: "Clarify" }, { k: "alt+k", label: "With Claude" }, { k: "v", label: "File" }] : []),
            ...(step.id === "finish" ? [{ k: "mod+enter", label: "Record the review" }] : []),
            ...(step.id !== "finish" && rows.length > 0 ? [{ k: "enter", label: "Open" }, { k: "e", label: step.id === "someday" ? "Activate" : "Done" }] : []),
          ]}
        />
      )}
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
