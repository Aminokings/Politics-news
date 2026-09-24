// Links stories to exam questions. A story is relevant to a question when it shares a
// spec tag; it supports a particular argument ("strand") when its text also matches that
// strand's keywords. AI notes (if enabled in the pipeline) can add extra suggested angles.
import { firstHit, normaliseText } from './lib/keywords.js';
import { S } from './store.js';

const cache = new Map();

function strandTags(q, strand) {
  return strand.tags?.length ? strand.tags : q.tags;
}

/** All the ways one story could be used, best first. */
export function usesForItem(it) {
  if (cache.has(it.id)) return cache.get(it.id);
  const out = [];
  if (it.tags.length) {
    for (const q of S.questions) {
      if (!q.tags.some((t) => it.tags.includes(t))) continue;
      q.strands.forEach((st, idx) => {
        if (!strandTags(q, st).some((t) => it.tags.includes(t))) return;
        const hit = firstHit(st.match, it._text);
        if (hit) out.push({ q, strand: st, idx, side: st.side, hit, ai: false });
      });
    }
    for (const a of it.ai?.angles || []) {
      const q = S.questions.find((x) => x.id === a.q);
      if (q) out.push({ q, strand: null, idx: -1, side: a.side, hit: null, ai: true, point: a.point });
    }
  }
  const title = normaliseText(it.title).toLowerCase();
  const score = (u) => {
    let s = 0;
    it.tags.forEach((t, i) => { if (u.q.tags.includes(t)) s += Math.max(1, 3 - i * 0.5); });
    if (u.q.tags[0] === it.tags[0]) s += 1;
    if (u.hit && title.includes(u.hit.toLowerCase())) s += 1;
    if (u.ai) s += 3;
    if (u.q.type === 'evaluate') s += 0.5;
    return s;
  };
  for (const u of out) u.score = score(u);
  out.sort((a, b) => b.score - a.score);
  cache.set(it.id, out);
  return out;
}

/** Group stories under each strand of a question. */
export function evidenceForQuestion(q, items) {
  const byStrand = q.strands.map(() => []);
  const ai = { a: [], b: [] };
  const other = [];
  for (const it of items) {
    if (!it.tags.some((t) => q.tags.includes(t))) continue;
    let placed = false;
    q.strands.forEach((st, idx) => {
      if (!strandTags(q, st).some((t) => it.tags.includes(t))) return;
      const hit = firstHit(st.match, it._text);
      if (hit) { byStrand[idx].push({ it, hit }); placed = true; }
    });
    for (const a of it.ai?.angles || []) {
      if (a.q === q.id && (a.side === 'a' || a.side === 'b')) { ai[a.side].push({ it, point: a.point }); placed = true; }
    }
    if (!placed) other.push(it);
  }
  const newest = (x, y) => (y.it || y).t - (x.it || x).t;
  byStrand.forEach((list) => list.sort(newest));
  ai.a.sort(newest); ai.b.sort(newest);
  other.sort((x, y) => y.t - x.t);
  const matchedIds = new Set([...byStrand.flat().map((x) => x.it.id), ...ai.a.map((x) => x.it.id), ...ai.b.map((x) => x.it.id)]);
  const matched = matchedIds.size;
  const total = matched + other.length;
  return { byStrand, ai, other, total, matched };
}

export function clearMatchCache() { cache.clear(); }
