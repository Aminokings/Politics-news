// OPTIONAL: AI study notes for new stories (summary, exam angles, flashcard facts).
// Only runs when the ANTHROPIC_API_KEY secret/env var is set. Without it the site
// works exactly the same, just without the "AI notes" box on each story.
//
// Cost control: at most AI_MAX_PER_RUN stories per run (default 8), short prompts,
// and the cheapest fast model by default. See README > "Optional: AI study notes".

const apiUrl = () => `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`;
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const TOOL = {
  name: 'record_story_notes',
  description: 'Record short revision notes about one news story for Edexcel A level Politics students.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Two sentences (max 55 words) in your own words, using ONLY facts stated in the story text.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '1-3 spec tag ids (from the list provided) that this story is genuinely useful evidence for. Empty if none fit.',
      },
      angles: {
        type: 'array',
        description: 'Up to 2 ways to use the story in one of the listed exam questions. Only include clear links.',
        items: {
          type: 'object',
          properties: {
            questionId: { type: 'string' },
            side: { type: 'string', enum: ['for', 'against'] },
            point: { type: 'string', description: 'One sentence (max 35 words) explaining how the story supports that side.' },
          },
          required: ['questionId', 'side', 'point'],
        },
      },
      facts: {
        type: 'array',
        description: 'Up to 2 flashcards built only from explicit details in the text (a number, date, name or outcome).',
        items: {
          type: 'object',
          properties: { q: { type: 'string' }, a: { type: 'string' } },
          required: ['q', 'a'],
        },
      },
    },
    required: ['summary', 'tags', 'angles', 'facts'],
  },
};

const SYSTEM = [
  'You write concise revision notes that help UK A level Politics students (Pearson Edexcel 9PL0) use current news as evidence in essays.',
  'You only see a headline and a short blurb from a news feed. Rules:',
  '1) Use only facts stated in the provided text. Never add names, numbers, dates or events that are not in it.',
  '2) Use neutral, non-partisan language.',
  '3) Write the summary in your own words; do not copy sentences.',
  '4) Only choose spec tags and exam questions from the lists given, using their exact ids.',
  "5) 'for' means the story supports the view stated in the question; 'against' means it challenges it.",
  '6) If the text is too thin to be useful, return a one-sentence summary and empty lists.',
].join('\n');

function buildPrompt(item, feedName, tagOptions, questionOptions) {
  const lines = [
    'STORY',
    `Source: ${feedName}`,
    `Date: ${item.date.slice(0, 10)}`,
    `Headline: ${item.title}`,
    `Blurb: ${item.summary || '(none)'}`,
    '',
    'SPEC TAGS (id — name: what it covers)',
    ...tagOptions.map((t) => `- ${t.id} — ${t.name}: ${t.about}`),
    '',
    'EXAM QUESTIONS (id — question)',
    ...(questionOptions.length ? questionOptions.map((q) => `- ${q.id} — ${q.text}`) : ['(none)']),
  ];
  return lines.join('\n');
}

async function callClaude({ apiKey, model, prompt }) {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === 'tool_use');
  if (!block) throw new Error('No tool_use block in response');
  return block.input;
}

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function validate(out, tagIds, qIds) {
  const summary = clip(out.summary, 420);
  const tags = [...new Set((out.tags || []).filter((t) => tagIds.has(t)))].slice(0, 3);
  const angles = (out.angles || [])
    .filter((a) => a && qIds.has(a.questionId) && (a.side === 'for' || a.side === 'against') && a.point)
    .slice(0, 2)
    // questions.json labels the two sides 'a' (agrees with the view) and 'b' (disagrees)
    .map((a) => ({ q: a.questionId, side: a.side === 'for' ? 'a' : 'b', point: clip(a.point, 260) }));
  const facts = (out.facts || [])
    .filter((f) => f && f.q && f.a)
    .slice(0, 2)
    .map((f) => ({ q: clip(f.q, 170), a: clip(f.a, 130) }));
  return { summary, tags, angles, facts };
}

/**
 * Enrich up to maxItems of the given (new) items in place. Never throws — AI is a bonus.
 */
export async function enrichWithAI(items, { apiKey, model = DEFAULT_MODEL, maxItems = 8, spec, questions, feedsById, now, log = console.log }) {
  const stats = { attempted: 0, done: 0, failed: 0, model };
  if (!apiKey || !items.length || maxItems <= 0) return stats;

  const tagById = new Map(spec.tags.map((t) => [t.id, t]));
  const allTagIds = new Set(spec.tags.map((t) => t.id));
  const evaluateQs = questions.filter((q) => q.type === 'evaluate');

  const candidates = items
    .filter((i) => !i.ai && i.tags?.length && i.score >= 4)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .slice(0, maxItems);

  for (const item of candidates) {
    stats.attempted++;
    // Offer the story's own tags plus siblings from the same spec topics, so the model can correct us.
    const own = item.tags.map((id) => tagById.get(id)).filter(Boolean);
    const topics = new Set(own.map((t) => t.topic));
    const siblings = spec.tags.filter((t) => topics.has(t.topic) && !item.tags.includes(t.id));
    const tagOptions = [...own, ...siblings].slice(0, 10);
    const qOptions = evaluateQs.filter((q) => q.tags.some((t) => item.tags.includes(t))).slice(0, 8);
    const prompt = buildPrompt(item, feedsById[item.source]?.name || item.source, tagOptions, qOptions);
    try {
      const out = await callClaude({ apiKey, model, prompt });
      const v = validate(out, allTagIds, new Set(qOptions.map((q) => q.id)));
      if (!v.summary) throw new Error('Empty summary');
      item.ai = { ...v, model, at: now.toISOString() };
      if (v.tags.length) item.tags = [...new Set([...v.tags, ...item.tags])].slice(0, 4);
      stats.done++;
    } catch (e) {
      stats.failed++;
      log(`  AI note failed for "${item.title.slice(0, 60)}": ${e.message}`);
      if (e.status === 401 || e.status === 403 || e.status === 400 || e.status === 404) {
        log('  Stopping AI notes for this run (check ANTHROPIC_API_KEY / AI_MODEL).');
        break;
      }
      if (e.status === 429 || e.status === 529) await new Promise((r) => setTimeout(r, 20000));
    }
  }
  return stats;
}
