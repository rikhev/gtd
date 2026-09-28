import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFileSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { db, FILES_DIR, getSetting, loadState, now } from "./db.ts";
import { oneStepPerAction } from "./oneStep.ts";
import { IMAGE_MIMES } from "./extract.ts";
import { today } from "../shared/dates.ts";
import type { FileRow, Proposal, State, Stuff } from "../shared/types.ts";

const MODEL = "claude-sonnet-5";
/** Bump when the clarify instructions change, so older cached proposals are regenerated. */
const PROMPT_VERSION = 6;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function describeError(e: unknown): { code: string; message: string } {
  if (e instanceof Anthropic.AuthenticationError) {
    return { code: "auth", message: "Claude rejected the API key." };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { code: "rate", message: "Claude is rate-limiting requests. Wait a minute and try again." };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { code: "network", message: "Couldn't reach the Claude API. Check the network connection." };
  }
  if (e instanceof Anthropic.APIError) {
    return { code: `api_${e.status}`, message: `Claude API error ${e.status}: ${e.message}` };
  }
  const msg = (e as Error)?.message ?? String(e);
  if (/api.?key|credential|auth/i.test(msg)) {
    return { code: "auth", message: "No Claude API key yet." };
  }
  return { code: "unknown", message: msg };
}

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

/** Last four characters only: the key itself never leaves the server. */
export function keyHint(): string | null {
  const k = process.env.ANTHROPIC_API_KEY;
  return k ? k.slice(-4) : null;
}

const ENV_FILE = process.env.GTD_ENV_FILE ?? ".env";

function writeEnvKey(key: string | null) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [];
  const kept = lines.filter((l) => !/^\s*ANTHROPIC_API_KEY\s*=/.test(l));
  if (key) kept.push(`ANTHROPIC_API_KEY=${key}`);
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
  writeFileSync(ENV_FILE, text.endsWith("\n") || !text ? text : `${text}\n`, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
}

/**
 * Check a key against the Models API (free, no tokens), then store it in .env
 * so it survives restarts. Returns a status the Settings screen can show as-is.
 */
export async function setApiKey(raw: string): Promise<{ ok: boolean; saved: boolean; message: string }> {
  const key = raw.trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    return { ok: false, saved: false, message: "That doesn't look like a Claude API key. Keys start with sk-ant-." };
  }
  try {
    await new Anthropic({ apiKey: key }).models.list({ limit: 1 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, saved: false, message: "Claude rejected this key. Check it in the Claude Console and try again." };
    }
    if (e instanceof Anthropic.APIConnectionError) {
      writeEnvKey(key);
      process.env.ANTHROPIC_API_KEY = key;
      client = null;
      return { ok: true, saved: true, message: "Key saved, but Claude couldn't be reached to check it. Check the network connection." };
    }
    return { ok: false, saved: false, message: describeError(e).message };
  }
  writeEnvKey(key);
  process.env.ANTHROPIC_API_KEY = key;
  client = null;
  return { ok: true, saved: true, message: `Claude connected with the key ending ${key.slice(-4)}.` };
}

export function clearApiKey() {
  writeEnvKey(null);
  delete process.env.ANTHROPIC_API_KEY;
  client = null;
}

/* ------------------------------------------------------------------ */
/* Clarify                                                              */
/* ------------------------------------------------------------------ */

/** The language Claude writes proposals in (Settings › Claude): English by default, or Swedish. */
export type ClarifyLang = "en" | "sv";
export const clarifyLang = (): ClarifyLang => (getSetting("clarifyLang", "en") === "sv" ? "sv" : "en");
const LANG_NAME: Record<ClarifyLang, string> = { en: "English", sv: "Swedish" };

function languageRule(lang: ClarifyLang): string {
  const other = lang === "sv" ? "English" : "Swedish";
  const base = `- LANGUAGE: write everything you produce in ${LANG_NAME[lang]} (action titles, project titles, reference titles and notes; waiting-for names stay as names), even when the captured stuff is in ${other} or another language. Translate faithfully; keep proper nouns, product names and short quoted phrases as they are.`;
  if (lang === "en") return base;
  return `${base}
  - Write natural Swedish in the imperative, as a Swede would note it down: "Ring Anna om Q3-siffrorna", "Skicka offerten till Per", "Boka tid för passfoto". Projects too: "Uppdatera användarmanualen för den nya mjukvaran", "Förnya passen inför Lissabonresan". Use Swedish date and number conventions in notes.
  - The one-step rule holds in Swedish: "Kontrollera insatsen och offerera en lösning" is two actions ("Kontrollera insatsen", "Offerera en lösning") in one project.
  - The examples in these instructions are in English; your output is not.`;
}

