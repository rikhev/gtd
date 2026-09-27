---
target: the rail
total_score: 22
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 2
target_identity: "file:/Users/rha/Code/gtd/src/components/Chrome.tsx"
target_fingerprint: "sha256:875a5f47968bb69a55f5e0e909b10b47470602b8f9e3abbc7ef2f91014a1198e"
target_path: /Users/rha/Code/gtd/src/components/Chrome.tsx
timestamp: 2026-09-27T07-52-18Z
slug: src-components-chrome-tsx
---
Method: dual-agent (A: design review · B: detector + browser). Scope: the left rail. Owner: nothing off limits.

## Design Health Score: 22/36 (Acceptable; heuristic 9 n/a)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Tray stops changing past 20; unreviewed never escalates |
| 2 | Match system / real world | 2 | In-tray vs Inbox; "Organize"/"Reflect" mislabel their contents |
| 3 | User control and freedom | 3 | Esc leaves the rail cleanly |
| 4 | Consistency and standards | 2 | No composite role, no Home/End, Settings has no ⌃⇧ key, phone strip doesn't follow the open list |
| 5 | Error prevention | 2 | Tab-focused rail button is a decoy: keys drive the hidden list |
| 6 | Recognition rather than recall | 3 | Clear labels; keys never shown |
| 7 | Flexibility and efficiency | 3 | No Home/End, letter jump or Clarify entry |
| 8 | Aesthetic and minimalist design | 2 | Inventory counts, 134px tray, two headings, ~380px empty gap |
| 9 | Error recovery | n/a | |
| 10 | Help and documentation | 2 | No key hint when the rail is active |

## Priority issues
- [P1] Tab-focused rail button doesn't activate the rail region; arrows/Enter drive the list (Chrome.tsx:56-73, 91, 113).
- [P1] Structure: headings mislabel; 380px dead space; propose status panel with review/stalled/follow-ups/inbox age (Chrome.tsx:22-26, styles.css:361).
- [P2] Counts are totals, not signals (Chrome.tsx:33-45).
- [P2] Tray decorative past 20 and blind to age (bits.tsx:146, 195-240); no Clarify entry.
- [P2] Open item barely distinct (1.22:1 light, 1.13:1 dark, dark inverts metaphor); dark tape 1.46:1 on steel; hover stamp 4.06:1.
- [P2] Phone strip: open item not scrolled into view, no scroll affordance, 30px targets.
- [P3] One name for In-tray/Inbox; Settings key; 2px misalignments.

## Detector
CLI: 0 rail findings. Browser: 0 rail findings in 9 views. Contrast: no text failures at rest (lowest 4.71:1 stalled stamp light); hover not measured by B, A measured 4.06:1. Phone strip scrollWidth 1188 in 390.
