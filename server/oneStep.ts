import type { Proposal } from "../shared/types.ts";

/*
 * GTD's rule, enforced after Claude answers: a next action is one step. A proposed title that joins two steps
 * ("Check effort and quote a solution", "Draft the offer, then send it to Per") is split into one action per step,
 * and because more than one action is a project, the steps go into one: the project they were already in, the
 * proposal's new project, or a new project named after the original title.
 */

/** Imperative verbs that start a step. A joiner followed by one of these starts a new action. */
const VERBS = new Set(
  (
    "add agree answer apply approve arrange ask assemble assess attach attend back backup book bring buy calculate call cancel change " +
    "check choose clean clear close collect compare complete configure confirm contact copy correct cost create decide define delete " +
    "deliver describe design discuss do document download draft drive email estimate evaluate fetch file fill find finish fix follow " +
    "forward gather get give go hand have hire inform install invite investigate invoice issue list load log mail make measure meet " +
    "message move note notify offer open order organise organize outline pack pay phone pick plan post prepare present price print " +
    "prioritise prioritize publish purchase put quote read reply register remind remove renew repair replace reply report request " +
    "research reserve respond return review revise run save schedule scan search select sell send set share ship sign sketch sort " +
    "specify start submit summarise summarize take talk tell test text transfer translate try update upload verify visit wash water " +
    "write bake charge cook cut drop empty feed hang iron mow paint plant recycle tidy trim vacuum walk " +
    // Swedish imperatives, for proposals written in Swedish (Settings › Claude › Language).
    "ansök anteckna anlita avboka avsluta baka bedöm bekräfta beräkna beställ besök betala bjud boka byt dammsug dela diska " +
    "diskutera dokumentera fakturera fixa flytta fråga fyll förbered förnya godkänn granska gör handla hyr hämta informera " +
    "installera jämför klipp kolla konfigurera kontakta kontrollera kopiera korrigera köp laga leverera logga lämna läs mata " +
    "meddela mejla maila mät måla offerera ordna packa planera plantera posta printa prata publicera påminn radera registrera " +
    "rensa reparera returnera ring rita räkna rätta samla sammanfatta signera skanna skicka skissa skriv slutför sortera spara " +
    "starta städa sälj sök testa träffa tvätta uppdatera uppskatta undersök utvärdera vattna verifiera vidarebefordra välj ändra översätt"
  ).split(" "),
);

/**
 * Where one step ends and the next begins: "and", "then", "and then", ", then", ";" or " + " before a verb, and the
 * Swedish "och", "sedan", "och sedan", "därefter".
 */
const JOINER =
  /\s*(?:;|,\s*and then|,\s*then|,\s*and|\band then\b|\bthen\b|\band\b|,\s*och sedan|,\s*sedan|,\s*och|\boch sedan\b|\boch därefter\b|\bsedan\b|\bdärefter\b|\boch\b|\s\+\s)\s+/gi;

/** Split a title into its steps, or return it whole when it is already one step. */
export function steps(title: string): string[] {
  const clean = title.trim().replace(/\.$/, "");
  const parts: string[] = [];
  let last = 0;
  for (const m of clean.matchAll(JOINER)) {
    const after = clean.slice(m.index! + m[0].length);
    const word = after.match(/^[A-Za-zÅÄÖåäö]+/)?.[0]?.toLowerCase();
    // Only a verb after the joiner starts a new step: "Call Anna and Per" stays one action.
    if (!word || !VERBS.has(word)) continue;
    parts.push(clean.slice(last, m.index).trim());
    last = m.index! + m[0].length;
  }
  parts.push(clean.slice(last).trim());
  const real = parts.filter(Boolean);
  if (real.length < 2) return [title.trim()];
  // A bare verb shares the object of the step after it: "Research and compare suppliers" → "Research suppliers",
  // "Compare suppliers"; "sign and return it" → "Sign it", "Return it".
  for (let i = real.length - 2; i >= 0; i--) {
    if (/\s/.test(real[i])) continue;
    const object = real[i + 1].replace(/^\S+\s*/, "");
    if (object) real[i] = `${real[i]} ${object}`;
  }
  return real.map((p) => p[0].toUpperCase() + p.slice(1));
}

/** One step per action, and a project whenever that leaves more than one action. */
export function oneStepPerAction(p: Proposal): Proposal {
  if (p.disposition !== "actionable" && p.disposition !== "someday") return p;
  let newProject = p.new_project;
  let splitAny = false;
  const actions: Proposal["actions"] = [];
  for (const a of p.actions) {
    const parts = a.kind === "waiting" ? [a.title] : steps(a.title);
    if (parts.length < 2) {
      actions.push(a);
      continue;
    }
    splitAny = true;
    // A split action needs a project: the one it was in, this item's new project, or a new one named for the outcome.
    let project = a.project;
    if (!project) {
      if (!newProject) newProject = { title: a.title.trim().replace(/\.$/, ""), area: null };
      project = "new";
    }
    parts.forEach((title, i) =>
      actions.push({
        ...a,
        title,
        project,
        // The start date belongs to the first step and a deadline to the last; the steps together take the estimate.
        defer: i === 0 ? a.defer : null,
        due: i === parts.length - 1 ? a.due : null,
        time_min: null,
        two_minute: false,
      }),
    );
  }
  return splitAny ? { ...p, new_project: newProject, actions } : p;
}
