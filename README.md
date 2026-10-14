# Mosaic
Last updated: 2026-10-14 (v2)

A visual-first page and card app. A personal alternative to Notion. Runs on this Mac only. No internet needed.

## Start it
Double-click `Start Mosaic.command`. Your browser opens at http://localhost:4321. Close the Terminal window to stop it.

Or in Terminal:
```bash
node "/Volumes/Transcend/02 Areas/AI/SAAS/Mosaic/server.mjs"
```
Transcend must be plugged in.

Stop it:
```bash
lsof -ti tcp:4321 | xargs kill
```

## Use it
- **Three views:** Gallery, Table or Board. Switch at the top of any card list. Each page remembers its view.
- **Board:** drag cards between columns to change their status. Click a card to open it. Type in "+ Add column" and press Enter. Use ⋯ on a column to rename or delete it (cards go to "No status").
- **Table:** click a title to rename it. Pick a status from the list. Click a column header to sort.
- **Cards are pages.** Click a card to open it. Each page can hold more cards.
- **Card shape:** Wide, Square, Portrait or Tall. Size: S, M or L. Each page remembers its own setting.
- **Covers:** drag an image from Finder onto a card. Or open a page and paste an image (⌘V). Or use ⋯ → Add cover.
- **Folders:** link a page to a real folder (⌥⌘C in Finder copies the path). The 📁 button opens it in Finder. A red, crossed-out path means the folder is missing.
- **Reorder:** drag cards. Drop a card on a sidebar page to move it inside that page.
- **Write:** click the text area under the cards. Markdown works. Click a `[ ]` box to tick it.
- **Callouts:** while editing, click 💡 Callout, or type `> [!🍿 gray]` then `> your text` on the next lines. Colours: gray, brown, orange, yellow, green, blue, purple, pink, red. Obsidian types like `> [!tip]` work too.
- **Poster pages:** when a list uses Poster, Portrait or Tall cards, each page inside shows its cover as a poster beside the details.
- **From Notion (2026-10-14):** Movies (351), Series (60) and Documentaries (27) live in 02 Areas › Enjoyment › Entertainment. Posters are saved in `workspace/covers/media/`.
- **From Notion, goals (2026-10-14):** 13 Quarterly Quests filed under their pillars (status "Quest"). Meaning holds the Quarterly Quests overview (links to every quest), Future Sketch, Days and Weeks. Templates and empty pages were skipped.
- **Search:** ⌘K. Searches titles and text.
- **Delete:** ⋯ → Move to trash. Files go to `workspace/.trash/`.
- **Trash:** click Trash in the sidebar. Restore brings back a page and everything inside it. "Delete forever" erases it (asks first).
- **Covers credit:** the 12 Areas photos are openly licensed (Openverse). Each page ends with the photo credit.

## Where your data lives
- Pages: `workspace/*.md` (frontmatter + Markdown). Obsidian and Jarvis can read them.
- Cover images: `workspace/covers/`.
- Home gallery settings: `workspace/.mosaic.json`.
- Use another folder: `MOSAIC_WORKSPACE="/path" node server.mjs`.

## Live demo (2026-10-14)
- Site: https://mosaic-iota-one.vercel.app · Code: https://github.com/Danielh1765/mosaic (public).
- The demo shows the sample pages in `demo-workspace/`. Your real `workspace/` never goes online (`.gitignore` and `.vercelignore` both block it).
- Edits on the live site work but reset when Vercel restarts the server. Visitors share one copy.
- To update the live site: commit and `git push`. Vercel deploys by itself.
- Vercel CLI ignores `.gitignore`. Keep `workspace/` in `.vercelignore`.

## Files
- `api/index.mjs` — Vercel entry. Copies `demo-workspace/` to `/tmp` and runs `server.mjs` on it.
- `demo-workspace/` — sample pages for the live demo.
- `server.mjs` — local server, Node built-ins only (no installs).
- `public/` — the app (`index.html`, `app.css`, `app.js`).
- `SPEC.md` — reverse-engineering notes and build spec.
