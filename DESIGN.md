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
  label-tag:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "11.5px"
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

Rows are 30px, the body type is 13px, and a 1440 viewport holds more than twenty working rows. Flagged-for-today is a red flag, as in classic Outlook. Project health is a small traffic-light lamp. Done is a tick and a line through the subject.

The build rejects the category default of an airy sidebar and rounded cards. Surfaces are flat, corners stay between 2 and 5px, and elevation is used only for things that float above the grid.

**Key Characteristics:**
- Dense, keyboard-driven grid: 30px rows, 13px system type, tabular numerals everywhere.
- Near-neutral ground: white and grey with a faint water cast, never tinted enough to call blue.
- One blue accent plus a pale blue selection fill, used only to show position and focus.
- Colour is meaning: red for trouble (overdue, stalled, chase, errors), green and amber only in project-health lamps, the red flag for today. Everything else is ink on grey.
- Condensed caps name things; the system face says things.
- Light and dark themes, both designed in their own right.

## Colors

The palette is still water in daylight: pale grey-white ground, near-black ink, a rail the colour of the pond's air, one blue for focus, and a few state colours that each mean one thing.

### Primary
- **Focus Blue** (`accent`): the single accent. It forms the 2px focus ring on inputs, pickers, proposal rows and `:focus-visible`, the 1px hairline (45% mix) around the focused grid row, the 2px ring on a ticked row that is also focused, and the current Clarify track cell. Dark: #6497ee.
- **Accent Contrast** (`accent-contrast`): text on a solid accent fill. Dark: #0b1426.
- **Selection Blue** (`select`, `select-ink`): the pale blue fill that says "you are here": the focused row in the active grid, the highlighted picker or palette option, the current Weekly Review step, a focused mini-row in the detail pane and a focused proposal field chip. Text, markers, badges, dates and energy bars on it switch to `select-ink`. Dark: #1f3656 / #eef3fa.

### State
- **Alert Red** (`alert`): a state colour only. Overdue dates, stalled projects (badge and red lamp), the Chase label and dashed chase ring, review-overdue age, the flag for today, warning facts and error notes. `alert-on-rail` is the darker (lighter in dark) red for small text on a hovered rail row. Dark: #ec6d57.
- **Go Green** (`go`) and **Wait Amber** (`wait`): project-health lamp colours only. Green means the project has a next action; amber means it is only waiting on others. Dark: #3dba72 / #e2a634.
- **Mark** (`mark`): the drawn marks: the done tick and the line through a subject. A near-black slate, not a colour. Dark: #d5dae0.

### Neutral
- **Paper** (`paper`): the app ground, the grid head and field wells. Dark: #15181b.
- **Sheet** (`sheet`): raised surfaces: detail pane, pickers, palette, capture input, the Clarify source text and the current rail entry. Dark: #1b1f23.
- **Ink** (`ink`, `ink-2`, `ink-3`): primary text; secondary text (projects, column heads, meta); tertiary text (placeholders, dashes, hints, the done lamp). `ink-3` holds 4.5:1 on paper and on the rail. Dark: #e7eaed / #b4bac0 / #979ea5.
- **Rules** (`rule`, `rule-strong`): row dividers and pane borders; grid-head underline, group underline and input borders.
- **Rail** (`rail`, `rail-2`, `rail-ink`): the pond's air, a faint water grey a shade under the pond, so the water settles into the rail without a seam. The rail, rail hover, and the focused row when its grid is not the active region. Dark: #1d2227 / #2a3037 / #d5d9dd.
- **Wash** (`wash`, `wash-ink`): the one quiet surface for naming chips: tags (an area, a disposition), the muted Someday/Done badges and the proposed-project block in Clarify. Dark: #232a31 / #cfd7df.
- **Toast** (`toast`, `toast-ink`): the undo note, a dark slate in light and a pale one in dark, so it floats clear of either ground.
- **Tick Grey** (`tick`): multi-selected (ticked) rows.

