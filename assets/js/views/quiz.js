// Quick-fire quiz: "Spec Sort" (which spec point is this story evidence for?)
// and "Key facts" flashcards (curated facts + any AI facts from recent stories).
import { S, quizStore } from '../store.js';
import { esc, icon, shuffle, timeAgo } from '../util.js';
import { compClass, tagChip } from '../ui.js';

const ROUND = 10;
let game = null; // { mode, items, i, score, answered, choice }
let factComp = '';

function sortPool() {
  // Strongly tagged news/analysis stories make the fairest questions.
  return S.latest.filter((i) => i.tags.length && (i.score || 0) >= 5 && i.kind !== 'official' && i.why?.[i.tags[0]]?.length);
}

function factPool() {
  const curated = S.facts.map((f) => ({ ...f, key: `f:${f.id}` }));
  const fromAi = [];
  for (const it of S.latest) {
    (it.ai?.facts || []).forEach((f, n) => fromAi.push({ id: `${it.id}-${n}`, key: `a:${it.id}-${n}`, q: f.q, a: f.a, tags: it.tags, source: it.srcName, url: it.url, storyId: it.id, ai: true }));
  }
  const all = curated.concat(fromAi);
  return factComp ? all.filter((f) => (f.tags || []).some((t) => S.tagById[t]?.component === factComp)) : all;
}

export function render(el, sub) {
  if (sub === 'sort') return renderSort(el);
  if (sub === 'facts') return renderFacts(el);
  const store = quizStore.get();
  const known = Object.values(store.facts || {}).filter((f) => f.known >= 1).length;
  el.innerHTML = `<div class="quizwrap">
    <div class="pagehead"><div><div class="eyebrow">Quick-fire quiz</div><h1>Test yourself</h1>
    <p>Five-minute rounds you can do on the bus. Both modes use this month's news, so they change every day.</p></div></div>
    <div class="modes">
      <button class="mode" type="button" data-action="quiz-start" data-mode="sort">
        <span class="eyebrow">Mode 1</span><h2>Spec Sort</h2>
        <p>You get a real headline and choose which part of the spec it's evidence for. This trains the key exam skill of linking examples to topics.</p>
        <span class="small muted">${sortPool().length} stories available${store.best?.sort != null ? ` · best score ${store.best.sort}/${ROUND}` : ''}</span>
      </button>
      <button class="mode" type="button" data-action="quiz-start" data-mode="facts">
        <span class="eyebrow">Mode 2</span><h2>Key facts</h2>
        <p>Flashcards on the numbers, names and dates that make answers precise: election results, court cases, votes, summits.</p>
        <span class="small muted">${factPool().length} cards · ${known} marked as known</span>
      </button>
    </div>
  </div>`;
}

function newSortGame() {
  const pool = shuffle(sortPool()).slice(0, ROUND);
  return { mode: 'sort', items: pool, i: 0, score: 0, answered: false, choice: null, options: pool.map(makeOptions) };
}

function makeOptions(it) {
  const correct = it.tags[0];
  const comp = S.tagById[correct].component;
  // Distractors come from other topics so there's one clearly best answer.
  const others = shuffle(Object.values(S.tagById).filter((t) => !it.tags.includes(t.id) && t.topic !== S.tagById[correct].topic && !t.id.startsWith('ideas-')));
  const sameComp = others.filter((t) => t.component === comp).slice(0, 1);
  const rest = others.filter((t) => t.component !== comp && !sameComp.includes(t)).slice(0, 3 - sameComp.length);
  return shuffle([S.tagById[correct], ...sameComp, ...rest]).map((t) => t.id);
}

