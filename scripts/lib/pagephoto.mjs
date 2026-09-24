// Article photos. Many feeds don't include a picture, but nearly every news article names
// one for link previews: the og:image / twitter:image tags in the page's <head>. For stories
// without a feed photo, the updater reads the top of the article page to find that picture.
//
// It tries to be a polite visitor: it follows each site's robots.txt, asks one site for one
// page at a time with a short pause, reads only as far as </head>, and gives up quickly on
// slow sites. Logos, default share cards and pictures a site reuses for many stories are
// skipped, so those stories get the website's own drawing instead.
import { fetchText, mapLimit } from './fetch.mjs';
import { pickImage } from './images.mjs';
import { decodeEntities } from './text.mjs';

const BOT = 'caseinpointbot';
const META = /<meta\b[^>]*>/gi;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
// File names that mean "this site's standard share picture", not a news photo.
const GENERIC_NAME = /(logo|placeholder|fallback|favicon|apple-touch-icon|opengraph|og[-_]?image|image[-_]?og|share[-_]?(image|card|default)|social[-_]?(image|card|default)|site[-_]?image|default[-_]?(image|share|og|social|thumb)|(og|share|social)[-_]?default)/i;

/** The part of a page before </head> (or the first 200 KB if there's no </head>). */
export function headOf(html) {
  const s = String(html || '');
  const end = s.search(/<\/head\s*>/i);
  return end >= 0 ? s.slice(0, end) : s.slice(0, 200000);
}

/** Share-picture candidates from a page's <head>, most preferred first. */
export function shareImagesFromHtml(html, pageUrl) {
  const metas = [];
  for (const m of headOf(html).matchAll(META)) {
    const attrs = {};
    for (const a of m[0].matchAll(ATTR)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const key = (attrs.property || attrs.name || '').toLowerCase().trim();
    if (key && attrs.content) metas.push([key, decodeEntities(attrs.content.trim())]);
  }
  const all = (k) => metas.filter(([key]) => key === k).map(([, v]) => v);
  const width = Number(all('og:image:width')[0]) || undefined;
  const height = Number(all('og:image:height')[0]) || undefined;
  const out = [];
  const seen = new Set();
  const add = (raw, sized) => {
    let url;
    try { url = new URL(raw, pageUrl).toString(); } catch { return; }
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ from: 'page', url, ...(sized && width ? { width } : {}), ...(sized && height ? { height } : {}) });
  };
  for (const u of [...all('og:image'), ...all('og:image:url'), ...all('og:image:secure_url')]) add(u, true);
  for (const u of [...all('twitter:image'), ...all('twitter:image:src')]) add(u, false);
  return out;
}

function fileNameOf(u) {
  // Image proxies put the real picture in a ?url= parameter (e.g. Politico).
  const inner = u.searchParams.get('url');
  let p = u.pathname;
  if (inner) { try { p = new URL(inner).pathname; } catch { p = inner; } }
  try { p = decodeURIComponent(p); } catch { /* keep as is */ }
  return p.split('/').filter(Boolean).pop() || '';
}

/** Logos, default share cards and pictures with a publisher's logo stamped on them. */
export function isGenericShareImage(url) {
  let u;
  try { u = new URL(url); } catch { return true; }
  if (GENERIC_NAME.test(fileNameOf(u))) return true;
  if (/\/(logos?|icons?|brand|branding)\//i.test(u.pathname)) return true;
  // The Guardian adds its logo to share pictures with overlay-… parameters.
  if (/(^|&)overlay-/i.test(u.search.slice(1))) return true;
  return false;
}

/** BBC share pictures carry a "BBC News" badge; the same picture without it lives under cpsprodpb. */
export function unbrandedBbc(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname !== 'ichef.bbci.co.uk' || !/\/branded_[a-z]+\//.test(u.pathname)) return null;
  u.pathname = u.pathname.replace(/\/branded_[a-z]+\//, '/cpsprodpb/');
  return u.toString();
}

/** The best share picture on a page → { url, fallback? } or null. */
export function choosePagePhoto(html, pageUrl) {
  for (const c of shareImagesFromHtml(html, pageUrl)) {
    if (isGenericShareImage(c.url) || (c.width && c.width < 400)) continue;
    const plain = unbrandedBbc(c.url);
    const pic = pickImage([{ ...c, url: plain || c.url }]);
    if (!pic) continue;
    return plain ? { url: pic.url, fallback: pic.fallback || c.url } : pic;
  }
  return null;
}

// ---------- robots.txt ----------

/** robots.txt → [{ agents: ['*', …], rules: [{ allow, path }] }] */
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.replace(/#.*/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if ((key === 'allow' || key === 'disallow') && cur && val) cur.rules.push({ allow: key === 'allow', path: val });
  }
  return groups;
}

function ruleMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = '^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : '');
  return new RegExp(re).test(path);
}

