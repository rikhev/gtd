---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface brief: GTD app shell (all lists, capture, clarify, review)

Mode: Operate. One owner, keyboard first, at a desk by day (light theme) and for the evening review (dark theme), on a ~1920px window; dense, directly editable lists.
Job: capture stuff instantly, clarify it one item at a time by the owner's own decision (there are no AI features), and work from compact Outlook-Tasks-style lists the owner trusts.
Keyboard: the spec lives in PRODUCT.md (Outlook-on-the-web grammar, ⌘ on the Mac, ⌃ for the go-to keys, H J K L as the arrows, ⌘K palette that follows focus, key caps shown only while ⌃ or ⌘ is held, no confirm dialogs, ⌘Z undo).

## Direction contract

THESIS: Stiltje, Swedish for dead calm: David Allen's "mind like water" as a still, near-neutral keyboard grid. Nothing imitates an object (the paper desk kit of folders, label tape and stamps was scrapped). It refuses the category default of an airy sidebar with rounded cards: density over decoration, consistency above all.

OWN-WORLD: Near-white and grey with the faintest cast of the pond's water, never reading as blue; near-black ink. One blue for focus and selection only. Red is trouble and is rationed: one red mark a row, one red signal on the rail, never a solid red block on the Calendar. Green and amber live only in the project lamps. No yellow. One typeface, Instrument Sans, with its condensed cut for labels. The only image is the pond at the head of the rail, and it is the system's weather: dead calm, a ripple, or rough water.

STORY: The owner glances at the pond and knows whether the system is current; captures without deciding; clarifies one item at a time; works from the lists and the Calendar's hard landscape; reviews weekly.

FIRST VIEWPORT: A 1920 desktop: the 236px rail (pond, lists with signal counts, system check, Done/Trash/Settings at the foot), a top bar with capture and search, the list of 30px one-line rows, and the 380px details pane pinned beside it on wide windows.

FORM: Every view is built from the same parts used the same way (DESIGN.md is the system of record): one row shape, one pane width, one heading, the same pickers and keys. A place that would look or work differently changes to match the rest.

FINISH: changes are recorded in DESIGN.md and PRODUCT.md with the owner's decision and its date.
