// Checks the optional AI-notes step against a fake API server (no key or network needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { enrichWithAI } from '../lib/ai.mjs';

const spec = JSON.parse(fs.readFileSync(new URL('../../config/spec.json', import.meta.url)));
const questions = JSON.parse(fs.readFileSync(new URL('../../config/questions.json', import.meta.url))).questions;

function mockServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      handler(JSON.parse(body), req, res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

test('adds validated AI notes and maps for/against to sides a/b', async () => {
  let seen;
  const srv = await mockServer((body, req, res) => {
    seen = { body, key: req.headers['x-api-key'], version: req.headers['anthropic-version'] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      content: [{ type: 'tool_use', name: 'record_story_notes', input: {
        summary: 'Labour MPs rebelled against the welfare bill, forcing ministers to offer concessions.',
        tags: ['parl-commons', 'not-a-real-tag'],
        angles: [
          { questionId: 'ukgov-parl-check', side: 'for', point: 'Shows backbenchers can force concessions.' },
          { questionId: 'made-up-question', side: 'against', point: 'Should be dropped.' },
        ],
        facts: [{ q: 'How many Labour MPs rebelled?', a: '49' }],
      } }],
    }));
  });
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${srv.address().port}`;
  const item = { id: 'x1', title: 'Labour MPs rebel over welfare bill', summary: '49 MPs voted against.', source: 'bbc-politics', date: '2026-09-23T10:00:00Z', tags: ['rel-execparl', 'parl-commons'], score: 8 };
  const stats = await enrichWithAI([item], { apiKey: 'test-key', maxItems: 5, spec, questions, feedsById: { 'bbc-politics': { name: 'BBC News' } }, now: new Date('2026-09-23T12:00:00Z'), log: () => {} });
  srv.close();
  delete process.env.ANTHROPIC_BASE_URL;

  assert.equal(stats.done, 1);
  assert.equal(seen.key, 'test-key');
  assert.equal(seen.version, '2023-06-01');
  assert.equal(seen.body.tool_choice.name, 'record_story_notes');
  assert.match(seen.body.messages[0].content, /Labour MPs rebel over welfare bill/);
  assert.deepEqual(item.ai.tags, ['parl-commons']);
  assert.equal(item.ai.angles.length, 1);
  assert.deepEqual(item.ai.angles[0], { q: 'ukgov-parl-check', side: 'a', point: 'Shows backbenchers can force concessions.' });
  assert.equal(item.ai.facts[0].a, '49');
  assert.equal(item.tags[0], 'parl-commons');
});

test('stops cleanly on an auth error and never throws', async () => {
  let calls = 0;
  const srv = await mockServer((body, req, res) => { calls++; res.writeHead(401); res.end('{"error":"bad key"}'); });
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${srv.address().port}`;
  const items = [1, 2, 3].map((n) => ({ id: `i${n}`, title: `Story ${n}`, summary: '', source: 's', date: '2026-09-23T10:00:00Z', tags: ['parl-commons'], score: 6 }));
  const stats = await enrichWithAI(items, { apiKey: 'bad', maxItems: 5, spec, questions, feedsById: {}, now: new Date(), log: () => {} });
  srv.close();
  delete process.env.ANTHROPIC_BASE_URL;
  assert.equal(calls, 1);
  assert.equal(stats.failed, 1);
  assert.ok(items.every((i) => !i.ai));
});
