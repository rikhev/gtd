/*
 * The page a document is shown as in the viewer (owner's request: view reference documents in the app, never by
 * downloading them): plain HTML, styled to read like the app's sheet, light or dark. It is always shown in a
 * sandboxed frame with no scripts and nothing fetched, so what a document holds can't run or call out. Used by the
 * server (Word, email, CSV, text) and by the browser for a locked file it decrypts itself (CSV, text).
 */

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** One CSV (or tab-separated) file as rows of cells; quoted cells may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  // The separator the first line uses most: a tab, a semicolon (a European spreadsheet's export), or a comma.
  const first = text.split("\n")[0];
  const count = (ch: string) => first.split(ch).length - 1;
  const sep = count("\t") && count("\t") >= count(",") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** A table, its first row as the heading row. Long files stop at 2,000 rows, and say so. */
export function csvTable(text: string): string {
  const rows = parseCsv(text);
  if (!rows.length) return `<p class="none">This file is empty.</p>`;
  const cap = 2000;
  const [head, ...body] = rows;
  const cells = (r: string[], tag: string) => `<tr>${r.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;
  return `<table><thead>${cells(head, "th")}</thead><tbody>${body.slice(0, cap).map((r) => cells(r, "td")).join("")}</tbody></table>${body.length > cap ? `<p class="none">The first ${cap} of ${body.length} rows.</p>` : ""}`;
}

/** Plain text (and Markdown, JSON) as it was typed, wrapped to the page. */
export const textBlock = (text: string) => `<pre>${escapeHtml(text)}</pre>`;

/** An email: who, when and what, then its words. */
export function emailBlock(head: { from?: string; to?: string; date?: string; subject?: string }, bodyHtml: string): string {
  const row = (k: string, v?: string) => (v ? `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>` : "");
  return `<header class="mail"><h1>${escapeHtml(head.subject || "(No subject)")}</h1><table>${row("From", head.from)}${row("To", head.to)}${row("Date", head.date)}</table></header>${bodyHtml}`;
}

/** The whole page: the document's body on the app's sheet, with its type and spacing. */
export function docPage(title: string, body: string, dark: boolean, wide = false): string {
  // The app's own tokens (sheet, ink, ink-2, rule, wash), light and dark: the frame can't read the app's stylesheet.
  const c = dark
    ? { bg: "#1b1f23", ink: "#e7eaed", ink2: "#b4bac0", rule: "#2a2f35", wash: "#232a31" }
    : { bg: "#fbfcfd", ink: "#16191d", ink2: "#454b53", rule: "#dbe0e4", wash: "#e9eef2" };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
:root{color-scheme:${dark ? "dark" : "light"}}
html{background:${c.bg};color:${c.ink}}
body{margin:0 auto;padding:32px 40px 64px;max-width:${wide ? "none" : "760px"};font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;overflow-wrap:anywhere}
h1,h2,h3,h4{line-height:1.25;margin:1.6em 0 .5em;text-wrap:balance}
h1{font-size:1.5em}h2{font-size:1.25em}h3{font-size:1.08em}
p{margin:0 0 .9em}
a{color:inherit;text-underline-offset:3px}
img{max-width:100%;height:auto}
ul,ol{padding-left:1.4em}
table{border-collapse:collapse;margin:0 0 1em;font-size:14px;font-variant-numeric:tabular-nums}
th,td{border:1px solid ${c.rule};padding:5px 9px;text-align:left;vertical-align:top}
thead th{background:${c.wash};position:sticky;top:0}
pre{white-space:pre-wrap;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0}
.mail{margin:0 0 28px;padding-bottom:16px;border-bottom:1px solid ${c.rule}}
.mail h1{margin-top:0}
.mail table{font-size:14px;margin:0}.mail th,.mail td{border:0;padding:2px 12px 2px 0}.mail th{color:${c.ink2};font-weight:500;background:none}
.none{color:${c.ink2}}
::selection{background:${dark ? "#1f3656" : "#dce6f3"}}
</style></head><body>${body}</body></html>`;
}
