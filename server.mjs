// Mosaic server. Zero dependencies: Node built-ins only.
// Default: pages live online (Supabase) behind a sign-in, and the Mac keeps a copy in ./workspace.
// MOSAIC_STORE=files: offline mode, pages are only the Markdown files in ./workspace, no sign-in.
import http from "node:http";
import { promises as fs, existsSync, statSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createFileStore, newId, slugify } from "./store-files.mjs";
import { createCloudStore } from "./store-cloud.mjs";
import { getSession, signIn, signUp, setSessionCookie, clearSessionCookie } from "./auth.mjs";
import { importFromMac, saveToMac } from "./mirror.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.MOSAIC_WORKSPACE || path.join(ROOT, "workspace");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 4321);
const HOST = "127.0.0.1";
const ON_VERCEL = Boolean(process.env.VERCEL);
const OFFLINE = !ON_VERCEL && process.env.MOSAIC_STORE === "files";

const EDITABLE = ["title", "icon", "cover", "parent", "order", "folder", "cardRatio", "cardSize", "view", "status", "boardColumns", "body"];
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".avif": "image/avif", ".json": "application/json",
};
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]);

/** @typedef {import("./store-files.mjs").Page} Page */

const macFiles = ON_VERCEL ? null : createFileStore(WORKSPACE);
const macSync = { running: null, again: false };

/** @param {string|undefined} folder @returns {boolean} */
const folderExists = (folder) => Boolean(folder) && (ON_VERCEL || existsSync(folder));

/** @param {Page} page @returns {object} */
const toClient = ({ file, ...page }) => ({ ...page, folderExists: folderExists(page.folder) });

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

