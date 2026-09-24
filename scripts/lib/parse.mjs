// Parse RSS 2.0, RSS 1.0 (RDF) and Atom feeds into a common item shape:
// { title, link, guid, date, description, content, categories[], stage }
import { XMLParser } from 'fast-xml-parser';

const ARRAY_TAGS = new Set(['item', 'entry', 'category', 'link']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ARRAY_TAGS.has(String(name).split(':').pop()),
});

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return '';
}

/** Find the first key whose local name (after any prefix) matches one of names. */
function pick(obj, names) {
  if (!obj) return undefined;
  for (const n of names) if (obj[n] != null && text(obj[n]) !== '') return obj[n];
  const keys = Object.keys(obj);
  for (const n of names) {
    const local = n.includes(':') ? n.split(':').pop() : n;
    const k = keys.find((key) => key.includes(':') && key.split(':').pop() === local);
    if (k && obj[k] != null && text(obj[k]) !== '') return obj[k];
  }
  return undefined;
}

function categoriesOf(node) {
  const cats = [];
  for (const [k, v] of Object.entries(node)) {
    if (k.split(':').pop() !== 'category' && k !== 'category') continue;
    for (const c of Array.isArray(v) ? v : [v]) {
      const t = typeof c === 'object' ? (c['@_term'] || c['@_label'] || c['#text'] || '') : c;
      if (t) cats.push(String(t).trim());
    }
  }
  return [...new Set(cats)].filter(Boolean);
}

function findStage(node) {
  for (const [k, v] of Object.entries(node)) {
    const local = k.replace(/^@_/, '').split(':').pop();
    if (local.toLowerCase() === 'stage') {
      const t = typeof v === 'object' ? (v['@_name'] || v['#text'] || '') : v;
      if (t) return String(t).trim();
    }
  }
  return '';
}

function rssLink(item) {
  const links = item.link ?? [];
  for (const l of Array.isArray(links) ? links : [links]) {
    if (typeof l === 'string' && l.trim()) return l.trim();
    if (l && typeof l === 'object') {
      if (l['@_href']) return l['@_href'];
      if (l['#text']) return l['#text'];
    }
  }
  // atom:link inside an RSS item
  for (const [k, v] of Object.entries(item)) {
    if (k.endsWith(':link')) {
      for (const l of Array.isArray(v) ? v : [v]) if (l?.['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate')) return l['@_href'];
    }
  }
  return '';
}

function atomLink(entry) {
  const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : [];
  const alt = links.find((l) => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate') && (!l['@_type'] || /html/.test(l['@_type'])));
  const any = alt || links.find((l) => typeof l === 'object' && l['@_href']) || links[0];
  if (!any) return '';
  return typeof any === 'string' ? any : any['@_href'] || any['#text'] || '';
}

export function parseFeed(xml) {
  if (!xml || typeof xml !== 'string') throw new Error('Empty feed body');
  const trimmed = xml.replace(/^﻿/, '').trimStart();
  if (/^<!doctype html|^<html/i.test(trimmed)) throw new Error('Got an HTML page, not a feed');
  let doc;
  try {
    doc = parser.parse(trimmed);
  } catch (e) {
    throw new Error('XML parse error: ' + e.message);
  }

  // RSS 2.0
  if (doc.rss) {
    const channel = Array.isArray(doc.rss.channel) ? doc.rss.channel[0] : doc.rss.channel;
    const items = channel?.item || [];
    return { format: 'rss', items: items.map(rssItem) };
  }
  // RSS 1.0 / RDF
  const rdf = doc['rdf:RDF'] || doc.RDF;
  if (rdf) {
    const items = rdf.item || rdf['rss:item'] || [];
    return { format: 'rdf', items: (Array.isArray(items) ? items : [items]).map(rssItem) };
  }
  // Atom
  if (doc.feed) {
    const entries = doc.feed.entry || [];
    return { format: 'atom', items: entries.map(atomEntry) };
  }
  throw new Error('Unrecognised feed format');
}

function rssItem(item) {
  const guidNode = item.guid;
  const guid = text(guidNode);
  let link = rssLink(item);
  if (!link && /^https?:\/\//.test(guid)) link = guid;
  return {
    title: text(item.title),
    link,
    guid,
    date: text(pick(item, ['pubDate', 'dc:date', 'a10:updated', 'updated', 'published', 'dc:created', 'dcterms:modified'])),
    description: text(pick(item, ['description', 'summary', 'media:description', 'dc:description'])),
    content: text(pick(item, ['content:encoded', 'content'])),
    categories: categoriesOf(item),
    stage: findStage(item),
  };
}

function atomEntry(entry) {
  return {
    title: text(entry.title),
    link: atomLink(entry),
    guid: text(entry.id),
    date: text(entry.published || entry.updated || pick(entry, ['dc:date'])),
    description: text(entry.summary),
    content: text(entry.content),
    categories: categoriesOf(entry),
    stage: findStage(entry),
  };
}
