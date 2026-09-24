// Photos: pick one picture per story from what the feed supplies and ask the
// publisher's image server for a sensible size (about 800px wide) where we know how.
//
// Candidates come from parse.mjs as { from, url, width?, height?, type?, medium? } where
// `from` is media:thumbnail | media:content | enclosure | content (an <img> in the article HTML).
// Pictures found inside article HTML are often charts or tracking pixels, so they are only
// used for feeds that opt in with "imageFromContent": true in config/feeds.json.
import { decodeEntities } from './text.mjs';

const TARGET = 800;
const MIN_WIDTH = 200;
const JUNK = /(pixel|tracking|beacon|spacer|blank\.(gif|png)|\b1x1\b|feedburner\.com\/~|stats\.wordpress\.com|pixel\.wp\.com|doubleclick|gravatar\.com|\/avatars?\/|\/logos?[/_.-]|\/icons?\/|\/emoji\/)/i;
const NOT_A_PHOTO = /\.(mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg|pdf|svg|gif)$/i;

/** <img> tags in an HTML string → candidates (first `max` only). */
export function imagesFromHtml(html, max = 3) {
  const out = [];
  if (!html) return out;
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(String(html))) && out.length < max) {
    const tag = m[0];
    const src = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i) || tag.match(/\ssrc\s*=\s*([^\s>]+)/i);
    if (!src) continue;
    const w = tag.match(/\swidth\s*=\s*["']?(\d+)/i);
    const h = tag.match(/\sheight\s*=\s*["']?(\d+)/i);
    out.push({ from: 'content', url: src[1], width: w ? Number(w[1]) : undefined, height: h ? Number(h[1]) : undefined });
  }
  return out;
}

/** Merge candidates that share a URL, keeping whatever size/type information any of them had. */
export function dedupeImages(list) {
  const byUrl = new Map();
  for (const c of list || []) {
    if (!c || !c.url) continue;
    const key = String(c.url).trim();
    const prev = byUrl.get(key);
    if (!prev) { byUrl.set(key, { ...c, url: key }); continue; }
    for (const [k, v] of Object.entries(c)) if (prev[k] == null && v != null) prev[k] = v;
  }
  return [...byUrl.values()];
}

function toHttpsUrl(raw) {
  let s = decodeEntities(String(raw || '').trim());
  if (!s) return null;
  if (s.startsWith('//')) s = 'https:' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  return u.protocol === 'https:' ? u : null;
}

/** Ask known image servers for ~800px. Returns { url, width, verified }. */
export function resizeImage(u, width) {
  const host = u.hostname;
  const out = new URL(u.toString());
  // Sky News: size is a path segment, e.g. /26/09/1920x1080/skynews-….jpg
  if (host === 'e3.365dm.com' && /\/\d{2,4}x\d{2,4}\//.test(out.pathname)) {
    out.pathname = out.pathname.replace(/\/\d{2,4}x\d{2,4}\//, '/768x432/');
    return { url: out.toString(), width: 768, verified: true };
  }
  // NPR (Brightspot): …/resize/5869x3913!/?url=…
  if (host === 'npr.brightspotcdn.com' && /\/resize\/[^/]+\//.test(out.pathname)) {
    out.pathname = out.pathname.replace(/\/resize\/[^/]+\//, `/resize/${TARGET}/`);
    return { url: out.toString(), width: TARGET, verified: true };
  }
  // Sanity CDN (SCOTUSblog): ?w=1200
  if (host === 'cdn.sanity.io' && (!width || width > TARGET)) {
    out.searchParams.set('w', String(TARGET));
    return { url: out.toString(), width: TARGET, verified: true };
  }
  // BBC: /ace/standard/240/… or /news/240/… (unverified here, so keep the original as a fallback)
  const bbc = host === 'ichef.bbci.co.uk' && out.pathname.match(/^\/(ace\/standard|ace\/ws|news)\/(\d{2,4})\//);
  if (bbc && Number(bbc[2]) < TARGET) {
    out.pathname = out.pathname.replace(/^\/(ace\/standard|ace\/ws|news)\/\d{2,4}\//, `/$1/${TARGET}/`);
    return { url: out.toString(), width: TARGET, verified: false };
  }
  return { url: u.toString(), width, verified: true };
}

/**
 * Choose the best photo. Prefers the smallest picture at least 600px wide, then pictures of
 * unknown size, then the largest smaller one. Returns { url, fallback? } or null.
 */
export function pickImage(candidates, { fromContent = false } = {}) {
  const ok = [];
  dedupeImages(candidates).forEach((c, order) => {
    if (c.from === 'content' && !fromContent) return;
    if (c.medium && String(c.medium).toLowerCase() !== 'image') return;
    if (c.type && !/^image\//i.test(c.type)) return;
    if (/image\/(gif|svg)/i.test(c.type || '')) return;
    const u = toHttpsUrl(c.url);
    if (!u) return;
    if (NOT_A_PHOTO.test(u.pathname) || JUNK.test(u.toString())) return;
    const w = Number(c.width) || 0;
    const h = Number(c.height) || 0;
    if ((w && w <= 2) || (h && h <= 2)) return;
    ok.push({ u, w, order });
  });
  if (!ok.length) return null;
  const tier = (c) => (c.w >= 600 ? 0 : c.w === 0 ? 1 : 2);
  ok.sort((a, b) => tier(a) - tier(b) || (tier(a) === 0 ? a.w - b.w : tier(a) === 2 ? b.w - a.w : a.order - b.order));
  for (const c of ok) {
    const r = resizeImage(c.u, c.w);
    if (r.width && r.width < MIN_WIDTH) continue;
    return r.verified || r.url === c.u.toString() ? { url: r.url } : { url: r.url, fallback: c.u.toString() };
  }
  return null;
}
