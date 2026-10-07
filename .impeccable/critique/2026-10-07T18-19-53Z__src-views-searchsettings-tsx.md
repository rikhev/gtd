---
target: the Settings page
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/rha/Code/gtd/src/views/SearchSettings.tsx"
target_fingerprint: "sha256:6395c2e7f52f6c29415f3918b5e8c3ffe0f022ce1d3c9991d56b51a4aa865f1d"
target_path: /Users/rha/Code/gtd/src/views/SearchSettings.tsx
timestamp: 2026-10-07T18-19-53Z
slug: src-views-searchsettings-tsx
---
Method: dual-agent (A design review, B detector + browser). Detector: 0 findings in SearchSettings/Grid/bits/Picker; styles.css 1 advisory (.phone-badge radius, not Settings). Overlay: cramped-padding on footer key caps only (false positive). Phone: Settings redirects to Inbox by design.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Lock row never says locked/unlocked; blocked Reminders reads "Off"; broken feed "Can't read" |
| 2 | Match system / real world | 3 | Labels drift: "Hours in the week" vs "The day starts at"; "Reminders" vs "Appointment reminders" |
| 3 | User control and freedom | 3 | Lock password can be changed but not removed |
| 4 | Consistency and standards | 2 | Enter does nothing on Area/Context rows; only Areas reorder; action rows wear a value chevron |
| 5 | Error prevention | 3 | Live validation; deleting a context strips it everywhere (undoable) |
| 6 | Recognition rather than recall | 2 | Data tab: import and export rows look alike |
| 7 | Flexibility and efficiency | 3 | Tab keys good; Hours needs two pickers |
| 8 | Aesthetic and minimalist | 2 | Reasons run ~1500px; values far from names |
| 9 | Error recovery | 2 | Feed error truncated; value says only "Can't read" |
| 10 | Help and documentation | 3 | Help in place, but clipped at 1440 with no way to read it |
| **Total** | | **25/40** | **Acceptable** |

Priority issues:
- [P0] "Hide scheduled starting after" unreachable: group key "projects" missing from TAB_OF (SearchSettings.tsx:189-199). Fix: add to General beside Idle after. harden.
- [P1] Empty Areas/Contexts render nothing (empty={null}, :843; Areas hint in group meta never drawn). Fix: per-tab empty state. onboard.
- [P1] Data tab has no structure: import/export/lock in one unlabelled list. Fix: verb-first names (Import…, Export…), or lock apart. clarify.
- [P2] Reasons span the full width (up to 216 chars on one line), values ~1500px from names at 1920; three truncated at 1440 with no tooltip. Fix: reading measure for the settings grid, reason max ~60ch wrapping, shorten copy. layout + distill.
- [P3] Actions and states dressed as values: "Add…/Choose…/Change link" with dropdown chevrons; blocked Reminders "Off"; lock state hidden; Tab focus shows a second ring on the row above. polish.

Minor: tabs lack roving tabindex/arrow keys/tabpanel; Contexts can't reorder; docs say "1–5" tabs and old Settings paths; dead CSS (.settings-facts, phone settings rules); Week starts on picker has a filter box over two options.
