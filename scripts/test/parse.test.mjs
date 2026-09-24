import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../lib/parse.mjs';
import { stripHtml, cleanSummary, canonicalUrl, decodeEntities, parseDate, firstParagraph } from '../lib/text.mjs';

const BBC_STYLE = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet title="XSL_formatting" type="text/xsl" href="/shared/bsp/xsl/rss/nolsol.xsl"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title><![CDATA[BBC News]]></title><link>https://www.bbc.co.uk/news/politics</link>
<atom:link href="https://feeds.bbci.co.uk/news/politics/rss.xml" rel="self" type="application/rss+xml"/>
<item>
  <title><![CDATA[MPs back votes at 16 as bill clears Commons]]></title>
  <description><![CDATA[The Representation of the People Bill passes its third reading.]]></description>
  <link>https://www.bbc.com/news/articles/c0abc123?at_medium=RSS&amp;at_campaign=rss</link>
  <guid isPermaLink="false">https://www.bbc.com/news/articles/c0abc123#0</guid>
  <pubDate>Wed, 23 Sep 2026 10:12:45 GMT</pubDate>
  <media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/x.jpg"/>
</item>
<item>
  <title>Second story &amp; more</title>
  <description>Plain &lt;b&gt;escaped&lt;/b&gt; html</description>
  <link>https://www.bbc.com/news/articles/c0def456</link>
  <pubDate>Wed, 23 Sep 2026 09:00:00 BST</pubDate>
</item>
</channel></rss>`;

const GUARDIAN_STYLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel>
<item>
  <title>Burnham faces Labour backlash over welfare plans</title>
  <link>https://www.theguardian.com/politics/2026/sep/23/burnham-welfare</link>
  <description>&lt;p&gt;Backbenchers warn of a rebellion.&lt;/p&gt; &lt;a href="https://www.theguardian.com/politics/2026/sep/23/burnham-welfare"&gt;Continue reading...&lt;/a&gt;</description>
  <category domain="https://www.theguardian.com/politics/labour">Labour</category>
  <category domain="https://www.theguardian.com/politics/politics">Politics</category>
  <pubDate>Wed, 23 Sep 2026 11:30:00 GMT</pubDate>
  <guid>https://www.theguardian.com/politics/2026/sep/23/burnham-welfare</guid>
  <dc:creator>A Reporter</dc:creator>
  <dc:date>2026-09-23T11:30:00Z</dc:date>
</item>
</channel></rss>`;

const WORDPRESS_STYLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<item>
  <title>Why Reform can&#8217;t afford to pick a side</title>
  <link>https://blogs.lse.ac.uk/politicsandpolicy/why-reform/</link>
  <pubDate>Tue, 15 Sep 2026 11:26:30 +0000</pubDate>
  <description><![CDATA[<p>Reform UK has started announcing policies&#8230; Continued</p>
<p>The post <a href="https://blogs.lse.ac.uk/x">Why Reform</a> first appeared on <a href="https://blogs.lse.ac.uk">LSE British Politics</a>.</p>]]></description>
  <content:encoded><![CDATA[<p>Full article body here.</p>]]></content:encoded>