function renderSort(el) {
  if (!game || game.mode !== 'sort') game = newSortGame();
  if (!game.items.length) {
    el.innerHTML = `<div class="quizwrap"><a class="backlink" href="#/quiz">${icon('left')}Quiz</a><div class="notice">${icon('info')}<div>Not enough tagged stories yet. Check back after the next news update.</div></div></div>`;
    return;
  }
  if (game.i >= game.items.length) return renderSortDone(el);
  const it = game.items[game.i];
  const opts = game.options[game.i];
  const letters = 'ABCD';
  const correctSet = new Set(it.tags);
  el.innerHTML = `<div class="quizwrap">
    <a class="backlink" href="#/quiz">${icon('left')}Quiz</a>
    <div class="quizcard">
      <div class="qhead"><span>Spec Sort · question ${game.i + 1} of ${game.items.length}</span><span>Score ${game.score}</span></div>
      <div class="progress"><i style="width:${(game.i / game.items.length) * 100}%"></i></div>
      <div class="small muted">${esc(it.srcName)} · ${esc(timeAgo(it.t, S.now))}</div>
      <p class="prompt">${esc(it.title)}</p>
      ${it.summary ? `<p class="sub">${esc(it.summary)}</p>` : ''}
      <p class="small" style="font-weight:600">Which part of the spec is this best evidence for?</p>
      <div class="options">
        ${opts.map((id, n) => {
          const t = S.tagById[id];
          let cls = '';
          if (game.answered) cls = correctSet.has(id) ? 'is-right' : game.choice === id ? 'is-wrong' : '';
          return `<button class="option ${cls}" type="button" data-action="quiz-answer" data-value="${esc(id)}" ${game.answered ? 'disabled' : ''}>
            <span class="k">${letters[n]}</span><span><span class="dot dot--${t.component}" style="display:inline-block;margin-right:6px"></span>${esc(S.compById[t.component].short)}: ${esc(t.name)} <span class="muted small">(${esc(t.ref)})</span></span>
          </button>`;
        }).join('')}
      </div>
      ${game.answered ? feedbackHtml(it) : ''}
    </div>
  </div>`;
}

function feedbackHtml(it) {
  const right = it.tags.includes(game.choice);
  const why = it.why?.[it.tags[0]];
  return `<div class="feedback ${right ? 'feedback--good' : 'feedback--bad'}">
    <b>${right ? 'Correct!' : 'Not quite.'}</b>
    <span>Tagged as: <span class="tags" style="display:inline-flex">${it.tags.map((t) => tagChip(t, { asButton: false })).join(' ')}</span></span>
    ${why?.length ? `<span class="small">Clue: it mentions ${why.map((w) => `“${esc(w)}”`).join(', ')}.</span>` : ''}
    <div class="btnrow" style="margin-top:6px"><button class="btn btn--primary btn--sm" type="button" data-action="quiz-next">${game.i + 1 < game.items.length ? 'Next question' : 'See results'}${icon('right')}</button>
    <a class="btn btn--sm" href="#/story/${esc(it.id)}">Open story</a></div>
  </div>`;
}

function renderSortDone(el) {
  const store = quizStore.get();
  const best = Math.max(store.best?.sort ?? 0, game.score);
  store.best = { ...(store.best || {}), sort: best };
  quizStore.save(store);
  const msg = game.score >= 8 ? 'Excellent: you can link news to the spec with confidence.' : game.score >= 5 ? 'Good work. Look at the clues on the ones you missed.' : 'Keep practising. Linking examples to spec points gets quicker with time.';
  el.innerHTML = `<div class="quizwrap"><a class="backlink" href="#/quiz">${icon('left')}Quiz</a>
    <div class="quizcard" style="text-align:center;justify-items:center">
      <span class="eyebrow">Round complete</span>
      <span class="score">${game.score}/${game.items.length}</span>
      <p>${esc(msg)}</p>
      <p class="small muted">Best score: ${best}/${ROUND}</p>
      <div class="btnrow"><button class="btn btn--primary" type="button" data-action="quiz-start" data-mode="sort">${icon('rotate')}Play again</button><a class="btn" href="#/quiz">Other modes</a></div>
    </div></div>`;
}

// ---------- Flashcards ----------
function newFactGame() {
  const store = quizStore.get();
  const stats = store.facts || {};
  // Unknown cards first, then the ones you've seen least.
  const pool = shuffle(factPool()).sort((a, b) => (stats[a.key]?.known || 0) - (stats[b.key]?.known || 0));
  return { mode: 'facts', items: pool.slice(0, ROUND), i: 0, score: 0, answered: false };
}

