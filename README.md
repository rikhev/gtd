# In-Tray

A local, keyboard-only GTD system. Capture stuff, let Claude propose how to clarify it, and work from compact Outlook-Tasks-style lists.

## Run it

```sh
npm install
npm run dev                 # http://localhost:5173
```

- Data lives in `data/gtd.sqlite`, and uploaded files are stored in `data/files/`. Both stay on this Mac.
- Clarify and the Weekly Review use Claude Sonnet 5. Add your API key in **Settings → Claude → API key** (or ⌘K › "Add a Claude API key"). The app checks it with Claude, then saves it to `.env` in the project folder (readable only by you). The browser only ever sees the last four characters. Without a key, everything else still works.
- To run a production build: `npm run build && npm start`, which serves on port 5173.

## Run it on a server

See [DEPLOY.md](DEPLOY.md). It sets up HTTPS, the password + authenticator login, a systemd service, nightly backups, and git-based updates: commit, then `./deploy/deploy.sh`.

## Keys

Press `?` to see the keys for the current screen, and `⌘K` to search every command. These are the main ones:

| Keys | What they do |
|---|---|
| `⌃⇧1`–`9` | Inbox · Next Actions · Projects · Waiting For · Someday · Reference · Review · Done · Areas |
| `⇧N` | Capture to the Inbox. Enter files the item and the line stays open. `⇧↵` adds a new line, Esc closes |
| `K` / `W` | Clarify the Inbox with Claude / start the Weekly Review |
| `↑↓` `⌘↑↓` `fn↑↓` | Move / jump to the first or last row / page |
| `Space` `⇧↑↓` `⌘A` | Tick a row / extend the range / select all |
| `←` `→` | Collapse or expand a group |
| `Enter` `F2` `N` | Open details / rename / new row |
| `J` | Jump from an action to its project, and from the project back to that action |
| `E` | Mark done. Recurring actions schedule their next occurrence |
| `V` `C` `P` `A` | Move to a project or list / context / project / area |
| `D` `S` `B` `R` | Due date / start date / bring back (tickler) / repeat |
| `T`+`1–6` `G`+`1–3` | Time estimate / energy |
| `Ins` or `⌃I` | Flag for today |
| `⇧F` | Delegate to Waiting For |
| `Del` / `⇧Del` | Trash / delete permanently |
| `⌥↑↓` `⌥V` | Reorder by hand / group and sort the view |
| `⌥Tab` or `⌃F6` | Cycle rail → list → details |
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
| `⌃.` / `⌃,` | Skip to the next / previous item |
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
