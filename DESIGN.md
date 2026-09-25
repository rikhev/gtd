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
  manila: "#d9b86b"
  manila-2: "#f1e3bd"
  manila-ink: "#4a3a12"
  tape: "#151515"
  tape-ink: "#f3f3ee"
  accent: "#f6d21b"
  accent-ink: "#141414"
  tick: "#e2e7eb"
  stamp: "#b3301c"
  pen: "#1b2340"
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
rounded:
  tape: "1.5px"
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "5px"
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
  tape-yellow:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label-tape}"
    rounded: "{rounded.tape}"
    padding: "3px 7px"
  grid-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "30px"
    padding: "0 8px"
  grid-row-focus:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
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
    backgroundColor: "{colors.manila-2}"
    textColor: "{colors.manila-ink}"
    height: "34px"
    padding: "0 8px"
  rail:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.steel-ink}"
    width: "212px"
    padding: "14px 10px"
  rail-item:
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 8px"
  rail-item-hover:
    backgroundColor: "{colors.steel-2}"
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
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.xs}"
    height: "28px"
    padding: "0 8px"
  stamp:
    textColor: "{colors.stamp}"
    rounded: "{rounded.xs}"
    padding: "2px 4px 1px"
  detail-pane:
    backgroundColor: "{colors.sheet}"
    width: "380px"
    padding: "14px 16px 40px"
  status-line:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.steel-ink}"
    typography: "{typography.body-small}"
    height: "26px"
    padding: "0 14px"
---

# Design System: In-Tray & Tickler

## Overview

**Creative North Star: "The Desk Kit Grid"**

The app is a GTD paper desk kit rebuilt as a keyboard grid. The Inbox is a wire in-tray whose stacked sheet edges scale with the count. Projects and groups are manila folders. Lists, projects and areas carry label-maker tape. Done is a pen stroke. Flagged-for-today is a hand-drawn pen circle. The metaphor lives in colour, condensed caps and a handful of drawn marks, never in paper texture, so density always wins. Rows are 30px, the body type is 13px, and a 1440 viewport holds more than twenty working rows.

The ground is cool office white and the ink is near-black. Steel grey carries the rail, the status line, rules and secondary text. Manila appears only on folder surfaces. One label-yellow accent marks where the owner is: the focused row, the active control, the current list and input focus rings. Rubber-stamp red is kept for states that need attention. The dark theme is a graphite desk at night. It keeps every role and follows `prefers-color-scheme`.

The build rejects the category default of an airy sidebar, rounded cards and a blue accent. Surfaces are flat, corners stay between 1.5 and 5px, and elevation is used only for things that float above the grid.

**Key Characteristics:**
- Dense, keyboard-driven grid: 30px rows, 13px system type, tabular numerals everywhere.
- Label-maker tape (Barlow Condensed caps on black) names lists, projects, areas and page sections.
- One yellow accent, used only to show position and focus.
- Physical marks are drawn, not textured: pen circle, pen strike, wire tray, rubber stamp.
- Light office-white and graphite-dark themes, both designed in their own right.

## Colors

The palette is office stationery: cool paper, near-black ink, steel furniture, manila folders, black label tape, and one yellow label.

### Primary
- **Label Yellow** (`accent`): the single accent. It fills the focused grid row, the highlighted picker or palette option, the current rail list's tape and the current Clarify track cell. It also forms the 2px focus ring on inputs and `:focus-visible`. Text on it is always Accent Ink (`accent-ink`). Dark theme value: #f2cf2a.

### Secondary
- **Manila** (`manila`, `manila-2`, `manila-ink`): folder surfaces only. Used for group headers that are projects, the collar around their tape, the proposed-project block in Clarify and the project dot. Tan (`manila`) is the edge, pale manila (`manila-2`) is the face, and dark brown (`manila-ink`) is the text on it.
- **Label Tape** (`tape`, `tape-ink`): black tape with off-white caps. Used for list, project, area and page-section labels and for the current Weekly Review step.

### Tertiary
- **Rubber-Stamp Red** (`stamp`): a state colour only. Used for overdue dates, stalled projects, the Chase label and dashed chase ring, review-overdue age, warning facts and error notes. Dark theme value: #ec6d57.
- **Pen Navy** (`pen`): the hand-drawn marks: flag circle, done tick and the strike through a subject. Dark theme value: #e3dccb (pale pencil).

