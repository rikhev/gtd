---
target: the rail
total_score: 27
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 2
target_identity: "file:/Users/rha/Code/gtd/src/components/Chrome.tsx"
target_fingerprint: "sha256:a738964fa650faa9cba49877c426b18e5f45fc3e144eb56519ade4bd4f027c62"
target_path: /Users/rha/Code/gtd/src/components/Chrome.tsx
timestamp: 2026-10-01T17-59-34Z
slug: src-components-chrome-tsx
---
Method: dual-agent (A: design review · B: detector). No browser (source review).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 4 | Strong on desktop; phone drops overdue/chase/stalled |
| 2 | Real world | 3 | "N today" means owe (Calendar) and did (Done) |
| 3 | Control | 3 | More sheet: no Esc, no focus move |
| 4 | Consistency | 2 | Trash ⌃⇧6 below the check rows; phone Oldest opens Inbox; spec stale |
| 5 | Error prevention | 3 | Short window: cursor focuses off-screen rows |
| 6 | Recognition | 3 | ⌃⇧5/6 counted across a gap |
| 7 | Flexibility | 3 | ⌃⇧4–6 hard reach |
| 8 | Minimalism | 3 | 17 rows; second run longest yet |
| 9 | Error recovery | n/a | No errors originate here |
| 10 | Help | 3 | List rows have no hint beyond held caps |
| Total | | 27/36 | Good |

Detector: 0 findings.

## Priority issues
- [P1] Second group mixes support, horizons and a log; Done (daily) on ⌃⇧5, Trash ⌃⇧6 stranded below the check rows. Fix: Done to the foot beside Trash (keys unchanged, order matches); or drop Horizons' key.
- [P1] Short window (~620–640px): focus uses preventScroll (Chrome.tsx:165), so arrowing to Trash/Settings focuses an unseen row. Fix: scrollIntoView nearest; tighten gaps under 680px.
- [P2] "N today" on Calendar (owe) vs Done (did). Fix: Calendar "N due".
- [P2] Phone out of step: More order buries Calendar; Next/Waiting lose signals; Oldest goes to Inbox not Clarify (Chrome.tsx:402); More has no Esc/focus; duplicated signal logic. Fix: shared useRailSignals.
- [P3] DESIGN.md rail spec stale (lists, keys, phone).
- Minor: live region announces every Inbox decrement; nav label "Lists".
