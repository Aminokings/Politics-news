#!/usr/bin/env node
// Fetches every feed in config/feeds.json, tags each story with Edexcel spec points,
// merges it into the rolling archive and writes the JSON files the website reads:
//
//   <out>/index.json            metadata, topic counts, feed health
//   <out>/latest.json           stories from the last LATEST_DAYS days
//   <out>/archive/YYYY-MM.json  every story, one file per month
//
// Usage:
//   node scripts/update-news.mjs                      # read+write ./data
//   node scripts/update-news.mjs --prev .prev --out .out --require-prev   (GitHub Actions)
//   node scripts/update-news.mjs --fixtures scripts/test/fixtures        (offline demo data)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed } from './lib/parse.mjs';
import { fetchFeed, mapLimit } from './lib/fetch.mjs';
import { buildTagger, relevance } from './lib/tagger.mjs';
import { titleTokens, similarity, SAME_STORY, WINDOW_MS } from './lib/cluster.mjs';
import { stripHtml, firstParagraph, cleanSummary, cleanTitle, canonicalUrl, shortId, parseDate } from './lib/text.mjs';
import { enrichWithAI, DEFAULT_MODEL } from './lib/ai.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LATEST_DAYS = 30;
const MAX_MONTHS = 24;
const MAX_AGE_NEW_DAYS = 45; // ignore feed items older than this the first time we see them
const DAY = 86400000;

// ---------- CLI ----------
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);
const prevDir = path.resolve(opt('prev', path.join(ROOT, 'data')));
const outDir = path.resolve(opt('out', path.join(ROOT, 'data')));
const fixturesDir = opt('fixtures', null);
const only = opt('only', null)?.split(',');
const now = opt('now', null) ? new Date(opt('now')) : new Date();
const verbose = flag('verbose');
const log = (...a) => console.log(...a);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const spec = readJson(path.join(ROOT, 'config/spec.json'));
const feedsCfg = readJson(path.join(ROOT, 'config/feeds.json')).feeds.filter((f) => f.enabled !== false && (!only || only.includes(f.id)));
const questions = readJson(path.join(ROOT, 'config/questions.json')).questions;
const feedsById = Object.fromEntries(feedsCfg.map((f) => [f.id, f]));
const tagger = buildTagger(spec);
const knownTags = new Set(spec.tags.map((t) => t.id));

// ---------- Load previous archive ----------
function loadPrevious() {
  const indexPath = path.join(prevDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    if (flag('require-prev')) throw new Error(`--require-prev given but ${indexPath} is missing — refusing to start a fresh archive.`);
    log(`No previous archive in ${prevDir} — starting fresh.`);
    return { index: null, items: [] };
  }
  const index = readJson(indexPath);
  const items = [];
  const archDir = path.join(prevDir, 'archive');
  for (const m of index.months || []) {
    const p = path.join(archDir, `${m.month}.json`);
    if (!fs.existsSync(p)) throw new Error(`Archive file missing: ${p}`);
    const data = readJson(p);
    items.push(...data.items);
  }
  log(`Loaded ${items.length} stories from ${index.months?.length || 0} archive months.`);
  return { index, items };
}

// ---------- Get raw items per feed ----------
async function getFeedItems(feed, prevState) {
  if (fixturesDir) {
    const p = path.join(path.resolve(fixturesDir), `${feed.id}.json`);
    if (!fs.existsSync(p)) return { ok: false, status: 0, error: 'no fixture', items: [] };
    const fx = readJson(p);
    const items = fx.items.map((it) => ({
      title: it.title, link: it.link, guid: it.link, date: it.date,
      description: it.description || '', content: '', categories: it.categories || [], stage: it.stage || '',
    }));
    return { ok: true, status: 200, items };
  }
  try {
    const res = await fetchFeed(feed, prevState || {});
    if (res.notModified) return { ok: true, status: 304, items: [], etag: res.etag, lastModified: res.lastModified };
    const parsed = parseFeed(res.body);
    return { ok: true, status: res.status, items: parsed.items, etag: res.etag, lastModified: res.lastModified, format: parsed.format };
  } catch (e) {
    return { ok: false, status: e.status || 0, error: e.message, items: [] };
  }
}

