// Mosaic front end. Visual-first pages and card galleries, saved online by server.mjs (or as Markdown files offline).

import { mountEditor } from "./editor.js";

const RATIOS = [
  { id: "landscape", label: "Wide", w: 14, h: 8 },
  { id: "square", label: "Square", w: 10, h: 10 },
  { id: "portrait", label: "Portrait", w: 8, h: 11 },
  { id: "poster", label: "Poster", w: 8, h: 12 },
  { id: "tall", label: "Tall", w: 6, h: 13 },
];
/** @param {string} paths @returns {string} */
const icon = (paths) => `<svg class="ico" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const VIEWS = [
  { id: "gallery", label: "Gallery", glyph: icon('<rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/>') },
  { id: "table", label: "Table", glyph: icon('<rect x="2" y="2.5" width="12" height="11" rx="1.8"/><path d="M2 6.5h12M2 10h12M6.5 6.5v7"/>') },
  { id: "board", label: "Board", glyph: icon('<rect x="2" y="2.5" width="12" height="11" rx="1.8"/><path d="M8 2.5v11"/>') },
];
const PLUS_ICON = icon('<path d="M8 3v10M3 8h10"/>');
const DEFAULT_COLUMNS = ["To do", "Doing", "Done"];
const SIZES = [{ id: "s", label: "S" }, { id: "m", label: "M" }, { id: "l", label: "L" }];
const EMOJIS = "💪 💸 ❤️ 🌊 🤖 🎨 🎵 📚 🧠 🏠 ✈️ 🍳 🧘 🏃 💼 📈 🛠️ 🎯 🌱 🔥 ⭐ 📝 🗂️ 💡 🎬 📷 🎮 🧪 🗓️ 🏆 🔑 🌍".split(" ");
const GRADIENTS = [
  ["#c2410c", "#f59e0b"], ["#0f766e", "#5eead4"], ["#4338ca", "#a78bfa"], ["#be185d", "#f9a8d4"],
  ["#1d4ed8", "#7dd3fc"], ["#3f6212", "#bef264"], ["#7c2d12", "#fdba74"], ["#334155", "#cbd5e1"],
];

const state = {
  pages: new Map(),
  settings: { cardRatio: "portrait", cardSize: "m" },
  expanded: new Set(readLocal("mosaic.expanded", [])),
  query: "",
};
const saveTimers = new Map();
let coverTarget = null;
let dragId = null;
let boardDrag = null;
let tableSort = { key: "order", dir: 1 };

const $ = (sel) => document.querySelector(sel);
const main = $("#main");

/** @param {string} key @param {any} fallback @returns {any} */
function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

/** @param {string} key @param {any} value @returns {void} */
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: expanded state is a convenience only */ }
}

/** @param {string} text @returns {string} */
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** @param {string} message @returns {void} */
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

/** @param {string} url @param {RequestInit} options @returns {Promise<any>} */
async function api(url, options = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.signIn) showSignIn();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** @returns {void} */
function showSignIn() {
  const box = $("#signin");
  if (!box.hidden) return;
  box.hidden = false;
  if (["localhost", "127.0.0.1"].includes(location.hostname))
    $("#signin-msg").textContent = "The first sign-in on your Mac uploads all your pages. It takes a minute or two.";
  box.querySelector("input").focus();
  fetch("/api/has-account").then((r) => r.json()).then(({ hasAccount }) => {
    if (hasAccount) return;
    const go = box.querySelector(".signin-go");
    go.textContent = "Create your account";
    go.dataset.mode = "signup";
    box.querySelector(".signin-alt").hidden = true;
    box.querySelector('[name="password"]').autocomplete = "new-password";
  }).catch(() => {});
}

$("#signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const mode = event.submitter?.dataset.mode || "login";
  const msg = $("#signin-msg");
  form.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  msg.textContent = mode === "signup" ? "Making your account…" : "Signing in…";
  try {
    const res = await fetch(`/api/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "That did not work. Try again.");
    if (data.confirm) { msg.textContent = "Account made. Open the email from Supabase and click the link, then sign in here."; return; }
    msg.textContent = "Loading your pages…";
    location.reload();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    form.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  }
});

$("#sign-out").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.reload();
});

/** @returns {Promise<void>} */
async function loadAll() {
  const data = await api("/api/pages");
  state.pages = new Map(data.pages.map((p) => [p.id, p]));
  state.settings = { ...state.settings, ...data.settings };
  $("#sign-out").hidden = !data.online;
}

/** @param {string} parentId @returns {object[]} */
const childrenOf = (parentId) =>
  [...state.pages.values()].filter((p) => (p.parent || "") === (parentId || "")).sort((a, b) => (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title));

