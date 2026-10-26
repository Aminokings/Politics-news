import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, notesHtml } from '../../assets/js/lib/markdown.js';
import { SCENE_IDS } from '../../assets/js/art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('markdown: paragraphs, emphasis, links, lists and headings', () => {
  const { html } = renderMarkdown('First *italic* and **bold** with `code`.\n\n## Sources\n\n### Primary\n\n- A [link](https://example.com/a_b?x=1&y=2)\n\n- <https://example.org/page>\n\n1. one\n2. two\n\n> quoted\n\n---');
  assert.match(html, /<p>First <em>italic<\/em> and <strong>bold<\/strong> with <code>code<\/code>\.<\/p>/);
  assert.match(html, /<h2>Sources<\/h2>\n<h3>Primary<\/h3>/);
  assert.match(html, /<ul><li>A <a href="https:\/\/example\.com\/a_b\?x=1&amp;y=2" target="_blank" rel="noopener">link<\/a><\/li><li><a href="https:\/\/example\.org\/page"[^>]*>https:\/\/example\.org\/page<\/a><\/li><\/ul>/);
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
  assert.match(html, /<hr>/);
});

test('markdown: escapes HTML and refuses unsafe links', () => {
  const { html } = renderMarkdown('<script>alert(1)</script> [click](javascript:alert(1)) and \\*not italic\\*');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/href="javascript/i.test(html));
  assert.match(html, /\*not italic\*/);
});

test('markdown: footnotes are numbered in reading order with links both ways', () => {
  const md = 'One.[^b] Two.[^a] One again.[^b] Missing.[^z]\n\n[^a]: Note A with *italic*.\n[^b]: Note B,\n    which continues.';
  const { html, notes, words } = renderMarkdown(md);
  assert.deepEqual(notes.map((n) => [n.n, n.id]), [[1, 'b'], [2, 'a']]);
  assert.match(html, /One\.<sup class="fnref" id="fnref-1"><a href="#fn-1" title="Note B, which continues\." aria-label="Note 1">1<\/a><\/sup>/);
  assert.match(html, /Two\.<sup class="fnref" id="fnref-2"><a href="#fn-2"/);
  assert.ok(html.includes('[^z]'), 'a reference with no note stays as typed');
  assert.equal(words, 5);
  const list = notesHtml(notes);
  assert.match(list, /<li id="fn-1">Note B, which continues\. <a class="fnback" href="#fnref-1"/);
  assert.match(list, /<li id="fn-2">Note A with <em>italic<\/em>\./);
});

test('every essay in config/essays.json is complete and renders cleanly', () => {
  const cfg = JSON.parse(read('config/essays.json'));
  const spec = JSON.parse(read('config/spec.json'));
  const tags = new Set(spec.tags.map((t) => t.id));
  const questions = new Set(JSON.parse(read('config/questions.json')).questions.map((q) => q.id));
  const ids = new Set();
  assert.ok(cfg.essays.length > 0);
  for (const e of cfg.essays) {
    assert.match(e.id, /^[a-z0-9-]+$/, 'id: lower-case letters, numbers and dashes');
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    for (const k of ['title', 'author', 'summary', 'file']) assert.ok(e[k], `${e.id}: missing ${k}`);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const t of e.tags) assert.ok(tags.has(t), `${e.id}: unknown tag ${t}`);
    for (const q of e.questions || []) assert.ok(questions.has(q), `${e.id}: unknown question ${q}`);
    if (e.art) assert.ok(SCENE_IDS.includes(e.art), `${e.id}: unknown drawing ${e.art}`);
    if (e.look) assert.ok(['day', 'dusk', 'night'].includes(e.look));
    const md = read(e.file);
    const { html, notes, words } = renderMarkdown(md);
    const refs = [...html.matchAll(/class="fnref"/g)].length;
    assert.equal(refs, [...md.matchAll(/\[\^[^\]\s]+\](?!:)/g)].length, `${e.id}: every reference has a note`);
    assert.ok(notes.length > 0 || !md.includes('[^'), `${e.id}: notes`);
    assert.ok(!/\[\^[^\]]+\]/.test(html), `${e.id}: no unmatched footnote markers`);
    assert.ok(!/<u>|\*\*/.test(html), `${e.id}: no leftover formatting from Word`);
    assert.ok(words > 200, `${e.id}: has a body`);
  }
});

test('the prisoner voting essay keeps its 1,000 words and 17 notes', () => {
  const { notes, words } = renderMarkdown(read('essays/prisoner-voting.md'));
  assert.equal(words, 1000);
  assert.equal(notes.length, 17);
});
