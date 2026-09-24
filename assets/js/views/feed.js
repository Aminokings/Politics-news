// News page: a newspaper-style front page, then every story as photo cards with filters and search.
import { S, allItems, loadArchive, rank, bank } from '../store.js';
import { esc, icon, timeAgo, plural, debounce, navPush, navReplace } from '../util.js';
import { storyCard, compClass, kindLabel, noDataNotice, shortQ, media, kicker, byline, markedTitle, numberToKnow, saveButton } from '../ui.js';
import { evidenceForQuestion } from '../match.js';

const DAY = 86400000;
const PAGE = 24;
const DEFAULTS = { c: '', t: '', src: '', when: '30', sort: 'top', q: '' };
const fmtDateline = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

let P = { ...DEFAULTS };
let shown = PAGE;
let root = null;

export function paramsFromHash(hash) {
  const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const sp = new URLSearchParams(qs);
  const p = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (sp.has(k)) p[k] = sp.get(k);
  if (p.t && S.tagById[p.t] && !p.c) p.c = S.tagById[p.t].component;
  if (p.t && !S.tagById[p.t]) p.t = '';
  if (p.c && !S.compById[p.c]) p.c = '';
  return p;
}

function hashFromParams(p) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v && v !== DEFAULTS[k]) sp.set(k, v);
  const s = sp.toString();
  return s ? `#/?${s}` : '#/';
}

function terms() {
  return P.q.toLowerCase().split(/\s+/).map((t) => t.replace(/^["']|["']$/g, '')).filter(Boolean);
}

const inComp = (it, c) => it.tags.some((t) => S.tagById[t]?.component === c);

function filtered() {
  const includeArchive = P.when === 'all';
  let list = allItems(includeArchive);
  if (P.when === '7') list = list.filter((i) => S.now - i.t < 7 * DAY);
  if (P.c) list = list.filter((i) => inComp(i, P.c));
  if (P.t) list = list.filter((i) => i.tags.includes(P.t));
  if (P.src) list = list.filter((i) => i.kind === P.src);
  const tm = terms();
  if (tm.length) list = list.filter((i) => tm.every((t) => i._search.includes(t)));
  if (P.sort === 'latest' || tm.length) list = list.slice().sort((a, b) => b.t - a.t);
  else list = list.slice().sort((a, b) => rank(b) - rank(a) || b.t - a.t);
  return list;
}

const noFilters = () => !P.c && !P.t && !P.src && !P.q && P.when === '30' && P.sort === 'top';

export function render(el, hash) {
  root = el;
  const next = paramsFromHash(hash);
  const sameFilters = JSON.stringify({ ...next, q: '' }) === JSON.stringify({ ...P, q: '' });
  P = next;
  if (!sameFilters) shown = PAGE;
  if (P.when === 'all' && S.archiveState === 'idle') {
    loadArchive().then(() => { if (root === el && document.body.contains(el)) renderParts(); });
  }
  if (!el.querySelector('#feedList')) {
    el.innerHTML = `<div id="feedFront"></div>
    <div id="feedHead"></div>
    <section class="filters" aria-label="Filter stories">
      <div class="search" role="search">
        ${icon('search')}
        <input class="input" id="q" type="search" placeholder="Search stories, e.g. 'select committee', 'Supreme Court', 'NATO'" autocomplete="off" aria-label="Search stories">
        <button class="clear" type="button" data-action="clear-search" aria-label="Clear search" hidden>${icon('x')}</button>
      </div>
      <div id="feedFilters"></div>
    </section>
    <div id="feedList"></div>`;
    const input = el.querySelector('#q');
    input.value = P.q;
    input.addEventListener('input', debounce(() => setParam('q', input.value.trim()), 220));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; setParam('q', ''); } });
  } else {
    const input = el.querySelector('#q');
    if (input && document.activeElement !== input) input.value = P.q;
  }
  renderParts();
}

let frontKey = '';

