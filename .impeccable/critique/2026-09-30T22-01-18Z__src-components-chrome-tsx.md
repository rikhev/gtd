---
target: the rail
total_score: 26
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 0
target_identity: "file:/Users/rha/Code/gtd/src/components/Chrome.tsx"
target_fingerprint: "sha256:4d04a4859c5257a9fda46c9a7e1134e36c479ea717a8112eaafdd1765099264c"
target_path: /Users/rha/Code/gtd/src/components/Chrome.tsx
timestamp: 2026-09-30T22-01-18Z
slug: src-components-chrome-tsx
---
⚠️ DEGRADED: single-context (sub-agents not spawned without explicit request; no browser available)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Signals only where needed; health rows don't look like status |
| 2 | Match System / Real World | 3 | GTD-fluent; "Oldest in Inbox" reads as a place |
| 3 | User Control and Freedom | 3 | Esc back; sign out off the stops |
| 4 | Consistency and Standards | 2 | Go-to numbers skip Agendas; Oldest row's K cap ≠ its action |
| 5 | Error Prevention | 3 | Nothing destructive |
| 6 | Recognition Rather Than Recall | 2 | Caps only on held modifier; off-by-one numbering |
| 7 | Flexibility and Efficiency | 4 | ⌃1–9, letter jump, real focus cursor |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; health rows identical to places |
| 9 | Error Recovery | n/a | No errors originate here |
| 10 | Help and Documentation | 3 | Caps on hold, spoken labels with counts, ⌘K, ⇧? |
| Total | | 26/36 | Good (72%) |

## Design Specificity
Strongly authored: the pond ("mind like water"), signals-not-inventory counts, a GTD system check. Detector: 0 findings (Chrome.tsx, Pond.tsx). Computed contrast: all AA except quiet counts on hovered rows in light (4.39:1).

## Priority Issues
- [P2] Go-to numbers don't follow rail order (Agendas unnumbered at 5th, so ⌃5 = Projects). Fix: move Agendas below Projects. /impeccable layout
- [P2] "Oldest in Inbox" shows K (Clarify) but opens the Inbox. Fix: the row starts Clarify. /impeccable clarify
- [P2] System check rows look like places. Fix: a leading status light per health row. /impeccable polish
- [P3] Quiet counts 4.39:1 on hover (light). Fix: ink-2 on hover. /impeccable audit

## Persona Red Flags
Alex: ⌃5 lands on Projects; ⇧R outside ⌃ series; Oldest row Enter ≠ K.
Sam: Oldest row announces K, activation opens Inbox.
Owner at 8am: glance works; review "6d ago" gives no early warning.

## Minor Observations
Stale contradicting key-cap comment in styles.css; blue cursor hides the open row's lift; pond 84px on short windows; Trash ⌃9 vs Review ⇧R caps.

## Questions
One line of lights for the system check? Early amber review warning? Agendas beside Waiting For or Projects?