/** Is `path` (path + query) allowed for this bot? Longest matching rule wins; Allow wins a tie. */
export function robotsAllows(groups, path, bot = BOT) {
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && bot.startsWith(a)));
  const use = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const r of use.flatMap((g) => g.rules)) {
    if (!ruleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r;
  }
  return best ? best.allow : true;
}

async function robotsFor(origin) {
  const res = await fetchText(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 300000, accept: 'text/plain,*/*;q=0.5' });
  if (res.status === 200) return parseRobots(res.text);
  if (res.status >= 400 && res.status < 500) return []; // no robots.txt: everything allowed
  return null; // server error or unreachable: leave this site alone this time
}

// ---------- The updater step ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Find share pictures for stories that have no photo. Changes the stories in place:
 *   img/img0  the picture (img0 = a fallback, e.g. the BBC picture with its badge)
 *   pg        1 = picture from the page, 0 = looked and there isn't a usable one,
 *             -1 = the page couldn't be read (tried once more on a later run)
 * `blocked` holds pictures already found to be reused across stories; new ones are added.
 */
export async function addPagePhotos(items, { canFetch = () => true, since = 0, max = 100, sites = 6, pauseMs = 300, blocked = new Set(), log = () => {} } = {}) {
  const stats = { tried: 0, found: 0, none: 0, failed: 0, robots: 0, reused: 0 };
  const todo = items
    .filter((i) => !i.img && i.pg !== 0 && i.pg !== 1 && Date.parse(i.date) >= since && canFetch(i))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, max);
  const bySite = new Map();
  for (const it of todo) {
    let origin;
    try { origin = new URL(it.url).origin; } catch { continue; }
    if (!bySite.has(origin)) bySite.set(origin, []);
    bySite.get(origin).push(it);
  }

  await mapLimit([...bySite], sites, async ([origin, list]) => {
    const robots = await robotsFor(origin);
    if (!robots) { stats.failed += list.length; return; }
    for (const it of list) {
      const u = new URL(it.url);
      if (!robotsAllows(robots, u.pathname + u.search)) { it.pg = 0; stats.robots++; continue; }
      const res = await fetchText(it.url, { stopAt: /<\/head\s*>/i });
      stats.tried++;
      if (!res.text) {
        const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
        it.pg = permanent || it.pg === -1 ? 0 : -1;
        stats.failed++;
      } else {
        const pic = choosePagePhoto(res.text, res.url || it.url);
        if (pic && !blocked.has(pic.url)) {
          it.img = pic.url;
          if (pic.fallback) it.img0 = pic.fallback;
          it.pg = 1;
          stats.found++;
        } else {
          it.pg = 0;
          stats.none++;
        }
      }
      await sleep(pauseMs);
    }
  });

  stats.reused = dropReusedPhotos(items, blocked);
  log(`Article photos: looked at ${stats.tried} pages, found ${stats.found}, none on ${stats.none}, ${stats.failed} unreadable, ${stats.robots} not allowed by robots.txt, ${stats.reused} dropped as reused.`);
  return stats;
}

/** A picture one site uses for two or more stories is a logo or a stock header: drop it. */
export function dropReusedPhotos(items, blocked = new Set()) {
  const groups = new Map();
  for (const it of items) {
    if (it.pg !== 1 || !it.img) continue;
    const key = `${it.source}|${it.img}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  let dropped = 0;
  for (const list of groups.values()) {
    const reused = list.length > 1 || blocked.has(list[0].img);
    if (!reused) continue;
    blocked.add(list[0].img);
    for (const it of list) {
      delete it.img;
      delete it.img0;
      it.pg = 0;
      dropped++;
    }
  }
  return dropped;
}
