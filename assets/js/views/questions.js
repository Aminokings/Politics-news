// Exam question matcher: pick a question, see which recent stories support each side.
import { S, allItems, loadArchive } from '../store.js';
import { esc, icon, plural, copyText, toast, shortDate } from '../util.js';
import { compClass, miniStory, tagChip, emptyState } from '../ui.js';
import { evidenceForQuestion } from '../match.js';

let filterComp = '';
let includeArchive = false;
const expanded = new Set();

export function renderList(el) {
  const items = allItems(false);
  const comps = S.spec.components;
  const qs = S.questions.filter((q) => !filterComp || q.component === filterComp);
  el.innerHTML = `<div class="layout--narrow">
    <div class="pagehead"><div>
      <div class="eyebrow">Exam question matcher</div>
      <h1>Find evidence for a question</h1>
      <p>Pick an exam-style question to see recent stories sorted into arguments for and against. These are practice questions written for this site, not official Pearson questions.</p>
    </div></div>
    <div class="chips" role="group" aria-label="Paper" style="margin-bottom:18px">
      <button class="chip" type="button" data-action="q-comp" data-value="" aria-pressed="${!filterComp}">All papers</button>
      ${comps.map((c) => `<button class="chip" type="button" data-action="q-comp" data-value="${c.id}" aria-pressed="${filterComp === c.id}"><span class="dot dot--${c.id}"></span>${esc(c.short)}</button>`).join('')}
    </div>
    <div class="qlist">
      ${qs.map((q) => {
        const ev = evidenceForQuestion(q, items);
        const fmt = S.formats[q.type];
        const matched = ev.byStrand.filter((l) => l.length).length;
        return `<a class="qcard ${compClass(q.component)}" href="#/questions/${esc(q.id)}">
          <span class="q">${esc(q.text)}</span>
          <span class="m"><span class="badge">${esc(fmt?.label || q.type)}</span><span>${esc(q.paper)}</span>
          <span>${plural(ev.matched, 'story', 'stories')} matched this month</span><span>${matched}/${q.strands.length} arguments with evidence</span></span>
        </a>`;
      }).join('')}
    </div>
  </div>`;
}

