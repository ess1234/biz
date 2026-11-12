/**
 * 빌드 뒤 HTML 에 alt · JSON-LD 넣기 — 빌드 도구와 상관없이(Next 정적 export · Gatsby · Astro · webpack · Angular 등) 결과 폴더만 본다.
 *
 *   import { injectDir } from '@imagemeta/core/inject'
 *   const report = await injectDir('out', { apiBase, apiKey, lang: 'ko' })
 *
 * 동작
 *   1. 폴더 안 .html/.htm 를 모두 읽어 /i/{id} 를 모은다
 *   2. 언어별로(langFromHtml 이면 각 페이지의 <html lang>) /meta:batch 를 묶어 부른다. 캐시는 언어마다 따로(.cache/imagemeta.<lang>.json)
 *   3. 각 페이지의 <img src="…/i/{id}"> 에 alt + data-meta-rev — 사람이 쓴 alt 는 유지(force 로만 덮음), alt="" 는 fillEmpty 면 채움.
 *      우리가 넣은 alt(data-meta-rev)는 rev 가 바뀌면 다시 씀
 *   4. 그 페이지에 쓰인 이미지의 ImageObject JSON-LD 를 <head> 에 하나(data-imagemeta 표시). 다시 돌리면 그 표시를 찾아 바꿔 쓴다(중복 없음)
 *   5. 바뀐 파일만 쓴다. dryRun 이면 쓰지 않는다
 * HTML 만 고친다 — JS 번들 안의 <img>(브라우저에서 그리는 화면)는 페이지 스크립트 · 서버 렌더 몫.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

import { createClient, injectAlt, jsonLdScript } from './index.js';

const HTML_EXT = new Set(['.html', '.htm']);
const LANGS = new Set(['ko', 'en', 'ja', 'zh']);
const LD_RE = /\n?<script type="application\/ld\+json" data-imagemeta>[\s\S]*?<\/script>/i;

async function* walkHtml(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) yield* walkHtml(p); }
    else if (HTML_EXT.has(extname(e.name).toLowerCase())) yield p;
  }
}

/** <html lang="en-US"> → 'en'. 지원 언어가 아니면 null */
export function htmlLang(html) {
  const m = /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z]{2})/i.exec(html);
  const l = m && m[1].toLowerCase();
  return l && LANGS.has(l) ? l : null;
}

function withJsonLd(html, ld) {
  const had = LD_RE.test(html);
  let out = html.replace(LD_RE, '');
  if (!ld) return { html: out, changed: had };
  const tag = ld.replace('<script type="application/ld+json">', '<script type="application/ld+json" data-imagemeta>');
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${tag}\n</head>`) : tag + out;
  return { html: out, changed: true };
}

/**
 * @param {string} dir 빌드 결과 폴더
 * @param {{apiBase:string, apiKey?:string, lang?:string, langFromHtml?:boolean, jsonld?:boolean, force?:boolean, fillEmpty?:boolean, dryRun?:boolean,
 *          cacheDir?:string|null, cacheTtlSeconds?:number, imageHosts?:string[], fetch?:typeof fetch}} opts
 */
export async function injectDir(dir, opts) {
  if (!opts || !opts.apiBase) throw new Error('[imagemeta] apiBase 가 필요합니다 (예: https://<dos>/t23/v1)');
  const defaultLang = (opts.lang || 'ko').toLowerCase();
  const jsonld = opts.jsonld !== false;
  const cacheDir = opts.cacheDir === undefined ? '.cache' : opts.cacheDir;

  // 1) 페이지 읽기 + 언어 정하기
  const pages = [];
  for await (const file of walkHtml(dir)) {
    const html = await readFile(file, 'utf8');
    const lang = (opts.langFromHtml !== false && htmlLang(html)) || defaultLang;
    pages.push({ file, html, lang });
  }

  // 2) 언어별 메타 묶음 조회
  const byLang = new Map();
  for (const p of pages) {
    if (!byLang.has(p.lang)) {
      byLang.set(p.lang, {
        client: createClient({ ...opts, lang: p.lang, cacheFile: cacheDir ? join(cacheDir, `imagemeta.${p.lang}.json`) : null }),
        ids: new Set(), metas: new Map(),
      });
    }
    const g = byLang.get(p.lang);
    for (const id of g.client.extractIds(p.html)) g.ids.add(id);
  }
  const stats = { pages: pages.length, changedPages: 0, altAdded: 0, altSkipped: 0, requests: 0, fetched: 0, cached: 0, missing: 0, langs: [] };
  for (const [lang, g] of byLang) {
    if (g.ids.size) g.metas = await g.client.fetchMany([...g.ids]);
    for (const k of ['requests', 'fetched', 'cached', 'missing']) stats[k] += g.client.stats[k];
    stats.langs.push({ lang, images: g.ids.size });
  }

  // 3) 페이지마다 alt · JSON-LD
  const files = [];
  for (const p of pages) {
    const g = byLang.get(p.lang);
    const ids = g.client.extractIds(p.html);
    if (!ids.length) continue;
    const r = injectAlt(p.html, g.metas, { force: opts.force, fillEmpty: opts.fillEmpty, imageHosts: opts.imageHosts });
    let out = r.code;
    if (jsonld) {
      const used = new Map(ids.filter((id) => g.metas.get(id)).map((id) => [id, g.metas.get(id)]));
      out = withJsonLd(out, jsonLdScript(used)).html;
    }
    stats.altAdded += r.changed; stats.altSkipped += r.skipped;
    if (out !== p.html) {
      stats.changedPages++;
      files.push({ file: relative(dir, p.file).replace(/\\/g, '/'), lang: p.lang, altAdded: r.changed });
      if (!opts.dryRun) await writeFile(p.file, out, 'utf8');
    }
  }
  return { ...stats, files, dryRun: Boolean(opts.dryRun) };
}