// ---------- Normalise one raw item into a story ----------
function toStory(raw, feed) {
  let link = raw.link || (/^https?:/.test(raw.guid) ? raw.guid : '');
  if (!link) return null;
  for (const [from, to] of feed.linkRewrite || []) link = link.split(from).join(to);
  const url = canonicalUrl(link);
  if ((feed.excludeLinks || []).some((p) => url.includes(p))) return null;

  const cats = raw.categories || [];
  if (feed.onlyCategories && !cats.some((c) => feed.onlyCategories.some((oc) => c.toLowerCase().includes(oc.toLowerCase())))) return null;

  let title = cleanTitle(raw.title);
  if (!title) return null;
  if ((feed.excludeTitles || []).some((p) => new RegExp(p, 'i').test(title))) return null;

  let summary;
  if (feed.descriptionMode === 'firstParagraph') {
    summary = firstParagraph(raw.description) || firstParagraph(raw.content) || stripHtml(raw.description);
  } else {
    summary = stripHtml(raw.description);
    if (summary.replace(/\W/g, '').length < 40 && raw.content) summary = stripHtml(raw.content);
  }
  summary = cleanSummary(summary, 320);
  if (summary && summary.toLowerCase() === title.toLowerCase()) summary = '';

  let id = shortId(url);
  if (feed.billStages && raw.stage) {
    // One story per stage, e.g. "Representation of the People Bill: Committee stage"
    title = `${title}: ${raw.stage}`;
    id = shortId(`${url}|${raw.stage}`);
  }

  let date = parseDate(raw.date);
  if (!date || date.getTime() > now.getTime() + 3600000) date = now;

  return {
    id,
    title,
    url,
    source: feed.id,
    date: date.toISOString(),
    summary,
    categories: cats.slice(0, 8),
  };
}

