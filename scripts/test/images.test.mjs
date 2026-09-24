import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../lib/parse.mjs';
import { pickImage, imagesFromHtml, resizeImage } from '../lib/images.mjs';
import { cleanTitle } from '../lib/text.mjs';

// Shapes copied from the real feeds (September 2026).
const SKY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item>
  <title>&lt;a href='https://news.sky.com/story/politics-latest-12593360?postid=12503049#liveblog-body'&gt;Long-term benefits claimants could be banned from buying alcohol and cigarettes under Tory plans&lt;/a&gt;</title>
  <link>https://news.sky.com/story/long-term-benefits-claimants-could-be-banned-13591237</link>
  <description/>
  <pubDate>Thu, 24 Sep 2026 02:27:00 +0100</pubDate>
  <enclosure url="https://e3.365dm.com/26/07/1920x1080/skynews-kemi-badenoch-pool-clip_7292311.png?20260707181029" length="0" type="image/png"/>
  <media:description type="html"> </media:description>
  <media:thumbnail url="https://e3.365dm.com/26/07/1920x1080/skynews-kemi-badenoch-pool-clip_7292311.png?20260707181029" width="1920" height="1080"/>
  <media:content type="image/png" url="https://e3.365dm.com/26/07/1920x1080/skynews-kemi-badenoch-pool-clip_7292311.png?20260707181029"/>
</item>
</channel></rss>`;

const NPR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item>
  <title>DOJ defends White House media ban, urges court to reject lawsuit</title>
  <description>The Department of Justice defended President Trump's recent media ban.</description>
  <link>https://www.npr.org/2026/09/23/nx-s1-5978614/doj-defend-white-house-media-ban</link>
  <pubDate>Wed, 23 Sep 2026 05:06:47 -0400</pubDate>
  <content:encoded><![CDATA[<img src='https://npr.brightspotcdn.com/dims3/default/strip/false/crop/8192x5464+0+0/resize/8192x5464!/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2Fbb%2F37%2F8b7d1c7544fd927b8a6718d64216%2Fgettyimages-2296402979.jpg' alt='The White House'/><p>The Department of Justice defended...</p><img src='https://media.npr.org/include/images/tracking/npr-rss-pixel.png?story=nx-s1-5978614' />]]></content:encoded>
</item>
<item>
  <title>Results are in from the newest poll</title>
  <link>https://www.npr.org/2026/09/23/nx-s1-5978130/poll</link>
  <content:encoded><![CDATA[<p>Text only.</p><img src='https://media.npr.org/include/images/tracking/npr-rss-pixel.png?story=nx-s1-5978130' />]]></content:encoded>
</item>
</channel></rss>`;

const UN = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<item><title>Equality ‘ends at the doors of the Security Council’, Kenya’s Ruto tells General Assembly</title>
<link>https://news.un.org/feed/view/en/story/2026/09/1168419</link>
<enclosure url="https://global.unitednations.entermediadb.net/assets/mediadb/services/module/asset/downloads/preset/Collections/Production%20Library/2026/09/23-09-2026-UN-Photo-Kenya.jpg/image560x340cropped.jpg" length="92881" type="image/jpeg" />
<pubDate>Wed, 23 Sep 2026 12:00:00 +0000</pubDate></item>
</channel></rss>`;

const WORDPRESS_THUMBS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title>AI, elections and the limits of old campaign law</title>
<link>https://blogs.ucl.ac.uk/constitution-unit/2026/09/24/ai-elections/</link>
<media:thumbnail url="https://blogs.ucl.ac.uk/constitution-unit/files/2026/09/AI-elections-3-300x225.png" width="300" height="225" medium="image"/>
<media:thumbnail url="https://blogs.ucl.ac.uk/constitution-unit/files/2026/09/AI-elections-3.png" width="1920" height="1440" medium="image"/>
</item>
<item><title>Voters don't like data centers</title>
<link>https://www.pbs.org/newshour/politics/voters-dont-like-data-centers</link>
<media:content url="https://d3i6fh83elv35t.cloudfront.net/static/2026/09/data-centers-1024x642.jpg" width="1024" height="642" medium="image"/>
</item>
</channel></rss>`;

const GUARDIAN = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title>Burnham faces backlash</title><link>https://www.theguardian.com/politics/2026/sep/23/x</link>
<media:content width="140" url="https://i.guim.co.uk/img/media/abc/master/2000.jpg?width=140&amp;quality=85&amp;auto=format&amp;fit=max&amp;s=aaa"><media:credit scheme="urn:ebu">Photograph: PA</media:credit></media:content>
<media:content width="460" url="https://i.guim.co.uk/img/media/abc/master/2000.jpg?width=460&amp;quality=85&amp;auto=format&amp;fit=max&amp;s=bbb"><media:credit scheme="urn:ebu">Photograph: PA</media:credit></media:content>
</item>
</channel></rss>`;

const BBC = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title>MPs back votes at 16</title><link>https://www.bbc.com/news/articles/c0abc123</link>
<media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/5a31/live/0b1c0be0.jpg"/>
</item>
</channel></rss>`;

