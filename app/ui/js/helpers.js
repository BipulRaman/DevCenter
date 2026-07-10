// ---------- Helpers ----------
// Attach `event` to every `selector` match inside `root`, binding DIRECTLY to
// each element (re-run after every render). Do NOT rewrite this as a single
// delegated listener on `root`: delegated clicks on innerHTML-inserted rows can
// silently fail in WebView2 (see app-center.js / changes.js). The handler
// receives (element, event, index).
function on(root, selector, event, handler) {
  if (!root) return;
  root.querySelectorAll(selector).forEach((el, i) =>
    el.addEventListener(event, (e) => handler(el, e, i))
  );
}

// Debounce: coalesce rapid calls (e.g. search-box keystrokes) so `fn` runs once,
// `ms` after the last call, with the latest arguments.
function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function stat(label, value, color) {
  return `<div class="stat" style="--stat-color:${color}">
    <div class="stat-label"><span class="stat-dot" style="background:${color}"></span>${label}</div>
    <div class="stat-value">${value}</div>
  </div>`;
}
function empty(msg, icon) {
  return `<div class="empty-state"><div class="empty-ico">${icon || ICON.folder}</div><p>${escapeHtml(msg)}</p></div>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// A small, dependency-free "markdown-lite" renderer for PR comment bodies
// (headers, bold/italic, inline code, fenced code blocks, links, images,
// lists, blockquotes, rules). Input is HTML-escaped FIRST, so nothing it
// produces can introduce unescaped user HTML — only the whitelisted tags
// built below ever appear, and link/image URLs are restricted to http(s).
function mdInline(s) {
  return s
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt, url) => `<img class="prr-md-img" src="${url}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`)
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/\*([^*]+)\*|_([^_]+)_/g, (_, a, b) => `<em>${a || b}</em>`);
}

function normalizeCommentMarkup(raw) {
  const htmlPattern = /<!--[\s\S]*?-->|<\/?(?:a|blockquote|br|code|details|div|em|h[1-6]|hr|i|img|li|ol|p|pre|span|strong|summary|table|tbody|td|th|thead|tr|ul)\b[^>]*>/i;
  if (!htmlPattern.test(raw) || typeof DOMParser === "undefined") return raw;

  const doc = new DOMParser().parseFromString(raw, "text/html");
  const discarded = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT"]);
  const block = (value) => value.trim() ? `\n${value.trim()}\n` : "";
  const children = (node) => [...node.childNodes].map(render).join("");

  function render(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE || discarded.has(node.tagName)) return "";

    const content = children(node);
    switch (node.tagName) {
      case "A": {
        const href = node.getAttribute("href") || "";
        const label = content.trim() || href;
        return /^https?:\/\//i.test(href) ? `[${label}](${href})` : label;
      }
      case "IMG": {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        return /^https?:\/\//i.test(src) ? `![${alt}](${src})` : alt;
      }
      case "BR": return "\n";
      case "HR": return "\n---\n";
      case "STRONG":
      case "B": return `**${content}**`;
      case "EM":
      case "I": return `*${content}*`;
      case "CODE": return node.parentElement?.tagName === "PRE" ? content : `\`${content}\``;
      case "PRE": return `\n\`\`\`\n${node.textContent || ""}\n\`\`\`\n`;
      case "BLOCKQUOTE": return block(content.split("\n").map((line) => `> ${line}`).join("\n"));
      case "UL":
      case "OL": {
        const ordered = node.tagName === "OL";
        const items = [...node.children]
          .filter((item) => item.tagName === "LI")
          .map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${children(item).trim()}`);
        return block(items.join("\n"));
      }
      case "LI": return content;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6": return block(`#### ${content.trim()}`);
      case "P":
      case "DIV":
      case "DETAILS":
      case "SUMMARY":
      case "TABLE":
      case "THEAD":
      case "TBODY":
      case "TR": return block(content);
      case "TD":
      case "TH": return `${content.trim()} `;
      default: return content;
    }
  }

  return [...doc.body.childNodes].map(render).join("").replace(/\n{3,}/g, "\n\n").trim();
}

function mdLite(raw) {
  if (!raw) return "";
  const blocks = [];
  let s = escapeHtml(normalizeCommentMarkup(String(raw)))
    .replace(/\r\n/g, "\n")
    .replace(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre class="prr-md-pre"><code>${code.replace(/\n$/, "")}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });

  const out = [];
  let para = [];
  let list = null; // { tag, items }
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; }
  };
  for (const line of s.split("\n")) {
    if (!line.trim()) { flushPara(); flushList(); continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h4>${mdInline(m[2])}</h4>`); continue; }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); out.push("<hr>"); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      list.items.push(mdInline(m[1]));
      continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
      list.items.push(mdInline(m[1]));
      continue;
    }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${mdInline(m[1])}</blockquote>`); continue; }
    flushList();
    para.push(mdInline(line));
  }
  flushPara();
  flushList();
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}