// ---------- Main ----------
async function main() {
  const t0 = Date.now();
  log(`Case in Point news update — ${now.toISOString()}${fixturesDir ? ' (fixtures mode)' : ''}`);
  const prev = loadPrevious();
  const prevFeedState = Object.fromEntries((prev.index?.feeds || []).map((f) => [f.id, f]));

  const all = prev.items.filter((i) => i && i.id && i.url);
  const knownUrls = new Set();
  const knownIds = new Set();
  for (const i of all) {
    knownIds.add(i.id);
    knownUrls.add(i.url);
    for (const a of i.also || []) knownUrls.add(a.url);
  }

  // Fetch all feeds (6 at a time)
  const results = await mapLimit(feedsCfg, 6, async (feed) => ({ feed, res: await getFeedItems(feed, prevFeedState[feed.id]) }));

  const feedStatus = [];
  const candidates = [];
  const cutoff = now.getTime() - MAX_AGE_NEW_DAYS * DAY;
  for (const { feed, res } of results) {
    const st = prevFeedState[feed.id] || {};
    let fresh = 0;
    let kept = 0;
    if (res.ok) {
      for (const raw of res.items) {
        const story = toStory(raw, feed);
        if (!story) continue;
        // Bill-stage stories share a URL (one per stage), so match those on id only.
        if (knownIds.has(story.id) || (!feed.billStages && knownUrls.has(story.url))) continue;
        if (new Date(story.date).getTime() < cutoff) continue;
        fresh++;
        const t = tagger(story, feed);
        const politicsOnly = feed.politicsOnly === true;
        if (!t.tags.length && !politicsOnly) {
          if (verbose) log(`  – skip (no spec match) [${feed.id}] ${story.title}`);
          continue;
        }
        kept++;
        candidates.push({
          ...story,
          seen: now.toISOString(),
          tags: t.tags.map((x) => x.id),
          why: Object.fromEntries(t.tags.filter((x) => x.hits.length).map((x) => [x.id, x.hits])),
          score: relevance(t.tags),
          region: t.region,
          _weight: feed.weight || 1,
          _noCluster: Boolean(feed.billStages),
        });
        if (verbose) log(`  + [${feed.id}] ${story.title}  →  ${t.tags.map((x) => `${x.id}(${x.score})`).join(', ') || '(untagged)'}`);
      }
    }
    feedStatus.push({
      id: feed.id,
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : res.error,
      items: res.items.length,
      fresh,
      added: kept,
      lastOk: res.ok ? now.toISOString() : st.lastOk || null,
      etag: res.ok ? res.etag ?? st.etag ?? null : st.etag ?? null,
      lastModified: res.ok ? res.lastModified ?? st.lastModified ?? null : st.lastModified ?? null,
    });
    log(`${res.ok ? '✓' : '✗'} ${feed.id.padEnd(22)} ${res.ok ? `${String(res.items.length).padStart(3)} items, ${String(fresh).padStart(3)} new, ${String(kept).padStart(3)} kept` : `FAILED: ${res.error}`}`);
  }

  // Cluster: fold near-duplicate headlines (from different outlets, within 48h) into one story.
  candidates.sort((a, b) => a.date.localeCompare(b.date) || b._weight - a._weight);
  const recent = all
    .filter((i) => now.getTime() - Date.parse(i.date) < 4 * DAY)
    .map((i) => ({ item: i, tokens: titleTokens(i.title), t: Date.parse(i.date) }));
  const added = [];
  let merged = 0;
  for (const c of candidates) {
    if (c._noCluster) {
      if (knownIds.has(c.id)) continue;
      knownIds.add(c.id);
      const { _weight, _noCluster, categories, ...story } = c;
      added.push(story);
      all.push(story);
      continue;
    }
    if (knownUrls.has(c.url)) continue;
    const tokens = titleTokens(c.title);
    const t = Date.parse(c.date);
    let best = null;
    let bestSim = 0;
    for (const r of recent) {
      if (Math.abs(r.t - t) > WINDOW_MS || r.item.source === c.source) continue;
      const s = similarity(tokens, r.tokens);
      if (s > bestSim) { best = r; bestSim = s; }
    }
    knownUrls.add(c.url);
    if (best && bestSim >= SAME_STORY) {
      const rep = best.item;
      rep.also = rep.also || [];
      rep.also.push({ source: c.source, title: c.title, url: c.url, date: c.date });
      rep.tags = [...new Set([...(rep.tags || []), ...c.tags])].slice(0, 4);
      rep.why = { ...(c.why || {}), ...(rep.why || {}) };
      rep.score = Math.max(rep.score || 0, c.score);
      merged++;
      continue;
    }
    const { _weight, _noCluster, categories, ...story } = c;
    added.push(story);
    all.push(story);
    recent.push({ item: story, tokens, t });
  }
  log(`\n${added.length} new stories added, ${merged} merged into existing stories as extra sources.`);

  // Optional AI notes
  let aiStats = { attempted: 0, done: 0, failed: 0 };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && !flag('no-ai')) {
    const maxItems = Number(process.env.AI_MAX_PER_RUN || 8);
    const model = process.env.AI_MODEL || DEFAULT_MODEL;
    log(`AI notes: enriching up to ${maxItems} new stories with ${model}…`);
    aiStats = await enrichWithAI(added, { apiKey, model, maxItems, spec, questions, feedsById, now, log });
    log(`AI notes: ${aiStats.done} done, ${aiStats.failed} failed.`);
  }

  // Tidy: drop unknown tags (e.g. after editing spec.json), prune very old months
  for (const i of all) {
    i.tags = (i.tags || []).filter((t) => knownTags.has(t));
    if (i.why) for (const k of Object.keys(i.why)) if (!knownTags.has(k)) delete i.why[k];
    if (i.also && !i.also.length) delete i.also;
    if (i.why && !Object.keys(i.why).length) delete i.why;
  }
  const byMonth = new Map();
  for (const i of all) {
    const m = i.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(i);
  }
  const months = [...byMonth.keys()].sort().reverse().slice(0, MAX_MONTHS);
  const keptItems = months.flatMap((m) => byMonth.get(m));
  keptItems.sort((a, b) => b.date.localeCompare(a.date));

  // Write output
  fs.mkdirSync(path.join(outDir, 'archive'), { recursive: true });
  for (const f of fs.readdirSync(path.join(outDir, 'archive'))) {
    if (f.endsWith('.json') && !months.includes(f.replace('.json', ''))) fs.rmSync(path.join(outDir, 'archive', f));
  }
  for (const m of months) {
    const items = byMonth.get(m).sort((a, b) => b.date.localeCompare(a.date));
    fs.writeFileSync(path.join(outDir, 'archive', `${m}.json`), JSON.stringify({ month: m, count: items.length, items }));
  }
  const latestCut = now.getTime() - LATEST_DAYS * DAY;
  const latest = keptItems.filter((i) => Date.parse(i.date) >= latestCut);
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify({ generatedAt: now.toISOString(), days: LATEST_DAYS, count: latest.length, items: latest }));

  const tagCounts = {};
  for (const t of spec.tags) tagCounts[t.id] = { d7: 0, d30: 0, all: 0, last: null };
  for (const i of keptItems) {
    const age = now.getTime() - Date.parse(i.date);
    for (const t of i.tags) {
      const c = tagCounts[t];
      if (!c) continue;
      c.all++;
      if (age < 30 * DAY) c.d30++;
      if (age < 7 * DAY) c.d7++;
      if (!c.last || i.date > c.last) c.last = i.date;
    }
  }
  const index = {
    generatedAt: now.toISOString(),
    latestDays: LATEST_DAYS,
    counts: { latest: latest.length, total: keptItems.length, addedThisRun: added.length, mergedThisRun: merged },
    months: months.map((m) => ({ month: m, count: byMonth.get(m).length })),
    tagCounts,
    feeds: feedStatus,
    ai: { enabled: Boolean(apiKey), ...aiStats },
    runSeconds: Math.round((Date.now() - t0) / 100) / 10,
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1));
  const okFeeds = feedStatus.filter((f) => f.ok).length;
  log(`Wrote ${outDir}: ${latest.length} stories in latest.json, ${keptItems.length} in archive (${months.length} months). Feeds OK: ${okFeeds}/${feedStatus.length}.`);
  if (!fixturesDir && okFeeds === 0) {
    console.error('Every feed failed — exiting with an error so the site keeps its previous data.');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
