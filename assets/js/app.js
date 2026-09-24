// Case in Point — app entry: loads data, routes between views, handles shared actions.
import { S, loadAll, bank, themeStore } from './store.js';
import { esc, icon, toast, copyText, debounce, navPush, navReplace } from './util.js';
import * as feed from './views/feed.js';
import { renderStory, copyLink } from './views/story.js';
import * as questions from './views/questions.js';
import * as spec from './views/spec.js';
import * as quiz from './views/quiz.js';
import * as bankView from './views/bank.js';
import * as about from './views/about.js';

const $ = (sel) => document.querySelector(sel);
const main = $('#main');
const overlay = $('#overlay');
const drawer = $('#drawer');

let baseHash = null;   // last non-story route that was rendered
let baseView = null;
let openStoryId = null;
let lastFocus = null;

function parse(hash) {
  const h = hash && hash !== '#' ? hash : '#/';
  const path = h.replace(/^#/, '').split('?')[0];
  return { h, parts: path.split('/').filter(Boolean) };
}

function setNav(view) {
  const map = { '': 'feed', questions: 'questions', spec: 'spec', quiz: 'quiz', bank: 'bank' };
  const active = map[view] ?? '';
  document.querySelectorAll('.mainnav a').forEach((a) => {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function titleFor(view) {
  return { '': 'News', questions: 'Questions', spec: 'Spec map', quiz: 'Quiz', bank: 'My evidence', about: 'About' }[view] || 'News';
}

function renderBase(h, parts, { force = false } = {}) {
  const view = parts[0] || '';
  if (!force && h === baseHash) return;
  const viewChanged = view !== baseView;
  if (viewChanged) main.innerHTML = '';
  baseHash = h;
  baseView = view;
  setNav(view);
  document.title = `${titleFor(view)} · Case in Point`;
  switch (view) {
    case '': feed.render(main, h); break;
    case 'questions': parts[1] ? questions.renderDetail(main, decodeURIComponent(parts[1])) : questions.renderList(main); break;
    case 'spec': spec.render(main); break;
    case 'quiz': quiz.render(main, parts[1]); break;
    case 'bank': bankView.render(main); break;
    case 'about': about.render(main); break;
    default: main.innerHTML = `<div class="empty"><h2>Page not found</h2><p><a class="btn" href="#/">Back to the news</a></p></div>`;
  }
  if (viewChanged) window.scrollTo(0, 0);
}

function rerenderBase() {
  const { h, parts } = parse(baseHash || '#/');
  renderBase(h, parts, { force: true });
}

async function openOverlay(id) {
  if (overlay.hidden) {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  if (openStoryId === id) return;
  openStoryId = id;
  await renderStory(drawer, id);
  drawer.scrollTop = 0;
  drawer.focus({ preventScroll: true });
}

function hideOverlay() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  openStoryId = null;
  document.body.style.overflow = '';
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

function closeStory() {
  const depth = history.state?.storyDepth || 0;
  if (depth > 0) {
    history.go(-depth);
  } else {
    hideOverlay();
    if (navReplace(baseHash || '#/') && !baseHash) route();
  }
}

function route() {
  if (!S.ready) return;
  const { h, parts } = parse(location.hash);
  if (parts[0] === 'story' && parts[1]) {
    if (!baseHash) renderBase('#/', []);
    openOverlay(decodeURIComponent(parts[1]));
    return;
  }
  hideOverlay();
  renderBase(h, parts);
}

function go(hash) {
  if (location.hash === hash) { rerenderBase(); return; }
  if (navPush(hash)) route();
}

// ---------- Shared actions ----------
function refreshSaveButtons(id) {
  const saved = bank.has(id);
  document.querySelectorAll(`.savebtn[data-id="${CSS.escape(id)}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(saved));
    b.title = saved ? 'Saved — click to remove' : 'Save to my evidence bank';
    b.setAttribute('aria-label', `${saved ? 'Remove from' : 'Save to'} my evidence bank`);
  });
  updateBankCount();
}

function updateBankCount() {
  const n = bank.count();
  const el = $('#bankCount');
  if (!el) return;
  el.hidden = n === 0;
  el.textContent = n > 99 ? '99+' : String(n);
}

async function refreshDrawer({ focusNote = false } = {}) {
  if (!openStoryId) return;
  const top = drawer.scrollTop;
  await renderStory(drawer, openStoryId);
  drawer.scrollTop = top;
  if (focusNote) drawer.querySelector('textarea[data-note]')?.focus({ preventScroll: true });
}

function toggleSave(id, fromDrawer) {
  const it = S.itemById.get(id);
  if (bank.has(id)) {
    bank.remove(id);
    toast('Removed from your evidence bank');
  } else if (it) {
    const ok = bank.add(it);
    toast(ok ? 'Saved to your evidence bank' : 'Saved for this visit (your browser is blocking storage)');
  }
  refreshSaveButtons(id);
  if (openStoryId === id) refreshDrawer({ focusNote: fromDrawer && bank.has(id) });
  if (baseView === 'bank' || baseView === 'spec') rerenderBase();
}

function effectiveTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

document.addEventListener('click', (e) => {
  // Story links: push a history entry that remembers how deep we are in stories.
  const link = e.target.closest('a[href^="#/story/"]');
  if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    const depth = (history.state?.storyDepth || 0) + 1;
    if (navPush(link.getAttribute('href'), { storyDepth: depth })) route();
    return;
  }
  // Other in-app links: route them ourselves (also keeps sandboxed previews working).
  const hashLink = e.target.closest('a[href^="#"]');
  if (hashLink && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    const href = hashLink.getAttribute('href');
    e.preventDefault();
    if (href === '#main') { main.focus(); return; }
    if (!href.startsWith('#/')) {
      // In-page anchor, e.g. a section of the front page
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      if (target) {
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
      return;
    }
    if (!overlay.hidden && !href.startsWith('#/story/')) hideOverlay();
    if (location.hash === href) { rerenderBase(); return; }
    if (navPush(href)) route();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'toggle-save': e.preventDefault(); toggleSave(el.dataset.id, Boolean(el.closest('#drawer'))); return;
    case 'close-overlay': closeStory(); return;
    case 'copy-link': copyLink(el.dataset.id); return;
    case 'copy-text': copyText(el.dataset.text).then((ok) => toast(ok ? 'Copied' : 'Could not copy')); return;
    case 'focus-search':
      if (baseView !== '' || !overlay.hidden) { if (!overlay.hidden) hideOverlay(); go('#/'); }
      setTimeout(() => feed.focusSearch(), 30);
      return;
    case 'toggle-theme': {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      themeStore.set(next);
      return;
    }
    default:
      if (baseView === '' && feed.handle(action, el)) return;
      if (questions.handle(action, el, rerenderBase)) return;
      if (spec.handle(action, el, rerenderBase)) return;
      if (quiz.handle(action, el, rerenderBase, go)) return;
      if (bankView.handle(action, el, () => { rerenderBase(); updateBankCount(); })) return;
  }
});

document.addEventListener('change', (e) => {
  if (baseView === '' && feed.handleChange(e.target)) return;
});

const saveNote = debounce((id, value) => bank.setNote(id, value), 400);
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('textarea[data-note]')) saveNote(t.dataset.note, t.value);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); closeStory(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (e.key === '/' && !typing && overlay.hidden) {
    e.preventDefault();
    if (baseView !== '') go('#/');
    setTimeout(() => feed.focusSearch(), 30);
  }
});

// Story photos load from the publishers' sites. If one fails, try its fallback size once,
// then drop it so the coloured topic tile underneath shows instead.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.parentElement?.classList.contains('media')) return;
  if (img.dataset.fb && !img.dataset.tried) { img.dataset.tried = '1'; img.src = img.dataset.fb; return; }
  img.parentElement.classList.add('media--none');
  img.remove();
}, true);

window.addEventListener('cip:basehash', (e) => { baseHash = e.detail; });
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);

// ---------- Boot ----------
(async function boot() {
  try {
    await loadAll();
  } catch (e) {
    main.innerHTML = `<div class="notice">${icon('info')}<div><b>Couldn't load the site's settings.</b> ${esc(e.message)}. If you opened index.html straight from your computer, run <code>npm run dev</code> and use the address it prints.</div></div>`;
    return;
  }
  updateBankCount();
  route();
  // Offline support + "install as app" (only on the live https site).
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.__CIP_PREVIEW__) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
