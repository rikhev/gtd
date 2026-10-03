import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Lock, Minus, Plus, X } from "lucide-react";
import { useStore } from "../store.ts";
import { useUI } from "../ui.tsx";
import { useCommands } from "../keys.ts";
import { useTheme } from "../theme.ts";
import { askUnlock, downloadSealed, openSealedData, useLock, useOpenedFile } from "../lock.ts";
import { csvTable, docPage, textBlock } from "../../shared/viewDoc.ts";
import type { FileRow } from "../../shared/types.ts";
import { PdfView, type PdfControls } from "./PdfView.tsx";

/** A file's kind in a word: "PDF", "Word", "Email"… (its extension, failing that). */
export function fileKind(name: string, mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "Word";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel") return "Excel";
  if (mime.includes("presentationml")) return "PowerPoint";
  if (mime === "message/rfc822" || mime === "application/vnd.ms-outlook") return "Email";
  if (mime === "text/csv" || /\.(csv|tsv)$/i.test(name)) return "Table";
  if (mime.startsWith("text/") || mime === "application/json") return "Text";
  const ext = name.split(".").pop();
  return ext && ext !== name ? ext.toUpperCase() : "File";
}

function size(n: number) {
  const units = ["bytes", "KB", "MB", "GB"];
  let v = n;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return `${u > 0 && v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)} ${units[u]}`;
}

const RASTER = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** What the server can make a page of (as server/view.ts reads it). */
const pageable = (mime: string) => mime.includes("wordprocessingml") || mime === "message/rfc822" || mime === "application/vnd.ms-outlook" || mime.startsWith("text/") || mime === "application/json";
/** What a locked file can be shown as here, decrypted in the browser: it is never sent to the server readable. */
const textLike = (name: string, mime: string) => (mime.startsWith("text/") && mime !== "text/html") || mime === "application/json" || /\.(csv|tsv|txt|md)$/i.test(name);

type Shown =
  | { as: "image"; url: string }
  // A locked PDF comes as its decrypted bytes: the app's security policy lets nothing be fetched from a blob address.
  | { as: "pdf"; url: string; data?: Uint8Array }
  | { as: "page"; src?: string; doc?: string }
  | { as: "none"; why: string }
  | { as: "locked" }
  | { as: "opening" };

/**
 * The document viewer (owner's request: reference documents are read in the app, never only downloaded): it covers the
 * list, as Quick Look covers the Finder, and the details pane stays beside it. PDFs drawn by the app as sheets of paper
 * (their page and zoom in the bar), images as they are, Word, email, CSV and text as a page made on the server; all of it in a sandboxed frame, so nothing in a
 * document can run. ← and → step through the item's files, Esc or Space closes. A locked file is decrypted here; the
 * kinds the server would have to read (Word, email) are only downloaded, so they stay encrypted there.
 */
