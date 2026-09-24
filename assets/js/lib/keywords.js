// Shared keyword-rule engine. Used by the news pipeline (Node) AND the website (browser),
// so the same rules in config/spec.json and config/questions.json behave identically.
//
// Keyword syntax (see config/spec.json "_help"):
//   "select committee"   whole words, any case (spaces match any whitespace)
//   "rebel*"             word + any ending (rebel, rebels, rebellion …)
//   "cs:Greens"          case-sensitive
//   "re:vote[sd]? at 16" regular expression, any case
//   "rcs:\\bReform MPs"  regular expression, case-sensitive

const RE_SPECIAL = /[.*+?^${}()|[\]\\]/g;

export function escapeRe(s) {
  return String(s).replace(RE_SPECIAL, '\\$&');
}

/** Normalise quotes, dashes and whitespace so keywords match reliably. */
export function normaliseText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const cache = new Map();

/** Compile one keyword string into a RegExp (cached). Returns null for invalid patterns. */
export function compileKeyword(kw) {
  if (cache.has(kw)) return cache.get(kw);
  let src = String(kw);
  let flags = 'i';
  let raw = false;
  if (src.startsWith('rcs:')) { raw = true; flags = ''; src = src.slice(4); }
  else if (src.startsWith('re:')) { raw = true; src = src.slice(3); }
  else if (src.startsWith('cs:')) { flags = ''; src = src.slice(3); }

  let pattern;
  if (raw) {
    pattern = src;
  } else {
    let prefix = false;
    if (src.endsWith('*')) { prefix = true; src = src.slice(0, -1); }
    const norm = normaliseText(src);
    const body = norm.split(' ').map(escapeRe).join('\\s+');
    const start = /^\w/.test(norm) ? '\\b' : '';
    const end = prefix ? "[\\w'-]*" : (/\w$/.test(norm) ? '\\b' : '');
    pattern = start + body + end;
  }
  let re = null;
  try { re = new RegExp(pattern, flags); } catch (e) { re = null; }
  cache.set(kw, re);
  return re;
}

/** {"3": [...], "2": [...], "1": [...]} → [{kw, w, re, reg}] sorted strongest first */
export function compileRuleSet(weighted) {
  const out = [];
  if (!weighted) return out;
  const add = (kw, w) => {
    const re = compileKeyword(kw);
    if (re) out.push({ kw, w, re, reg: new RegExp(re.source, re.flags + 'g') });
  };
  if (Array.isArray(weighted)) {
    for (const kw of weighted) add(kw, 1);
  } else {
    for (const [w, list] of Object.entries(weighted)) for (const kw of list || []) add(kw, Number(w) || 1);
  }
  out.sort((a, b) => b.w - a.w);
  return out;
}

const overlaps = (spans, s, e) => spans.some(([a, b]) => s < b && e > a);

/**
 * Score text against compiled rules. Each rule counts once; a match in the title
 * counts 1.5x. Overlapping matches only count once (so "Kemi Badenoch" and "Badenoch"
 * don't double-score), strongest rule first.
 * Returns { score, hits: [{text, w}] } with hits sorted strongest first.
 */
export function scoreRules(rules, title, body) {
  let score = 0;
  const hits = [];
  const spans = { t: [], b: [] };
  for (const r of rules) {
    let found = null;
    for (const [key, text] of [['t', title], ['b', body]]) {
      if (!text) continue;
      for (const m of text.matchAll(r.reg)) {
        if (!m[0]) continue;
        const s = m.index;
        const e = s + m[0].length;
        if (!overlaps(spans[key], s, e)) { found = { key, s, e, text: m[0] }; break; }
      }
      if (found) break;
    }
    if (!found) continue;
    spans[found.key].push([found.s, found.e]);
    const w = r.w * (found.key === 't' ? 1.5 : 1);
    score += w;
    hits.push({ text: found.text, w });
  }
  hits.sort((a, b) => b.w - a.w);
  return { score, hits };
}

/** True if any of the (uncompiled) keywords match the text. Returns the first matched text or null. */
export function firstHit(keywords, text) {
  for (const kw of keywords || []) {
    const re = compileKeyword(kw);
    if (!re) continue;
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

/** Unique (case-insensitive) list of hit texts, strongest first. */
export function hitLabels(hits, max = 4) {
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const k = h.text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h.text);
    if (out.length >= max) break;
  }
  return out;
}