</item>
<item>
  <title>Empty description post</title>
  <link>https://www.scotusblog.com/2026/09/x/</link>
  <pubDate>Wed, 23 Sep 2026 14:00:00 +0000</pubDate>
  <description><![CDATA[]]></description>
  <content:encoded><![CDATA[<p>In my inaugural entry for this column, I critiqued the Supreme Court's reliance on an abstract conception of the separation of powers.</p>]]></content:encoded>
</item>
</channel></rss>`;

const ATOM_GOVUK = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <id>https://www.gov.uk/government/organisations/prime-ministers-office-10-downing-street</id>
  <title>Prime Minister's Office, 10 Downing Street - Activity on GOV.UK</title>
  <updated>2026-09-22T17:00:00+01:00</updated>
  <entry>
    <id>https://www.gov.uk/government/news/pm-call#2026-09-22T17:00:00+01:00</id>
    <updated>2026-09-22T17:00:00+01:00</updated>
    <link rel="alternate" type="text/html" href="https://www.gov.uk/government/news/pm-call"/>
    <title>PM call with President Trump: 22 September 2026 </title>
    <summary type="html">The Prime Minister spoke to President Trump this afternoon. </summary>
  </entry>
</feed>`;

const RDF_STYLE = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://www.dw.com"><title>DW</title></channel>
  <item rdf:about="https://www.dw.com/en/nato/a-1">
    <title>NATO allies meet in Brussels</title>
    <link>https://www.dw.com/en/nato/a-1?maca=en-rss-en-world-4025-rdf</link>
    <description>Defence ministers discuss spending.</description>
    <dc:date>2026-09-23T08:00:00Z</dc:date>
  </item>
</rdf:RDF>`;

const UN_NEWS_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<item><title>Security Council LIVE: Fresh attacks</title>
<link>https://news.un.org/feed/view/en/story/2026/09/1168310</link>
<description>The Council&nbsp;met in an emergency session.</description>
<pubDate>Fri, 11 Sep 2026 12:00:00 +0000</pubDate>
<guid isPermaLink="true">https://news.un.org/en/story/2026/09/1168310</guid></item>
</channel></rss>`;

const BILLS_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:a10="http://www.w3.org/2005/Atom" version="2.0"><channel>
<item p4:stage="Committee stage" xmlns:p4="https://bills.parliament.uk/ns">
  <guid isPermaLink="false">3938</guid>
  <link>https://bills.parliament.uk/bills/3938</link>
  <category>Government Bill</category><category>Lords</category>
  <title>Representation of the People Bill</title>
  <description>A Bill to make provision about elections.</description>
  <a10:updated>2026-09-15T10:00:00+01:00</a10:updated>
</item>
</channel></rss>`;

test('parses BBC-style RSS with CDATA, entities and tracking links', () => {
  const { format, items } = parseFeed(BBC_STYLE);
  assert.equal(format, 'rss');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'MPs back votes at 16 as bill clears Commons');
  assert.equal(canonicalUrl(items[0].link), 'https://www.bbc.com/news/articles/c0abc123');
  assert.equal(items[1].title, 'Second story & more');
  assert.equal(stripHtml(items[1].description), 'Plain escaped html');
  assert.equal(parseDate(items[1].date).toISOString(), '2026-09-23T08:00:00.000Z');
});

test('parses Guardian-style RSS: HTML description, categories, "Continue reading"', () => {
  const { items } = parseFeed(GUARDIAN_STYLE);
  assert.equal(items[0].categories.join('|'), 'Labour|Politics');
  assert.equal(cleanSummary(stripHtml(items[0].description)), 'Backbenchers warn of a rebellion.');
});

test('parses WordPress feeds and removes "The post … first appeared on" footers', () => {
  const { items } = parseFeed(WORDPRESS_STYLE);
  assert.equal(decodeEntities(items[0].title), 'Why Reform can’t afford to pick a side');
  const s = cleanSummary(stripHtml(items[0].description));
  assert.ok(!/first appeared on/i.test(s), s);
  assert.ok(s.startsWith('Reform UK has started announcing policies'), s);
  assert.equal(items[1].description, '');
  assert.match(stripHtml(items[1].content), /inaugural entry/);
});

test('parses Atom (GOV.UK) and trims titles', () => {
  const { format, items } = parseFeed(ATOM_GOVUK);
  assert.equal(format, 'atom');
  assert.equal(items[0].link, 'https://www.gov.uk/government/news/pm-call');
  assert.equal(items[0].title.trim(), 'PM call with President Trump: 22 September 2026');
  assert.equal(parseDate(items[0].date).toISOString(), '2026-09-22T16:00:00.000Z');
});

test('parses RSS 1.0 / RDF', () => {
  const { format, items } = parseFeed(RDF_STYLE);
  assert.equal(format, 'rdf');
  assert.equal(items[0].title, 'NATO allies meet in Brussels');
  assert.equal(items[0].date, '2026-09-23T08:00:00Z');
});

test('tolerates undeclared HTML entities (UN News &nbsp;)', () => {
  const { items } = parseFeed(UN_NEWS_STYLE);
  assert.equal(items.length, 1);
  assert.equal(stripHtml(items[0].description), 'The Council met in an emergency session.');
  assert.equal(items[0].guid, 'https://news.un.org/en/story/2026/09/1168310');
});

test('reads bill stage and a10:updated from the Parliament bills feed', () => {
  const { items } = parseFeed(BILLS_STYLE);
  assert.equal(items[0].stage, 'Committee stage');
  assert.equal(items[0].date, '2026-09-15T10:00:00+01:00');
  assert.deepEqual(items[0].categories, ['Government Bill', 'Lords']);
});

test('rejects HTML pages', () => {
  assert.throws(() => parseFeed('<!DOCTYPE html><html><body>nope</body></html>'), /HTML page/);
});

test('firstParagraph skips metadata and finds prose', () => {
  const html = '<div>Posted by admin</div><p>Yes</p><p>A political hand grenade is hurtling towards the Home Office, and ministers know it.</p>';
  assert.match(firstParagraph(html), /^A political hand grenade/);
});

test('canonicalUrl strips tracking params but keeps meaningful ones', () => {
  assert.equal(canonicalUrl('http://www.aljazeera.com/news/2026/9/23/x?traffic_source=rss'), 'https://www.aljazeera.com/news/2026/9/23/x');
  assert.equal(canonicalUrl('https://example.com/a?id=5&utm_source=x#frag'), 'https://example.com/a?id=5');
});