function renderParts() {
  if (!root) return;
  const front = root.querySelector('#feedFront');
  const head = root.querySelector('#feedHead');
  const filters = root.querySelector('#feedFilters');
  const listEl = root.querySelector('#feedList');
  const clearBtn = root.querySelector('.search .clear');
  if (clearBtn) clearBtn.hidden = !P.q;

  const isFront = noFilters() && S.latest.length > 0;
  // Only rebuild the front page when it appears or the data changes (so photos don't reload on "Show more").
  if (isFront) {
    const key = `${S.index?.generatedAt}|${S.latest.length}`;
    if (key !== frontKey || !front.firstElementChild) { front.innerHTML = frontHtml(); frontKey = key; }
  } else if (front.firstElementChild) {
    front.innerHTML = '';
    frontKey = '';
  }
  head.innerHTML = headerHtml(isFront);
  filters.innerHTML = filtersHtml();
  if (!S.latest.length) {
    listEl.innerHTML = noDataNotice();
    return;
  }
  const list = filtered();
  const tm = terms();
  const archiveNote = P.when === 'all' && S.archiveState === 'loading' ? ' · loading archive…' : '';
  const activeFilters = P.c || P.t || P.src || P.q || P.when !== '30';
  listEl.innerHTML = `
    <div class="resultline"><span>${list.length ? `Showing ${Math.min(shown, list.length)} of ${plural(list.length, 'story', 'stories')}` : 'No matching stories'}${archiveNote}</span>
      ${activeFilters ? `<button class="btn btn--ghost btn--sm" type="button" data-action="clear-filters">${icon('rotate')}Clear filters</button>` : ''}</div>
    ${list.length ? `<ul class="cards">${list.slice(0, shown).map((it) => storyCard(it, { terms: tm })).join('')}</ul>` : emptyResults()}
    ${list.length > shown ? `<div class="more"><button class="btn" type="button" data-action="more">Show more stories</button></div>` : ''}`;
}

function emptyResults() {
  const hint = P.when !== 'all' ? `<button class="btn btn--sm" type="button" data-action="set-param" data-key="when" data-value="all">${icon('archive')}Search the archive too</button>` : '';
  return `<div class="notice">${icon('info')}<div><b>Nothing matches yet.</b> Try a broader search, another topic, or a longer time range. ${hint}</div></div>`;
}

// ---------- Choosing stories for the front page ----------
function ranked(days = 3) {
  const recent = S.latest.filter((i) => i.tags.length && S.now - i.t < days * DAY);
  const pool = recent.length >= 12 ? recent : S.latest.filter((i) => i.tags.length);
  return pool.slice().sort((a, b) => rank(b) - rank(a) || b.t - a.t);
}

/** Highest-ranked story, preferring one with a photo if it's nearly as strong. */
function pickLead(list, used) {
  const open = list.filter((i) => !used.has(i.id));
  if (!open.length) return null;
  const it = open.slice(0, 6).find((i) => i.img) || open[0];
  used.add(it.id);
  return it;
}

/** n stories from different parts of the spec where possible, preferring ones with photos. */
function spread(list, n, used, avoid = []) {
  const out = [];
  const comps = new Set(avoid);
  const open = list.filter((i) => !used.has(i.id));
  for (const ok of [(i) => i.img && !comps.has(i.comp), (i) => !comps.has(i.comp), () => true]) {
    for (const it of open) {
      if (out.length >= n) break;
      if (used.has(it.id) || !ok(it)) continue;
      out.push(it);
      used.add(it.id);
      comps.add(it.comp);
    }
  }
  return out;
}

/** Up to n stories, at most `perComp` from any one part of the spec (fills up if there aren't enough). */
function varied(list, n, perComp) {
  const out = [];
  const count = {};
  for (const it of list) {
    if (out.length >= n) break;
    if ((count[it.comp] || 0) >= perComp) continue;
    count[it.comp] = (count[it.comp] || 0) + 1;
    out.push(it);
  }
  for (const it of list) { if (out.length >= n) break; if (!out.includes(it)) out.push(it); }
  return out.sort((a, b) => list.indexOf(a) - list.indexOf(b));
}

function practiceQuestion() {
  const scored = S.questions.filter((q) => q.type === 'evaluate').map((q) => ({ q, n: evidenceForQuestion(q, S.latest).matched }));
  scored.sort((a, b) => b.n - a.n);
  return scored.length ? scored[new Date().getDate() % Math.min(6, scored.length)] : null;
}

