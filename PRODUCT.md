# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: a TypeScript web app served locally. React + Vite on the front end, a small Node server (Hono) holding the Anthropic API key and file parsing, and SQLite for storage. Chosen because it keeps everything on one machine, keeps the API key off the client, and makes dense editable lists straightforward. It runs in the browser at localhost; a desktop wrapper can come later without a rewrite.

## Users

One person: the owner, on their own Mac. They practice (or want to practice) David Allen's Getting Things Done and want the capture → clarify → organize loop to take less effort. The expected power use is keyboard-heavy and list-centric, in the spirit of the classic Outlook Tasks view.

## Product Purpose

A personal GTD system where capture has no friction and clarification is assisted. The owner dumps "stuff" into an inbox by typing or uploading documents. On request, Claude processes the inbox and proposes outcomes for each item: projects, next actions, waiting-for, someday/maybe, reference, or trash. The owner accepts, edits, or rejects the proposals. The result lives in compact, directly editable lists.

Success means the inbox reaches zero regularly and every active project has a next action. The owner trusts the lists enough to work from them.

## Positioning

Clarifying is the GTD step people skip because it takes thought. This product hands that thinking to Claude as a proposal and keeps the human as the decision-maker. Nothing moves out of the inbox without the owner's say-so.

## Operating Context

- Runs locally in a browser tab (no login on localhost), or self-hosted on the owner's VPS at gtd.rikard.me behind HTTPS with a single-owner login: password + TOTP authenticator code, one-time recovery codes, 30-day HttpOnly sessions, and login rate limiting. There is one user and no sync between instances. Deployment is documented in DEPLOY.md.
- Capture comes from free typing (quick-add) and from uploaded documents. The accepted document types are still undecided.
- Clarification is triggered by an in-app action that calls the Claude API with the owner's own key.
- Includes a recurring Weekly Review ritual, which Claude may assist.

## Capabilities and Constraints

- GTD lists at launch: Inbox, Projects, Next Actions, Contexts (tags on next actions, e.g. @computer, @phone), Waiting For, Someday/Maybe, Reference, Weekly Review.
- The clarify step is proposal-based. Claude suggests and the owner decides.
- Project and next-action lists are compact, inline-editable tables/lists (the Outlook Tasks model).
- **Keyboard-only is a hard requirement.** The whole interface must work without a mouse. Every view, list, row, field, action, dialog, and Clarify decision needs a keyboard shortcut or a keyboard path. The mouse is optional and never required.
- Shortcuts follow **Outlook on the web** conventions, not classic desktop Outlook. On the Mac, Ctrl becomes ⌘ unless macOS or the browser owns that ⌘ combination; then the literal Outlook-on-the-web ⌃ key is used instead. Mac aliases cover missing keys (Insert, Home/End). Browser- and OS-reserved keys are never used. GTD-only actions get extra single-letter keys in the same style. Capture is in-app only for now; a global hotkey is deferred. There are no confirmation dialogs; every action is undoable with ⌘Z. Shortcuts are discovered through a ⌘K command palette (plus Outlook's ⇧? overlay), not printed on the UI.
- Target browsers: Firefox and Microsoft Edge (Chromium) on macOS. Both must be tested, including every shortcut.
- Data is local-first in SQLite. The API key is entered in Settings, checked against Claude, and stored server-side in `.env`. The browser only ever sees its last four characters.
- Terminology follows GTD: stuff, capture, clarify, organize, reflect, engage, next action, project, context, waiting for, someday/maybe, reference.
- **Capture inputs:** typed text, pasted text or email, and uploaded PDF, DOCX, TXT/MD, images, .eml and .msg. A document enters as one inbox item; Clarify may split it into several outcomes, and the source file stays linked.
- **Clarify:** uses Claude Sonnet 5. The whole inbox is processed in one batch when Clarify starts, and the owner reviews one item at a time. Claude sees existing projects, areas and contexts so it can attach to them instead of duplicating. Each proposal carries an outcome (next action, new or existing project, waiting for, someday/maybe, reference, trash), a verb-first rewrite of vague captures, and a two-minute flag for anything quick enough to do right away.
- **Learning:** repeated identical corrections produce a suggested rule. The owner must approve it, and approved rules can be edited in Settings. Nothing is learned silently.
- **Done items:** leave the active lists but stay in a collapsed Done group on their project and in a searchable, dated Done log. The Weekly Review uses this log.
- **Recurring actions:** the next occurrence is created when the current one is marked done, with its dates moved forward. Recurrence is set as natural text ("every 3 months", "every mon").
- **Waiting For:** records who, since when (set automatically), a follow-up date that resurfaces the item as something to chase, and an optional project link. A waiting item counts as its project's next step, so the project isn't flagged as stalled.
- **Tickler:** any item can get a "bring back on" date, and on that date it returns to the Inbox. Defer (start) dates hide next actions until their date.
- **Areas of focus:** projects belong to areas (Work, Home, Health…), which can be used for grouping and for review.
- **Project support:** each project has a notes page and attached files.
- **Weekly Review:** a guided checklist that runs get clear → projects → Waiting For → Someday/Maybe → upcoming dates. Claude pre-flags stalled projects, stale waiting items and vague actions, and suggests edits the owner accepts or rejects one by one. The date of the last review is shown.
- **Export:** everything can be exported as Markdown (one file per list) plus a JSON dump, so there is no lock-in. Automatic backup and import are not in scope for now.
- **Theme:** follows the macOS appearance, with a light daytime theme and a dark evening theme, both designed in their own right.
- **Not in scope yet:** calendar view, global capture hotkey, multiple devices, import.

## Evidence on Hand

None yet. The project folder is empty.

## Product Principles

1. **Capture must be instant.** Getting something into the inbox should never require deciding anything.
2. **Claude proposes, the owner disposes.** Every AI outcome is a reviewable suggestion, never a silent change.
3. **Density over decoration.** The lists are working surfaces: many rows visible and editable in place.
4. **Keyboard first, everything has a shortcut.** If an action can't be done from the keyboard, it isn't finished.
5. **Faithful to GTD.** Use the method's vocabulary and flow rather than inventing a new productivity model.
6. **The owner's data stays with the owner.** It is local-first and portable.

## Accessibility & Inclusion

Full keyboard operability is a product requirement, not just an accessibility nicety. Focus must always be visible, and nothing can trap it. Every command must be discoverable from the keyboard (a shortcut reference and command palette). Semantic markup (grid/listbox roles) should keep the lists usable with a screen reader.
