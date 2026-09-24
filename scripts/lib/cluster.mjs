// Groups near-identical stories from different outlets so the feed shows one card
// with "also covered by …" instead of three copies of the same headline.
import { normaliseText } from '../../assets/js/lib/keywords.js';

const STOP = new Set(('a an and are as at be been but by for from has have he her his how in into is it its of on or over says said ' +
  'she so than that the their them they this to up was were what when where which who why will with after about new more ' +
  'could would should may might can amid live latest watch video analysis explainer update updates').split(' '));

function stem(w) {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function titleTokens(title) {
  const words = normaliseText(title)
    .toLowerCase()
    .replace(/[^a-z0-9£$%'\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((w) => w.replace(/'s$/, '').replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
  return new Set(words);
}

export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  const jaccard = inter / union;
  const overlap = inter / Math.min(a.size, b.size);
  // Same story if the wording is very close, or the shorter headline is almost contained in the longer one.
  if (jaccard >= 0.5) return jaccard;
  if (overlap >= 0.8 && inter >= 4) return overlap * 0.9;
  return jaccard;
}

export const SAME_STORY = 0.5;
export const WINDOW_MS = 48 * 3600 * 1000;
