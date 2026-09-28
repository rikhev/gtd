import { useEffect, useRef, useState } from "react";
import { getState, plural, upload } from "../store.ts";
import { stuffTitle } from "../views/InboxView.tsx";
import type { Target } from "../ui.tsx";
import type { ID } from "../../shared/types.ts";

type Attach = { kind: "action" | "project" | "stuff" | "ref"; id: ID };
type Box = { left: number; top: number; width: number; height: number };

/** What an open detail pane would take the files onto, if anything. */
function attachable(t: Target | null): Attach | null {
  return t && (t.kind === "action" || t.kind === "project" || t.kind === "stuff" || t.kind === "ref") ? { kind: t.kind, id: t.id } : null;
}
function titleOf(a: Attach): string {
  const s = getState();
  if (a.kind === "action") return s.actions.find((x) => x.id === a.id)?.title || "Untitled action";
  if (a.kind === "project") return s.projects.find((x) => x.id === a.id)?.title || "Untitled project";
  if (a.kind === "ref") return s.refs.find((x) => x.id === a.id)?.title || "Untitled";
  const st = s.stuff.find((x) => x.id === a.id);
  return (st && stuffTitle(st)) || "Untitled";
}
const rectOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/**
 * Files dragged in from the desktop: the main column becomes a still surface to drop onto (each file lands in the
 * Inbox, and the pond answers with a drop), and an open detail pane becomes a second target that attaches the
 * files to its item. The overlay never takes the pointer; the hovered target is read from what is under it.
 */
export function DropZone({ detail }: { detail: Target | null }) {
  const [drag, setDrag] = useState<{ count: number; over: "inbox" | "detail"; main: Box; pane: Box | null } | null>(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  useEffect(() => {
    let hide = 0;
    const isFiles = (e: DragEvent) => Boolean(e.dataTransfer && [...e.dataTransfer.types].includes("Files"));
    const onOver = (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      const attach = attachable(detailRef.current);
      const paneEl = attach ? document.querySelector(".detail") : null;
      const onPane = Boolean(paneEl && (e.target as Element | null)?.closest?.(".detail"));
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      const mainEl = document.querySelector(".main");
      const main = rectOf(mainEl);
      const pane = rectOf(paneEl);
      // The Inbox target is the main column beside the pane, not under it.
      const inboxBox = main && pane ? { ...main, width: pane.left - main.left } : main;
      const count = e.dataTransfer ? [...e.dataTransfer.items].filter((i) => i.kind === "file").length : 0;
      if (inboxBox) setDrag({ count, over: onPane ? "detail" : "inbox", main: inboxBox, pane });
      // dragover repeats while the files are over the window; when it stops, they have left.
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setDrag(null), 160);
    };
    const onDrop = (e: DragEvent) => {
      window.clearTimeout(hide);
      setDrag(null);
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      const attach = attachable(detailRef.current);
      const onPane = Boolean(attach && (e.target as Element | null)?.closest?.(".detail"));
      void upload(e.dataTransfer.files, onPane && attach ? { kind: attach.kind, id: attach.id } : undefined);
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.clearTimeout(hide);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  if (!drag) return null;
  const attach = attachable(detail);
  const files = drag.count ? plural(drag.count, "file") : "Files";
  const style = (b: Box) => ({ left: b.left, top: b.top, width: b.width, height: b.height });
  return (
    <div className="dropzone">
      <div className={`dz-target dz-inbox ${drag.over === "inbox" ? "is-hot" : ""}`} style={style(drag.main)}>
        <svg className="dz-water" viewBox="0 0 240 124" aria-hidden="true">
          <path className="dz-drop" d="M120 8c7 14 20 26 20 40a20 20 0 0 1-40 0c0-14 13-26 20-40Z" />
          <g className="dz-rings">
            <ellipse cx="120" cy="96" rx="26" ry="8" />
            <ellipse cx="120" cy="96" rx="26" ry="8" />
            <ellipse cx="120" cy="96" rx="26" ry="8" />
          </g>
        </svg>
        <p className="dz-title">Drop into the Inbox</p>
        <p className="dz-note">
          {files} · each becomes an item to clarify
          <br />
          PDF, Word, text, email and images
        </p>
      </div>
      {attach && drag.pane && (
        <div className={`dz-target dz-detail ${drag.over === "detail" ? "is-hot" : ""}`} style={style(drag.pane)}>
          <p className="dz-title">Attach to</p>
          <p className="dz-item">{titleOf(attach)}</p>
          <p className="dz-note">{files}</p>
        </div>
      )}
      <p className="visually-hidden" role="status">
        {drag.over === "detail" && attach ? `Drop to attach ${files.toLowerCase()} to ${titleOf(attach)}` : `Drop to add ${files.toLowerCase()} to the Inbox`}
      </p>
    </div>
  );
}
