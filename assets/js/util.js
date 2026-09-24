// Small helpers shared by every view.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const DAY = 86400000;
const fmtDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fmtDayYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function timeAgo(iso, now = Date.now()) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!t) return '';
  const diff = Math.max(0, now - t);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(diff / DAY);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  const date = new Date(t);
  return date.getFullYear() === new Date(now).getFullYear() ? fmtDay.format(date) : fmtDayYear.format(date);
}
export const longDate = (iso) => (iso ? fmtLong.format(new Date(iso)) : '');
export const shortDate = (iso) => (iso ? fmtDayYear.format(new Date(iso)) : '');
export const clock = (iso) => (iso ? fmtTime.format(new Date(iso)) : '');

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function downloadFile(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Wrap search terms found in (already escaped) text with <mark>. */
export function highlight(escapedText, terms) {
  if (!terms?.length) return escapedText;
  const safe = terms.filter((t) => t.length > 1).map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!safe.length) return escapedText;
  const re = new RegExp(`(${safe.join('|')})`, 'gi');
  // Only replace outside of HTML tags/entities.
  return escapedText.replace(/(&[a-z#0-9]+;)|([^&]+)/gi, (m, ent, txt) => (ent ? ent : txt.replace(re, '<mark>$1</mark>')));
}

export const plural = (n, one, many = one + 's') => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** history.pushState/replaceState can throw in sandboxed previews; fall back to plain hash navigation.
 *  Returns true if the URL changed silently (caller should re-route), false if a hashchange will fire. */
export function navPush(hash, state = null) {
  try { history.pushState(state, '', hash); return true; } catch { if (location.hash !== hash) location.hash = hash; return false; }
}
export function navReplace(hash) {
  try { history.replaceState(null, '', hash); return true; } catch { if (location.hash !== hash) location.hash = hash; return false; }
}
