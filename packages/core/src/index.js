/**
 * @imagemeta/core — 메타 API 클라이언트 + 디스크 캐시 (biz-dev-05 ②③ 공통). Node 18+, 의존성 0.
 *
 *   const client = createClient({ apiKey: process.env.IMAGEMETA_API_KEY, apiBase: 'https://dos-biz-stage.vercel.app/t23/v1', lang: 'ko', cacheFile: '.cache/imagemeta.json' })
 *   const metas = await client.fetchMany(ids)   // Map<id, Meta|null>  — 캐시에 있고 TTL 안이면 요청 0
 *   client.stats                                // { requests, fetched, cached, missing }
 *
 * 메타 API: GET /meta:batch?ids=a,b,c&lang=  + Authorization: ApiKey …  (서버·빌드는 Origin 이 없으므로 API 키로 인증; 사이트 키 아님)
 * 캐시: { version:1, entries: { [id]: { meta, fetchedAt } } } — rev 가 같으면 메타도 같으므로 TTL(기본 1시간) 안에서는 재요청하지 않는다.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ID_RE = /\/i\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#"'\s]|$)/gi;
const BATCH = 100;

export function extractIds(text, imageHosts) {
  const out = new Set();
  const re = new RegExp(ID_RE.source, 'gi');
  let m;
  while ((m = re.exec(text))) {
    if (imageHosts && imageHosts.length) {
      const start = text.lastIndexOf('http', m.index);
      const url = start >= 0 ? text.slice(start, m.index + m[0].length) : '';
      if (!imageHosts.some((h) => url.startsWith(h))) continue;
    }
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

export function createClient(opts) {
  const apiBase = String(opts.apiBase || '').replace(/\/$/, '');
  if (!apiBase) throw new Error('[imagemeta] apiBase 가 필요합니다 (예: https://<dos>/t23/v1)');
  const apiKey = opts.apiKey || '';
  const lang = opts.lang || 'ko';
  const cacheFile = opts.cacheFile ?? '.cache/imagemeta.json';
  const ttlMs = (opts.cacheTtlSeconds ?? 3600) * 1000;
  const fetchImpl = opts.fetch || globalThis.fetch;
  const stats = { requests: 0, fetched: 0, cached: 0, missing: 0 };
  let cache = null;

  async function load() {
    if (cache) return cache;
    cache = { version: 1, entries: {} };
    if (!cacheFile) return cache;
    try {
      const j = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (j && j.version === 1 && j.entries) cache = j;
    } catch { /* 없음 */ }
    return cache;
  }
  async function save() {
    if (!cacheFile || !cache) return;
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache, null, 1), 'utf8');
  }

  async function fetchMany(ids) {
    const want = [...new Set(ids.map((s) => s.toLowerCase()))];
    const c = await load();
    const now = Date.now();
    const result = new Map();
    const need = [];
    for (const id of want) {
      const e = c.entries[id];
      if (e && now - e.fetchedAt < ttlMs) { result.set(id, e.meta); stats.cached++; } else need.push(id);
    }
    for (let i = 0; i < need.length; i += BATCH) {
      const chunk = need.slice(i, i + BATCH);
      const url = `${apiBase}/meta:batch?ids=${chunk.join(',')}&lang=${encodeURIComponent(lang)}&jsonld=1`;
      stats.requests++;
      const r = await fetchImpl(url, { headers: apiKey ? { Authorization: `ApiKey ${apiKey}` } : {} });
      if (!r.ok) throw new Error(`[imagemeta] 메타 API ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      for (const it of j.items || []) { result.set(it.id, it); c.entries[it.id] = { meta: it, fetchedAt: now }; stats.fetched++; }
      for (const id of j.missing || []) { result.set(id, null); c.entries[id] = { meta: null, fetchedAt: now }; stats.missing++; }
    }
    if (need.length) await save();
    return result;
  }

  return { fetchMany, extractIds: (text) => extractIds(text, opts.imageHosts), stats, lang };
}

/** HTML/JSX 문자열의 <img …> 중 src 가 /i/{id} 이고 alt 가 없는 태그에 alt="…" 를 넣는다. 이미 alt 가 있으면 그대로(force 면 덮음). 반환 { code, changed, skipped }. */
export function injectAlt(code, metas, { force = false, imageHosts, attr = 'alt' } = {}) {
  let changed = 0, skipped = 0;
  const out = code.replace(/<img\b([^>]*?)(\/?)>/gi, (tag, attrs, selfClose) => {
    const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    if (!src) return tag;
    const ids = extractIds(src[2] + ' ', imageHosts);
    if (!ids.length) return tag;
    const meta = metas.get(ids[0]);
    if (!meta || !meta.alt) { skipped++; return tag; }
    const hasAlt = /\balt\s*=/i.test(attrs);
    if (hasAlt && !force) { skipped++; return tag; }
    const esc = meta.alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const cleaned = hasAlt ? attrs.replace(/\s*\balt\s*=\s*(["']).*?\1/i, '') : attrs;
    changed++;
    return `<img${cleaned.replace(/\s*$/, '')} ${attr}="${esc}" data-meta-rev="${meta.rev ?? ''}"${selfClose ? ' /' : ''}>`;
  });
  return { code: out, changed, skipped };
}

/** ImageObject JSON-LD 조각들을 <script type="application/ld+json"> 한 개로. */
export function jsonLdScript(metas) {
  const items = [...metas.values()].filter((m) => m && m.jsonld).map((m) => m.jsonld);
  if (!items.length) return '';
  return `<script type="application/ld+json">${JSON.stringify(items.length === 1 ? items[0] : items)}</script>`;
}