/** @returns {string} */
const currentId = () => (location.hash.match(/^#\/p\/(\w+)/) || [])[1] || "";

/** @param {string} id @returns {object[]} */
function ancestorsOf(id) {
  const out = [];
  let page = state.pages.get(id);
  while (page && page.parent && state.pages.has(page.parent) && out.length < 50) {
    page = state.pages.get(page.parent);
    out.unshift(page);
  }
  return out;
}

/** @param {string} id @returns {string} */
function gradientFor(id) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = GRADIENTS[hash % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/** @param {object} page @returns {string} */
function coverUrl(page) {
  if (!page.cover) return "";
  if (/^https?:\/\//.test(page.cover)) return page.cover;
  return `/${page.cover.split("/").map(encodeURIComponent).join("/")}`;
}

/** @param {string} id @param {object} patch @param {number} delay @returns {void} */
function savePage(id, patch, delay = 0) {
  const page = state.pages.get(id);
  if (!page) return;
  Object.assign(page, patch);
  page._pending = { ...(page._pending || {}), ...patch };
  clearTimeout(saveTimers.get(id));
  setSaveState("Saving…");
  saveTimers.set(id, setTimeout(async () => {
    const body = page._pending;
    page._pending = null;
    page._saving = (page._saving || 0) + 1;
    try {
      const saved = await api(`/api/pages/${id}`, { method: "PUT", body: JSON.stringify(body) });
      Object.assign(page, { folderExists: saved.folderExists, updated: saved.updated });
      setSaveState("Saved");
      if ("folder" in body) renderMain();
    } catch (err) {
      setSaveState("Not saved");
      toast(err.message);
    } finally {
      page._saving -= 1;
    }
  }, delay));
}

/** @param {string} text @returns {void} */
function setSaveState(text) {
  const el = $(".save-state");
  if (el) el.textContent = text;
}

/** @param {string} parent @param {object} extra @returns {Promise<void>} */
async function createPage(parent, extra = {}) {
  const page = await api("/api/pages", { method: "POST", body: JSON.stringify({ parent, title: "Untitled", ...extra }) });
  state.pages.set(page.id, page);
  if (parent) { state.expanded.add(parent); writeLocal("mosaic.expanded", [...state.expanded]); }
  location.hash = `#/p/${page.id}`;
  requestAnimationFrame(() => { const t = $(".title"); if (t) { t.focus(); t.select(); } });
}

/** @param {string} parent @returns {Promise<string|null>} new page id, made inside parent */
async function createSubPage(parent) {
  try {
    const page = await api("/api/pages", { method: "POST", body: JSON.stringify({ parent, title: "Untitled" }) });
    state.pages.set(page.id, page);
    state.expanded.add(parent);
    writeLocal("mosaic.expanded", [...state.expanded]);
    return page.id;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

/** @param {string} id @returns {Promise<void>} */
async function deletePage(id) {
  const page = state.pages.get(id);
  const count = countDescendants(id);
  const extra = count ? ` and ${count} page${count > 1 ? "s" : ""} inside it` : "";
  if (!confirm(`Move "${page.title}"${extra} to Trash?\n\nYou can restore it from Trash in the sidebar.`)) return;
  const { trashed } = await api(`/api/pages/${id}`, { method: "DELETE" });
  trashed.forEach((t) => state.pages.delete(t));
  toast("Moved to Trash");
  refreshTrashCount();
  if (trashed.includes(currentId())) location.hash = page.parent ? `#/p/${page.parent}` : "#/";
  else render();
}

/** @param {string} id @returns {number} */
const countDescendants = (id) => childrenOf(id).reduce((n, c) => n + 1 + countDescendants(c.id), 0);

/** @param {string} target @returns {Promise<void>} */
async function openFolder(target) {
  try { await api("/api/open", { method: "POST", body: JSON.stringify({ target }) }); toast("Opened in Finder"); }
  catch (err) { toast(err.message); }
}

/** @param {File} file @param {string} id @returns {Promise<void>} */
async function uploadCover(file, id) {
  if (!file || !file.type.startsWith("image/")) return toast("Drop an image file");
  toast("Uploading cover…");
  const res = await fetch("/api/covers", { method: "POST", headers: { "X-Filename": encodeURIComponent(file.name || "pasted.png") }, body: file });
  const data = await res.json();
  if (!res.ok) return toast(data.error || "Upload failed");
  if (id === "__root__") return;
  savePage(id, { cover: data.cover });
  render();
  toast("Cover updated");
}

/* ---------- Sidebar tree ---------- */

/** @returns {void} */
function renderTree() {
  const active = currentId();
  const open = new Set([...state.expanded, ...ancestorsOf(active).map((p) => p.id)]);
  /** @param {string} parent @returns {string} */
  const branch = (parent) => childrenOf(parent).map((p) => {
    const kids = childrenOf(p.id).length;
    const isOpen = open.has(p.id);
    return `<div class="tree-node">
      <div class="tree-row ${p.id === active ? "active" : ""}" data-id="${p.id}">
        <button class="tree-toggle ${kids ? "" : "empty"}" data-toggle="${p.id}" aria-label="${isOpen ? "Collapse" : "Expand"}">${isOpen ? "▼" : "▶"}</button>
        <a class="tree-link" href="#/p/${p.id}"><span>${esc(p.icon || "📄")}</span><span>${esc(p.title || "Untitled")}</span></a>
      </div>
      ${kids && isOpen ? `<div class="tree-children">${branch(p.id)}</div>` : ""}
    </div>`;
  }).join("");
  $("#tree").innerHTML = branch("") || `<p class="empty-state" style="padding:20px 0">No pages yet</p>`;
}

/* ---------- Main view ---------- */

/** @returns {void} */
function render() {
  renderTree();
  renderMain();
}

/** @returns {void} */
function renderMain() {
  editor?.destroy();
  editor = null;
  if (state.query) return renderSearch();
  $("#trash-link").classList.toggle("active", location.hash === "#/trash");
  if (location.hash === "#/trash") return renderTrash();
  const id = currentId();
  const page = state.pages.get(id);
  if (id && !page) {
    main.innerHTML = `<div class="page"><p class="empty-state">This page is gone. <a href="#/">Go home</a></p></div>`;
    return;
  }
  if (!page) return renderHome();

  const crumbs = ancestorsOf(id);
  const crumbsHtml = `<nav class="crumbs"><a href="#/">Home</a>${crumbs.map((c) => `<span>/</span><a href="#/p/${c.id}">${esc(c.icon || "")} ${esc(c.title)}</a>`).join("")}</nav>`;
  const cover = coverUrl(page);
  const folder = page.folder
    ? `<span class="folder-chip ${page.folderExists ? "" : "missing"}" title="${page.folderExists ? "Linked folder" : "Folder not found. Is the drive plugged in?"}">
        📁 <code>${esc(page.folder)}</code>
        <button class="pill" data-action="open-folder" ${page.folderExists ? "" : "disabled"}>Open</button>
        <button class="pill ghost" data-action="set-folder">Change</button>
      </span>`
    : `<button class="ghost-btn" data-action="set-folder">📁 Link a folder</button>`;

  const parentCfg = collectionConfig(page.parent || "__root__");
  const media = Boolean(cover) && ["poster", "tall", "portrait"].includes(parentCfg.cardRatio);
  const banner = cover && !media;
  const hasKids = childrenOf(page.id).length > 0;
  const iconBtn = `<button class="icon-btn ${page.icon ? "" : "empty"}" data-action="icon" aria-label="Change icon">${page.icon ? esc(page.icon) : "＋ Icon"}</button>`;
  const metaRow = `<div class="meta-row page-footer">
        ${folder}
        ${cover ? (media ? `<button class="ghost-btn" data-action="cover">🖼 Change poster</button>` : "") : `<button class="ghost-btn" data-action="cover">🖼 Add cover</button>`}
        ${hasKids ? "" : `<button class="ghost-btn" data-action="new-child" data-parent="${page.id}">＋ Add a card inside</button>`}
        <button class="ghost-btn" data-action="menu" data-id="${page.id}">⋯ More</button>
      </div>`;
  const title = `<input class="title" value="${esc(page.title)}" placeholder="Untitled" aria-label="Page title">`;
  const body = `<section class="body-wrap">
        <div class="doc-host"></div>
        <div class="save-state"></div>
      </section>`;

  main.innerHTML = media
    ? `<div class="page">
      ${crumbsHtml}
      <div class="media-layout">
        <img class="media-poster" src="${esc(cover)}" alt="${esc(page.title)} poster">
        <div class="media-main">
          <div class="head">${page.icon ? iconBtn : ""}${title}</div>
          ${body}
          ${metaRow}
        </div>
      </div>
      ${hasKids ? collectionHtml(page.id) : ""}
    </div>`
    : `${banner ? `<div class="banner" style="background-image:url('${esc(cover)}')">
      <div class="banner-actions"><button class="chip-btn" data-action="cover">Change cover</button><button class="chip-btn" data-action="remove-cover">Remove</button></div>
    </div>` : ""}
    <div class="page ${banner ? "has-banner" : ""}">
      ${banner ? "" : crumbsHtml}
      <div class="head">${iconBtn}${title}</div>
      ${banner ? crumbsHtml : ""}
      ${hasKids ? collectionHtml(page.id) : ""}
      ${body}
      ${metaRow}
    </div>`;
  document.title = `${page.title || "Untitled"} · Mosaic`;
  mountBody(page);
}

let editor = null;

/** @param {object} page @returns {void} shows the page text as editable blocks */
function mountBody(page) {
  const host = main.querySelector(".doc-host");
  if (!host) return;
  editor = mountEditor(host, {
    markdown: page.body || "",
    onChange: (md) => savePage(page.id, { body: md }, 600),
    titleOf: (pid) => state.pages.get(pid)?.title || "",
    iconOf: (pid) => state.pages.get(pid)?.icon || "",
    createPage: () => createSubPage(page.id),
    openPage: (pid) => {
      window.addEventListener("hashchange", () => requestAnimationFrame(() => { const t = $(".title"); if (t) { t.focus(); t.select(); } }), { once: true });
      location.hash = `#/p/${pid}`;
    },
    pickEmoji: (anchor, done) => emojiPicker(anchor, done),
  });
}

/** @returns {void} */
function renderHome() {
  document.title = "Mosaic";
  main.innerHTML = `<div class="page page-home">${collectionHtml("")}</div>`;
}

/** @returns {void} */
function renderSearch() {
  const q = state.query.toLowerCase();
  const hits = [...state.pages.values()].filter((p) => p.title.toLowerCase().includes(q) || (p.body || "").toLowerCase().includes(q));
  main.innerHTML = `<div class="page">
    <h1 class="title" style="margin-top:32px">Search: “${esc(state.query)}”</h1>
    <div class="gallery-bar"><h2>${hits.length} result${hits.length === 1 ? "" : "s"}</h2></div>
    <div class="grid ratio-${state.settings.cardRatio} size-${state.settings.cardSize}">${hits.map((p) => cardHtml(p, false)).join("")}</div>
  </div>`;
}

/** @param {string} scope @returns {{view:string, cardRatio:string, cardSize:string, columns:string[]}} */
function collectionConfig(scope) {
  const src = scope === "__root__" ? state.settings : state.pages.get(scope) || {};
  const columns = String(src.boardColumns || "").split("|").map((c) => c.trim()).filter(Boolean);
  return {
    view: src.view || "gallery",
    cardRatio: src.cardRatio || state.settings.cardRatio,
    cardSize: src.cardSize || state.settings.cardSize,
    columns: columns.length ? columns : [...DEFAULT_COLUMNS],
  };
}

/** @param {string} scope @param {object} patch @returns {void} */
function setCollectionConfig(scope, patch) {
  if (scope !== "__root__") return savePage(scope, patch);
  Object.assign(state.settings, patch);
  api("/api/settings", { method: "PUT", body: JSON.stringify(patch) }).catch((err) => toast(err.message));
}

/** @param {string} parentId @returns {string} */
function collectionHtml(parentId) {
  const scope = parentId || "__root__";
  const cfg = collectionConfig(scope);
  const kids = childrenOf(parentId);
  const views = VIEWS.map((v) => `<button role="tab" aria-selected="${v.id === cfg.view}" class="${v.id === cfg.view ? "on" : ""}" data-view="${v.id}" data-scope="${scope}">${v.glyph}<span>${v.label}</span></button>`).join("");
  const galleryControls = cfg.view !== "gallery" ? "" : `
    <div class="seg seg-icons" role="group" aria-label="Card shape">${RATIOS.map((r) => `<button class="${r.id === cfg.cardRatio ? "on" : ""}" data-ratio="${r.id}" data-scope="${scope}" title="${r.label}" aria-label="${r.label} cards" aria-pressed="${r.id === cfg.cardRatio}"><i class="shape" style="width:${r.w}px;height:${r.h}px"></i></button>`).join("")}</div>
    <div class="seg" role="group" aria-label="Card size">${SIZES.map((s) => `<button class="${s.id === cfg.cardSize ? "on" : ""}" data-size="${s.id}" data-scope="${scope}">${s.label}</button>`).join("")}</div>`;
  const body = cfg.view === "table" ? tableHtml(parentId, kids, cfg) : cfg.view === "board" ? boardHtml(parentId, kids, cfg) : gridHtml(parentId, kids, cfg);
  return `<section class="collection">
    <div class="gallery-bar">
      <div class="seg" role="tablist" aria-label="View">${views}</div>
      <span class="count">${kids.length} card${kids.length === 1 ? "" : "s"}</span>
      <span class="spacer"></span>
      ${galleryControls}
      <button class="add-btn new-btn" data-action="new-child" data-parent="${parentId}">${PLUS_ICON}<span>New</span></button>
    </div>
    <div class="view-body">${body}</div>
  </section>`;
}

/** @param {string} parentId @param {object[]} kids @param {object} cfg @returns {string} */
function gridHtml(parentId, kids, cfg) {
  return `<div class="grid ratio-${cfg.cardRatio} size-${cfg.cardSize}" data-parent="${parentId}">
    ${kids.map((p) => cardHtml(p, true)).join("")}
    <button class="card add-card" data-action="new-child" data-parent="${parentId}">＋ Add a card</button>
  </div>`;
}

/** @param {string} value @returns {string} */
function colorFor(value) {
  if (!value) return "var(--ink-soft)";
  let hash = 0;
  for (const c of value) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length][0];
}

/** @param {string} iso @returns {string} */
function relTime(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  if (mins < 10080) return `${Math.round(mins / 1440)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** @param {string[]} columns @returns {(a:object, b:object) => number} */
function tableComparator(columns) {
  const { key, dir } = tableSort;
  /** @param {object} p @returns {any} */
  const val = (p) => ({
    title: (p.title || "").toLowerCase(),
    status: p.status ? columns.indexOf(p.status) : 999,
    folder: (p.folder || "~").toLowerCase(),
    inside: childrenOf(p.id).length,
    updated: p.updated || "",
    order: p.order || 0,
  })[key];
  return (a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir;
}

/** @param {object} page @param {string[]} columns @returns {string} */
function statusSelect(page, columns) {
  const options = [...new Set([...columns, page.status].filter(Boolean))];
  return `<label class="status-pick" style="--dot:${colorFor(page.status)}"><span class="dot"></span>
    <select class="t-status" data-id="${page.id}" aria-label="Status">
      <option value="">No status</option>
      ${options.map((c) => `<option ${c === page.status ? "selected" : ""}>${esc(c)}</option>`).join("")}
    </select></label>`;
}

/** @param {string} parentId @param {object[]} kids @param {object} cfg @returns {string} */
function tableHtml(parentId, kids, cfg) {
  const heads = [["title", "Name"], ["status", "Status"], ["folder", "Folder"], ["inside", "Inside"], ["updated", "Updated"]]
    .map(([key, label]) => `<th scope="col"><button data-sort="${key}" class="${tableSort.key === key ? "on" : ""}">${label}<span aria-hidden="true">${tableSort.key === key ? (tableSort.dir > 0 ? " ↑" : " ↓") : ""}</span></button></th>`).join("");
  const rows = [...kids].sort(tableComparator(cfg.columns)).map((p) => {
    const kidsCount = childrenOf(p.id).length;
    const folder = p.folder
      ? `<button class="t-folder ${p.folderExists ? "" : "missing"}" data-action="card-folder" data-id="${p.id}" title="${esc(p.folder)}">📁 ${esc(p.folder.split("/").filter(Boolean).pop() || p.folder)}</button>`
      : `<span class="muted">—</span>`;
    return `<tr data-id="${p.id}">
      <td class="t-name">
        ${p.cover ? `<img class="t-thumb" src="${esc(coverUrl(p))}" alt="" loading="lazy">` : `<span class="t-thumb" style="background:${gradientFor(p.id)}">${esc(p.icon || "")}</span>`}
        <input class="t-title" data-id="${p.id}" value="${esc(p.title)}" aria-label="Title">
        <button class="t-open" data-open="${p.id}">Open</button>
      </td>
      <td>${statusSelect(p, cfg.columns)}</td>
      <td>${folder}</td>
      <td class="num">${kidsCount || ""}</td>
      <td class="muted">${relTime(p.updated)}</td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table">
    <thead><tr>${heads}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <button class="t-add" data-action="new-child" data-parent="${parentId}">+ New row</button></div>`;
}

/** @param {string} parentId @param {object[]} kids @param {object} cfg @returns {string} */
function boardHtml(parentId, kids, cfg) {
  const scope = parentId || "__root__";
  const extra = [...new Set(kids.map((k) => k.status).filter((s) => s && !cfg.columns.includes(s)))];
  const groups = [...(kids.some((k) => !k.status) ? [""] : []), ...cfg.columns, ...extra];
  const cols = groups.map((value) => {
    const items = kids.filter((k) => (k.status || "") === value);
    return `<section class="bcol" data-status="${esc(value)}">
      <header class="bcol-head">
        <span class="dot" style="background:${colorFor(value)}"></span>
        <span class="bcol-name">${esc(value || "No status")}</span>
        <span class="bcol-count">${items.length}</span>
        ${value && cfg.columns.includes(value) ? `<button class="bcol-menu" data-colmenu="${esc(value)}" data-scope="${scope}" aria-label="Column options">⋯</button>` : ""}
      </header>
      <div class="bcol-list">${items.map(bcardHtml).join("")}</div>
      <button class="bcol-add" data-action="new-child" data-parent="${parentId}" data-status="${esc(value)}">+ New</button>
    </section>`;
  }).join("");
  return `<div class="board" data-parent="${parentId}">${cols}
    <div class="bcol bcol-new"><input class="bcol-input" data-scope="${scope}" placeholder="+ Add column" aria-label="New column name"></div>
  </div>`;
}

/** @param {object} page @returns {string} */
function bcardHtml(page) {
  const cover = coverUrl(page);
  const kids = childrenOf(page.id).length;
  const folder = page.folder
    ? `<button class="${page.folderExists ? "" : "missing"}" data-action="card-folder" data-id="${page.id}" title="${page.folderExists ? "Open folder in Finder" : "Folder not found"}" aria-label="Open folder">📁</button>`
    : "";
  return `<article class="bcard" data-id="${page.id}" tabindex="0" aria-label="${esc(page.title)}">
    ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" draggable="false">` : ""}
    <div class="bcard-body"><span>${esc(page.icon || "📄")}</span><span class="bcard-title">${esc(page.title || "Untitled")}</span></div>
    ${kids || folder ? `<div class="bcard-meta"><span>${kids ? `${kids} inside` : ""}</span>${folder}</div>` : ""}
  </article>`;
}

/** @param {string} scope @param {string} oldName @param {string} newName @returns {void} */
function renameColumn(scope, oldName, newName) {
  const name = newName.replace(/\|/g, "").trim();
  const cfg = collectionConfig(scope);
  if (!name || name === oldName) return;
  if (cfg.columns.includes(name)) return toast("That column already exists");
  setCollectionConfig(scope, { boardColumns: cfg.columns.map((c) => (c === oldName ? name : c)).join("|") });
  childrenOf(scope === "__root__" ? "" : scope).filter((p) => p.status === oldName).forEach((p) => savePage(p.id, { status: name }));
  renderMain();
}

/** @param {string} scope @param {string} name @returns {void} */
function deleteColumn(scope, name) {
  const cfg = collectionConfig(scope);
  const items = childrenOf(scope === "__root__" ? "" : scope).filter((p) => p.status === name);
  if (items.length && !confirm(`Delete the "${name}" column?\n\nIts ${items.length} card${items.length > 1 ? "s" : ""} move to "No status". No pages are deleted.`)) return;
  setCollectionConfig(scope, { boardColumns: cfg.columns.filter((c) => c !== name).join("|") });
  items.forEach((p) => savePage(p.id, { status: "" }));
  renderMain();
}

/** @param {HTMLElement} anchor @param {string} scope @param {string} name @returns {void} */
function columnMenu(anchor, scope, name) {
  const pop = openPop(anchor, `<div class="menu" style="min-width:220px">
    <input type="text" value="${esc(name)}" aria-label="Column name" style="margin:0 0 6px">
    <button data-m="delete" class="danger">Delete column</button>
  </div>`);
  const input = pop.querySelector("input");
  input.focus();
  input.select();
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { closePop(); renameColumn(scope, name, input.value); } });
  pop.querySelector("[data-m=delete]").addEventListener("click", () => { closePop(); deleteColumn(scope, name); });
}

/** @param {object} page @param {boolean} draggable @returns {string} */
function cardHtml(page, draggable) {
  const cover = coverUrl(page);
  const kids = childrenOf(page.id).length;
  const media = cover
    ? `<img src="${esc(cover)}" alt="" loading="lazy" draggable="false">`
    : `<div class="fill" style="background:${gradientFor(page.id)}">${esc(page.icon || "")}</div>`;
  const folderBtn = page.folder
    ? `<button class="${page.folderExists ? "" : "missing"}" data-action="card-folder" title="${page.folderExists ? "Open folder in Finder" : "Folder not found"}" aria-label="Open folder">📁</button>`
    : "";
  return `<div class="card" tabindex="0" role="link" data-id="${page.id}" ${draggable ? 'draggable="true"' : ""} aria-label="${esc(page.title)}">
    ${media}
    <div class="card-tools">${folderBtn}<button data-action="menu" data-id="${page.id}" title="More" aria-label="More options">⋯</button></div>
    <div class="scrim">
      <div class="card-title">${cover && page.icon ? `<span>${esc(page.icon)}</span>` : ""}<span>${esc(page.title || "Untitled")}</span></div>
      ${kids || page.status ? `<div class="card-sub">${page.status ? `<span class="status-chip" style="--dot:${colorFor(page.status)}"><span class="dot"></span>${esc(page.status)}</span>` : ""}${kids ? `<span>${kids} inside</span>` : ""}</div>` : ""}
    </div>
  </div>`;
}

/* ---------- Popovers ---------- */

/** @param {HTMLElement} anchor @param {string} html @returns {HTMLElement} */
function openPop(anchor, html) {
  closePop();
  const pop = document.createElement("div");
  pop.className = "pop";
  pop.innerHTML = html;
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.left, innerWidth - pop.offsetWidth - 12);
  const top = r.bottom + pop.offsetHeight + 8 > innerHeight ? r.top - pop.offsetHeight - 6 : r.bottom + 6;
  const x = Math.max(12, left);
  const y = Math.max(12, top);
  Object.assign(pop.style, { left: `${x}px`, top: `${y}px`, transformOrigin: `${r.left + r.width / 2 - x}px ${y > r.top ? 0 : pop.offsetHeight}px` });
  setTimeout(() => document.addEventListener("pointerdown", outsidePop), 0);
  return pop;
}

/** @param {PointerEvent} e @returns {void} */
function outsidePop(e) {
  if (!e.target.closest(".pop")) closePop();
}

/** @returns {void} */
function closePop() {
  document.querySelector(".pop")?.remove();
  document.removeEventListener("pointerdown", outsidePop);
}

/** @param {HTMLElement} anchor @param {string} id @returns {void} */
function iconPicker(anchor, id) {
  emojiPicker(anchor, (emoji) => { savePage(id, { icon: emoji }); render(); }, true);
}

/** @param {HTMLElement} anchor @param {(emoji:string)=>void} done @param {boolean} removable @returns {void} */
function emojiPicker(anchor, done, removable = false) {
  const pop = openPop(anchor, `<div class="emoji-grid">${EMOJIS.map((e) => `<button data-emoji="${e}">${e}</button>`).join("")}</div>
    <input type="text" placeholder="Or type any emoji" maxlength="8">
    ${removable ? `<button class="ghost-btn" data-emoji="" style="margin-top:6px">Remove icon</button>` : ""}`);
  /** @param {string} emoji @returns {void} */
  const pick = (emoji) => { closePop(); done(emoji); };
  pop.addEventListener("click", (e) => { const b = e.target.closest("[data-emoji]"); if (b) pick(b.dataset.emoji); });
  pop.querySelector("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.value.trim()) pick(e.target.value.trim()); });
}

/** @param {HTMLElement} anchor @param {string} id @returns {void} */
function folderPicker(anchor, id) {
  const page = state.pages.get(id);
  const pop = openPop(anchor, `<div style="width:420px;max-width:80vw">
    <strong style="font-size:14px">Link a folder on your Mac</strong>
    <p style="font-size:12px;color:var(--ink-soft);margin:4px 0 0">In Finder, select the folder and press ⌥⌘C to copy its path. Paste it here.</p>
    <input type="text" value="${esc(page.folder || "")}" placeholder="/Volumes/Transcend/02 Areas/…">
    <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
      ${page.folder ? `<button class="ghost-btn" data-unlink>Unlink</button>` : ""}
      <button class="add-btn" data-save>Save</button>
    </div></div>`);
  const input = pop.querySelector("input");
  input.focus();
  /** @param {string} value @returns {void} */
  const done = (value) => { savePage(id, { folder: value.trim().replace(/^["']|["']$/g, "") }); closePop(); render(); };
  pop.querySelector("[data-save]").addEventListener("click", () => done(input.value));
  pop.querySelector("[data-unlink]")?.addEventListener("click", () => done(""));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value); });
}

/** @param {HTMLElement} anchor @param {string} id @returns {void} */
function cardMenu(anchor, id) {
  const page = state.pages.get(id);
  const pop = openPop(anchor, `<div class="menu">
    <button data-m="open">Open</button>
    <button data-m="cover">${page.cover ? "Change cover" : "Add cover"}</button>
    ${page.cover ? `<button data-m="remove-cover">Remove cover</button>` : ""}
    <button data-m="icon">Change icon</button>
    <button data-m="folder">${page.folder ? "Change folder" : "Link a folder"}</button>
    <button data-m="child">Add a card inside</button>
    <button data-m="delete" class="danger">Move to trash</button>
  </div>`);
  pop.addEventListener("click", (e) => {
    const action = e.target.closest("[data-m]")?.dataset.m;
    if (!action) return;
    closePop();
    if (action === "open") location.hash = `#/p/${id}`;
    if (action === "cover") pickCover(id);
    if (action === "remove-cover") { savePage(id, { cover: "" }); render(); }
    if (action === "icon") iconPicker(anchor, id);
    if (action === "folder") folderPicker(anchor, id);
    if (action === "child") createPage(id);
    if (action === "delete") deletePage(id);
  });
}

/** @param {string} id @returns {void} */
function pickCover(id) {
  coverTarget = id;
  $("#cover-input").value = "";
  $("#cover-input").click();
}

/* ---------- Trash ---------- */

/** @returns {Promise<object[][]>} batches of pages deleted together, root first */
async function loadTrash() {
  const { items } = await api("/api/trash");
  const batches = new Map();
  for (const item of items) batches.set(item.stamp, [...(batches.get(item.stamp) || []), item]);
  return [...batches.values()]
    .map((batch) => {
      const ids = new Set(batch.map((p) => p.id));
      const root = batch.find((p) => !ids.has(p.parent)) || batch[0];
      return [root, ...batch.filter((p) => p !== root)];
    })
    .sort((a, b) => b[0].stamp.localeCompare(a[0].stamp));
}

/** @returns {Promise<void>} */
async function refreshTrashCount() {
  try {
    const batches = await loadTrash();
    $("#trash-count").textContent = batches.length || "";
  } catch { /* trash count is a hint only */ }
}

/** @returns {Promise<void>} */
async function renderTrash() {
  document.title = "Trash · Mosaic";
  main.innerHTML = `<div class="page"><h1 class="title" style="margin-top:32px">Trash</h1><p class="trash-note">Loading…</p></div>`;
  const batches = await loadTrash().catch((err) => { toast(err.message); return []; });
  if (location.hash !== "#/trash") return;
  const rows = batches.map(([root, ...inside]) => `<tr>
      <td class="t-name">
        ${root.cover ? `<img class="t-thumb" src="${esc(coverUrl(root))}" alt="" loading="lazy">` : `<span class="t-thumb" style="background:${gradientFor(root.id)}">${esc(root.icon || "")}</span>`}
        <span class="trash-title">${esc(root.title)}</span>
        ${inside.length ? `<span class="muted">+ ${inside.length} inside</span>` : ""}
      </td>
      <td class="muted">Deleted ${relTime(root.trashedAt).toLowerCase()}</td>
      <td class="trash-actions">
        <button class="pill" data-restore="${esc(root.trashFile)}">Restore</button>
        <button class="ghost-btn danger-btn" data-purge="${esc(root.trashFile)}" data-title="${esc(root.title)}">Delete forever</button>
      </td>
    </tr>`).join("");
  main.innerHTML = `<div class="page">
    <h1 class="title" style="margin-top:32px">Trash</h1>
    <p class="trash-note">Deleted pages wait here. Restore brings back the page and everything inside it.</p>
    ${batches.length ? `<div class="table-wrap"><table class="table trash-table"><tbody>${rows}</tbody></table></div>` : `<p class="empty-state">Trash is empty.</p>`}
  </div>`;
}

/** @param {string} trashFile @returns {Promise<void>} */
async function restoreFromTrash(trashFile) {
  try {
    const { restored } = await api("/api/trash/restore", { method: "POST", body: JSON.stringify({ trashFile }) });
    await loadAll();
    toast(`Restored ${restored.length} page${restored.length > 1 ? "s" : ""}`);
    renderTree();
    renderTrash();
    refreshTrashCount();
  } catch (err) { toast(err.message); }
}

/** @param {string} trashFile @param {string} title @returns {Promise<void>} */
async function purgeFromTrash(trashFile, title) {
  if (!confirm(`Delete "${title}" forever?\n\nThis erases the page and everything inside it. It cannot be undone.`)) return;
  try {
    await api(`/api/trash/${encodeURIComponent(trashFile)}`, { method: "DELETE" });
    toast("Deleted forever");
    renderTrash();
    refreshTrashCount();
  } catch (err) { toast(err.message); }
}

/* ---------- Events ---------- */

main.addEventListener("click", (e) => {
  const t = e.target;
  const id = currentId();
  const action = t.closest("[data-action]");
  if (action) {
    e.stopPropagation();
    const name = action.dataset.action;
    const cardId = action.closest(".card")?.dataset.id || action.dataset.id || id;
    if (name === "new-child") return createPage(action.dataset.parent, action.dataset.status ? { status: action.dataset.status } : {});
    if (name === "icon") return iconPicker(action, id);
    if (name === "cover") return pickCover(id);
    if (name === "remove-cover") { savePage(id, { cover: "" }); return render(); }
    if (name === "set-folder") return folderPicker(action, id);
    if (name === "open-folder") return openFolder(state.pages.get(id).folder);
    if (name === "card-folder") return openFolder(state.pages.get(cardId).folder);
    if (name === "menu") return cardMenu(action, action.dataset.id);
  }
  const view = t.closest("[data-view]");
  if (view) { setCollectionConfig(view.dataset.scope, { view: view.dataset.view }); return renderMain(); }
  const sort = t.closest("[data-sort]");
  if (sort) {
    tableSort = tableSort.key === sort.dataset.sort ? { key: sort.dataset.sort, dir: -tableSort.dir } : { key: sort.dataset.sort, dir: 1 };
    return renderMain();
  }
  const colMenu = t.closest("[data-colmenu]");
  if (colMenu) return columnMenu(colMenu, colMenu.dataset.scope, colMenu.dataset.colmenu);
  const restore = t.closest("[data-restore]");
  if (restore) return restoreFromTrash(restore.dataset.restore);
  const purge = t.closest("[data-purge]");
  if (purge) return purgeFromTrash(purge.dataset.purge, purge.dataset.title);
  const open = t.closest("[data-open]");
  if (open) { location.hash = `#/p/${open.dataset.open}`; return; }
  const ratio = t.closest("[data-ratio]");
  const size = t.closest("[data-size]");
  if (ratio || size) {
    const btn = ratio || size;
    const key = ratio ? "cardRatio" : "cardSize";
    const value = ratio ? btn.dataset.ratio : btn.dataset.size;
    setCollectionConfig(btn.dataset.scope, { [key]: value });
    return renderMain();
  }
  if (t.closest(".doc-host")) return;
  const card = t.closest(".card[data-id]");
  if (card) location.hash = `#/p/${card.dataset.id}`;
});

main.addEventListener("keydown", (e) => {
  if (e.target.matches(".bcol-input") && e.key === "Enter") {
    const name = e.target.value.replace(/\|/g, "").trim();
    const scope = e.target.dataset.scope;
    const cfg = collectionConfig(scope);
    if (!name) return;
    if (cfg.columns.includes(name)) return toast("That column already exists");
    setCollectionConfig(scope, { boardColumns: [...cfg.columns, name].join("|") });
    renderMain();
    $(".bcol-input")?.focus();
    return;
  }
  if (e.target.matches(".t-title") && e.key === "Enter") return e.target.blur();
  const card = e.target.closest(".card[data-id], .bcard");
  if (card && e.key === "Enter" && e.target === card) location.hash = `#/p/${card.dataset.id}`;
});

main.addEventListener("input", (e) => {
  if (!e.target.matches(".title, .t-title")) return;
  const id = e.target.dataset.id || currentId();
  savePage(id, { title: e.target.value }, 500);
  clearTimeout(main.treeTimer);
  main.treeTimer = setTimeout(renderTree, 300);
});

/* Card drag: reorder in the grid, or drop on a sidebar row to move inside that page */
main.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".card[draggable]");
  if (!card) return;
  dragId = card.dataset.id;
  card.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragId);
});
main.addEventListener("dragend", () => {
  dragId = null;
  document.querySelectorAll(".dragging, .drop-before, .file-over, .drop").forEach((el) => el.classList.remove("dragging", "drop-before", "file-over", "drop"));
});
main.addEventListener("dragover", (e) => {
  const card = e.target.closest(".card[data-id]");
  const isFile = e.dataTransfer.types.includes("Files");
  if (!card || (!dragId && !isFile)) return;
  e.preventDefault();
  document.querySelectorAll(".drop-before, .file-over").forEach((el) => el.classList.remove("drop-before", "file-over"));
  if (isFile) card.classList.add("file-over");
  else if (card.dataset.id !== dragId) card.classList.add("drop-before");
});
main.addEventListener("drop", async (e) => {
  const card = e.target.closest(".card[data-id]");
  if (!card) return;
  e.preventDefault();
  card.classList.remove("file-over", "drop-before");
  if (e.dataTransfer.files.length) return uploadCover(e.dataTransfer.files[0], card.dataset.id);
  if (!dragId || card.dataset.id === dragId) return;
  const grid = card.closest(".grid");
  const ids = [...grid.querySelectorAll(".card[data-id]")].map((c) => c.dataset.id).filter((x) => x !== dragId);
  ids.splice(ids.indexOf(card.dataset.id), 0, dragId);
  ids.forEach((x, i) => { state.pages.get(x).order = i + 1; });
  render();
  await api("/api/reorder", { method: "POST", body: JSON.stringify({ ids }) }).catch((err) => toast(err.message));
});

