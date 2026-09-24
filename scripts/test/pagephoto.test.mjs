import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shareImagesFromHtml, isGenericShareImage, unbrandedBbc, choosePagePhoto,
  parseRobots, robotsAllows, dropReusedPhotos, addPagePhotos,
} from '../lib/pagephoto.mjs';

const page = (head, body = '<p>Story</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test('share pictures: og:image first, any attribute order, entities and relative URLs', () => {
  const html = page(`
    <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
    <meta content="/media/2026/09/photo.jpg?w=1200&amp;h=630" property="og:image" />
    <meta property="og:image:width" content="1200"><meta property='og:image:height' content='630'>
    <meta property="og:title" content="Not a picture">`);
  const c = shareImagesFromHtml(html, 'https://news.example.com/politics/story-1');
  assert.deepEqual(c.map((x) => x.url), ['https://news.example.com/media/2026/09/photo.jpg?w=1200&h=630', 'https://cdn.example.com/tw.jpg']);
  assert.equal(c[0].width, 1200);
  assert.equal(c[0].height, 630);
  assert.equal(c[1].width, undefined);
});

test('share pictures: only the <head> is read', () => {
  const html = page('<title>x</title>', '<meta property="og:image" content="https://example.com/in-body.jpg">');
  assert.deepEqual(shareImagesFromHtml(html, 'https://example.com/a'), []);
});

test('generic share pictures are recognised', () => {
  assert.equal(isGenericShareImage('https://www.gov.uk/assets/static/govuk-opengraph-image-03837e1cec.png'), true);
  assert.equal(isGenericShareImage('https://bills.parliament.uk/images/UKParliament_Logo.png'), true);
  assert.equal(isGenericShareImage('https://example.org/wp-content/themes/site/img/default-share.jpg'), true);
  assert.equal(isGenericShareImage('https://example.org/assets/brand/card.jpg'), true);
  assert.equal(isGenericShareImage('https://i.guim.co.uk/img/media/abc/master/2000.jpg?width=1200&height=630&quality=85&auto=format&fit=crop&overlay-align=bottom%2Cleft&overlay-width=100p&overlay-base64=L2ltZy9zdGF0aWM&enable=upscale&s=0f1e'), true);
  // Real photos, including ones behind an image service with "default" in its path
  assert.equal(isGenericShareImage('https://www.politico.com/dims4/default/1a2b3c/2147483647/resize/1200x/quality/90/?url=https%3A%2F%2Fstatic.politico.com%2Fab%2Fcd%2Fsenate-vote.jpg'), false);
  assert.equal(isGenericShareImage('https://www.aljazeera.com/wp-content/uploads/2026/09/debt-default-talks.jpg?resize=1200%2C675'), false);
  assert.equal(isGenericShareImage('https://news.un.org/sites/news.un.org/files/styles/large/public/2026/09/ga-hall.jpg'), false);
});

test('BBC share pictures lose their badge, keeping the original as a fallback', () => {
  const branded = 'https://ichef.bbci.co.uk/news/1024/branded_news/6a95/live/fb5a0e70-photo.jpg';
  assert.equal(unbrandedBbc(branded), 'https://ichef.bbci.co.uk/news/1024/cpsprodpb/6a95/live/fb5a0e70-photo.jpg');
  assert.equal(unbrandedBbc('https://ichef.bbci.co.uk/news/1024/cpsprodpb/6a95/live/x.jpg'), null);
  const pic = choosePagePhoto(page(`<meta property="og:image" content="${branded}">`), 'https://www.bbc.co.uk/news/articles/c1');
  assert.deepEqual(pic, { url: 'https://ichef.bbci.co.uk/news/1024/cpsprodpb/6a95/live/fb5a0e70-photo.jpg', fallback: branded });
});

test('choosePagePhoto skips logos and small pictures, falling back to the twitter picture', () => {
  const html = page(`
    <meta property="og:image" content="https://www.gov.uk/assets/static/govuk-opengraph-image.png">
    <meta name="twitter:image" content="https://assets.publishing.service.gov.uk/media/abc/s960_pm-meeting.jpg">`);
  assert.deepEqual(choosePagePhoto(html, 'https://www.gov.uk/government/news/x'), { url: 'https://assets.publishing.service.gov.uk/media/abc/s960_pm-meeting.jpg' });
  const small = page('<meta property="og:image" content="https://example.com/thumb.jpg"><meta property="og:image:width" content="200">');
  assert.equal(choosePagePhoto(small, 'https://example.com/a'), null);
  assert.equal(choosePagePhoto(page('<title>No picture</title>'), 'https://example.com/a'), null);
  // Sky's image server is asked for a smaller size (rules in images.mjs still apply)
  const sky = page('<meta property="og:image" content="https://e3.365dm.com/26/09/1600x900/skynews-vote_7020.jpg?20260924">');
  assert.equal(choosePagePhoto(sky, 'https://news.sky.com/story/x').url, 'https://e3.365dm.com/26/09/768x432/skynews-vote_7020.jpg?20260924');
});

