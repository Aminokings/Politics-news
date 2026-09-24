// Fetch a feed with a timeout, one retry and conditional-request headers (ETag / Last-Modified).
const UA = 'Mozilla/5.0 (compatible; CaseInPointBot/1.0; politics news reader for A level students)';

export async function fetchFeed(feed, prevState = {}, { timeoutMs = 20000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
      };
      if (prevState.etag) headers['If-None-Match'] = prevState.etag;
      if (prevState.lastModified) headers['If-Modified-Since'] = prevState.lastModified;
      const res = await fetch(feed.url, { headers, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 304) return { status: 304, notModified: true, etag: prevState.etag, lastModified: prevState.lastModified };
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      const body = await res.text();
      return {
        status: res.status,
        body,
        etag: res.headers.get('etag') || null,
        lastModified: res.headers.get('last-modified') || null,
      };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e.name === 'AbortError' ? new Error(`Timed out after ${timeoutMs / 1000}s`) : e;
      if (lastErr.status && lastErr.status >= 400 && lastErr.status < 500 && lastErr.status !== 429) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

/** Run async tasks with a concurrency limit. */
export async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
