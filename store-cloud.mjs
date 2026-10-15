// Cloud store: pages live in the Supabase "pages" table, covers in the private "covers" bucket.
// Every call runs as the signed-in user, so the database rules only ever show that user's own rows.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.mjs";

/** @typedef {import("./store-files.mjs").Page} Page */
/** @typedef {import("./store-files.mjs").TrashItem} TrashItem */
/** @typedef {{access:string,userId:string}} Session */

const PAGE_SIZE = 1000;

/** @param {Page} page @returns {object} */
function toMeta(page) {
  const { id, body, file, folderExists, ...meta } = page;
  return meta;
}

/** @param {{id:string,meta:object,body:string}} row @returns {Page} */
const fromRow = (row) => ({ order: 0, title: "Untitled", ...row.meta, id: row.id, body: row.body || "" });

/** @param {Session} session @returns {object} */
export function createCloudStore(session) {
  const auth = { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access}` };

  /** @param {string} route @param {RequestInit & {headers?:Record<string,string>}} options @returns {Promise<Response>} */
  async function call(route, options = {}) {
    const res = await fetch(`${SUPABASE_URL}${route}`, { ...options, headers: { ...auth, ...(options.headers || {}) } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Database error ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  /** @param {string} query @returns {Promise<any[]>} every row, fetched 1000 at a time */
  async function selectAll(query) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const res = await call(`/rest/v1/pages?${query}&order=id`, { headers: { Range: `${from}-${from + PAGE_SIZE - 1}` } });
      const batch = await res.json();
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) return rows;
    }
  }

  /** @param {Page[]} pages @param {string|null} trashStamp @returns {Promise<void>} */
  async function upsert(pages, trashStamp = null) {
    for (let i = 0; i < pages.length; i += 200) {
      const rows = pages.slice(i, i + 200).map((p) => ({ owner: session.userId, id: p.id, meta: toMeta(p), body: p.body || "", trash_stamp: trashStamp, updated_at: new Date().toISOString() }));
      await call("/rest/v1/pages", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
    }
  }

  /** @param {string[]} ids @returns {string} PostgREST "in" filter */
  const idIn = (ids) => `id=in.(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;

  /** @returns {Promise<Map<string, Page>>} */
  async function listPages() {
    const rows = await selectAll("select=id,meta,body&trash_stamp=is.null");
    return new Map(rows.map((r) => [r.id, fromRow(r)]));
  }

  /** @param {Page} page @returns {Promise<Page>} */
  async function savePage(page) {
    await upsert([page]);
    return page;
  }

  /** @param {Page[]} pages @returns {Promise<void>} */
  const savePages = (pages) => upsert(pages);

  /** @param {string[]} ids @param {string} stamp @returns {Promise<void>} */
  async function trash(ids, stamp) {
    await call(`/rest/v1/pages?${idIn(ids)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ trash_stamp: stamp }) });
  }

  /** @returns {Promise<TrashItem[]>} */
  async function listTrash() {
    const rows = await selectAll("select=id,meta,body,trash_stamp&trash_stamp=not.is.null");
    return rows.map((r) => {
      const page = fromRow(r);
      return { page, stamp: r.trash_stamp, trashFile: `${r.trash_stamp}-${page.id}.md` };
    });
  }

  /** @param {string} stamp @returns {Promise<string[]>} */
  async function restore(stamp) {
    const batch = (await listTrash()).filter((t) => t.stamp === stamp).map((t) => t.page);
    const live = await listPages();
    for (const p of batch) live.set(p.id, p);
    for (const p of batch) if (p.parent && !live.has(p.parent)) p.parent = "";
    await upsert(batch);
    return batch.map((p) => p.id);
  }

  /** @param {string} stamp @returns {Promise<string[]>} */
  async function purge(stamp) {
    const res = await call(`/rest/v1/pages?trash_stamp=eq.${encodeURIComponent(stamp)}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    return (await res.json()).map((r) => `${stamp}-${r.id}.md`);
  }

  /** @returns {Promise<object>} */
  async function readSettings() {
    const rows = await (await call("/rest/v1/settings?select=data")).json();
    return rows[0]?.data || { cardRatio: "portrait", cardSize: "m" };
  }

  /** @param {object} settings @returns {Promise<void>} */
  async function writeSettings(settings) {
    await call("/rest/v1/settings", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ owner: session.userId, data: settings }) });
  }

  /** @param {string} rel @returns {string} storage key inside the user's own folder */
  const coverKey = (rel) => `${session.userId}/${rel.split("/").map(encodeURIComponent).join("/")}`;

  /** @param {string} rel @param {Buffer} data @param {string} type @returns {Promise<void>} */
  async function putCover(rel, data, type = "application/octet-stream") {
    await call(`/storage/v1/object/covers/${coverKey(rel)}`, { method: "POST", headers: { "Content-Type": type, "x-upsert": "true" }, body: data });
  }

  /** @param {string} rel @returns {Promise<Buffer|null>} */
  async function readCover(rel) {
    try {
      const res = await call(`/storage/v1/object/authenticated/covers/${coverKey(rel)}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (err.status === 400 || err.status === 404) return null;
      throw err;
    }
  }

  /** @param {string[]} ids @returns {Promise<void>} */
  async function reorder(ids) {
    await call("/rest/v1/rpc/reorder_pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  }

  /** @returns {Promise<number>} how many pages (live or trashed) this user has online */
  async function countAll() {
    const res = await call("/rest/v1/pages?select=id", { method: "HEAD", headers: { Prefer: "count=exact", Range: "0-0" } });
    return Number((res.headers.get("content-range") || "*/0").split("/")[1]) || 0;
  }

  return { kind: "cloud", listPages, savePage, savePages, trash, listTrash, restore, purge, readSettings, writeSettings, putCover, readCover, reorder, countAll, upsertTrashed: upsert };
}
