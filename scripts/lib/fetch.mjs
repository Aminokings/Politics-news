// Fetch a feed with a timeout, one retry and conditional-request headers (ETag / Last-Modified).
export const UA = 'Mozilla/5.0 (compatible; CaseInPointBot/1.0; politics news reader for A level students)';

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

/**
 * GET a page as text, reading at most `maxBytes` and stopping early once `stopAt` matches
 * (e.g. /<\/head>/i when only the page's <head> is needed). Never throws: failures come back
 * as { status: 0 or the HTTP status, text: '', error }.
 */
export async function fetchText(url, { timeoutMs = 10000, maxBytes = 600000, stopAt = null, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok || !res.body) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return { status: res.status, url: res.url || url, text: '', error: `HTTP ${res.status}` };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      const chunk = decoder.decode(value, { stream: true });
      text += chunk;
      if (bytes >= maxBytes || (stopAt && stopAt.test(text.slice(-(chunk.length + 16))))) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
    return { status: res.status, url: res.url || url, text };
  } catch (e) {
    return { status: 0, url, text: '', error: e.name === 'AbortError' ? `timed out after ${timeoutMs / 1000}s` : e.message };
  } finally {
    clearTimeout(timer);
  }
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
