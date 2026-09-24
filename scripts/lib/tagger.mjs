// Tags a story with Edexcel spec points using the keyword rules in config/spec.json.
import { compileRuleSet, compileKeyword, scoreRules, normaliseText, hitLabels } from '../../assets/js/lib/keywords.js';

const round1 = (n) => Math.round(n * 10) / 10;

export function buildTagger(spec) {
  const ctxRules = {
    uk: compileRuleSet(spec.contexts?.uk),
    us: compileRuleSet(spec.contexts?.us),
  };
  const tags = spec.tags.map((t) => ({
    id: t.id,
    context: t.context || 'any',
    min: t.min ?? 3,
    rules: compileRuleSet(t.keywords),
    neg: (t.neg || []).map(compileKeyword).filter(Boolean),
  }));

  /**
   * @param item  { title, summary, categories }
   * @param feed  feed config (region, defaultTags)
   * @returns { tags: [{id, score, hits}], region, ctx }
   */
  return function tag(item, feed = {}) {
    const title = normaliseText(item.title);
    const body = normaliseText([item.summary || '', ...(item.categories || [])].join(' . '));

    const priorUK = feed.region === 'uk' ? 3 : 0;
    const priorUS = feed.region === 'us' ? 3 : 0;
    const cuk = scoreRules(ctxRules.uk, title, body).score + priorUK;
    const cus = scoreRules(ctxRules.us, title, body).score + priorUS;
    // A story from a UK (or US) politics feed always counts as UK (or US) context;
    // otherwise the country with clearly more signals wins (both can pass).
    const okUK = cuk >= 3 && (feed.region === 'uk' || cuk >= cus * 0.6);
    const okUS = cus >= 3 && (feed.region === 'us' || cus >= cuk * 0.6);
    const okBoth = cuk >= 4 && cus >= 4;

    const found = [];
    for (const t of tags) {
      if (t.context === 'uk' && !okUK) continue;
      if (t.context === 'us' && !okUS) continue;
      if (t.context === 'both' && !okBoth) continue;
      const { score: raw, hits } = scoreRules(t.rules, title, body);
      let score = raw;
      const isDefault = (feed.defaultTags || []).includes(t.id);
      if (!score && !isDefault) continue;
      for (const n of t.neg) if (n.test(title) || n.test(body)) score -= 2;
      if (isDefault) score += 3;
      if (score >= t.min) found.push({ id: t.id, score: round1(score), hits: hitLabels(hits, 4) });
    }
    found.sort((a, b) => b.score - a.score);
    const top = found[0]?.score || 0;
    const kept = found.filter((r, i) => i === 0 || r.score >= Math.max(3, top * 0.4)).slice(0, 4);

    let region = 'intl';
    if (cuk >= 3 && cuk >= cus) region = 'uk';
    else if (cus >= 3) region = 'us';
    if (feed.region === 'intl' && cuk < 6 && cus < 6) region = 'intl';

    return { tags: kept, region, ctx: { uk: round1(cuk), us: round1(cus) } };
  };
}

/** Relevance used for ranking: strongest tag + a share of the others. */
export function relevance(tags) {
  if (!tags.length) return 0;
  const [first, ...rest] = tags;
  return round1(first.score + 0.3 * rest.reduce((s, t) => s + t.score, 0));
}
