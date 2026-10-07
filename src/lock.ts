import { useEffect, useState, useSyncExternalStore } from "react";
import { getMeta, getState, localApply, mutate, notify, plural, quote, updateMeta, type MutateOpts } from "./store.ts";
import { flushAll } from "./noteSave.ts";
import type { PickerSpec } from "./ui.tsx";
import type { FileRow, ID, Ref } from "../shared/types.ts";

/*
 * Locked references (owner's request): one lock password; a locked reference's notes and files are encrypted here, in
 * the browser, before they are saved, so the server, its disk and its backups only ever hold ciphertext. The title and
 * project stay readable, so the list and search still find it.
 *
 * A random key (AES-GCM, 256 bits) does the encrypting. The server keeps it only wrapped with a key derived from the
 * password (PBKDF2, SHA-256), so a new password wraps it again and nothing has to be re-encrypted. Each ciphertext is
 * bound to its row's id, so one can't be swapped for another. Unlocked, the key lives in this tab's memory only, and
 * is forgotten after five minutes without a key or a click, on Lock now, or when the tab closes or reloads.
 */

const ITERATIONS = 600_000;
const IDLE_MS = 5 * 60_000;
/** Bytes over a plain ArrayBuffer, as Web Crypto takes them. */
type Bytes = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();
const dec = new TextDecoder();

let key: CryptoKey | null = null;
let idleTimer: number | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
/** Opened notes, kept while unlocked and dropped with the key. */
const opened = new Map<string, string>();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string): Bytes => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

/** Web Crypto exists only on https and localhost: say so instead of failing quietly. */
function cryptoReady(): boolean {
  if (globalThis.crypto?.subtle) return true;
  notify("Locking needs a secure connection (https)", { tone: "error" });
  return false;
}

async function passwordKey(password: string, salt: Bytes, iter: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

/* ---------------- the lock's state ---------------- */

export function useLock() {
  const unlocked = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => key !== null,
  );
  return { unlocked, configured: Boolean(getMeta().lock) };
}
export const isUnlocked = () => key !== null;

const activity = () => {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => lockNow(true), IDLE_MS);
};

function hold(k: CryptoKey) {
  key = k;
  window.addEventListener("keydown", activity, true);
  window.addEventListener("pointerdown", activity, true);
  activity();
  emit();
}

/** Forget the key: everything locked is unreadable again until the password is typed. */
export function lockNow(idle = false) {
  if (!key) return;
  // A locked note being typed in is saved (encrypted) first, while the key is still here.
  void flushAll().finally(() => shut(idle));
}
function shut(idle: boolean) {
  if (!key) return;
  key = null;
  window.clearTimeout(idleTimer);
  window.removeEventListener("keydown", activity, true);
  window.removeEventListener("pointerdown", activity, true);
  opened.clear();
  emit();
  notify(idle ? "Locked again after 5 minutes idle" : "Locked references locked");
}

/**
 * Takes the lock password away, when nothing is locked with it any more (the server checks too): the key goes, and
 * L on Reference asks for a new password the next time.
 */
export async function removeLockPassword() {
  const was = getMeta().lock;
  if (!was) return;
  const res = await fetch("/api/settings/lock", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ replaces: was.wrapped }) });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return notify(j.error ?? "Couldn't remove the lock password", { tone: "error" });
  if (key) shut(false);
  updateMeta({ lock: null });
  notify("Lock password removed");
}

