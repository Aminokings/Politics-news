// Essays: longer arguments on debates in the spec, written for the site.
// The list is config/essays.json; each essay's text is a Markdown file in essays/.
import { S } from '../store.js';
import { esc, icon, longDate } from '../util.js';
import { compClass, media, tagChip, miniStory, emptyState } from '../ui.js';
import { renderMarkdown, notesHtml } from '../lib/markdown.js';

const loaded = new Map(); // essay id → Promise<{ html, notes, words }>

export const essayById = (id) => S.essays.find((e) => e.id === id);

/** The shape media() and friends expect from a story. */
function asItem(e) {
  const primary = e.tags.map((t) => S.tagById[t]).find(Boolean);
  return { id: `essay-${e.id}`, title: e.title, tags: e.tags, comp: primary?.component || null, art: e.art };
}

const dateOf = (e) => (e.date ? longDate(`${e.date}T12:00:00`) : '');
const minutes = (words) => `${Math.max(1, Math.round(words / 200))} min read`;

/** The parts of the spec an essay covers, e.g. "UK Politics · UK Government". */
function compsOf(e) {
  const ids = [...new Set(e.tags.map((t) => S.tagById[t]?.component).filter(Boolean))];
  return ids.map((id) => S.compById[id]).filter(Boolean);
}

