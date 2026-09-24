// Text helpers for cleaning feed content: HTML stripping, entity decoding,
// boilerplate removal, URL canonicalisation and short ids.
import { createHash } from 'node:crypto';

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', minus: '−', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  hellip: '…', bull: '•', middot: '·', prime: '′', Prime: '″', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  pound: '£', euro: '€', yen: '¥', cent: '¢', dollar: '$', copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±',
  times: '×', divide: '÷', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', micro: 'µ',
  sect: '§', para: '¶', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', not: '¬', shy: '', zwnj: '', zwj: '', lrm: '', rlm: '',
  acute: '´', cedil: '¸', macr: '¯', uml: '¨', percnt: '%', num: '#', excl: '!', quest: '?', commat: '@', colon: ':',
  aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', auml: 'ä', Auml: 'Ä', atilde: 'ã', Atilde: 'Ã', aring: 'å', Aring: 'Å', aelig: 'æ', AElig: 'Æ',
  ccedil: 'ç', Ccedil: 'Ç', eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', ecirc: 'ê', Ecirc: 'Ê', euml: 'ë', Euml: 'Ë',
  iacute: 'í', Iacute: 'Í', igrave: 'ì', Igrave: 'Ì', icirc: 'î', Icirc: 'Î', iuml: 'ï', Iuml: 'Ï', ntilde: 'ñ', Ntilde: 'Ñ',
  oacute: 'ó', Oacute: 'Ó', ograve: 'ò', Ograve: 'Ò', ocirc: 'ô', Ocirc: 'Ô', ouml: 'ö', Ouml: 'Ö', otilde: 'õ', Otilde: 'Õ', oslash: 'ø', Oslash: 'Ø',
  uacute: 'ú', Uacute: 'Ú', ugrave: 'ù', Ugrave: 'Ù', ucirc: 'û', Ucirc: 'Û', uuml: 'ü', Uuml: 'Ü', yacute: 'ý', Yacute: 'Ý', yuml: 'ÿ', szlig: 'ß',
  scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', oelig: 'œ', OElig: 'Œ',
};

export function decodeEntities(s) {
  if (!s) return '';
  // Run twice to handle double-escaped feeds (e.g. "&amp;#039;").
  let out = String(s);
  for (let i = 0; i < 2; i++) {
    const before = out;
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return m;
        try { return String.fromCodePoint(n); } catch { return m; }
      }
      return Object.prototype.hasOwnProperty.call(NAMED, code) ? NAMED[code] : m;
    });
    if (out === before) break;
  }
  return out;
}

export function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|figure|figcaption|iframe|svg|picture|button|form)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** First <p> in an HTML blob that looks like real prose (used for feeds that dump whole pages). */
export function firstParagraph(html, minLen = 70) {
  if (!html) return '';
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(String(html)))) {
    const t = stripHtml(m[1]).replace(/\s+/g, ' ').trim();
    if (t.length >= minLen && /[.?!’"]/.test(t) && !/^(posted|published|updated|share|by )/i.test(t)) return t;
  }
  return '';
}

const BOILERPLATE = [
  /\bThe post\b[\s\S]{0,400}?\b(?:appeared first on|first appeared on)\b[\s\S]{0,160}$/i,
  /\s*Continue reading\.{0,3}\s*$/i,
  /\s*Read (?:more|the full (?:story|article))\.{0,3}\s*$/i,
  /\s*…?\s*Continued\s*$/i,
  /👉[^👈]*👈/gu,
  /[^.!?\n]*\bon your podcast app\b[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\b(?:sign up|subscribe) (?:to|for) (?:our|the) [\w\s]*newsletter\b[^.!?\n]*[.!?]?/gi,
];

export function cleanSummary(text, max = 320) {
  let t = String(text || '');
  for (const re of BOILERPLATE) t = t.replace(re, ' ');
  t = t.replace(/\[\s*(?:…|\.\.\.|&#8230;)\s*\]/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(t, max);
}

export function cleanTitle(text) {
  return decodeEntities(String(text || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(t, max) {
  t = String(t || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, '') + '…';
}

const TRACKING = /^(utm_[a-z_]+|at_[a-z_]+|ns_[a-z_]+|traffic_source|cmp|CMP|ocid|fbclid|gclid|mc_cid|mc_eid|ito|xtor|smid|s_cid|cmpid|intcmp|INTCMP|rss|feed|partner)$/i;

export function canonicalUrl(url) {
  if (!url) return '';
  let u;
  try { u = new URL(String(url).trim()); } catch { return String(url).trim(); }
  if (u.protocol === 'http:') u.protocol = 'https:';
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    const val = u.searchParams.get(key) || '';
    if (TRACKING.test(key) || ((key === 'ref' || key === 'src' || key === 'via') && /rss|feed/i.test(val))) {
      u.searchParams.delete(key);
    }
  }
  let s = u.toString();
  if (s.endsWith('?')) s = s.slice(0, -1);
  return s;
}

export function shortId(str) {
  return BigInt('0x' + createHash('sha1').update(String(str)).digest('hex').slice(0, 15)).toString(36);
}

const TZ = { BST: '+0100', CEST: '+0200', CET: '+0100', EEST: '+0300', EET: '+0200', AEST: '+1000', AEDT: '+1100', IST: '+0530' };

export function parseDate(s) {
  if (!s) return null;
  let str = String(s).trim().replace(/\b(BST|CEST|CET|EEST|EET|AEST|AEDT|IST)\b/, (m) => TZ[m]);
  let t = Date.parse(str);
  if (Number.isNaN(t)) {
    // "2026-09-23 10:00:00" → ISO
    t = Date.parse(str.replace(' ', 'T'));
  }
  return Number.isNaN(t) ? null : new Date(t);
}
