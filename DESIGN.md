---
name: In-Tray & Tickler
description: David Allen's paper desk kit turned into a dense keyboard grid.
colors:
  paper: "#f3f5f6"
  sheet: "#fbfcfd"
  ink: "#17181a"
  ink-2: "#474c52"
  ink-3: "#686d74"
  rule: "#dcdedb"
  rule-strong: "#bcc0bd"
  steel: "#dde0df"
  steel-2: "#cdd1d0"
  steel-ink: "#2b2e32"
  folder: "#a9bedb"
  folder-2: "#e6edf7"
  folder-ink: "#1d3456"
  tape: "#1b2a41"
  tape-ink: "#f2f5fa"
  accent: "#1f5fcc"
  accent-contrast: "#ffffff"
  select: "#d9e6fa"
  select-ink: "#0f1b30"
  go: "#1f8a4c"
  wait: "#c7890a"
  tick: "#e2e7eb"
  stamp: "#b3301c"
  pen: "#1b2340"
  shade-on-select: "rgb(0 0 0 / 0.12)"
  cap-edge-on-select: "rgb(0 0 0 / 0.35)"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 650
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  body-sheet:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label-tape:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.07em"
  label-tape-md:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.07em"
  label-caps:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.08em"
  numeral:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
  numeral-lg:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
  numeral-sm:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1
rounded:
  tape: "1.5px"
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
  tape:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.tape-ink}"
    typography: "{typography.label-tape}"
    rounded: "{rounded.tape}"
    padding: "3px 7px"
  tape-md:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.tape-ink}"
    typography: "{typography.label-tape-md}"
    rounded: "{rounded.tape}"
    padding: "4px 9px"
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
    backgroundColor: "{colors.steel-2}"
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
  folder-tab:
    backgroundColor: "{colors.folder-2}"
    textColor: "{colors.folder-ink}"
    height: "34px"
    padding: "0 8px"
  rail:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.steel-ink}"
    width: "212px"
    padding: "14px 10px"
  rail-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 10px"
  rail-item-hover:
    backgroundColor: "{colors.steel-2}"
  rail-item-current:
    backgroundColor: "{colors.paper}"
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
    backgroundColor: "{colors.stamp}"
    rounded: "{rounded.round}"
    size: "10px"
  lamp-done:
    backgroundColor: "{colors.ink-3}"
    rounded: "{rounded.round}"
    size: "10px"
  stamp:
    textColor: "{colors.stamp}"
    rounded: "{rounded.xs}"
    padding: "2px 4px 1px"
  detail-pane:
    backgroundColor: "{colors.sheet}"
    width: "380px"
    padding: "14px 16px 40px"
  toast:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.tape-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
---

# Design System: In-Tray & Tickler

## Overview

**Creative North Star: "The Desk Kit Grid"**

The app is a GTD paper desk kit rebuilt as a keyboard grid. The Inbox is a solid desk letter tray in the folder blues; plain sheets of paper pile up in it as the count grows. Projects and groups are blue-grey folders. Lists, projects and areas carry label-maker tape. Done is a pen stroke. Flagged-for-today is a hand-drawn pen circle. Project health is a small traffic-light lamp. The metaphor lives in colour, condensed caps and a handful of drawn marks, never in paper texture, so density always wins. Rows are 30px, the body type is 13px, and a 1440 viewport holds more than twenty working rows.

The ground is cool office white and the ink is near-black. Steel grey carries the rail, rules and secondary text. Blue-grey appears only on folder surfaces, and label tape is navy. One corporate blue accent marks focus: input and `:focus-visible` rings, the hairline around the selected row and the current Clarify cell. A pale blue selection fill marks where the owner is. Rubber-stamp red is kept for states that need attention, and green and amber join it only as project-health lamps. The dark theme is a graphite desk at night. It keeps every role and follows `prefers-color-scheme`.

The build rejects the category default of an airy sidebar and rounded cards. Surfaces are flat, corners stay between 1.5 and 5px, and elevation is used only for things that float above the grid.

**Key Characteristics:**
- Dense, keyboard-driven grid: 30px rows, 13px system type, tabular numerals everywhere.
- Label-maker tape (Barlow Condensed caps on navy) names lists, projects, areas and page sections.
- One corporate blue accent plus a pale blue selection fill, used only to show position and focus.
- Physical marks are drawn, not textured: pen circle, pen strike, rubber stamp, traffic-light lamp.
- Everything is flat, the in-tray included: it is a line drawing in the same 1px rules and folder blues as the rest of the UI.
- Light office-white and graphite-dark themes, both designed in their own right.

