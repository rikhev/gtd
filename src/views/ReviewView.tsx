import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { completeActions, isStalled, lastReview, mutate, newAction, patchMany, plural, useStore, load, notify } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, type Column } from "../components/Grid.tsx";
import { DateCell, Marker, Tape } from "../components/bits.tsx";
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
  const s = useStore((x) => x);
  const [stepIdx, setStepIdx] = usePersistentStep();
  const [flags, setFlags] = useState<ReviewFlag[] | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const step = STEPS[stepIdx];
  const t = today();
  const ed = editors(ui);

  useEffect(() => {
    let alive = true;
    fetch("/api/review/analyze", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setFlagError(j.error.message);
        else setFlags(j.flags);
      })
      .catch((e) => alive && setFlagError((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

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
            info: isStalled(s, p) ? "Stalled: no next action" : `${plural(s.actions.filter((a) => a.project_id === p.id && ["next", "waiting"].includes(a.status)).length, "open action")}`,
            date: p.due,
            flag: flagFor(p.id),
          }));
      case "next":
        return s.actions
          .filter((a) => a.status === "next")
          .sort((a, b) => Number(Boolean(flagFor(b.id))) - Number(Boolean(flagFor(a.id))) || a.sort - b.sort)
          .map((a) => ({ key: a.id, kind: "action", id: a.id, title: a.title, info: projectTitle(a.project_id), date: a.due, flag: flagFor(a.id) }));
      case "waiting":
        return s.actions
          .filter((a) => a.status === "waiting")
          .map((a) => ({
            key: a.id,
            kind: "action",
            id: a.id,
            title: a.title,
            info: `${a.waiting_who ?? "?"}${a.waiting_since ? ` · ${daysBetween(a.waiting_since, t)} days` : ""}`,
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
    } else {
      notify("This flag has no suggested edit. Open the item with Enter to fix it.");
      return;
    }
    setDismissed(new Set(dismissed).add(f.id));
  };

  const finish = async () => {
    await fetch("/api/review/complete", { method: "POST" });
    await load();
    notify("Weekly review recorded. Your system is current.");
    ui.go("next");
  };

  const inboxCount = s.stuff.filter((x) => x.status === "inbox").length;

  const commands: Command[] = [
    ...nav.commands,
    { id: "rv.next", label: "Next step", group: "Review", keys: ["ctrl+."], inInput: true, run: () => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1)) },
    { id: "rv.prev", label: "Previous step", group: "Review", keys: ["ctrl+,"], inInput: true, run: () => setStepIdx(Math.max(0, stepIdx - 1)) },
    { id: "rv.clarify", label: "Clarify the Inbox", group: "Review", keys: ["k"], enabled: step.id === "clear" && inboxCount > 0, run: ui.startClarify },
    { id: "rv.finish", label: "Record the review", group: "Review", keys: ["mod+enter"], enabled: step.id === "finish", run: () => void finish() },
    { id: "rv.accept", label: "Accept Claude's suggestion", group: "Review", keys: ["mod+enter"], enabled: Boolean(focusRow?.flag), run: acceptSuggestion },
    { id: "rv.dismiss", label: "Dismiss Claude's flag", group: "Review", keys: ["alt+backspace"], enabled: Boolean(focusRow?.flag), run: () => focusRow?.flag && setDismissed(new Set(dismissed).add(focusRow.flag.id)) },
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
    { key: "mark", label: "", width: "30px", render: (r) => (r.kind === "project" ? <span className={`proj-dot ${isStalledId(r.id) ? "stalled" : "active"}`} /> : <Marker flagged={false} />) },
    {
      key: "subject",
      label: step.title,
      width: "minmax(220px, 1fr)",
      render: (r) => (
        <span className="subject">
          <span className={`subject-text ${r.kind === "project" ? "strong" : ""}`}>{r.title || "Untitled"}</span>
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
    { key: "info", label: step.id === "upcoming" ? "What" : "", width: "minmax(120px, 220px)", render: (r) => <span className={`muted-text ${r.info.startsWith("Stalled") ? "stamp" : ""}`}>{r.info}</span> },
    { key: "date", label: "Date", width: "96px", render: (r) => <DateCell date={r.date} /> },
  ];
  function isStalledId(id: ID) {
    const p = s.projects.find((x) => x.id === id);
    return p ? isStalled(s, p) : false;
  }

  return (
    <div className="review">
      <ol className="review-steps" aria-label="Review steps">
        {STEPS.map((st, i) => (
          <li key={st.id} className={`${i === stepIdx ? "is-current" : ""} ${i < stepIdx ? "is-past" : ""}`} aria-current={i === stepIdx ? "step" : undefined}>
            <button type="button" onClick={() => setStepIdx(i)}>
              {st.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="review-head">
        <h2 className="review-title">{step.title}</h2>
        <p className="muted-text">{step.note}</p>
        <p className="review-claude small">
          <Sparkles size={12} strokeWidth={2} aria-hidden />
          {flagError ? <span className="error-text">Claude couldn't check your lists: {flagError}</span> : flags === null ? "Claude is checking your lists for stalled, stale and vague items…" : flags.length ? `Claude flagged ${plural(flags.length, "item")} across your lists.` : "Claude found nothing that needs attention."}
        </p>
      </div>
      {step.id === "clear" ? (
        <div className="review-panel">
          <p className="big-count">
            <span className="num">{inboxCount}</span> {inboxCount === 1 ? "item" : "items"} in the Inbox
          </p>
          <p className="muted-text">
            {inboxCount ? (
              <>
                Clarify them now, then move to the next step.
              </>
            ) : (
              <>
                Clear. Move on to the next step.
              </>
            )}
          </p>
        </div>
      ) : step.id === "finish" ? (
        <div className="review-panel">
          <Tape size="md">Review complete?</Tape>
          <p className="muted-text">{last ? `Last review: ${formatLong(last.slice(0, 10))}.` : "This is your first review."}</p>
          <p className="muted-text">
            Recording it takes you back to Next Actions.
          </p>
        </div>
      ) : (
        <Grid
          listId={`review:${step.id}`}
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
    </div>
  );
}

function usePersistentStep(): [number, (n: number) => void] {
  const [n, setN] = useState(0);
  return [n, setN];
}