function topTopics(n = 6) {
  const tc = S.index?.tagCounts || {};
  return Object.entries(tc).filter(([id, v]) => v.d7 > 0 && S.tagById[id]).sort((a, b) => b[1].d7 - a[1].d7).slice(0, n).map(([id, v]) => ({ t: S.tagById[id], n: v.d7 }));
}

function stats() {
  const idx = S.index;
  if (!idx) return { updated: '', stories: '', sources: '' };
  return {
    updated: `Updated ${timeAgo(idx.generatedAt, Date.now())}`,
    stories: plural(idx.counts.latest, 'story', 'stories'),
    sources: plural(idx.feeds.filter((f) => f.ok).length, 'source'),
  };
}

const link = (it) => `#/story/${esc(it.id)}`;
const mediaLink = (it, opts) => `<a class="medialink" href="${link(it)}" tabindex="-1" aria-hidden="true">${media(it, opts)}</a>`;

// ---------- Front page ----------
function frontHtml() {
  const used = new Set();
  const list = ranked();
  const lead = pickLead(list, used);
  if (!lead) return '';
  const week = S.latest.filter((i) => i.tags.length && S.now - i.t < 7 * DAY).sort((a, b) => rank(b) - rank(a));
  const most = varied(week.filter((i) => !used.has(i.id)), 5, 2);
  most.forEach((i) => used.add(i.id));
  const seconds = spread(list, 3, used, [lead.comp]);
  const st = stats();
  const q = practiceQuestion();
  const fig = numberToKnow();
  const topics = topTopics(5);
  const maxN = Math.max(1, ...topics.map((x) => x.n));

  const sections = S.spec.components.map((c) => {
    const all = S.latest.filter((i) => inComp(i, c.id)).sort((a, b) => rank(b) - rank(a) || b.t - a.t);
    const open = all.filter((i) => !used.has(i.id));
    const secLead = open.slice(0, 4).find((i) => i.img) || open[0];
    if (secLead) used.add(secLead.id);
    const rest = open.filter((i) => i !== secLead).slice(0, 3);
    rest.forEach((i) => used.add(i.id));
    return `<section class="sec ${compClass(c.id)}" id="sec-${c.id}" aria-labelledby="sec-${c.id}-h">
      <h2 class="sec__head" id="sec-${c.id}-h"><a href="#/?c=${c.id}">${esc(c.name)}</a><span>${esc(c.paper)}</span></h2>
      ${secLead ? `<article class="sec__lead">
          ${mediaLink(secLead, { ratio: '16x9' })}
          <div><h3><a href="${link(secLead)}">${esc(secLead.title)}</a></h3>${byline(secLead, { kind: false })}</div>
        </article>` : `<p class="muted small">No ${esc(c.short)} stories this month yet.</p>`}
      ${rest.length ? `<ul class="sec__list">${rest.map((i) => `<li><a href="${link(i)}">${esc(i.title)}</a>${byline(i, { kind: false })}</li>`).join('')}</ul>` : ''}
      <a class="sec__more" href="#/?c=${c.id}">All ${plural(all.length, esc(c.short) + ' story', esc(c.short) + ' stories')} ${icon('right')}</a>
    </section>`;
  }).join('');

  return `<section class="front" aria-label="Front page">
    <header class="masthead">
      <div class="masthead__bar"><span>${esc(fmtDateline.format(new Date()))}</span><span class="live">${esc(st.updated)}</span><span>${esc(st.stories)} this month · ${esc(st.sources)}</span></div>
      <h1 class="masthead__title">Politics news you can use as evidence</h1>
      <p class="masthead__sub">UK, US and global stories, each tagged to the part of the Edexcel spec it's evidence for.</p>
      <nav class="masthead__nav" aria-label="Sections">${S.spec.components.map((c) => `<a class="${compClass(c.id)}" href="#sec-${c.id}"><span class="dot dot--${c.id}"></span>${esc(c.name)}</a>`).join('')}</nav>
    </header>

    <div class="hero">
      <article class="tile tile--lead ${compClass(lead.comp)}">
        ${media(lead, { ratio: 'fill', eager: true })}
        <div class="tile__shade"></div>
        <div class="tile__body">
          ${kicker(lead)}
          <h2><a href="${link(lead)}">${markedTitle(lead)}</a></h2>
          ${lead.summary ? `<p>${esc(lead.summary)}</p>` : ''}
          <div class="tile__foot">${byline(lead)}${saveButton(lead, 'savebtn--sm')}</div>
        </div>
      </article>
      ${most.length ? `<aside class="mostuseful" aria-labelledby="most-h"><h2 class="rulehead" id="most-h">Most useful this week</h2>
        <ol>${most.map((i, n) => `<li><span class="num">${String(n + 1).padStart(2, '0')}</span><div>${kicker(i, { topic: false })}<a href="${link(i)}">${esc(i.title)}</a>${byline(i, { kind: false })}</div></li>`).join('')}</ol></aside>` : ''}
    </div>

    <div class="widgets">
      ${fig ? `<section class="tile tile--fig" aria-label="Number to know">
        <div class="tile__label">Number to know</div>
        <div class="fig__big">${esc(fig.big)}</div>
        <p class="fig__q">${esc(fig.f.q)}</p>
        <p class="fig__a">${esc(fig.f.a)}</p>
        <a class="fig__src" href="${esc(fig.f.url)}" target="_blank" rel="noopener">${esc(fig.f.source)}${fig.f.asOf ? `, ${esc(fig.f.asOf)}` : ''} ↗</a>
      </section>` : ''}
      ${q ? `<section class="tile tile--q">
        <div class="tile__label">${icon('scale')}Practise this question</div>
        <q>${esc(q.q.text)}</q>
        <a class="tile__cta" href="#/questions/${esc(q.q.id)}">${plural(q.n, 'story', 'stories')} to use ${icon('right')}</a>
      </section>` : ''}
      ${topics.length ? `<section class="tile tile--topics">
        <div class="tile__label">${icon('clock')}This week by topic</div>
        <ul>${topics.map(({ t, n }) => `<li><button type="button" data-action="set-param" data-key="t" data-value="${esc(t.id)}" class="${compClass(t.component)}"><span class="lbl">${esc(t.name)}</span><span class="bar"><i style="width:${Math.round((n / maxN) * 100)}%"></i></span><span class="n">${n}</span></button></li>`).join('')}</ul>
        <a class="tile__more" href="#/spec">See the whole spec map ${icon('right')}</a>
      </section>` : ''}
    </div>

    ${seconds.length ? `<div class="front__row">${seconds.map((i) => `<article class="second ${compClass(i.comp)}">
        ${mediaLink(i, { ratio: '3x2' })}
        ${kicker(i)}
        <h3><a href="${link(i)}">${esc(i.title)}</a></h3>
        ${i.summary ? `<p>${esc(i.summary)}</p>` : ''}
        ${byline(i)}
      </article>`).join('')}</div>` : ''}

    <div class="sections">${sections}</div>
  </section>`;
}

