import { useEffect, useMemo } from "react";
import { Hourglass } from "lucide-react";
import { completeActions, mutate, newAction, onHold, plural, useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands, type Command } from "../keys.ts";
import { Grid, useListNav, usePersisted, useSort, sortGroups, type Column, type GridGroup, type Sorters } from "../components/Grid.tsx";
import { ContextCode, DateCell, Marker } from "../components/bits.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { actionRowCommands, askContext } from "../actionCommands.tsx";
import { formatDate, today } from "../../shared/dates.ts";
import type { Action, ID, State } from "../../shared/types.ts";

/**
 * Agendas (GTD's list per person): for each person, what you have to take up with them (next actions for them) and
 * what they owe you (Waiting For on them), in one place for when you meet, call or write. Nothing is stored here;
 * a person is simply a name the system already knows.
 */

interface Row {
  key: ID;
  a: Action;
  /** Yours to raise or do for them, or theirs to deliver. */
  side: "yours" | "theirs";
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

function peopleOf(s: State) {
  const people = new Map<string, { name: string; rows: Row[] }>();
  const add = (who: string | null | undefined, a: Action, side: Row["side"]) => {
    const name = who?.trim();
    if (!name) return;
    const k = name.toLowerCase();
    const p = people.get(k) ?? { name, rows: [] };
    p.rows.push({ key: a.id, a, side });
    people.set(k, p);
  };
  for (const a of s.actions) {
    // A Someday project's actions are on hold with it, so they aren't raised with anyone yet.
    if (onHold(a, s)) continue;
    if (a.status === "next") add(a.person, a, "yours");
    else if (a.status === "waiting") add(a.waiting_who, a, "theirs");
  }
  // Yours first (what to bring up), then what they owe you; each in the lists' own order.
  for (const p of people.values()) p.rows.sort((x, y) => (x.side === y.side ? x.a.sort - y.a.sort : x.side === "yours" ? -1 : 1));
  return [...people.entries()].sort(([, x], [, y]) => collator.compare(x.name, y.name));
}

export function AgendasView({ regionActive }: { regionActive: boolean }) {
  const ui = useUI();
  const s = useStore((x) => x);
  const t = today();
  const all = useMemo(() => peopleOf(s), [s]);
  // One person's agenda, for the meeting you're about to have; everyone otherwise.
  const [only, setOnly] = usePersisted<string | null>("agendas:only", null);
  const shown = only && all.some(([k]) => k === only) ? all.filter(([k]) => k === only) : all;
  const ctxById = useMemo(() => new Map(s.contexts.map((c) => [c.id, c])), [s.contexts]);
  const projById = useMemo(() => new Map(s.projects.map((p) => [p.id, p])), [s.projects]);

  const [sort, setSort] = useSort("agendas");
  const sorters: Sorters<Row> = useMemo(
    () => ({ subject: (r) => r.a.title, what: (r) => (r.side === "theirs" ? "~" : (ctxById.get(r.a.context_id ?? "")?.name ?? "")), project: (r) => projById.get(r.a.project_id ?? "")?.title ?? "", date: (r) => (r.side === "theirs" ? r.a.followup : r.a.due) }),
    [ctxById, projById],
  );
  const groups: GridGroup<Row>[] = useMemo(
    () =>
      sortGroups(
        shown.map(([k, p]) => {
          const yours = p.rows.filter((r) => r.side === "yours").length;
          const theirs = p.rows.length - yours;
          const meta = [yours ? `${yours} to take up` : "", theirs ? `${theirs} waiting on them` : ""].filter(Boolean).join(" · ");
          return { key: `p:${k}`, label: p.name, rows: p.rows, meta: <span className="muted-text">{meta}</span> };
        }),
        sorters,
        sort,
      ),
    [shown, sorters, sort],
  );
  const nav = useListNav("agendas", useMemo(() => groups.map((g) => ({ key: g.key, rowKeys: g.rows.map((r) => r.key), showHeader: true })), [groups]));
  const rows = groups.flatMap((g) => g.rows);
  const focus = rows.find((r) => r.key === nav.focus);
  // The person under the cursor: on a row, or on a group heading.
  const person = (() => {
    const g = groups.find((x) => x.key === nav.focus || x.rows.some((r) => r.key === nav.focus));
    return g ? all.find(([k]) => `p:${k}` === g.key)?.[1].name ?? null : null;
  })();

  useEffect(() => {
    ui.followDetail(focus ? { kind: "action", id: focus.a.id } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  /** T: something to take up with this person: what, then where you'd do it (a next action always has a context). */
  const addYours = (who: string) =>
    ui.openPicker({
      type: "text",
      title: `To take up with ${who}`,
      current: "",
      placeholder: "What to raise, ask or give them",
      onPick: (v) => {
        const title = (v ?? "").trim();
        if (!title) return;
        window.setTimeout(() =>
          askContext(ui, `Context for “${title}”`, (context_id, extra) => {
            const a = newAction({ title, context_id, person: who, status: "next" });
            mutate(`Added to ${who}'s agenda`, [...extra, { type: "create", table: "actions", row: { ...a } }]);
            nav.setFocus(a.id);
          }),
        );
      },
    });
  /** W: something this person owes you. */
  const addTheirs = (who: string) =>
    ui.openPicker({
      type: "text",
      title: `Waiting on ${who}`,
      current: "",
      placeholder: "What are you waiting for from them?",
      onPick: (v) => {
        const title = (v ?? "").trim();
        if (!title) return;
        const a = newAction({ title, status: "waiting", waiting_who: who, waiting_since: t });
        mutate(`Waiting on ${who}`, [{ type: "create", table: "actions", row: { ...a } }]);
        nav.setFocus(a.id);
      },
    });

  const openViewMenu = () =>
    ui.openPicker({
      type: "list",
      title: "Whose agenda?",
      items: [{ id: "*", label: "Everyone", hint: only ? "" : "Current" }, ...all.map(([k, p]) => ({ id: k, label: p.name, hint: only === k ? "Current" : plural(p.rows.length, "item") }))],
      onPick: (id) => id && setOnly(id === "*" ? null : id),
    });

  const targets = () => nav.targets().filter((k) => rows.some((r) => r.key === k));
  const commands: Command[] = [
    ...nav.commands,
    // Its rows are actions: every key an action answers to on Next Actions or Waiting For works here too.
    ...actionRowCommands(ui, { targets, focusId: focus?.a.id ?? null, group: "Agendas" }),
    { id: "ag.done", row: true, label: "Mark done (taken up, or received)", group: "Agendas", keys: ["e"], enabled: targets().length > 0, run: () => completeActions(targets()) },
    { id: "ag.yours", row: true, label: person ? `Take something up with ${person}` : "Take something up with this person", group: "Agendas", keys: ["t"], enabled: Boolean(person), run: () => person && addYours(person) },
    { id: "ag.theirs", row: true, label: person ? `Waiting on ${person} for something` : "Waiting on this person for something", group: "Agendas", keys: ["w"], enabled: Boolean(person), run: () => person && addTheirs(person) },
    { id: "ag.view", label: "Open the View menu: one person's agenda, or everyone's", group: "View", keys: ["alt+v"], run: openViewMenu },
    ...(only ? [{ id: "ag.all", label: "Show everyone's agenda", group: "View", run: () => setOnly(null) }] : []),
  ];
  useCommands("list:agendas", commands, { priority: 10, active: regionActive });

  const columns: Column<Row>[] = [
    // What they owe you carries the follow-up hourglass, so the two sides read apart even where the What column is gone.
    {
      key: "mark",
      label: "",
      width: "30px",
      render: (r) =>
        r.side === "theirs" ? (
          <span className="kind-icon agenda-theirs">
            <Hourglass size={13} strokeWidth={2} aria-label="Waiting on them" />
          </span>
        ) : (
          <Marker />
        ),
    },
    { key: "subject", label: "Item", width: "minmax(220px, 2fr)", render: (r) => <span className="subject-text">{r.a.title || "Untitled action"}</span> },
    {
      key: "what",
      label: "What",
      width: "minmax(120px, 180px)",
      // Yours shows where you'd do it (@agenda, @phone…); theirs says it is theirs to deliver, and since when.
      render: (r) => (r.side === "theirs" ? <span className="muted-text">Waiting{r.a.waiting_since ? ` since ${formatDate(r.a.waiting_since)}` : ""}</span> : <ContextCode ctx={ctxById.get(r.a.context_id ?? "")} />),
    },
    { key: "project", label: "Project", width: "minmax(120px, 1fr)", drop: 1, blank: (r) => !r.a.project_id, render: (r) => <span className="muted-text">{projById.get(r.a.project_id ?? "")?.title ?? ""}</span> },
    // Yours by its due date; theirs by when to follow up.
    { key: "date", label: "Due / follow up", width: "112px", render: (r) => <DateCell date={r.side === "theirs" ? r.a.followup : r.a.due} /> },
  ];

  return (
    <Grid
      listId="agendas"
      sort={{ state: sort, keys: Object.keys(sorters), onSort: setSort }}
      columns={columns}
      groups={groups}
      getKey={(r) => r.key}
      nav={nav}
      active={regionActive}
      showHeaders
      onOpen={(k) => ui.openDetail({ kind: "action", id: k }, true)}
      empty={
        <EmptyState
          title="No agendas yet"
          note="Each person's agenda gathers what you have to take up with them and what they owe you."
          lines={["Set who an action is for with its With field, or put someone in Waiting For, and they appear here."]}
        />
      }
    />
  );
}
