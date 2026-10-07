import { simpleParser } from "mailparser";
import mammoth from "mammoth";
import MsgReader from "@kenjiuno/msgreader";
import { csvTable, docPage, emailBlock, textBlock } from "../shared/viewDoc.ts";

/**
 * Documents the viewer shows as a page made here: Word, email, CSV, text and HTML. PDFs and images need no page (the
 * browser shows them as they are); anything else isn't shown, only downloaded.
 */
export function viewKind(mime: string): "page" | "pdf" | "image" | null {
  if (mime === "application/pdf") return "pdf";
  if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime)) return "image";
  if (mime.includes("wordprocessingml") || mime === "message/rfc822" || mime === "application/vnd.ms-outlook") return "page";
  if (mime.startsWith("text/") || mime === "application/json") return "page";
  return null;
}

const isCsv = (name: string, mime: string) => mime === "text/csv" || mime === "text/tab-separated-values" || /\.(csv|tsv)$/i.test(name);

/** `zone` is the owner's time zone, as their browser reports it: an email's date is never in the server's. */
export async function renderPage(name: string, mime: string, buf: Buffer, dark: boolean, zone?: string): Promise<string> {
  const title = name;
  if (mime.includes("wordprocessingml")) {
    // Word's own headings, lists, tables, emphasis and pictures (kept inside the page); its fonts and colours are left out.
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    // Its tables are data, ruled as a CSV's are (an email's tables are layout and keep their own look).
    return docPage(title, value.replaceAll("<table>", '<table class="grid">') || `<p class="none">This document is empty.</p>`, dark);
  }
  if (mime === "message/rfc822") {
    const mail = await simpleParser(buf);
    const body = mail.html || (mail.text ? textBlock(mail.text) : `<p class="none">No message text.</p>`);
    return docPage(title, emailBlock({ from: mail.from?.text, to: Array.isArray(mail.to) ? mail.to.map((t) => t.text).join(", ") : mail.to?.text, date: mail.date?.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: zone }), subject: mail.subject }, body), dark);
  }
  if (mime === "application/vnd.ms-outlook") {
    const data = new MsgReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer).getFileData();
    const from = `${data.senderName ?? ""}${data.senderEmail ? ` <${data.senderEmail}>` : ""}`.trim();
    return docPage(title, emailBlock({ from, subject: data.subject }, data.body ? textBlock(data.body) : `<p class="none">No message text.</p>`), dark);
  }
  const text = buf.toString("utf8");
  if (isCsv(name, mime)) return docPage(title, csvTable(text), dark, true);
  // A web page is shown as written, but in the sandbox: no scripts, nothing fetched.
  if (mime === "text/html") return text.includes("<") ? text : docPage(title, textBlock(text), dark);
  return docPage(title, text.trim() ? textBlock(text) : `<p class="none">This file is empty.</p>`, dark);
}

