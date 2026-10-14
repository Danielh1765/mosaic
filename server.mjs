// Mosaic local server. Zero dependencies: Node built-ins only.
// Pages are Markdown files in ./workspace. Covers are images in ./workspace/covers.
import http from "node:http";
import { promises as fs, existsSync, statSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.MOSAIC_WORKSPACE || path.join(ROOT, "workspace");
const COVERS = path.join(WORKSPACE, "covers");
const TRASH = path.join(WORKSPACE, ".trash");
const SETTINGS_FILE = path.join(WORKSPACE, ".mosaic.json");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 4321);
const HOST = "127.0.0.1";

const FIELD_ORDER = ["id", "title", "icon", "cover", "parent", "order", "folder", "cardRatio", "cardSize", "view", "status", "boardColumns", "created", "updated"];
const EDITABLE = ["title", "icon", "cover", "parent", "order", "folder", "cardRatio", "cardSize", "view", "status", "boardColumns", "body"];
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".avif": "image/avif", ".json": "application/json",
};
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]);

/** @typedef {{id:string,title:string,icon?:string,cover?:string,parent?:string,order:number,folder?:string,cardRatio?:string,cardSize?:string,created?:string,updated?:string,body:string,file:string}} Page */

/** @returns {string} */
const newId = () => Math.random().toString(36).slice(2, 8);

/** @param {string} title @returns {string} */
const slugify = (title) =>
  (title || "untitled").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 50) || "untitled";

/** @param {string} raw @returns {Page|null} */
function parsePage(raw, file) {
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
function serializePage(page) {
  const lines = FIELD_ORDER.filter((k) => page[k] !== undefined && page[k] !== "" && page[k] !== null).map((k) =>
    typeof page[k] === "number" ? `${k}: ${page[k]}` : `${k}: ${JSON.stringify(String(page[k]))}`
  );
  return `---\n${lines.join("\n")}\n---\n${page.body || ""}`;
}

/** @returns {Promise<Map<string, Page>>} */
async function loadPages() {
  const pages = new Map();
  const names = await fs.readdir(WORKSPACE);
  await Promise.all(
    names.filter((n) => n.endsWith(".md")).map(async (name) => {
      const page = parsePage(await fs.readFile(path.join(WORKSPACE, name), "utf8"), name);
      if (page) pages.set(page.id, page);
    })
  );
  return pages;
}

/** @param {Page} page @returns {Promise<Page>} */
async function writePage(page) {
  const file = `${slugify(page.title)}-${page.id}.md`;
  await fs.writeFile(path.join(WORKSPACE, file), serializePage(page));
  if (page.file && page.file !== file) await fs.rm(path.join(WORKSPACE, page.file), { force: true });
  page.file = file;
  return page;
}

/** @param {string|undefined} folder @returns {boolean} */
const folderExists = (folder) => Boolean(folder) && existsSync(folder);

/** @param {Page} page @returns {object} */
const toClient = ({ file, ...page }) => ({ ...page, folderExists: folderExists(page.folder) });

/** @returns {Promise<object>} */
async function readSettings() {
  try { return JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8")); } catch { return { cardRatio: "portrait", cardSize: "m" }; }
}

/** @param {http.IncomingMessage} req @param {number} limit @returns {Promise<Buffer>} */
function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("Body too large")); req.destroy(); } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** @param {http.ServerResponse} res @param {number} status @param {any} data */
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

