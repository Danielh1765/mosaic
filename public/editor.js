// Mosaic block editor. The page is always shown formatted; click anywhere to type in place.
// Each block is its own small editable area. Pages are still saved as plain Markdown.

const CALLOUT_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const CALLOUT_TYPES = { note: ["📝", "blue"], info: ["ℹ️", "blue"], tip: ["💡", "green"], success: ["✅", "green"], question: ["❓", "yellow"], warning: ["⚠️", "orange"], danger: ["🚨", "red"], quote: ["💬", "gray"], example: ["🧪", "purple"] };
const TEXT_TYPES = new Set(["p", "h1", "h2", "h3", "bullet", "numbered", "todo", "toggle"]);
const LIST_TYPES = new Set(["bullet", "numbered", "todo"]);
const CONTAINERS = new Set(["quote", "callout", "toggle"]);
const SOLID = new Set(["divider", "page", "table", "gallery"]);

/** Slash menu and "Turn into" choices. */
const COMMANDS = [
  { id: "p", label: "Text", hint: "Plain text", glyph: "Aa", words: "text paragraph plain" },
  { id: "h1", label: "Heading 1", hint: "Big heading", glyph: "H1", words: "heading title h1 #" },
  { id: "h2", label: "Heading 2", hint: "Medium heading", glyph: "H2", words: "heading subtitle h2 ##" },
  { id: "h3", label: "Heading 3", hint: "Small heading", glyph: "H3", words: "heading h3 ###" },
  { id: "toggle", label: "Toggle list", hint: "Hide text inside", glyph: "▸", words: "toggle collapse fold details" },
  { id: "toggle-h1", label: "Toggle heading 1", hint: "Big heading that folds", glyph: "▸H1", words: "toggle heading h1 fold" },
  { id: "toggle-h2", label: "Toggle heading 2", hint: "Medium heading that folds", glyph: "▸H2", words: "toggle heading h2 fold" },
  { id: "toggle-h3", label: "Toggle heading 3", hint: "Small heading that folds", glyph: "▸H3", words: "toggle heading h3 fold" },
  { id: "bullet", label: "Bulleted list", hint: "Simple list", glyph: "•", words: "bullet list unordered ul -" },
  { id: "numbered", label: "Numbered list", hint: "1, 2, 3", glyph: "1.", words: "numbered list ordered ol" },
  { id: "todo", label: "To-do", hint: "Tick box", glyph: "☑", words: "todo task check checkbox" },
  { id: "callout", label: "Callout", hint: "Coloured box with an emoji", glyph: "💡", words: "callout note box tip" },
  { id: "quote", label: "Quote", hint: "Quote text", glyph: "❝", words: "quote blockquote" },
  { id: "divider", label: "Divider", hint: "Line between sections", glyph: "—", words: "divider line hr rule separator" },
  { id: "code", label: "Code", hint: "Code or plain text", glyph: "</>", words: "code snippet pre" },
  { id: "page", label: "Page", hint: "New page inside this one", glyph: "📄", words: "page subpage sub-page link new" },
  { id: "table", label: "Table", hint: "Rows and columns", glyph: "▦", words: "table grid rows columns spreadsheet" },
  { id: "gallery", label: "Gallery", hint: "Show the cards of a page", glyph: "▤", words: "gallery cards board covers linked view" },
];

/** @typedef {{id:string,type:string,text?:string,checked?:boolean,level?:number,icon?:string,color?:string,kind?:string,explicitColor?:boolean,fold?:string,open?:boolean,lang?:string,pageId?:string,label?:string,children?:Block[],rows?:string[][],align?:string[],at?:{r:number,c:number},picking?:boolean}} Block */

let nextId = 1;
/** @param {Partial<Block>} props @returns {Block} */
const blk = (props) => ({ id: `b${nextId++}`, text: "", ...props });

/** @param {string} text @returns {string} */
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- Markdown → blocks ---------- */

/** @param {string} text Markdown inline text @returns {string} HTML */
export function inlineToHtml(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => href.startsWith("#") || /^(https?:|mailto:|\/)/.test(href) ? `<a href="${href}">${label}</a>` : m)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
}

/** @param {string} head @returns {{kind:string,icon:string,color:string,explicitColor:boolean,fold:string,title:string}|null} */
function parseCalloutHead(head) {
  const m = head.match(/^\[!([^\]\s]+)(?:\s+([a-z]+))?\]([+-]?)\s*(.*)$/i);
  if (!m) return null;
  const type = CALLOUT_TYPES[m[1].toLowerCase()];
  const named = CALLOUT_COLORS.includes((m[2] || "").toLowerCase());
  return { kind: m[1], icon: type ? type[0] : m[1], color: named ? m[2].toLowerCase() : type ? type[1] : "gray", explicitColor: named, fold: m[3], title: m[4] };
}

const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** @param {string} line @returns {string[]} cells of one pipe-table row */
function splitRow(line) {
  const cells = [];
  let cur = "";
  const body = line.trim().replace(/^\|/, "").replace(/(^|[^\\])\|$/, "$1");
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && body[i + 1] === "|") { cur += "|"; i++; }
    else if (body[i] === "|") { cells.push(cur.trim()); cur = ""; }
    else cur += body[i];
  }
  cells.push(cur.trim());
  return cells;
}

/** @param {string} cell @returns {string} alignment name from a separator cell */
const alignOf = (cell) => (cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : "");

