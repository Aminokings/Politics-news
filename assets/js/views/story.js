// Story drawer: summary, link to the original, spec links, exam angles, citation, notes.
import { S, bank, loadArchive } from '../store.js';
import { esc, icon, longDate, clock, timeAgo, copyText, toast } from '../util.js';
import { compClass, saveButton, kindLabel, miniStory, media } from '../ui.js';
import { usesForItem } from '../match.js';

export async function renderStory(drawer, id) {
  let it = S.itemById.get(id);
  if (!it && S.archiveState !== 'done') {
    drawer.innerHTML = `<div class="drawer__bar"><span class="muted small">Loading…</span>${closeBtn()}</div>`;
    await loadArchive();
    it = S.itemById.get(id);
  }
  if (!it) {
    const saved = bank.get(id);
    drawer.innerHTML = `<div class="drawer__bar"><span></span>${closeBtn()}</div><div class="drawer__body">${
      saved
        ? `<div class="notice">${icon('info')}<div>This story has dropped out of the archive, but it's still in your evidence bank.</div></div><h1 id="drawerTitle">${esc(saved.title)}</h1><p><a class="btn btn--primary" href="${esc(saved.url)}" target="_blank" rel="noopener">Read the full article${icon('external')}</a></p>`
        : `<h1 id="drawerTitle">Story not found</h1><p class="muted">It may have been removed from the archive.</p>`
    }</div>`;
    return;
  }

  const feed = S.feedsById[it.source];
  const uses = usesForItem(it);
  const related = S.latest
    .filter((x) => x.id !== it.id && x.tags[0] && x.tags[0] === it.tags[0])
    .sort((a, b) => b.t - a.t)
    .slice(0, 5);
  const cite = `${it.srcName}, “${it.title}”, ${longDate(it.date)}. Available at: ${it.url}`;
  const saved = bank.get(it.id);

  drawer.innerHTML = `
    <div class="drawer__bar">
      <div class="btnrow">${saveButton(it)}<button class="btn btn--sm btn--ghost" type="button" data-action="copy-link" data-id="${esc(it.id)}">${icon('copy')}Copy link</button></div>
      ${closeBtn()}
    </div>
    <div class="drawer__body">
      <div>
        <div class="kicker"><span class="src">${esc(it.srcName)}${feed?.section ? ` · ${esc(feed.section)}` : ''}</span><span>${esc(longDate(it.date))}, ${esc(clock(it.date))}</span><span class="badge">${esc(kindLabel(it.kind))}</span></div>
        <h1 id="drawerTitle">${esc(it.title)}</h1>
        ${it.img ? `<figure class="drawer__fig">${media(it, { ratio: '16x9', eager: true })}<figcaption>Photo: ${esc(it.srcName)}</figcaption></figure>` : ''}
        ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : '<p class="summary muted">No summary was provided by the source. Open the full article to read it.</p>'}
        <div class="btnrow" style="margin-top:16px">
          <a class="btn btn--primary" href="${esc(it.url)}" target="_blank" rel="noopener">Read the full article on ${esc(it.srcName)}${icon('external')}</a>
        </div>
        ${feed?.note ? `<p class="small muted" style="margin-top:8px">${esc(feed.note)}</p>` : ''}
      </div>

      ${it.ai ? `<section class="section"><h2>${icon('sparkles')}AI study notes</h2>
        <div class="box box--ai"><p>${esc(it.ai.summary)}</p>
        ${it.ai.facts?.length ? `<ul class="facts" style="margin-top:12px">${it.ai.facts.map((f) => `<li><span><b>${esc(f.q)}</b><br>${esc(f.a)}</span></li>`).join('')}</ul>` : ''}
        <p class="small muted" style="margin-top:10px">Written automatically from the headline and blurb only. Check the original article before quoting it.</p></div></section>` : ''}

      <section class="section"><h2>${icon('grid')}Where it fits in the spec</h2>
        ${it.tags.length ? it.tags.map((id) => specLink(it, id)).join('') : `<p class="muted small">This story wasn't matched to a specific spec point. It may still be useful background.</p>`}
      </section>

      ${uses.length ? `<section class="section"><h2>${icon('scale')}Use it in an essay</h2>${usesHtml(uses)}</section>` : ''}

      ${it.also.length ? `<section class="section"><h2>${icon('feed')}Also covered by</h2><ul class="linklist">${it.also.map((a) => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener"><span class="t">${esc(a.title)}</span><span class="m">${esc(S.feedsById[a.source]?.name || a.source)} · ${esc(timeAgo(a.date, S.now))} ↗</span></a></li>`).join('')}</ul></section>` : ''}

      <section class="section"><h2>${icon('pen')}My notes</h2>
        ${saved
          ? `<textarea class="textarea" data-note="${esc(it.id)}" placeholder="How would you use this? e.g. 'AO2: shows backbench power when majority is unhappy — pair with 2025 welfare rebellion'">${esc(saved.note || '')}</textarea><p class="small muted">Notes save automatically to this browser.</p>`
          : `<p class="muted small">Save this story to your evidence bank to add your own notes.</p><div>${saveButton(it)}</div>`}
      </section>

      <section class="section"><h2>${icon('quote')}Cite it</h2>
        <div class="cite"><code>${esc(cite)}</code><button class="btn btn--sm" type="button" data-action="copy-text" data-text="${esc(cite)}">${icon('copy')}Copy</button></div>
      </section>

      ${related.length ? `<section class="section"><h2>${icon('clock')}More on this topic</h2><ul class="minis">${related.map((r) => miniStory(r)).join('')}</ul></section>` : ''}
    </div>`;
}