### Named Rules
**The Still Water Rule.** Neutrals carry a trace of the pond's blue (a hue near 210°, chroma kept at the edge of perception). If a surface can be named as blue, it has gone too far. Blue as a colour belongs to focus and selection alone.

**The One Blue Rule.** Blue means focus and position. `accent` draws rings and hairlines; `select` fills the focused row, the highlighted option, the current review step and focused chips. Neither is used for decoration, headings or tags. Region focus is shown on the focused element itself, never by painting a pane. A grid that loses region focus keeps its cursor row in `rail-2`, not blue.

**The Red Means Trouble Rule.** `alert` is semantic only: overdue, stalled, chase, flagged for today, errors. It is never decoration and never a brand colour. A neutral status (Someday, Done) uses the same badge shape in `ink-3` on `wash`.

**The Traffic Light Rule.** Green (`go`), amber (`wait`) and red (`alert`) together mean project health and nothing else. Green and amber appear only in lamps. Colour never carries health alone: every lamp names its state in an `aria-label` and `title`, and a stalled project also carries the STALLED badge.

**The Context Code Rule.** Each context has its own colour, and that colour appears only as a 2px underline under the context name in a row's context cell (offset 4px). Context group labels stay plain ink with no underline. Context colours never fill rows, cells or chips, and the context palette holds no red and no green (blue, slate, sienna, ochre, violet, teal, plum, olive): red means trouble and green means on track.

## Typography

**Display / Label Font:** Barlow Condensed 600 and 700 (with Arial Narrow, Helvetica Neue), self-hosted via @fontsource. (Roboto, a standard-width Barlow and a one-step larger scale were tried and reverted: owner's decision.)
**Body Font:** the system UI stack (-apple-system, SF Pro Text, Segoe UI, system-ui).

**Character:** A neutral system face does the reading. A condensed label face, always in uppercase with tracking, does the naming. Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on body).

### Hierarchy
- **Headline** (650, 19px, -0.01em): the view title ("Next Actions"), followed by a plain `ink-2` count.
- **Title** (600, 15px): the item title field in the detail pane and empty-state titles. Clarify proposal titles use 600/14px.
- **Body** (400, 13px, 1.4): rows, fields, rail, detail text. Strong subjects use 600.
- **Body Sheet** (400, 14px, 1.55, max 68ch): the captured text on the Clarify source sheet.
- **Body Small** (400, 12px): meta, counts, file sizes, and toast notes.
- **Label Tag** (Barlow 600, 11.5px, 0.07em, uppercase, line-height 1): tags. A state's title (Inbox zero, Ready to record) uses the same caps at 14px in `ink-2`, with no chip.
- **Label Caps** (Barlow 600, 12–13px, 0.06–0.08em, uppercase, `ink-2` or `ink-3`): column heads, pane and detail section heads, field labels, plain group labels, review steps and picker titles. Review steps are `ink-3`; a finished step (visited, nothing open) is `ink-2` with a line through it; an open step carries its count in 12px 650 `alert`.
- **Numeral** (Barlow 700, 40px): the review tallies.

### Named Rules
**The Two Voices Rule.** Condensed caps name things, and the system face says things. Barlow never sets a sentence or an editable value. The system face is never tracked out into caps.

## Layout

The desktop layout is a two-column app grid: a 236px rail and a fluid main column, running the full height of the window (there is no status bar). The main column stacks a 44px top bar (capture line flexing to fill, with a 220px search that widens to 320px when open) and a view head (16px 20px 8px). Below that, the work area holds the scrolling list region (20px side padding) and, when opened, a 380px detail pane on the right that runs the full height of the window; the top bar and view head then span only the list column. The pane can be pinned (the pin beside its ×, or ⌥P): pinned, it stays open beside every list, follows the cursor through the Inbox, lists, projects, areas, search and the Weekly Review, empties on a new view until that list's cursor fills it, and says "Nothing here has details…" on a row without any (an area, a group head). Esc then only steps back to the list; × closes the pane and unpins it. The pin is remembered per browser. Loose, the pin is a quiet `ink-2` icon tilted 45°; pinned, it stands upright, filled `accent` on a `select` chip.

