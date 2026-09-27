import { notify, updateMeta } from "./store.ts";
import type { UI } from "./ui.tsx";

/** Ask for a Claude API key, have the server check it with Claude, and store it in .env. */
export function promptApiKey(ui: UI, onSaved?: () => void) {
  ui.openPicker({
    type: "text",
    title: "Claude API key",
    current: "",
    secret: true,
    placeholder: "sk-ant-…",
    preview: (s) => {
      const v = s.trim();
      if (!v) return { ok: false, text: "Paste the key from the Claude Console" };
      if (!v.startsWith("sk-ant-")) return { ok: false, text: "Claude API keys start with sk-ant-" };
      return { ok: true, text: `Checks the key ending ${v.slice(-4)} with Claude, then saves it on this Mac` };
    },
    onPick: (key) => void saveApiKey(key).then((ok) => ok && onSaved?.()),
  });
}

async function saveApiKey(key: string): Promise<boolean> {
  notify("Checking the key with Claude…");
  try {
    const res = await fetch("/api/settings/key", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const j = (await res.json()) as { ok: boolean; message: string; hasKey: boolean; keyHint: string | null };
    updateMeta({ hasKey: j.hasKey, keyHint: j.keyHint });
    notify(j.message, { tone: j.ok ? "info" : "error" });
    return j.ok;
  } catch (e) {
    notify(`Couldn't save the key: ${(e as Error).message}`, { tone: "error" });
    return false;
  }
}

export async function removeApiKey() {
  const res = await fetch("/api/settings/key", { method: "DELETE" });
  const j = (await res.json()) as { hasKey: boolean; keyHint: string | null };
  updateMeta({ hasKey: j.hasKey, keyHint: j.keyHint });
  notify(j.hasKey ? "Key removed from .env, but a key is still set in the environment the server started with" : "API key removed. Clarify and Review are off until you add one.");
}
