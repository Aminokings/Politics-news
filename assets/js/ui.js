// Shared bits of markup used across views.
import { S, bank } from './store.js';
import { esc, icon, timeAgo, highlight } from './util.js';
import { usesForItem } from './match.js';

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

function useHint(it) {
  const uses = usesForItem(it);
  const u = uses.find((x) => x.q.type === 'evaluate') || uses[0];
  if (!u) return '';
  const sideLabel = u.q.sides?.[u.side] || '';
  return `<span class="story__use"><b>Essay use</b> <span>“${esc(shortQ(u.q.text))}” → <em>${esc(sideLabel)}</em></span></span>`;
}

export function shortQ(text) {
  return text.replace(/^Evaluate the view that /, '').replace(/^Examine /, 'Examine ').replace(/\.$/, '').replace(/^(.)/, (m) => m.toUpperCase());
}

export function storyItem(it, { terms = [] } = {}) {
  const tags = it.tags.slice(0, 2).map((t) => tagChip(t)).join('');
  const also = it.also.length ? `<span>+${it.also.length} more source${it.also.length > 1 ? 's' : ''}</span>` : '';
  const ai = it.ai ? `<span class="badge badge--ai">${icon('sparkles')}AI notes</span>` : '';
  const kind = it.kind !== 'news' ? `<span class="badge">${esc(kindLabel(it.kind))}</span>` : '';
  return `<li class="story">
    <div class="story__main">
      <div class="story__kicker"><span class="src">${esc(it.srcName)}</span><span>${esc(timeAgo(it.t, S.now))}</span>${kind}</div>
      <h3 class="story__title"><a href="#/story/${esc(it.id)}">${highlight(esc(it.title), terms)}</a></h3>
      ${it.summary ? `<p class="story__sum">${highlight(esc(it.summary), terms)}</p>` : ''}
      <div class="story__foot">${tags ? `<span class="tags">${tags}</span>` : ''}${useHint(it)}${also}${ai}</div>
    </div>
    <div class="story__side">${saveButton(it)}</div>
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
