---
target: the Reference page (as OneNote/Obsidian replacement)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/Users/rha/Code/gtd/src/views/SimpleViews.tsx"
target_fingerprint: "sha256:f1cf7f11079c17f95b9a1758caa0f058d927b8066d86671750a27551e8d4ce82"
target_path: /Users/rha/Code/gtd/src/views/SimpleViews.tsx
timestamp: 2026-10-07T10-56-18Z
slug: src-views-simpleviews-tsx
---
Method: dual-agent. Brief: owner's new direction (7 Oct) — Reference becomes the one place for all note taking, replacing OneNote and Obsidian; prior Reference decisions set aside. Visuals: scratch instance with 184 seeded notes (index, Find, long note in pane, open list, search, phone list). Detector: 0 findings on 8 TSX files. Browser overlay: not run (Firefox would not start in sandbox; no Chromium for detect).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Saves only on blur; no saved/unsaved signal |
| 2 | Match system / real world | 2 | "Reference", "Title the reference"; headings and [ ] show as raw syntax |
| 3 | User control and freedom | 2 | Editor undo separate from app ⌘Z; can't widen or focus a note |
| 4 | Consistency and standards | 2 | Consistent inside the app; Markdown expectations broken outside |
| 5 | Error prevention | 1 | Unsaved text lost on reload; pasted images silently dropped |
| 6 | Recognition rather than recall | 2 | Find is title-only; search has no snippets; no recents or backlinks |
| 7 | Flexibility and efficiency | 2 | Great list keys; ~5 keystrokes to first body character; no daily note |
| 8 | Aesthetic and minimalist | 3 | Calm and dense, but prose gets a 347px capped well |
| 9 | Error recovery | 2 | Trash covers deletion; nothing covers lost text |
| 10 | Help and documentation | 2 | Supported Markdown documented only in DESIGN.md |
| **Total** | | **20/40** | **Acceptable (as a notebook)** |

Priority issues:
- [P0] No writing surface: notes live in the 380px details pane (347px text, 13.5px, max-height min(60vh,640px) with nested scroll). Fix: Enter opens a note full-width at #reference/<id> like lists; 680-720px measure, 15-16px/1.6, no height cap, title as heading, meta line. layout, typeset.
- [P0] Writing can be lost: commit on blur only (Detail.tsx:58-78), no pagehide/beforeunload flush, failed save reloads lists, idle relock unmounts locked editor, paste keeps text/plain only (NotesArea.tsx:265). Fix: debounced autosave + flush on pagehide/visibilitychange, "Saved hh:mm", keep draft on failure, flush before relock, pasted/dropped image becomes an attached file shown inline. harden.
- [P1] Retrieval/organisation won't scale past a few hundred: flat A-Z (no numeric collation), Find title-only, search no snippet/ranking, no note-to-note links. Fix: [[links]] with autocomplete and "Linked from"; quick switcher over title+body with excerpt; search snippets + date; optional group by project. shape, clarify.
- [P1] Markdown half-rendered: only bold and lists drawn; #, [ ], links, code, quotes literal. Fix: extend draw-as-typed to headings, boxes, autolinks, code, quotes; per-line patching instead of full innerHTML redraw. typeset, polish.
- [P2] Capture into a note slow, no daily notes, no import. Fix: N opens the new note's page; Today's note (ISO title); Markdown folder import, one-.md-per-note export. distill, onboard.

Minor: empty state prints "(⌘K › New list)"; list preview shows raw "# …"; action placeholder "Details, links, phone numbers…" on notes; "Lock with password" link on every note; rows={4} first impression; locked notes not body-searchable without saying so.
