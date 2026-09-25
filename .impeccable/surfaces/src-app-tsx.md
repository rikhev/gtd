---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface brief: GTD app shell (all lists, capture, clarify, review)

Mode: Operate. Keyboard-only owner, desk daytime plus evening review, dense lists.
Job: capture stuff instantly, clarify it with Claude's proposals one item at a time, and work from compact, editable Outlook-Tasks-style lists.
Keyboard: the spec lives in PRODUCT.md and the confirmed shape brief (Outlook-on-the-web grammar, ⌘ where free, ⌃ fallback, ⌘K palette, ⇧? overlay, no printed key hints, no confirm dialogs, ⌘Z undo).

## Direction contract

THESIS: The app is David Allen's paper desk kit turned into a keyboard grid. The Inbox is a wire in-tray, projects and lists are manila folders with label-maker tape, and the tickler holds what returns later. It refuses the category default of an airy sidebar with rounded cards and a blue accent. Density wins over any paper texture.

OWN-WORLD: The ground is cool office white paper and the ink is near-black. Steel grey carries rules and secondary text. Manila tan appears only on folder-tab group headers. Label-maker tape (black tape, white embossed condensed caps) names lists, projects and areas. Label yellow is the single accent, used only for the focused row and the active control. Done is a ruled strike-through; flagged for today is a hand-drawn pen circle; context colours appear only as 2px hairline codes. The dark theme is a graphite desk at night with the same roles.

STORY: The owner sees at a glance what's in the tray and what's next. They capture without deciding, clarify with Claude proposing and themselves deciding, and trust the lists enough to work from them.

FIRST VIEWPORT: A 1440 desktop layout.
- Left: a 208px steel drawer rail of tape-labelled lists with counts. The in-tray at the top shows stacked sheet edges scaled to the inbox count.
- Top: a 44px bar holding the always-available capture line and search.
- Centre: the Next Actions grid, 30px rows grouped under manila folder tabs, with columns for the flag circle, subject, context, project, due, defer, time and energy.
- Right: a 360px detail pane that opens with Enter.
- Bottom: a 26px status line with action feedback and undo.

FORM: #1 of the ordered list, "In-Tray & Tickler" (IMPECCABLE'S PICK), seed key 67b3a180. Code-led. Signature interaction: a pen stroke draws through a row as it is marked done, then the row folds away; the flag circle draws itself around the row marker; a capture drops a sheet into the tray and the count ticks up.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