const VIDEO_AND_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<entry><id>x</id><title>Clip</title><link rel="alternate" href="https://example.org/a"/>
<link rel="enclosure" type="image/jpeg" href="http://example.org/photo.jpg"/>
<media:group>
  <media:content url="https://example.org/clip.mp4" medium="video" type="video/mp4"/>
  <media:thumbnail url="https://example.org/thumb-640.jpg" width="640"/>
</media:group>
</entry>
</feed>`;

test('Sky: strips the HTML link from the title and asks for a 768px photo', () => {
  const [it] = parseFeed(SKY).items;
  assert.equal(cleanTitle(it.title), 'Long-term benefits claimants could be banned from buying alcohol and cigarettes under Tory plans');
  assert.equal(it.images.length, 1, 'thumbnail, content and enclosure share one URL');
  assert.deepEqual(pickImage(it.images), { url: 'https://e3.365dm.com/26/07/768x432/skynews-kemi-badenoch-pool-clip_7292311.png?20260707181029' });
});

test('NPR: photo from the article HTML only when the feed opts in; tracking pixels ignored', () => {
  const [a, b] = parseFeed(NPR).items;
  assert.equal(pickImage(a.images), null, 'content pictures are off by default');
  const pic = pickImage(a.images, { fromContent: true });
  assert.ok(pic.url.startsWith('https://npr.brightspotcdn.com/dims3/default/strip/false/crop/8192x5464+0+0/resize/800/?url='), pic.url);
  assert.ok(pic.url.endsWith('gettyimages-2296402979.jpg'), pic.url);
  assert.equal(pickImage(b.images, { fromContent: true }), null, 'a lone tracking pixel is not a photo');
});

test('UN News: enclosure photo is used as it is', () => {
  const [it] = parseFeed(UN).items;
  assert.equal(pickImage(it.images).url, 'https://global.unitednations.entermediadb.net/assets/mediadb/services/module/asset/downloads/preset/Collections/Production%20Library/2026/09/23-09-2026-UN-Photo-Kenya.jpg/image560x340cropped.jpg');
});

test('WordPress/PBS: prefers the smallest picture that is at least 600px wide', () => {
  const [cu, pbs] = parseFeed(WORDPRESS_THUMBS).items;
  assert.equal(pickImage(cu.images).url, 'https://blogs.ucl.ac.uk/constitution-unit/files/2026/09/AI-elections-3.png');
  assert.equal(pickImage(pbs.images).url, 'https://d3i6fh83elv35t.cloudfront.net/static/2026/09/data-centers-1024x642.jpg');
});

test('Guardian: takes the larger of the two signed sizes and decodes &amp;', () => {
  const [it] = parseFeed(GUARDIAN).items;
  assert.equal(pickImage(it.images).url, 'https://i.guim.co.uk/img/media/abc/master/2000.jpg?width=460&quality=85&auto=format&fit=max&s=bbb');
});

test('BBC: asks for 800px and keeps the original as a fallback', () => {
  const [it] = parseFeed(BBC).items;
  assert.deepEqual(pickImage(it.images), {
    url: 'https://ichef.bbci.co.uk/ace/standard/800/cpsprodpb/5a31/live/0b1c0be0.jpg',
    fallback: 'https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/5a31/live/0b1c0be0.jpg',
  });
});

test('Atom + media:group: skips video, upgrades http to https', () => {
  const [it] = parseFeed(VIDEO_AND_ATOM).items;
  const urls = it.images.map((c) => c.url);
  assert.ok(urls.includes('https://example.org/clip.mp4') && urls.includes('http://example.org/photo.jpg'));
  assert.equal(pickImage(it.images).url, 'https://example.org/thumb-640.jpg');
  assert.equal(pickImage(it.images.filter((c) => !c.url.includes('thumb'))).url, 'https://example.org/photo.jpg');
});

test('rejects junk: gifs, svgs, tiny images, non-https schemes', () => {
  assert.equal(pickImage([{ from: 'enclosure', url: 'https://x.org/anim.gif' }]), null);
  assert.equal(pickImage([{ from: 'media:content', url: 'https://x.org/logo.svg' }]), null);
  assert.equal(pickImage([{ from: 'media:thumbnail', url: 'https://x.org/a.jpg', width: 1, height: 1 }]), null);
  assert.equal(pickImage([{ from: 'media:thumbnail', url: 'https://x.org/a.jpg', width: 120 }]), null);
  assert.equal(pickImage([{ from: 'media:thumbnail', url: 'javascript:alert(1)' }]), null);
  assert.equal(pickImage([{ from: 'media:thumbnail', url: 'data:image/png;base64,AAAA' }]), null);
});

test('imagesFromHtml reads src and width', () => {
  assert.deepEqual(imagesFromHtml('<p>x</p><img class="a" src="https://x.org/p.jpg" width="850" height="425">'), [
    { from: 'content', url: 'https://x.org/p.jpg', width: 850, height: 425 },
  ]);
});

test('resizeImage leaves unknown hosts alone', () => {
  const u = new URL('https://static.example.com/a-1024x683.jpg');
  assert.deepEqual(resizeImage(u, 1024), { url: 'https://static.example.com/a-1024x683.jpg', width: 1024, verified: true });
});
