---
name: Stiltje
description: A still, near-neutral keyboard grid for GTD; colour only where it says something.
colors:
  paper: "#f3f5f7"
  sheet: "#fbfcfd"
  ink: "#16191d"
  ink-2: "#454b53"
  ink-3: "#5a6169"
  rule: "#dbe0e4"
  rule-strong: "#bcc4cb"
  rail: "#e2e7eb"
  rail-2: "#d1d9df"
  rail-ink: "#282d33"
  wash: "#e9eef2"
  wash-ink: "#2b333c"
  toast: "#20262d"
  toast-ink: "#eef2f5"
  accent: "#2462c6"
  accent-contrast: "#ffffff"
  select: "#dce6f3"
  select-ink: "#0f1b2d"
  go: "#1f8a4c"
  wait: "#c7890a"
  tick: "#e3e8ec"
  alert: "#b3301c"
  mark: "#2a3139"
  shade-on-select: "color-mix(in srgb, #0f1b2d 22%, transparent)"
  cap-edge-on-select: "rgb(0 0 0 / 0.35)"
  scrim: "rgb(18 24 32 / 0.3)"
typography:
  headline:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 650
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  body-sheet:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  body-touch-input:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  body-small:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label-tag:
    fontFamily: "Instrument Sans Variable (font-stretch 75%), Arial Narrow, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.07em"
  label-caps:
    fontFamily: "Instrument Sans Variable (font-stretch 75%), Arial Narrow, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.08em"
  numeral:
    fontFamily: "Instrument Sans Variable (font-stretch 75%), Arial Narrow, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
  proposal-title:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "-0.005em"
  numeral-lg:
    fontFamily: "Instrument Sans Variable (font-stretch 75%), Arial Narrow, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
  numeral-sm:
    fontFamily: "Instrument Sans Variable (font-stretch 75%), Arial Narrow, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1
  key-symbol:
    fontFamily: "Stiltje Keys"
    fontSize: "112% of the surrounding size (size-adjust); an Inter subset holding only ⌘⌥⇧⌃↵⌫⌦⎋⇥←→↑↓◇"
    fontWeight: 600
  fallback-text:
    fontFamily: "Instrument Sans fallback"
    fontSize: "metric-matched Arial stand-in while Instrument Sans loads"
    fontWeight: 400
  fallback-label:
    fontFamily: "Instrument Sans condensed fallback"
    fontSize: "metric-matched Arial Narrow stand-in for the condensed labels"
    fontWeight: 600
rounded:
  hairline: "1px"
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "5px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  gutter: "16px"
  page: "20px"
components:
  tag:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.wash-ink}"
    typography: "{typography.label-tag}"
    rounded: "{rounded.sm}"
    padding: "3px 6px"
  grid-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "30px"
    padding: "0 8px"
  grid-row-focus:
    backgroundColor: "{colors.select}"
    textColor: "{colors.select-ink}"
    height: "30px"
  grid-row-focus-idle:
    backgroundColor: "{colors.rail-2}"
    height: "30px"
  grid-row-ticked:
    backgroundColor: "{colors.tick}"
    height: "30px"
  grid-head:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label-caps}"
    height: "28px"
    padding: "0 8px"
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    width: "236px"
    padding: "14px 10px"
  rail-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 10px"
  rail-item-hover:
    backgroundColor: "{colors.rail-2}"
  rail-item-current:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 10px"
  input-capture:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "5px 10px"
  field-pick:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 8px"
  picker:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    width: "300px"
    padding: "8px"
  picker-option-hi:
    backgroundColor: "{colors.select}"
    textColor: "{colors.select-ink}"
    rounded: "{rounded.xs}"
    height: "28px"
    padding: "0 8px"
  clarify-track-current:
    backgroundColor: "{colors.accent}"
    width: "14px"
    height: "5px"
  lamp:
    backgroundColor: "{colors.go}"
    rounded: "{rounded.round}"
    size: "10px"
  lamp-waiting:
    backgroundColor: "{colors.wait}"
    rounded: "{rounded.round}"
    size: "10px"
  lamp-stalled:
    backgroundColor: "{colors.alert}"
    rounded: "{rounded.round}"
    size: "10px"
  lamp-done:
    backgroundColor: "{colors.ink-3}"
    rounded: "{rounded.round}"
    size: "10px"
  badge:
    textColor: "{colors.alert}"
    rounded: "{rounded.sm}"
    padding: "3px 5px 2px"
  detail-pane:
    backgroundColor: "{colors.sheet}"
    width: "380px"
    padding: "14px 16px 40px"
  toast:
    backgroundColor: "{colors.toast}"
    textColor: "{colors.toast-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
---

# Design System: Stiltje

## Overview

**Creative North Star: "Still Water"**

The app is a quiet surface for a busy mind: David Allen's "mind like water", set as a dense keyboard grid. Nothing on screen imitates an object. There is no tape, no folder, no rubber stamp and no desk drawer (owner's decision: the original paper-desk kit is scrapped). What is left is near-white and grey with the faintest cast of still water, near-black ink, and colour only where it changes what the owner does next. The one image in the app is the pond at the head of the rail, and the rest of the palette is tuned to it: the greys lean a hair toward its blue, never far enough to read as blue.

