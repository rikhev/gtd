---
target: the calendar
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/rha/Code/gtd/src/views/CalendarView.tsx"
target_fingerprint: "sha256:eb3e77f45609eb5143a58b3bdddf3dfa22dccec1e724da4d88d0b16642a382c0"
target_path: /Users/rha/Code/gtd/src/views/CalendarView.tsx
timestamp: 2026-10-01T15-50-48Z
slug: src-views-calendarview-tsx
closed: true
---
Method: dual-agent (A: design review · B: detector). No browser (source review).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Overdue invisible on Week/Month |
| 2 | Real world | 3 | "Soft dates" unexplained jargon |
| 3 | Control/freedom | 3 | W makes an item that vanishes |
| 4 | Consistency | 2 | Day-tab rows behave three ways; day-specific looks like a deadline |
| 5 | Error prevention | 3 | Appointments protected, drags undoable |
| 6 | Recognition | 2 | Layer off-state is struck-through text |
| 7 | Flexibility | 3 | Day tab's next actions unreachable by keyboard |
| 8 | Minimalist | 2 | Toolbar 9+N ungrouped controls, two auto margins |
| 9 | Error recovery | 3 | Failed sync keeps last copy |
| 10 | Help/docs | 2 | DESIGN.md Calendar section stale |
| Total | | 26/40 | Good |

Detector: 0 findings.

## Priority issues
- [P1] Day tab half keyboard: Next actions / Follow-ups rows not in cursorItems, no focus, click leaves the Calendar (CalendarView.tsx ~256, 800–845).
- [P1] Overdue only on Day tab today; invisible on Week/Month. Fix: "N overdue" stub on today's cell.
- [P1] W creates a follow-up that vanishes (follow-ups soft, layer off); with soft on, overdue follow-ups double in Day tab ("Due …" + Follow-ups due). Fix: follow-up = hard landscape; exclude from overdueBefore.
- [P2] Day-specific action drawn like a deadline (role "due", ink + diamond). Fix: is-dayspecific style, no diamond.
- [P2] Toolbar ungrouped; Soft dates struck through by default; ring drawn twice.
- [P3] Phone breakpoint 640px vs 820px brief; DESIGN.md Calendar stale.

## Questions
- Should the Day tab carry next actions at all, or link to them?
- If follow-ups are hard landscape, does Soft dates still earn a toolbar control?