main.addEventListener("change", (e) => {
  if (!e.target.matches(".t-status")) return;
  savePage(e.target.dataset.id, { status: e.target.value });
  e.target.closest(".status-pick").style.setProperty("--dot", colorFor(e.target.value));
});

/* ---------- Board drag: 1:1 tracking, velocity tilt, spring settle (Apple fluid-interface rules) ---------- */

/** @returns {boolean} */
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @param {{x:number,y:number,t:number}[]} history @returns {{x:number,y:number}} px per second */
function releaseVelocity(history) {
  if (history.length < 2) return { x: 0, y: 0 };
  const a = history[0];
  const b = history[history.length - 1];
  const dt = Math.max(1, b.t - a.t) / 1000;
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}

/**
 * Critically-ish damped springs, one per property, started from the live value and velocity.
 * @param {Record<string,{value:number,velocity:number,target:number}>} props
 * @param {{damping:number,response:number}} params
 * @param {(values:Record<string,number>) => void} onFrame
 * @param {() => void} done
 * @returns {void}
 */
function runSpring(props, { damping, response }, onFrame, done) {
  const stiffness = (2 * Math.PI / response) ** 2;
  const friction = (4 * Math.PI * damping) / response;
  let last = performance.now();
  /** @param {number} now @returns {void} */
  const step = (now) => {
    let remaining = Math.min(0.05, (now - last) / 1000);
    last = now;
    while (remaining > 0) {
      const dt = Math.min(0.004, remaining);
      remaining -= dt;
      for (const p of Object.values(props)) {
        p.velocity += (-stiffness * (p.value - p.target) - friction * p.velocity) * dt;
        p.value += p.velocity * dt;
      }
    }
    const settled = Object.values(props).every((p) => Math.abs(p.value - p.target) < 0.3 && Math.abs(p.velocity) < 4);
    onFrame(Object.fromEntries(Object.entries(props).map(([k, p]) => [k, settled ? p.target : p.value])));
    settled ? done() : requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** @param {HTMLElement[]} elements @param {() => void} mutate @returns {void} */
function flip(elements, mutate) {
  const before = new Map(elements.map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  if (reducedMotion()) return;
  for (const [el, r] of before) {
    const a = el.getBoundingClientRect();
    const dx = r.left - a.left;
    const dy = r.top - a.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)" });
  }
}

/** @param {number} dx @param {number} dy @param {number} tilt @param {number} scale @returns {string} */
const liftTransform = (dx, dy, tilt, scale) => `translate3d(${dx}px, ${dy}px, 0) rotate(${tilt}deg) scale(${scale})`;

/** @param {object} d @returns {void} */
function liftCard(d) {
  d.active = true;
  d.placeholder = document.createElement("div");
  d.placeholder.className = "bplaceholder";
  d.placeholder.style.height = `${d.rect.height}px`;
  d.card.before(d.placeholder);
  Object.assign(d.card.style, { position: "fixed", left: `${d.rect.left}px`, top: `${d.rect.top}px`, width: `${d.rect.width}px`, height: `${d.rect.height}px`, zIndex: 100, pointerEvents: "none" });
  d.card.classList.add("lifted");
  d.card.closest(".board").classList.add("dragging-board");
}

/** @param {object} d @param {number} x @param {number} y @returns {void} */
function movePlaceholder(d, x, y) {
  const col = document.elementFromPoint(x, y)?.closest(".bcol:not(.bcol-new)");
  document.querySelectorAll(".bcol.over").forEach((c) => c !== col && c.classList.remove("over"));
  if (!col) return;
  col.classList.add("over");
  const list = col.querySelector(".bcol-list");
  const cards = [...list.querySelectorAll(".bcard")].filter((c) => c !== d.card);
  const before = cards.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
  if (d.placeholder.parentElement === list && d.placeholder.nextElementSibling === (before || null)) return;
  if (before && d.placeholder.nextElementSibling === d.card && d.card.nextElementSibling === before) return;
  const affected = [...document.querySelectorAll(".board .bcard")].filter((c) => c !== d.card);
  flip(affected, () => list.insertBefore(d.placeholder, before));
}

main.addEventListener("pointerdown", (e) => {
  const card = e.target.closest(".bcard");
  if (!card || e.button !== 0 || e.target.closest("button") || boardDrag) return;
  boardDrag = { card, id: card.dataset.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, rect: card.getBoundingClientRect(), active: false, dx: 0, dy: 0, tilt: 0, history: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  main.setPointerCapture(e.pointerId);
  card.classList.add("pressed");
});

main.addEventListener("pointermove", (e) => {
  const d = boardDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;
  d.history.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  if (d.history.length > 5) d.history.shift();
  if (!d.active) {
    if (Math.hypot(dx, dy) < 6) return;
    d.card.classList.remove("pressed");
    liftCard(d);
  }
  d.dx = dx;
  d.dy = dy;
  d.tilt = reducedMotion() ? 0 : Math.max(-4, Math.min(4, releaseVelocity(d.history).x / 400));
  d.card.style.transform = liftTransform(dx, dy, d.tilt, 1.03);
  movePlaceholder(d, e.clientX, e.clientY);
});

/** @param {PointerEvent} e @param {boolean} cancelled @returns {void} */
function endBoardDrag(e, cancelled) {
  const d = boardDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  boardDrag = null;
  d.card.classList.remove("pressed");
  if (!d.active) {
    if (!cancelled) location.hash = `#/p/${d.id}`;
    return;
  }
  document.querySelectorAll(".bcol.over").forEach((c) => c.classList.remove("over"));
  if (cancelled) return renderMain();
  const target = d.placeholder.getBoundingClientRect();
  const velocity = releaseVelocity(d.history);
  const props = {
    x: { value: d.dx, velocity: velocity.x, target: target.left - d.rect.left },
    y: { value: d.dy, velocity: velocity.y, target: target.top - d.rect.top },
    tilt: { value: d.tilt, velocity: 0, target: 0 },
    scale: { value: 1.03, velocity: 0, target: 1 },
  };
  const finish = () => commitBoardDrop(d);
  if (reducedMotion()) return finish();
  runSpring(props, { damping: 0.82, response: 0.32 }, (v) => { d.card.style.transform = liftTransform(v.x, v.y, v.tilt, v.scale); }, finish);
}
main.addEventListener("pointerup", (e) => endBoardDrag(e, false));
main.addEventListener("pointercancel", (e) => endBoardDrag(e, true));

/** @param {object} d @returns {Promise<void>} */
async function commitBoardDrop(d) {
  const board = d.placeholder.closest(".board");
  const parentId = board.dataset.parent;
  const status = d.placeholder.closest(".bcol").dataset.status;
  /** @param {"nextElementSibling"|"previousElementSibling"} dir @returns {string|undefined} */
  const neighbour = (dir) => {
    let el = d.placeholder[dir];
    while (el && (el === d.card || !el.matches(".bcard"))) el = el[dir];
    return el?.dataset.id;
  };
  const next = neighbour("nextElementSibling");
  const prev = neighbour("previousElementSibling");
  const ids = childrenOf(parentId).map((p) => p.id).filter((id) => id !== d.id);
  const at = next ? ids.indexOf(next) : prev ? ids.indexOf(prev) + 1 : ids.length;
  ids.splice(at, 0, d.id);
  ids.forEach((id, i) => { state.pages.get(id).order = i + 1; });
  const page = state.pages.get(d.id);
  if ((page.status || "") !== status) savePage(d.id, { status });
  renderMain();
  await api("/api/reorder", { method: "POST", body: JSON.stringify({ ids }) }).catch((err) => toast(err.message));
}

$("#tree").addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle]");
  if (!toggle) return;
  const id = toggle.dataset.toggle;
  state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
  writeLocal("mosaic.expanded", [...state.expanded]);
  renderTree();
});
$("#tree").addEventListener("dragover", (e) => {
  const row = e.target.closest(".tree-row");
  if (!row || !dragId || row.dataset.id === dragId) return;
  e.preventDefault();
  document.querySelectorAll(".tree-row.drop").forEach((el) => el.classList.remove("drop"));
  row.classList.add("drop");
});
$("#tree").addEventListener("drop", async (e) => {
  const row = e.target.closest(".tree-row");
  if (!row || !dragId) return;
  e.preventDefault();
  const id = dragId;
  const parent = row.dataset.id;
  const patch = { parent, order: childrenOf(parent).length + 1 };
  try {
    await api(`/api/pages/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    Object.assign(state.pages.get(id), patch);
    toast(`Moved into ${state.pages.get(parent).title}`);
    render();
  } catch (err) {
    toast(err.message);
  }
});

$("#new-root").addEventListener("click", () => createPage(currentId()));
$("#cover-input").addEventListener("change", (e) => { if (coverTarget && e.target.files[0]) uploadCover(e.target.files[0], coverTarget); });

$("#search").addEventListener("input", (e) => { state.query = e.target.value.trim(); renderMain(); });
$("#search").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.target.value = ""; state.query = ""; renderMain(); e.target.blur(); } });

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#search").focus(); $("#search").select(); }
  if (e.key === "Escape") closePop();
});

document.addEventListener("paste", (e) => {
  const id = currentId();
  if (!id || e.target.closest("input, textarea, .blk-code")) return;
  const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
  if (file) { e.preventDefault(); uploadCover(file, id); }
});

window.addEventListener("hashchange", () => {
  state.query = "";
  $("#search").value = "";
  closePop();
  render();
  main.scrollTop = 0;
});

/** @returns {boolean} true while you are typing or a save is still on its way */
const busy = () => Boolean(document.activeElement?.closest(".doc, .title, textarea")) || [...state.pages.values()].some((p) => p._pending || p._saving);

/** @returns {string} a fingerprint of all pages, to tell if anything changed */
const snapshot = () => JSON.stringify([...state.pages.values()].map(({ _pending, _saving, ...p }) => p));

window.addEventListener("focus", async () => {
  if (busy()) return;
  const before = snapshot();
  await loadAll().catch(() => {});
  if (!busy() && snapshot() !== before) render();
});

loadAll().then(() => { render(); refreshTrashCount(); }).catch((err) => {
  if (!$("#signin").hidden) return;
  main.innerHTML = `<div class="page"><p class="empty-state">Mosaic cannot reach its server.<br>${esc(err.message)}</p></div>`;
});
