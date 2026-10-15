# Mosaic
Last updated: 2026-10-15 (v3.1, block editor)

A visual-first page and card app. A personal alternative to Notion. Use it online at https://mosaic-iota-one.vercel.app or on this Mac at http://localhost:4321. Both show the same pages. Sign in with your Mosaic account.

## Start it
Double-click `Start Mosaic.command`. Your browser opens at http://localhost:4321. Close the Terminal window to stop it.

Or in Terminal:
```bash
node "/Volumes/Transcend/02 Areas/AI/SAAS/Mosaic/server.mjs"
```
Transcend must be plugged in. The Mac app needs the internet.

No internet? Start it in offline mode. It uses only the Mac copy in `workspace/`, and online changes made while offline are not included:
```bash
MOSAIC_STORE=files node "/Volumes/Transcend/02 Areas/AI/SAAS/Mosaic/server.mjs"
```

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
- **Folders:** link a page to a real folder (⌥⌘C in Finder copies the path). The 📁 button opens it in Finder (Mac app only). A red, crossed-out path means the folder is missing.
- **Reorder:** drag cards. Drop a card on a sidebar page to move it inside that page.
- **Write:** click anywhere on the page and type. The page always stays formatted. Click below the last line to add more.
- **"/" menu:** type `/` for Text, Heading 1–3, Toggle list, Toggle heading 1–3, Bulleted list, Numbered list, To-do, Callout, Quote, Divider, Code, Page (a new page inside this one), Table or Gallery. Type a word after `/` to filter. Arrow keys + Enter pick.
- **Shortcuts at the start of a line:** `# ` `## ` `### ` headings, `- ` bullet, `1. ` numbered, `[] ` to-do, `> ` quote, ` ``` ` code, `---` divider. `**bold**`, `*italic*` and `` `code` `` show formatted after you press Enter.
- **Blocks:** hover a line. `+` adds a line below. Drag `⋮⋮` to move it. Click `⋮⋮` to duplicate, delete, turn it into another block, or change a callout's colour. Click a callout's emoji to change it.
- **Keys:** Enter = new line (twice leaves a list or a box). Backspace at the start of a line joins it to the line above. Links open with a click.
- **Table block (`/table`):** starts as 3 × 3. Click a cell and type. Tab = next cell (Tab in the last cell adds a row). Shift+Tab = back. Enter = cell below. Hover the table for **+ Row**, **+ Column**, **− Row**, **− Column** (they act where the cursor is). The top row is the header. Saves as a normal Markdown table (`| a | b |`), so Obsidian shows it too. Markdown tables already in a page open as this block.
- **Gallery block (`/gallery`):** pick a page from the search list (arrows + Enter, Esc cancels). Its cards show inline as small covers (first 12, then "See all"). Click a card to open it. Hover → **Change page** to pick another. Saves as one line, `[Gallery: Title](#/gallery/<id>)`, which Obsidian shows as a plain link.
- Pages still save as Markdown. Toggles save as Obsidian foldable callouts (`> [!toggle]- Title`).
- **Poster pages:** when a list uses Poster, Portrait or Tall cards, each page inside shows its cover as a poster beside the details.
- **From Notion (2026-10-14):** Movies (351), Series (60) and Documentaries (27) live in 02 Areas › Enjoyment › Entertainment. Posters are saved in `workspace/covers/media/`.
- **From Notion, goals (2026-10-14):** 13 Quarterly Quests filed under their pillars (status "Quest"). Meaning holds the Quarterly Quests overview (links to every quest), Future Sketch, Days and Weeks. Templates and empty pages were skipped.
- **Search:** ⌘K. Searches titles and text.
- **Delete:** ⋯ → Move to trash.
- **Trash:** click Trash in the sidebar. Restore brings back a page and everything inside it. "Delete forever" erases it (asks first).
- **Covers credit:** the 12 Areas photos are openly licensed (Openverse). Each page ends with the photo credit.

## Where your data lives
- **Online is the main copy.** Pages are in the Supabase project "mosaic" (London, free plan), table `pages`. Covers are in the private `covers` bucket. Only your account can read them.
- **Mac copy (save to Mac):** every time the Mac app loads or saves, it copies the online pages to `workspace/*.md` and covers to `workspace/covers/`. Obsidian and Jarvis can read them. Pages deleted online move to `workspace/.trash/`. Nothing is erased.
- Edits made in `workspace/*.md` by hand do **not** go online. Edit in Mosaic.
- Backup from before the move online: `workspace-backup-2026-10-15/` (Mac only).
- One account only. New sign-ups are blocked in the database.
- Free Supabase sleeps after 7 days with no use. Wake it in the Supabase dashboard (Restore project).

## Update the live site
- Commit and `git push` to `main`. Vercel deploys by itself. Code: https://github.com/Danielh1765/mosaic (public, no pages in it).
- Vercel CLI ignores `.gitignore`. Keep `workspace/` in `.vercelignore`.
- `vercel.json` needs `"framework": null`, or Vercel runs `public/app.js` as the server.

## Files
- `server.mjs` — the server (Node built-ins only). Same code on the Mac and on Vercel.
- `store-cloud.mjs` — reads and writes pages and covers in Supabase as the signed-in user.
- `store-files.mjs` — reads and writes `workspace/` (offline mode and the Mac copy).
- `mirror.mjs` — first upload from the Mac, then save to Mac.
- `auth.mjs` — sign-in, 30-day session cookie. `config.mjs` — Supabase address and public key.
- `api/index.mjs` — Vercel entry.
- `public/` — the app (`index.html`, `app.css`, `app.js`, `editor.js` = the block editor).
- `SPEC.md` — reverse-engineering notes and build spec.
