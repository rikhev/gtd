---
target: inbox tray glyph
total_score: 17
max_score: 24
na_heuristics: 3,5,9,10
p0_count: 0
p1_count: 1
target_identity: "file:/Users/rha/Code/gtd/src/components/bits.tsx"
target_fingerprint: "sha256:2fed8d3afd073c2875547f5a8f8c38b5c71943c6f4023f31072d835fa6246f56"
target_path: /Users/rha/Code/gtd/src/components/bits.tsx
timestamp: 2026-09-27T08-09-11Z
slug: src-components-bits-tsx
---
Method: dual-agent (A: design review · B: detector + browser). Scope: the Inbox row's tray glyph. Question: is it necessary?

## Score: 17/24 (H3, H5, H9, H10 n/a)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Glyph adds nothing past empty/not-empty; drop barely noticeable |
| 2 | Match system / real world | 4 | Strong in-tray metaphor |
| 4 | Consistency and standards | 2 | Tape truncates at 10+; dark paper darker than empty tray floor |
| 6 | Recognition rather than recall | 3 | Count and tape carry it |
| 7 | Flexibility and efficiency | 3 | Proper rail stop |
| 8 | Aesthetic and minimalist design | 2 | Second encoding of one number, 43% of the row |

## Findings
- Rise per item 0.8px at 1x; 1→4 indistinguishable; plateau at 11 items; 12 = 20 = 27.
- Pixel change 1→2 ≈ 6.6% (meaningful); paper vs floor contrast 1.41:1 light / 1.52:1 dark (fails 3:1).
- Tape truncates ("IN-T…") at two-digit counts.
- Drop replays on every load; reduced motion respected.
- Alternatives: A no glyph; B tape-as-tray with flat sheet edges (recommended); C repaired glyph with 3 states; D move the paper-arrives moment to the capture bar.
