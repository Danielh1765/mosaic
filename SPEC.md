# Mosaic — Spec
Last updated: 2026-10-14 · Source: one screenshot of Dan's Notion "Mothership → 02 Areas" page (S1). Method: REA outside-in reverse engineering.

## 1. Checklist
| # | Question | Status |
|---|---|---|
| 1 | What screens exist? | Partly answered. S1 shows sidebar + page with gallery. Page detail view not seen. |
| 2 | What does a card show? | Answered. Cover image, icon, title, a text property ("Hard drive home"). |
| 3 | How is a card created? | Partly. "New" button seen (S1). Flow not seen. |
| 4 | How are cards sorted / filtered? | Open. Toolbar icons seen (S1). Behaviour not seen. |
| 5 | What is inside a card page? | Open. Not captured. |
| 6 | How are covers set? | Open. Not captured. |
| 7 | What does the sidebar hold? | Partly. Search, Home, New chat, Library, events, Recents (S1). |

**Next captures for open items:** (4) click the filter and sort icons on S1 and screenshot each menu. (5) open the Health card and screenshot the full page. (6) hover a cover, click "Change cover", screenshot the picker.

## 2. Findings
| Feature | Finding | Status | Source |
|---|---|---|---|
| Gallery | Cards in a 3-column grid with landscape covers | OBSERVED | S1 |
| Card | Icon + title under the cover | OBSERVED | S1 |
| Card | "Hard drive home" text field holding a Transcend path, shown as plain text | OBSERVED | S1 |
| Card | The path is not clickable | INFERRED | S1 (styled as code, no link) |
| Gallery toolbar | Filter, sort, automations, search, expand, settings, New | OBSERVED | S1 |
| Gallery | Cover shape is fixed landscape | INFERRED | S1 (all cards same ratio) |
| Page | Breadcrumb shows parent page | OBSERVED | S1 ("Mothership") |
| Sort order | Manual order | UNKNOWN | — |

## 3. Data model
**Page** (one `.md` file each)
| Field | Type | Set by |
|---|---|---|
| id | text | create |
| title | text | page title input |
| icon | emoji | icon picker |
| cover | path or URL | cover upload / drop / paste |
| parent | page id | create, drag onto sidebar |
| order | number | drag reorder |
| folder | absolute path | "Link a folder" |
| cardRatio | landscape · square · portrait · tall | gallery toolbar |
| cardSize | s · m · l | gallery toolbar |
| view | gallery · table · board | view switcher |
| status | text (a board column) | board drag, table status picker |
| boardColumns | column names, `|`-separated | board add / rename / delete column |
| created, updated | ISO date | server |
| body | Markdown | text editor |

**Settings** (`.mosaic.json`): Home gallery cardRatio, cardSize.

## 4. Build this
Observed behaviour kept: nested pages, card galleries with covers, icons, titles, a folder path per card, breadcrumb, sidebar tree, search.

New design choices (Mosaic, not Notion):
1. Cards are the main thing. Big covers fill the whole card. Title sits on the image.
2. Four card shapes (Wide, Square, Portrait, Tall) and three sizes, set per page.
3. Folder link is live: one click opens Finder. Missing folders show red.
4. Drop an image file on a card to set its cover. Paste works on a page.
5. Pages are plain Markdown files on disk. No account, no cloud, no lock-in.
6. Delete moves to a trash folder. Nothing is erased.
7. Less clutter: no automations, no comments, no database properties in v1.
8. Own look: warm paper background, serif titles, burnt-orange accent, gradient covers when no image.

## 5. Not in v1 (next candidates)
Filters · cover crop position · Obsidian vault as workspace · Claude assistant.

## 6. v2 (2026-10-14): Table + Board, Apple fluid-interface pass
- Table: inline title edit, status picker, folder button, sortable headers.
- Board: columns from `boardColumns`, "No status" column when needed. Pointer drag tracks 1:1 with the grab offset, tilts with speed, settles on a spring (damping 0.82, response 0.32) that starts from the release velocity. Other cards slide out of the way (FLIP).
- Press feedback on pointer-down. Translucent sticky toolbar. Popovers grow from their trigger. Tighter tracking on big titles.
- Respects reduced motion, reduced transparency and high contrast.
