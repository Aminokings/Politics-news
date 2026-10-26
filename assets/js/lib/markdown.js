// A small Markdown renderer for essays (no dependencies, used by the website and the tests).
// Supports: paragraphs, # headings, - and 1. lists, > quotes, ---, *italic*, **bold**, `code`,
// [links](https://…), <https://…>, and footnotes: a reference[^1] plus a line "[^1]: The note".
// Text is HTML-escaped, so an essay can't break the page.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const SAFE_URL = /^(https?:\/\/|mailto:|#|\/|\.{0,2}\/)/i;

function link(url, text) {
  const raw = url.replace(/&amp;/g, '&');
  if (!SAFE_URL.test(raw)) return text;
  const external = /^https?:\/\//i.test(raw);
  return `<a href="${escapeHtml(raw)}"${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
}

function emphasis(s) {
  return s
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?!\s)([^_]+?)_(?![\w])/g, '$1<em>$2</em>');
}

function inline(text, ref) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  // Backslash escapes (\* \_ \[ …) stand for the character itself.
  let s = escapeHtml(text.replace(/\\([!-/:-@[-`{-~])/g, (_, c) => keep(escapeHtml(c))));
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${c}</code>`));
  s = s.replace(/\[\^([^\]\s]+)\]/g, (_, id) => keep(ref(id)));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => keep(link(u, emphasis(t))));
  s = s.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+(?:&amp;[^\s&]+)*)&gt;/g, (_, u) => keep(link(u, u)));
  s = emphasis(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * Markdown → { html, notes, words }.
 *   html   the body, with footnote references as numbered superscript links
 *   notes  [{ n, id, html }] in the order they're first referred to (render with notesHtml)
 *   words  words in the body text, not counting notes, headings or lists
 */
export function renderMarkdown(md, { idPrefix = 'fn' } = {}) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const defs = new Map();
  const body = [];
  // Pull out footnote definitions (a definition can continue on indented lines).
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);
    if (!m) { body.push(lines[i]); continue; }
    let text = m[2];
    while (i + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[i + 1])) text += ' ' + lines[++i].trim();
    defs.set(m[1], text);
  }

  const order = [];
  const ref = (id) => {
    if (!defs.has(id)) return `[^${escapeHtml(id)}]`;
    let n = order.indexOf(id) + 1;
    if (!n) n = order.push(id);
    const tip = escapeHtml(plain(inline(defs.get(id), () => '')));
    return `<sup class="fnref" id="${idPrefix}ref-${n}"><a href="#${idPrefix}-${n}" title="${tip}" aria-label="Note ${n}">${n}</a></sup>`;
  };

  const out = [];
  let words = 0;
  let para = [];
  let list = null; // { type: 'ul'|'ol', items: [] }
  let quote = [];
  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ');
    words += text.replace(/\[\^[^\]]+\]/g, '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    out.push(`<p>${inline(text, ref)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>${list.items.map((t) => `<li>${inline(t, ref)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(`<blockquote>${renderMarkdown(quote.join('\n'), { idPrefix }).html}</blockquote>`);
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const t = line.trim();
    if (!t) {
      flushPara();
      flushQuote();
      // a blank line inside a list only ends it if the next line isn't another item
      if (list && !/^\s*([-*+]|\d+[.)])\s+/.test(body[i + 1] || '')) flushList();
      continue;
    }
    let m;
    if ((m = t.match(/^(#{1,4})\s+(.*?)\s*#*$/))) {
      flushAll();
      const level = Math.min(4, Math.max(2, m[1].length)); // # and ## → h2: the page title is the h1
      out.push(`<h${level}>${inline(m[2], ref)}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushAll(); out.push('<hr>'); continue; }
    if ((m = t.match(/^>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      flushQuote();
      const type = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list && list.type !== type) flushList();
      list ||= { type, items: [] };
      list.items.push(m[2]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += ' ' + t; continue; }
    flushList();
    flushQuote();
    para.push(t);
  }
  flushAll();

  const notes = order.map((id, k) => ({ n: k + 1, id, html: inline(defs.get(id), () => '') }));
  return { html: out.join('\n'), notes, words };
}

/** The numbered notes list that goes with renderMarkdown's references. */
export function notesHtml(notes, { idPrefix = 'fn', heading = 'Notes' } = {}) {
  if (!notes.length) return '';
  return `<section class="essay__notes" aria-label="${escapeHtml(heading)}"><h2>${escapeHtml(heading)}</h2><ol>${notes
    .map((f) => `<li id="${idPrefix}-${f.n}">${f.html} <a class="fnback" href="#${idPrefix}ref-${f.n}" aria-label="Back to the text">↩</a></li>`)
    .join('')}</ol></section>`;
}