export function renderDetail(el, id) {
  const q = S.questions.find((x) => x.id === id);
  if (!q) { el.innerHTML = emptyState('Question not found', 'It may have been renamed.', '<a class="btn" href="#/questions">All questions</a>'); return; }
  if (includeArchive && S.archiveState === 'idle') loadArchive().then(() => { if (document.body.contains(el)) renderDetail(el, id); });
  const items = allItems(includeArchive);
  const ev = evidenceForQuestion(q, items);
  const fmt = S.formats[q.type];
  const comp = S.compById[q.component];

  const sideCol = (side) => {
    const strands = q.strands.map((st, idx) => ({ st, idx })).filter((x) => x.st.side === side);
    const aiList = ev.ai[side] || [];
    return `<div class="sidecol sidecol--${side}">
      <h2><span class="side-pill side-${side}">${side === 'a' ? (q.type === 'evaluate' || q.type === 'ideas' ? 'For' : 'A') : (q.type === 'evaluate' || q.type === 'ideas' ? 'Against' : 'B')}</span>${esc(q.sides[side])}</h2>
      ${strands.map(({ st, idx }) => {
        const list = ev.byStrand[idx];
        const key = `${q.id}:${idx}`;
        const limit = expanded.has(key) ? 12 : 3;
        return `<div class="strand">
          <h3>${esc(st.title)}</h3>
          ${st.hint ? `<p class="hint">${esc(st.hint)}</p>` : ''}
          ${list.length
            ? `<ul class="minis">${list.slice(0, limit).map(({ it, hit }) => miniStory(it, ` · mentions “${esc(hit)}”`)).join('')}</ul>
               ${list.length > limit ? `<button class="btn btn--ghost btn--sm" type="button" data-action="q-expand" data-key="${esc(key)}">Show ${list.length - limit} more</button>` : ''}`
            : `<p class="empty-strand">No recent story matches this argument yet${includeArchive ? '' : ' — try including the archive'}. Use the example above.</p>`}
        </div>`;
      }).join('')}
      ${aiList.length ? `<div class="strand"><h3>${icon('sparkles')} AI-suggested evidence</h3><ul class="minis">${aiList.slice(0, 4).map(({ it, point }) => miniStory(it, ` · ${esc(point)}`)).join('')}</ul></div>` : ''}
    </div>`;
  };

  el.innerHTML = `<div class="qdetail">
    <a class="backlink" href="#/questions">${icon('left')}All questions</a>
    <div class="${compClass(q.component)}">
      <div class="eyebrow" style="color:var(--comp)">${esc(comp.name)} · ${esc(q.paper)} · ${esc(fmt?.label || '')}</div>
      <h1 style="margin-top:6px">${esc(q.text)}</h1>
      <div class="tags" style="margin-top:12px">${q.tags.map((t) => tagChip(t)).join('')}</div>
    </div>
    <div class="tipbox"><span><b>How it's marked:</b> ${esc(fmt?.ao || '')}</span><span>${esc(fmt?.tip || '')}</span></div>
    <div class="btnrow no-print">
      <button class="btn btn--primary" type="button" data-action="q-plan" data-id="${esc(q.id)}">${icon('copy')}Copy essay plan with evidence</button>
      <button class="btn" type="button" data-action="q-archive" aria-pressed="${includeArchive}">${icon('archive')}${includeArchive ? (S.archiveState === 'loading' ? 'Loading archive…' : 'Including archive') : 'Include older stories'}</button>
    </div>
    <div class="sides">${sideCol('a')}${sideCol('b')}</div>
    ${q.judgement ? `<div class="tipbox"><span><b>Reaching a judgement:</b> ${esc(q.judgement)}</span></div>` : ''}
    ${ev.other.length ? `<section class="section"><h2>${icon('feed')}Other relevant stories</h2><p class="small muted">Tagged to this topic, but not matched to a specific argument. Read them and decide.</p><ul class="minis">${ev.other.slice(0, 8).map((it) => miniStory(it)).join('')}</ul></section>` : ''}
  </div>`;
}

function planText(q) {
  const ev = evidenceForQuestion(q, allItems(includeArchive));
  const fmt = S.formats[q.type];
  const lines = [`${q.text} (${fmt?.marks || ''} marks)`, `Assessment: ${fmt?.ao || ''}`, ''];
  for (const side of ['a', 'b']) {
    const essay = q.type === 'evaluate' || q.type === 'ideas';
    lines.push(`${essay ? (side === 'a' ? 'FOR: ' : 'AGAINST: ') : ''}${q.sides[side]}`);
    q.strands.forEach((st, idx) => {
      if (st.side !== side) return;
      lines.push(`- ${st.title}`);
      if (st.hint) lines.push(`    Example: ${st.hint}`);
      for (const { it } of ev.byStrand[idx].slice(0, 2)) lines.push(`    Evidence: ${it.title} (${it.srcName}, ${shortDate(it.date)}) ${it.url}`);
    });
    lines.push('');
  }
  if (q.judgement) lines.push(`Judgement: ${q.judgement}`, '');
  lines.push('Made with Case in Point. Check every source before you use it.');
  return lines.join('\n');
}

export function handle(action, el, rerender) {
  if (action === 'q-comp') { filterComp = el.dataset.value; rerender(); return true; }
  if (action === 'q-expand') { expanded.add(el.dataset.key); rerender(); return true; }
  if (action === 'q-archive') { includeArchive = !includeArchive; rerender(); return true; }
  if (action === 'q-plan') {
    const q = S.questions.find((x) => x.id === el.dataset.id);
    if (q) copyText(planText(q)).then((ok) => toast(ok ? 'Essay plan copied — paste it into your notes' : 'Could not copy'));
    return true;
  }
  return false;
}
