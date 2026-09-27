import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { completeActions, isChase, isStalled, lastReview, projectHealth, mutate, newAction, patchMany, plural, useMeta, useStore, load, notify } from "../store.ts";
import { clearSession, loadSession, newSession, saveSession, type ReviewSession } from "../reviewSession.ts";
import { useUI } from "../ui.tsx";
import { runWhenReady, useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, type Column } from "../components/Grid.tsx";
import { DateCell, KeyChoices, KeyHints, Lamp, Marker, Tape } from "../components/bits.tsx";
import { editors } from "../actionCommands.tsx";
import { addDays, formatLong, today, daysBetween } from "../../shared/dates.ts";
import type { ID, ReviewFlag } from "../../shared/types.ts";

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
  kind: "project" | "action";
  id: ID;
  title: string;
  info: string;
  date: string | null;
  flag?: ReviewFlag;
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
  const { stepIdx, flags, flagError } = sess;
  const dismissed = useMemo(() => new Set(sess.dismissed), [sess.dismissed]);
  const visited = useMemo(() => new Set(sess.visited), [sess.visited]);
  const setStepIdx = (n: number) => update({ stepIdx: n });
  const dismiss = (id: string) => update({ dismissed: [...sess.dismissed, id] });
  const step = STEPS[stepIdx];
  const t = today();
  // A step is only struck through once it has been visited and nothing in it is left open.
  useEffect(() => {
    if (!sess.visited.includes(step.id)) update({ visited: [...sess.visited, step.id] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  const ed = editors(ui);
  // Steps without a list (Get clear, Finish) still need somewhere for focus to land.
  useEffect(() => {
    if (!regionActive) return;
    requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!el || el === document.body) document.querySelector<HTMLElement>(".review-title")?.focus({ preventScroll: true });
    });
  }, [step.id, regionActive]);

  // Claude only checks the lists when asked (⇧K): no Claude call ever starts on its own.
  const [checking, setChecking] = useState(false);
  const askClaude = () => {
    if (checking) return;
    setChecking(true);
    update({ flagError: null });
    fetch("/api/review/analyze", { method: "POST" })
      .then((r) => r.json())
      .then((j) => (j.error ? update({ flagError: j.error.message }) : update({ flags: j.flags, dismissed: [], flagError: null })))
      .catch((e) => update({ flagError: (e as Error).message }))
      .finally(() => setChecking(false));
  };

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
  const flagFor = (id: ID) => flags?.find((f) => f.id === id && !dismissed.has(f.id));
  const projectTitle = (id: ID | null) => s.projects.find((p) => p.id === id)?.title ?? "";

  const rows: Row[] = useMemo(() => {
    switch (step.id as StepId) {
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
            info: isStalled(s, p) ? "" : projectNext(p.id),
            date: p.due,
            flag: flagFor(p.id),
          }));
      case "next":
        return s.actions
          .filter((a) => a.status === "next")
          .sort((a, b) => Number(Boolean(flagFor(b.id))) - Number(Boolean(flagFor(a.id))) || a.sort - b.sort)
          .map((a) => ({ key: a.id, kind: "action", id: a.id, title: a.title, info: projectTitle(a.project_id), date: a.due, flag: flagFor(a.id) }));
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
            flag: flagFor(a.id),
          }));
      case "someday":
        return [
          ...s.projects.filter((p) => p.status === "someday").map((p) => ({ key: p.id, kind: "project" as const, id: p.id, title: p.title, info: "Project", date: p.bring_back, flag: flagFor(p.id) })),
          ...s.actions.filter((a) => a.status === "someday").map((a) => ({ key: a.id, kind: "action" as const, id: a.id, title: a.title, info: projectTitle(a.project_id), date: a.bring_back, flag: flagFor(a.id) })),
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
  }, [s, step.id, flags, dismissed]);

  const nav = useListNav(`review:${step.id}`, useMemo(() => [{ key: step.id, rowKeys: rows.map((r) => r.key), showHeader: false }], [rows, step.id]));
  const focusRow = rows.find((r) => r.key === nav.focus);
  const targetsOf = (kind: "project" | "action") =>
    [...new Set(nav.targets().map((k) => rows.find((r) => r.key === k)).filter((r): r is Row => Boolean(r && r.kind === kind)).map((r) => r.id))];

  const acceptSuggestion = () => {
    const f = focusRow?.flag;
    if (!f || !focusRow) return;
    if (f.suggested_next_action && focusRow.kind === "project") {
      const a = newAction({ title: f.suggested_next_action, project_id: focusRow.id });
      mutate(`Next action added to “${focusRow.title}”`, [{ type: "create", table: "actions", row: { ...a } }]);
    } else if (f.suggested_title && focusRow.kind === "action") {
      mutate("Rewritten", [{ type: "patch", table: "actions", id: focusRow.id, data: { title: f.suggested_title } }]);
    } else if (f.suggested_title && focusRow.kind === "project") {
      mutate("Project renamed", [{ type: "patch", table: "projects", id: focusRow.id, data: { title: f.suggested_title } }]);
    } else {
      notify("This flag has no suggested edit. Open the item with Enter to fix it.");
      return;
    }
    dismiss(f.id);
  };

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

  /** The GTD fix for a stalled project: give it a next action, right here. */
  const addNextAction = (projectId: ID, title: string) =>
    ui.openPicker({
      type: "text",
      title: `Next action for “${title || "Untitled project"}”`,
      current: "",
      placeholder: "Describe the next action",
      onPick: (v) => {
        const text = v.trim();
        if (!text) return;
        const a = newAction({ title: text, project_id: projectId });
        mutate(`Next action added to “${title}”`, [{ type: "create", table: "actions", row: { ...a } }]);
      },
    });

  const inboxItems = s.stuff.filter((x) => x.status === "inbox").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const inboxCount = inboxItems.length;

  /** What is still open in each step: the number shown beside it, and what keeps it from being struck through. */
  const openCount = (id: StepId): number => {
    switch (id) {
      case "clear":
        return inboxCount;
      case "projects":
        return s.projects.filter((p) => p.status === "active" && (isStalled(s, p) || flagFor(p.id))).length;
      case "next":
        // Overdue actions are open with or without Claude; Claude's flags add to them.
        return s.actions.filter((a) => a.status === "next" && ((a.due && a.due < t) || flagFor(a.id))).length;
      case "waiting":
        return s.actions.filter((a) => a.status === "waiting" && (isChase(a, t) || flagFor(a.id))).length;
      case "someday":
        return [...s.projects, ...s.actions].filter((x) => x.status === "someday" && ((x.bring_back && x.bring_back <= t) || flagFor(x.id))).length;
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
    { id: "rv.next", label: "Next step", group: "Review", keys: ["ctrl+."], inInput: true, run: () => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1)) },
    { id: "rv.prev", label: "Previous step", group: "Review", keys: ["ctrl+,"], inInput: true, run: () => setStepIdx(Math.max(0, stepIdx - 1)) },
    { id: "rv.clarify", label: "Clarify", group: "Review", keys: ["k"], enabled: step.id === "clear" && inboxCount > 0, run: () => ui.startClarify("review") },
    { id: "rv.clarifyclaude", label: "Clarify with Claude", group: "Review", keys: ["alt+k"], enabled: step.id === "clear" && inboxCount > 0, run: () => ui.startClarify("review", true) },
    {
      id: "rv.addnext",
      label: "Add a next action to this project",
      group: "Review",
      keys: ["n"],
      enabled: step.id === "projects" && focusRow?.kind === "project",
      run: () => focusRow && addNextAction(focusRow.id, focusRow.title),
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
    {
      id: "rv.file",
      label: "File the Inbox",
      group: "Review",
      keys: ["v"],
      enabled: step.id === "clear" && inboxCount > 0,
      run: () => {
        ui.go("inbox");
        runWhenReady("inbox.file");
      },
    },
    { id: "rv.new", label: "Start a new review (forget this one's progress)", group: "Review", keys: [], run: startOver },
    { id: "rv.ask", label: flags ? "Ask Claude to check your lists again" : "Ask Claude to check your lists", group: "Review", keys: ["shift+k"], enabled: meta.hasKey && !checking, run: askClaude },
    { id: "rv.finish", label: "Record the review", group: "Review", keys: ["mod+enter"], enabled: step.id === "finish", run: () => void finish() },
    { id: "rv.accept", label: "Accept Claude's suggestion", group: "Review", keys: ["mod+enter"], enabled: Boolean(focusRow?.flag), run: acceptSuggestion },
    { id: "rv.dismiss", label: "Dismiss Claude's flag", group: "Review", keys: ["alt+backspace"], enabled: Boolean(focusRow?.flag), run: () => focusRow?.flag && dismiss(focusRow.flag.id) },
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
        if (step.id === "someday") {
          if (a.length) patchMany("actions", a, { status: "next" }, `${plural(a.length, "action")} activated`);
          if (p.length) patchMany("projects", p, { status: "active" }, `${plural(p.length, "project")} activated`);
        } else {
          if (a.length) completeActions(a);
          if (p.length) patchMany("projects", p, { status: "done", completed_at: new Date().toISOString() }, `${plural(p.length, "project")} complete`);
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
        if (a.length) patchMany("actions", a, { status: "trashed" }, `${plural(a.length, "action")} trashed`);
        if (p.length) patchMany("projects", p, { status: "trashed" }, `${plural(p.length, "project")} trashed`);
      },
    },
  ];
  useCommands("review", commands, { priority: 12, active: regionActive });

  const last = lastReview(s);

  const columns: Column<Row>[] = [
    { key: "mark", label: "", width: "30px", render: (r) => (r.kind === "project" ? <Lamp health={healthOf(r.id)} /> : <Marker flagged={false} />) },
    {
      key: "subject",
      // Name what the rows are; the step title is already on the tab and the heading.
      label: ({ projects: "Project", next: "Action", waiting: "Waiting for", someday: "Item", upcoming: "Item" } as Record<string, string>)[step.id] ?? "",
      width: "minmax(220px, 1fr)",
      render: (r) => (
        <span className="subject">
          <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title || "Untitled"}</span>
          {step.id === "projects" && r.kind === "project" && isStalled(s, s.projects.find((p) => p.id === r.id)!) && <span className="stamp">Stalled</span>}
          {r.flag && (
            <span className="flag-note">
              <Sparkles size={12} strokeWidth={2} aria-hidden />
              {r.flag.message}
              {r.flag.suggested_next_action && <em> → {r.flag.suggested_next_action}</em>}
              {r.flag.suggested_title && <em> → {r.flag.suggested_title}</em>}
            </span>
          )}
        </span>
      ),
    },
    { key: "info", label: ({ projects: "Next action", next: "Project", waiting: "Waiting on", someday: "Project", upcoming: "What" } as Record<string, string>)[step.id] ?? "", width: "minmax(120px, 260px)", render: (r) => (r.info ? <span className="muted-text">{r.info}</span> : <span className="dash" aria-hidden="true">–</span>) },
    // Name the date each step shows, rather than a generic "Date".
    { key: "date", label: ({ projects: "Due", next: "Due", waiting: "Follow up", someday: "Comes back", upcoming: "Date" } as Record<string, string>)[step.id] ?? "Date", width: "96px", render: (r) => <DateCell date={r.date} kind={step.id === "someday" ? "plain" : "due"} /> },
  ];
  function healthOf(id: ID) {
    const p = s.projects.find((x) => x.id === id);
    return p ? projectHealth(s, p) : "done";
  }

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
        {/* Claude is optional and only runs when asked. Its standing note shows once, on the first step;
            after you ask, its answer follows you through the steps. */}
        {(stepIdx === 0 || checking || flags !== null || (flagError && meta.hasKey)) && (
        <p className="review-claude small" aria-live="polite">
          <Sparkles size={12} strokeWidth={2} aria-hidden />
          {!meta.hasKey
            ? "Claude's flags are off until you add an API key (⌘K › Add a Claude API key). The review works without them."
            : checking
              ? "Claude is checking your lists for stalled, stale and vague items…"
              : flagError
                ? `Claude couldn't check your lists (${flagError}). The review works without it.`
                : flags === null
                  ? "Claude hasn't looked at your lists. Ask it (⇧K) to flag stalled, stale and vague items."
                  : flags.length
                    ? `Claude flagged ${plural(flags.length, "item")} across your lists.`
                    : "Claude found nothing that needs attention."}
        </p>
        )}
      </div>
      {step.id === "clear" ? (
        <div className="review-panel">
          <p className="big-count">
            <span className="num">{inboxCount}</span> {inboxCount === 1 ? "item" : "items"} in the Inbox
          </p>
          {/* The actual pile, so its weight can be judged without leaving the review. */}
          {inboxCount > 0 && (
            <ul className="review-pile">
              {inboxItems.slice(0, 8).map((x) => (
                <li key={x.id}>{x.text.split("\n")[0].trim() || "Untitled"}</li>
              ))}
              {inboxCount > 8 && <li className="muted-text">and {inboxCount - 8} more</li>}
            </ul>
          )}
          <p className="muted-text">{inboxCount ? "Clarify or file them now, then move to the next step." : "Clear. Move on to the next step."}</p>
        </div>
      ) : step.id === "finish" ? (
        <div className="review-panel review-finish">
          {/* The end of the week leads with what you cleared, then what is still open. */}
          <Tape size="md">{openSteps.length ? "Ready to record" : "Everything reviewed"}</Tape>
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
          label={`Weekly Review, ${step.title}`}
          columns={columns}
          groups={[{ key: step.id, label: "", rows }]}
          getKey={(r) => r.key}
          nav={nav}
          active={regionActive}
          showHeaders={false}
          rowClass={(r) => (r.flag ? "is-flagged-row" : "")}
          empty={<p className="muted-text">Nothing here. Move on to the next step.</p>}
        />
      )}
      <KeyHints
        hints={[
          ...(step.id !== "finish" ? [{ k: "ctrl+.", label: "Next step" }] : []),
          ...(meta.hasKey && !flags && step.id !== "finish" ? [{ k: "shift+k", label: "Ask Claude" }] : []),
          { k: "ctrl+,", label: "Previous" },
          ...(step.id === "projects" && focusRow?.kind === "project" ? [{ k: "n", label: "Add next action" }] : []),
          ...(step.id === "clear" && inboxCount > 0 ? [{ k: "k", label: "Clarify" }, { k: "alt+k", label: "With Claude" }, { k: "v", label: "File" }] : []),
          ...(step.id === "finish" ? [{ k: "mod+enter", label: "Record the review" }] : []),
          ...(step.id !== "clear" && step.id !== "finish" ? [{ k: "enter", label: "Open" }, { k: "e", label: step.id === "someday" ? "Activate" : "Done" }] : []),
          ...(focusRow?.flag ? [{ k: "mod+enter", label: "Accept Claude's fix" }] : []),
        ]}
      />
    </div>
  );
}

/** How long something has been waited on, in one format: "today", "1 day", "4 days". */
function waitedFor(days: number) {
  return days <= 0 ? "today" : plural(days, "day");
}