test('robots.txt: the right group, wildcards, longest match wins', () => {
  const robots = parseRobots(`
    # comment
    User-agent: GPTBot
    Disallow: /

    User-agent: *
    Disallow: /search
    Disallow: /*.pdf$
    Allow: /news/
    Disallow: /news/private/
    Sitemap: https://example.com/sitemap.xml`);
  assert.equal(robotsAllows(robots, '/news/articles/abc'), true);
  assert.equal(robotsAllows(robots, '/news/private/x'), false);
  assert.equal(robotsAllows(robots, '/search?q=vote'), false);
  assert.equal(robotsAllows(robots, '/files/report.pdf'), false);
  assert.equal(robotsAllows(robots, '/files/report.pdf?x=1'), true);
  assert.equal(robotsAllows(robots, '/about'), true);
  // A group for this bot replaces the * group
  const own = parseRobots('User-agent: *\nDisallow:\n\nUser-agent: CaseInPointBot\nDisallow: /politics/');
  assert.equal(robotsAllows(own, '/politics/story'), false);
  assert.equal(robotsAllows(own, '/world/story'), true);
  // Several agents can share one group
  const shared = parseRobots('User-agent: foo\nUser-agent: *\nDisallow: /');
  assert.equal(robotsAllows(shared, '/anything'), false);
  assert.equal(robotsAllows(parseRobots(''), '/anything'), true);
});

test('a picture reused by one site for several stories is dropped and remembered', () => {
  const items = [
    { id: 'a', source: 'ifg', img: 'https://ifg.example/header.jpg', pg: 1 },
    { id: 'b', source: 'ifg', img: 'https://ifg.example/header.jpg', pg: 1 },
    { id: 'c', source: 'ifg', img: 'https://ifg.example/unique.jpg', pg: 1 },
    { id: 'd', source: 'bbc', img: 'https://feed.example/photo.jpg' }, // from the feed: never touched
    { id: 'e', source: 'bbc', img: 'https://feed.example/photo.jpg' },
  ];
  const blocked = new Set();
  assert.equal(dropReusedPhotos(items, blocked), 2);
  assert.deepEqual(items.map((i) => i.img), [undefined, undefined, 'https://ifg.example/unique.jpg', 'https://feed.example/photo.jpg', 'https://feed.example/photo.jpg']);
  assert.deepEqual([...blocked], ['https://ifg.example/header.jpg']);
  assert.equal(items[0].pg, 0);
});

test('addPagePhotos: follows robots.txt, fills in photos, marks what it tried', async () => {
  const pages = {
    'https://one.example/robots.txt': [200, 'User-agent: *\nDisallow: /private/'],
    'https://one.example/news/a': [200, page('<meta property="og:image" content="https://img.one.example/a.jpg">')],
    'https://one.example/news/b': [200, page('<title>no picture</title>')],
    'https://two.example/robots.txt': [404, 'not found'],
    'https://two.example/story/c': [404, 'gone'],
    'https://two.example/story/d': [503, 'busy'],
  };
  const requested = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const [status, body] = pages[String(url)] || [404, ''];
    return new Response(body, { status, headers: { 'content-type': 'text/html' } });
  };
  try {
    const now = Date.parse('2026-09-24T06:00:00Z');
    const d = (h) => new Date(now - h * 3600000).toISOString();
    const items = [
      { id: 'a', source: 's1', url: 'https://one.example/news/a', date: d(1) },
      { id: 'b', source: 's1', url: 'https://one.example/news/b', date: d(2) },
      { id: 'p', source: 's1', url: 'https://one.example/private/p', date: d(3) },
      { id: 'c', source: 's2', url: 'https://two.example/story/c', date: d(4) },
      { id: 'd', source: 's2', url: 'https://two.example/story/d', date: d(5) },
      { id: 'has', source: 's2', url: 'https://two.example/story/has', date: d(6), img: 'https://x/y.jpg' },
      { id: 'old', source: 's2', url: 'https://two.example/story/old', date: d(24 * 40) },
      { id: 'off', source: 'off', url: 'https://two.example/story/off', date: d(1) },
    ];
    const stats = await addPagePhotos(items, { since: now - 30 * 86400000, pauseMs: 0, canFetch: (i) => i.source !== 'off' });
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    assert.equal(by.a.img, 'https://img.one.example/a.jpg');
    assert.equal(by.a.pg, 1);
    assert.equal(by.b.pg, 0);
    assert.equal(by.p.pg, 0); // not allowed by robots.txt, never requested
    assert.equal(by.c.pg, 0); // 404: don't ask again
    assert.equal(by.d.pg, -1); // 503: one more try next time
    assert.equal(by.has.pg, undefined);
    assert.equal(by.old.pg, undefined);
    assert.equal(by.off.pg, undefined);
    assert.ok(!requested.includes('https://one.example/private/p'));
    assert.ok(!requested.some((u) => /story\/(has|old|off)$/.test(u)));
    assert.deepEqual({ found: stats.found, none: stats.none, robots: stats.robots, failed: stats.failed }, { found: 1, none: 1, robots: 1, failed: 2 });

    // Next run: the 503 page is tried once more, then left alone
    pages['https://two.example/story/d'] = [500, 'still busy'];
    await addPagePhotos(items, { since: now - 30 * 86400000, pauseMs: 0 });
    assert.equal(by.d.pg, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
