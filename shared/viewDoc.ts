/*
 * The page a document is shown as in the viewer (owner's request: view reference documents in the app, never by
 * downloading them): plain HTML on a white sheet of paper (as a PDF page is), on the stage's light or dark paper. It is always shown in a
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
  return `<table class="grid"><thead>${cells(head, "th")}</thead><tbody>${body.slice(0, cap).map((r) => cells(r, "td")).join("")}</tbody></table>${body.length > cap ? `<p class="none">The first ${cap} of ${body.length} rows.</p>` : ""}`;
}

/** Plain text (and Markdown, JSON) as it was typed, wrapped to the page. */
export const textBlock = (text: string) => `<pre>${escapeHtml(text)}</pre>`;

/** An email: who, when and what, then its words. Cc shows only when it has someone on it. */
export function emailBlock(head: { from?: string; to?: string; cc?: string; date?: string; subject?: string }, bodyHtml: string): string {
  const row = (k: string, v?: string) => (v ? `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>` : "");
  return `<header class="mail"><h1>${escapeHtml(head.subject || "(No subject)")}</h1><table>${row("From", head.from)}${row("To", head.to)}${row("Cc", head.cc)}${row("Date", head.date)}</table></header>${bodyHtml}`;
}

/**
 * An HTML email is a whole document of its own. Pasted into the page as it is, its <body> attributes and its body and
 * html rules took over the page (owner's report: emails sat at the left edge, not centred like every other document).
 * So only its styles and the inside of its body are kept, and its body and html rules are pointed at a wrapper of
 * its own, inside the page's centred column.
 */
export function emailHtml(html: string): string {
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) =>
    m[1]
      .replace(/(^|[\s,{}>+~(])(?:html|body)(?=[\s,{.:#\[>+~)]|$)/gi, "$1.mail-body")
      // It is read on white paper in both themes, so its own dark-mode rules never apply.
      .replace(/prefers-color-scheme\s*:\s*dark/gi, "prefers-color-scheme: paper"),
  );
  const inner = html.match(/<body\b[^>]*>([\s\S]*?)(?:<\/body>|$)/i)?.[1] ?? html.replace(/<head\b[\s\S]*?<\/head>|<\/?(?:html|head)\b[^>]*>|<!doctype[^>]*>/gi, "");
  const body = inner.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  return `${styles.length ? `<style>${styles.join("\n")}</style>` : ""}<div class="mail-body">${body}</div>`;
}

/** The whole page: the document on the app's sheet, in one centred column, with its type and spacing. */
export function docPage(title: string, body: string, dark: boolean, wide = false): string {
  // A document is paper on the stage, as a PDF's pages are (owner's request): a white sheet in both themes, in the
  // light theme's ink, on the stage's own paper colour (the app's `paper` token, light or dark). The frame can't read
  // the app's stylesheet, so the tokens are written out here.
  const stage = dark ? "#15181b" : "#f3f5f7";
  const c = { bg: "#ffffff", ink: "#16191d", ink2: "#454b53", rule: "#dbe0e4", wash: "#e9eef2" };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
:root{color-scheme:${dark ? "dark" : "light"}}
html{background:${stage}}
body{margin:0;padding:32px 32px 56px;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;overflow-wrap:anywhere}
/* The sheet: white, centred, with a PDF page's soft shadow, and its margins inside it; at least a screen tall, so even a
   two-line note reads as a page. A table (CSV) takes the stage's width. */
.doc{box-sizing:border-box;margin:0 auto;padding:56px 64px 64px;max-width:${wide ? "none" : "888px"};min-height:calc(100vh - 88px);text-align:left;color-scheme:light;
  background:${c.bg};color:${c.ink};box-shadow:0 1px 2px rgb(0 0 0 / .06),0 4px 16px rgb(0 0 0 / .08)}
@media (max-width:600px){body{padding:12px 12px 36px}.doc{padding:28px 22px 36px}}
.mail-body{margin:0 auto}
h1,h2,h3,h4{line-height:1.25;margin:1.6em 0 .5em;text-wrap:balance}
h1{font-size:1.5em}h2{font-size:1.25em}h3{font-size:1.08em}
p{margin:0 0 .9em}
a{color:inherit;text-underline-offset:3px}
img{max-width:100%;height:auto}
ul,ol{padding-left:1.4em}
/* Ruled cells only for tables the app lays out (a CSV, a Word document): an email's tables are its layout, drawn
   with exactly the borders it gives them, so one without borders shows none (owner's request). */
.grid{border-collapse:collapse;margin:0 0 1em;font-size:14px;font-variant-numeric:tabular-nums}
.grid th,.grid td{border:1px solid ${c.rule};padding:5px 9px;text-align:left;vertical-align:top}
.grid thead th{background:${c.wash};position:sticky;top:0}
pre{white-space:pre-wrap;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0}
.mail{margin:0 0 28px;padding-bottom:16px;border-bottom:1px solid ${c.rule}}
.mail h1{margin-top:0}
/* The page's own header for an email: held against the email's styles, which may restyle every table and cell. */
.mail table{font-size:14px!important;margin:0!important;width:auto!important;border-collapse:collapse!important}
.mail th,.mail td{border:0!important;padding:2px 12px 2px 0!important;text-align:left!important;vertical-align:top!important;background:none!important}
.mail th{color:${c.ink2}!important;font-weight:500!important}.mail td{color:${c.ink}!important}
.none{color:${c.ink2}}
::selection{background:#dce6f3}
</style></head><body><div class="doc">${body}</div></body></html>`;
}
