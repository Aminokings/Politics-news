// Spec coverage map: every spec point with how much recent evidence exists for it.
import { S, bank } from '../store.js';
import { esc, icon, timeAgo } from '../util.js';
import { compClass } from '../ui.js';

let range = 'd30';

export function render(el) {
  const tc = S.index?.tagCounts || {};
  const savedByTag = {};
  for (const it of bank.list()) for (const t of it.tags || []) savedByTag[t] = (savedByTag[t] || 0) + 1;
  const max = Math.max(1, ...Object.values(tc).map((v) => v[range] || 0));
  const labels = { d7: 'last 7 days', d30: 'last 30 days', all: 'all time' };

  el.innerHTML = `
    <div class="pagehead"><div>
      <div class="eyebrow">Spec coverage map</div>
      <h1>The whole spec at a glance</h1>
      <p>How many stories in the ${labels[range]} are evidence for each part of the Edexcel spec. Click any row to see its stories. Gaps show where you'll need textbook examples or the archive.</p>
    </div>
    <div class="seg" role="group" aria-label="Time range">
      ${Object.entries(labels).map(([k, l]) => `<button type="button" data-action="spec-range" data-value="${k}" aria-pressed="${range === k}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}
    </div></div>
    <div class="legend" style="margin-bottom:16px"><span>${icon('bookmark')} <b style="color:#B8751C">★</b> = stories you've saved</span><span>Numbers count stories tagged to each point.</span></div>
    <div class="specgrid">
      ${S.spec.components.map((c) => `
        <section class="speccard ${compClass(c.id)}">
          <header><h2>${esc(c.name)}</h2><span class="paper">${esc(c.paper)}</span></header>
          <p class="small muted">${esc(c.blurb)}</p>
          ${S.topicsByComp[c.id].map((tp) => `
            <div class="spectopic">
              <h3>${esc(tp.num)}. ${esc(tp.name)}</h3>
              ${(S.tagsByTopic[tp.id] || []).map((t) => {
                const v = tc[t.id] || { d7: 0, d30: 0, all: 0, last: null };
                const n = v[range] || 0;
                const saved = savedByTag[t.id] || 0;
                return `<a class="specrow ${n ? '' : 'is-gap'}" href="#/?t=${esc(t.id)}${range === 'all' ? '&when=all' : range === 'd7' ? '&when=7' : ''}" style="text-decoration:none" title="${esc(t.about)}${v.last ? ` · latest ${esc(timeAgo(v.last))}` : ''}">
                  <span>${esc(t.name)}<span class="ref">${esc(t.ref)}</span>${saved ? `<span class="saved">★${saved}</span>` : ''}</span>
                  <span class="bar"><i style="width:${n ? Math.max(4, Math.round((n / max) * 100)) : 0}%"></i></span>
                  <span class="n">${n}</span>
                </a>`;
              }).join('')}
            </div>`).join('')}
        </section>`).join('')}
    </div>`;
}

export function handle(action, el, rerender) {
  if (action === 'spec-range') { range = el.dataset.value; rerender(); return true; }
  return false;
}
