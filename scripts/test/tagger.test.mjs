// Sanity checks for the keyword tagger. If you edit config/spec.json, run `npm test`
// to make sure the core cases still work. Each case passes if ANY expected tag is found.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTagger } from '../lib/tagger.mjs';

const spec = JSON.parse(fs.readFileSync(new URL('../../config/spec.json', import.meta.url)));
const tag = buildTagger(spec);
const UK = { region: 'uk' };
const US = { region: 'us' };
const WORLD = { region: 'intl' };

const cases = [
  // UK Politics & Government
  [UK, 'Burnham faces Labour backlash over welfare plans as MPs threaten rebellion', '', ['parl-commons', 'rel-execparl']],
  [UK, 'Reform UK overtakes Labour in latest YouGov poll', '', ['pp-minor', 'vb-voting']],
  [UK, 'Supreme Court to hear Palestine Action appeal', 'The government proscribed the group in July 2025.', ['rel-judiciary', 'dp-rights']],
  [UK, 'Lords defeat government over votes at 16 plan', 'Peers voted to amend the Representation of the People Bill.', ['parl-lords', 'dp-franchise']],
  [UK, 'Plaid Cymru minority government survives Senedd budget vote', '', ['con-devolution']],
  [UK, 'Minister resigns after breaching ministerial code', '', ['exec-resp']],
  [UK, 'Badenoch pledges to take UK out of the ECHR', 'The Conservative leader told the Tory conference…', ['rel-sovereignty', 'dp-rights', 'pp-established']],
  [UK, 'Holborn and St Pancras by-election: Greens hopeful of shock win', '', ['es-systems', 'pp-minor']],
  [UK, 'Ofcom finds GB News breached due impartiality rules', '', ['vb-media']],
  [UK, 'UK and EU agree youth experience scheme in reset deal', '', ['rel-eu']],
  [UK, 'Labour conference: Burnham promises to bring water into public ownership', '', ['pp-established', 'ideas-socialism']],
  [UK, 'Farmers march on Westminster over inheritance tax', 'The NFU says the campaign will continue.', ['dp-pressure']],
  [UK, 'Starmer to stand down as MP, triggering Holborn by-election', '', ['es-systems']],
  [UK, 'Select committee grills Home Secretary over asylum backlog', '', ['parl-commons']],
  // USA
  [US, 'Senate Republicans block Democratic bill to avert shutdown', '', ['us-congress']],
  [US, 'Supreme Court agrees to hear challenge to assault weapons bans', 'The justices will consider the Second Amendment case in the fall.', ['us-scotus', 'us-rights']],
  [US, 'Trump signs executive order targeting mail-in voting', '', ['us-presidency', 'us-elections']],
  [US, 'Missouri voters to decide redistricting referendum in November', '', ['us-elections']],
  [US, 'AIPAC-backed super PAC pours millions into House primaries', '', ['us-groups', 'us-elections']],
  [US, 'Governor Newsom sues administration over National Guard deployment', '', ['us-federalism']],
  [US, 'Freedom Caucus splits with GOP leaders over spending bill', '', ['us-congress', 'us-parties']],
  // Global
  [WORLD, 'UN Security Council fails to agree Hormuz resolution after Russian veto', '', ['gl-un-nato']],
  [WORLD, 'Nato allies agree new air defence plan after Russian drone incursion', '', ['gl-un-nato']],
  [WORLD, 'COP31: Negotiators clash over fossil fuel phase-out in Antalya', '', ['gl-environment']],
  [WORLD, 'ICC confirms trial date for Duterte', '', ['gl-rights']],
  [WORLD, 'EU adopts new sanctions package against Russia', '', ['gl-regionalism']],
  [WORLD, 'Xi and Trump agree to extend trade truce', 'The US-China deal delays new tariffs.', ['gl-power', 'gl-economic']],
  [WORLD, 'IMF warns global growth will slow as tariffs bite', '', ['gl-economic']],
  [WORLD, 'Sudan: UN says famine spreading in Darfur as RSF advances', '', ['gl-rights']],
  [WORLD, 'BRICS leaders call for reform of global institutions', '', ['gl-power']],
];

for (const [feed, title, summary, expected] of cases) {
  test(`tags: ${title}`, () => {
    const r = tag({ title, summary }, feed);
    const got = r.tags.map((t) => t.id);
    assert.ok(expected.some((e) => got.includes(e)), `expected one of ${expected.join(', ')} — got [${got.join(', ')}]`);
  });
}

const negatives = [
  [WORLD, 'Infantino says he is open to talks about FIFA reform', ''],
  [WORLD, "Wall Street's Nasdaq hits all-time high as AI frenzy gathers pace", 'Investors shrug off the Iran war.'],
  [WORLD, 'Tobacco use can undermine fertility, UN health agency warns', ''],
];
for (const [feed, title, summary] of negatives) {
  test(`does not tag: ${title}`, () => {
    const r = tag({ title, summary }, feed);
    assert.equal(r.tags.length, 0, `unexpected tags: ${r.tags.map((t) => t.id).join(', ')}`);
  });
}

test('UK story mentioning Trump is not tagged as US politics', () => {
  const r = tag({ title: 'Burnham defends UK aid budget after Trump criticism', summary: 'The Prime Minister told MPs…' }, UK);
  const got = r.tags.map((t) => t.id);
  assert.ok(!got.some((t) => t.startsWith('us-') && t !== 'us-compare'), got.join(', '));
});

test('US Supreme Court story is not tagged as the UK Supreme Court', () => {
  const r = tag({ title: 'Supreme Court strikes down tariffs in 6-3 ruling', summary: 'Chief Justice Roberts wrote for the majority.' }, US);
  const got = r.tags.map((t) => t.id);
  assert.ok(got.includes('us-scotus'));
  assert.ok(!got.includes('rel-judiciary'));
});
