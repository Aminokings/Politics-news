// Shared bits of markup used across views.
import { S, bank } from './store.js';
import { esc, icon, timeAgo, highlight } from './util.js';
import { usesForItem } from './match.js';
import { artFor, sceneSvg } from './art.js';

export const compClass = (compId) => (compId ? `comp-${compId}` : '');

export function tagChip(tagId, { asButton = true } = {}) {
  const t = S.tagById[tagId];
  if (!t) return '';
  const label = esc(t.name);
  const title = `${esc(S.compById[t.component]?.name || '')}: ${esc(S.topicById[t.topic]?.name || '')} (${esc(t.ref)})`;
  return asButton
    ? `<a class="tag ${compClass(t.component)}" href="#/?t=${esc(tagId)}" title="${title}">${label}</a>`
    : `<span class="tag ${compClass(t.component)}" title="${title}">${label}</span>`;
}

export function saveButton(it, size = '') {
  const saved = bank.has(it.id);
  return `<button class="savebtn ${size}" type="button" data-action="toggle-save" data-id="${esc(it.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from' : 'Save to'} my evidence bank" title="${saved ? 'Saved — click to remove' : 'Save to my evidence bank'}">${icon('bookmark')}</button>`;
}

/** The best exam question this story could be evidence for. */
export function bestUse(it) {
  const uses = usesForItem(it);
  return uses.find((x) => x.q.type === 'evaluate') || uses[0] || null;
}

/** One line on how a story could be used in an essay, e.g. "Imperial presidency" → No: constrained. */
export function essayUse(it) {
  const u = bestUse(it);
  if (!u) return '';
  const sideLabel = u.q.sides?.[u.side] || '';
  return `<p class="card__use"><b>Essay use</b> “${esc(shortQ(u.q.text))}” → <em>${esc(sideLabel)}</em></p>`;
}

export function shortQ(text) {
  return text.replace(/^Evaluate the view that /, '').replace(/^Examine /, 'Examine ').replace(/\.$/, '').replace(/^(.)/, (m) => m.toUpperCase());
}

/**
 * A story's photo, or one of the site's own drawings when it has none (see art.js). If a
 * photo fails to load, the error handler in app.js swaps in the drawing.
 * `look` limits the drawing's colours: 'day', 'dusk', 'night' or a list of them.
 */
export function media(it, { ratio = '3x2', eager = false, cls = '', look } = {}) {
  const art = artFor(it, look);
  if (it.img) {
    const img = `<img src="${esc(it.img)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer"${it.img0 ? ` data-fb="${esc(it.img0)}"` : ''}>`;
    return `<div class="media media--${ratio} ${compClass(it.comp)} ${cls}" data-art="${art.key}">${img}</div>`;
  }
  return `<div class="media media--${ratio} media--art pal-${art.look} ${compClass(it.comp)} ${cls}" data-art="${art.key}">${sceneSvg(art)}</div>`;
}

/** Small coloured label above a headline: "USA · Supreme Court". */
export function kicker(it, { topic = true } = {}) {
  const comp = S.compById[it.comp];
  const t = S.tagById[it.tags[0]];
  if (!comp) return `<div class="kick"><span class="kick__comp">${esc(it.srcName)}</span></div>`;
  return `<div class="kick ${compClass(it.comp)}"><span class="kick__comp">${esc(comp.short)}</span>${topic && t ? `<span class="kick__topic">${esc(t.name)}</span>` : ''}</div>`;
}

export function byline(it, { kind = true } = {}) {
  const k = kind && it.kind !== 'news' ? `<span class="badge">${esc(kindLabel(it.kind))}</span>` : '';
  return `<div class="byline"><span class="src">${esc(it.srcName)}</span><span>${esc(timeAgo(it.t, S.now))}</span>${k}</div>`;
}

