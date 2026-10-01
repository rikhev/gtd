---
target: keybind cheat sheet
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/Users/rha/Code/gtd/src/components/Chrome.tsx"
target_fingerprint: "sha256:46258d75f0bf2d70320ba94a12eb1ace832d4025615673d2bb929ee73e09f84a"
target_path: /Users/rha/Code/gtd/src/components/Chrome.tsx
timestamp: 2026-10-01T21-17-46Z
slug: src-components-chrome-tsx
---
# Critique: the keyboard cheat sheet (⇧? HelpOverlay, Chrome.tsx:733)
Method: dual-agent. Visual: overlay captured on 10 screens at 1440 and 2 at 390, Mac and Windows. Detector: CLI clean; overlay flags the shared --shadow token on .help (deliberate) and two items behind it.
Score 23/40. Visibility 2, Match 3, Control 2, Consistency 2, Error prevention 2, Recognition 3, Efficiency 2, Minimalist 3, Recovery 2, Help 2.
## Priority issues
- P1 The scope title says "On <view>" for the detail pane, the rail and every review step (Chrome.tsx:768).
- P1 Shown keys don't match what works: Grid Move/Select always listed (Settings, empty lists); pane Del for a file missing (snapshot taken after regions deactivate); third keys cut (slice(0,2)); pickers have no sheet.
- P1 ⌘K is printed in the sheet but dead while it is open (exclusive layer); the sheet can't be filtered.
- P1 ⇧? does nothing in a text field (g.help has no inInput): the review's Mind sweep opens in one, so it types "?".
- P2 Screen readers: kbd glyphs read as symbol names; ~10 region landmarks per opening; Tab escapes the modal.
- P3 Density: 27 Everywhere rows at full weight every time; overflows 55px at 1440×900 with no cue; the review's Review group holds 16.
## Minor
Close details listed twice in the pane; F2 worded four ways; field labels differ list/pane/Clarify; the Mac ⌃ glyph reads as a caret; nothing outside the sheet mentions ⇧?.
