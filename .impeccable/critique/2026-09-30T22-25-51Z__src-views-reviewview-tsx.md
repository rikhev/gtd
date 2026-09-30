---
target: the weekly review
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/Users/rha/Code/gtd/src/views/ReviewView.tsx"
target_fingerprint: "sha256:3f8aa83102eda4ce3fb6d68347ddfefc91a94a23e39c7a5f1911d3c2694004ce"
target_path: /Users/rha/Code/gtd/src/views/ReviewView.tsx
timestamp: 2026-09-30T22-25-51Z
slug: src-views-reviewview-tsx
closed: true
---
⚠️ DEGRADED: single-context (sub-agents not spawned without explicit request; no browser available)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Open counts per step; Finish tally counts by time |
| 2 | Match System / Real World | 4 | GTD's own sequence and words |
| 3 | User Control and Freedom | 4 | Resumable, step keys, start over, undo |
| 4 | Consistency and Standards | 3 | D "Due date" sets follow-up on Waiting For; V File/Move |
| 5 | Error Prevention | 3 | Stale flags can't be cleared honestly |
| 6 | Recognition Rather Than Recall | 3 | Key line per step; no in-place rename |
| 7 | Flexibility and Efficiency | 4 | Every step is a working list |
| 8 | Aesthetic and Minimalist Design | 3 | Ten steps in one strip |
| 9 | Error Recovery | 3 | Undo toasts name the item |
| 10 | Help and Documentation | 3 | One-line note per step |
| Total | | 33/40 | Good (82%) |

## Design Specificity
Authored: GTD's full sequence incl. mind sweep and look back; honest completion rule. Detector: 0 findings.

## Priority Issues
- [P1] Stale flags ("untouched for 3+ weeks") only clear by editing; no "still current" action. Fix: per-row R "reviewed, still current" that touches the item. /impeccable harden
- [P2] Finish tally counts by time since the review began. Fix: count what the review did. /impeccable harden
- [P2] Get creative can't start a project for an area with none. Fix: N on an area row starts a project in it. /impeccable shape
- [P2] D labelled "Due date" sets follow-up on Waiting For; V is File/Move. Fix: per-step labels. /impeccable clarify

## Persona Red Flags
Alex: no in-place rename for "rewrite anything vague"; D mislabelled. Sam: sweep captures not announced. Owner: stale trap, inflated tally, no project from Get creative.

## Minor Observations
Ten-step strip could group as clear/current/creative; sweep button copy changes nicely; Upcoming "What" column mixes vocabularies.

## Questions
Should ⌘↵ Reviewed also mean "flagged items are still current"? What would a 20-minute review drop?
