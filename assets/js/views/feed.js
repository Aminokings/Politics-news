// News feed: filters, search, top picks and the story list.
import { S, allItems, loadArchive, rank, bank } from '../store.js';
import { esc, icon, timeAgo, plural, debounce, navPush, navReplace } from '../util.js';
import { storyItem, tagChip, compClass, kindLabel, noDataNotice, shortQ } from '../ui.js';
import { evidenceForQuestion } from '../match.js';

const DAY = 86400000;
const PAGE = 25;
const DEFAULTS = { c: '', t: '', src: '', when: '30', sort: 'top', q: '' };

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

function filtered() {
  const includeArchive = P.when === 'all';
  let list = allItems(includeArchive);
  if (P.when === '7') list = list.filter((i) => S.now - i.t < 7 * DAY);
  if (P.c) list = list.filter((i) => i.tags.some((t) => S.tagById[t]?.component === P.c));
  if (P.t) list = list.filter((i) => i.tags.includes(P.t));
  if (P.src) list = list.filter((i) => i.kind === P.src);
  const tm = terms();
  if (tm.length) list = list.filter((i) => tm.every((t) => i._search.includes(t)));
  if (P.sort === 'latest' || tm.length) list = list.slice().sort((a, b) => b.t - a.t);
  else list = list.slice().sort((a, b) => rank(b) - rank(a) || b.t - a.t);
  return list;
}

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
    el.innerHTML = `<div class="layout">
      <div>
        <div id="feedHead"></div>
        <div id="feedPicks"></div>
        <section class="filters" aria-label="Filter stories">
          <div class="search" role="search">
            ${icon('search')}
            <input class="input" id="q" type="search" placeholder="Search stories, e.g. 'select committee', 'Supreme Court', 'NATO'" autocomplete="off" aria-label="Search stories">
            <button class="clear" type="button" data-action="clear-search" aria-label="Clear search" hidden>${icon('x')}</button>
          </div>
          <div id="feedFilters"></div>
        </section>
        <div id="feedList"></div>
      </div>
      <aside class="rail" id="feedRail" aria-label="Highlights"></aside>
    </div>`;
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

function renderParts() {
  if (!root) return;
  const head = root.querySelector('#feedHead');
  const picks = root.querySelector('#feedPicks');
  const filters = root.querySelector('#feedFilters');
  const listEl = root.querySelector('#feedList');
  const rail = root.querySelector('#feedRail');
  const clearBtn = root.querySelector('.search .clear');
  if (clearBtn) clearBtn.hidden = !P.q;

  head.innerHTML = headerHtml();
  filters.innerHTML = filtersHtml();
  if (!S.latest.length) {
    picks.innerHTML = '';
    listEl.innerHTML = noDataNotice();
    rail.innerHTML = railHtml();
    return;
  }
  const noFilters = !P.c && !P.t && !P.src && !P.q && P.when === '30' && P.sort === 'top';
  picks.innerHTML = noFilters ? picksHtml() : '';
  const list = filtered();
  const tm = terms();
  const archiveNote = P.when === 'all' && S.archiveState === 'loading' ? ' · loading archive…' : '';
  const activeFilters = P.c || P.t || P.src || P.q || P.when !== '30';
  listEl.innerHTML = `
    <div class="resultline"><span>${list.length ? `Showing ${Math.min(shown, list.length)} of ${plural(list.length, 'story', 'stories')}` : 'No matching stories'}${archiveNote}</span>
      ${activeFilters ? `<button class="btn btn--ghost btn--sm" type="button" data-action="clear-filters">${icon('rotate')}Clear filters</button>` : ''}</div>
    ${list.length ? `<ul class="stories">${list.slice(0, shown).map((it) => storyItem(it, { terms: tm })).join('')}</ul>` : emptyResults()}
    ${list.length > shown ? `<div class="more"><button class="btn" type="button" data-action="more">Show more stories</button></div>` : ''}`;
  rail.innerHTML = railHtml();
}

function emptyResults() {
  const hint = P.when !== 'all' ? `<button class="btn btn--sm" type="button" data-action="set-param" data-key="when" data-value="all">${icon('archive')}Search the archive too</button>` : '';
  return `<div class="notice">${icon('info')}<div><b>Nothing matches yet.</b> Try a broader search, another topic, or a longer time range. ${hint}</div></div>`;
}

