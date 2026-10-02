# Stiltje

A local, keyboard-only GTD system. Capture stuff, clarify it one item at a time, and work from compact Outlook-Tasks-style lists.

## Run it

```sh
npm install
npm run dev                 # http://localhost:5173
```

- Data lives in `data/gtd.sqlite`, and uploaded files are stored in `data/files/`. Both stay on this Mac.
- To run a production build: `npm run build && npm start`, which serves on port 5173.

## Run it on a server

See [DEPLOY.md](DEPLOY.md). It sets up HTTPS, the password + authenticator login, a systemd service, nightly backups, and git-based updates: commit, then `./deploy/deploy.sh`.

## Keys

Press `?` to see the keys for the current screen, and `⌘K` to search every command. The table shows the Mac keys; on Windows and Linux, `⌘` is `Ctrl`. These are the main ones:

| Keys | What they do |
|---|---|
| `⌃1`–`6` | Inbox · Calendar · Next Actions · Waiting For · Agendas · Projects (the rail's first group). Control on every system, also on the Mac (⌘1–8 are the browser's tabs) |
| `⌃⇧1`–`5` | Someday · Reference · Checklists, then Done · Trash at the rail's foot (counted from 1 again) |
| `⌃⇧3` | Checklists: the lists you run again and again (packing, closing the month). `Enter` opens one, `E` ticks an item, `N` adds one (Enter after each starts the next), `L` makes a row a section heading, `T` makes a next action from an item, ⌥V › Start over clears the ticks, `R` makes it a routine that repeats every day or week (habits: ticks clear by themselves, a four-week strip shows the record), `Esc` goes back up |
| ⌘K › Go to Horizons | Horizons: purpose and principles, vision (3–5 years) and goals (1–2 years). `N` adds in the group under the cursor, `E` marks a goal achieved, `A` and `D` set a goal's area and target date. On Projects, `G` sets the goal a project serves |
| `L` | On Reference: lock the reference with the lock password (notes and files encrypted in the browser; title stays readable), or take the lock off. Settings › Data sets or changes the password; ⌘K › Lock now locks everything again |
| `⌃⇧5` | Trash: everything deleted in the last week (Settings › Trash sets how long). `R` restores it where it was (a project brings back the actions deleted with it), `Delete` removes it for good, ⌘K › Empty the Trash clears it |
| Calendar | `1` `2` `3` `4` Day (the daily review) · Week · Month · Year · `←` `→` `↑` `↓` move the day · `⇧←`/`⇧→` or `PageUp`/`PageDown` the previous/next period · `Home` (or `⌥⇧Y`) today · `T`/`N` a next action due on the day · `W` a waiting for, follow up on the day · `Delete` trashes the action or project under the cursor (never an appointment) · `Enter` steps into the day's items (then `↑` `↓` between them, `Enter` details, `Esc` back) · `⌥←`/`⌥→` move the item a day · `⇧⌥←`/`⇧⌥→` its end a day · `E` done · `D`/`S` due/start · `N` a new action due that day. With the mouse: drag a bar to move it, drag either end to change that date, double-click an item for its details, double-click an empty day for a new action. Clicking a day or item from the next or previous month (the greyed days) picks it without turning the page |
| `⇧R` | Start the Weekly Review. In it: `⌘↵` marks a step reviewed, `R` marks a flagged row "still current", `F2` rewrites a row, `N` on an area (Get creative) starts a project there |
| `⌘⇧,` | Settings |
| `⇧N` | Capture to the Inbox. Enter files the item and the line stays open. `⇧↵` adds a new line, Esc closes |
| `⌥N` | New project from anywhere: name its outcome, pick its area, then give it a first next action (Esc skips that). On Projects, `N` adds one in place |
| `⌥T` | New next action from anywhere: what to do, its context, then its project (`No project` first; type a new name to create one). On Projects, `T` adds one to the project under the cursor |
| `⌥W` | New Waiting For item from anywhere: what you're waiting for, who or what you wait on, then its project. Waiting since today |
| `T` `W` | Everywhere (action lists, Projects, Agendas, details, the Weekly Review): add a next action (`T`) or a Waiting For item (`W`) to the project |
| `K` | Clarify the Inbox, one item at a time |
| `↑↓` `⌘↑↓` `fn↑↓` | Move / jump to the first or last row / page |
| `Space` `⇧↑↓` `⌘A` | Tick a row / extend the range (`⇧Home`/`⇧End` to the ends) / select all. A plain arrow, Home/End or click clears the selection, as in Finder; `⇧`-click extends, `⌘`-click ticks, and dragging from anywhere beside the rail draws a selection rectangle (`⌘`-drag adds to the selection; a click on empty space clears it) |
| `←` `→` | Collapse or expand a group. On Projects, a project's actions show in the details pane (pin it with `⌥P` to keep them beside the list), and `T` adds a next action to the project under the cursor (in a project's detail pane, `T` goes to its Add a next action field). Areas are managed in Settings › Areas (N adds, F2 renames, ⌥↑↓ reorders, Delete removes; projects keep going without one) |
| `Enter` `F2` `N` | Open details / rename / new row |
| `J` | Jump from an action to its project, and from the project back to that action |
| `E` | Mark done. Recurring actions schedule their next occurrence |
| `V` `C` `P` `A` | Move to a project or list / context / project / area |
| `D` `S` `B` `R` | Due date / start date / bring back (tickler) / repeat |
| `M`+`1–6` `G`+`1–3` `H` | Time estimate (minutes) / energy / who it's with (their agenda) |
| `⇧F` | Delegate to Waiting For |
| `Del` / `⇧Del` | Trash / delete permanently |
| `⌥↑↓` `⌥V` | Move the selected rows up or down one place (within their group) / group and sort the view |
| `T` `W` `E` `⌥V` | On Agendas: take something up with the person under the cursor / add something you're waiting on from them / done / one person's agenda. In an action's details, `W` sets who it's with (it then shows on their agenda) |
| `F` | On Next Actions: what fits now. Say where you are (one or more contexts), how much time and how much energy you have, and the list narrows to what fits (again to change or show all) |
| `⌥Tab` or `⌘F6` | Cycle rail → list → details |
| `⌘K` › "Switch to the dark theme" | Light or dark theme (or Settings › Appearance › Theme, which can also follow the system) |
| Drag a row | Reorder it (Next Actions, Waiting For, Projects) while the list is in its own order, not sorted by a column. Dropped into another group it takes that group's value: context, waiting on, project, its importance, area or due date. The keyboard way to reorder is `⌥↑` `⌥↓` |
| Click a column heading | Sort the list by it (again: reverse, a third time: back to the list's own order). Works the same in every list |
| Browser Back / Forward | Move between the views you visited. Every view has its own address (`#inbox`, `#next`, `#waiting`, `#projects`, `#someday`, `#reference`, `#done`, `#review`, `#settings`), so a reload or bookmark opens the same list |
| Click the box | Mark an action done, as in classic Outlook: it stays on its list, greyed and struck through, at the bottom of its group. Click again (or `E`) to take it back |
| `⇧E` | Archive every done item to Done, on every list at once: done actions (the Inbox's too). A completed project goes straight to Done. A list's View menu (`⌥V`) archives that list alone, and has Show/Hide done actions |
| `I` | On Waiting For (list or details pane): when the waiting began. New items start today; set the real day when you file one later ("20 sep" means the last 20 September; a future date is refused) |
| `⇧P` | Turn a next action (or a someday one) into a project: its title becomes the outcome, and its notes, files, dates and area go with it. You're asked for the project's first next action straight away (Esc to add it later). Also in the Move picker (`V`) and ⌘K; `⌘Z` undoes it |
| Column order | Drag a column heading sideways, or ⌘K › Arrange columns… (then Reset column order to undo). Remembered per list |
| Column width | Drag the edge of a column heading; double-click the edge to fit the contents. Or ⌘K › Resize columns…, then `←` `→` (`⇧` for a pixel), `Tab` next column, `F` fit, `0` default, `↵` keep, `Esc` cancel. Reset column widths undoes it. Remembered per list |
| Columns shown | Right-click a column heading, or ⌘K › Show or hide columns…: toggle any column, including extra ones such as Area, Created, Updated, Repeat. Remembered per list |
| `⌥P` | Pin the details pane: it stays open beside every list and follows the cursor (× closes and unpins it) |
| In the details pane | While the pane has focus each field has a key (listed in `⇧?`, not printed): `F2` the title, `N` the notes, the field letters (`P` project, `C` context, `D` due, `S` start, `M` time, `G` energy, `H` with, `I` waiting since…), `⌘O` attach a file; `T`/`W` add a next action or waiting for to the item's project. `Esc` in a field leaves it (what you typed is saved) and keeps the pane; `Esc` again closes it |
| While typing | `Backspace` and `Delete` always belong to the text field, with any modifier: `⌥⌫` / `Ctrl+⌫` delete a word, `⌘⌫` deletes to the line start. `⌘⌫` closes the details pane only when you're not in a field |
| `⌥Q` | Search |
| `⌘Z` | Undo (there are no confirmation dialogs) |
| `⌘O` / `⌘V` | Upload files / paste text, an email or a file into the Inbox |

These keys work inside Clarify:

| Keys | What they do |
|---|---|
| `Y` `S` `R` `Del` | Is it actionable? Yes / Someday / Reference / Trash |
| `⌘↵` | Accept the decision |
| `↑` `↓` | Move between the decision's actions (the cursor starts on the first one) |
| `F2` or `Enter` | Edit the action text. `Tab` moves through the fields |
| `Esc` | Field → row, then leave Clarify. Items you haven't decided stay in the Inbox |
| `C` `P` `D` `S` `M` `G` `V` `⇧F` | Set a field |
| `⇧P` | Make the item a project (more than one step): it's named after the item, its actions go into it, and the cursor lands on the first to name the next step. Also in File as (`V`) › Whole item → New project |
| `N` / `⌥⌫` | Add / remove an action (`⌥⌫` only on the row, not while typing, where it deletes a word) |
| `E` | Done now (two-minute rule) |
| `Del` | Trash the item |

Uploads accept PDF, DOCX, TXT/MD, images, .eml and .msg files. The server extracts their text and shows it with the item while you clarify; nothing is sent anywhere else.

## Keyboard test in Firefox

Firefox is a target browser, so the full shortcut pass is scripted. It needs `brew install geckodriver` and runs against a separate demo database, so your real data is never touched:

```sh
npm run demo            # terminal 1: app on demo data (data-demo/)
npm run demo:seed       # terminal 2: synthetic lists
npm run test:firefox    # drives your installed Firefox and prints PASS/FAIL per shortcut
```

To reseed from scratch, delete `data-demo/` and restart `npm run demo`.
