---
target: the rail
total_score: 31
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 0
target_identity: "file:/Users/rha/Code/gtd/src/components/Chrome.tsx"
target_fingerprint: "sha256:8936952b2730c79c312e742a957b9d84bcfc50adda2c088b6d377557904e3ff6"
target_path: /Users/rha/Code/gtd/src/components/Chrome.tsx
timestamp: 2026-09-30T22-11-05Z
slug: src-components-chrome-tsx
---
⚠️ DEGRADED: single-context (sub-agents not spawned without explicit request; no browser available)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 4 | Signals only where needed; gauges answer "is my system current?" |
| 2 | Match System / Real World | 4 | GTD's words; check rows name what they start |
| 3 | User Control and Freedom | 3 | Esc back; sign out off the stops |
| 4 | Consistency and Standards | 4 | Number = place, cap = action, one red rule on hover/current/cursor |
| 5 | Error Prevention | 3 | Nothing destructive |
| 6 | Recognition Rather Than Recall | 3 | Caps on held modifier (owner's decision) |
| 7 | Flexibility and Efficiency | 4 | ⌃1–9, letter jump, real focus cursor |
| 8 | Aesthetic and Minimalist Design | 3 | Trash row's empty meta column |
| 9 | Error Recovery | n/a | No errors originate here |
| 10 | Help and Documentation | 3 | Caps on hold, check-row tooltips, spoken labels, ⌘K, ⇧? |
| Total | | 31/36 | Good (86%) |

## Design Specificity
Strongly authored and coherent: places above, instruments below. Detector: 0 findings. All text AA in both themes.

## Priority Issues
- [P3] Short windows: foot rows (Trash, Settings) scroll away. Fix: pond collapses to its horizon under ~680px; rows 28px below that. /impeccable adapt
- [P3] Trash row's empty meta column. Fix: quiet count of items in the Trash, or leave it. /impeccable polish

## Persona Red Flags
Alex: none. Sam: none. Owner: foot rows scroll away on a short window.

## Minor Observations
Check-row tooltips are hover-only (spoken labels cover keyboard); "2 today" on Calendar and Done mean different things.

## Questions
Let the pond shrink when space is tight?
