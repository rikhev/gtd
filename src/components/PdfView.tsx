import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

/**
 * A PDF drawn by the app itself (owner's request: the browser's own viewer, its dark toolbar and its fonts, made opening
 * a PDF jarring): its pages are sheets of paper on the viewer's stage, as an image is, and the page count and the zoom
 * sit in the viewer's own bar. PDF.js reads the file in a worker, so a long document never stalls the list; pages are
 * drawn only as they come near the screen, sharp at the screen's pixel density, with their text laid over them to
 * select and copy (and for the browser's find) and their links kept.
 */

let lib: Promise<typeof import("pdfjs-dist")> | null = null;
/** PDF.js and its worker load the first time a PDF is opened, not with the app. */
function pdfjs() {
  return (lib ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  }));
}

/** CSS pixels per PDF point at 100%: a page shown at its printed size, as Preview and Acrobat count it. */
const ACTUAL = 96 / 72;
/** The zoom steps, as shares of the printed size. */
export const STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
/** Fitted to the width, a page is never wider than a comfortable reading measure. */
const FIT_MAX = 920;
const GAP = 16;

export type PdfZoom = "fit" | number;
/** What the viewer's bar shows and does for a PDF. */
export interface PdfControls {
  page: number;
  pages: number;
  percent: number;
  fitted: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  scrollBy: (dy: number | "page" | "-page" | "start" | "end") => void;
}

interface Size {
  w: number;
  h: number;
}

