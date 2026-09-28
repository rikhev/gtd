# Stiltje

A local, keyboard-only GTD system. Capture stuff, let Claude propose how to clarify it, and work from compact Outlook-Tasks-style lists.

## Run it

```sh
npm install
npm run dev                 # http://localhost:5173
```

- Data lives in `data/gtd.sqlite`, and uploaded files are stored in `data/files/`. Both stay on this Mac.
- Clarify uses Claude Sonnet 5. Add your API key in **Settings → Claude → API key** (or ⌘K › "Add a Claude API key"). The app checks it with Claude, then saves it to `.env` in the project folder (readable only by you). The browser only ever sees the last four characters. Without a key, everything else still works.
- To run a production build: `npm run build && npm start`, which serves on port 5173.

## Run it on a server

See [DEPLOY.md](DEPLOY.md). It sets up HTTPS, the password + authenticator login, a systemd service, nightly backups, and git-based updates: commit, then `./deploy/deploy.sh`.

## Keys

Press `?` to see the keys for the current screen, and `⌘K` to search every command. The table shows the Mac keys; on Windows and Linux, `⌘` is `Ctrl`. These are the main ones:

| Keys | What they do |
|---|---|
| `⌃1`–`8` | Inbox · Calendar · Next Actions · Waiting For · Projects · Someday · Reference · Done (rail order). Control on every system, also on the Mac (⌘1–8 are the browser's tabs) |
| `⌃9` | Recently deleted: everything deleted in the last week (Settings › Recently deleted sets how long). `R` restores it where it was (a project brings back the actions deleted with it), `Delete` removes it for good, ⌘K › Empty Recently deleted clears it |
| Calendar | `1` `2` `3` Week · Month · Year · `←` `→` `↑` `↓` move the day · `⇧←`/`⇧→` or `PageUp`/`PageDown` the previous/next period · `T` today · `Enter` steps into the day's items (then `↑` `↓` between them, `Enter` details, `Esc` back) · `⌥←`/`⌥→` move the item a day · `⇧⌥←`/`⇧⌥→` its end a day · `E` done · `D`/`S` due/start · `N` a new action due that day. With the mouse: drag a bar to move it, drag either end to change that date, double-click a day for a new action |
| `W` | Start the Weekly Review |
| `⌘⇧,` | Settings |
| `⇧N` | Capture to the Inbox. Enter files the item and the line stays open. `⇧↵` adds a new line, Esc closes |
| `K` / `⌥K` | Clarify the Inbox / clarify it with Claude |
| `↑↓` `⌘↑↓` `fn↑↓` | Move / jump to the first or last row / page |
| `Space` `⇧↑↓` `⌘A` | Tick a row / extend the range (`⇧Home`/`⇧End` to the ends) / select all. A plain arrow, Home/End or click clears the selection, as in Finder; `⇧`-click extends, `⌘`-click ticks, and dragging from anywhere beside the rail draws a selection rectangle (`⌘`-drag adds to the selection; a click on empty space clears it) |
| `←` `→` | Collapse or expand a group. On Projects, a project's actions show in the details pane (pin it with `⌥P` to keep them beside the list), and `T` adds a next action to the project under the cursor (in a project's detail pane, `T` goes to its Add a next action field). Areas are managed in Settings › Areas (N adds, F2 renames, ⌥↑↓ reorders, Delete removes; projects keep going without one) |
| `Enter` `F2` `N` | Open details / rename / new row |
| `J` | Jump from an action to its project, and from the project back to that action |
| `E` | Mark done. Recurring actions schedule their next occurrence |
| `V` `C` `P` `A` | Move to a project or list / context / project / area |
| `D` `S` `B` `R` | Due date / start date / bring back (tickler) / repeat |
| `T`+`1–6` `G`+`1–3` | Time estimate / energy |
| `Ins` or `⌘I` | Flag for today |
| `⇧F` | Delegate to Waiting For |
| `Del` / `⇧Del` | Trash / delete permanently |
| `⌥↑↓` `⌥V` | Reorder by hand / group and sort the view |
| `⌥Tab` or `⌘F6` | Cycle rail → list → details |
| `⌘K` › "Switch to the dark theme" | Light or dark theme (or Settings › Appearance › Theme, which can also follow the system) |
| Drag a row | Reorder it (Next Actions, Waiting For, Projects) while the list is in its own order, not sorted by a column. Dropped into another group it takes that group's value: context, waiting on, project, today's flag, area or due date. The keyboard way to reorder is `⌥↑` `⌥↓` |
| Click a column heading | Sort the list by it (again: reverse, a third time: back to the list's own order). Works the same in every list |
| Browser Back / Forward | Move between the views you visited. Every view has its own address (`#inbox`, `#next`, `#waiting`, `#projects`, `#someday`, `#reference`, `#done`, `#review`, `#settings`), so a reload or bookmark opens the same list |
| Click the flag area | Flag a row for today, or take the flag off. The keyboard way is `Ins` |
| Click the box | Mark an action done, as in classic Outlook: it stays on its list, greyed and struck through, at the bottom of its group. Click again (or `E`) to take it back |
| `⇧E` | Archive this list's done items (the Inbox's, or completed projects on Projects). The View menu (`⌥V`) also has Show/Hide done actions |
| `⌥P` | Pin the details pane: it stays open beside every list and follows the cursor (× closes and unpins it) |
| `⌥Q` | Search |
| `⌘Z` | Undo (there are no confirmation dialogs) |
| `⌘O` / `⌘V` | Upload files / paste text, an email or a file into the Inbox |

These keys work inside Clarify:

| Keys | What they do |
|---|---|
| `⌘↵` | Accept Claude's proposal |
| `↑` `↓` | Move between proposed actions (the cursor starts on the first one) |
| `F2` or `Enter` | Edit the action text. `Tab` moves through the fields |
| `Esc` | Field → row, then leave Clarify. Leaving stops Claude; proposals already made are kept for next time |
| `⇧Esc` | Stop Claude but keep reviewing the proposals that are ready (also the "Stop" link while Claude is reading) |
| `C` `P` `D` `S` `T` `G` `V` `⇧F` | Correct a field |
| `N` / `⌥⌫` | Add / remove an action |
| `E` | Done now (two-minute rule) |
| `⌘.` / `⌘,` | Skip to the next / previous item |
| `Del` | Trash the item |

Uploads accept PDF, DOCX, TXT/MD, images, .eml and .msg files. PDFs and images are sent to Claude as they are. For the other formats, the extracted text is sent.

## Keyboard test in Firefox

Firefox is a target browser, so the full shortcut pass is scripted. It needs `brew install geckodriver` and runs against a separate demo database, so your real data is never touched:

```sh
npm run demo            # terminal 1: app on demo data (data-demo/)
npm run demo:seed       # terminal 2: synthetic lists + cached Clarify proposals
npm run test:firefox    # drives your installed Firefox and prints PASS/FAIL per shortcut
```

To reseed from scratch, delete `data-demo/` and restart `npm run demo`.