The grid uses CSS grid columns set per view through `--cols`: a 30px marker column, a `minmax(220px, 1fr)` subject, then fixed data columns (context 112px, due 84px, start 80px, time 52px right-aligned, energy). Cells pad 8px horizontally. The grid head is sticky, 28px tall, and underlined in `rule-strong`. Every list sorts the same way from its headings, as in Outlook: a heading with something to order by is a button; click once for A–Z (or oldest/smallest first), again for Z–A, a third time for the list's own order (manual, oldest first in the Inbox, A–Z in Reference, newest first in Done). The sorted heading turns `ink` with a 10px chevron (up ascending, down descending); other sortable headings show the chevron faintly on hover. Rows sort inside their groups (groups keep their order), empty values always last; the keyboard order follows what is shown; the choice is remembered per list, and the action lists' View menu "Sort by …" sets the same state. `aria-sort` names it for screen readers. Group heads are 32px with 10px above. Beside the detail pane on 821–1100px screens the pane narrows to 340px so the list keeps its project column. When the list gets narrow (for instance beside the detail pane at 1024px) it sheds its least useful columns in a fixed order (start, energy, time, project on Next Actions; open, area, next action on Projects; since, project on Waiting For) instead of scrolling sideways; the grid never goes below 320px.

The spacing rhythm is small and even: 4, 6, 8, 10, 14, 16, 20px. Gaps inside controls are 6–8px, and pane padding is 14–16px.

Below 820px the rail is replaced by the bottom tab bar (see Rail). Search collapses to a 36px button. The grid drops to marker, subject and one date column. The detail pane becomes a fixed bottom sheet 72dvh tall at the foot of the screen, and Clarify's two panes stack into one column.

## Elevation & Depth

The system is flat. Depth comes from tone: paper, sheet and rail. Shadows are kept for things that float (pickers, palette, help, the filed-capture list, toasts and the mobile detail sheet) and one soft lift under the Clarify source text.

### Shadow Vocabulary
- **Float** (`--shadow: 0 10px 28px rgb(18 24 32 / 0.14), 0 2px 5px rgb(18 24 32 / 0.07)`; dark `0 12px 32px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.35)`): pickers, palette, help, open capture, toasts and the mobile detail sheet.
- **Lift** (`0 2px 8px -4px rgb(18 24 32 / 0.12)`): the Clarify source text, a single sheet (no stacked paper edges).
- **Focus ring** (`0 0 0 2px var(--accent)` with a border moving to `ink`): text inputs, pickers and proposal rows. Region-focus cursors in the rail and on group heads use an inset 2px `ink` ring instead.

### Named Rules
**The No Props Rule.** Nothing imitates an object: no tape, folders, stamps, paper stacks, sheen, emboss or bevels. A surface is a flat tone; a mark is a drawn line. The pond is the one image, and it stays in the rail.

## Shapes

Corners are nearly square and scale with the object: wells and file previews at 2px, tags, badges, inputs, fields, rail items and proposal rows at 3px, pickers at 4px, and the palette, help overlays and toasts at 5px. The rounded forms are the two-minute badge (10px pill, dashed at rest, solid ink when on) and the 10px circular project lamp. Flagged for today is a red flag; done is a 1.5px tick and a line through the subject.

## Components

### Tag
A place name as a quiet chip: Label Tag caps (Barlow 600 11.5px, 0.07em) in `wash-ink` on `wash`, 3px radius, 3px 6px padding, no shadow. Tags name areas (in the Projects area column, Settings › Areas and the Clarify proposal), Clarify's disposition and Settings rule sources. At heading size (`Tag size="md"`) there is no chip: 14px caps in `ink-2` title a state (Inbox zero, Clarify stopped, Ready to record, the help overlay, the sign-in sheet's Stiltje). The rail uses no tags; list names are plain text.