export function PdfView({ url, data, name, onControls, onFail }: { url: string; data?: Uint8Array; name: string; onControls: (c: PdfControls | null) => void; onFail: (why: string) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [zoom, setZoom] = useState<PdfZoom>("fit");
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);

  // Open the document and read every page's size up front, so the whole length is laid out (and the scrollbar honest)
  // before a page is drawn.
  useEffect(() => {
    let live = true;
    let opened: PDFDocumentProxy | null = null;
    setDoc(null);
    setSizes([]);
    setZoom("fit");
    setPage(1);
    pdfjs()
      .then(async (m) => {
        // Bytes are handed to the worker, which takes them over: it gets a copy, so stepping back to this file works.
        // The decoders a scan needs (JBIG2, JPEG 2000, colour profiles) and the CMaps and fonts for text are fetched
        // from /pdfjs/ (see vite.config.ts); without them a scanned page draws only its faint background.
        const assets = { wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/", cMapUrl: "/pdfjs/cmaps/", standardFontDataUrl: "/pdfjs/standard_fonts/" };
        opened = await m.getDocument(data ? { data: data.slice(), ...assets } : { url, ...assets }).promise;
        const all: Size[] = [];
        for (let i = 1; i <= opened.numPages; i++) {
          const vp = (await opened.getPage(i)).getViewport({ scale: 1 });
          all.push({ w: vp.width, h: vp.height });
        }
        if (!live) return void opened.destroy();
        setSizes(all);
        setDoc(opened);
      })
      .catch((e: Error) => {
        if (!live) return;
        onFail(
          e.name === "PasswordException"
            ? "This PDF has a password of its own. Download it to open it with the password."
            : e.name === "InvalidPDFException"
              ? "This file says it is a PDF, but it can't be read as one."
              : `Couldn't open it: ${e.message}`,
        );
      });
    return () => {
      live = false;
      void opened?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // The stage's width decides what "fit" is.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = width < 600 ? 12 : 32;
  const widest = sizes.reduce((m, s) => Math.max(m, s.w), 0) || 612;
  const fitScale = Math.max(0.2, Math.min(width - pad * 2, FIT_MAX) / widest);
  const scale = zoom === "fit" ? fitScale : zoom * ACTUAL;
  const percent = Math.round((scale / ACTUAL) * 100);

  // Zooming keeps the same place in the document under the eye: the share of the length scrolled stays put.
  const keepPlace = (next: PdfZoom) => {
    const el = stage.current;
    const at = el && el.scrollHeight > el.clientHeight ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0;
    setZoom(next);
    requestAnimationFrame(() => {
      if (el && at) el.scrollTop = at * el.scrollHeight - el.clientHeight / 2;
    });
  };
  const share = scale / ACTUAL;
  const zoomIn = () => keepPlace(STEPS.find((s) => s > share + 0.001) ?? STEPS[STEPS.length - 1]);
  const zoomOut = () => keepPlace([...STEPS].reverse().find((s) => s < share - 0.001) ?? STEPS[0]);
  const fit = () => keepPlace("fit");
  const scrollBy = (dy: number | "page" | "-page" | "start" | "end") => {
    const el = stage.current;
    if (!el) return;
    if (dy === "start") return el.scrollTo({ top: 0 });
    if (dy === "end") return el.scrollTo({ top: el.scrollHeight });
    const by = dy === "page" ? el.clientHeight - 48 : dy === "-page" ? -(el.clientHeight - 48) : dy;
    el.scrollBy({ top: by });
  };

  // The viewer's bar reads these; they change with the page under the eye and the zoom.
  useEffect(() => {
    onControls(doc ? { page, pages: doc.numPages, percent, fitted: zoom === "fit", zoomIn, zoomOut, fit, scrollBy } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, percent, zoom]);
  useEffect(() => () => onControls(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A trackpad pinch (or ⌃ with the wheel) zooms the document, not the whole app.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let acc = 0;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 24) return;
      if (acc < 0) zoomIn();
      else zoomOut();
      acc = 0;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  // The page under the eye: the last one whose top has passed a third of the way down the stage.
  const onScroll = () => {
    const el = stage.current;
    if (!el) return;
    const line = el.scrollTop + el.clientHeight / 3;
    const pages = el.querySelectorAll<HTMLElement>(".pdf-page");
    let n = 1;
    for (let i = 0; i < pages.length; i++) if (pages[i].offsetTop <= line) n = i + 1;
    setPage(n);
  };

  const jumpTo = (index: number) => {
    const el = stage.current?.querySelectorAll<HTMLElement>(".pdf-page")[index];
    el?.scrollIntoView({ block: "start" });
  };

  return (
    <div ref={stage} className="pdf-stage" onScroll={onScroll} tabIndex={-1} aria-label={name}>
      {doc ? (
        <div className="pdf-pages" style={{ padding: `${pad}px ${pad}px ${pad + 24}px`, gap: GAP }}>
          {sizes.map((s, i) => (
            <PdfPage key={i} doc={doc} index={i} size={s} scale={scale} root={stage} onJump={jumpTo} />
          ))}
        </div>
      ) : (
        <p className="viewer-opening">Opening…</p>
      )}
    </div>
  );
}

/** One page: a sheet the size it will be, drawn when it comes within a screen of view and drawn again after a zoom. */
function PdfPage({ doc, index, size, scale, root, onJump }: { doc: PDFDocumentProxy; index: number; size: Size; scale: number; root: React.RefObject<HTMLDivElement | null>; onJump: (index: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [links, setLinks] = useState<{ rect: number[]; url?: string; dest?: unknown }[]>([]);
  const drawn = useRef(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: root.current, rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near || drawn.current === scale) return;
    let task: RenderTask | null = null;
    let live = true;
    let pg: PDFPageProxy | null = null;
    (async () => {
      const m = await pdfjs();
      pg = await doc.getPage(index + 1);
      if (!live) return;
      const vp = pg.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      // Drawn off screen and swapped in whole, so a zoom never shows a blank sheet: the old picture stays, stretched,
      // until the sharp one is ready.
      const off = document.createElement("canvas");
      off.width = Math.floor(vp.width * dpr);
      off.height = Math.floor(vp.height * dpr);
      task = pg.render({ canvas: off, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await task.promise;
      if (!live || !canvas.current) return;
      const c = canvas.current;
      c.width = off.width;
      c.height = off.height;
      c.getContext("2d")?.drawImage(off, 0, 0);
      drawn.current = scale;
      // The words, laid invisibly over the picture, to select, copy and find.
      if (text.current) {
        text.current.replaceChildren();
        const layer = new m.TextLayer({ textContentSource: pg.streamTextContent(), container: text.current, viewport: vp });
        await layer.render();
      }
      const notes = await pg.getAnnotations();
      if (!live) return;
      setLinks(
        notes
          // Only a web or mail address leaves the app; anything else a document calls a link (scripts, files) is dropped.
          .filter((a) => a.subtype === "Link" && ((a.url && /^(https?:|mailto:)/i.test(a.url)) || (!a.url && a.dest)))
          .map((a) => ({ rect: pg!.getViewport({ scale: 1 }).convertToViewportRectangle(a.rect), url: a.url, dest: a.dest })),
      );
    })().catch((e: Error) => {
      if (e?.name !== "RenderingCancelledException") console.warn("PDF page", index + 1, e);
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [near, scale, doc, index]);

  const follow = async (dest: unknown) => {
    const d = typeof dest === "string" ? await doc.getDestination(dest) : (dest as unknown[]);
    if (!Array.isArray(d) || !d[0]) return;
    onJump(typeof d[0] === "number" ? d[0] : await doc.getPageIndex(d[0] as Parameters<PDFDocumentProxy["getPageIndex"]>[0]));
  };

  return (
    <div
      ref={box}
      className="pdf-page"
      style={{ width: size.w * scale, height: size.h * scale, ["--total-scale-factor" as string]: scale, ["--scale-round-x" as string]: "1px", ["--scale-round-y" as string]: "1px" }}
      role="group"
      aria-label={`Page ${index + 1}`}
    >
      <canvas ref={canvas} aria-hidden="true" />
      <div ref={text} className="textLayer" />
      {links.map((l, i) => {
        const [x1, y1, x2, y2] = l.rect;
        const style = { left: Math.min(x1, x2) * scale, top: Math.min(y1, y2) * scale, width: Math.abs(x2 - x1) * scale, height: Math.abs(y2 - y1) * scale };
        return l.url ? (
          <a key={i} className="pdf-link" href={l.url} target="_blank" rel="noopener noreferrer" style={style} title={l.url} />
        ) : (
          <button key={i} type="button" className="pdf-link" style={style} aria-label="Go to the linked place" onClick={() => void follow(l.dest)} />
        );
      })}
    </div>
  );
}
