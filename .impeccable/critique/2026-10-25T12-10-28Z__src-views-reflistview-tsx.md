---
target: the reference and checklist lists
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/Users/rha/Code/gtd/src/views/RefListView.tsx"
target_fingerprint: "sha256:b510e7662323188a89cdf64329fbd974cead329f6ee80142d4af3cfc4cd99efb"
target_path: /Users/rha/Code/gtd/src/views/RefListView.tsx
timestamp: 2026-10-25T12-10-28Z
slug: src-views-reflistview-tsx
---
# Critique: Reference lists and checklists (RefListView + ChecklistsView)
Method: dual-agent. No browser tool: reviewed from source, no screenshots, no overlay. Detector: 0 findings across RefListView, ChecklistsView, Grid, NotesArea, Detail.
Score 28/40 (Good). Visibility 3, Match 3, Control 3, Consistency 2, Error prevention 2, Recognition 3, Efficiency 3, Minimalist 4, Recovery 3, Help 2.
## Priority issues
- P1 Reference-list rows are keyed by position (refList.ts:23 `l${i}`). After ⌥↑↓ the ticks stay on the old keys, which now name other lines, so a second move or a Delete hits the wrong lines. RefListView.tsx:127 promises "keep their selection under their new keys" and doesn't. Fix: remap the selection after move/remove (nav.setSelected), or give lines stable keys.
- P2 The reference list lags the checklist: no ⌥V menu, no Rename/Trash from inside, "Open its details" has no key, the pane's "Open the list" (Detail.tsx:1512) has no command and isn't a pane stop (checklist has detail.cl.full "Open in Checklists"). Foot copy differs. Fix: mirror the checklist's items and wording.
- P2 Phone + inside a reference list: phoneAdder returns null (phoneAdd.ts:26); the checklist gets a sheet that turns each line into an item. Fix: mirror that branch.
- P2 Removing a habit (Delete, or a swipe left) takes its whole record with it, and the toast says only "“X” removed" (ChecklistsView.tsx:473-484). Fix: name the record in the toast.
- P3 The pane's line editor (Detail.tsx:1474) has no Esc; Esc commits by blur. Long reference lines are readable only by editing them; add a title tooltip.
## Minor
Toasts "Rewritten"/"Reordered" don't name the item; Reference index shows counts inline vs Checklists' Items column; DESIGN.md:377 "No items yet" vs App.tsx:741 ""; duplicated comment App.tsx:733-734; a stepped-back routine day is shown only by the count colour.
Old 2026-10-01 checklist issues: nearly all fixed (undo residue, Repeat-on ticks, sections move with items, T uses project, paste explodes, midnight hint).