function closeBtn() {
  return `<button class="iconbtn" type="button" data-action="close-overlay" aria-label="Close story">${icon('x')}</button>`;
}

function specLink(it, id) {
  const t = S.tagById[id];
  if (!t) return '';
  const comp = S.compById[t.component];
  const topic = S.topicById[t.topic];
  const why = it.why?.[id];
  return `<a class="speclink ${compClass(t.component)}" href="#/?t=${esc(id)}" style="text-decoration:none">
    <span class="path">${esc(comp.name)} (${esc(comp.paper)}) › ${esc(topic.num)}. ${esc(topic.name)} › ${esc(t.ref)}</span>
    <span class="name">${esc(t.name)}</span>
    <span class="about">${esc(t.about)}</span>
    ${why?.length ? `<span class="why">Matched on: ${why.map((w) => `“${esc(w)}”`).join(', ')}</span>` : ''}
  </a>`;
}

function usesHtml(uses) {
  const seen = new Set();
  const rows = [];
  for (const u of uses) {
    const key = `${u.q.id}|${u.side}|${u.idx}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(u);
    if (rows.length >= 4) break;
  }
  return rows.map((u) => {
    const sideLabel = u.q.sides?.[u.side] || '';
    const fmt = S.formats[u.q.type];
    return `<div class="angle">
      <q>${esc(u.q.text)}</q>
      <div class="side"><span class="side-pill side-${esc(u.side)}">${esc(sideLabel)}</span>
        ${u.ai ? `<span class="badge badge--ai">${icon('sparkles')}AI suggestion</span><span>${esc(u.point)}</span>` : `<span><b>${esc(u.strand.title)}</b>${u.hit ? ` <span class="muted">(mentions “${esc(u.hit)}”)</span>` : ''}</span>`}
      </div>
      <div class="small muted">${esc(fmt?.label || '')} · ${esc(u.q.paper)} · <a href="#/questions/${esc(u.q.id)}">See all evidence for this question</a></div>
    </div>`;
  }).join('') + `<p class="small muted">Suggested by keyword matching. Decide for yourself whether it really supports the argument.</p>`;
}

export async function copyLink(id) {
  const url = `${location.origin}${location.pathname}#/story/${id}`;
  const ok = await copyText(url);
  toast(ok ? 'Link copied' : 'Could not copy — select the address bar instead');
}