Rows are 30px, the body type is 13px, and a 1440 viewport holds more than twenty working rows. Important is a red exclamation mark, as in classic Outlook. Project health is a small traffic-light lamp, drawn as SVG on a 12px grid (a 10px light with a pixel of air; 11px beside a field label, 10px on a Calendar bar) so it stays round and crisp on a 1× screen such as a 1440p monitor (owner's request: the CSS-gradient lamps smeared there), told by shape as well as colour so it reads without colour vision: on track a solid `go` light, waiting a dot held in a `wait` ring, stalled an `alert` no-entry sign (a light with a bar cut out of it: stopped), someday half-lit, and not started yet (a start date ahead, or today without a next action) an `ink-3` ring with clock hands, never green, since nothing is moving yet and nothing needs to; its hover names the day ("Not started yet: starts Fri 2 Oct", "Starts today: give it a next action"). The Projects list's Next action cell says "Starts Fri 2 Oct" for such a project, and on its start day "Starts today · add a next action" in 600 `ink`; the Weekly Review notes the same, and the detail pane says "No next action needed before then". Done is a tick and a line through the subject.

The build rejects the category default of an airy sidebar and rounded cards. Surfaces are flat, corners stay between 2 and 5px, and elevation is used only for things that float above the grid.

**Key Characteristics:**
- Dense, keyboard-driven grid: 30px rows, 13px system type, tabular numerals everywhere.
- Near-neutral ground: white and grey with a faint water cast, never tinted enough to call blue.
- One blue accent plus a pale blue selection fill, used only to show position and focus.
- Colour is meaning: red for trouble (overdue, stalled, chase, errors), green and amber only in project-health lamps, the red exclamation mark for importance. Everything else is ink on grey.
- Condensed caps name things; the normal width says things.
- Light and dark themes, both designed in their own right.

## Colors

The palette is still water in daylight: pale grey-white ground, near-black ink, a rail the colour of the pond's air, one blue for focus, and a few state colours that each mean one thing.

### Primary
- **Focus Blue** (`accent`): the single accent. It forms the 2px focus ring on inputs, pickers, proposal rows and `:focus-visible`, the 1px hairline (45% mix) around the focused grid row, the 2px ring on a ticked row that is also focused, and the current Clarify track cell. Dark: #6497ee.
- **Accent Contrast** (`accent-contrast`): text on a solid accent fill. Dark: #0b1426.
- **Selection Blue** (`select`, `select-ink`): the pale blue fill that says "you are here": the focused row in the active grid, the highlighted picker or palette option, the current Weekly Review step, a focused mini-row in the detail pane and a focused proposal field chip. Text, markers, badges, dates and energy bars on it switch to `select-ink`. Dark: #1f3656 / #eef3fa.

### State
- **Alert Red** (`alert`): a state colour only. Overdue dates, stalled projects (the red lamp), the Chase label and dashed chase ring, review-overdue age, the important mark, warning facts and error notes. `alert-on-rail` is the darker (lighter in dark) red for small text on a hovered rail row. Dark: #ec6d57.
- **Go Green** (`go`) and **Wait Amber** (`wait`): project-health lamp colours only. Green means the project has a next action; amber means it is only waiting on others. Dark: #3dba72 / #e2a634.
- **Mark** (`mark`): the drawn marks: the done tick and the line through a subject. A near-black slate, not a colour. Dark: #d5dae0.

### Neutral
- **Paper** (`paper`): the app ground, the grid head and field wells. Dark: #15181b.
- **Sheet** (`sheet`): raised surfaces: detail pane, pickers, palette, capture input, the Clarify source text and the current rail entry. Dark: #1b1f23.
- **Ink** (`ink`, `ink-2`, `ink-3`): primary text; secondary text (projects, column heads, meta); tertiary text (placeholders, dashes, hints, the done lamp). `ink-3` holds 4.5:1 on paper and on the rail. Dark: #e7eaed / #b4bac0 / #979ea5.
- **Rules** (`rule`, `rule-strong`): row dividers and pane borders; grid-head underline, group underline and input borders.
- **Rail** (`rail`, `rail-2`, `rail-ink`): the pond's air, a faint water grey a shade under the pond, so the water settles into the rail without a seam. The rail, rail hover, and the focused row when its grid is not the active region. Dark: #1d2227 / #2a3037 / #d5d9dd.
- **Wash** (`wash`, `wash-ink`): the one quiet surface for naming chips: tags (a disposition, a rule source), the muted Someday/Done badges and the proposed-project block in Clarify. Dark: #232a31 / #cfd7df.
- **Toast** (`toast`, `toast-ink`): the undo note, a dark slate in light and a pale one in dark, so it floats clear of either ground.
- **Tick Grey** (`tick`): multi-selected (ticked) rows.
- **Scrim** (`scrim`): the dim behind the palette and help overlays, a slate at 30%.

### Named Rules
**The Still Water Rule.** Neutrals carry a trace of the pond's blue (a hue near 210°, chroma kept at the edge of perception). If a surface can be named as blue, it has gone too far. Blue as a colour belongs to focus and selection alone.

**The One Blue Rule.** Blue means focus and position. `accent` draws rings and hairlines; `select` fills the focused row, the highlighted option, the current review step and focused chips. Neither is used for decoration, headings or tags. Region focus is shown on the focused element itself, never by painting a pane. An empty list still takes focus, so its keys work (N adds the first item), but draws no ring or hairline: with no row to point at, there is nothing to mark. A grid that loses region focus keeps its cursor row in `rail-2`, not blue.

**The Red Means Trouble Rule.** `alert` is semantic only: overdue, stalled, chase, important, errors. It is never decoration and never a brand colour. A neutral status (Someday, Done) uses the same badge shape in `ink-3` on `wash`.

**The Traffic Light Rule.** Green (`go`), amber (`wait`) and red (`alert`) together mean project health and nothing else. Green and amber appear only in lamps. Colour never carries health alone to assistive tech: every lamp names its state in an `aria-label` and `title`. On screen the red lamp is the whole message (owner's decision: a STALLED badge beside it was double messaging); where there is room, a quiet line says why ("No next action", "Nothing touched in 3+ weeks").

**The Context Code Rule.** Contexts read exactly like areas (owner's decision): the @ in the same 14px tile filled with the context's colour (white 11px 700 @; dark on a lifted tile in dark), then the name in plain ink, wherever a context appears: the list cell, group heads, the detail pane, pickers, Settings and Clarify. There is no underline any more. The tile keeps its colour on a focused row and fades to 50% on a done row. Context colours never fill rows, cells or chips beyond the tile, and the context palette holds no red and no green (blue, slate, sienna, ochre, violet, teal, plum, olive): red means trouble and green means on track.

**The Area Hash Rule.** Each area has its own colour from the same eight (no red, no green), carried by its #: a 14px tile with 3px corners filled with the area's colour, a white 11px 700 # inside (dark `#10151a` on a tile lifted 18% toward white in dark), then the name in plain ink ("# Work"). Owner's decision: a coloured # alone was too subtle to tell areas apart at a glance. The tile is square so it never reads as a health lamp (round); a context uses the same tile with @; nothing else is filled with an area colour. The tile keeps its colour on a focused row, as a lamp does. The same tile leads area group heads. New areas take the next colour in the order Blue, Teal, Sienna, Violet, Plum, Ochre, Olive, Slate; C in Settings › Areas changes it.

## Typography

**Font:** Instrument Sans, one variable family (weight 400–700, width 75–100%), self-hosted via @fontsource-variable (owner's request: the same face on every device instead of each system's own; "classic and sleek"). A neo-grotesque with classic proportions and crisp terminals: it reads like the Swiss faces a desk tool should, without being Inter or Helvetica. IBM Plex Sans (also variable in width) was tried and set aside: more technical than sleek, and its condensed caps too wide.
**Body:** Instrument Sans at normal width.
**Labels:** the same family at `font-stretch: 75%` (condensed), 600, uppercase with tracking; it replaced Barlow Condensed, so naming and saying come from one family. Every rule that sets `--font-label` sets `font-stretch: 75%` beside it.
**Key symbols:** Stiltje Keys, a 3 KB cut of Inter holding only ⌘ ⌥ ⇧ ⌃ ↵ ⌫ ⌦ ⎋ ⇥ ← → ↑ ↓ ◇, first in both stacks and limited by `unicode-range`, so it draws those glyphs and nothing else. Instrument Sans has none of them, and system fallbacks drew them differently on every device. Scaled 112% (`size-adjust`) to meet Instrument's caps; inlined in the CSS, `font-display: block`. Licence (OFL) beside it in `src/fonts/`.
**Separator dot:** Instrument Sans draws · flush, with no room either side, so "8 actions · 5 deferred" ran together. The same glyph (weight 500) is re-spaced with 0.09em each side in a sub-kilobyte font under the "Stiltje Keys" family (`unicode-range: U+00B7`, the same weight range so the browser merges the faces), so every separator in the app is fixed at once.
**Fallbacks:** metric-matched `@font-face` stand-ins over Arial (and Arial Narrow for labels) keep the text from shifting while the face loads.

**Character:** A classic grotesque does the reading; its own condensed width, always in uppercase with tracking, does the naming. Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on body; the face has `tnum`).

### Hierarchy
- **Headline** (650, 19px, -0.01em): the view title ("Next Actions"), followed by a plain `ink-2` count.
- **Title** (600, 15px): the item title field in the detail pane and empty-state titles. Clarify proposal titles use 600/14px.
- **Body** (400, 13.5px, 1.4; Instrument Sans's small x-height of 0.51 wants the half pixel): rows, fields, rail, detail text. Strong subjects use 600.
- **Body Sheet** (400, 14px, 1.55, max 68ch): the captured text on the Clarify source sheet.
- **Body Small** (400, 12px): meta, counts, file sizes, and toast notes.
- **Label Tag** (condensed 600, 11.5px, 0.07em, uppercase, line-height 1): tags. A state's title (Inbox zero, Ready to record) uses the same caps at 14px in `ink-2`, with no chip.
- **Label Caps** (condensed 600, 12–13px, 0.06–0.08em, uppercase, `ink-2` or `ink-3`): column heads, pane and detail section heads, field labels, plain group labels, review steps and picker titles. Review steps are `ink-3`; a finished step (visited, nothing open) is `ink-2` with a line through it; an open step carries its count in 12px 650 `alert`.
- **Numeral** (condensed 700, 40px): the review tallies.

### Named Rules
**The Two Voices Rule.** Condensed caps name things, and the normal width says things. The condensed width never sets a sentence or an editable value. The normal width is never tracked out into caps.

## Layout

The desktop layout is a two-column app grid: a 236px rail and a fluid main column, running the full height of the window (there is no status bar). The main column stacks a 44px top bar (capture line flexing to fill, with a 220px search that widens to 320px when open) and a view head (16px 20px 8px). Below that, the work area holds the scrolling list region (20px side padding) and, when opened, a 380px detail pane on the right that runs the full height of the window; the top bar and view head then span only the list column. The pane can be pinned (the pin beside its ×, or ⌥P): pinned, it stays open beside every list, follows the cursor through the Inbox, lists, projects, areas, search and the Weekly Review, empties on a new view until that list's cursor fills it, and says "Nothing here has details…" on a row without any (an area, a group head). Focus arriving in the pane by any route (a click into a field, Tab) makes it the active region, pinned or not. Esc steps out one level: from a text field it only leaves the field (the edit is saved) and the pane keeps focus, so its field keys work again; from the pane, pinned, it only steps back to the list; × closes the pane and unpins it. The pin is remembered per browser. Loose, the pin is a quiet `ink-2` icon tilted 45°; pinned, it stands upright, filled `accent` on a `select` chip.

The grid uses CSS grid columns set per view through `--cols`: a 30px marker column, a `minmax(220px, 1fr)` subject, then fixed data columns (context 112px, due 84px, start 80px, time 52px right-aligned, energy). Cells pad 8px horizontally. The grid head is sticky, 28px tall, and underlined in `rule-strong`. Every list sorts the same way from its headings, as in Outlook: a heading with something to order by is a button; click once for A–Z (or oldest/smallest first), again for Z–A, a third time for the list's own order (manual, oldest first in the Inbox, A–Z in Reference, newest first in Done). The sorted heading turns `ink` with a 10px chevron (up ascending, down descending); other sortable headings show the chevron faintly on hover. Rows sort inside their groups (groups keep their order), empty values always last; the keyboard order follows what is shown; the choice is remembered per list, and the action lists' View menu "Sort by …" sets the same state. `aria-sort` names it for screen readers. Projects also sort by status (owner's request): the status-light column's heading is an 8px `ink-2` ring standing for it, a sort button like any heading (its chevron beside it when sorted), and the View menu (⌥V) offers Sort by status, Sort by due date and Manual order. Status sorts one group per lamp, what needs you first: stalled, waiting, on track, then every project with the clock together (starting today without a next action, or later; soonest start first), someday, completed (owner's decision); Z–A reverses it. Grouped by area, it sorts within each area. Columns can be put in any order on every list (owner's request), remembered per list: drag a heading sideways (past 6px, so a click still sorts; the heading dims and a 2px `accent` line marks where it lands), or ⌘K › Arrange columns… (pick the column, then "Before …" or "At the end"; "Reset column order" goes back to the list's own). The unlabelled lead columns (marker, done box, kind icon) stay first. Narrow lists still shed columns in their fixed order, wherever those columns sit. Columns can also be shown or hidden per list (owner's request): right-click a heading (the menu opens at the pointer), or ⌘K › Show or hide columns… (it opens under the focused row), opens a picker listing each column as Shown or Hidden; Enter toggles and the picker stays open for the next. The subject column always shows. Double-clicking a row's subject renames it in place (the list's own F2); double-clicking anywhere else in the row opens its details, as in a file list. Text an ellipsis cuts short (a long project, subject or next action) shows in full as a hover title. An empty cell in a list is left empty (critique: columns of dashes drowned the few values that matter); fields in the detail pane and in Clarify keep their `ink-3` dash, where it marks a value that can be set. A column no row in the list has anything in (Files in an Inbox of notes, Follow up when nothing needs chasing, Start when nothing is deferred, Project on Someday) steps aside and comes back with the first value; Show or hide columns… lists it as "Shown when filled". In the Trash the countdown moves to each day's heading ("gone in 6 days"), since everything deleted on one day goes on the same day; a row only says "Last day", in `alert`. Columns can be resized on every list (owner's request), remembered per list in px: while the pointer is over the headings every edge shows a 1px `rule-strong` hairline (none at rest, so the list isn't ruled), which turns `ink-2` and grows under the pointer; dragging it resizes live, the column's heading tinted with 7% `accent` and its edge a 2px `accent` line, and letting go never sorts. Double-clicking an edge fits the column to the widest heading or cell it holds. The subject has no width of its own (it takes what is left), so its right edge sizes the column after it. Widths run 36–640px. From the keyboard, ⌘K › Resize columns… picks a column (each listed with its width) and then ←/→ change it by 8px (⇧ by 1px), Tab moves to the next column, F fits, 0 restores the default, ↵ keeps and Esc puts every width back as it was; a small sheet under the heading names the column, its width and the keys, and its keys are tap targets. "Reset column widths" (⌘K, or at the end of the Resize picker) goes back to the list's own. On touch screens the edges are hidden; the ⌘K route remains. Narrow lists still shed columns with the widths as set. Lists also offer fields that start hidden: on the action lists Area (the project's), Created, Updated and, where fitting, Bring back, Repeat, Context and Due; on Projects Start, Bring back and Created. Group heads are 32px with 10px above. Grouped by context, Next Actions opens on "To chase" (critique: chase items sat in "No context" looking misfiled): the waiting items whose follow-up has come, with "follow-up due" on the right; nothing can be dragged into it. Its rows name only who is being chased ("ANNA LIND"), since the group already says "to chase"; elsewhere the label still reads "CHASE ANNA LIND". Beside the detail pane on 821–1100px screens the pane narrows to 340px so the list keeps its project column. When the list gets narrow (for instance beside the detail pane at 1024px) it sheds its least useful columns in a fixed order (start, energy, time, project on Next Actions; open, area, next action on Projects; since, project on Waiting For) instead of scrolling sideways; the grid never goes below 320px.

The spacing rhythm is small and even: 4, 6, 8, 10, 14, 16, 20px. Gaps inside controls are 6–8px, and pane padding is 14–16px.

Below 820px the rail is replaced by the bottom tab bar (see Rail). Search collapses to a 36px button. Below 560px of list width the grid keeps only the row's marker (important mark, project lamp), the subject with all the remaining room, and one date or value column (Due, Follow up, Captured, Gone in, a setting's value…). The done box, the kind icon (note, email, file) and the notes and files marks after a subject are dropped there (owner's request: the room goes to the text; a swipe right marks done, and the detail shows notes and files). The list picks these by what the columns are, never by their position, so adding or reordering columns can't hide the subject. The detail pane becomes a fixed bottom sheet 72dvh tall at the foot of the screen, and Clarify's two panes stack into one column. Every control a thumb uses is at least 44px on touch screens (the capture field, search, the calendar's arrows, views and Today, step and tab strips); column headings keep their drawn size with a taller invisible hit area. On touch screens a screen's key hints are its buttons, and they are ranked (critique: seven equal buttons in Clarify): the one primary hint is a full-width `accent` button (Accept in Clarify), the everyday ones share a row, the rarer ones wait behind More (Clarify: Add action, Project, Trash), and hints that only move between steps or tabs already on screen (Next step, Previous, Next tab) are left out. Step and tab strips (the Weekly Review's steps, Settings' tabs) are one line that scrolls sideways, the current one kept in view. In Clarify the kind label sits above the proposed title, which takes the card's full width and wraps (the title field grows to its lines everywhere; Enter never adds a break). Settings rows put each explanation on its own line under the name. In Settings a setting's value is its own control (owner's request: nothing could be changed by mouse): the value and a 13px caret with no box around it, even on the focused row (owner's decision); the caret is `ink-3` and turns `ink` when its row is hovered or focused; clicking it picks the row and does what Enter does, and the picker opens under the value (by keyboard too). Download shows a download glyph, the API key opens the key prompt, a suggested rule shows Approve. Double-clicking a row does the same, or renames an area, context or rule. The phone's More sheet is its rail: it opens on the pond (the name on a 38px horizon, mirrored), then the system check (Weekly Review with "due" in `alert` or its age, the oldest Inbox item's age, red from 7 days), then Calendar, Projects, Someday/Maybe, Reference, Done, Trash and Settings; when the check wants attention the More tab carries a 6px `alert` dot. Capture moves to the foot of the screen on phones, just above the tab bar where a thumb reaches it (critique): the top bar becomes the main column's last row, the capture field grows upward as lines are added, and what was filed rises above it; toasts sit above it.

## Elevation & Depth

The system is flat. Depth comes from tone: paper, sheet and rail. Shadows are kept for things that float (pickers, palette, help, the filed-capture list, toasts and the mobile detail sheet) and one soft lift under the Clarify source text.

### Shadow Vocabulary
- **Float** (`--shadow: 0 10px 28px rgb(18 24 32 / 0.14), 0 2px 5px rgb(18 24 32 / 0.07)`; dark `0 12px 32px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.35)`): pickers, palette, help, open capture, toasts and the mobile detail sheet.
- **Lift** (`0 2px 8px -4px rgb(18 24 32 / 0.12)`): the Clarify source text, a single sheet (no stacked paper edges).
- **Focus ring** (`0 0 0 2px var(--accent)` with a border moving to `ink`): text inputs, pickers and proposal rows. Region-focus cursors in the rail and on group heads use an inset 2px `ink` ring instead.

### Named Rules
**The No Props Rule.** Nothing imitates an object: no tape, folders, stamps, paper stacks, sheen, emboss or bevels. A surface is a flat tone; a mark is a drawn line. The pond is the one image, and it stays in the rail.

## Shapes

Corners are nearly square and scale with the object: thin marks (the drop line, context swatches, Clarify track cells) at 1px, wells and file previews at 2px, tags, badges, inputs, fields, rail items and proposal rows at 3px, pickers at 4px, and the palette, help overlays and toasts at 5px. The rounded forms are the two-minute badge (10px pill, dashed at rest, solid ink when on) and the 10px circular project lamp. Important is a red exclamation mark; done is a 1.5px tick and a line through the subject.

## Components

### Tag
A place name as a quiet chip: Label Tag caps (condensed 600 11.5px, 0.07em) in `wash-ink` on `wash`, 3px radius, 3px 6px padding, no shadow. Tags name Clarify's disposition and Settings rule sources. Areas are never tags (owner's decision): an area is its colour tile with the # and the name in plain body text, as a context is "@phone" (see The Area Hash Rule), wherever it appears (the Projects area column, the detail pane's Area field, pickers, Settings › Areas, the Clarify proposal, toasts); group heads set it in the same Label Caps as every group ("#WORK"). The # is shown, never stored: typing "#Home" names the area "Home". At heading size (`Tag size="md"`) there is no chip: 14px caps in `ink-2` title a state (Inbox zero, Clarify stopped, Ready to record, the help overlay, the sign-in sheet's Stiltje). The rail uses no tags; list names are plain text.

### Rail (Navigation)
- **Role:** a status panel, not only a menu (owner's decision after the rail critique). It answers "where am I?" and GTD's weekly "is my system current?".
- **Style:** the `rail` tone, 236px (wide enough for the longest name, its signal and a key cap), 14px 10px padding, a `rule-strong` right edge.
- **Mind like water (the pond):** the rail opens on a still water surface, David Allen's "mind like water" (owner's idea). An 84px band bleeds to the rail's edges: the rail's air above a 1px `water-line` horizon at 43px (level with the top bar's and the detail pane's bottom rule, so one line runs across the window), then water shading from `water-far` to `water-near`, masked so it fades into the drawer. At rest nothing moves and nothing runs. When something lands in the Inbox (a capture or an upload, never a page load or an undo), a drop in `water-drop` falls from above the band (about 0.4s, stretching into a tear as it speeds up), strikes the surface at a random spot across the middle (lower is nearer), throws up a small rebound droplet, and sends out three rings: a bright `water-crest` line over a darker `water-trough` line, flattened by the viewing angle (nearer rings are larger and rounder), expanding and dying out over about 3.5s until the water is smooth again. Several captures at once fall one after another, 160ms apart, never twice in the same place. The canvas draws only while something moves, then clears and stops. With reduced motion there is no fall: a single ring appears where the drop lands and fades in place. The pond is decorative (`aria-hidden`); the live region announces the count.
- **The name on the water:** at rest the pond carries the wordmark (critique: the band read as an empty smear). "STILTJE" stands on the horizon in the label caps (condensed 600 13px, 0.22em tracking, `ink-2`), 20px in to line up with the rail's names, and the still water mirrors it below the line: flipped and flattened by the viewing angle (75% height), `ink-3` at 45% with a 0.4px blur, fading out with depth, so it reads as water rather than a second line of text. Dead calm is the name made visible. A drop that lands stirs the reflection (a 1.6s sway and slight blur as the rings pass, `--ease`), then it lies still again; reduced motion leaves it still.
- **App icon:** the pond at dead calm as a modern macOS icon (`public/favicon.svg`): a continuous-corner squircle with a thin light glass rim; pale, cool air over a misty horizon (a soft light band, not a ruled line) at about 59%; water that mirrors the sky near the horizon (#a9c4df) and deepens toward the viewer (#132f57); a glassy `accent`-blue drop lit from the upper left (a crisp highlight stroke and glint, the far edge shading away, light gathered low inside it as a crescent, a soft shadow), faintly reflected below; and four rings in perspective where it will land, each a light crest over a darker trough, thinning and fading as they widen. At tab size (the SVG's own media query, 48px and under) the fine detail drops out: a fuller drop, one bold highlight and two heavy rings, so it reads at 16px. `public/apple-touch-icon.png` (180px) is the same art full bleed, since home screens round their own corners.
- **The Inbox, on top:** an ordinary rail item at the head of the first run (owner's decision: quieter, like the other items): the name, its count as a plain `ink-2` number when anything is waiting (nothing at zero), and its ⌃1 key cap. A polite live region still announces the count after a capture.
- **Lists:** no stage headings. Two runs split by a `rule-strong` hairline, in order of use: Inbox, Next Actions, Waiting For, Projects, then Someday/Maybe, Reference, Done.
- **Counts are signals, not inventory:** Next shows "N overdue" (alert red) or "N important"; Waiting shows "N to chase" (alert red); Projects shows "N stalled" (alert red); Done shows "N today" in `ink-3`; Someday, Reference and Areas show no number (their view titles do).
- **System check:** no visible heading (owner's decision: with two rows at most, the divider above says enough; screen readers hear it as the "System check" group), one row per open question, each a stop that opens where it is fixed: Weekly Review (age, "due" in alert red from day 7, or once a never-reviewed system is a week old; key cap ⇧R) and the oldest Inbox item's age (alert red from 7 days; key cap K). There are no stalled-projects or follow-ups rows (owner's decision): the Projects and Waiting For stops already say "N stalled" and "N to chase". Rows with nothing to report are left out; the review row always stays. - **Key legends:** every rail stop ends in its shortcut as a key cap (`.rail-key`: 11px, 30px minimum width so the caps form one right-aligned column): ⌃1–8 on the Inbox, Calendar and lists in rail order, ⌃9 on Trash, ⇧R on the review, K on the oldest item, ⌘⇧, on Settings. Every key legend in the app uses the Mac's modifier symbols on every system (owner's decision): ⌃ Control, ⇧ Shift, and Alt as ⌥ on the Mac but the old Meta key's hollow diamond ◇ elsewhere (owner's decision: ⌥ means nothing on a Windows keyboard), run together with no "+"; the command key reads ⌘ on the Mac and ⌃ elsewhere (where it is Control), so Windows shows "⌃2" and "⌃⇧,". They are visual only (`aria-hidden`); each button carries the key in `aria-keyshortcuts`. The rail is the one standing exception to the no-printed-hints rule (owner's decision).
- **Settings:** alone at the foot. ⌘⇧, (Ctrl+Shift+, on other systems) opens it.
- **Go-to keys:** Control+1–8 on every system (⌃1–8 on the Mac, Ctrl+1–8 elsewhere) follow the rail from the top (Inbox, Calendar, Next Actions, Waiting For, Projects, Someday/Maybe, Reference, Done). The Weekly Review has no number; ⇧R starts it (owner's decision: it is weekly, so W goes to adding a waiting for, paired with T). Trash, at the rail's foot above Settings, is Control+9. The Calendar sits right after the Inbox (owner's ask for the GTD-logical place): it is the hard landscape, checked before the lists are worked.
- **Signal contrast on the open list:** the current row's red counts use `alert-on-rail` and its quiet counts `ink-2`, so they keep AA on the lifted row in dark (5.2:1).
- **Key caps on demand** (owner's decision after the critique: twelve standing caps crowded the counts): the caps take no room and never move anything. Counts sit at the rail's right edge. While ⌃ or ⌘ is held for a moment (220ms, so a quick ⌘K doesn't flash them) each row's cap fades in (140ms) over the right end of the row, where the count is, and the count fades out underneath until the key is let go, the way macOS shows shortcuts only while a modifier is down. Hover and rail focus don't reveal them (they would hide the counts). Every key stays in `?` and ⌘K, and in each stop's accessible name.
- **States:** rows are 30px, 13px 500-weight `ink-2`. The open list is the sheet pulled forward: `--rail-current` (sheet in light, a lifted #30373e in dark, never darker than the rail), `ink` text at 650, a 1px `rule-strong` hairline and a soft lift. Hover fills `rail-2`, and small red text on a hovered row switches to `--alert-on-rail` so it keeps AA. The keyboard cursor is an inset 2px `ink` ring.
- **Keyboard:** the rail is a region (⌥Tab / ⌘F6). Focus arriving by Tab or a click makes it the active region, so the keys act on what looks focused. ↑/↓, Home/End, the first letter of a stop's name (K stays the app-wide clarify key), Enter to open, Esc back to the list.
- **Phone (below 820px):** the rail is replaced by a bottom tab bar, 52px targets: Inbox with its count (a plain 12px `ink-2` number as in the rail, none at zero), Next, Waiting, and More (a sheet with the other lists and Settings). The current tab has a 2px ink rule on top; when a More list is open, the More tab shows its name.
- **Mobile:** a horizontal scrolling strip.

### Grid Rows (Signature)
- **Row:** 30px tall with a `rule` bottom divider. Hover is a 45% `rail` wash.
- **Focus:** the focused row in the active grid fills with selection blue (`select`) inside a 1px `accent` hairline. Markers, badges, overdue dates and energy bars switch to `select-ink` so they stay legible; an overdue date on the focused row keeps a 2px underline. In an inactive grid the cursor row is `steel-2`. Ticked (multi-selected) rows are `tick`. A ticked row that is also focused gets an inset 2px `accent` ring.
- **Marker:** a 22px cell holding a thin ring. Marked important (owner's decision: importance, not "flagged for today") the ring becomes a drawn red exclamation mark, a tapering bar over a round dot in `alert`, as classic Outlook marks high importance; it drops in (220ms). A done action shows a tick; a waiting item whose follow-up has come, a dashed `alert` ring.
- **Importance column:** the marker cell is a button, as in classic Outlook's importance column. Unmarked, hovering it shows a faint 1.1px `ink-3` outline of the exclamation mark; a click marks the row important, a click on the mark unmarks it.
- **Complete box:** as in classic Outlook's task list, every action row has a Complete checkbox between the marker and the subject (a 26px column). A 12px square with a 2px radius, `sheet` fill and a 1.25px `ink-3` edge; hover inks the edge; checked, a tick. One click completes that row only (not the selection) with the usual strike and fold, and ⌘Z undoes it; in Done a checked box unticks to bring the action back. It never moves the cursor or starts a rectangle. Beside it the marker goes quiet: the plain ring and the done tick are left out (the box says both), so the marker column only carries flagged for today and chase.
- **Done:** as in classic Outlook, a done action stays on its list: a line strikes through the subject (200ms), then the row settles, greyed out (`ink-3` throughout, the subject struck through, no overdue red, context and area tiles at 50% and faded energy bars) at the bottom of its group, whatever the sort. The cursor moves on to the next open row instead of following it down. E or the Complete box on a done row takes it back to the list it was done on. Each action list (Next Actions, Waiting For, Someday/Maybe) has a per-list Show/Hide done actions toggle (View menu and ⌘K; shown by default); hidden, a completed row folds away (180ms, fade and 8px slide). "Archive done actions to Done" (⇧E, View menu, ⌘K) moves that list's done actions to the Done list. Done is built like the Trash (owner's request: it shows everything): every archived item, actions and completed projects together, newest first, grouped by the day it was done ("Today · Wed 30 Sep 2026", then the full date) or, from the View menu (⌥V), by project (the finished project leads its group, loose actions go last). Columns are a kind icon (a circle for an action, the layers icon for a project, whose title is 600), Item, Was in (the list and its project, or Projects and the area; grouped by project, only the list) and Done (the time when grouped by day, the date when grouped by project). E puts the focused or ticked items back (an action to the list it was done on, a project to Projects with the actions closed along with it), Delete trashes them, Enter opens details, and a swipe right on a phone puts one back. A finished project's actions go straight to Done. The Inbox follows the same rules: each row has a Complete box after its kind icon, and ticking an item off (the two-minute rule, E or the box) strikes it through at the bottom of the Inbox, logged as a done action; unticking returns it to the Inbox as stuff, ⇧E archives it to Done, and Show/Hide done items is in ⌘K. Projects too: each project row has a Complete box after its lamp; completing a project (E or the box) strikes it through at the bottom of its area and closes its open actions straight into Done, unticking makes it active again with those same actions back, ⇧E archives completed projects off the list into Done, and Show/Hide completed projects is in the View menu and ⌘K.
- **Cells:** a context is its @ colour tile and name, an area its # tile and name. Dates are ink; overdue dates are alert red at 650 weight; due-soon dates are 650 weight. Energy is three 5×12px bars filled `ink-3`/`ink-2`/`ink` by level. Chase items carry a stamp-red condensed "CHASE …" label.
- **Rectangle select:** pressing anywhere in the main column and dragging (past 5px, so a click stays a click) draws a band: a 1px `accent` hairline at 70% over a 10% `accent` wash, 2px radius. It can start on a row (except where a row drags to reorder, below), in the empty space around and below the list, or on the top bar; a press on text outside the rows (the view title, its count, an empty state's words) selects that text instead, as anywhere else (owner's request); never on the rail, the detail pane, a field, a button or an open picker. The band is drawn only in the main column: dragged over the rail or the detail pane, its edge stops at the column's edge (and rows are hit-tested against that clipped band). A band started inside the list keeps its anchor on the content as the list scrolls. A click on empty space (no drag) clears the selection, as on a desktop. Every row it touches is ticked as it moves (group heads never), the cursor goes to the row the band reached last (the bottom ticked row dragging down, the top one dragging up, whether the pointer ends on a row or on empty space), and near the list's top or bottom edge the list scrolls, faster the closer the pointer. A plain drag replaces the selection; ⌘-drag (Ctrl elsewhere) adds to it. No text is selected while dragging, and the click that ends the drag is swallowed so it doesn't undo the band.
- **Drag to reorder:** rows always drag (Next Actions, Waiting For, Someday, Projects; not Done, which keeps no order of its own): pressing on a row and dragging past 5px moves it, as in Finder: the row dims to 40%, a 2px `accent` drop line with an 8px ring at its start marks where it lands, and the cursor is a grabbing hand. Dropped inside its own group it only moves; dropped into another group (including a collapsed or empty one, where the line sits under the heading) it also takes on what that group stands for: the context, who it waits on, the project, importance, the project's area, or a due date for the date buckets (Today, Tomorrow, +2 days for This week, +7 for Within a month, +31 for Later, none for No due date), and a toast names it ("… → @phone"). Pressing a ticked row drags the whole selection, as in Finder: every ticked row dims, they land together in list order at the drop line, each takes on the new group's field ("2 actions → @phone"), and one ⌘Z undoes it. Done rows and completed projects never drag. Dropped while the list is sorted by a column, the list switches to its manual order (owner's decision) without anything jumping: the rows' manual positions are handed out again in the order that was on screen, with the dragged rows at the drop line, and the toast adds "· now in manual order". Drops that would break a rule are refused (no line appears): "No context" on Next Actions (a next action needs a context) and "Overdue" (no date to give). The line never goes below the done rows, the list scrolls near its edges, and the row takes a sort value between its new neighbours (nothing else is renumbered). ⌘Z undoes it; ⌥↑/⌥↓ remain the keyboard way: every ticked row (or the cursor's row) steps one place within its own group, hopping the unticked row beside it, so a scattered selection moves as one; a block already at its group's edge stays put and the rows behind it close up against it. Pressed in a column sort, the list switches to its manual order first, with the same toast. When a column sort is on, or in lists without a manual order (Inbox, Reference, Done), a drag on a row draws the selection rectangle instead; from empty space it always does.
- **Inline edit:** a 24px sheet field with an ink border and a 2px `select-ink` ring, set inside the selected row.

### Project Lamp
A 10px circle (50% radius, 6px left margin) with a 1px inset edge mixed 70% toward black. Green (`go`): the project has a next action. Amber (`wait`): it is only waiting on others. Red (`alert`): stalled. Hollow (1.5px `ink-3` ring, no fill): someday. Dimmed grey (`ink-3` at 60% opacity): done. It sits in the marker column of project rows in Projects, Someday/Maybe and the Weekly Review, and after the Project label in the project detail pane (8px there, sized to the label caps). No detail pane has a header line above its fields (owner's decision: it only repeated what the fields and the list already say). The pane opens on its first field; the one state the fields don't show rides after that field's label: a project's lamp after "Project", and an action's marker after "Subject", only when it is important or done. Each lamp is `role="img"` with an `aria-label` and `title` naming the state ("On track: has a next action", "Waiting: only waiting on others", "Stalled: no next action", "Someday / Maybe", "Completed").

### Project Actions
Projects has no fold-out (owner's decision, after the pinned detail pane arrived): a project's actions are read and worked in its detail pane, which, pinned, follows the cursor down the list. On the list, T adds a next action to the project under the cursor (text, then a required context) and W a waiting for (text, then who or what), and the Next action column shows its first open action.

### Areas in Settings
There is no Areas page (owner's decision: the Projects list grouped by area already shows them). Areas are a group in Settings, between Claude's rules and Contexts: each row is the area's plain "#Name" with its active-project count on the right. N adds one (the name is typed in place), F2 renames, ⌥↑/⌥↓ reorders (the order the Projects area groups follow), Delete removes it and its projects keep going without an area. Any area picker can still create one by typing a new name.

### Group Heads
Every list's group heads look the same (owner's decision: Projects used to have blue-grey folder bands with raised area tape, and was the odd one out): 32px, a chevron, the group name in Label Caps (`ink-2`; a context shows its colour as the 2px code under the name), then an `ink-3` count and an optional quiet 12px `ink-3` note on the right, over a `rule-strong` line. Group heads sit 10px below the group above them. Group focus matches row focus: in the active grid the head fills selection blue (`select`) inside a 1px `accent` hairline; in an inactive grid it gets a 1px `ink-3` hairline. The detail pane, when it holds focus itself, shows the same 1px `accent` hairline around the pane, never a painted header.

### Inputs / Fields
- **Capture line:** sheet background, 1px `rule-strong` border, 3px radius, 30px minimum, grows to 160px. On focus the border turns ink with a 2px blue ring. When open it adds the float shadow.
- **Search:** a 30px, `rule`-bordered well at 220px. When open it widens to 320px with an ink border, blue ring and sheet fill.
- **Detail fields:** paper wells (`rule` border, 3px) that turn into a sheet with an ink border and blue ring on focus. Picker fields are 28px. Project notes are ruled like a notepad (19.5px line pitch).
- **Labels:** Label Caps 11.5px in `ink-3`.

### Pickers, Palette, Help
The picker is a 300px sheet card (4px radius, float shadow, 8px padding) that pops in over 140ms (fade plus 4px rise). Its input is permanently ink-bordered with a blue ring. Options are 28px rows, and the highlighted option fills selection blue with `select-ink` text. The ⌘K palette (640px, 38px input, 160ms pop) and the ⇧? help overlay (1120px) share the treatment over a 30% dark scrim (120ms fade). Apart from the rail legends, these two overlays are the only places key caps (`.kbd`: sheet fill, `rule-strong` border with a 2px bottom) are shown. The help overlay (titled "Keys") is split in two by a `rule` hairline (owner's request: app-wide and screen keys used to be mixed): on the left "On Next Actions" (the screen's name, or Clarify), the screen's own keys in its own groups with Move and Select last, since list movement is the same everywhere; on the right "Everywhere", the app-wide keys regrouped by purpose: Add (capture, paste, upload, then ⌥T, ⌥W, ⌥N), Go to (the views without "Go to", Search, Clarify, Weekly Review), Panes, and Help and undo. Scope titles are 15px 600 `ink`, group heads Label Caps over a `rule`, each half in two columns; a group's keys form one column as wide as its widest key, so the descriptions rarely wrap. Below 900px the halves stack. A click or tap anywhere outside a picker closes it, as Esc does, and is spent on closing (it doesn't also press what was under it, as with a macOS menu); the phone's More sheet closes the same way.

### Theme
Light, dark, or follow the system (the default). The choice lives on `<html data-theme>` and is kept per browser; with no attribute the dark tokens follow `prefers-color-scheme`, `data-theme="dark"` forces them, `data-theme="light"` keeps the light ones even on a dark OS. It is applied before the first render, so the page never flashes the other theme. Chosen from Settings › Appearance › Theme (Enter opens System / Light / Dark, System showing which it resolves to now) or ⌘K ("Switch to the dark/light theme", "Follow the system theme"). The pond reads its colours when a drop starts, so it follows a switch.

### Calendar
The hard landscape as a flat grid in the lists' own language (owner's request): rules for days, ink for what is on them, colour only where it says something. A 15px 600 period title ("September 2026", "Week 40 · 28 Sep – 4 Oct 2026", "2026") with previous/next chevrons and a quiet Today button, then WEEK · MONTH · YEAR as Label Caps tabs on the right, the current one on the `select` fill (keys 1, 2, 3). Weeks start on Monday by default (Settings › Calendar › Week starts on); ISO week numbers run down an 11px `ink-3` gutter. The month looks forward (owner's decision after the critique): past weeks keep a compact 112px and three lanes ("+N more" beyond), this week and later ones grow to hold everything on them (up to eight lanes, 24px each), and on the current month the weeks scroll inside the grid (title, navigation and weekday names stay put) with this week brought to the top. On today, the black date disc is the one emphasis: the keyboard cursor keeps only its hairline there, no fill. On phones (640px and under) bars across seven columns can't be read, so the calendar changes form: the week, the phone's default view (kept apart from the desktop's choice), is an agenda, one section per day (weekday, date disc on today, month), each item a 44px row with its mark (project light, hourglass, tickler clock, flag or dot), its full title and what the date is to it (Due in `alert` when overdue, Starts, Until 5 Oct, Follow up …, Comes back); the month is a grid of day numbers with single-letter weekdays and up to four 5px dots per day (`alert` for something due that day, `wait` for a follow-up, `ink-2` for a project, `ink-3` otherwise), and the chosen day's items are listed in full under it. Tapping an agenda row opens its details.
- **Days:** 1px `rule` lines; weekends carry a 38% `rail` wash; days outside the month set their number in `ink-3`; the cursor day takes a 55% `select` fill inside a 45% `accent` hairline; today's number is inked (an `ink` circle with `sheet` figures), the one filled date on the page.
- **Bars:** laid into lanes under the date line, each spanning the days it covers (22px in a month, 40px with a second line in a week). An action is a `sheet` bar with a 1px `rule-strong` edge and 12px `ink` text; a project is heavier: `wash` fill, 600 title after its lamp; waiting-for actions have a dashed edge; follow-ups (hourglass) and ticklers (clock) are reminders, not work, so they have no box and read in `ink-2`. Every item says which date it holds (owner's rule: due dates must be seen at once). A due date is a deadline: every due end, whether a one-day item or the last day of a span, carries the planner's milestone mark: a solid 7px diamond at the right end (`ink`, `alert` when overdue, `sheet` on a solid bar), never a thick side border. An item with only a due date is inked solid (`ink` fill, `sheet` text), or filled `alert` once the day has passed; it carries no "Due" word (owner's decision: the solid bar and its diamond say it, a word made the bar too busy). The solid fill is kept only for these, so deadlines are the darkest marks on the grid; when focused the bar takes the selection fill but keeps its diamond. An item with only a start date is a plain `sheet` bar with no tag (owner's decision): only the deadline is marked. A span that is overdue turns its text `alert` with a 55% `alert` edge; an important one leads with the exclamation mark. A bar that continues from the previous week or into the next runs square to that edge. In a week, the second line names the project and context, or who it waits on. A month shows three lanes; the rest fold into "+N more", which opens that week.
- **Dragging:** the bar body moves both dates (grab cursor); a 7px grip at each true end changes that date (resize cursor; a 2px `ink-3` line shows on hover). A one-date item (only a due date, or only a start date) has grips at both ends (owner's rules): dragging the body moves that one date and leaves the other empty; stretching it across days gives it both dates, with the day it had staying put on screen. A due-only item stretched right turns its due date into the start and the dropped day into the due date; stretched left, the dropped day becomes the start and the due date stays. A start-only item stretched right keeps its start and the dropped day becomes the due date; stretched left, its start becomes the due date and the dropped day the start. Dropped back on its own day, it keeps its single date. While dragging, the bar is drawn where it would land with a 2px `accent` ring; the drop writes the fields (start is an action's defer date) and a toast names the new dates, undoable with ⌘Z.
- **Year:** twelve small months. Each day is shaded in the ink's own grey by how much it holds (up to 34% `ink-3`), with a 4px dot where something is due, red when overdue. A month name opens that month; double-clicking a day opens its month on it.

### Reference dates
Reference items show when they were filed and when they last changed (owner's request): the Reference list has Created and Updated columns (sortable; Updated sheds first when narrow), and the detail pane ends with "Created Thu 10 Sep 2026 · updated Mon 28 Sep 2026". Updated is a dash until the item changes after it was filed. Editing the title, notes or project stamps it, and so does attaching a file; deleting or restoring it does not.

### Settings
Settings is five tabs in the Weekly Review's step bar (owner's request): General (theme, week start, stalled after, trash keep period), Areas, Contexts, Claude (API key, suggested rules, Claude's rules) and Data (Markdown and JSON export). The current tab takes the `select` fill. Each tab is one plain keyboard list with no group headings (owner's decision): the tab is the grouping. ⌘. and ⌘, walk the tabs as they walk the review's steps, 1–5 jump straight to one, and the tab is remembered. A key hint line closes each tab with only what that tab does (⌘. Next tab, ⌘, Previous, then ↵ Change; or N New, F2 Rename, C Colour, ⌥↑ Move, Del Delete; or ↵ Download). N only adds where there is something to add.

### Trash
Deleting is never immediate loss (owner's request): a deleted action, project, Inbox item or reference stays in the Trash for the keep period (7 days by default; Settings › Trash takes 1–365), then it and its files are gone for good. The view lives at the rail's foot above Settings (Control+8), out of the way of the working lists: it is a place to look back, not a list to work. Rows are grouped by the day they went (Today, Yesterday, then the date), newest first, with the kind as a 14px `ink-2` icon, the title (projects in 600), "Was in" (the list, and the project in `ink-2` after a middle dot), the time or date deleted, and "Gone in" as a right-aligned countdown of days until it is removed for good; on its last day it reads "Last day" in 600 `alert`. The view count says the rule ("Kept 7 days, then gone for good"). R restores the focused or ticked rows to the status they had (a project brings back the actions deleted with it); Delete removes them for good; ⌘K › Empty the Trash clears it; all of it undoes with ⌘Z. Delete permanently (⇧⌫) elsewhere still skips the bin.

### Touch
On a touch screen (`pointer: coarse`) the same app is sized for a thumb (owner's request); nothing changes for a mouse. Rows are 48px and group heads 44px; the done box and flag get 40×44px tap areas; fields are 44px and text inputs 16px, so the phone doesn't zoom on focus. A tap on a row opens its details as the bottom sheet (there is no Enter and no double-click). Rows swipe sideways for their two commonest actions: right for Done (Not done in Done), left for Trash, on Next Actions, Waiting For, Someday, the Inbox and Projects. The cells slide with the finger over a `rail` band naming the action in Label Caps, which inks in (`ink` for Done, `alert` for Trash) once the swipe passes a third of the row, and the usual toast undoes it. Rectangle select and drag-to-reorder are mouse gestures and stay out of a finger's way. Key caps hide; the key hint lines become rows of 44px buttons that do what their keys do (they are clickable with a mouse too). Pickers rise from the bottom as full-width sheets above the tab bar, with 44px options.

### Drop Zone
Files dragged in from the desktop turn the main column into a still surface to drop onto (owner's request). The column goes quiet under an 86% `paper` veil with a 2px blur, and a 1.5px dashed `rule-strong` edge sits 10px inside it at a 5px radius. The hovered target takes the position colours: the edge turns 75% `accent` over a 45% `select` wash. At its centre the pond's drop (`water-drop`) hangs above the surface and, while files hover, lowers 10px as `water-trough` rings keep widening from where it will land (2.4s, three rings 0.8s apart). Below it, "Drop into the Inbox" (15px 600 `ink`) and a 12px note with the file count and what is accepted ("2 files · each becomes an item to clarify / PDF, Word, text, email and images"). When a detail pane is open on an action, project, Inbox item or reference, the pane is a second target: "Attach to", the item's title, and the count; dropping there attaches the files to that item instead. The overlay never takes the pointer (the target is read from what is under it), appears in 160ms and leaves 160ms after the files leave the window; a status line tells screen readers where a drop would go. With reduced motion the drop stays still and a single ring shows where it will land. Dropped files land as usual, so the pond answers each capture with its own drop.

### Detail Pane
A 380px sheet on the right, opened with Enter. It runs the full height of the window beside the top bar and list, and its 44px bar (Label Caps title, pin and close) shares the top bar's bottom rule, 14px 16px body padding and 14px section gaps. Section heads are Label Caps with `ink-3` counts. A project's header starts with its lamp. Nested action lists use 28px mini-rows that fill selection blue on focus. In a project's pane, T (as on the Projects list) puts the cursor in "Add a next action" and W adds a waiting for; their two key caps sit at the right of the Actions heading, like the field keys. Enter asks for the context before adding (a next action always has one), then leaves the cursor in the field for the next. Every notes field looks the same in every pane (owner's decision): a plain `paper` well, 8 lines tall to start, with no ruled lines (paper imitation is ruled out by the No Props Rule). Every pane opens on a one-line heading field (15px 600): an action's Subject, a project's name, a reference's Title, and an Inbox item's Stuff line (owner's decision: it used to be one big text area). For an Inbox item the heading is the line it is known by (an email's subject, otherwise the first line) and everything else captured sits below it in a Notes field; editing either writes the item back with the heading line first (an email keeps its "Subject:" label).

### Badge
A state word beside a name: condensed 700 11px caps, 0.1em tracking, 3px radius, 3px 5px 2px padding, no border. Neutral statuses (Someday, Done) are `ink-3` on `wash`. On a selected row it switches to `select-ink` on an 8% tint.

### Toast
There is no status bar; the owner removed it because standing facts (Claude ready, important, deferred) added nothing. Standing facts belong in the view count instead ("12 actions · 1 deferred"), and Claude's connection is shown in Settings. Action feedback appears only when something happens: a slate (`toast`) toast with `toast-ink` text, 5px radius and the float shadow, centred 18px above the bottom edge. It rises in over 180ms, stays for 5 seconds (12 seconds for errors) and fades out. An undoable note ends with the "⌘Z undo" suffix. Errors turn the toast alert red with white 600-weight text. It never takes clicks and is announced politely to screen readers.

### Clarify
The captured item is shown on a Sheet with a single soft lift, beside proposal rows: sheet cards with a 1px `rule` border and 3px radius that take the blue focus ring through `:focus-within`. Focused field chips fill selection blue. A proposed project sits in a `wash` block with a 1px `rule-strong` top edge. Progress is a track of 14×5px cells: `rule` pending, `rule-strong` ready, `ink-2` done, and `accent` with a 1px `select-ink` hairline for the current item.
Clarify sits in a 1040px measure under the view title (critique: it had no centre of gravity). The decision is the heaviest thing on it: proposed titles are 17px 600 (the source sheet stays 14px), and the key legend sits right under the card. Below, "Up next" lists the next three items still to clarify (kind icon and title, 28px rows on `rule` hairlines, `ink-2`, the second and third in `ink-3`, stepped by tone rather than opacity so every row keeps AA; capped at 68ch) with "and N more" beside the heading, so the queue is felt without competing. Clarifying by hand, the first action starts as the capture's own words; until it is rewritten it is drawn as raw material (`ink-2`, 500) with a 12px prompt under its chips, "Rewrite as a next action, verb first: what is the very next thing you'd do?", and focusing it selects it so typing replaces it.

Notes fields in the detail pane (and reference notes in Clarify) size themselves to their text: at least four lines, growing as you type up to min(60vh, 640px), then scrolling inside; no drag handle. Notes take a little Markdown, drawn as it is typed and stored as plain text (owner's request: no formatting bar; formatting comes only from what is typed): `*word*` or `**word**` is bold, with the asterisks kept in `ink-3`; a paragraph starting `- ` is a list item whose dash is drawn as a 5px `ink-2` bullet, and `1. ` a numbered item with its number in `ink-3`. Enter in an item starts the next one (numbered on) and Enter on an empty item ends the list. Bold is drawn with a thin stroke, not a heavier weight, so no letter changes width and the caret and selection stay on the letters. An action's detail fields follow its kind (critique): a waiting item leads with Project, Waiting on, Follow up and Since, then the next-action fields (Context, Due, Start, Time, Energy, Repeat, Bring back); a next action keeps Project and Context first. Tab order follows. On touch screens every field value is 16px, text fields and picked values alike, so a pane reads at one size (16px keeps iOS from zooming into a focused field). In the detail pane, Files ends with a quiet "Attach a file · or drop one here" text button (13px `ink-2`, a paperclip), the mouse's way in beside ⌘O and dropping files on the pane. The Weekly Review's step title and what the step asks for read as one line (15px title, the note in `ink-2` after it), like a view title and its count.

### Motion
Motion is short, uses the out-expo ease (`cubic-bezier(0.16, 1, 0.3, 1)`), and every transition answers a user action. The values are: strike 200ms, then fold 180ms; flag drop 220ms; tick 220ms; picker pop 140ms, palette and help 160ms; scrim fade 120ms; a drop falling into the rail's pond (about 0.4s) and its rings dying out (about 3.5s), only on a new capture; status note 180ms; chevron 160ms. Under `prefers-reduced-motion: reduce`, all animations and transitions collapse to 1ms. Under reduced motion nothing slides, grows or springs, but changes of state still fade in 120ms (opacity and colour only), so what happened stays readable.

## Do's and Don'ts

### Do:
- **Do** reserve `accent` for focus rings and hairlines, and selection blue (`select`, with `select-ink` text) for the focused row, the highlighted option and focused chips.
- **Do** mark the open rail list by lifting it onto `sheet`, in the same type as every other entry. Areas are plain "#Name" text, never chips.
- **Do** show region focus on the focused element (selected row, ink cursor ring) and demote an inactive grid's cursor row to `rail-2`.
- **Do** show project health with the traffic-light lamp, and give every lamp `role="img"` with an `aria-label` and `title` that name its state.
- **Do** keep rows at 30px, body at 13px, and numerals tabular.
- **Do** set names in the condensed caps with 0.06–0.08em tracking, and everything readable at normal width.
- **Do** draw state as a mark: a red exclamation mark for important, a tick and line for done, a lamp for project health (red is stalled), a colour tile (@ or #) for contexts and areas.
- **Do** design both themes: water-grey white (`paper`, `sheet`) by day, slate by night, switched by `prefers-color-scheme`.
- **Do** honour `prefers-reduced-motion` for every animation and transition.

### Don't:
- **Don't** paint a pane or region blue to show it has focus.
- **Don't** change the face, size or colour of the open rail list (no chip, no colour change). The owner found a different-looking current item jarring.
- **Don't** let a lamp's colour stand alone. A lamp without an accessible name is a defect. Don't add a STALLED badge beside a red lamp: the lamp says it.
- **Don't** use green (`go`) or amber (`wait`) anywhere but project-health lamps, and don't fill rows, tags or chips with lamp colours.
- **Don't** bring back yellow as a fill, ring or tag tone. Amber exists only as the waiting lamp.
- **Don't** bring back the desk kit: no label tape, folders, rubber stamps, paper stacks, sheen, emboss or bevels (owner's decision).
- **Don't** let a neutral drift into a colour: if a grey reads as blue, pull it back.
- **Don't** use alert red decoratively.
- **Don't** fill rows, cells or chips with context colours.
- **Don't** print key hints on controls, lists or empty states. Keys are discovered through ⌘K and ⇧?. The pinned exceptions are the rail key legends, "⌘Z undo" on toast notes, the single Key Hints line at the foot of Clarify, the Weekly Review, Settings and the focused detail pane (Label Caps 12px `ink-3`, small key caps, 18px gaps between entries rather than dots, a `rule` hairline above; in every detail pane each field's own key sits as a 10px key cap beside its label while the pane has focus, the same way in every pane: the heading field (Subject, Project, Stuff, Title) shows F2, every notes field N (which jumps into it), each picker field its letter (a reference's Project is P, as on an action), Files ⌘O and a project's Actions T and W; the line keeps only the keys that belong to no field (Esc Close, and an Inbox item's V File as and K Clarify), and never repeats a key shown on a field), and the Key Choices list on a stopped Clarify (a key cap, then the action in 13px `ink`).
- **Don't** add paper texture, airy card layouts or large radii. Density beats decoration.