/** Opens the lock with the password; false when it is wrong. */
export async function unlock(password: string): Promise<boolean> {
  const lock = getMeta().lock;
  if (!lock || !cryptoReady()) return false;
  try {
    const wrapped = unb64(lock.wrapped);
    const k = await crypto.subtle.unwrapKey(
      "raw",
      wrapped.subarray(12),
      await passwordKey(password, unb64(lock.salt), lock.iter),
      { name: "AES-GCM", iv: wrapped.subarray(0, 12) },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    hold(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sets the lock password: the first time, with a new random key; after that (unlocked) the same key, wrapped anew,
 * so everything already locked opens with the new password.
 */
export async function setPassword(password: string): Promise<boolean> {
  const was = getMeta().lock;
  if (!cryptoReady()) return false;
  if (was && !key) {
    notify("Unlock first, with the current password", { tone: "error" });
    return false;
  }
  const k = key ?? (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]));
  const salt = random(16);
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.wrapKey("raw", k, await passwordKey(password, salt, ITERATIONS), { name: "AES-GCM", iv }));
  const wrapped = new Uint8Array(12 + ct.length);
  wrapped.set(iv);
  wrapped.set(ct, 12);
  const res = await fetch("/api/settings/lock", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ salt: b64(salt), iter: ITERATIONS, wrapped: b64(wrapped), replaces: was?.wrapped ?? null }),
  });
  const j = (await res.json().catch(() => ({}))) as { lock?: typeof was; error?: string };
  if (!j.lock) {
    notify(j.error ?? "Couldn't save the lock password", { tone: "error" });
    return false;
  }
  updateMeta({ lock: j.lock });
  if (!key) hold(k);
  notify(was ? "Lock password changed" : "Lock password set");
  return true;
}

/* ---------------- sealing ---------------- */

function needKey(): CryptoKey {
  if (!key) throw new Error("Locked");
  return key;
}

async function sealBytes(id: ID, plain: Bytes): Promise<Bytes> {
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(id) }, needKey(), plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}
async function openBytes(id: ID, sealed: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.subarray(0, 12), additionalData: enc.encode(id) }, needKey(), sealed.subarray(12)));
}
/** Text as "v1.<base64>": the IV and ciphertext together. */
const sealText = async (id: ID, text: string) => `v1.${b64(await sealBytes(id, enc.encode(text)))}`;
async function openText(id: ID, env: string): Promise<string> {
  const hit = opened.get(`${id}|${env}`);
  if (hit !== undefined) return hit;
  const text = dec.decode(await openBytes(id, unb64(env.slice(3))));
  opened.set(`${id}|${env}`, text);
  return text;
}

/** A locked reference's notes, opened while unlocked; null while locked (or still opening). */
export function useOpenedNotes(r: Ref): string | null {
  const { unlocked } = useLock();
  const [notes, setNotes] = useState<string | null>(() => (r.sealed && unlocked ? (opened.get(`${r.id}|${r.sealed}`) ?? null) : null));
  useEffect(() => {
    if (!r.sealed || !unlocked) return setNotes(null);
    let live = true;
    openText(r.id, r.sealed).then(
      (t) => live && setNotes(t),
      () => live && notify("These notes can't be opened with this key", { tone: "error" }),
    );
    return () => {
      live = false;
    };
  }, [r.id, r.sealed, unlocked]);
  return notes;
}

/** A locked file's real name and type (kept encrypted in its row), while unlocked. */
export function useOpenedFile(f: FileRow): { name: string; mime: string } | null {
  const { unlocked } = useLock();
  const [m, setM] = useState<{ name: string; mime: string } | null>(null);
  useEffect(() => {
    if (!f.sealed || !unlocked) return setM(null);
    let live = true;
    openText(f.id, f.preview).then(
      (t) => live && setM(JSON.parse(t)),
      () => live && setM({ name: "Locked file", mime: "application/octet-stream" }),
    );
    return () => {
      live = false;
    };
  }, [f.id, f.preview, f.sealed, unlocked]);
  return m;
}

/** Saves edited notes of a locked reference, encrypted. */
export async function saveSealedNotes(r: Ref, notes: string, label = "Saved", extra: Record<string, unknown> = {}, opts: MutateOpts = {}): Promise<boolean> {
  if (!key) return false;
  const sealed = await sealText(r.id, notes);
  opened.set(`${r.id}|${sealed}`, notes);
  return mutate(label, [{ type: "patch", table: "refs", id: r.id, data: { sealed, ...extra } }], opts);
}

