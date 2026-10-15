// File store: pages are Markdown files in a workspace folder, covers are images in workspace/covers.
// Used offline (MOSAIC_STORE=files) and as the Mac copy that mirrors the online database.
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";

const FIELD_ORDER = ["id", "title", "icon", "cover", "parent", "order", "folder", "cardRatio", "cardSize", "view", "status", "boardColumns", "created", "updated"];

/** @typedef {{id:string,title:string,order:number,body:string,file?:string,[key:string]:any}} Page */
/** @typedef {{page:Page,trashFile:string,stamp:string}} TrashItem */

/** @returns {string} */
export const newId = () => Math.random().toString(36).slice(2, 8);

/** @param {string} title @returns {string} */
export const slugify = (title) =>
  (title || "untitled").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 50) || "untitled";

/** @param {string} raw @param {string} file @returns {Page|null} */
export function parsePage(raw, file) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  /** @type {Record<string, any>} */
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (value.startsWith('"')) {
      try { meta[key] = JSON.parse(value); } catch { meta[key] = value.slice(1, -1); }
    } else if (/^-?\d+(\.\d+)?$/.test(value)) meta[key] = Number(value);
    else meta[key] = value;
  }
  if (!meta.id) return null;
  return { order: 0, title: "Untitled", ...meta, id: String(meta.id), body: match[2], file };
}

/** @param {Page} page @returns {string} */
export function serializePage(page) {
  const lines = FIELD_ORDER.filter((k) => page[k] !== undefined && page[k] !== "" && page[k] !== null).map((k) =>
    typeof page[k] === "number" ? `${k}: ${page[k]}` : `${k}: ${JSON.stringify(String(page[k]))}`
  );
  return `---\n${lines.join("\n")}\n---\n${page.body || ""}`;
}

/** @param {string} workspace @returns {object} */
export function createFileStore(workspace) {
  const covers = path.join(workspace, "covers");
  const trashDir = path.join(workspace, ".trash");
  const settingsFile = path.join(workspace, ".mosaic.json");

  /** @param {string} dir @returns {Promise<Page[]>} */
  async function readDir(dir) {
    if (!existsSync(dir)) return [];
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md"));
    const pages = await Promise.all(names.map(async (name) => parsePage(await fs.readFile(path.join(dir, name), "utf8"), name)));
    return pages.filter(Boolean);
  }

  /** @returns {Promise<Map<string, Page>>} */
  async function listPages() {
    return new Map((await readDir(workspace)).map((p) => [p.id, p]));
  }

  /** @param {Page} page @returns {Promise<Page>} */
  async function savePage(page) {
    const file = `${slugify(page.title)}-${page.id}.md`;
    await fs.writeFile(path.join(workspace, file), serializePage(page));
    if (page.file && page.file !== file) await fs.rm(path.join(workspace, page.file), { force: true });
    page.file = file;
    return page;
  }

  /** @param {Page[]} pages @returns {Promise<void>} */
  async function savePages(pages) {
    const existing = await listPages();
    await Promise.all(pages.map((p) => savePage({ ...p, file: p.file || existing.get(p.id)?.file })));
  }

  /** @param {string[]} ids @param {string} stamp @returns {Promise<void>} */
  async function trash(ids, stamp) {
    const pages = await listPages();
    await fs.mkdir(trashDir, { recursive: true });
    for (const id of ids) {
      const file = pages.get(id)?.file;
      if (file) await fs.rename(path.join(workspace, file), path.join(trashDir, `${stamp}-${file}`));
    }
  }

  /** @returns {Promise<TrashItem[]>} */
  async function listTrash() {
    return (await readDir(trashDir)).map((page) => ({ page, trashFile: page.file, stamp: page.file.slice(0, 24) }));
  }

  /** @param {string} stamp @returns {Promise<string[]>} */
  async function restore(stamp) {
    const batch = (await listTrash()).filter((t) => t.stamp === stamp);
    const live = await listPages();
    for (const t of batch) live.set(t.page.id, t.page);
    for (const t of batch) {
      const page = { ...t.page, file: "" };
      if (page.parent && !live.has(page.parent)) page.parent = "";
      await savePage(page);
      await fs.rm(path.join(trashDir, t.trashFile), { force: true });
    }
    return batch.map((t) => t.page.id);
  }

  /** @param {string} stamp @returns {Promise<string[]>} */
  async function purge(stamp) {
    const batch = (await listTrash()).filter((t) => t.stamp === stamp);
    for (const t of batch) await fs.rm(path.join(trashDir, t.trashFile), { force: true });
    return batch.map((t) => t.trashFile);
  }

  /** @returns {Promise<object>} */
  async function readSettings() {
    try { return JSON.parse(await fs.readFile(settingsFile, "utf8")); } catch { return { cardRatio: "portrait", cardSize: "m" }; }
  }

  /** @param {object} settings @returns {Promise<void>} */
  async function writeSettings(settings) {
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
  }

  /** @param {string} rel path inside covers/, e.g. "media/x.jpg" @param {Buffer} data @returns {Promise<void>} */
  async function putCover(rel, data) {
    const target = path.join(covers, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  /** @param {string} rel @returns {Promise<Buffer|null>} */
  async function readCover(rel) {
    const target = path.normalize(path.join(covers, rel));
    if (!target.startsWith(covers + path.sep)) return null;
    try { return await fs.readFile(target); } catch { return null; }
  }

  /** @returns {Promise<string[]>} every cover path inside covers/, e.g. "media/x.jpg" */
  async function listCovers() {
    if (!existsSync(covers)) return [];
    const entries = await fs.readdir(covers, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => path.relative(covers, path.join(e.parentPath, e.name)));
  }

  /** @param {string[]} ids @returns {Promise<void>} */
  async function reorder(ids) {
    const pages = await listPages();
    const changed = ids.map((id, i) => pages.get(id) && pages.get(id).order !== i + 1 ? { ...pages.get(id), order: i + 1 } : null).filter(Boolean);
    await Promise.all(changed.map(savePage));
  }

  return { kind: "files", workspace, listPages, savePage, savePages, trash, listTrash, restore, purge, readSettings, writeSettings, putCover, readCover, listCovers, reorder };
}
