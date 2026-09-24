import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artFor, BY_TAG, SCENE_IDS, sceneSvg } from '../../assets/js/art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/spec.json'), 'utf8'));
const sprite = fs.readFileSync(path.join(ROOT, 'assets/art/scenes.svg'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
const symbols = [...sprite.matchAll(/<symbol id="art-([a-z0-9-]+)"/g)].map((m) => m[1]);

test('every spec tag has a drawing, and every drawing it names exists', () => {
  for (const t of spec.tags) {
    assert.ok(BY_TAG[t.id], `no drawing for tag ${t.id}`);
    for (const scene of BY_TAG[t.id]) assert.ok(symbols.includes(scene), `${t.id} → missing scene ${scene}`);
  }
  for (const id of SCENE_IDS) assert.ok(symbols.includes(id), `scene ${id} is not in scenes.svg`);
  for (const id of symbols) assert.ok(SCENE_IDS.includes(id), `scene ${id} is never used`);
});

test('every colour a drawing uses is set by all three looks', () => {
  const used = new Set([...sprite.matchAll(/var\(--(a-[a-z0-9]+)\)/g)].map((m) => m[1]));
  used.add('a-sky1').add('a-sky2'); // the sky is painted by CSS behind the drawing
  for (const look of ['day', 'dusk', 'night']) {
    const block = css.match(new RegExp(`\\.pal-${look}\\s*\\{([^}]*)\\}`));
    assert.ok(block, `no .pal-${look} in styles.css`);
    for (const v of used) assert.ok(block[1].includes(`--${v}:`), `.pal-${look} doesn't set --${v}`);
  }
});

test('a story always gets the same drawing; the choice varies across stories', () => {
  const it = { id: 'abc123', tags: ['us-presidency'], comp: 'usa' };
  assert.deepEqual(artFor(it), artFor({ ...it }));
  const picks = new Set();
  for (let i = 0; i < 60; i++) picks.add(artFor({ id: `story-${i}`, tags: ['us-presidency'] }).key);
  assert.ok(picks.size >= 6, `only ${picks.size} variations`);
  for (let i = 0; i < 60; i++) assert.ok(['whitehouse', 'press'].includes(artFor({ id: `s${i}`, tags: ['us-presidency'] }).scene));
});

test('fallbacks, forced looks and the Downing Street door', () => {
  assert.equal(artFor({ id: 'x', tags: [], comp: 'ukgov' }).scene, 'westminster');
  assert.equal(artFor({ id: 'x', tags: [] }).scene, 'press');
  for (let i = 0; i < 40; i++) {
    const a = artFor({ id: `lead-${i}`, tags: ['exec-pm'] }, ['dusk', 'night']);
    assert.ok(['dusk', 'night'].includes(a.look));
    if (a.scene === 'downing') assert.equal(a.mirror, false); // the "10" must read the right way round
  }
  assert.equal(artFor({ id: 'y', tags: ['gl-power'] }, 'day').look, 'day');
  assert.match(sceneSvg({ scene: 'globe', mirror: true }), /href="#art-globe" transform="matrix\(-1 0 0 1 1600 0\)"/);
});