const ProposedActionSchema = z.object({
  title: z
    .string()
    .describe(
      "In the owner's chosen language (see LANGUAGE). ONE concrete, physical, verb-first step that can be done in one sitting, e.g. 'Call Anna about the Q3 figures'. Never a bundle: no lists, no 'and', no parentheses enumerating sub-tasks. Under 80 characters.",
    ),
  kind: z.enum(["next", "waiting", "someday"]),
  project: z
    .string()
    .nullable()
    .describe("'new' for this item's new_project, an existing project id from the list, or null for a standalone action"),
  context: z.string().nullable().describe("A context name such as '@phone'. Prefer existing contexts."),
  due: z.string().nullable().describe("YYYY-MM-DD, only for real deadlines stated or clearly implied"),
  defer: z.string().nullable().describe("YYYY-MM-DD before which it cannot be started, else null"),
  time_min: z.number().int().nullable().describe("Estimated minutes: 5, 15, 30, 60, 120 or 240"),
  energy: z.number().int().nullable().describe("1 low, 2 medium, 3 high"),
  waiting_who: z.string().nullable().describe("For kind 'waiting': who is responsible"),
  two_minute: z.boolean().describe("True when the action takes under two minutes and should just be done now"),
});

const ProposalSchema = z.object({
  stuff_id: z.string(),
  disposition: z.enum(["actionable", "someday", "reference", "trash"]),
  new_project: z
    .object({ title: z.string(), area: z.string().nullable() })
    .nullable()
    .describe("A new multi-step project. Its title is verb-first like a next action, e.g. 'Update the user guide for the new software' (never 'Updated user guide…'). Null if no new project is needed."),
  actions: z.array(ProposedActionSchema),
  reference: z.object({ title: z.string(), notes: z.string() }).nullable(),
});

const ClarifyOutput = z.object({ proposals: z.array(ProposalSchema) });

function clarifySystem(state: State): string {
  const projects = state.projects
    .filter((p) => p.status === "active" || p.status === "someday")
    .map((p) => {
      const area = state.areas.find((a) => a.id === p.area_id)?.name ?? "";
      return `- id=${p.id} | ${p.title}${area ? ` | area: ${area}` : ""}${p.status === "someday" ? " | someday" : ""}`;
    })
    .join("\n");
  const contexts = state.contexts.map((c) => c.name).join(", ");
  const areas = state.areas.map((a) => a.name).join(", ");
  const rules = state.rules.filter((r) => r.status === "active").map((r) => `- ${r.text}`).join("\n");
  const d = new Date();
  return `You are the Clarify step of a personal Getting Things Done (GTD) system. The owner captured "stuff" into their inbox. For every inbox item, decide what it is and propose where it goes. The owner reviews each proposal and has the final say, so propose decisively.

Today is ${d.toLocaleDateString("en-GB", { weekday: "long" })} ${today()}.

For each item ask: is it actionable?
- Not actionable: "trash" (no value), "reference" (worth keeping; give a clear title and short notes), or "someday" (maybe later; put a someday action in "actions" with kind "someday").
- Actionable: define the very next physical, visible action. Write every action title verb-first and concrete ("Email Per the shredder test results", never "shredder test"). Rewrite vague captures into a proper next action.
- ONE STEP PER ACTION, WITHOUT EXCEPTION. A next action is a single physical step, never a bundle. If a title would need "and" or "then" between two verbs, a list, a range of items or parentheses enumerating parts ("Update pages 26–55 (manual mode image, map limits, photos…)"), it is not one action: it is a project, and each step becomes its own action in that project.
  - Wrong: one action "Check effort and quote a solution". Right: a project (for example "Quote a solution for the customer") with two actions, "Check the effort needed" and "Quote a solution".
  - Wrong: "Draft the offer, then send it to Per". Right: two actions in one project, "Draft the offer" and "Send the offer to Per".
  - "and" joining two people or things inside ONE step is fine: "Call Anna and Per about the trial" is one action.
  - Before answering, read every action title once more: if it contains two verbs joined by "and", "then" or a comma, split it.
- If the outcome needs more than one action, it is a project. Attach it to an existing project (use its id) when one fits; otherwise create "new_project" and set the actions' project to "new". Name projects in the same verb-first format as next actions, starting with an imperative verb: "Update the user guide for the new software", "Renew passports before the Lisbon trip", "Plan the Q4 team offsite". Never phrase a project title as a finished state ("Updated user guide…", "Passports renewed…"). The title is the project's whole definition of done, so make it specific enough to know when it is finished.
  - Independent pieces of work the source lists explicitly (separate corrections, separate pages, separate questions to answer) each get their own action, up to about 15.
  - For sequential work where later steps depend on earlier ones, propose only the first step or two, not the whole plan.
- Delegated or waiting on someone: an action with kind "waiting" and waiting_who set.
- Set two_minute true when the action would take under two minutes.
- When several inbox items belong to the same new project, give each of them a new_project with exactly the same title (identical wording), so they end up in one project. Prefer an existing project over a new one whenever it fits.
- Documents and emails can contain several separate commitments. Split them into several actions (and at most one new project) within that item's proposal.
${languageRule(clarifyLang())}
- Choose contexts from the existing list where possible: ${contexts || "(none yet)"}. A new context must start with "@".
- Areas of focus: ${areas || "(none)"}.
- Only set due dates that are stated or clearly implied. Leave fields null when unknown; do not invent detail.

Existing projects:
${projects || "(none yet)"}
${rules ? `\nThe owner's standing rules (always apply these):\n${rules}\n` : ""}
Return exactly one proposal per inbox item, using the item's id as stuff_id.`;
}