function headerHtml() {
  const idx = S.index;
  const updated = idx ? `<span class="live">Updated ${esc(timeAgo(idx.generatedAt, Date.now()))}</span>` : '';
  const counts = idx ? `<span>${plural(idx.counts.latest, 'story', 'stories')} in the last ${idx.latestDays} days</span><span>${plural(idx.feeds.filter((f) => f.ok).length, 'source')} checked</span>` : '';
  if (P.t) {
    const t = S.tagById[P.t];
    const comp = S.compById[t.component];
    const topic = S.topicById[t.topic];
    const qs = S.questions.filter((q) => q.tags.includes(t.id));
    return `<header class="feedhead ${compClass(t.component)}">
      <a class="backlink" href="#/">${icon('left')}All news</a>
      <div class="eyebrow" style="color:var(--comp)">${esc(comp.name)} · ${esc(comp.paper)} · ${esc(topic.num)}. ${esc(topic.name)} · ${esc(t.ref)}</div>
      <h1>${esc(t.name)}</h1>
      <p class="lede">${esc(t.about)}</p>
      <p class="small muted"><b>Look for:</b> ${esc(t.look || '')}</p>
      ${qs.length ? `<div class="btnrow">${qs.slice(0, 3).map((q) => `<a class="btn btn--sm" href="#/questions/${esc(q.id)}">${icon('scale')}${esc(shortQ(q.text))}</a>`).join('')}</div>` : ''}
    </header>`;
  }
  return `<header class="feedhead">
    <h1>Politics news you can use as evidence</h1>
    <p class="lede">Recent UK, US and global stories, each tagged to the part of the Edexcel spec it's evidence for. Save the best ones to your evidence bank as you go.</p>
    <div class="meta-line">${updated}${counts}</div>
  </header>`;
}

function filtersHtml() {
  const comps = S.spec.components;
  const within = allItems(P.when === 'all').filter((i) => P.when !== '7' || S.now - i.t < 7 * DAY);
  const count = (c) => within.filter((i) => i.tags.some((t) => S.tagById[t]?.component === c)).length;
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

function picksHtml() {
  const recent = S.latest.filter((i) => S.now - i.t < 2 * DAY && i.tags.length);
  const pool = recent.length >= 3 ? recent : S.latest.filter((i) => i.tags.length);
  const sorted = pool.slice().sort((a, b) => rank(b) - rank(a));
  const picks = [];
  const usedComps = new Set();
  for (const it of sorted) {
    if (picks.length >= 3) break;
    if (usedComps.has(it.comp)) continue;
    usedComps.add(it.comp);
    picks.push(it);
  }
  for (const it of sorted) { if (picks.length >= 3) break; if (!picks.includes(it)) picks.push(it); }
  if (!picks.length) return '';
  return `<div class="eyebrow" style="margin-top:4px">Top picks right now</div>
  <div class="picks">${picks.map((it) => `<a class="pick ${compClass(it.comp)}" href="#/story/${esc(it.id)}" style="text-decoration:none">
      <div class="story__kicker"><span class="src">${esc(it.srcName)}</span><span>${esc(timeAgo(it.t, S.now))}</span></div>
      <h3>${esc(it.title)}</h3>
      <div class="tags">${it.tags.slice(0, 1).map((t) => tagChip(t, { asButton: false })).join('')}</div>
    </a>`).join('')}</div>`;
}

function railHtml() {
  const tc = S.index?.tagCounts || {};
  const top = Object.entries(tc).filter(([, v]) => v.d7 > 0).sort((a, b) => b[1].d7 - a[1].d7).slice(0, 8);
  const topHtml = top.length
    ? `<ul class="toplist">${top.map(([id, v]) => {
        const t = S.tagById[id];
        return t ? `<li><button type="button" data-action="set-param" data-key="t" data-value="${esc(id)}"><span class="dot dot--${t.component}"></span><span>${esc(t.name)}</span><span class="n">${v.d7}</span></button></li>` : '';
      }).join('')}</ul>`
    : '<p>No stories this week yet.</p>';

  // A practice question with the most evidence this month
  const scored = S.questions.filter((q) => q.type === 'evaluate').map((q) => ({ q, n: evidenceForQuestion(q, S.latest).matched }));
  scored.sort((a, b) => b.n - a.n);
  const pick = scored.length ? scored[(new Date().getDate()) % Math.min(6, scored.length)] : null;
  const qHtml = pick
    ? `<section class="panel qotd"><h2>${icon('scale')}Practise this question</h2><q>${esc(pick.q.text)}</q><p>${plural(pick.n, 'recent story', 'recent stories')} matched to its arguments.</p><a class="btn btn--sm btn--primary" href="#/questions/${esc(pick.q.id)}">See the evidence${icon('right')}</a></section>`
    : '';
  const n = bank.count();
  return `<section class="panel"><h2>${icon('clock')}This week by topic</h2>${topHtml}<p class="small muted" style="margin-top:8px"><a href="#/spec">See the whole spec map</a></p></section>
    ${qHtml}
    <section class="panel"><h2>${icon('bookmark')}My evidence bank</h2><p>${n ? `You've saved ${plural(n, 'story', 'stories')}.` : 'Tap the bookmark on any story to save it, then add your own notes.'}</p>${n ? `<p style="margin-top:10px"><a class="btn btn--sm" href="#/bank">Open my evidence${icon('right')}</a></p>` : ''}</section>`;
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
  const wasTag = P.t;
  render(root, h);
  if (key !== 'q' && (key === 't' || wasTag !== p.t)) window.scrollTo({ top: 0, behavior: 'smooth' });
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