// ---------- Header above the list, filters ----------
function headerHtml(isFront) {
  if (P.t) {
    const t = S.tagById[P.t];
    const comp = S.compById[t.component];
    const topic = S.topicById[t.topic];
    const qs = S.questions.filter((q) => q.tags.includes(t.id));
    return `<header class="feedhead ${compClass(t.component)}">
      <a class="backlink" href="#/">${icon('left')}Front page</a>
      <div class="eyebrow" style="color:var(--comp)">${esc(comp.name)} · ${esc(comp.paper)} · ${esc(topic.num)}. ${esc(topic.name)} · ${esc(t.ref)}</div>
      <h1>${esc(t.name)}</h1>
      <p class="lede">${esc(t.about)}</p>
      <p class="small muted"><b>Look for:</b> ${esc(t.look || '')}</p>
      ${qs.length ? `<div class="btnrow">${qs.slice(0, 3).map((q) => `<a class="btn btn--sm" href="#/questions/${esc(q.id)}">${icon('scale')}${esc(shortQ(q.text))}</a>`).join('')}</div>` : ''}
    </header>`;
  }
  if (P.c) {
    const c = S.compById[P.c];
    return `<header class="feedhead ${compClass(c.id)}">
      <a class="backlink" href="#/">${icon('left')}Front page</a>
      <div class="eyebrow" style="color:var(--comp)">${esc(c.paper)}</div>
      <h1>${esc(c.name)}</h1>
      <p class="lede">${esc(c.blurb || '')}</p>
    </header>`;
  }
  if (isFront) return `<h2 class="rulehead rulehead--big" id="latest">All the latest</h2>`;
  const st = stats();
  return `<header class="feedhead">
    <a class="backlink" href="#/">${icon('left')}Front page</a>
    <h1>All the latest</h1>
    <div class="meta-line"><span class="live">${esc(st.updated)}</span><span>${esc(st.stories)} in the last ${S.index?.latestDays || 30} days</span></div>
  </header>`;
}