function fileBlocks(file: FileRow): Anthropic.ContentBlockParam[] {
  const path = `${FILES_DIR}/${file.id}`;
  if (!existsSync(path)) return [];
  if (file.mime === "application/pdf" && file.size < 25_000_000) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: readFileSync(path).toString("base64") },
        title: file.name,
      },
    ];
  }
  if (IMAGE_MIMES.includes(file.mime) && file.size < 5_000_000) {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: file.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: readFileSync(path).toString("base64"),
        },
      },
    ];
  }
  return file.preview ? [{ type: "text", text: `Attached file "${file.name}":\n${file.preview}` }] : [];
}

function itemContent(item: Stuff, files: FileRow[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `<item id="${item.id}" captured="${item.created_at.slice(0, 10)}" kind="${item.kind}">\n${item.text}\n</item>` },
  ];
  for (const f of files) {
    const fb = fileBlocks(f);
    if (fb.length) {
      blocks.push({ type: "text", text: `The following attachment belongs to item ${item.id}:` }, ...fb);
    }
  }
  return blocks;
}

async function clarifyChunk(state: State, items: Stuff[], signal?: AbortSignal): Promise<Proposal[]> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const it of items) {
    content.push(...itemContent(it, state.files.filter((f) => f.owner_kind === "stuff" && f.owner_id === it.id)));
  }
  content.push({ type: "text", text: `Clarify these ${items.length} inbox item(s).` });

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(ClarifyOutput) },
    system: clarifySystem(state),
    messages: [{ role: "user", content }],
  }, { signal });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to clarify these items.");
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off; try clarifying fewer items.");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Claude returned an unreadable proposal.");
  return parsed.proposals.map((p) =>
    // Whatever Claude wrote, a next action leaves here as one step (server/oneStep.ts).
    oneStepPerAction({
      ...p,
      actions: p.actions.map((a) => ({
        ...a,
        energy: a.energy && a.energy >= 1 && a.energy <= 3 ? (a.energy as 1 | 2 | 3) : null,
      })),
    }),
  );
}

interface Job {
  id: string;
  order: string[];
  proposals: Record<string, Proposal>;
  pending: number;
  error: { code: string; message: string } | null;
  done: boolean;
  cancelled: boolean;
  abort: AbortController;
}

const jobs = new Map<string, Job>();