### Rail (Navigation)
- **Role:** a status panel, not only a menu (owner's decision after the rail critique). It answers "where am I?" and GTD's weekly "is my system current?".
- **Style:** the `rail` tone, 236px (wide enough for the longest name, its signal and a key cap), 14px 10px padding, a `rule-strong` right edge.
- **Mind like water (the pond):** the rail opens on a still water surface, David Allen's "mind like water" (owner's idea). An 84px band bleeds to the rail's edges: the rail's air above a 1px `water-line` horizon at 43px (level with the top bar's and the detail pane's bottom rule, so one line runs across the window), then water shading from `water-far` to `water-near`, masked so it fades into the drawer. At rest nothing moves and nothing runs. When something lands in the Inbox (a capture or an upload, never a page load or an undo), a drop in `water-drop` falls from above the band (about 0.4s, stretching into a tear as it speeds up), strikes the surface at a random spot across the middle (lower is nearer), throws up a small rebound droplet, and sends out three rings: a bright `water-crest` line over a darker `water-trough` line, flattened by the viewing angle (nearer rings are larger and rounder), expanding and dying out over about 3.5s until the water is smooth again. Several captures at once fall one after another, 160ms apart, never twice in the same place. The canvas draws only while something moves, then clears and stops. With reduced motion there is no fall: a single ring appears where the drop lands and fades in place. The pond is decorative (`aria-hidden`); the live region announces the count.
- **App icon:** the pond as a modern macOS icon (`public/favicon.svg`): a continuous-corner squircle with a thin light glass rim, pale air above a white horizon at about 58%, deep water shading from #4f86c6 to #15315a, a glossy `accent`-blue drop falling in the air, and three flattened rings spreading from where it will land, fading as they widen. Drop and rings are drawn heavy enough to read at 16px in a browser tab. `public/apple-touch-icon.png` (180px) is the same art full bleed, since home screens round their own corners.
- **The Inbox, on top:** an ordinary rail item at the head of the first run (owner's decision: quieter, like the other items): the name, its count as a plain `ink-2` number when anything is waiting (nothing at zero), and its ⌃1 key cap. A polite live region still announces the count after a capture.
- **Lists:** no stage headings. Two runs split by a `rule-strong` hairline, in order of use: Inbox, Next Actions, Waiting For, Projects, then Someday/Maybe, Reference, Done.
- **Counts are signals, not inventory:** Next shows "N overdue" (alert red) or "N today" (flagged); Waiting shows "N to chase" (alert red); Projects shows only the stalled badge; Done shows "N today" in `ink-3`; Someday, Reference and Areas show no number (their view titles do).
- **System check:** a Label Caps heading, then one row per open question, each a stop that opens where it is fixed: Weekly Review (age, "due" in alert red from day 7, or once a never-reviewed system is a week old; key cap W), stalled projects, follow-ups due, and the oldest Inbox item's age (stamp red from 7 days; key cap K). Rows with nothing to report are left out; "Nothing stalled, overdue or waiting." shows when only the review row remains. - **Key legends:** every rail stop ends in its shortcut as a key cap (`.rail-key`: 11px, 30px minimum width so the caps form one right-aligned column): ⌃1–7 on the tray and lists in rail order, W on the review, the destination list's key on stalled projects (⌃4) and follow-ups (⌃3), K on the oldest item, ⌘⇧, on Settings. Outside the Mac the caps read "Ctrl+2" and fit the same 236px rail. They are visual only (`aria-hidden`); each button carries the key in `aria-keyshortcuts`. The rail is the one standing exception to the no-printed-hints rule (owner's decision).
- **Settings:** alone at the foot. ⌘⇧, (Ctrl+Shift+, on other systems) opens it.
- **Go-to keys:** Control+1–7 on every system (⌃1–7 on the Mac, Ctrl+1–7 elsewhere) follow the rail from the top (Inbox, Next Actions, Waiting For, Projects, Someday/Maybe, Reference, Done). The Weekly Review has no number; W starts it.
- **States:** rows are 30px, 13px 500-weight `ink-2`. The open list is the sheet pulled forward: `--rail-current` (sheet in light, a lifted #30373e in dark, never darker than the rail), `ink` text at 650, a 1px `rule-strong` hairline and a soft lift. Hover fills `rail-2`, and small red text on a hovered row switches to `--alert-on-rail` so it keeps AA. The keyboard cursor is an inset 2px `ink` ring.
- **Keyboard:** the rail is a region (⌥Tab / ⌘F6). Focus arriving by Tab or a click makes it the active region, so the keys act on what looks focused. ↑/↓, Home/End, the first letter of a stop's name (W and K stay the app-wide review and clarify keys), Enter to open, Esc back to the list.
- **Phone (below 820px):** the rail is replaced by a bottom tab bar, 52px targets: Inbox with its count (a plain 12px `ink-2` number as in the rail, none at zero), Next, Waiting, and More (a sheet with the other lists and Settings). The current tab has a 2px ink rule on top; when a More list is open, the More tab shows its name.
- **Mobile:** a horizontal scrolling strip.

### Grid Rows (Signature)
- **Row:** 30px tall with a `rule` bottom divider. Hover is a 45% `rail` wash.
- **Focus:** the focused row in the active grid fills with selection blue (`select`) inside a 1px `accent` hairline. Markers, badges, overdue dates and energy bars switch to `select-ink` so they stay legible; an overdue date on the focused row keeps a 2px underline. In an inactive grid the cursor row is `steel-2`. Ticked (multi-selected) rows are `tick`. A ticked row that is also focused gets an inset 2px `accent` ring.
- **Marker:** a 22px cell holding a thin ring. When flagged for today the ring becomes a red flag, as classic Outlook flags a task (owner's choice, replacing a calendar leaf and before it a pen loop): an alert-red pennant with a notched fly on a 1.4px `ink-2` pole. It drops in over 220ms (4px fall and fade; none with reduced motion), and the row's subject turns 600 weight; the mark is `role="img"`, labelled "Flagged for today". When done it shows a tick. A chase item has a dashed alert-red ring. Project rows carry a lamp in this column instead.
- **Flag column:** the marker cell is a button, as in classic Outlook's flag column. Unflagged, hovering it shows a faint 1.2px `ink-3` outline flag (a chase ring hides while hovered); one click flags the row for today and the red flag drops in; clicking the flag takes it off. It acts on that row only, never moves the cursor or starts a rectangle, and ⌘Z undoes it. Done rows have no toggle. The keyboard way is Ins.
- **Complete box:** as in classic Outlook's task list, every action row has a Complete checkbox between the marker and the subject (a 26px column). A 12px square with a 2px radius, `sheet` fill and a 1.25px `ink-3` edge; hover inks the edge; checked, a tick. One click completes that row only (not the selection) with the usual strike and fold, and ⌘Z undoes it; in Done a checked box unticks to bring the action back. It never moves the cursor or starts a rectangle. Beside it the marker goes quiet: the plain ring and the done tick are left out (the box says both), so the marker column only carries flagged for today and chase.
- **Done:** as in classic Outlook, a done action stays on its list: a line strikes through the subject (200ms), then the row settles, greyed out (`ink-3` throughout, the subject struck through, no overdue red, faded context underline and energy bars) at the bottom of its group, whatever the sort. The cursor moves on to the next open row instead of following it down. E or the Complete box on a done row takes it back to the list it was done on. Each action list (Next Actions, Waiting For, Someday/Maybe) has a per-list Show/Hide done actions toggle (View menu and ⌘K; shown by default); hidden, a completed row folds away (180ms, fade and 8px slide). "Archive done actions to Done" (⇧E, View menu, ⌘K) moves that list's done actions to the Done list, which holds only archived ones; unticking there returns an action to its own list. A finished project's actions go straight to Done. The Inbox follows the same rules: each row has a Complete box after its kind icon, and ticking an item off (the two-minute rule, E or the box) strikes it through at the bottom of the Inbox, logged as a done action; unticking returns it to the Inbox as stuff, ⇧E archives it to Done, and Show/Hide done items is in ⌘K. Projects too: each project row has a Complete box after its lamp; completing a project (E or the box) strikes it through at the bottom of its area and closes its open actions straight into Done, unticking makes it active again with those same actions back, ⇧E archives completed projects off the list (they remain under "Show someday and archived projects"), and Show/Hide completed projects is in the View menu and ⌘K.
- **Cells:** context is a 2px coloured underline code. Dates are ink; overdue dates are alert red at 650 weight; due-soon dates are 650 weight. Energy is three 5×12px bars filled `ink-3`/`ink-2`/`ink` by level. Chase items carry a stamp-red condensed "CHASE …" label.
- **Rectangle select:** pressing anywhere in the main column and dragging (past 5px, so a click stays a click) draws a band: a 1px `accent` hairline at 70% over a 10% `accent` wash, 2px radius. It can start on a row (except where a row drags to reorder, below), in the empty space around and below the list, on the view title or the top bar; never on the rail, the detail pane, a field, a button or an open picker. The band is drawn only in the main column: dragged over the rail or the detail pane, its edge stops at the column's edge (and rows are hit-tested against that clipped band). A band started inside the list keeps its anchor on the content as the list scrolls. A click on empty space (no drag) clears the selection, as on a desktop. Every row it touches is ticked as it moves (group heads never), the cursor goes to the row the band reached last (the bottom ticked row dragging down, the top one dragging up, whether the pointer ends on a row or on empty space), and near the list's top or bottom edge the list scrolls, faster the closer the pointer. A plain drag replaces the selection; ⌘-drag (Ctrl elsewhere) adds to it. No text is selected while dragging, and the click that ends the drag is swallowed so it doesn't undo the band.
- **Drag to reorder:** in a list's own, manual order (no column sort: Next Actions, Waiting For, Projects), pressing on a row and dragging past 5px moves it, as in Finder: the row dims to 40%, a 2px `accent` drop line with an 8px ring at its start marks where it lands, and the cursor is a grabbing hand. Dropped inside its own group it only moves; dropped into another group (including a collapsed or empty one, where the line sits under the heading) it also takes on what that group stands for: the context, who it waits on, the project, today's flag, the project's area, or a due date for the date buckets (Today, Tomorrow, +2 days for This week, +7 for Within a month, +31 for Later, none for No due date), and a toast names it ("… → @phone"). Drops that would break a rule are refused (no line appears): "No context" on Next Actions (a next action needs a context) and "Overdue" (no date to give). The line never goes below the done rows, the list scrolls near its edges, and the row takes a sort value between its new neighbours (nothing else is renumbered). ⌘Z undoes it; ⌥↑/⌥↓ remain the keyboard way. When a column sort is on, or in lists without a manual order (Inbox, Reference, Done), a drag on a row draws the selection rectangle instead; from empty space it always does.
- **Inline edit:** a 24px sheet field with an ink border and a 2px `select-ink` ring, set inside the selected row.

### Project Lamp
A 10px circle (50% radius, 6px left margin) with a 1px inset edge mixed 70% toward black. Green (`go`): the project has a next action. Amber (`wait`): it is only waiting on others. Red (`alert`): stalled. Hollow (1.5px `ink-3` ring, no fill): someday. Dimmed grey (`ink-3` at 60% opacity): done. It sits in the marker column of project rows in Projects, Someday/Maybe and the Weekly Review, and after the Project label in the project detail pane (8px there, sized to the label caps). No detail pane has a header line above its fields (owner's decision: it only repeated what the fields and the list already say). The pane opens on its first field; the one state the fields don't show rides after that field's label: a project's lamp after "Project", and an action's marker after "Subject", only when it is flagged for today or done. Each lamp is `role="img"` with an `aria-label` and `title` naming the state ("On track: has a next action", "Waiting: only waiting on others", "Stalled: no next action", "Someday / Maybe", "Completed").

### Project Actions
Projects has no fold-out (owner's decision, after the pinned detail pane arrived): a project's actions are read and worked in its detail pane, which, pinned, follows the cursor down the list. On the list, T adds a next action to the project under the cursor (text, then a required context), and the Next action column shows its first open action.

### Areas in Settings
There is no Areas page (owner's decision: the Projects list grouped by area already shows them). Areas are a group in Settings, between Claude's rules and Contexts: each row is the area's tag with its active-project count on the right. N adds one (the name is typed in place), F2 renames, ⌥↑/⌥↓ reorders (the order the Projects area groups follow), Delete removes it and its projects keep going without an area. Any area picker can still create one by typing a new name.

### Group Heads
Every list's group heads look the same (owner's decision: Projects used to have blue-grey folder bands with raised area tape, and was the odd one out): 32px, a chevron, the group name in Label Caps (`ink-2`; a context shows its colour as the 2px code under the name), then an `ink-3` count and an optional quiet 12px `ink-3` note on the right, over a `rule-strong` line. Group heads sit 10px below the group above them. Group focus matches row focus: in the active grid the head fills selection blue (`select`) inside a 1px `accent` hairline; in an inactive grid it gets a 1px `ink-3` hairline. The detail pane, when it holds focus itself, shows the same 1px `accent` hairline around the pane, never a painted header.

### Inputs / Fields
- **Capture line:** sheet background, 1px `rule-strong` border, 3px radius, 30px minimum, grows to 160px. On focus the border turns ink with a 2px blue ring. When open it adds the float shadow.
- **Search:** a 30px, `rule`-bordered well at 220px. When open it widens to 320px with an ink border, blue ring and sheet fill.
- **Detail fields:** paper wells (`rule` border, 3px) that turn into a sheet with an ink border and blue ring on focus. Picker fields are 28px. Project notes are ruled like a notepad (19.5px line pitch).
- **Labels:** Label Caps 11.5px in `ink-3`.

### Pickers, Palette, Help
The picker is a 300px sheet card (4px radius, float shadow, 8px padding) that pops in over 140ms (fade plus 4px rise). Its input is permanently ink-bordered with a blue ring. Options are 28px rows, and the highlighted option fills selection blue with `select-ink` text. The ⌘K palette (640px, 38px input, 160ms pop) and the ⇧? help overlay (1120px, four columns) share the treatment over a 30% dark scrim (120ms fade). Apart from the rail legends, these two overlays are the only places key caps (`.kbd`: sheet fill, `rule-strong` border with a 2px bottom) are shown.

### Theme
Light, dark, or follow the system (the default). The choice lives on `<html data-theme>` and is kept per browser; with no attribute the dark tokens follow `prefers-color-scheme`, `data-theme="dark"` forces them, `data-theme="light"` keeps the light ones even on a dark OS. It is applied before the first render, so the page never flashes the other theme. Chosen from Settings › Appearance › Theme (Enter opens System / Light / Dark, System showing which it resolves to now) or ⌘K ("Switch to the dark/light theme", "Follow the system theme"). The pond reads its colours when a drop starts, so it follows a switch.

### Detail Pane
A 380px sheet on the right, opened with Enter. It runs the full height of the window beside the top bar and list, and its 44px bar (Label Caps title, pin and close) shares the top bar's bottom rule, 14px 16px body padding and 14px section gaps. Section heads are Label Caps with `ink-3` counts. A project's header starts with its lamp. Nested action lists use 28px mini-rows that fill selection blue on focus. In a project's pane, T (as on the Projects list) puts the cursor in "Add a next action"; its key cap sits at the right of the Actions heading, like the field keys, and the hint line leads with it. Enter asks for the context before adding (a next action always has one), then leaves the cursor in the field for the next.

### Badge
A state word beside a name: Barlow 700 11px caps, 0.1em tracking, 3px radius, 3px 5px 2px padding, no border. Stalled is `alert` on a 10% `alert` tint (it asks for something); neutral statuses (Someday, Done) are `ink-3` on `wash`. On a selected row it switches to `select-ink` on an 8% tint.

### Toast
There is no status bar; the owner removed it because standing facts (Claude ready, flagged, deferred) added nothing. Standing facts belong in the view count instead ("12 actions · 1 deferred"), and Claude's connection is shown in Settings. Action feedback appears only when something happens: a slate (`toast`) toast with `toast-ink` text, 5px radius and the float shadow, centred 18px above the bottom edge. It rises in over 180ms, stays for 5 seconds (12 seconds for errors) and fades out. An undoable note ends with the "⌘Z undo" suffix. Errors turn the toast alert red with white 600-weight text. It never takes clicks and is announced politely to screen readers.

### Clarify
The captured item is shown on a Sheet with a single soft lift, beside proposal rows: sheet cards with a 1px `rule` border and 3px radius that take the blue focus ring through `:focus-within`. Focused field chips fill selection blue. A proposed project sits in a `wash` block with a 1px `rule-strong` top edge. Progress is a track of 14×5px cells: `rule` pending, `rule-strong` ready, `ink-2` done, and `accent` with a 1px `select-ink` hairline for the current item.

### Motion
Motion is short, uses the out-expo ease (`cubic-bezier(0.16, 1, 0.3, 1)`), and every transition answers a user action. The values are: strike 200ms, then fold 180ms; flag drop 220ms; tick 220ms; picker pop 140ms, palette and help 160ms; scrim fade 120ms; a drop falling into the rail's pond (about 0.4s) and its rings dying out (about 3.5s), only on a new capture; status note 180ms; chevron 160ms. Under `prefers-reduced-motion: reduce`, all animations and transitions collapse to 1ms.

## Do's and Don'ts

### Do:
- **Do** reserve `accent` for focus rings and hairlines, and selection blue (`select`, with `select-ink` text) for the focused row, the highlighted option and focused chips.
- **Do** mark the open rail list by lifting it onto `sheet`, in the same type as every other entry. Areas carry a quiet tag.
- **Do** show region focus on the focused element (selected row, ink cursor ring) and demote an inactive grid's cursor row to `rail-2`.
- **Do** show project health with the traffic-light lamp, and give every lamp `role="img"` with an `aria-label` and `title` that name its state.
- **Do** pair a red lamp with the STALLED badge wherever a stalled project is listed or opened.
- **Do** keep rows at 30px, body at 13px, and numerals tabular.
- **Do** set names in Barlow Condensed caps with 0.06–0.08em tracking, and everything readable in the system face.
- **Do** draw state as a mark: a red flag for flagged for today, a tick and line for done, a badge for stalled, a lamp for project health, a 2px underline for context.
- **Do** design both themes: water-grey white (`paper`, `sheet`) by day, slate by night, switched by `prefers-color-scheme`.
- **Do** honour `prefers-reduced-motion` for every animation and transition.

### Don't:
- **Don't** paint a pane or region blue to show it has focus.
- **Don't** change the face, size or colour of the open rail list (no chip, no colour change). The owner found a different-looking current item jarring.
- **Don't** let a lamp's colour stand alone. A lamp without an accessible name, or a stalled project without its badge, is a defect.
- **Don't** use green (`go`) or amber (`wait`) anywhere but project-health lamps, and don't fill rows, tags or chips with lamp colours.
- **Don't** bring back yellow as a fill, ring or tag tone. Amber exists only as the waiting lamp.
- **Don't** bring back the desk kit: no label tape, folders, rubber stamps, paper stacks, sheen, emboss or bevels (owner's decision).
- **Don't** let a neutral drift into a colour: if a grey reads as blue, pull it back.
- **Don't** use alert red decoratively.
- **Don't** fill rows, cells or chips with context colours.
- **Don't** print key hints on controls, lists or empty states. Keys are discovered through ⌘K and ⇧?. The pinned exceptions are the rail key legends, "⌘Z undo" on toast notes, the single Key Hints line at the foot of Clarify, the Weekly Review and the focused detail pane (Label Caps 12px `ink-3`, small key caps, 18px gaps between entries rather than dots, a `rule` hairline above; in the detail pane each field's own key sits as a 10px key cap beside its label, and the line keeps only the pane-wide keys), and the Key Choices list on a stopped Clarify (a key cap, then the action in 13px `ink`).
- **Don't** add paper texture, airy card layouts or large radii. Density beats decoration.
