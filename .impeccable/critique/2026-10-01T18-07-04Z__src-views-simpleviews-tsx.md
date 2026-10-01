---
target: src/views/SimpleViews.tsx
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/rha/Code/gtd/src/views/SimpleViews.tsx"
target_fingerprint: "sha256:5f4efddc6dcdbab833e13173c0eb4365ee91a383aec13ab3dcfe7afb6991411c"
target_path: /Users/rha/Code/gtd/src/views/SimpleViews.tsx
timestamp: 2026-10-01T18-07-04Z
slug: src-views-simpleviews-tsx
---
# Critique: Reference (ReferenceView + RefDetail)
Source review only (no browser). Detector: 0 findings (SimpleViews.tsx, Detail.tsx).
Score 27/40. Visibility 3, Match 4, Control 2, Consistency 2, Error prevention 2, Recognition 3, Efficiency 2, Minimalist 4, Recovery 2, Help 3.
## Priority issues
- P0 File remove is instant, permanent, no undo: Detail.tsx:200 fetch DELETE then mutate.
- P1 Trash "Delete for good" orphans files: TrashView.tsx:129 purge deletes rows only; only the timed purge (server/index.ts:238) unlinks blobs.
- P1 Search can't find what's in a file: SearchSettings.tsx:53 matches title+notes only; no file names, f.preview, or project.
- P2 Retrieval at scale: flat A–Z, no type-ahead.
- P2 Clarify's Reference copies the whole capture (title included) into notes (ClarifyView.tsx:183) vs V strips the title (fileStuff.ts:204).
- P3 Pane's Project picker is its own (no create), not setProject (Detail.tsx:845).
## Minor
File preview only shown for Inbox items (Detail.tsx:208); file links not pane stops; Files count unlabeled for SR; empty state doesn't name N; export drops project/files; phone keeps Created over Updated.
