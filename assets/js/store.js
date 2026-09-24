// Loads config + news data and keeps everything the views need in one place.
// Personal data (evidence bank, quiz progress, theme) lives in this browser only.
import { normaliseText } from './lib/keywords.js';

export const S = {
  ready: false,
  error: null,
  showImages: true,
  spec: null,
  formats: {},
  questions: [],
  facts: [],
  feeds: [],
  feedsById: {},
  index: null,
  latest: [],
  archive: [],
  archiveState: 'idle', // idle | loading | done | error
  compById: {},
  topicById: {},
  tagById: {},
  tagsByTopic: {},
  topicsByComp: {},
  itemById: new Map(),
  now: Date.now(),
};

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw Object.assign(new Error(`${url}: HTTP ${res.status}`), { status: res.status });
  return res.json();
}

export async function loadAll() {
  const [spec, q, facts, feeds] = await Promise.all([
    getJson('config/spec.json'),
    getJson('config/questions.json'),
    getJson('config/facts.json'),
    getJson('config/feeds.json'),
  ]);
  S.spec = spec;
  S.formats = q.formats || {};
  S.questions = q.questions || [];
  S.facts = facts.facts || [];
  S.feeds = feeds.feeds || [];
  S.feedsById = Object.fromEntries(S.feeds.map((f) => [f.id, f]));
  S.showImages = feeds.images !== false;
  for (const c of spec.components) { S.compById[c.id] = c; S.topicsByComp[c.id] = []; }
  for (const t of spec.topics) { S.topicById[t.id] = t; S.topicsByComp[t.component]?.push(t); S.tagsByTopic[t.id] = []; }
  for (const t of spec.tags) {
    const topic = S.topicById[t.topic];
    S.tagById[t.id] = { ...t, component: topic?.component };
    S.tagsByTopic[t.topic]?.push(S.tagById[t.id]);
  }

  try {
    const [index, latest] = await Promise.all([getJson('data/index.json'), getJson('data/latest.json')]);
    S.index = index;
    S.now = Date.now();
    S.latest = latest.items.map(prepare);
    for (const i of S.latest) S.itemById.set(i.id, i);
  } catch (e) {
    S.error = e;
    S.index = null;
    S.latest = [];
  }
  S.ready = true;
}

/** Lazily load every archive month (for "All time" and "include archive"). */
export async function loadArchive() {
  if (S.archiveState === 'done' || S.archiveState === 'loading' || !S.index) return;
  S.archiveState = 'loading';
  try {
    const months = S.index.months || [];
    const files = await Promise.all(months.map((m) => getJson(`data/archive/${m.month}.json`).catch(() => ({ items: [] }))));
    const extra = [];
    for (const f of files) {
      for (const raw of f.items || []) {
        if (S.itemById.has(raw.id)) continue;
        const it = prepare(raw);
        S.itemById.set(it.id, it);
        extra.push(it);
      }
    }
    S.archive = extra;
    S.archiveState = 'done';
  } catch {
    S.archiveState = 'error';
  }
}

export function allItems(includeArchive) {
  return includeArchive && S.archiveState === 'done' ? S.latest.concat(S.archive) : S.latest;
}

const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

function prepare(raw) {
  const it = { ...raw, tags: raw.tags || [], also: raw.also || [] };
  it.t = Date.parse(it.date) || 0;
  it.img = S.showImages ? httpsOnly(raw.img) : null;
  it.img0 = it.img ? httpsOnly(raw.img0) : null;
  const primary = it.tags.map((id) => S.tagById[id]).find(Boolean);
  it.comp = primary?.component || null;
  const feed = S.feedsById[it.source];
  it.srcName = feed?.name || it.source;
  it.srcSection = feed?.section || '';
  it.kind = feed?.kind || 'news';
  it._text = normaliseText([it.title, it.summary, it.ai?.summary].filter(Boolean).join(' . '));
  it._search = (it._text + ' ' + it.srcName + ' ' + it.tags.map((t) => S.tagById[t]?.name || '').join(' ')).toLowerCase();
  return it;
}

/** Ranking for the "Top" sort: relevance × freshness × source weight × coverage. */
export function rank(it, now = S.now) {
  if (!it.tags.length) return 0;
  const ageH = Math.max(0, (now - it.t) / 3600000);
  const fresh = Math.pow(0.5, ageH / 36);
  const weight = S.feedsById[it.source]?.weight || 1;
  const coverage = 1 + 0.2 * Math.min(it.also.length, 4);
  const rel = Math.min(it.score || 0, 15) + (it.ai ? 1 : 0);
  return rel * fresh * weight * coverage;
}

export const compOf = (tagId) => S.tagById[tagId]?.component || null;

// ---------- Local storage (this browser only) ----------
const KEYS = { bank: 'cip.v1.bank', quiz: 'cip.v1.quiz', theme: 'cip.v1.theme' };
const memory = {};
let storageOk = true;

function read(key, dflt) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : memory[key] ?? dflt;
  } catch {
    storageOk = false;
    return memory[key] ?? dflt;
  }
}
function write(key, val) {
  memory[key] = val;
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    storageOk = false;
    return false;
  }
}
export const storageWorks = () => storageOk;

export const bank = {
  _cache: null,
  data() {
    if (!this._cache) this._cache = read(KEYS.bank, { items: {} });
    if (!this._cache.items) this._cache.items = {};
    return this._cache;
  },
  list() {
    return Object.values(this.data().items).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  },
  has(id) { return Boolean(this.data().items[id]); },
  count() { return Object.keys(this.data().items).length; },
  add(it) {
    const d = this.data();
    d.items[it.id] = {
      id: it.id, title: it.title, url: it.url, source: it.source, srcName: it.srcName, date: it.date,
      summary: it.summary || '', aiSummary: it.ai?.summary || '', tags: it.tags.slice(), note: d.items[it.id]?.note || '',
      savedAt: new Date().toISOString(),
    };
    return write(KEYS.bank, d);
  },
  remove(id) {
    const d = this.data();
    delete d.items[id];
    return write(KEYS.bank, d);
  },
  setNote(id, note) {
    const d = this.data();
    if (d.items[id]) { d.items[id].note = note; write(KEYS.bank, d); }
  },
  get(id) { return this.data().items[id] || null; },
  replaceAll(items) {
    const d = { items: {} };
    for (const it of items) if (it && it.id && it.title) d.items[it.id] = it;
    this._cache = d;
    return write(KEYS.bank, d);
  },
};

export const quizStore = {
  get() { return read(KEYS.quiz, { facts: {}, best: {} }); },
  save(v) { write(KEYS.quiz, v); },
};

export const themeStore = {
  get() { try { return localStorage.getItem(KEYS.theme); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEYS.theme, v); } catch { /* ignore */ } },
};