/** A locked reference's notes, read outside a component (unlocked only). */
export const readSealedNotes = (r: Ref) => openText(r.id, r.sealed!);

const fileBytes = async (id: ID) => {
  const res = await fetch(`/api/files/${id}`);
  if (!res.ok) throw new Error(res.statusText);
  return new Uint8Array(await res.arrayBuffer());
};

async function rewrite(id: ID, body: Bytes, query: string, headers: Record<string, string>) {
  const res = await fetch(`/api/files/${id}/content?${query}`, { method: "PUT", headers: { "content-type": "application/octet-stream", ...headers }, body: body as BlobPart });
  if (!res.ok) throw new Error(res.statusText);
  localApply([{ type: "patch", table: "files", id, data: (await res.json()) as Record<string, unknown> }]);
}

/** Encrypts a file already stored in the clear, in place: its bytes, and its name and type into its row. */
export async function sealFile(f: FileRow) {
  if (f.sealed) return;
  const meta = await sealText(f.id, JSON.stringify({ name: f.name, mime: f.mime }));
  await rewrite(f.id, await sealBytes(f.id, await fileBytes(f.id)), "sealed=1", { "x-file-meta": meta });
}

async function unsealFile(f: FileRow) {
  if (!f.sealed) return;
  const { name, mime } = JSON.parse(await openText(f.id, f.preview)) as { name: string; mime: string };
  await rewrite(f.id, await openBytes(f.id, await fileBytes(f.id)), "sealed=0", { "x-file-name": encodeURIComponent(name), "x-file-type": mime });
}

const filesOf = (refId: ID) => getState().files.filter((f) => f.owner_kind === "ref" && f.owner_id === refId);

/** Locks references: notes first (they are the row), then each file. Not undoable: Remove the lock is the way back. */
export async function lockRefs(ids: ID[]) {
  if (!cryptoReady()) return;
  const refs = getState().refs.filter((r) => ids.includes(r.id) && !r.sealed);
  if (!refs.length) return notify("Already locked");
  try {
    const ops = await Promise.all(refs.map(async (r) => ({ type: "patch" as const, table: "refs" as const, id: r.id, data: { notes: "", sealed: await sealText(r.id, r.notes) } })));
    mutate("", ops, { silent: true, undoable: false });
    for (const r of refs) for (const f of filesOf(r.id)) await sealFile(f);
    notify(`${refs.length === 1 ? quote(refs[0].title || "Untitled") : plural(refs.length, "reference")} locked: notes and files encrypted`);
  } catch (e) {
    notify(`Locking stopped: ${(e as Error).message}. Open it while unlocked to finish.`, { tone: "error" });
  }
}

/** Takes the lock off: notes and files back in the clear (files are read for search again). */
export async function unlockRefs(ids: ID[]) {
  const refs = getState().refs.filter((r) => ids.includes(r.id) && r.sealed);
  if (!refs.length) return;
  try {
    for (const r of refs) for (const f of filesOf(r.id)) await unsealFile(f);
    const ops = await Promise.all(refs.map(async (r) => ({ type: "patch" as const, table: "refs" as const, id: r.id, data: { notes: await openText(r.id, r.sealed!), sealed: null } })));
    mutate("", ops, { silent: true, undoable: false });
    notify(`${refs.length === 1 ? quote(refs[0].title || "Untitled") : plural(refs.length, "reference")} no longer locked`);
  } catch (e) {
    notify(`Couldn't remove the lock: ${(e as Error).message}`, { tone: "error" });
  }
}

/**
 * A locked reference's files never arrive in the clear: each is encrypted here, under an id chosen here (its
 * ciphertext is bound to it), and stored as sent.
 */