/** @param {http.ServerResponse} res @param {string} baseDir @param {string} relPath */
async function sendStatic(res, baseDir, relPath) {
  const filePath = path.normalize(path.join(baseDir, decodeURIComponent(relPath)));
  if (!filePath.startsWith(baseDir)) return sendJson(res, 403, { error: "Forbidden" });
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

/** @param {Map<string, Page>} pages @param {string} id @returns {string[]} */
function descendantsOf(pages, id) {
  const out = [];
  for (const p of pages.values()) if (p.parent === id) out.push(p.id, ...descendantsOf(pages, p.id));
  return out;
}

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const json = async () => JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString("utf8") || "{}");

  if (parts[1] === "pages" && parts.length === 2 && req.method === "GET") {
    const pages = await loadPages();
    return sendJson(res, 200, { pages: [...pages.values()].map(toClient), settings: await readSettings() });
  }

  if (parts[1] === "pages" && parts.length === 2 && req.method === "POST") {
    const input = await json();
    const pages = await loadPages();
    const siblings = [...pages.values()].filter((p) => (p.parent || "") === (input.parent || ""));
    const now = new Date().toISOString();
    const page = await writePage({
      id: newId(), title: input.title || "Untitled", icon: input.icon || "", parent: input.parent || "", status: input.status || "",
      order: siblings.reduce((m, p) => Math.max(m, p.order || 0), 0) + 1, body: "", created: now, updated: now, file: "",
    });
    return sendJson(res, 201, toClient(page));
  }

  if (parts[1] === "pages" && parts.length === 3 && req.method === "PUT") {
    const input = await json();
    const pages = await loadPages();
    const page = pages.get(parts[2]);
    if (!page) return sendJson(res, 404, { error: "Page not found" });
    if (input.parent && (input.parent === page.id || descendantsOf(pages, page.id).includes(input.parent)))
      return sendJson(res, 400, { error: "A page cannot live inside itself" });
    for (const key of EDITABLE) if (key in input) page[key] = input[key];
    page.updated = new Date().toISOString();
    return sendJson(res, 200, toClient(await writePage(page)));
  }

  if (parts[1] === "pages" && parts.length === 3 && req.method === "DELETE") {
    const pages = await loadPages();
    if (!pages.has(parts[2])) return sendJson(res, 404, { error: "Page not found" });
    const ids = [parts[2], ...descendantsOf(pages, parts[2])];
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.mkdir(TRASH, { recursive: true });
    for (const id of ids) {
      const file = pages.get(id).file;
      await fs.rename(path.join(WORKSPACE, file), path.join(TRASH, `${stamp}-${file}`));
    }
    return sendJson(res, 200, { trashed: ids });
  }

  if (parts[1] === "trash" && parts.length === 2 && req.method === "GET") {
    const names = existsSync(TRASH) ? await fs.readdir(TRASH) : [];
    const items = [];
    for (const name of names.filter((n) => n.endsWith(".md"))) {
      const page = parsePage(await fs.readFile(path.join(TRASH, name), "utf8"), name);
      if (!page) continue;
      const stamp = name.slice(0, 24);
      const trashedAt = stamp.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "$1:$2:$3.$4Z");
      items.push({ ...toClient(page), trashFile: name, stamp, trashedAt });
    }
    return sendJson(res, 200, { items });
  }

  if (parts[1] === "trash" && parts[2] === "restore" && req.method === "POST") {
    const { trashFile } = await json();
    const names = existsSync(TRASH) ? await fs.readdir(TRASH) : [];
    if (!names.includes(trashFile)) return sendJson(res, 404, { error: "That page is not in the trash" });
    const stamp = trashFile.slice(0, 24);
    const batch = names.filter((n) => n.startsWith(stamp) && n.endsWith(".md"));
    const pages = await loadPages();
    const restoredIds = [];
    for (const name of batch) {
      const page = parsePage(await fs.readFile(path.join(TRASH, name), "utf8"), name);
      if (!page) continue;
      restoredIds.push(page.id);
      pages.set(page.id, page);
    }
    for (const name of batch) {
      const page = parsePage(await fs.readFile(path.join(TRASH, name), "utf8"), name);
      if (!page) continue;
      if (page.parent && !pages.has(page.parent)) page.parent = "";
      page.file = "";
      await writePage(page);
      await fs.rm(path.join(TRASH, name), { force: true });
    }
    return sendJson(res, 200, { restored: restoredIds });
  }

  if (parts[1] === "trash" && parts.length === 3 && req.method === "DELETE") {
    const name = decodeURIComponent(parts[2]);
    const target = path.normalize(path.join(TRASH, name));
    if (!target.startsWith(TRASH + path.sep) || !existsSync(target)) return sendJson(res, 404, { error: "That page is not in the trash" });
    const batch = (await fs.readdir(TRASH)).filter((n) => n.startsWith(name.slice(0, 24)) && n.endsWith(".md"));
    for (const n of batch) await fs.rm(path.join(TRASH, n), { force: true });
    return sendJson(res, 200, { deleted: batch });
  }

  if (parts[1] === "reorder" && req.method === "POST") {
    const { ids } = await json();
    const pages = await loadPages();
    await Promise.all(ids.map((id, i) => {
      const page = pages.get(id);
      if (!page || page.order === i + 1) return null;
      page.order = i + 1;
      return writePage(page);
    }));
    return sendJson(res, 200, { ok: true });
  }

  if (parts[1] === "settings" && req.method === "PUT") {
    const settings = { ...(await readSettings()), ...(await json()) };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return sendJson(res, 200, settings);
  }

  if (parts[1] === "covers" && req.method === "POST") {
    const original = decodeURIComponent(String(req.headers["x-filename"] || "cover.png"));
    const ext = path.extname(original).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return sendJson(res, 400, { error: "That file is not an image" });
    const name = `${slugify(path.basename(original, ext))}-${newId()}${ext}`;
    await fs.writeFile(path.join(COVERS, name), await readBody(req));
    return sendJson(res, 201, { cover: `covers/${name}` });
  }

  if (parts[1] === "open" && req.method === "POST") {
    const { target } = await json();
    if (!target || !path.isAbsolute(target) || !existsSync(target)) return sendJson(res, 404, { error: "That folder does not exist. Is Transcend plugged in?" });
    const args = statSync(target).isDirectory() ? [target] : ["-R", target];
    execFile("open", args, (err) => (err ? sendJson(res, 500, { error: err.message }) : sendJson(res, 200, { ok: true })));
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res @returns {Promise<void>} */
export async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (url.pathname.startsWith("/covers/")) return await sendStatic(res, COVERS, url.pathname.slice("/covers/".length));
    return await sendStatic(res, PUBLIC, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

await fs.mkdir(COVERS, { recursive: true });
// On Vercel, api/index.mjs imports handleRequest instead of starting a server.
if (!process.env.VERCEL) {
  http.createServer(handleRequest).listen(PORT, HOST, () => console.log(`Mosaic is running at http://localhost:${PORT}\nWorkspace: ${WORKSPACE}`));
}