function load(e) {
  if (!loaded.has(e.id)) {
    const p = fetch(e.file, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((md) => renderMarkdown(md));
    p.catch(() => loaded.delete(e.id)); // try again next time
    loaded.set(e.id, p);
  }
  return loaded.get(e.id);
}

function fillMinutes(root) {
  root.querySelectorAll('[data-mins]').forEach((el) => {
    const e = essayById(el.dataset.mins);
    if (e) load(e).then((d) => { el.textContent = minutes(d.words); }).catch(() => {});
  });
}

const kicker = (e) => `<div class="kick ${compClass(compsOf(e)[0]?.id)}"><span class="kick__comp">Essay</span>${compsOf(e).length ? `<span class="kick__topic">${compsOf(e).map((c) => esc(c.name)).join(' · ')}</span>` : ''}</div>`;

// ---------- Front page ----------
/** A feature band for the newest essay. */
export function essayFeature() {
  const e = S.essays[0];
  if (!e) return '';
  const it = asItem(e);
  return `<section class="essayband" aria-label="Essay">
    <a class="essayband__card ${compClass(it.comp)}" href="#/essays/${esc(e.id)}">
      ${media(it, { ratio: '16x9', look: e.look })}
      <div class="essayband__text">
        ${kicker(e)}
        <h2>${esc(e.title)}</h2>
        <p>${esc(e.summary || '')}</p>
        <span class="essayband__by">By ${esc(e.author || 'Case in Point')}<span class="essayband__cta">Read the essay ${icon('right')}</span></span>
      </div>
    </a>
    ${S.essays.length > 1 ? `<a class="essayband__all" href="#/essays">All ${S.essays.length} essays ${icon('right')}</a>` : ''}
  </section>`;
}

// ---------- Essays page ----------
export function renderList(el) {
  el.innerHTML = `<div class="layout--narrow">
    <div class="pagehead"><div>
      <div class="eyebrow">Essays</div>
      <h1>Essays</h1>
      <p>Longer arguments on the big debates in the spec, with every source listed. See how evidence builds an argument, then make up your own mind.</p>
    </div></div>
    ${S.essays.length ? `<div class="essaylist">${S.essays.map((e) => {
      const it = asItem(e);
      return `<a class="essaycard ${compClass(it.comp)}" href="#/essays/${esc(e.id)}">
        ${media(it, { ratio: '3x2', look: e.look })}
        <div class="essaycard__body">
          ${kicker(e)}
          <h2>${esc(e.title)}</h2>
          ${e.summary ? `<p>${esc(e.summary)}</p>` : ''}
          <div class="byline"><span class="src">By ${esc(e.author || 'Case in Point')}</span><span>${esc(dateOf(e))}</span><span data-mins="${esc(e.id)}"></span></div>
        </div>
      </a>`;
    }).join('')}</div>` : emptyState('No essays yet', 'Essays will appear here once they are added to config/essays.json.')}
  </div>`;
  fillMinutes(el);
}

// ---------- One essay ----------
function questionsFor(e) {
  const byId = Object.fromEntries(S.questions.map((q) => [q.id, q]));
  if (Array.isArray(e.questions) && e.questions.length) return e.questions.map((id) => byId[id]).filter(Boolean);
  const overlap = (q) => (q.tags || []).filter((t) => e.tags.includes(t)).length;
  return S.questions.map((q, i) => ({ q, n: overlap(q), i })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 3).map((x) => x.q);
}

/** Recent stories on the essay's topics: more shared spec points (and its main one) rank higher. */
function newsFor(e) {
  const weight = (it) => it.tags.filter((t) => e.tags.includes(t)).length + (it.tags.includes(e.tags[0]) ? 1 : 0);
  const since = S.now - 21 * 86400000;
  return S.latest
    .filter((it) => it.t >= since)
    .map((it) => ({ it, w: weight(it) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || b.it.t - a.it.t)
    .slice(0, 4)
    .map((x) => x.it);
}

export async function renderEssay(el, id) {
  const e = essayById(id);
  if (!e) {
    el.innerHTML = emptyState('Essay not found', 'It may have been renamed or taken down.', '<a class="btn" href="#/essays">All essays</a>');
    return;
  }
  document.title = `${e.title} · Case in Point`;
  const it = asItem(e);
  const qs = questionsFor(e);
  const news = newsFor(e);
  el.innerHTML = `<article class="essay ${compClass(it.comp)}" data-essay="${esc(e.id)}">
    <header class="essay__head">
      <a class="backlink" href="#/essays">${icon('left')}All essays</a>
      ${kicker(e)}
      <h1>${esc(e.title)}</h1>
      ${e.summary ? `<p class="essay__dek">${esc(e.summary)}</p>` : ''}
      <div class="essay__byline"><span>By <b>${esc(e.author || 'Case in Point')}</b></span><span>${esc(dateOf(e))}</span><span data-mins="${esc(e.id)}"></span></div>
    </header>
    <div class="essay__art">${media(it, { ratio: '16x9', eager: true, look: e.look })}</div>
    <div class="essay__body" aria-busy="true"><p class="muted">Loading the essay…</p></div>
    <aside class="essay__aside" aria-label="Using this essay">
      <p class="essay__note">${icon('info')}<span>Essays argue one point of view. Check the sources before you use the evidence, and weigh it against the other side.</span></p>
      ${e.tags.length ? `<section><h2>On the spec</h2><div class="tags">${e.tags.map((t) => tagChip(t)).join('')}</div></section>` : ''}
      ${qs.length ? `<section><h2>Practise with</h2><ul class="essay__qs">${qs.map((q) => `<li><a href="#/questions/${esc(q.id)}">${icon('scale')}<span>${esc(q.text)}</span></a></li>`).join('')}</ul></section>` : ''}
      ${news.length ? `<section><h2>In the news</h2><ul class="minis">${news.map((n) => miniStory(n)).join('')}</ul></section>` : ''}
    </aside>
  </article>`;
  fillMinutes(el);

  let doc;
  try {
    doc = await load(e);
  } catch {
    const body = el.querySelector(`.essay[data-essay="${CSS.escape(e.id)}"] .essay__body`);
    if (body) body.innerHTML = `<div class="notice">${icon('info')}<div><b>Couldn't load this essay.</b> Check your connection and try again.</div></div>`;
    return;
  }
  const body = el.querySelector(`.essay[data-essay="${CSS.escape(e.id)}"] .essay__body`);
  if (!body) return; // the reader has moved on to another page
  body.innerHTML = doc.html + notesHtml(doc.notes);
  body.removeAttribute('aria-busy');
}