function renderFacts(el) {
  if (!game || game.mode !== 'facts') game = newFactGame();
  const comps = S.spec.components.filter((c) => c.id !== 'ideas');
  const chips = `<div class="chips" role="group" aria-label="Paper">
    <button class="chip" type="button" data-action="fact-comp" data-value="" aria-pressed="${!factComp}">All</button>
    ${comps.map((c) => `<button class="chip" type="button" data-action="fact-comp" data-value="${c.id}" aria-pressed="${factComp === c.id}"><span class="dot dot--${c.id}"></span>${esc(c.short)}</button>`).join('')}</div>`;
  if (!game.items.length) {
    el.innerHTML = `<div class="quizwrap"><a class="backlink" href="#/quiz">${icon('left')}Quiz</a>${chips}<div class="notice">${icon('info')}<div>No cards for this paper yet.</div></div></div>`;
    return;
  }
  if (game.i >= game.items.length) {
    el.innerHTML = `<div class="quizwrap"><a class="backlink" href="#/quiz">${icon('left')}Quiz</a>
      <div class="quizcard" style="text-align:center;justify-items:center"><span class="eyebrow">Deck complete</span><span class="score">${game.score}/${game.items.length}</span><p>Cards you didn't know will come up first next time.</p>
      <div class="btnrow"><button class="btn btn--primary" type="button" data-action="quiz-start" data-mode="facts">${icon('rotate')}Next ${ROUND} cards</button><a class="btn" href="#/quiz">Other modes</a></div></div></div>`;
    return;
  }
  const f = game.items[game.i];
  const tag = (f.tags || [])[0];
  el.innerHTML = `<div class="quizwrap">
    <a class="backlink" href="#/quiz">${icon('left')}Quiz</a>
    ${chips}
    <div class="quizcard ${compClass(S.tagById[tag]?.component)}">
      <div class="qhead"><span>Key facts · card ${game.i + 1} of ${game.items.length}</span><span>Known ${game.score}</span></div>
      <div class="progress"><i style="width:${(game.i / game.items.length) * 100}%"></i></div>
      <div class="flash">
        <div class="tags" style="justify-content:center">${(f.tags || []).slice(0, 2).map((t) => tagChip(t, { asButton: false })).join('')}${f.ai ? `<span class="badge badge--ai">${icon('sparkles')}from a recent story</span>` : ''}</div>
        <p class="prompt">${esc(f.q)}</p>
        ${game.answered
          ? `<p class="answer">${esc(f.a)}</p>
             <p class="small muted">Source: ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.source)}</a>` : esc(f.source || '')}${f.asOf ? ` · as of ${esc(f.asOf)}` : ''}</p>
             <div class="btnrow" style="justify-content:center"><button class="btn" type="button" data-action="fact-mark" data-value="0">${icon('x')}Didn't know it</button><button class="btn btn--primary" type="button" data-action="fact-mark" data-value="1">${icon('check')}Knew it</button></div>`
          : `<div class="btnrow" style="justify-content:center"><button class="btn btn--primary" type="button" data-action="fact-reveal">Show answer</button></div>`}
      </div>
    </div>
  </div>`;
}

export function handle(action, el, rerender, go) {
  if (action === 'quiz-start') {
    game = el.dataset.mode === 'sort' ? newSortGame() : newFactGame();
    go(`#/quiz/${el.dataset.mode}`);
    return true;
  }
  if (action === 'quiz-answer' && game && !game.answered) {
    game.choice = el.dataset.value;
    game.answered = true;
    if (game.items[game.i].tags.includes(game.choice)) game.score++;
    rerender();
    return true;
  }
  if (action === 'quiz-next' && game) {
    game.i++; game.answered = false; game.choice = null;
    rerender();
    return true;
  }
  if (action === 'fact-reveal' && game) { game.answered = true; rerender(); return true; }
  if (action === 'fact-mark' && game) {
    const f = game.items[game.i];
    const store = quizStore.get();
    store.facts = store.facts || {};
    const s = store.facts[f.key] || { seen: 0, known: 0 };
    s.seen++;
    if (el.dataset.value === '1') { s.known++; game.score++; } else s.known = 0;
    store.facts[f.key] = s;
    quizStore.save(store);
    game.i++; game.answered = false;
    rerender();
    return true;
  }
  if (action === 'fact-comp') { factComp = el.dataset.value; game = newFactGame(); rerender(); return true; }
  return false;
}
