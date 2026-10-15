// Mac link for the online Mosaic.
// 1. First sign-in on the Mac: if the online account is empty, upload every page, trashed page, setting and cover.
// 2. After that, "save to Mac": keep workspace/*.md and workspace/covers as a copy of the online pages,
//    so Obsidian and Jarvis can still read them. Pages removed online move to workspace/.trash, never deleted.
import { promises as fs } from "node:fs";
import path from "node:path";
import { serializePage, slugify } from "./store-files.mjs";

const COVER_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml" };

/** @param {any[]} items @param {number} limit @param {(item:any)=>Promise<void>} fn @returns {Promise<void>} */
async function inBatches(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < items.length) await fn(items[next++]); }));
}

/**
 * @param {object} cloud cloud store for the signed-in user
 * @param {object} files file store for the Mac workspace
 * @returns {Promise<{pages:number,covers:number}|null>} what was uploaded, or null when nothing needed uploading
 */
export async function importFromMac(cloud, files) {
  const settings = await cloud.readSettings();
  if (settings.importedFromMac || (await cloud.countAll()) > 0) return null;
  const pages = [...(await files.listPages()).values()];
  if (pages.length === 0) return null;

  await cloud.savePages(pages);
  const trashed = await files.listTrash();
  const byStamp = Map.groupBy(trashed, (t) => t.stamp);
  for (const [stamp, items] of byStamp) await cloud.upsertTrashed(items.map((t) => t.page), stamp);

  const covers = await files.listCovers();
  await inBatches(covers, 6, async (rel) => {
    const data = await files.readCover(rel);
    if (data) await cloud.putCover(rel, data, COVER_TYPES[path.extname(rel).toLowerCase()]);
  });

  await cloud.writeSettings({ ...(await files.readSettings()), importedFromMac: true });
  return { pages: pages.length, covers: covers.length };
}

/**
 * Makes the Mac workspace match the online pages.
 * @param {object} cloud @param {object} files @param {Map<string, object>} cloudPages
 * @returns {Promise<{written:number,moved:number,covers:number}>}
 */
export async function saveToMac(cloud, files, cloudPages) {
  const settings = await cloud.readSettings();
  if (!settings.importedFromMac || cloudPages.size === 0) return { written: 0, moved: 0, covers: 0 };

  const local = await files.listPages();
  let written = 0;
  for (const page of cloudPages.values()) {
    const mine = local.get(page.id);
    const sameFile = mine && mine.file === `${slugify(page.title)}-${page.id}.md`;
    if (sameFile && serializePage(mine) === serializePage(page)) continue;
    await files.savePage({ ...page, file: mine?.file });
    written++;
  }

  const gone = [...local.keys()].filter((id) => !cloudPages.has(id));
  if (gone.length) await files.trash(gone, new Date().toISOString().replace(/[:.]/g, "-"));

  const wanted = [...new Set([...cloudPages.values()].map((p) => p.cover).filter((c) => c && c.startsWith("covers/")).map((c) => c.slice(7)))];
  const have = new Set(await files.listCovers());
  const missing = wanted.filter((rel) => !have.has(rel));
  await inBatches(missing, 6, async (rel) => {
    const data = await cloud.readCover(rel);
    if (data) await files.putCover(rel, data);
  });

  const { importedFromMac, ...homeSettings } = settings;
  await files.writeSettings(homeSettings);
  return { written, moved: gone.length, covers: missing.length };
}