export function Viewer({ ids, at, active, onStep }: { ids: string[]; at: number; active: boolean; onStep: (at: number) => void }) {
  const ui = useUI();
  const files = useStore((s) => s.files);
  const f = files.find((x) => x.id === ids[at]);
  const { dark } = useTheme();
  const lock = useLock();
  const opened = useOpenedFile(f ?? ({ id: "", preview: "", sealed: 0 } as FileRow));
  const name = f ? (f.sealed ? (opened?.name ?? "Locked file") : f.name) : "";
  const mime = f ? (f.sealed ? (opened?.mime ?? "") : f.mime) : "";
  const [shown, setShown] = useState<Shown>({ as: "opening" });
  const [pdf, setPdf] = useState<PdfControls | null>(null);

  useEffect(() => {
    if (!f) return;
    let url: string | null = null;
    let live = true;
    if (!f.sealed) {
      if (RASTER.includes(f.mime)) setShown({ as: "image", url: `/api/files/${f.id}` });
      else if (f.mime === "application/pdf") setShown({ as: "pdf", url: `/api/files/${f.id}` });
      else if (pageable(f.mime)) setShown({ as: "page", src: `/api/files/${f.id}/view?theme=${dark ? "dark" : "light"}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}` });
      else setShown({ as: "none", why: `${fileKind(f.name, f.mime)} files can't be shown here yet.` });
      return;
    }
    if (!lock.unlocked) return setShown({ as: "locked" });
    setShown({ as: "opening" });
    openSealedData(f).then(
      ({ name: n, mime: m, bytes }) => {
        if (!live) return;
        if (m === "application/pdf") setShown({ as: "pdf", url: `sealed:${f.id}`, data: new Uint8Array(bytes) });
        else if (RASTER.includes(m)) {
          url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: m }));
          setShown({ as: "image", url });
        } else if (textLike(n, m)) {
          const text = new TextDecoder().decode(bytes);
          setShown({ as: "page", doc: docPage(n, /\.(csv|tsv)$/i.test(n) || m === "text/csv" ? csvTable(text) : textBlock(text), dark, /\.(csv|tsv)$/i.test(n)) });
        } else
          setShown({
            as: "none",
            why: `A locked ${fileKind(n, m)} file opens once it is downloaded: showing it here would have the server read it, and it stays encrypted there.`,
          });
      },
      (e) => live && setShown({ as: "none", why: `Couldn't open it: ${(e as Error).message}` }),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [f?.id, f?.sealed, f?.mime, lock.unlocked, dark]);

  const download = () => {
    if (!f) return;
    if (f.sealed) return void downloadSealed(f);
    Object.assign(document.createElement("a"), { href: `/api/files/${f.id}`, download: f.name }).click();
  };
  const step = (d: -1 | 1) => ids.length > 1 && onStep((at + d + ids.length) % ids.length);
  const close = ui.closeViewer;
  // Opened in a tab of its own: only what the browser shows safely there (the server's rule), and never a locked file.
  const canTab = f && !f.sealed && (RASTER.includes(f.mime) || f.mime === "application/pdf" || f.mime === "text/plain");

  useCommands(
    "viewer",
    [
      { id: "viewer.prev", label: "Show the previous file", group: "Viewer", keys: ["arrowleft"], enabled: ids.length > 1, run: () => step(-1) },
      { id: "viewer.next", label: "Show the next file", group: "Viewer", keys: ["arrowright"], enabled: ids.length > 1, run: () => step(1) },
      { id: "viewer.download", label: "Download this file", group: "Viewer", run: download },
      ...(canTab ? [{ id: "viewer.tab", label: "Open in a new tab", group: "Viewer", run: () => window.open(`/api/files/${f!.id}`, "_blank", "noopener") }] : []),
      { id: "viewer.close", label: "Close the viewer", group: "Viewer", keys: ["escape", "space"], run: close },
      // A PDF scrolls and zooms from the keyboard as Preview does; ⌘+ and ⌘− stay the browser's.
      ...(pdf
        ? [
            { id: "viewer.zoomin", label: "Zoom in", group: "Viewer", keys: ["+", "="], run: pdf.zoomIn },
            { id: "viewer.zoomout", label: "Zoom out", group: "Viewer", keys: ["-"], run: pdf.zoomOut },
            { id: "viewer.fit", label: "Fit the page to the width", group: "Viewer", keys: ["0"], run: pdf.fit },
            { id: "viewer.down", label: "Scroll down", group: "Viewer", keys: ["arrowdown"], hidden: true, run: () => pdf.scrollBy(64) },
            { id: "viewer.up", label: "Scroll up", group: "Viewer", keys: ["arrowup"], hidden: true, run: () => pdf.scrollBy(-64) },
            { id: "viewer.pagedown", label: "Scroll down a screen", group: "Viewer", keys: ["pagedown"], run: () => pdf.scrollBy("page") },
            { id: "viewer.pageup", label: "Scroll up a screen", group: "Viewer", keys: ["pageup"], run: () => pdf.scrollBy("-page") },
            { id: "viewer.start", label: "Go to the first page", group: "Viewer", keys: ["home"], run: () => pdf.scrollBy("start") },
            { id: "viewer.end", label: "Go to the last page", group: "Viewer", keys: ["end"], run: () => pdf.scrollBy("end") },
          ]
        : []),
    ],
    { priority: 40, active, title: name || "Viewer" },
  );

  // The file went away (removed, or its item deleted): nothing left to show.
  useEffect(() => {
    if (!f) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);
  if (!f) return null;

  return (
    <section className="viewer" aria-label={`Viewing ${name}`}>
      <header className="viewer-bar">
        <span className="viewer-name" title={name}>
          {f.sealed ? <Lock size={13} strokeWidth={2} aria-label="Locked" /> : null}
          <strong>{name}</strong>
        </span>
        <span className="viewer-meta">
          {mime ? `${fileKind(name, mime)} · ` : ""}
          {size(f.size)}
        </span>
        <span className="viewer-tools">
          {/* A PDF's place and zoom, in the bar's own type: "Page 3 of 12", then − 100% +, the number fitting it back to
              the width. */}
          {shown.as === "pdf" && pdf && (
            <span className="viewer-pdf">
              <span className="viewer-page num" aria-live="polite">
                Page {pdf.page} of {pdf.pages}
              </span>
              <span className="viewer-zoom">
                <button type="button" className="icon-btn" onClick={pdf.zoomOut} aria-label="Zoom out" title="Zoom out (−)">
                  <Minus size={14} strokeWidth={2} />
                </button>
                <button type="button" className={`viewer-percent num ${pdf.fitted ? "is-fitted" : ""}`} onClick={pdf.fit} aria-pressed={pdf.fitted} title="Fit the page to the width (0)">
                  {pdf.percent}%
                </button>
                <button type="button" className="icon-btn" onClick={pdf.zoomIn} aria-label="Zoom in" title="Zoom in (+)">
                  <Plus size={14} strokeWidth={2} />
                </button>
              </span>
            </span>
          )}
          {ids.length > 1 && (
            <span className="viewer-step">
              <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Previous file" title="Previous file (←)">
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <span className="num">
                {at + 1} of {ids.length}
              </span>
              <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next file" title="Next file (→)">
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </span>
          )}
          <button type="button" className="icon-btn" onClick={download} aria-label="Download" title="Download">
            <Download size={15} strokeWidth={2} />
          </button>
          {canTab && (
            <a className="icon-btn" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab">
              <ExternalLink size={15} strokeWidth={2} />
            </a>
          )}
          <button type="button" className="icon-btn" onClick={close} aria-label="Close" title="Close (Esc)">
            <X size={16} strokeWidth={2} />
          </button>
        </span>
      </header>
      <div className={`viewer-stage is-${shown.as}`}>
        {shown.as === "image" ? (
          <img src={shown.url} alt={name} />
        ) : shown.as === "pdf" ? (
          <PdfView
            key={shown.url}
            url={shown.url}
            data={shown.data}
            name={name}
            onControls={setPdf}
            onFail={(why) => setShown({ as: "none", why })}
          />
        ) : shown.as === "page" ? (
          // No permissions at all: no scripts, no forms, no navigation; the page is only read.
          <iframe title={name} sandbox="" src={shown.src} srcDoc={shown.doc} />
        ) : shown.as === "locked" ? (
          <div className="viewer-note">
            <Lock size={28} strokeWidth={1.5} aria-hidden />
            <p>This file is locked.</p>
            <button type="button" className="lock-button" onClick={() => askUnlock(ui)}>
              Unlock
            </button>
          </div>
        ) : shown.as === "none" ? (
          <div className="viewer-note">
            <FileText size={28} strokeWidth={1.5} aria-hidden />
            <p>{shown.why}</p>
            <button type="button" className="lock-button" onClick={download}>
              Download
            </button>
          </div>
        ) : (
          <p className="viewer-opening">Opening…</p>
        )}
      </div>
    </section>
  );
}
