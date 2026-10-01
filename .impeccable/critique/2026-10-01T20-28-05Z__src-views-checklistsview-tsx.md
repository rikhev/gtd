---
target: the checklist
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/rha/Code/gtd/src/views/ChecklistsView.tsx"
target_fingerprint: "sha256:ca5cf9afb8a4540d3c07574174de043678eb2c042ab07655614530551760f685"
target_path: /Users/rha/Code/gtd/src/views/ChecklistsView.tsx
timestamp: 2026-10-01T20-28-05Z
slug: src-views-checklistsview-tsx
---
# Critique: Checklists (ChecklistsView + checklists.ts)
Method: dual-agent. Visuals: only the empty index (the demo data has no checklists); the item level was reviewed from source. Detector: 0 findings (ChecklistsView.tsx, Grid.tsx, ReviewView.tsx). No browser overlay (no automatable browser).
Score 29/40. Visibility 3, Match 3, Control 3, Consistency 3, Error prevention 2, Recognition 2, Efficiency 3, Minimalist 4, Recovery 3, Help 3.
## Priority issues
- P1 Undo stack polluted by silent steps: add() pushes "New item" (ChecklistsView.tsx:335), naming pushes "Added" (495), and a blank row pushes "Discarded" (354, 494). After typing a list and pressing Esc, ⌘Z brings back a phantom blank row, then blanks the last real item.
- P1 Turning Repeat on turns every old tick into a record for today (checklists.ts:151-153); the comment says only today's ticks.
- P2 In Clarify, retitling a capture filed as a checklist drops its first line (ClarifyView.tsx:178); Reference keeps the whole capture (183).
- P2 The review's routine line (ReviewView.tsx:198-205) counts days with all habits done and includes today, so one neglected habit hides and a perfect week reads 6 of 7.
- P3 Sections are rows: ⌥↑↓ on a heading leaves its items behind; there's no count per section.
## Minor
T ignores the checklist's project (actionCommands.tsx:153); a pasted multi-line list becomes one item; the Repeat hint says "each morning" (565), but the day turns at midnight; the export's since is in UTC; an E-tick lands 220ms late, so a quick ⌘Z undoes the step before it; filing several items as checklists gives them the same sort; the inline edit is labelled "Subject"; the search hit doesn't land on the matched item; the heading's "0 checklists" repeats the empty state.