function filtersHtml() {
  const comps = S.spec.components;
  const within = allItems(P.when === 'all').filter((i) => P.when !== '7' || S.now - i.t < 7 * DAY);
  const count = (c) => within.filter((i) => inComp(i, c)).length;
  const chip = (id, label, n, extra = '') => `<button class="chip" type="button" data-action="set-param" data-key="c" data-value="${id}" aria-pressed="${P.c === id}">${extra}${esc(label)}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
  const compChips = [chip('', 'All', within.length)].concat(comps.map((c) => chip(c.id, c.short, count(c.id), `<span class="dot dot--${c.id}"></span>`))).join('');

  const optgroups = (P.c ? S.topicsByComp[P.c] : S.spec.topics).map((tp) => {
    const tags = S.tagsByTopic[tp.id] || [];
    const comp = S.compById[tp.component];
    return `<optgroup label="${esc(P.c ? `${tp.num}. ${tp.name}` : `${comp.short} · ${tp.name}`)}">${tags.map((t) => `<option value="${esc(t.id)}" ${P.t === t.id ? 'selected' : ''}>${esc(t.name)} (${esc(t.ref)})</option>`).join('')}</optgroup>`;
  }).join('');

  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-action="set-param" data-key="${key}" data-value="${v}" aria-pressed="${P[key] === v}">${l}</button>`).join('')}</div>`;
  return `
    <div class="filters__row chips" role="group" aria-label="Paper">${compChips}</div>
    <div class="filters__row">
      <select class="select" data-param="t" aria-label="Spec topic"><option value="">All spec topics</option>${optgroups}</select>
      <select class="select" data-param="src" aria-label="Type of source">
        <option value="">All source types</option>
        ${['news', 'analysis', 'explainer', 'official'].map((k) => `<option value="${k}" ${P.src === k ? 'selected' : ''}>${kindLabel(k)}</option>`).join('')}
      </select>
      ${seg('when', [['7', '7 days'], ['30', '30 days'], ['all', 'All time']])}
      ${seg('sort', [['top', 'Top'], ['latest', 'Latest']])}
    </div>`;
}

export function setParam(key, value) {
  const p = { ...P, [key]: value };
  if (key === 'c') p.t = p.t && S.tagById[p.t]?.component === value ? p.t : '';
  if (key === 't' && value) p.c = S.tagById[value]?.component || p.c;
  const h = hashFromParams(p);
  if (location.hash !== h) {
    if (key === 'q') navReplace(h);
    else navPush(h);
  }
  window.dispatchEvent(new CustomEvent('cip:basehash', { detail: h }));
  const wasFront = noFilters();
  const wasTag = P.t;
  render(root, h);
  if (key !== 'q' && (key === 't' || wasTag !== p.t || wasFront !== noFilters())) window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function handle(action, el) {
  if (action === 'set-param') { setParam(el.dataset.key, el.dataset.value); return true; }
  if (action === 'more') { shown += PAGE; renderParts(); return true; }
  if (action === 'clear-filters') {
    const input = root?.querySelector('#q');
    if (input) input.value = '';
    navPush('#/');
    window.dispatchEvent(new CustomEvent('cip:basehash', { detail: '#/' }));
    render(root, '#/');
    return true;
  }
  if (action === 'clear-search') {
    const input = root?.querySelector('#q');
    if (input) { input.value = ''; input.focus(); }
    setParam('q', '');
    return true;
  }
  return false;
}

export function handleChange(el) {
  if (el.dataset.param) { setParam(el.dataset.param, el.value); return true; }
  return false;
}

export function focusSearch() {
  const input = root?.querySelector('#q');
  if (input) { input.focus(); input.select(); }
}

export function refreshSaved() {
  if (root && document.body.contains(root)) renderParts();
}
