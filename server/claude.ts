import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFileSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { db, FILES_DIR, loadState, now } from "./db.ts";
import { IMAGE_MIMES } from "./extract.ts";
import { today } from "../shared/dates.ts";
import type { FileRow, Proposal, ReviewFlag, State, Stuff } from "../shared/types.ts";

const MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function describeError(e: unknown): { code: string; message: string } {
  if (e instanceof Anthropic.AuthenticationError) {
    return { code: "auth", message: "Claude rejected the API key. Enter a working key in Settings." };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { code: "rate", message: "Claude is rate-limiting requests. Wait a minute, then press K again." };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { code: "network", message: "Couldn't reach the Claude API. Check the network connection, then press K again." };
  }
  if (e instanceof Anthropic.APIError) {
    return { code: `api_${e.status}`, message: `Claude API error ${e.status}: ${e.message}` };
  }
  const msg = (e as Error)?.message ?? String(e);
  if (/api.?key|credential|auth/i.test(msg)) {
    return { code: "auth", message: "No Claude API key yet. Add one in Settings, then ask Claude again." };
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

const ProposedActionSchema = z.object({
  title: z.string().describe("Concrete, physical, verb-first next action, e.g. 'Call Anna about the Q3 figures'"),
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
    .describe("A new multi-step outcome, phrased as a finished result. Null if no new project is needed."),
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
- If the outcome needs more than one action, it is a project. Attach it to an existing project (use its id) when one fits; otherwise create "new_project" with a title phrased as the finished result, and set the actions' project to "new". Only propose the next one or two actions of a project, not a full plan.
- Delegated or waiting on someone: an action with kind "waiting" and waiting_who set.
- Set two_minute true when the action would take under two minutes.
- Documents and emails can contain several separate commitments. Split them into several actions (and at most one new project) within that item's proposal.
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

async function clarifyChunk(state: State, items: Stuff[]): Promise<Proposal[]> {
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
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to clarify these items.");
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off; try clarifying fewer items.");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Claude returned an unreadable proposal.");
  return parsed.proposals.map((p) => ({
    ...p,
    actions: p.actions.map((a) => ({
      ...a,
      energy: a.energy && a.energy >= 1 && a.energy <= 3 ? (a.energy as 1 | 2 | 3) : null,
    })),
  }));
}

interface Job {
  id: string;
  order: string[];
  proposals: Record<string, Proposal>;
  pending: number;
  error: { code: string; message: string } | null;
  done: boolean;
}

const jobs = new Map<string, Job>();

export function startClarify(fresh: boolean): Job {
  const state = loadState();
  const inbox = state.stuff.filter((s) => s.status === "inbox").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const job: Job = { id: randomUUID(), order: inbox.map((s) => s.id), proposals: {}, pending: 0, error: null, done: false };
  jobs.set(job.id, job);

  const cached = new Map(
    (db.prepare("SELECT stuff_id, data FROM proposals").all() as { stuff_id: string; data: string }[]).map((r) => [
      r.stuff_id,
      JSON.parse(r.data) as Proposal,
    ]),
  );
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
    while (cursor < chunks.length && !job.error) {
      const chunk = chunks[cursor++];
      try {
        const proposals = await clarifyChunk(state, chunk);
        for (const p of proposals) {
          if (!chunk.some((c) => c.id === p.stuff_id)) continue;
          job.proposals[p.stuff_id] = p;
          save.run(p.stuff_id, JSON.stringify(p), now());
        }
        // Anything Claude skipped still gets an empty proposal the owner can fill in.
        for (const c of chunk) {
          if (!job.proposals[c.id]) job.proposals[c.id] = emptyProposal(c.id);
        }
      } catch (e) {
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
  return { id: job.id, order: job.order, proposals: job.proposals, done: job.done, error: job.error };
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
      "You help a GTD app learn from its owner's corrections. Look for corrections that repeat the same pattern at least twice and turn each pattern into one short, specific standing rule (for example: \"Anything mentioning Per goes to @office in project 'Shredder test'\"). Ignore one-off corrections. Do not repeat existing rules. Return an empty list if nothing repeats.",
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

const ReviewOutput = z.object({
  flags: z.array(
    z.object({
      kind: z.enum(["project", "action", "waiting", "someday"]),
      id: z.string(),
      issue: z.enum(["stalled", "stale", "vague", "overdue", "other"]),
      message: z.string().describe("One short sentence the owner reads in the list"),
      suggested_title: z.string().nullable().describe("A clearer verb-first rewrite for vague actions"),
      suggested_next_action: z.string().nullable().describe("For stalled projects: a concrete next action"),
    }),
  ),
});

export async function analyzeReview(): Promise<ReviewFlag[]> {
  const s = loadState();
  const t = today();
  const ctx = (id: string | null) => s.contexts.find((c) => c.id === id)?.name ?? "";
  const projects = s.projects
    .filter((p) => p.status === "active")
    .map((p) => {
      const acts = s.actions.filter((a) => a.project_id === p.id && ["next", "waiting"].includes(a.status));
      const lastDone = s.actions
        .filter((a) => a.project_id === p.id && a.completed_at)
        .map((a) => a.completed_at!.slice(0, 10))
        .sort()
        .pop();
      return `- project id=${p.id} "${p.title}" outcome="${p.outcome}" open actions: ${
        acts.map((a) => `[${a.status}] ${a.title}`).join("; ") || "NONE"
      }; last completed action: ${lastDone ?? "never"}`;
    })
    .join("\n");
  const next = s.actions
    .filter((a) => a.status === "next")
    .map((a) => `- action id=${a.id} "${a.title}" ${ctx(a.context_id)} created ${a.created_at.slice(0, 10)}${a.due ? ` due ${a.due}` : ""}`)
    .join("\n");
  const waiting = s.actions
    .filter((a) => a.status === "waiting")
    .map((a) => `- waiting id=${a.id} "${a.title}" who=${a.waiting_who ?? "?"} since=${a.waiting_since ?? "?"} followup=${a.followup ?? "none"}`)
    .join("\n");
  const someday = s.actions
    .filter((a) => a.status === "someday")
    .map((a) => `- someday id=${a.id} "${a.title}" created ${a.created_at.slice(0, 10)}`)
    .join("\n");

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(ReviewOutput) },
    system: `You assist the owner's GTD Weekly Review. Today is ${t}. Flag only what deserves attention:
- stalled: an active project with no open next or waiting action (always suggest a concrete next action).
- stale: waiting-for items older than about 10 days or past their follow-up date; next actions untouched for over a month.
- vague: action titles that are not concrete, verb-first physical actions (suggest a rewrite).
- overdue: past due dates.
Keep messages short and specific. Use the exact ids given. Don't flag healthy items.`,
    messages: [
      {
        role: "user",
        content: `Active projects:\n${projects || "(none)"}\n\nNext actions:\n${next || "(none)"}\n\nWaiting for:\n${waiting || "(none)"}\n\nSomeday/maybe:\n${someday || "(none)"}`,
      },
    ],
  });
  return response.parsed_output?.flags ?? [];
}