export function startClarify(fresh: boolean): Job {
  const state = loadState();
  const inbox = state.stuff.filter((s) => s.status === "inbox").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const job: Job = {
    id: randomUUID(),
    order: inbox.map((s) => s.id),
    proposals: {},
    pending: 0,
    error: null,
    done: false,
    cancelled: false,
    abort: new AbortController(),
  };
  jobs.set(job.id, job);

  const lang = clarifyLang();
  const cached = new Map<string, Proposal>();
  for (const r of db.prepare("SELECT stuff_id, data FROM proposals").all() as { stuff_id: string; data: string }[]) {
    const p = JSON.parse(r.data) as Proposal & { v?: number; lang?: ClarifyLang };
    // A proposal written in the other language (the setting changed since) is made again.
    if (p.v === PROMPT_VERSION && (p.lang ?? "en") === lang) cached.set(r.stuff_id, oneStepPerAction(p));
  }
  const todo: Stuff[] = [];
  for (const s of inbox) {
    const c = !fresh && cached.get(s.id);
    if (c) job.proposals[s.id] = c;
    else todo.push(s);
  }

  // Small first chunk so the first card is ready quickly; the rest in parallel.
  const chunks: Stuff[][] = [];
  if (todo.length) chunks.push(todo.slice(0, 3));
  for (let i = 3; i < todo.length; i += 8) chunks.push(todo.slice(i, i + 8));
  job.pending = chunks.length;
  if (!chunks.length) job.done = true;

  const save = db.prepare("INSERT OR REPLACE INTO proposals (stuff_id, data, created_at) VALUES (?, ?, ?)");
  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length && !job.error && !job.cancelled) {
      const chunk = chunks[cursor++];
      try {
        const proposals = await clarifyChunk(state, chunk, job.abort.signal);
        for (const p of proposals) {
          if (!chunk.some((c) => c.id === p.stuff_id)) continue;
          job.proposals[p.stuff_id] = p;
          save.run(p.stuff_id, JSON.stringify({ ...p, v: PROMPT_VERSION, lang }), now());
        }
        // Anything Claude skipped still gets an empty proposal the owner can fill in.
        for (const c of chunk) {
          if (!job.proposals[c.id]) job.proposals[c.id] = emptyProposal(c.id);
        }
      } catch (e) {
        if (job.cancelled || e instanceof Anthropic.APIUserAbortError) break;
        console.error("clarify failed", e);
        job.error = describeError(e);
      } finally {
        job.pending--;
        if (job.pending <= 0) job.done = true;
      }
    }
  };
  // The first chunk runs alone so its result isn't delayed by the others.
  (async () => {
    await worker();
  })();
  setTimeout(() => {
    void worker();
    void worker();
  }, 50);
  return job;
}

export function emptyProposal(stuff_id: string): Proposal {
  return { stuff_id, disposition: "actionable", new_project: null, actions: [], reference: null };
}

export function jobStatus(id: string) {
  const job = jobs.get(id);
  if (!job) return null;
  return { id: job.id, order: job.order, proposals: job.proposals, done: job.done, error: job.error, cancelled: job.cancelled };
}

/** Stop Claude: abort requests in flight and skip the rest. Finished proposals stay cached for next time. */
export function cancelClarify(id: string) {
  const job = jobs.get(id);
  if (!job || job.done) return jobStatus(id);
  job.cancelled = true;
  job.done = true;
  job.abort.abort();
  return jobStatus(id);
}

export function forgetProposal(stuffId: string) {
  db.prepare("DELETE FROM proposals WHERE stuff_id = ?").run(stuffId);
}

/* ------------------------------------------------------------------ */
/* Rule suggestions from repeated corrections                           */
/* ------------------------------------------------------------------ */

const RulesOutput = z.object({
  rules: z.array(z.string().describe("One short, specific standing rule for future clarifying")),
});

export async function suggestRules(): Promise<string[]> {
  const state = loadState();
  const corrections = state.corrections.filter((c) => !c.used);
  if (corrections.length < 3) return [];
  const existing = state.rules.map((r) => `- ${r.text}`).join("\n") || "(none)";
  const list = corrections
    .map((c) => `- item "${c.stuff_text.slice(0, 160)}": ${c.field} proposed "${c.proposed}", owner chose "${c.chosen}"`)
    .join("\n");
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(RulesOutput) },
    system:
      "You help a GTD app learn from its owner's corrections. Look for corrections that repeat the same pattern at least twice and turn each pattern into one short, specific standing rule (for example: \"Anything mentioning Per goes to @office in project 'Shredder test'\"). Ignore one-off corrections. Do not repeat existing rules. Write rules in " + LANG_NAME[clarifyLang()] + ". Return an empty list if nothing repeats.",
    messages: [{ role: "user", content: `Existing rules:\n${existing}\n\nCorrections:\n${list}` }],
  });
  const rules = response.parsed_output?.rules ?? [];
  const mark = db.prepare("UPDATE corrections SET used = 1 WHERE id = ?");
  corrections.forEach((c) => mark.run(c.id));
  const ins = db.prepare("INSERT INTO rules (id, text, status, created_at) VALUES (?, ?, 'suggested', ?)");
  rules.slice(0, 3).forEach((r) => ins.run(randomUUID(), r, now()));
  return rules;
}

/* ------------------------------------------------------------------ */
/* Weekly review                                                        */
/* ------------------------------------------------------------------ */

