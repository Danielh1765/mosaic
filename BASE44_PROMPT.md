# Mosaic — Base44 build prompt
Last updated: 2026-10-14 · Built from the working local v2 (`SPEC.md`). Paste everything inside the box into Base44.

```
Build "Mosaic": a visual-first personal workspace. Pages are shown as big image cards. Every card is a page, and every page can hold more cards (unlimited nesting). Each list of cards can be shown as a Gallery, a Table or a Board. Keep it simple: one user, no teams, no comments, no automations.

## Data (entities)
Page
- title (text, default "Untitled")
- icon (text, one emoji, optional)
- cover (image upload, optional)
- parent (reference to Page, empty = top level)
- order (number, for manual sort among siblings)
- folder_link (text, optional: a URL or a file path the page relates to)
- status (text, optional: the board column this page sits in)
- body (long text, Markdown)
- card_shape (wide | square | portrait | tall, default portrait) — applies to this page's child cards
- card_size (s | m | l, default m) — applies to this page's child cards
- view (gallery | table | board, default gallery) — how this page shows its child cards
- board_columns (list of text, default ["To do", "Doing", "Done"])
Use the built-in created and updated dates.

WorkspaceSettings (one record): the same card_shape, card_size, view and board_columns fields, used for the Home page.

## Screens
1. Sidebar (left, always visible on desktop, hidden behind a menu button on phones)
   - App name with a small four-tile logo.
   - Search box (shortcut Cmd/Ctrl+K). Matches page titles and body text. Results show as cards.
   - Page tree: top-level pages, each with an expand arrow when it has child pages. The open page is highlighted.
   - "+ New page" button at the bottom: creates a child of the open page (or a top-level page on Home).
2. Home: title "Home" and the top-level pages, shown with the view chosen in WorkspaceSettings.
3. Page
   - If the page has a cover: a full-width banner (240px tall) with "Change cover" and "Remove" buttons that appear on hover.
   - Breadcrumb: Home / parent / parent.
   - Icon (click to pick from an emoji grid or type any emoji; option to remove).
   - Title: a large editable heading. Saves as you type.
   - Row of small actions: folder link chip, "Add cover" (when there is none), "More" menu.
   - Folder link chip: shows the link in a monospace font with an "Open" button (opens it in a new tab) and a "Change" button. When empty, show "Link a folder".
   - Collection: the child pages (see Views).
   - Body: Markdown shown formatted. Click it to edit as plain text; click away to see it formatted again. Supports headings, bold, italic, links, lists, numbered lists, quotes, code, dividers and task boxes "- [ ]". Task boxes can be ticked in the formatted view and the tick saves to the body. Auto-save while typing, with a small "Saving… / Saved" note.

## Collection toolbar (sticky at the top while scrolling, frosted see-through background)
- View switch: Gallery | Table | Board.
- Item count.
- Gallery only: card shape switch (Wide 16:10, Square 1:1, Portrait 3:4, Tall 9:16, each with a tiny shape icon) and size switch (S, M, L).
- "+ New" button: creates a child page and opens it with the title selected.
Every setting saves to the page (or to WorkspaceSettings on Home).

## Views
Gallery (the main feature: cards must dominate the screen)
- Responsive grid. Minimum card width: S 170px, M 240px, L 340px. 20px gap.
- The cover fills the whole card at the chosen shape. No cover = a colourful gradient picked from the page id, with the icon large in the centre.
- Title (and icon) sit on the image at the bottom, over a dark fade for readability. Under the title: a status chip (coloured dot + name) and "N inside" when the page has children.
- On hover: card lifts slightly and the image zooms 4%. Two small buttons appear top-right: folder link (only if set) and "⋯" menu.
- "⋯" menu: Open, Add/Change cover, Remove cover, Change icon, Link/Change folder, Add a card inside, Move to trash.
- Drag cards to reorder. Drop an image file on a card to make it the cover.
- A dashed "+ Add a card" tile ends the grid.

Table
- Columns: Name (cover thumbnail or gradient + editable title + "Open" button on row hover), Status (dropdown of the board columns plus "No status"), Folder (last part of the link, click to open), Inside (child count), Updated (relative time: "Just now", "5 min ago", "3 h ago", "2 d ago", then a date).
- Click a column header to sort; click again to reverse. Arrow shows the direction.
- "+ New row" under the table.

Board
- One column per board_columns entry. Show a "No status" column first, only when some cards have no status. Each column header: coloured dot, name, count, "⋯" menu (rename, delete). Deleting a column moves its cards to "No status" after a confirm; it never deletes pages.
- Cards: optional cover strip (16:9), icon + title, "N inside" and a folder button.
- Drag a card to another column to change its status, or within a column to reorder. Click (without dragging) opens the page.
- Each column ends with "+ New" (creates a page already in that column).
- A dashed "+ Add column" input at the end: type a name and press Enter.

## Delete
"Move to trash" asks to confirm and says how many child pages go with it. Use a soft delete (a trashed flag), never a hard delete.

## Look
- Own style, not Notion: warm paper background (#f6f3ee), white-ish surfaces (#fffdf9), dark ink text (#1f1b16), soft grey text (#6b6258), lines #e2dbd0, burnt-orange accent (#c2410c).
- Dark mode follows the system: background #171411, surface #241f1a, text #f2ece4, accent #f97316.
- Titles in a serif font (Georgia-like), tight letter spacing on big headings (-0.02em). Body in the system sans-serif font.
- Rounded corners: cards 14px, buttons 10px. Soft layered shadows.
- Works at phone width: one column of content, 16px side margins, no sideways page scroll (the board may scroll sideways inside itself).

## Feel (motion rules)
- Every button and card reacts on press, not on release (shrink to 96–98%).
- Board drag: the card stays exactly under the pointer from where it was grabbed, lifts (scale 1.03, deeper shadow) and tilts slightly in the direction of movement. Other cards slide smoothly out of the way. On release it springs into its new slot (slight bounce, about 0.3s) and continues at the speed the pointer was moving. No jumps.
- Menus grow out of the button that opened them. Views cross-fade when switched.
- Respect "reduce motion" (no movement, fades only), "reduce transparency" (solid toolbar) and "increase contrast" (solid backgrounds, visible borders).

## Check before you finish
1. I can create a page, nest a page inside it, and see both in the sidebar tree.
2. Changing card shape and size on one page does not change other pages.
3. A card with no cover shows a gradient and its icon; uploading a cover replaces it.
4. Moving a card between board columns changes its status in the table view too.
5. Sorting the table by Status follows the board column order.
6. Trashed pages and their children disappear from every view and from search.
7. The layout works on a 375px-wide phone screen.
```

## What changes from the local version
- **Data lives in Base44's database**, not Markdown files on your drive. Obsidian cannot read it.
- **The folder button opens a link in a new tab.** A web app cannot open Finder. Use Google Drive or Notion links, or paths you copy.
- **Delete is a soft delete.** Base44 keeps the record with a "trashed" flag, the same idea as the local trash folder.
