/**
 * @imagemeta/vite — 빌드 연동 v1 (biz-dev-05 ②). alt 치환만(로컬 이미지 업로드는 v1.1, BD-05-4).
 *
 *   // vite.config.js
 *   import imagemeta from '@imagemeta/vite'
 *   export default { plugins: [imagemeta({ apiKey: process.env.IMAGEMETA_API_KEY, apiBase: 'https://<dos>/t23/v1', lang: 'ko' })] }
 *
 * 동작
 *   1. buildStart: 프로젝트의 .html·.jsx·.tsx·.vue·.svelte·.astro·.md 를 훑어 /i/{id} 를 모아 /meta:batch 1~n회(100개 단위). 캐시 TTL 안이면 요청 0
 *   2. transform: 소스 안 정적 <img src="…/i/{id}"> 에 alt(+data-meta-rev) 주입 — alt 가 이미 있으면 유지(force 옵션으로만 덮음)
 *   3. transformIndexHtml: HTML 의 <img> 도 같은 처리 + <head> 에 ImageObject JSON-LD 1개(jsonld 옵션, 기본 켬)
 *   4. 실패 정책: 메타 못 받으면 경고 1줄, 빌드는 계속(strict 면 실패)
 *   dev 서버(serve)에서는 아무것도 하지 않는다 — 런타임은 페이지 스크립트가 담당
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createClient, injectAlt, jsonLdScript } from '@imagemeta/core';

const SRC_EXT = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.md', '.mdx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.cache', '.vite']);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) yield* walk(join(dir, e.name)); }
    else if (SRC_EXT.has(extname(e.name).toLowerCase())) yield join(dir, e.name);
  }
}

export default function imagemeta(options = {}) {
  const log = options.log || ((msg) => console.log(`[imagemeta] ${msg}`));
  const jsonld = options.jsonld !== false;
  let client, metas = new Map(), root = process.cwd(), isBuild = false, warned = false;

  function warn(msg) { if (options.strict) throw new Error(`[imagemeta] ${msg}`); if (!warned) { console.warn(`[imagemeta] ${msg}`); warned = true; } }

  return {
    name: 'imagemeta',
    enforce: 'pre',
    configResolved(cfg) { root = cfg.root; isBuild = cfg.command === 'build'; },
    async buildStart() {
      if (!isBuild) return;
      if (!options.apiBase) { warn('apiBase 가 없어 alt 를 넣지 않습니다'); return; }
      if (!options.apiKey) warn('apiKey 가 없습니다 — public 이미지만 설명을 받습니다');
      client = createClient({ ...options, cacheFile: options.cacheFile === undefined ? join(root, '.cache/imagemeta.json') : options.cacheFile });
      const ids = new Set();
      for await (const f of walk(root)) {
        try { for (const id of client.extractIds(await readFile(f, 'utf8'))) ids.add(id); } catch { /* 읽기 실패 무시 */ }
      }
      if (!ids.size) { log('이미지(/i/{id}) 없음'); return; }
      try {
        metas = await client.fetchMany([...ids]);
        const s = client.stats;
        log(`이미지 ${ids.size}개 · 요청 ${s.requests}회 · 받음 ${s.fetched} · 캐시 ${s.cached} · 없음 ${s.missing}`);
      } catch (e) {
        warn(`메타를 받지 못했습니다: ${e.message}`);
      }
    },
    transform(code, id) {
      if (!isBuild || !metas.size) return null;
      const ext = extname(id.split('?')[0]).toLowerCase();
      if (!SRC_EXT.has(ext) || ext === '.html' || ext === '.htm') return null;
      if (!/<img\b/i.test(code)) return null;
      const r = injectAlt(code, metas, { force: options.force, imageHosts: options.imageHosts });
      return r.changed ? { code: r.code, map: null } : null;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!isBuild || !metas.size) return html;
        const r = injectAlt(html, metas, { force: options.force, imageHosts: options.imageHosts });
        let out = r.code;
        if (jsonld) {
          const used = new Map();
          for (const id of client.extractIds(html)) if (metas.get(id)) used.set(id, metas.get(id));
          const ld = jsonLdScript(used);
          if (ld && !out.includes('application/ld+json')) out = out.includes('</head>') ? out.replace('</head>', `${ld}\n</head>`) : ld + out;
        }
        if (r.changed || r.skipped) log(`HTML alt ${r.changed}개 넣음${r.skipped ? ` · 건너뜀 ${r.skipped}(이미 alt 있음·설명 없음)` : ''}`);
        return out;
      },
    },
  };
}
