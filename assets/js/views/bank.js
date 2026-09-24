// "My evidence": saved stories grouped by spec point, with notes, export and backup.
import { S, bank, storageWorks } from '../store.js';
import { esc, icon, shortDate, downloadFile, copyText, toast, plural } from '../util.js';
import { compClass, tagChip, emptyState } from '../ui.js';

export function render(el) {
  const items = bank.list();
  if (!items.length) {
    el.innerHTML = `<div class="layout--narrow">${emptyState(
      'Your evidence bank is empty',
      'Tap the bookmark on any story to save it here. Add a note on how you would use it, then export everything before your exams.',
      `<div class="btnrow" style="justify-content:center"><a class="btn btn--primary" href="#/">Browse the news</a><button class="btn" type="button" data-action="bank-import">${icon('upload')}Restore a backup</button></div>`,
    )}${importInput()}</div>`;
    return;
  }
  const groups = groupItems(items);
  el.innerHTML = `<div class="layout--narrow">
    <div class="pagehead"><div>
      <div class="eyebrow">My evidence</div>
      <h1>Evidence bank</h1>
      <p>${plural(items.length, 'saved story', 'saved stories')}, grouped by spec point. Everything is stored in this browser only, so download a backup now and then.</p>
    </div></div>
    ${storageWorks() ? '' : `<div class="notice" style="margin-bottom:16px">${icon('info')}<div><b>Your browser is blocking storage.</b> Saved stories will disappear when you close this tab. Export them before you leave.</div></div>`}
    <div class="btnrow no-print" style="margin-bottom:22px">
      <button class="btn btn--primary" type="button" data-action="bank-md">${icon('download')}Download as notes (.md)</button>
      <button class="btn" type="button" data-action="bank-copy">${icon('copy')}Copy all</button>
      <button class="btn" type="button" data-action="bank-print">${icon('printer')}Print</button>
      <button class="btn btn--ghost" type="button" data-action="bank-backup">${icon('archive')}Backup</button>
      <button class="btn btn--ghost" type="button" data-action="bank-import">${icon('upload')}Restore</button>
    </div>
    ${importInput()}
    ${groups.map((g) => `<section class="bankgroup ${compClass(g.comp?.id)}">
      <h2>${g.comp ? `<span class="dot dot--${g.comp.id}"></span>${esc(g.comp.name)} <span class="small muted">${esc(g.comp.paper)}</span>` : 'Not linked to a spec point'}</h2>
      ${g.tags.map((tg) => `
        <div class="banktag">${tg.tag ? `${esc(S.topicById[tg.tag.topic]?.name || '')} › ${esc(tg.tag.name)} (${esc(tg.tag.ref)})` : ''}</div>
        ${tg.items.map(itemHtml).join('')}`).join('')}
    </section>`).join('')}
  </div>`;
}

function importInput() {
  return '<input type="file" id="bankFile" accept="application/json,.json" hidden>';
}

function itemHtml(it) {
  const t = S.tagById[(it.tags || [])[0]];
  return `<article class="bankitem ${compClass(t?.component)}">
    <div class="bankitem__top">
      <div>
        <h3><a href="#/story/${esc(it.id)}">${esc(it.title)}</a></h3>
        <div class="m">${esc(it.srcName || S.feedsById[it.source]?.name || it.source)} · ${esc(shortDate(it.date))} · <a href="${esc(it.url)}" target="_blank" rel="noopener">original ↗</a></div>
      </div>
      <button class="iconbtn no-print" type="button" data-action="bank-remove" data-id="${esc(it.id)}" aria-label="Remove from evidence bank" title="Remove">${icon('trash')}</button>
    </div>
    ${it.summary ? `<p class="small" style="color:var(--ink-2)">${esc(it.summary)}</p>` : ''}
    <textarea class="textarea" data-note="${esc(it.id)}" aria-label="My note" placeholder="My note: how would you use this in an essay?">${esc(it.note || '')}</textarea>
    <div class="tags">${(it.tags || []).map((id) => tagChip(id)).join('')}</div>
  </article>`;
}

function groupItems(items) {
  const byComp = new Map();
  for (const it of items) {
    const tag = S.tagById[(it.tags || [])[0]] || null;
    const compId = tag?.component || '_none';
    if (!byComp.has(compId)) byComp.set(compId, new Map());
    const byTag = byComp.get(compId);
    const key = tag?.id || '_none';
    if (!byTag.has(key)) byTag.set(key, []);
    byTag.get(key).push(it);
  }
  const order = S.spec.components.map((c) => c.id).concat('_none');
  const tagOrder = S.spec.tags.map((t) => t.id);
  return order.filter((c) => byComp.has(c)).map((c) => ({
    comp: S.compById[c] || null,
    tags: [...byComp.get(c).entries()]
      .sort((a, b) => tagOrder.indexOf(a[0]) - tagOrder.indexOf(b[0]))
      .map(([id, list]) => ({ tag: S.tagById[id] || null, items: list.sort((a, b) => (b.date || '').localeCompare(a.date || '')) })),
  }));
}

function markdown() {
  const lines = ['# My evidence bank', `Exported from Case in Point on ${shortDate(new Date().toISOString())}`, ''];
  for (const g of groupItems(bank.list())) {
    lines.push(`## ${g.comp ? `${g.comp.name} (${g.comp.paper})` : 'Other'}`, '');
    for (const tg of g.tags) {
      if (tg.tag) lines.push(`### ${S.topicById[tg.tag.topic]?.name || ''}: ${tg.tag.name} (${tg.tag.ref})`, '');
      for (const it of tg.items) {
        lines.push(`- **${it.title}**: ${it.srcName || it.source}, ${shortDate(it.date)}. ${it.url}`);
        if (it.summary) lines.push(`  - Summary: ${it.summary}`);
        if (it.note) lines.push(`  - My note: ${it.note}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function handle(action, el, rerender) {
  if (action === 'bank-remove') {
    bank.remove(el.dataset.id);
    toast('Removed from your evidence bank');
    rerender();
    return true;
  }
  if (action === 'bank-md') { downloadFile('my-politics-evidence.md', markdown(), 'text/markdown'); return true; }
  if (action === 'bank-copy') { copyText(markdown()).then((ok) => toast(ok ? 'Copied — paste into your notes' : 'Could not copy')); return true; }
  if (action === 'bank-print') { window.print(); return true; }
  if (action === 'bank-backup') {
    downloadFile(`case-in-point-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'case-in-point', version: 1, items: bank.list() }, null, 1), 'application/json');
    return true;
  }
  if (action === 'bank-import') {
    const input = document.getElementById('bankFile');
    if (!input) return true;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.items)) throw new Error('bad file');
        const merged = new Map(bank.list().map((i) => [i.id, i]));
        for (const it of data.items) if (it?.id && it?.title && it?.url) merged.set(it.id, it);
        bank.replaceAll([...merged.values()]);
        toast(`Restored ${plural(data.items.length, 'story', 'stories')}`);
        rerender();
      } catch {
        toast('That file is not a Case in Point backup');
      }
    };
    input.click();
    return true;
  }
  return false;
}