## Colors

The palette is office stationery: cool paper, near-black ink, steel furniture, blue-grey folders, navy label tape, one corporate blue, and traffic-light lamps for project health.

### Primary
- **Corporate Blue** (`accent`): the single accent. It forms the 2px focus ring on inputs, pickers, proposal rows and `:focus-visible`, the 1px hairline (45% mix) around the focused grid row, the 2px ring on a ticked row that is also focused, the inner ring on a focused folder tab, and the current Clarify track cell. Dark theme value: #5b95f5.
- **Accent Contrast** (`accent-contrast`): text on a solid accent fill. Dark: #0b1426.
- **Selection Blue** (`select`, `select-ink`): the pale blue fill that says "you are here": the focused row in the active grid, the highlighted picker or palette option, a focused mini-row in the detail pane and a focused proposal field chip. Text, markers, stamps, dates and energy bars on it switch to `select-ink`. Dark: #1f3a63 / #eef3fb.

### Secondary
- **Folder Blue-Grey** (`folder`, `folder-2`, `folder-ink`): folder surfaces only. Used for group heads that are projects, the collar around their tape and the proposed-project block in Clarify. The mid blue-grey (`folder`) is the edge and collar, the pale face (`folder-2`) is the band, and the dark navy (`folder-ink`) is the text on it. Dark: #3e5a83 / #1b2433 / #c9d8ef.
- **Label Tape** (`tape`, `tape-ink`): navy tape with off-white caps. Used for list, project, area and page-section labels, the current Weekly Review step and the sign-in button. Dark: #2a3d5c / #e8eef8 (lifted so tape stays visible on the graphite page).

### Tertiary
- **Rubber-Stamp Red** (`stamp`): a state colour only. Used for overdue dates, stalled projects (stamp and red lamp), the Chase label and dashed chase ring, review-overdue age, warning facts and error notes. Dark theme value: #ec6d57.
- **Go Green** (`go`) and **Wait Amber** (`wait`): project-health lamp colours only. Green means the project has a next action; amber means it is only waiting on others. Dark: #3dba72 / #e2a634.
- **Pen Navy** (`pen`): the hand-drawn marks: flag circle, done tick and the strike through a subject. Dark theme value: #e3dccb (pale pencil).

### Neutral
- **Office Paper** (`paper`): the app ground, the grid head, field wells and the open rail entry. Dark: #16171a.
- **Fresh Sheet** (`sheet`): raised surfaces: detail pane, pickers, palette, capture input and the Clarify source sheet. Dark: #1c1d21.
- **Ink** (`ink`, `ink-2`, `ink-3`): primary text, secondary text (projects, column heads, meta), and tertiary text (placeholders, dashes, hints, the done lamp). Dark: #eae8e1 / #b9bbbd / #93979c.
- **Rules** (`rule`, `rule-strong`): row dividers and pane borders; grid-head underline, group underline and input borders.
- **Steel** (`steel`, `steel-2`, `steel-ink`): the rail, rail hover, and the focused row when its grid is not the active region. Dark: #202226 / #2c2f35 / #d6d7d6.
- **Tick Grey** (`tick`): multi-selected (ticked) rows.

### Named Rules
**The One Blue Rule.** Blue means focus and position. The corporate blue (`accent`) draws rings and hairlines; the pale selection blue (`select`) fills the focused row, the highlighted option and focused chips. Neither is used for decoration, headings or tape. Region focus is shown on the focused element itself, never by painting a pane. A grid that loses region focus keeps its cursor row in steel (`steel-2`), not blue.

**The Stamp Means Trouble Rule.** Stamp red is semantic only: overdue, stalled, chase, errors. It is never decoration and never a brand colour. When the stamp shape marks a neutral status (Someday, Done), it switches to `ink-3`.

**The Traffic Light Rule.** Green (`go`), amber (`wait`) and red (`stamp`) together mean project health and nothing else. Green and amber appear only in lamps. Colour never carries health alone: every lamp names its state in an `aria-label` and `title`, and a stalled project also carries the STALLED stamp.

**The Context Code Rule.** Each context has its own colour, and that colour appears only as a 2px underline under the context name in a row's context cell (offset 4px). Context group labels stay plain ink with no underline. Context colours never fill rows, cells or chips, and the context palette holds no red and no green (blue, slate, sienna, ochre, violet, teal, plum, olive): red means trouble and green means on track.

## Typography

