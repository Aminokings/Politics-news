// About: how the site works, honest caveats, and the health of every news source.
import { S } from '../store.js';
import { esc, icon, timeAgo, longDate } from '../util.js';
import { kindLabel } from '../ui.js';

export function render(el) {
  const idx = S.index;
  const status = Object.fromEntries((idx?.feeds || []).map((f) => [f.id, f]));
  el.innerHTML = `<div class="layout--narrow prose">
    <div class="pagehead"><div><div class="eyebrow">About</div><h1>How Case in Point works</h1></div></div>
    <p>Case in Point collects politics news from the sources below, usually every three hours. Each story is matched to the part of the <b>Pearson Edexcel A level Politics (9PL0)</b> spec it could be evidence for: UK Politics, UK Government, Political Ideas, the USA and Global Politics.</p>
    <h2>Using it well</h2>
    <ul>
      <li><b>Always open the original.</b> The site shows the headline and the publisher's short description. Read the full article before using it as evidence.</li>
      <li><b>Tags are automatic.</b> They come from keyword rules, so they can be wrong. The "Matched on" line under each spec link shows why a story was tagged.</li>
      <li><b>Balance your sources.</b> Mix news, analysis (e.g. the Constitution Unit, UK in a Changing Europe), explainers (the Commons and Lords Libraries) and official sources.</li>
      <li><b>Be precise in essays.</b> Use a date, a number or a name ("49 Labour MPs voted against the welfare bill in July 2025") rather than "recently".</li>
      <li><b>Your evidence bank lives in this browser.</b> Nothing is uploaded, so use Backup to keep a copy.</li>
    </ul>
    <h2>Last update</h2>
    <p>${idx ? `${esc(longDate(idx.generatedAt))} (${esc(timeAgo(idx.generatedAt, Date.now()))}). ${idx.counts.latest.toLocaleString('en-GB')} stories from the last ${idx.latestDays} days and ${idx.counts.total.toLocaleString('en-GB')} in the archive.${idx.ai?.enabled ? ' AI study notes are switched on.' : ''}` : 'No news has been fetched yet.'}</p>
    <h2>Sources</h2>
    <div class="srcgrid">
      ${S.feeds.filter((f) => f.enabled !== false).map((f) => {
        const st = status[f.id];
        const state = !st ? '<span class="st wait">Waiting for first update</span>' : st.ok ? `<span class="st ok">${icon('check')} Working${st.lastOk ? ` · checked ${esc(timeAgo(st.lastOk, Date.now()))}` : ''}</span>` : `<span class="st err">Not reachable at last check${st.lastOk ? ` · last worked ${esc(timeAgo(st.lastOk, Date.now()))}` : ''}</span>`;
        return `<div class="srccard"><b>${esc(f.name)}</b><span class="muted">${esc(f.section)} · ${esc(kindLabel(f.kind))}</span>${state}<a href="${esc(f.home)}" target="_blank" rel="noopener" class="small">${esc(new URL(f.home).hostname.replace(/^www\./, ''))} ↗</a></div>`;
      }).join('')}
    </div>
    <h2>Copyright and neutrality</h2>
    <p>Headlines and descriptions come from the publishers' public RSS feeds and link back to the original articles, which belong to their publishers. Sources were chosen to cover a range of outlets and perspectives. Case in Point isn't endorsed by, or affiliated with, Pearson Edexcel. The practice questions are written for this site and aren't official exam questions.</p>
  </div>`;
}