/** @param {string} md @returns {Block[]} */
export function parseMarkdown(md) {
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      out.push(blk({ type: "code", lang: line.slice(3).trim(), text: code.join("\n") }));
      continue;
    }
    if (/^>( |$)/.test(line)) {
      const inner = [];
      while (i < lines.length && /^>( |$)/.test(lines[i])) inner.push(lines[i++].replace(/^> ?/, ""));
      i--;
      const head = parseCalloutHead(inner[0] || "");
      if (head && head.kind.toLowerCase() === "toggle") {
        const hm = head.title.match(/^(#{1,3}) (.*)$/);
        out.push(blk({ type: "toggle", level: hm ? hm[1].length : 0, text: hm ? hm[2] : head.title, children: parseMarkdown(inner.slice(1).join("\n")) }));
      } else if (head) {
        const children = parseMarkdown(inner.slice(1).join("\n"));
        if (head.title) children.unshift(blk({ type: "p", text: `**${head.title}**` }));
        out.push(blk({ type: "callout", kind: head.kind, icon: head.icon, color: head.color, explicitColor: head.explicitColor, fold: head.fold, children }));
      } else out.push(blk({ type: "quote", children: parseMarkdown(inner.join("\n")) }));
      continue;
    }
    if (line.includes("|") && lines[i + 1]?.includes("|") && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map(alignOf);
      const rows = [head];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      i--;
      const width = Math.max(...rows.map((r) => r.length));
      out.push(blk({ type: "table", rows: rows.map((r) => [...r, ...Array(width - r.length).fill("")]), align: Array.from({ length: width }, (_, c) => align[c] || "") }));
      continue;
    }
    const gallery = line.trim().match(/^\[Gallery: ([^\]]*)\]\(#\/gallery\/(\w+)\)$/);
    if (gallery) { out.push(blk({ type: "gallery", pageId: gallery[2], label: gallery[1] })); continue; }
    const page = line.trim().match(/^\[([^\]]*)\]\(#\/p\/(\w+)\)$/);
    const todo = line.match(/^\s*[-*] \[( |x|X)\](?: (.*))?$/);
    const bullet = line.match(/^\s*[-*] (.*)$/);
    const numbered = line.match(/^\s*\d+[.)] (.*)$/);
    const heading = line.match(/^(#{1,6}) (.*)$/);
    if (page) out.push(blk({ type: "page", pageId: page[2], label: page[1] }));
    else if (todo) out.push(blk({ type: "todo", checked: todo[1] !== " ", text: todo[2] || "" }));
    else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) out.push(blk({ type: "divider" }));
    else if (bullet) out.push(blk({ type: "bullet", text: bullet[1] }));
    else if (numbered) out.push(blk({ type: "numbered", text: numbered[1] }));
    else if (heading) out.push(blk({ type: `h${Math.min(3, heading[1].length)}`, text: heading[2] }));
    else if (line.trim()) out.push(blk({ type: "p", text: line.trim() }));
  }
  return out;
}

/* ---------- Blocks → Markdown ---------- */

/** @param {Block[]} blocks @param {(id:string)=>string} titleOf @returns {string[]} */
function toLines(blocks, titleOf) {
  const out = [];
  let prev = null;
  let n = 0;
  for (const b of blocks) {
    const lines = blockLines(b, titleOf, b.type === "numbered" ? (n = prev?.type === "numbered" ? n + 1 : 1) : 0);
    if (!lines) continue;
    const tight = prev && LIST_TYPES.has(prev.type) && LIST_TYPES.has(b.type);
    if (prev && !tight) out.push("");
    out.push(...lines);
    prev = b;
  }
  return out;
}

/** @param {string[]} lines @returns {string[]} */
const quoted = (lines) => lines.map((l) => (l ? `> ${l}` : ">"));

/** @param {Block} b @param {(id:string)=>string} titleOf @param {number} n @returns {string[]|null} */
function blockLines(b, titleOf, n) {
  const text = (b.text || "").trim();
  switch (b.type) {
    case "p": return text ? [text] : null;
    case "h1": case "h2": case "h3": return text ? [`${"#".repeat(Number(b.type[1]))} ${text}`] : null;
    case "bullet": return [`- ${text}`];
    case "numbered": return [`${n}. ${text}`];
    case "todo": return [`- [${b.checked ? "x" : " "}] ${text}`];
    case "divider": return ["---"];
    case "code": return ["```" + (b.lang || ""), ...(b.text || "").split("\n"), "```"];
    case "page": return [`[${(titleOf(b.pageId) || b.label || "Untitled").replace(/[[\]]/g, "")}](#/p/${b.pageId})`];
    case "table": {
      const cell = (t) => ` ${String(t || "").replace(/\|/g, "\\|").trim()} `;
      const row = (r) => `|${r.map(cell).join("|")}|`;
      const sep = (b.align || []).concat(Array(b.rows[0].length).fill("")).slice(0, b.rows[0].length)
        .map((a) => ` ${a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---"} `);
      return [row(b.rows[0]), `|${sep.join("|")}|`, ...b.rows.slice(1).map(row)];
    }
    case "gallery": return b.pageId ? [`[Gallery: ${(titleOf(b.pageId) || b.label || "Untitled").replace(/[[\]]/g, "")}](#/gallery/${b.pageId})`] : null;
    case "quote": {
      const inner = toLines(b.children || [], titleOf);
      return inner.length ? quoted(inner) : null;
    }
    case "callout": {
      const head = `[!${b.kind || b.icon || "💡"}${b.explicitColor ? ` ${b.color}` : ""}]${b.fold || ""}`;
      return quoted([head, ...toLines(b.children || [], titleOf)]);
    }
    case "toggle": return quoted([`[!toggle]-${b.level ? ` ${"#".repeat(b.level)}` : ""} ${text}`.replace(/\s+$/, ""), ...toLines(b.children || [], titleOf)]);
    default: return null;
  }
}

/** @param {Block[]} blocks @param {(id:string)=>string} titleOf @returns {string} */
export const toMarkdown = (blocks, titleOf = () => "") => toLines(blocks, titleOf).join("\n").trim() + "\n";

/* ---------- Inline HTML → Markdown ---------- */

/** @param {string} mark @param {string} inner @returns {string} wraps text, keeping spaces outside the marks */
function wrap(mark, inner) {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
}

/** @param {Node} node @returns {string} */
function nodeToInline(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/ /g, " ").replace(/\n/g, " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = /** @type {HTMLElement} */ (node);
  const inner = [...el.childNodes].map(nodeToInline).join("");
  const tag = el.tagName;
  const weight = el.style?.fontWeight;
  if (tag === "BR") return " ";
  if (tag === "IMG") return `![${el.getAttribute("alt") || ""}](${el.getAttribute("src") || ""})`;
  if (tag === "STRONG" || tag === "B" || weight === "bold" || Number(weight) >= 600) return wrap("**", inner);
  if (tag === "EM" || tag === "I" || el.style?.fontStyle === "italic") return wrap("*", inner);
  if (tag === "CODE") return inner ? `\`${inner}\`` : "";
  if (tag === "DEL" || tag === "S" || tag === "STRIKE") return wrap("~~", inner);
  if (tag === "A") return inner ? `[${inner}](${el.getAttribute("href") || ""})` : "";
  return inner;
}

/** @param {HTMLElement} el @returns {string} */
const elToInline = (el) => [...el.childNodes].map(nodeToInline).join("").replace(/\s+$/, (s) => (s.length > 1 ? " " : s));

/* ---------- Caret helpers ---------- */

/** @param {HTMLElement} el @returns {number} caret position counted in plain text */
function caretOffset(el) {
  const sel = getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return 0;
  const range = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/** @param {HTMLElement} el @param {number} offset @returns {{node:Node,offset:number}} */
function pointAt(el, offset) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = offset;
  let last = null;
  while (walker.nextNode()) {
    const len = walker.currentNode.nodeValue.length;
    if (left <= len) return { node: walker.currentNode, offset: left };
    left -= len;
    last = walker.currentNode;
  }
  return last ? { node: last, offset: last.nodeValue.length } : { node: el, offset: el.childNodes.length };
}

/** @param {HTMLElement} el @param {number|"end"} offset @returns {void} */
function placeCaret(el, offset) {
  el.focus({ preventScroll: true });
  const point = pointAt(el, offset === "end" ? Infinity : offset);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  el.scrollIntoView({ block: "nearest" });
}

/** @param {HTMLElement} el @returns {boolean} */
function caretOnFirstLine(el) {
  const rect = caretRect();
  return !rect || rect.top - el.getBoundingClientRect().top < parseFloat(getComputedStyle(el).lineHeight || "24") * 0.8;
}

/** @param {HTMLElement} el @returns {boolean} */
function caretOnLastLine(el) {
  const rect = caretRect();
  return !rect || el.getBoundingClientRect().bottom - rect.bottom < parseFloat(getComputedStyle(el).lineHeight || "24") * 0.8;
}

/** @returns {DOMRect|null} */
function caretRect() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getClientRects()[0];
  if (rect) return rect;
  const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  return node?.getBoundingClientRect?.() || null;
}

/* ---------- The editor ---------- */

/**
 * @param {HTMLElement} host
 * @param {{markdown:string, onChange:(md:string)=>void, titleOf:(id:string)=>string, iconOf:(id:string)=>string,
 *   createPage:()=>Promise<string|null>, openPage:(id:string)=>void, pickEmoji:(anchor:HTMLElement, done:(emoji:string)=>void)=>void,
 *   galleryHtml:(id:string)=>string, listPages:()=>{id:string,title:string,icon:string,count:number}[]}} options
 * @returns {{destroy:()=>void}}
 */
export function mountEditor(host, options) {
  let blocks = parseMarkdown(options.markdown);
  let menu = null;
  let dragId = null;
  const root = document.createElement("div");
  root.className = "doc body-view";
  const tail = document.createElement("div");
  tail.className = "doc-tail";
  tail.title = "Click to write";
  host.replaceChildren(root, tail);

  /* --- model helpers --- */

  /** @param {string} id @param {Block[]} list @returns {{block:Block,list:Block[],index:number,parent:Block|null}|null} */
  function find(id, list = blocks, parent = null) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { block: list[i], list, index: i, parent };
      if (list[i].children) { const hit = find(id, list[i].children, list[i]); if (hit) return hit; }
    }
    return null;
  }

  /** @param {Block} b @returns {boolean} */
  const isInside = (b, id) => (b.children || []).some((c) => c.id === id || isInside(c, id));

  const changed = () => options.onChange(toMarkdown(blocks, options.titleOf));

  /** @param {Block[]} list @returns {void} keeps one typing spot in every container and at the end */
  function ensureSlots(list, isRoot) {
    for (const b of list) if (b.children) { if (!b.children.length) b.children.push(blk({ type: "p" })); ensureSlots(b.children, false); }
    if (isRoot && !list.length) list.push(blk({ type: "p" }));
  }

  /* --- rendering --- */

  /** @param {Block} b @param {number} n numbered-list position @returns {HTMLElement} */
  function renderBlock(b, n) {
    const el = document.createElement("div");
    el.className = `blk blk-${b.type}${b.type === "toggle" && b.level ? ` blk-toggle-h${b.level}` : ""}`;
    el.dataset.bid = b.id;
    const side = `<span class="blk-side" contenteditable="false"><button type="button" class="blk-add" data-ed="add" aria-label="Add a block below" tabindex="-1">+</button><button type="button" class="blk-grip" data-ed="grip" draggable="true" aria-label="Drag to move, click for options" tabindex="-1">⋮⋮</button></span>`;
    const text = (cls = "", ph = "") => `<div class="blk-text ${cls}" contenteditable="true" spellcheck="true" data-ph="${esc(ph)}">${inlineToHtml(b.text || "")}</div>`;
    let inner = "";
    switch (b.type) {
      case "p": inner = text("", "Type '/' for commands"); break;
      case "h1": case "h2": case "h3": inner = text(b.type, `Heading ${b.type[1]}`); break;
      case "bullet": inner = `<span class="blk-marker" contenteditable="false">•</span>${text("", "List")}`; break;
      case "numbered": inner = `<span class="blk-marker" contenteditable="false">${n}.</span>${text("", "List")}`; break;
      case "todo": inner = `<input type="checkbox" class="blk-check" data-ed="check" ${b.checked ? "checked" : ""} aria-label="Done">${text(b.checked ? "done" : "", "To-do")}`; break;
      case "divider": inner = `<hr contenteditable="false">`; break;
      case "code": inner = `<pre class="blk-text blk-code" contenteditable="plaintext-only" spellcheck="false" data-ph="Code">${esc(b.text || "")}</pre>`; break;
      case "page": inner = `<a class="blk-page" contenteditable="false" href="#/p/${esc(b.pageId)}"><span>${esc(options.iconOf(b.pageId) || "📄")}</span><span>${esc(options.titleOf(b.pageId) || b.label || "Untitled")}</span></a>`; break;
      case "table": inner = tableHtml(b); break;
      case "gallery": inner = galleryHtml(b); break;
      case "quote": inner = `<div class="blk-children"></div>`; break;
      case "callout": inner = `<aside class="callout callout-${esc(b.color || "gray")}"><button type="button" class="callout-icon" data-ed="icon" contenteditable="false" aria-label="Change emoji">${esc(b.icon || "💡")}</button><div class="callout-body blk-children"></div></aside>`; break;
      case "toggle": inner = `<div class="toggle-row"><button type="button" class="toggle-arrow ${b.open ? "open" : ""}" data-ed="fold" contenteditable="false" aria-label="${b.open ? "Close" : "Open"}" aria-expanded="${Boolean(b.open)}">▸</button>${text(b.level ? `h${b.level}` : "", b.level ? `Toggle heading` : "Toggle")}</div><div class="blk-children toggle-kids" ${b.open ? "" : "hidden"}></div>`; break;
    }
    el.innerHTML = side + `<div class="blk-main">${inner}</div>`;
    const kids = el.querySelector(".blk-children");
    if (kids) renderList(b.children || [], kids);
    return el;
  }

  /** @param {Block} b @returns {string} the table with editable cells and row/column buttons */
  function tableHtml(b) {
    const cells = b.rows.map((row, r) => `<tr>${row.map((t, c) => {
      const tag = r === 0 ? "th" : "td";
      const align = b.align?.[c] ? ` style="text-align:${b.align[c]}"` : "";
      return `<${tag} class="tbl-cell" contenteditable="true" spellcheck="true" data-r="${r}" data-c="${c}"${align}>${inlineToHtml(t)}</${tag}>`;
    }).join("")}</tr>`).join("");
    const btn = (ed, label, title) => `<button type="button" data-ed="${ed}" title="${title}" tabindex="-1">${label}</button>`;
    return `<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl"><tbody>${cells}</tbody></table></div>
      <div class="tbl-tools" contenteditable="false">${btn("row-add", "+ Row", "Add a row below the cursor")}${btn("col-add", "+ Column", "Add a column right of the cursor")}${btn("row-del", "− Row", "Remove the row with the cursor")}${btn("col-del", "− Column", "Remove the column with the cursor")}</div></div>`;
  }

  /** @param {string} query @param {string} current @returns {string} page choices for a gallery */
  function galleryChoices(query, current) {
    const q = query.toLowerCase().trim();
    const hits = options.listPages()
      .filter((p) => !q || p.title.toLowerCase().includes(q))
      .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || a.title.localeCompare(b.title))
      .slice(0, 8);
    if (!hits.length) return `<p class="gal-empty">No page called “${esc(query)}”.</p>`;
    return hits.map((p, i) => `<button type="button" class="${i === 0 ? "on" : ""} ${p.id === current ? "current" : ""}" data-gal="${esc(p.id)}"><span>${esc(p.icon || "📄")}</span><strong>${esc(p.title)}</strong><small>${p.count} card${p.count === 1 ? "" : "s"}</small></button>`).join("");
  }

  /** @param {Block} b @returns {string} the gallery cards, or the page picker */
  function galleryHtml(b) {
    if (!b.pageId || b.picking) {
      return `<div class="gal gal-picking" contenteditable="false"><p class="gal-ask">Show the cards of which page?</p>
        <input class="gal-search" type="search" placeholder="Search pages…" aria-label="Search pages" autocomplete="off">
        <div class="gal-list" role="listbox">${galleryChoices("", b.pageId)}</div></div>`;
    }
    const title = options.titleOf(b.pageId);
    const cards = title ? options.galleryHtml(b.pageId) : "";
    const count = options.listPages().find((p) => p.id === b.pageId)?.count || 0;
    return `<div class="gal" contenteditable="false">
      <div class="gal-head"><a class="gal-title" href="#/p/${esc(b.pageId)}">${esc(options.iconOf(b.pageId) || "📄")} ${esc(title || b.label || "Missing page")}</a>
        <span class="gal-count">${title ? `${count} card${count === 1 ? "" : "s"}` : "Page not found"}</span>
        <button type="button" class="gal-change" data-ed="gal-pick" tabindex="-1">Change page</button></div>
      ${cards || `<p class="gal-empty">${title ? "No cards inside this page yet." : "This page was deleted or moved to the trash."}</p>`}</div>`;
  }

  /** @param {Block[]} list @param {HTMLElement} into @returns {void} */
  function renderList(list, into) {
    let n = 0;
    let prev = null;
    for (const b of list) {
      n = b.type === "numbered" ? (prev?.type === "numbered" ? n + 1 : 1) : 0;
      into.append(renderBlock(b, n));
      prev = b;
    }
  }

  /** @param {string} [focusId] @param {number|"end"} [offset] @returns {void} */
  function render(focusId, offset = 0) {
    ensureSlots(blocks, true);
    root.replaceChildren();
    renderList(blocks, root);
    if (focusId) focusBlock(focusId, offset);
  }

  /** @param {string} id @param {number|"end"} offset @returns {void} */
  function focusBlock(id, offset) {
    const el = root.querySelector(`[data-bid="${id}"] .blk-text`);
    if (el && el.closest(".blk").dataset.bid === id) placeCaret(el, offset);
    else {
      const b = find(id)?.block;
      const firstKid = b?.children?.[0];
      if (firstKid) focusBlock(firstKid.id, offset);
    }
  }

  /** @param {HTMLElement} el @returns {string} */
  const blockIdOf = (el) => el.closest(".blk")?.dataset.bid;

  /** @returns {HTMLElement[]} every typing area in reading order, table cells included */
  const textAreas = () => [...root.querySelectorAll(".blk-text, .tbl-cell")].filter((t) => !t.closest("[hidden]"));

  /** @param {string} id @param {number} r @param {number} c @param {number|"end"} [offset] @returns {void} */
  function focusCell(id, r, c, offset = "end") {
    const cell = root.querySelector(`[data-bid="${id}"] .tbl-cell[data-r="${r}"][data-c="${c}"]`);
    if (cell) placeCaret(cell, offset);
  }

  /* --- turning blocks into other blocks --- */

  /** @param {Block} b @param {string} cmd @returns {Block} the block to put the caret in */
  function turnInto(b, cmd) {
    const text = b.text || "";
    const wasContainer = CONTAINERS.has(b.type) && b.type !== "toggle";
    const kids = b.children || [];
    delete b.checked; delete b.level; delete b.children; delete b.open;
    if (cmd.startsWith("toggle")) {
      Object.assign(b, { type: "toggle", level: Number(cmd.split("-h")[1] || 0), text: wasContainer ? "" : text, children: wasContainer ? kids : [], open: true });
      return b;
    }
    if (cmd === "callout" || cmd === "quote") {
      const child = blk({ type: "p", text: wasContainer ? "" : text });
      Object.assign(b, cmd === "callout" ? { type: "callout", kind: "💡", icon: "💡", color: "gray", explicitColor: true } : { type: "quote" });
      b.children = wasContainer ? kids : [child];
      b.text = "";
      return b.children[0] || b;
    }
    if (cmd === "code") { Object.assign(b, { type: "code", text: text.replace(/[*_`~]/g, ""), lang: "" }); return b; }
    if (wasContainer) {
      const first = kids.find((k) => TEXT_TYPES.has(k.type));
      b.text = first ? first.text : "";
    }
    b.type = cmd;
    if (cmd === "todo") b.checked = false;
    return b;
  }

  /** @param {Block} b @param {string} cmd @returns {Promise<void>} runs a slash/turn-into command on a block */
  async function applyCommand(b, cmd) {
    const spot = find(b.id);
    if (!spot) return;
    const empty = !SOLID.has(b.type) && !(b.text || "").trim() && !b.children?.some((k) => (k.text || "").trim());
    if (SOLID.has(cmd)) {
      let newBlock;
      if (cmd === "page") {
        const pageId = await options.createPage();
        if (!pageId) return;
        newBlock = blk({ type: "page", pageId });
      } else if (cmd === "table") newBlock = blk({ type: "table", rows: [["", "", ""], ["", "", ""], ["", "", ""]], align: ["", "", ""] });
      else if (cmd === "gallery") newBlock = blk({ type: "gallery", pageId: "" });
      else newBlock = blk({ type: "divider" });
      if (empty && b.type === "p") spot.list.splice(spot.index, 1, newBlock);
      else spot.list.splice(spot.index + 1, 0, newBlock);
      const after = blk({ type: "p" });
      const at = spot.list.indexOf(newBlock);
      if (!spot.list[at + 1] || !TEXT_TYPES.has(spot.list[at + 1].type)) spot.list.splice(at + 1, 0, after);
      render(TEXT_TYPES.has(spot.list[at + 1].type) ? spot.list[at + 1].id : after.id);
      if (cmd === "table") focusCell(newBlock.id, 0, 0);
      if (cmd === "gallery") root.querySelector(`[data-bid="${newBlock.id}"] .gal-search`)?.focus();
      changed();
      if (cmd === "page") options.openPage(newBlock.pageId);
      return;
    }
    if (!SOLID.has(b.type) && (empty || TEXT_TYPES.has(b.type) || CONTAINERS.has(b.type))) {
      const target = turnInto(b, cmd);
      render(target.id, "end");
    } else {
      const fresh = turnInto(blk({ type: "p" }), cmd);
      spot.list.splice(spot.index + 1, 0, fresh);
      render(fresh.id);
    }
    changed();
  }

  /* --- slash menu --- */

  /** @param {HTMLElement} textEl @param {number} start where the "/" is @returns {void} */
  function openMenu(textEl, start, mode = "slash", block = null) {
    closeMenu();
    menu = { textEl, start, mode, block, active: 0, items: COMMANDS, el: document.createElement("div") };
    menu.el.className = "slash-menu";
    menu.el.setAttribute("role", "listbox");
    document.body.append(menu.el);
    const caret = mode === "slash" ? caretRect() : null;
    const box = textEl.getBoundingClientRect();
    menu.anchor = caret && caret.height ? caret : box;
    drawMenu("");
  }

  /** @returns {void} keeps the menu next to where you are typing, below if it fits, else above */
  function placeMenu() {
    const a = menu.anchor;
    const h = menu.el.offsetHeight;
    const below = a.bottom + 6;
    const top = below + h < innerHeight - 8 ? below : Math.max(8, a.top - h - 6);
    Object.assign(menu.el.style, { left: `${Math.min(Math.max(8, a.left), innerWidth - menu.el.offsetWidth - 8)}px`, top: `${top}px` });
  }

  /** @param {string} query @returns {void} */
  function drawMenu(query) {
    const q = query.toLowerCase().trim();
    menu.items = COMMANDS.filter((c) => !q || c.label.toLowerCase().includes(q) || c.words.includes(q));
    if (!menu.items.length) { closeMenu(); return; }
    menu.active = Math.min(menu.active, menu.items.length - 1);
    menu.el.innerHTML = `<p class="slash-head">${menu.mode === "slash" ? "Blocks" : "Turn into"}</p>` + menu.items.map((c, i) =>
      `<button type="button" role="option" class="${i === menu.active ? "on" : ""}" data-cmd="${c.id}" aria-selected="${i === menu.active}"><span class="slash-glyph">${esc(c.glyph)}</span><span><strong>${esc(c.label)}</strong><small>${esc(c.hint)}</small></span></button>`).join("");
    placeMenu();
    menu.el.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }

  /** @returns {void} */
  function closeMenu() {
    menu?.el.remove();
    menu = null;
  }

  /** @param {string} cmd @returns {void} */
  function chooseCommand(cmd) {
    if (!menu) return;
    const { textEl, start, mode } = menu;
    let b = menu.block;
    if (mode === "slash") {
      const id = blockIdOf(textEl);
      b = find(id)?.block;
      const end = caretOffset(textEl);
      const range = document.createRange();
      const a = pointAt(textEl, start);
      const z = pointAt(textEl, end);
      range.setStart(a.node, a.offset);
      range.setEnd(z.node, z.offset);
      range.deleteContents();
      if (b) b.text = b.type === "code" ? textEl.textContent : elToInline(textEl);
    }
    closeMenu();
    if (b) applyCommand(b, cmd);
  }

  /** @param {HTMLElement} textEl @returns {void} opens, updates or closes the slash menu as you type */
  function trackSlash(textEl) {
    const offset = caretOffset(textEl);
    const before = textEl.textContent.slice(0, offset);
    const m = before.match(/(^|\s)\/([\w -]{0,24})$/);
    if (!m) { if (menu?.mode === "slash") closeMenu(); return; }
    const start = offset - m[2].length - 1;
    if (!menu || menu.mode !== "slash" || menu.textEl !== textEl) openMenu(textEl, start);
    else menu.start = start;
    drawMenu(m[2]);
  }

  /* --- Markdown shortcuts typed at the start of a line --- */

  const SHORTCUTS = [
    [/^#\s/, "h1"], [/^##\s/, "h2"], [/^###\s/, "h3"], [/^[-*+]\s/, "bullet"], [/^1[.)]\s/, "numbered"],
    [/^\[ ?\]\s/, "todo"], [/^>\s/, "quote"], [/^```$/, "code"], [/^---$/, "divider"],
  ];

  /** @param {Block} b @param {HTMLElement} textEl @returns {boolean} true when a shortcut changed the block */
  function trySh(b, textEl) {
    if (b.type !== "p") return false;
    const plain = textEl.textContent.replace(/ /g, " ");
    for (const [re, cmd] of SHORTCUTS) {
      const m = plain.match(re);
      if (!m) continue;
      const len = m[0].length;
      const range = document.createRange();
      const z = pointAt(textEl, len);
      range.setStart(pointAt(textEl, 0).node, pointAt(textEl, 0).offset);
      range.setEnd(z.node, z.offset);
      range.deleteContents();
      b.text = elToInline(textEl);
      applyCommand(b, cmd);
      return true;
    }
    return false;
  }

  /* --- typing --- */

  root.addEventListener("input", (e) => {
    const cell = e.target.closest(".tbl-cell");
    if (cell) {
      const b = find(blockIdOf(cell))?.block;
      if (b) { b.rows[cell.dataset.r][cell.dataset.c] = elToInline(cell).replace(/\s+/g, " "); changed(); }
      return;
    }
    if (e.target.matches(".gal-search")) {
      const b = find(blockIdOf(e.target))?.block;
      e.target.closest(".gal").querySelector(".gal-list").innerHTML = galleryChoices(e.target.value, b?.pageId || "");
      return;
    }
    const textEl = e.target.closest(".blk-text");
    if (!textEl) return;
    const b = find(blockIdOf(textEl))?.block;
    if (!b) return;
    b.text = b.type === "code" ? textEl.textContent : elToInline(textEl);
    if (trySh(b, textEl)) return;
    if (b.type !== "code") trackSlash(textEl);
    changed();
  });

  root.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.target.closest(".tbl-cell")) { cellKey(e, e.target.closest(".tbl-cell")); return; }
    if (e.target.matches(".gal-search")) { gallerySearchKey(e); return; }
    const textEl = e.target.closest(".blk-text");
    if (!textEl) return;
    const id = blockIdOf(textEl);
    const spot = find(id);
    if (!spot) return;
    const b = spot.block;

    if (menu) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        menu.active = (menu.active + (e.key === "ArrowDown" ? 1 : -1) + menu.items.length) % menu.items.length;
        drawMenu(menu.mode === "slash" ? textEl.textContent.slice(menu.start + 1, caretOffset(textEl)) : "");
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); chooseCommand(menu.items[menu.active].id); return; }
      if (e.key === "Escape") { e.preventDefault(); closeMenu(); return; }
    }

    const sel = getSelection();
    const collapsed = sel.isCollapsed;
    const offset = caretOffset(textEl);

    if (b.type === "code") {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) { e.preventDefault(); addAfter(spot, blk({ type: "p" })); }
      if (e.key === "Backspace" && collapsed && offset === 0 && !textEl.textContent) { e.preventDefault(); b.type = "p"; b.text = ""; render(b.id); changed(); }
      if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (b.type === "toggle") {
        b.open = true;
        const first = blk({ type: "p" });
        b.children = [first, ...(b.children || []).filter((k) => k.type !== "p" || k.text)];
        render(first.id);
        changed();
        return;
      }
      if (!textEl.textContent.trim() && b.type !== "p") { b.type = "p"; delete b.checked; render(b.id); changed(); return; }
      if (!textEl.textContent.trim() && b.type === "p" && spot.parent && spot.index === spot.list.length - 1 && spot.list.length > 1) {
        spot.list.splice(spot.index, 1);
        const outer = find(spot.parent.id);
        outer.list.splice(outer.index + 1, 0, b);
        render(b.id);
        changed();
        return;
      }
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const rest = document.createRange();
      rest.setStart(range.startContainer, range.startOffset);
      rest.setEnd(textEl, textEl.childNodes.length);
      const holder = document.createElement("div");
      holder.append(rest.extractContents());
      b.text = elToInline(textEl);
      const next = blk({ type: LIST_TYPES.has(b.type) ? b.type : "p", text: elToInline(holder), checked: b.type === "todo" ? false : undefined });
      addAfter(spot, next, 0);
      return;
    }

    if (e.key === "Backspace" && collapsed && offset === 0) {
      if (b.type !== "p" && b.type !== "toggle") { e.preventDefault(); b.type = "p"; delete b.checked; render(b.id); changed(); return; }
      if (b.type === "toggle") { e.preventDefault(); const kids = (b.children || []).filter((k) => k.type !== "p" || k.text); spot.list.splice(spot.index, 1, blk({ type: "p", text: b.text, id: b.id }), ...kids); render(b.id); changed(); return; }
      e.preventDefault();
      if (spot.index === 0) {
        if (!spot.parent) return;
        if (!(b.text || "").trim() && spot.list.length === 1) {
          const outer = find(spot.parent.id);
          outer.list.splice(outer.index, 1, blk({ type: "p", id: b.id }));
          render(b.id);
          changed();
        } else if (!(b.text || "").trim()) {
          spot.list.splice(0, 1);
          const outer = find(spot.parent.id);
          outer.list.splice(outer.index, 0, b);
          render(b.id);
          changed();
        }
        return;
      }
      const prev = spot.list[spot.index - 1];
      if (prev.type === "divider" || prev.type === "page") { spot.list.splice(spot.index - 1, 1); render(b.id); changed(); return; }
      if (prev.type === "table") { focusCell(prev.id, prev.rows.length - 1, prev.rows[0].length - 1); return; }
      if (prev.type === "gallery") return;
      const areas = textAreas();
      const prevArea = areas[areas.indexOf(textEl) - 1];
      const prevBlock = prevArea && find(blockIdOf(prevArea))?.block;
      if (prevBlock?.type === "table") { placeCaret(prevArea, "end"); return; }
      if (!prevBlock || prevBlock.type === "code") return;
      const joinAt = prevArea.textContent.length;
      prevBlock.text = `${prevBlock.text || ""}${b.text || ""}`;
      spot.list.splice(spot.index, 1);
      render(prevBlock.id, joinAt);
      changed();
      return;
    }

    if ((e.key === "ArrowUp" && caretOnFirstLine(textEl)) || (e.key === "ArrowLeft" && collapsed && offset === 0)) {
      const areas = textAreas();
      const prev = areas[areas.indexOf(textEl) - 1];
      if (prev) { e.preventDefault(); placeCaret(prev, "end"); }
      return;
    }
    if ((e.key === "ArrowDown" && caretOnLastLine(textEl)) || (e.key === "ArrowRight" && collapsed && offset === textEl.textContent.length)) {
      const areas = textAreas();
      const next = areas[areas.indexOf(textEl) + 1];
      if (next) { e.preventDefault(); placeCaret(next, 0); }
      return;
    }
    if (e.key === "Tab") e.preventDefault();
  });

  /** @param {KeyboardEvent} e @param {HTMLElement} cell @returns {void} Tab, Enter and arrows inside a table */
  function cellKey(e, cell) {
    const spot = find(blockIdOf(cell));
    if (!spot) return;
    const b = spot.block;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const cols = b.rows[0].length;
    const last = b.rows.length - 1;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) { if (c > 0) focusCell(b.id, r, c - 1); else if (r > 0) focusCell(b.id, r - 1, cols - 1); return; }
      if (c < cols - 1) focusCell(b.id, r, c + 1);
      else if (r < last) focusCell(b.id, r + 1, 0);
      else { b.rows.push(Array(cols).fill("")); render(); focusCell(b.id, r + 1, 0); changed(); }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (r < last) focusCell(b.id, r + 1, c);
      else { b.rows.push(Array(cols).fill("")); render(); focusCell(b.id, r + 1, c); changed(); }
      return;
    }
    const areas = textAreas();
    if (e.key === "ArrowUp" && caretOnFirstLine(cell)) {
      e.preventDefault();
      if (r > 0) focusCell(b.id, r - 1, c);
      else { const before = areas[areas.indexOf(root.querySelector(`[data-bid="${b.id}"] .tbl-cell`)) - 1]; if (before) placeCaret(before, "end"); }
      return;
    }
    if (e.key === "ArrowDown" && caretOnLastLine(cell)) {
      e.preventDefault();
      if (r < last) focusCell(b.id, r + 1, c);
      else { const cells = root.querySelectorAll(`[data-bid="${b.id}"] .tbl-cell`); const after = areas[areas.indexOf(cells[cells.length - 1]) + 1]; if (after) placeCaret(after, 0); }
    }
  }

  /** @param {KeyboardEvent} e @returns {void} Enter picks the top page, arrows move, Escape cancels */
  function gallerySearchKey(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const spot = find(blockIdOf(input));
    if (!spot) return;
    const list = input.closest(".gal").querySelector(".gal-list");
    const items = [...list.querySelectorAll("[data-gal]")];
    const on = items.findIndex((x) => x.classList.contains("on"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      const next = (on + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((x, i) => x.classList.toggle("on", i === next));
      items[next].scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); if (items[Math.max(0, on)]) pickGallery(spot.block, items[Math.max(0, on)].dataset.gal); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      if (spot.block.pageId) { spot.block.picking = false; render(); }
      else { spot.list.splice(spot.index, 1); render(); changed(); }
    }
  }

  /** @param {Block} b @param {string} pageId @returns {void} */
  function pickGallery(b, pageId) {
    b.pageId = pageId;
    b.label = options.titleOf(pageId);
    b.picking = false;
    render();
    changed();
  }

  /** @param {Block} b @param {string} action @returns {void} adds or removes a table row or column at the cursor */
  function editTable(b, action) {
    const cols = b.rows[0].length;
    const at = b.at || { r: b.rows.length - 1, c: cols - 1 };
    let { r, c } = at;
    if (action === "row-add") { b.rows.splice(r + 1, 0, Array(cols).fill("")); r += 1; }
    if (action === "col-add") { b.rows.forEach((row) => row.splice(c + 1, 0, "")); (b.align ||= []).splice(c + 1, 0, ""); c += 1; }
    if (action === "row-del") {
      if (b.rows.length === 1) return;
      b.rows.splice(r, 1);
      r = Math.min(r, b.rows.length - 1);
    }
    if (action === "col-del") {
      if (cols === 1) return;
      b.rows.forEach((row) => row.splice(c, 1));
      b.align?.splice(c, 1);
      c = Math.min(c, cols - 2);
    }
    b.at = { r, c };
    render();
    focusCell(b.id, r, c);
    changed();
  }

  root.addEventListener("focusin", (e) => {
    const cell = e.target.closest?.(".tbl-cell");
    const b = cell && find(blockIdOf(cell))?.block;
    if (b) b.at = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
  });

  /** @param {{list:Block[],index:number}} spot @param {Block} b @param {number|"end"} at @returns {void} */
  function addAfter(spot, b, at = 0) {
    spot.list.splice(spot.index + 1, 0, b);
    render(b.id, at);
    changed();
  }

  root.addEventListener("paste", (e) => {
    if (e.target.closest?.(".tbl-cell")) {
      e.preventDefault();
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " "));
      return;
    }
    const textEl = e.target.closest(".blk-text");
    if (!textEl || [...e.clipboardData.files].length) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const spot = find(blockIdOf(textEl));
    if (!spot || spot.block.type === "code" || !text.includes("\n")) { document.execCommand("insertText", false, text); return; }
    const pasted = parseMarkdown(text);
    if (!pasted.length) return;
    const empty = spot.block.type === "p" && !textEl.textContent.trim();
    spot.list.splice(empty ? spot.index : spot.index + 1, empty ? 1 : 0, ...pasted);
    render(pasted.at(-1).id, "end");
    changed();
  });

  /* --- clicks: buttons, links, the empty space under the page --- */

  root.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const action = t.closest("[data-ed]")?.dataset.ed;
    const id = blockIdOf(t);
    const spot = id && find(id);
    if (action === "check" && spot) {
      spot.block.checked = t.checked;
      t.nextElementSibling?.classList.toggle("done", t.checked);
      changed();
      return;
    }
    if (["row-add", "col-add", "row-del", "col-del"].includes(action) && spot) { editTable(spot.block, action); return; }
    if (action === "gal-pick" && spot) {
      spot.block.picking = true;
      render();
      root.querySelector(`[data-bid="${spot.block.id}"] .gal-search`)?.focus();
      return;
    }
    const choice = t.closest("[data-gal]");
    if (choice && spot) { pickGallery(spot.block, choice.dataset.gal); return; }
    const card = t.closest(".blk-gallery .card[data-id]");
    if (card && !t.closest("[data-action]")) { location.hash = `#/p/${card.dataset.id}`; return; }
    if (action === "fold" && spot) { spot.block.open = !spot.block.open; render(spot.block.open ? spot.block.children?.[0]?.id : spot.block.id, spot.block.open ? 0 : "end"); return; }
    if (action === "icon" && spot) {
      options.pickEmoji(t.closest("[data-ed]"), (emoji) => { Object.assign(spot.block, { icon: emoji, kind: emoji, explicitColor: true }); render(); changed(); });
      return;
    }
    if (action === "add" && spot) {
      const fresh = blk({ type: "p", text: "/" });
      spot.list.splice(spot.index + 1, 0, fresh);
      render(fresh.id, "end");
      const area = root.querySelector(`[data-bid="${fresh.id}"] .blk-text`);
      if (area) openMenu(area, 0);
      return;
    }
    if (action === "grip" && spot) {
      openMenu(t.closest("[data-ed]"), 0, "turn", spot.block);
      blockMenuExtras(spot);
      return;
    }
    const link = t.closest("a[href]");
    if (link && !link.classList.contains("blk-page") && link.closest(".blk-text")) {
      e.preventDefault();
      const href = link.getAttribute("href");
      if (href.startsWith("#")) location.hash = href;
      else window.open(href, "_blank", "noopener");
    }
  });

  /** @param {{block:Block,list:Block[],index:number}} spot @returns {void} adds colour, duplicate and delete under "Turn into" */
  function blockMenuExtras(spot) {
    if (!menu) return;
    const extra = document.createElement("div");
    extra.className = "slash-extra";
    extra.innerHTML = `<p class="slash-head">Block</p><button type="button" data-extra="dup"><span class="slash-glyph">⧉</span><span><strong>Duplicate</strong></span></button>
      <button type="button" data-extra="del" class="danger"><span class="slash-glyph">🗑</span><span><strong>Delete</strong></span></button>
      ${spot.block.type === "callout" ? `<p class="slash-head">Colour</p><div class="slash-colors">${CALLOUT_COLORS.map((c) => `<button type="button" class="callout-${c}" data-color="${c}" aria-label="${c}" title="${c}"></button>`).join("")}</div>` : ""}`;
    menu.el.prepend(extra);
    placeMenu();
  }

  /** @param {Block} b @returns {Block} deep copy with fresh ids */
  const clone = (b) => ({ ...b, id: `b${nextId++}`, children: b.children?.map(clone), rows: b.rows?.map((r) => [...r]), align: b.align && [...b.align] });

  document.addEventListener("pointerdown", onMenuPointer, true);
  /** @param {PointerEvent} e @returns {void} */
  function onMenuPointer(e) {
    if (!menu) return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (!menu.el.contains(t)) { if (!t.closest("[data-ed=grip], [data-ed=add]")) closeMenu(); return; }
    e.preventDefault();
    const cmd = t.closest("[data-cmd]")?.dataset.cmd;
    const color = t.closest("[data-color]")?.dataset.color;
    const extra = t.closest("[data-extra]")?.dataset.extra;
    const b = menu.block;
    if (cmd) return chooseCommand(cmd);
    const spot = b && find(b.id);
    if (!spot) return;
    if (color) { Object.assign(b, { color, explicitColor: true }); closeMenu(); render(); changed(); }
    if (extra === "dup") { const copy = clone(b); spot.list.splice(spot.index + 1, 0, copy); closeMenu(); render(); changed(); }
    if (extra === "del") { spot.list.splice(spot.index, 1); closeMenu(); render(); changed(); }
  }

  tail.addEventListener("click", () => {
    const last = blocks.at(-1);
    if (last && last.type === "p" && !(last.text || "").trim()) { focusBlock(last.id, 0); return; }
    const fresh = blk({ type: "p" });
    blocks.push(fresh);
    render(fresh.id);
  });

  /* --- drag a block by its ⋮⋮ grip --- */

  root.addEventListener("dragstart", (e) => {
    const grip = e.target.closest?.("[data-ed=grip]");
    if (!grip) { e.preventDefault(); return; }
    dragId = blockIdOf(grip);
    const el = grip.closest(".blk");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
    e.dataTransfer.setDragImage(el, 20, 20);
    requestAnimationFrame(() => el.classList.add("dragging"));
  });

  /** @param {DragEvent} e @returns {{el:HTMLElement,after:boolean}|null} */
  function dropTarget(e) {
    const el = e.target.closest?.(".blk");
    if (!el || !dragId) return null;
    const dragged = find(dragId)?.block;
    if (!dragged || el.dataset.bid === dragId || isInside(dragged, el.dataset.bid)) return null;
    const r = el.getBoundingClientRect();
    return { el, after: e.clientY > r.top + Math.min(r.height / 2, 24) && !(CONTAINERS.has(find(el.dataset.bid).block.type) && e.clientY < r.bottom - 12 && e.clientY > r.top + 24) };
  }

  /** @returns {void} */
  const clearDrop = () => root.querySelectorAll(".drop-before, .drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));

  root.addEventListener("dragover", (e) => {
    const hit = dropTarget(e);
    clearDrop();
    if (!hit) return;
    e.preventDefault();
    hit.el.classList.add(hit.after ? "drop-after" : "drop-before");
  });

  root.addEventListener("drop", (e) => {
    const hit = dropTarget(e);
    clearDrop();
    if (!hit) return;
    e.preventDefault();
    const from = find(dragId);
    from.list.splice(from.index, 1);
    const to = find(hit.el.dataset.bid);
    to.list.splice(to.index + (hit.after ? 1 : 0), 0, from.block);
    dragId = null;
    render();
    changed();
  });

  root.addEventListener("dragend", () => { dragId = null; clearDrop(); root.querySelectorAll(".dragging").forEach((x) => x.classList.remove("dragging")); });

  render();
  return {
    destroy() { closeMenu(); document.removeEventListener("pointerdown", onMenuPointer, true); },
  };
}