/** Escaped headline with the first spec keyword it matched on marked, e.g. "…to <mark>Supreme Court</mark>…". */
export function markedTitle(it) {
  const title = esc(it.title);
  const labels = [...new Set(Object.values(it.why || {}).flat())].filter((l) => l && l.length > 2).sort((a, b) => b.length - a.length);
  for (const l of labels) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${esc(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[^\\p{L}\\p{N}]|$)`, 'iu');
    if (re.test(title)) return title.replace(re, '$1<mark class="hl">$2</mark>');
  }
  return title;
}

/** Story card with a photo (or a coloured topic tile when there isn't one). */
export function storyCard(it, { terms = [] } = {}) {
  return `<li class="card ${compClass(it.comp)}">
    ${media(it, { ratio: '16x9' })}
    <div class="card__body">
      ${kicker(it)}
      <h3 class="card__title"><a href="#/story/${esc(it.id)}">${highlight(esc(it.title), terms)}</a></h3>
      ${it.summary ? `<p class="card__sum">${highlight(esc(it.summary), terms)}</p>` : ''}
      ${essayUse(it)}
      <div class="card__foot">${byline(it)}${it.also.length ? `<span class="card__also">+${it.also.length} source${it.also.length > 1 ? 's' : ''}</span>` : ''}${it.ai ? `<span class="badge badge--ai">${icon('sparkles')}AI notes</span>` : ''}${saveButton(it, 'savebtn--sm')}</div>
    </div>
  </li>`;
}

export function miniStory(it, extra = '') {
  return `<li class="mini">
    <div><a href="#/story/${esc(it.id)}">${esc(it.title)}</a><div class="m">${esc(it.srcName)} · ${esc(timeAgo(it.t, S.now))}${extra}</div></div>
    ${saveButton(it)}
  </li>`;
}

export function kindLabel(kind) {
  return { news: 'News', analysis: 'Analysis', explainer: 'Explainer', official: 'Official' }[kind] || kind;
}

const MONTHS = /^(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;
const FIGURE = /^(?:(?:About|Around|Roughly|Nearly|Almost|Over|More than|Some)\s+)?((?:£|\$|€)?\d[\d,.]*(?:[–-]\d[\d,.]*)?(?:\s?%|\s?°C|(?:bn|m)\b|\s(?:billion|million|trillion)\b)?(?:\s(?:days|seats|votes|MPs|years|months|weeks|members|councillors|countries|states|arrests))?)/i;

/** Facts whose answer starts with a figure (not a date), e.g. "59.7%, the lowest since 2001". */
export function numberFacts() {
  const pool = [];
  for (const f of S.facts) {
    const m = f.a.match(FIGURE);
    if (!m) continue;
    const big = m[1].replace(/[.,]+$/, '');
    const rest = f.a.slice(m[0].length).trim();
    if (MONTHS.test(rest) || /^\d{4}$/.test(big)) continue;
    pool.push({ f, big });
  }
  return pool;
}

/** A figure worth remembering, from config/facts.json, changing once a day. */
export function numberToKnow(day = new Date()) {
  const pool = numberFacts();
  if (!pool.length) return null;
  const doy = Math.floor((Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - Date.UTC(day.getFullYear(), 0, 0)) / 86400000);
  return pool[doy % pool.length];
}

export function emptyState(title, text, action = '') {
  return `<div class="empty">
    <svg class="art" viewBox="0 0 120 120" aria-hidden="true">
      <rect x="22" y="18" width="76" height="90" rx="10" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="2"/>
      <rect x="34" y="34" width="52" height="7" rx="3.5" fill="var(--sunken)"/>
      <rect x="34" y="49" width="40" height="5" rx="2.5" fill="var(--sunken)"/>
      <rect x="34" y="60" width="46" height="5" rx="2.5" fill="var(--sunken)"/>
      <rect x="34" y="71" width="30" height="5" rx="2.5" fill="var(--sunken)"/>
      <circle cx="88" cy="88" r="16" fill="#D98E26"/>
      <path d="M81 88h14M88 81v14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>
    <h2>${esc(title)}</h2><p>${text}</p>${action}
  </div>`;
}

export function noDataNotice() {
  return `<div class="notice">${icon('info')}<div><b>No news has been fetched yet.</b> If you've just deployed the site, the updater usually runs within a few minutes. Check the <b>Actions</b> tab on GitHub. On your own computer, run <code>npm run update</code> first.</div></div>`;
}