**Display / Label Font:** Barlow Condensed 600 and 700 (with Arial Narrow, Helvetica Neue), self-hosted via @fontsource.
**Body Font:** the system UI stack (-apple-system, SF Pro Text, Segoe UI, system-ui).

**Character:** A neutral system face does the reading. A condensed label face, always in uppercase with tracking, does the naming: the label-maker's voice. Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on body).

### Hierarchy
- **Headline** (650, 19px, -0.01em): the view title ("Next Actions"), followed by a plain `ink-2` count.
- **Title** (600, 15px): the item title field in the detail pane and empty-state titles. Clarify proposal titles use 600/14px.
- **Body** (400, 13px, 1.4): rows, fields, rail, detail text. Strong subjects use 600.
- **Body Sheet** (400, 14px, 1.55, max 68ch): the captured text on the Clarify source sheet.
- **Body Small** (400, 12px): meta, counts, file sizes, and toast notes.
- **Label Tape** (Barlow 600, 11.5px or 14px, 0.07em, uppercase, line-height 1): tape only.
- **Label Caps** (Barlow 600, 12–13px, 0.06–0.08em, uppercase, `ink-2` or `ink-3`): column heads, pane and detail section heads, field labels, plain group labels, review steps and picker titles. Review steps are `ink-3`; a finished step (visited, nothing open) is `ink-2` with the pen strike; an open step carries its count in 12px 650 `stamp`.
- **Numeral** (Barlow 700, 30px; 40px for the review's big count; 22px in the mobile strip): the in-tray count and the review tallies.

### Named Rules
**The Two Voices Rule.** Condensed caps name things, and the system face says things. Barlow never sets a sentence or an editable value. The system face is never tracked out into caps.

## Layout

The desktop layout is a two-column app grid: a 212px steel rail and a fluid main column, running the full height of the window (there is no status bar). The main column stacks a 44px top bar (capture line flexing to fill, with a 220px search that widens to 320px when open) and a view head (16px 20px 8px). Below that, the work area holds the scrolling list region (20px side padding) and, when opened, a 380px detail pane on the right.

The grid uses CSS grid columns set per view through `--cols`: a 30px marker column, a `minmax(220px, 1fr)` subject, then fixed data columns (context 112px, due 84px, start 80px, time 52px right-aligned, energy). Cells pad 8px horizontally. The grid head is sticky, 28px tall, and underlined in `rule-strong`. Plain group heads are 32px with 10px above. Folder group heads are 34px with 18px above; the tape is lifted 6px as a tab and the chevron and count sit on its centre line. When the list gets narrow (for instance beside the detail pane at 1024px) it sheds its least useful columns in a fixed order (start, energy, time, project on Next Actions; open, area, next action on Projects; since, project on Waiting For) instead of scrolling sideways; the grid never goes below 320px.

The spacing rhythm is small and even: 4, 6, 8, 10, 14, 16, 20px. Gaps inside controls are 6–8px, and pane padding is 14–16px.

Below 820px the rail becomes a horizontal, scrolling strip. The tray drawing is hidden and the count shrinks to 22px. Search collapses to a 36px button. The grid drops to marker, subject and one date column. The detail pane becomes a fixed bottom sheet 72dvh tall at the foot of the screen, and Clarify's two panes stack into one column.

## Elevation & Depth

The system is flat. Depth comes from tone: paper, sheet and steel. Shadows are kept for three jobs: the thin drop under tape, the paper-stack edge of the Clarify sheet, and things that float (pickers, palette, help, the filed-capture list and the mobile detail sheet).

### Shadow Vocabulary
- **Tape drop** (`box-shadow: 0 1px 1.5px rgb(0 0 0 / 0.28)`): under every piece of tape and the current review step. On folder tabs it is paired with a 3px flat `folder` collar (`0 0 0 3px var(--folder)`).
- **Float** (`--shadow: 0 10px 28px rgb(20 22 26 / 0.16), 0 2px 5px rgb(20 22 26 / 0.08)`; dark `0 12px 32px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.35)`): pickers, palette, help, open capture, and the mobile detail sheet.
- **Sheet stack** (`0 1px 0 rule, 0 3px 0 -1px sheet, 0 4px 0 -1px rule, 0 6px 12px -6px rgb(0 0 0 / 0.15)`): the Clarify source sheet, drawn as a stack of paper edges.
- **Focus ring** (`0 0 0 2px var(--accent)` with a border moving to `ink`): text inputs, pickers and proposal rows. Region-focus cursors in the rail and on group heads use an inset 2px `ink` ring instead.

### Named Rules
**The Flat Tape Rule.** Tape and folder surfaces are flat colour: no sheen gradients, no text-shadow emboss, no bevels. Their physical feel comes from colour, condensed caps, tracking and the soft 0 1px 1.5px drop only.

## Shapes

Corners are nearly square and scale with the object: tape at 1.5px (1px on folder tabs), wells, stamps and file previews at 2px, inputs, fields, rail items and proposal rows at 3px, pickers and the tray at 4px, and the palette and help overlays at 5px. The rounded forms are the two-minute badge (10px pill, dashed at rest, solid ink when on) and the 10px circular project lamp. Drawn marks carry the hand: the flag is an open, overshooting pen loop around a 4.2px ring; done is a 1.5px pen tick and strike; the in-tray is drawn flat with the same 1px lines. Stamps are an outlined 1.5px box set straight.

## Components

### Label Tape
Navy tape with condensed, tracked caps. Two sizes: sm (11.5px, 3px 7px) and md (14px, 4px 9px). There is one tone: navy. Tape names folder tabs, areas, page-level sections (Settings sections, help title, Clarify end states) and the in-tray. The rail uses tape only for the in-tray label; list names are plain text.

### Rail (Navigation)
- **Style:** steel drawer, 212px, 14px 10px padding, with a `steel-2` right edge. The in-tray sits at the top with its tape label, 30px count and the tray drawing (up to 176px wide). The tray is a line drawing in the app's own rule language (owner's decision, after a Mojave acrylic icon, a straight-on wire tray and a see-through outline tray were each rejected: too glossy, "a crate", and transparent-looking).
  - **The object:** a solid desk letter tray in three-quarter view: a straight back wall, straight sides running down to the front, and a low front lip with a rounded finger notch. It is opaque (owner's decision: a tray that looks see-through but hides the paper makes no sense). Fills come from the folder blues of the project tabs: back wall `folder-2`, floor and inner side walls a mix of `folder` into `folder-2`, the front lip `folder`. Lines are `folder-ink`, non-scaling and whole-pixel so they stay crisp on 1x screens, in two weights: the silhouette (back rim, side rims, front lip) is 2px; the inner edges (the back wall's corners and where the walls meet the floor, which the paper lies over) are 1px. No gradients, shadows, label or text.
  - **What is in it:** plain paper only (owner's decision: no sticky notes, envelopes or photos). Every inbox item adds one sheet lying in the tray: a `sheet` top face with a 1px `ink-3` outline and a thin front edge in `rule-strong`, so the pile's front shows as a stack of page edges. The sheets shuffle slightly, and the newest sits a little askew on top. The top sheet is written on: a heading stroke in 1.75px `pen`, then five rows of 1px `ink-3` text lines whose lengths vary (short lines end paragraphs). The pattern is seeded by the inbox count, so each capture shows a different page on top. The last 20 sheets are drawn.
  - **Growth:** each sheet raises the pile; a busy inbox heaps up to just under the back wall and never over the walls. Positions come from each sheet's place in the pile, so a new capture never reshuffles the rest.
  - **Colour:** theme tokens only, so the tray follows light and dark mode like every other surface.
- **Structure:** the in-tray (navy tape, count, letter tray) sits on top. Below it are two sections under condensed-caps `ink-2` headings, "Organize" (Next Actions, Projects, Waiting For, Someday/Maybe, Reference) and "Reflect" (Weekly Review, Done, Areas). Settings is pinned to the bottom.
- **States:** every entry uses the same row: 13px, 500-weight `ink-2` text and a right-aligned `ink-2` count (`ink-3` on `steel` fails AA at 12px), 30px tall. The open list is the sheet pulled forward out of the drawer: `paper` background, `ink` text at 650 and a soft 0 1px 1.5px lift, with no tape and no change of face, size or colour. The in-tray gets the same lift when the Inbox is open. Hover fills `steel-2`. The keyboard cursor, when the rail is the active region, is an inset 2px `ink` ring on `steel-2`. Stalled projects show a tiny stamp. Review age turns stamp red after 7 days or "never".
- **Mobile:** a horizontal scrolling strip.

### Grid Rows (Signature)
- **Row:** 30px tall with a `rule` bottom divider. Hover is a 45% steel wash.
- **Focus:** the focused row in the active grid fills with selection blue (`select`) inside a 1px corporate-blue hairline. Markers, stamps, overdue dates and energy bars switch to `select-ink` so they stay legible; an overdue date on the focused row keeps a 2px underline. In an inactive grid the cursor row is `steel-2`. Ticked (multi-selected) rows are `tick`. A ticked row that is also focused gets an inset 2px `accent` ring.
- **Marker:** a 22px cell holding a thin ring. When flagged the ring is inked in `pen` and circled by a loose pen loop (overshooting its start with a visible tail) that draws in over 380ms, and the row's subject turns 600 weight; the mark is `role="img"`, labelled "Flagged for today". When done it shows a pen tick. A chase item has a dashed stamp-red ring. Project rows carry a lamp in this column instead.
- **Done:** a 1.5px pen line draws through the subject (200ms), then the row folds away (180ms, fade and 8px slide). Done rows at rest use a `ink-3` line-through.
- **Cells:** context is a 2px coloured underline code. Dates are ink; overdue dates are stamp red at 650 weight; due-soon dates are 650 weight. Energy is three 5×12px bars filled `ink-3`/`ink-2`/`ink` by level. Chase items carry a stamp-red condensed "CHASE …" label.
- **Inline edit:** a 24px sheet field with an ink border and a 2px `select-ink` ring, set inside the selected row.

### Project Lamp
A 10px circle (50% radius, 6px left margin) with a 1px inset edge mixed 70% toward black. Green (`go`): the project has a next action. Amber (`wait`): it is only waiting on others. Red (`stamp`): stalled. Hollow (1.5px `ink-3` ring, no fill): someday. Dimmed grey (`ink-3` at 60% opacity): done. It sits in the marker column of project rows in Projects, Someday/Maybe and the Weekly Review, and at the start of the project detail header. Each lamp is `role="img"` with an `aria-label` and `title` naming the state ("On track: has a next action", "Waiting: only waiting on others", "Stalled: no next action", "Someday / Maybe", "Completed").

### Folder Tabs (Group Heads)
Project groups are blue-grey folders: a 34px `folder-2` band with a `folder` top edge and the project's navy tape raised 9px above the band in a 5px `folder` collar. The count is `folder-ink`, and a chevron (rotating over 160ms) collapses the group; chevron and count ride at the lifted tape's height. Non-project groups (contexts, waiting on, due dates, Someday sections, search results) are plain: 32px Label Caps over a `rule-strong` line, with an `ink-3` count and no band, tab or tape (the owner removed the band after the second critique: the folder surface belongs to projects, and blue belongs to where you are). A group can carry a quiet 12px `ink-3` note on the right, e.g. why an empty Settings group is empty. Between groups there is exactly one row's height (`--row`, 30px) of empty space above each following group header. The first group under the column header keeps its smaller top margin. Group focus matches row focus: in the active grid the head fills selection blue (`select`) inside a 1px `accent` hairline (a folder band, already pale blue, deepens to `accent` 22% into `folder-2` so the cursor still shows); in an inactive grid it gets a 1px `ink-3` hairline. The detail pane, when it holds focus itself, shows the same 1px `accent` hairline around the pane, never a painted header.

### Inputs / Fields
- **Capture line:** sheet background, 1px `rule-strong` border, 3px radius, 30px minimum, grows to 160px. On focus the border turns ink with a 2px blue ring. When open it adds the float shadow.
- **Search:** a 30px, `rule`-bordered well at 220px. When open it widens to 320px with an ink border, blue ring and sheet fill.
- **Detail fields:** paper wells (`rule` border, 3px) that turn into a sheet with an ink border and blue ring on focus. Picker fields are 28px. Project notes are ruled like a notepad (19.5px line pitch).
- **Labels:** Label Caps 11.5px in `ink-3`.

### Pickers, Palette, Help
The picker is a 300px sheet card (4px radius, float shadow, 8px padding) that pops in over 140ms (fade plus 4px rise). Its input is permanently ink-bordered with a blue ring. Options are 28px rows, and the highlighted option fills selection blue with `select-ink` text. The ⌘K palette (640px, 38px input, 160ms pop) and the ⇧? help overlay (1120px, four columns) share the treatment over a 30% dark scrim (120ms fade). These two overlays are the only places key caps (`.kbd`: sheet fill, `rule-strong` border with a 2px bottom) are shown.

### Detail Pane
A 380px sheet on the right, opened with Enter. It has a 36px bar with a Label Caps title, 14px 16px body padding and 14px section gaps. Section heads are Label Caps with `ink-3` counts. A project's header starts with its lamp. Nested action lists use 28px mini-rows that fill selection blue on focus.

### Rubber Stamp
An outlined condensed-caps mark: Barlow 700 11px, 0.1em tracking, 1.5px currentColor border, 2px radius. It is always upright. It is red for Stalled and `ink-3` for neutral statuses (Someday, Done). On a selected row it switches to `select-ink`.

### Toast
There is no status bar; the owner removed it because standing facts (Claude ready, flagged, deferred) added nothing. Standing facts belong in the view count instead ("12 actions · 1 deferred"), and Claude's connection is shown in Settings. Action feedback appears only when something happens: a navy (`tape`) toast with `tape-ink` text, 5px radius and the float shadow, centred 18px above the bottom edge. It rises in over 180ms, stays for 5 seconds (12 seconds for errors) and fades out. An undoable note ends with the "⌘Z undo" suffix. Errors turn the toast stamp red with white 600-weight text. It never takes clicks and is announced politely to screen readers.

### Clarify
The captured item is shown as a Fresh Sheet with the paper-stack shadow, beside proposal rows: sheet cards with a 1px `rule` border and 3px radius that take the blue focus ring through `:focus-within`. Focused field chips fill selection blue. A proposed project sits in a `folder-2` block with a 2px `folder` top edge. Progress is a track of 14×5px cells: `rule` pending, `rule-strong` ready, `ink-2` done, and corporate blue with a 1px `select-ink` hairline for the current item.

### Motion
Motion is short, uses the out-expo ease (`cubic-bezier(0.16, 1, 0.3, 1)`), and every transition answers a user action. The values are: strike 200ms, then fold 180ms; pen loop 380ms; tick 220ms; picker pop 140ms, palette and help 160ms; scrim fade 120ms; sheet drop into the tray 280ms, staggered 20ms per sheet; status note 180ms; chevron 160ms. Under `prefers-reduced-motion: reduce`, all animations and transitions collapse to 1ms.

## Do's and Don'ts

### Do:
- **Do** reserve corporate blue (`accent`) for focus rings and hairlines, and selection blue (`select`, with `select-ink` text) for the focused row, the highlighted option and focused chips.
- **Do** mark the open rail list by lifting it onto paper, in the same type as every other entry. Folder tabs, areas and page-level section labels carry navy tape.
- **Do** show region focus on the focused element (selected row, ink cursor ring) and demote an inactive grid's cursor row to `steel-2`.
- **Do** show project health with the traffic-light lamp, and give every lamp `role="img"` with an `aria-label` and `title` that name its state.
- **Do** pair a red lamp with the STALLED stamp wherever a stalled project is listed or opened.
- **Do** keep rows at 30px, body at 13px, and numerals tabular.
- **Do** set names in Barlow Condensed caps with 0.06–0.08em tracking, and everything readable in the system face.
- **Do** draw state as a mark: pen circle for flagged, pen strike for done, upright stamp for stalled, a lamp for project health, a 2px underline for context.
- **Do** design both themes: office white (`paper`, `sheet`) by day, graphite by night, switched by `prefers-color-scheme`.
- **Do** honour `prefers-reduced-motion` for every animation and transition.

### Don't:
- **Don't** paint a pane or region blue to show it has focus.
- **Don't** change the face, size or colour of the open rail list (no tape, no colour change). The owner found a different-looking current item jarring.
- **Don't** let a lamp's colour stand alone. A lamp without an accessible name, or a stalled project without its stamp, is a defect.
- **Don't** use green (`go`) or amber (`wait`) anywhere but project-health lamps, and don't fill rows, tape or chips with lamp colours.
- **Don't** bring back yellow as a fill, ring or tape tone. Amber exists only as the waiting lamp.
- **Don't** add sheen gradients, text-shadow emboss or bevels to tape or folders. The only lift is `0 1px 1.5px rgb(0 0 0 / 0.28)`.
- **Don't** use stamp red decoratively, and don't rotate stamps.
- **Don't** fill rows, cells or chips with context colours.
- **Don't** print key hints on controls, lists or empty states. Keys are discovered through ⌘K and ⇧?. The pinned exceptions are "⌘Z undo" on toast notes, the single Key Hints line at the foot of Clarify, the Weekly Review and the focused detail pane (Label Caps 12px `ink-3`, small key caps, `rule-strong` dots between entries, a `rule` hairline above), and the Key Choices list on a stopped Clarify (a key cap, then the action in 13px `ink`).
- **Don't** add paper texture, airy card layouts or large radii. Density beats decoration.