### Neutral
- **Office Paper** (`paper`): the app ground, the grid head and field wells. Dark: #16171a.
- **Fresh Sheet** (`sheet`): raised surfaces: detail pane, pickers, palette, capture input and the Clarify source sheet. Dark: #1c1d21.
- **Ink** (`ink`, `ink-2`, `ink-3`): primary text, secondary text (projects, column heads, meta), and tertiary text (placeholders, dashes, hints). Dark: #eae8e1 / #b9bbbd / #93979c.
- **Rules** (`rule`, `rule-strong`): row dividers and pane borders; grid-head underline, group underline and input borders.
- **Steel** (`steel`, `steel-2`, `steel-ink`): the rail and status line, rail hover, and the focused row when its grid is not the active region. Dark: #202226 / #2c2f35 / #d6d7d6.
- **Tick Grey** (`tick`): multi-selected (ticked) rows.

### Named Rules
**The One Label Rule.** Label yellow means "you are here". It is reserved for the focused row, the active control, the current list and input focus rings. Region focus is shown on the focused element itself, never by painting a pane. A grid that loses region focus keeps its cursor row in steel (`steel-2`), not yellow.

**The Stamp Means Trouble Rule.** Stamp red is semantic only: overdue, stalled, chase, errors. It is never decoration and never a brand colour. When the stamp shape marks a neutral status (Someday, Done), it switches to `ink-3`.

**The Context Code Rule.** Each context has its own colour, and that colour appears only as a 2px underline under the context name (offset 4px). Context colours never fill rows, cells or chips.

## Typography

**Display / Label Font:** Barlow Condensed 600 and 700 (with Arial Narrow, Helvetica Neue), self-hosted via @fontsource.
**Body Font:** the system UI stack (-apple-system, SF Pro Text, Segoe UI, system-ui).

**Character:** A neutral system face does the reading. A condensed label face, always in uppercase with tracking, does the naming: the label-maker's voice. Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on body).