export async function uploadSealed(files: File[], refId: ID) {
  if (!cryptoReady()) return;
  if (!key) return notify("Unlock it first: its files are encrypted", { tone: "error" });
  notify(`Encrypting ${plural(files.length, "file")}…`);
  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const form = new FormData();
      form.append("file", new Blob([(await sealBytes(id, new Uint8Array(await file.arrayBuffer()))) as BlobPart]), "locked");
      form.append("sealed", "1");
      form.append("id", id);
      form.append("meta", await sealText(id, JSON.stringify({ name: file.name, mime: file.type || "application/octet-stream" })));
      form.append("owner_kind", "ref");
      form.append("owner_id", refId);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(res.statusText);
      const { files: rows } = (await res.json()) as { files: Record<string, unknown>[] };
      localApply(rows.map((row) => ({ type: "create" as const, table: "files" as const, row })));
    }
    notify(`Attached ${plural(files.length, "file")}, encrypted`);
  } catch (e) {
    notify(`Upload failed: ${(e as Error).message}`, { tone: "error" });
  }
}

/** A locked file opened here for the viewer: its real name and type, and its bytes. */
export async function openSealedData(f: FileRow): Promise<{ name: string; mime: string; bytes: Bytes }> {
  const { name, mime } = JSON.parse(await openText(f.id, f.preview)) as { name: string; mime: string };
  return { name, mime, bytes: await openBytes(f.id, await fileBytes(f.id)) };
}

/** Saves a locked file under its own name, decrypted here. */
export async function downloadSealed(f: FileRow) {
  try {
    const { name, bytes } = await openSealedData(f);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    notify(`Couldn't open it: ${(e as Error).message}`, { tone: "error" });
  }
}

/* ---------------- asking for the password ---------------- */

type Ask = { openPicker: (p: PickerSpec) => void };
/** One picker after another: the first has to close before the next opens. */
const next = (f: () => void) => window.setTimeout(f);

/** Types the lock password; a wrong one asks again. */
export function askUnlock(ui: Ask, then?: () => void) {
  ui.openPicker({
    type: "text",
    title: "Lock password",
    current: "",
    secret: "current",
    preview: (v) => (v ? { ok: true, text: "Unlock. It locks again after 5 minutes idle" } : { ok: false, text: "Type the lock password" }),
    onPick: (v) =>
      void unlock(v).then((ok) => {
        if (ok) return then?.();
        notify("That isn't the lock password", { tone: "error" });
        next(() => askUnlock(ui, then));
      }),
  });
}

/** Sets the lock password, or changes it (unlocking first with the current one). */
export function choosePassword(ui: Ask, then?: () => void) {
  const was = Boolean(getMeta().lock);
  if (was && !key) return askUnlock(ui, () => next(() => choosePassword(ui, then)));
  ui.openPicker({
    type: "text",
    title: was ? "New lock password" : "Choose a lock password",
    current: "",
    secret: "new",
    preview: (v) =>
      v.length < 8 ? { ok: false, text: "At least 8 characters" } : { ok: true, text: "Forgotten, it can't be reset: what it locks is lost" },
    onPick: (first) =>
      next(() =>
        ui.openPicker({
          type: "text",
          title: "Type it again",
          current: "",
          secret: "new",
          preview: (v) => (v === first ? { ok: true, text: was ? "Change the lock password" : "Set the lock password" } : { ok: false, text: v ? "Not the same as the first" : "Type it once more" }),
          onPick: (v) => v === first && void setPassword(v).then((ok) => ok && then?.()),
        }),
      ),
  });
}

/** L: lock with the password, setting one the first time. */
export function lockWithPassword(ui: Ask, ids: ID[]) {
  if (!getMeta().lock) return choosePassword(ui, () => void lockRefs(ids));
  if (!key) return askUnlock(ui, () => void lockRefs(ids));
  void lockRefs(ids);
}

/** Takes the lock off (unlocking first). */
export function removeLock(ui: Ask, ids: ID[]) {
  if (!key) return askUnlock(ui, () => void unlockRefs(ids));
  void unlockRefs(ids);
}
