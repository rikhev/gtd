import { simpleParser } from "mailparser";
import mammoth from "mammoth";
import MsgReader from "@kenjiuno/msgreader";
import { extractText } from "unpdf";

const PREVIEW_LIMIT = 60_000;

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export interface Extracted {
  /** Short line used as the inbox subject. */
  title: string;
  /** Plain-text body, used for previews and for Claude when the file isn't sent natively. */
  text: string;
  kind: "email" | "file";
  mime: string;
}

export function guessMime(name: string, given: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    eml: "message/rfc822",
    msg: "application/vnd.ms-outlook",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  return map[ext] ?? (given || "application/octet-stream");
}

const clip = (s: string) => (s.length > PREVIEW_LIMIT ? s.slice(0, PREVIEW_LIMIT) + "\n…" : s);

export async function extract(name: string, mime: string, buf: Buffer): Promise<Extracted> {
  const base = name.replace(/\.[^.]+$/, "");
  try {
    if (mime === "message/rfc822") {
      const mail = await simpleParser(buf);
      const from = mail.from?.text ?? "";
      const header = [`From: ${from}`, mail.date ? `Date: ${mail.date.toISOString().slice(0, 10)}` : "", `Subject: ${mail.subject ?? ""}`]
        .filter(Boolean)
        .join("\n");
      return { title: mail.subject || base, text: clip(`${header}\n\n${mail.text ?? ""}`), kind: "email", mime };
    }
    if (mime === "application/vnd.ms-outlook") {
      const reader = new MsgReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      const data = reader.getFileData();
      const header = `From: ${data.senderName ?? ""} ${data.senderEmail ? `<${data.senderEmail}>` : ""}\nSubject: ${data.subject ?? ""}`;
      return { title: data.subject || base, text: clip(`${header}\n\n${data.body ?? ""}`), kind: "email", mime };
    }
    if (mime === "application/pdf") {
      const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
      return { title: base, text: clip(String(text).trim()), kind: "file", mime };
    }
    if (mime.includes("wordprocessingml")) {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { title: base, text: clip(value.trim()), kind: "file", mime };
    }
    if (mime.startsWith("text/") || mime === "application/json") {
      return { title: base, text: clip(buf.toString("utf8")), kind: "file", mime };
    }
  } catch (e) {
    return { title: base, text: `(Could not read this file: ${(e as Error).message})`, kind: "file", mime };
  }
  return { title: base, text: "", kind: "file", mime };
}

/** Heuristic: pasted text that looks like an email thread. */
export function looksLikeEmail(text: string): boolean {
  return /^(from|fr[aå]n|to|till|subject|[äa]mne|sent|skickat):/im.test(text) && text.split("\n").length > 3;
}