### Hierarchy
- **Headline** (650, 19px, -0.01em): the view title ("Next Actions"), followed by a plain `ink-2` count.
- **Title** (600, 15px): the item title field in the detail pane and empty-state titles. Clarify proposal titles use 600/14px.
- **Body** (400, 13px, 1.4): rows, fields, rail, detail text. Strong subjects use 600.
- **Body Sheet** (400, 14px, 1.55, max 68ch): the captured text on the Clarify source sheet.
- **Body Small** (400, 12px): meta, counts, file sizes, and the status line.
- **Label Tape** (Barlow 600, 11.5px or 14px, 0.07em, uppercase, line-height 1): tape only.
- **Label Caps** (Barlow 600, 12–13px, 0.06–0.08em, uppercase, `ink-2` or `ink-3`): column heads, pane and detail section heads, field labels, plain group labels, review steps and picker titles.
- **Numeral** (Barlow 700, 30px; 40px for the review's big count; 22px in the mobile strip): the in-tray count and the review tallies.

### Named Rules
**The Two Voices Rule.** Condensed caps name things, and the system face says things. Barlow never sets a sentence or an editable value. The system face is never tracked out into caps.

## Layout

The desktop layout is a two-column app grid: a 212px steel rail and a fluid main column, above a 26px status line spanning both. The main column stacks a 44px top bar (capture line flexing to fill, with a 220px search that widens to 320px when open) and a view head (16px 20px 8px). Below that, the work area holds the scrolling list region (20px side padding) and, when opened, a 380px detail pane on the right.

The grid uses CSS grid columns set per view through `--cols`: a 30px marker column, a `minmax(220px, 1fr)` subject, then fixed data columns (context 112px, due 84px, start 80px, time 52px right-aligned, energy). Cells pad 8px horizontally. The grid head is sticky, 28px tall, and underlined in `rule-strong`. Plain group heads are 32px with 10px above. Folder group heads are 34px with 18px above.

The spacing rhythm is small and even: 4, 6, 8, 10, 14, 16, 20px. Gaps inside controls are 6–8px, and pane padding is 14–16px.

Below 820px the rail becomes a horizontal, scrolling strip. The tray drawing is hidden and the count shrinks to 22px. Search collapses to a 36px button. The grid drops to marker, subject and one date column. The detail pane becomes a fixed bottom sheet 72dvh tall above the status line, and Clarify's two panes stack into one column.

## Elevation & Depth

The system is flat. Depth comes from tone: paper, sheet and steel. Shadows are kept for three jobs: the thin drop under tape, the paper-stack edge of the Clarify sheet, and things that float (pickers, palette, help, the filed-capture list and the mobile detail sheet).

### Shadow Vocabulary
- **Tape drop** (`box-shadow: 0 1px 1.5px rgb(0 0 0 / 0.28)`): under every piece of tape and the current review step. On folder tabs it is paired with a 5px flat `manila` collar (`0 0 0 5px var(--manila)`).
- **Float** (`--shadow: 0 10px 28px rgb(20 22 26 / 0.16), 0 2px 5px rgb(20 22 26 / 0.08)`; dark `0 12px 32px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.35)`): pickers, palette, help, open capture, and the mobile detail sheet.
- **Sheet stack** (`0 1px 0 rule, 0 3px 0 -1px sheet, 0 4px 0 -1px rule, 0 6px 12px -6px rgb(0 0 0 / 0.15)`): the Clarify source sheet, drawn as a stack of paper edges.
- **Focus ring** (`0 0 0 2px var(--accent)` with a border moving to `ink`): text inputs, pickers and proposal rows. Region-focus cursors in the rail and on group heads use an inset 2px `ink` ring instead.

### Named Rules
**The Flat Tape Rule.** Tape and folder surfaces are flat colour: no sheen gradients, no text-shadow emboss, no bevels. Their physical feel comes from colour, condensed caps, tracking and the soft 0 1px 1.5px drop only.

## Shapes

Corners are nearly square and scale with the object: tape at 1.5px (1px on folder tabs), wells, stamps and file previews at 2px, inputs, fields, rail items and proposal rows at 3px, pickers and the tray at 4px, and the palette and help overlays at 5px. The one rounded form is the two-minute badge (10px pill, dashed at rest, solid ink when on). Drawn marks carry the hand: the flag is an open, overshooting pen loop around a 4.2px ring; done is a 1.5px pen tick and strike; the tray is a wire basket with round caps. Stamps are an outlined 1.5px box set straight.

## Components

### Label Tape
Black tape with condensed, tracked caps. Two sizes: sm (11.5px, 3px 7px) and md (14px, 4px 9px). The only tones are black and yellow. Black tape names folder tabs, areas, page-level sections (Settings sections, help title, Clarify end states) and the in-tray. Yellow tape marks the current list in the rail.

### Rail (Navigation)
- **Style:** steel drawer, 212px, 14px 10px padding, with a `steel-2` right edge. The wire in-tray sits at the top with its tape label, 30px count and sheet-edge drawing (up to 9 sheets). Lists follow as 30px rows at 3px radius. Settings is set apart by a rule.
- **States:** the current list's name becomes yellow tape. Every other entry is plain 500-weight text with a right-aligned `ink-2` count. Hover fills `steel-2`. The keyboard cursor, when the rail is the active region, is an inset 2px `ink` ring on `steel-2`. Stalled projects show a tiny stamp. Review age turns stamp red after 7 days or "never".
- **Mobile:** a horizontal scrolling strip.

### Grid Rows (Signature)
- **Row:** 30px tall with a `rule` bottom divider. Hover is a 45% steel wash.
- **Focus:** the focused row in the active grid fills with label yellow. Secondary inks darken locally so meta text stays legible, and markers, stamps, dates and energy all switch to `accent-ink`. In an inactive grid the cursor row is `steel-2`. Ticked (multi-selected) rows are `tick`. A ticked row that is also focused gets an inset 2px `accent-ink` ring.
- **Marker:** a 22px cell holding a thin ring. When flagged it becomes a pen loop that draws in over 380ms. When done it shows a pen tick. A chase item has a dashed stamp-red ring.
- **Done:** a 1.5px pen line draws through the subject (200ms), then the row folds away (180ms, fade and 8px slide). Done rows at rest use a `ink-3` line-through.
- **Cells:** context is a 2px coloured underline code. Dates are ink; overdue dates are stamp red at 650 weight; due-soon dates are 650 weight. Energy is three 5×12px bars filled `ink-3`/`ink-2`/`ink` by level. Chase items carry a stamp-red condensed "CHASE …" label.
- **Inline edit:** a 24px sheet field with an ink border and a 2px `accent-ink` ring, set inside the yellow row.

### Folder Tabs (Group Heads)
Project groups are manila folders: a 34px `manila-2` band with a `manila` top edge and the project's black tape raised 9px above the band in a 5px manila collar. The count is `manila-ink`, and a chevron (rotating over 160ms) collapses the group. Non-project groups are plain 32px Label Caps over a `rule-strong` line. Group focus is an inset ink ring, plus an inner yellow ring when the grid is active.

### Inputs / Fields
- **Capture line:** sheet background, 1px `rule-strong` border, 3px radius, 30px minimum, grows to 160px. On focus the border turns ink with a 2px yellow ring. When open it adds the float shadow.
- **Search:** a 30px, `rule`-bordered well at 220px. When open it widens to 320px with an ink border, yellow ring and sheet fill.
- **Detail fields:** paper wells (`rule` border, 3px) that turn into a sheet with an ink border and yellow ring on focus. Picker fields are 28px. Project notes are ruled like a notepad (19.5px line pitch).
- **Labels:** Label Caps 11.5px in `ink-3`.

### Pickers, Palette, Help
The picker is a 300px sheet card (4px radius, float shadow, 8px padding) that pops in over 140ms (fade plus 4px rise). Its input is permanently ink-bordered with a yellow ring. Options are 28px rows, and the highlighted option fills yellow. The ⌘K palette (640px, 38px input, 160ms pop) and the ⇧? help overlay (1120px, four columns) share the treatment over a 30% dark scrim (120ms fade). These two overlays are the only places key caps (`.kbd`: sheet fill, `rule-strong` border with a 2px bottom) are shown.

### Detail Pane
A 380px sheet on the right, opened with Enter. It has a 36px bar with a Label Caps title, 14px 16px body padding and 14px section gaps. Section heads are Label Caps with `ink-3` counts. Nested action lists use 28px mini-rows that turn yellow on focus.

### Rubber Stamp
An outlined condensed-caps mark: Barlow 700 11px (10px tiny), 0.1em tracking, 1.5px currentColor border, 2px radius. It is always upright. It is red for Stalled and `ink-3` for neutral statuses (Someday, Done).

### Status Line
A 26px steel strip across the foot of the app. On the left, action notes rise in over 180ms. An undoable note ends with the "⌘Z undo" suffix. Errors switch the note to stamp red at 600 weight. On the right sit the standing facts (flagged, deferred, warnings in stamp red), hidden on mobile.

### Clarify
The captured item is shown as a Fresh Sheet with the paper-stack shadow, beside proposal rows: sheet cards with a 1px `rule` border and 3px radius that take the yellow focus ring through `:focus-within`. A proposed project sits in a manila block with a 2px manila top edge. Progress is a track of 14×5px cells: `rule` pending, `rule-strong` ready, `ink-2` done, and yellow with an ink hairline for the current item.

### Motion
Motion is short, uses the out-expo ease (`cubic-bezier(0.16, 1, 0.3, 1)`), and every transition answers a user action. The values are: strike 200ms, then fold 180ms; pen loop 380ms; tick 220ms; picker pop 140ms, palette and help 160ms; scrim fade 120ms; sheet drop into the tray 260ms, staggered 30ms per sheet; status note 180ms; chevron 160ms. Under `prefers-reduced-motion: reduce`, all animations and transitions collapse to 1ms.

## Do's and Don'ts

### Do:
- **Do** reserve label yellow (`accent`) for the focused row, the active control, the current list and input focus rings, with `accent-ink` text on it.
- **Do** tape only the current list in the rail (yellow). Folder tabs, areas and page-level section labels carry black tape.
- **Do** show region focus on the focused element (yellow row, ink cursor ring) and demote an inactive grid's cursor row to `steel-2`.
- **Do** keep rows at 30px, body at 13px, and numerals tabular.
- **Do** set names in Barlow Condensed caps with 0.06–0.08em tracking, and everything readable in the system face.
- **Do** draw state as a mark: pen circle for flagged, pen strike for done, upright stamp for stalled, a 2px underline for context.
- **Do** design both themes: office white (`paper`, `sheet`) by day, graphite by night, switched by `prefers-color-scheme`.
- **Do** honour `prefers-reduced-motion` for every animation and transition.

### Don't:
- **Don't** paint a pane or region yellow to show it has focus.
- **Don't** tape every rail entry. Tape marks position, and taping all of them drowns the signal.
- **Don't** add sheen gradients, text-shadow emboss or bevels to tape or folders. The only lift is `0 1px 1.5px rgb(0 0 0 / 0.28)`.
- **Don't** use stamp red decoratively, and don't rotate stamps.
- **Don't** fill rows, cells or chips with context colours.
- **Don't** print key hints on controls or in empty states. Keys are discovered through ⌘K and ⇧?; the only pinned exception is "⌘Z undo" on status-line action notes.
- **Don't** add paper texture, airy card layouts, large radii or a blue accent. Density beats decoration.
