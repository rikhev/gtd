---
target: the rail
total_score: 29
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 0
target_identity: "file:/Users/rha/Code/gtd/src/components/Chrome.tsx"
target_fingerprint: "sha256:dd8251efa139000c2ef07c659245e937f9a0028b165487a038bd688f021e66d9"
target_path: /Users/rha/Code/gtd/src/components/Chrome.tsx
timestamp: 2026-09-30T22-08-26Z
slug: src-components-chrome-tsx
---
⚠️ DEGRADED: single-context (sub-agents not spawned without explicit request; no browser available)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 4 | Check rows read as status (gauge + age + red when due) |
| 2 | Match System / Real World | 3 | Oldest in Inbox doesn't say it starts Clarify |
| 3 | User Control and Freedom | 3 | Esc back; sign out off the stops |
| 4 | Consistency and Standards | 3 | Numbers = places, caps = actions; cursor row skips alert-on-rail |
| 5 | Error Prevention | 3 | Nothing destructive |
| 6 | Recognition Rather Than Recall | 3 | Number is the place; caps still on held modifier |
| 7 | Flexibility and Efficiency | 4 | ⌃1–9, letter jump, real focus cursor |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; gauges earn their place |
| 9 | Error Recovery | n/a | No errors originate here |
| 10 | Help and Documentation | 3 | Caps on hold, spoken labels, ⌘K, ⇧? |
| Total | | 29/36 | Good (81%) |

## Design Specificity
Strongly authored; places above, instruments below. Detector: 0 findings. Computed contrast: all AA except red counts on the cursor row in dark (4.01:1).

## Priority Issues
- [P2] Red counts on the cursor row 4.01:1 in dark. Fix: cursor row uses alert-on-rail like hover/current. /impeccable audit
- [P3] Check rows don't say what they do (Clarify / start review). Fix: tooltips naming the action and key. /impeccable clarify
- [P3] Cursor hides the open list's lift. Fix: keep the open row's 650 name under the cursor. /impeccable polish

## Persona Red Flags
Alex: none in the main path. Sam: dark-mode red on cursor row. Owner: Oldest row lands in Clarify unannounced to the mouse.

## Minor Observations
Trash row's empty meta column; pond 84px on short windows.

## Questions
Keep "check rows do, list rows go" as a rule?
