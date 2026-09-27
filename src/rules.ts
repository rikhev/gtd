import { load, notify, plural } from "./store.ts";

/** Ask Claude to turn repeated corrections into rules. Only ever run on the owner's request. */
export async function suggestRules() {
  notify("Asking Claude to look at your corrections…");
  try {
    const j = (await (await fetch("/api/rules/suggest", { method: "POST" })).json()) as { rules?: string[]; error?: { message: string } };
    if (j.error) return notify(`Claude couldn't suggest rules: ${j.error.message}`, { tone: "error" });
    if (j.rules?.length) {
      await load();
      notify(`Claude suggests ${plural(j.rules.length, "rule")} · review them in Settings`);
    } else notify("No new rules: your corrections don't repeat yet.");
  } catch (e) {
    notify(`Claude couldn't suggest rules: ${(e as Error).message}`, { tone: "error" });
  }
}