/** Copies the online pages to the Mac in the background. Runs again if a change lands while it works. @param {object} cloud */
function scheduleSaveToMac(cloud) {
  if (!macFiles) return;
  if (macSync.running) { macSync.again = true; return; }
  macSync.running = (async () => {
    do {
      macSync.again = false;
      const result = await saveToMac(cloud, macFiles, await cloud.listPages());
      if (result.written || result.moved || result.covers) console.log(`Saved to Mac: ${result.written} pages, ${result.moved} moved to .trash, ${result.covers} covers`);
    } while (macSync.again);
  })().catch((err) => console.error(`Save to Mac failed: ${err.message}`)).finally(() => { macSync.running = null; });
}

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res @param {URL} url */
async function handleAuth(req, res, url) {
  const { email, password } = JSON.parse((await readBody(req, 10_000)).toString("utf8") || "{}");
  if (url.pathname === "/api/logout") { clearSessionCookie(req, res); return sendJson(res, 200, { ok: true }); }
  if (!email || !password) return sendJson(res, 400, { error: "Type your email and password." });
  try {
    const tokens = url.pathname === "/api/signup" ? await signUp(email, password) : await signIn(email, password);
    if (!tokens) return sendJson(res, 200, { confirm: true });
    setSessionCookie(req, res, tokens);
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 401, { error: err.message });
  }
}

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res @param {URL} url @param {object} store */
async function handleApi(req, res, url, store) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const json = async () => JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString("utf8") || "{}");
  const changed = () => { if (store.kind === "cloud") scheduleSaveToMac(store); };

  if (parts[1] === "pages" && parts.length === 2 && req.method === "GET") {
    if (store.kind === "cloud" && macFiles) {
      const uploaded = await importFromMac(store, macFiles);
      if (uploaded) console.log(`Uploaded from Mac: ${uploaded.pages} pages, ${uploaded.covers} covers`);
    }
    const pages = await store.listPages();
    changed();
    return sendJson(res, 200, { pages: [...pages.values()].map(toClient), settings: await store.readSettings(), online: store.kind === "cloud" });
  }

  if (parts[1] === "pages" && parts.length === 2 && req.method === "POST") {
    const input = await json();
    const pages = await store.listPages();
    const siblings = [...pages.values()].filter((p) => (p.parent || "") === (input.parent || ""));
    const now = new Date().toISOString();
    const page = await store.savePage({
      id: newId(), title: input.title || "Untitled", icon: input.icon || "", parent: input.parent || "", status: input.status || "",
      order: siblings.reduce((m, p) => Math.max(m, p.order || 0), 0) + 1, body: "", created: now, updated: now, file: "",
    });
    changed();
    return sendJson(res, 201, toClient(page));
  }

  if (parts[1] === "pages" && parts.length === 3 && req.method === "PUT") {
    const input = await json();
    const pages = await store.listPages();
    const page = pages.get(parts[2]);
    if (!page) return sendJson(res, 404, { error: "Page not found" });
    if (input.parent && (input.parent === page.id || descendantsOf(pages, page.id).includes(input.parent)))
      return sendJson(res, 400, { error: "A page cannot live inside itself" });
    for (const key of EDITABLE) if (key in input) page[key] = input[key];
    page.updated = new Date().toISOString();
    const saved = await store.savePage(page);
    changed();
    return sendJson(res, 200, toClient(saved));
  }

  if (parts[1] === "pages" && parts.length === 3 && req.method === "DELETE") {
    const pages = await store.listPages();
    if (!pages.has(parts[2])) return sendJson(res, 404, { error: "Page not found" });
    const ids = [parts[2], ...descendantsOf(pages, parts[2])];
    await store.trash(ids, new Date().toISOString().replace(/[:.]/g, "-"));
    changed();
    return sendJson(res, 200, { trashed: ids });
  }

  if (parts[1] === "trash" && parts.length === 2 && req.method === "GET") {
    const items = (await store.listTrash()).map(({ page, trashFile, stamp }) => ({
      ...toClient(page), trashFile, stamp,
      trashedAt: stamp.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "$1:$2:$3.$4Z"),
    }));
    return sendJson(res, 200, { items });
  }

  if (parts[1] === "trash" && parts[2] === "restore" && req.method === "POST") {
    const { trashFile } = await json();
    const restored = await store.restore(String(trashFile || "").slice(0, 24));
    if (!restored.length) return sendJson(res, 404, { error: "That page is not in the trash" });
    changed();
    return sendJson(res, 200, { restored });
  }

  if (parts[1] === "trash" && parts.length === 3 && req.method === "DELETE") {
    const deleted = await store.purge(decodeURIComponent(parts[2]).slice(0, 24));
    if (!deleted.length) return sendJson(res, 404, { error: "That page is not in the trash" });
    return sendJson(res, 200, { deleted });
  }

  if (parts[1] === "reorder" && req.method === "POST") {
    const { ids } = await json();
    await store.reorder(ids);
    changed();
    return sendJson(res, 200, { ok: true });
  }

  if (parts[1] === "settings" && req.method === "PUT") {
    const settings = { ...(await store.readSettings()), ...(await json()) };
    await store.writeSettings(settings);
    changed();
    return sendJson(res, 200, settings);
  }

  if (parts[1] === "covers" && req.method === "POST") {
    const original = decodeURIComponent(String(req.headers["x-filename"] || "cover.png"));
    const ext = path.extname(original).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return sendJson(res, 400, { error: "That file is not an image" });
    const name = `${slugify(path.basename(original, ext))}-${newId()}${ext}`;
    const data = await readBody(req);
    await store.putCover(name, data, MIME[ext]);
    if (store.kind === "cloud" && macFiles) await macFiles.putCover(name, data).catch(() => {});
    return sendJson(res, 201, { cover: `covers/${name}` });
  }

  if (parts[1] === "open" && req.method === "POST") {
    if (ON_VERCEL) return sendJson(res, 400, { error: "Open in Finder works in the Mac app only." });
    const { target } = await json();
    if (!target || !path.isAbsolute(target) || !existsSync(target)) return sendJson(res, 404, { error: "That folder does not exist. Is Transcend plugged in?" });
    const args = statSync(target).isDirectory() ? [target] : ["-R", target];
    execFile("open", args, (err) => (err ? sendJson(res, 500, { error: err.message }) : sendJson(res, 200, { ok: true })));
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

/** @param {http.ServerResponse} res @param {object} store @param {string} rel */
async function sendCover(res, store, rel) {
  const name = decodeURIComponent(rel);
  const data = (macFiles && (await macFiles.readCover(name))) || (store.kind === "cloud" ? await store.readCover(name) : null);
  if (!data) return sendJson(res, 404, { error: "Not found" });
  res.writeHead(200, { "Content-Type": MIME[path.extname(name).toLowerCase()] || "application/octet-stream", "Cache-Control": "private, max-age=604800" });
  res.end(data);
}

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res @returns {Promise<void>} */
export async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    const isApi = url.pathname.startsWith("/api/");
    const isCover = url.pathname.startsWith("/covers/");
    if (!isApi && !isCover) return await sendStatic(res, PUBLIC, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
    if (["/api/login", "/api/signup", "/api/logout"].includes(url.pathname) && req.method === "POST") return await handleAuth(req, res, url);

    let store = macFiles;
    if (!OFFLINE) {
      const session = await getSession(req, res);
      if (!session) return sendJson(res, 401, { error: "Please sign in.", signIn: true });
      store = createCloudStore(session);
    }
    if (isCover) return await sendCover(res, store, url.pathname.slice("/covers/".length));
    return await handleApi(req, res, url, store);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

if (!ON_VERCEL) {
  await fs.mkdir(path.join(WORKSPACE, "covers"), { recursive: true });
  http.createServer(handleRequest).listen(PORT, HOST, () =>
    console.log(`Mosaic is running at http://localhost:${PORT}\n${OFFLINE ? `Offline. Pages: ${WORKSPACE}` : `Online pages. Mac copy: ${WORKSPACE}`}`));
}
