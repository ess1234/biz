#!/usr/bin/env node
/**
 * imagemeta — 빌드 결과 HTML 에 이미지 설명(alt) · JSON-LD 넣기. 빌드 도구와 상관없이 결과 폴더만 본다.
 *
 *   npx imagemeta inject <폴더> [옵션]
 *
 *   --api-base <url>   메타 API 기준 (또는 IMAGEMETA_API_BASE) — 필수
 *                      API 키는 IMAGEMETA_API_KEY 환경 변수로만 받는다(명령줄 기록에 남지 않게)
 *   --lang <ko|en|ja|zh>  기본 언어 (또는 IMAGEMETA_LANG, 기본 ko). 페이지의 <html lang> 이 있으면 그걸 쓴다
 *   --no-lang-from-html   <html lang> 을 무시하고 --lang 하나로
 *   --no-jsonld        JSON-LD 를 넣지 않음
 *   --force            사람이 쓴 alt 도 덮어씀
 *   --fill-empty-alt   alt="" 도 채움 (Next <Image> 처럼 alt 가 필수라 alt="" 로 둔 사이트). 기본은 꾸밈 이미지로 보고 둠
 *   --dry-run          쓰지 않고 바뀔 파일만 보여 줌
 *   --cache-dir <dir>  캐시 폴더 (기본 .cache, --no-cache 면 캐시 없음)
 *   --host <url>       이 호스트의 /i/{id} 만 (여러 번 가능)
 *   --strict           메타를 못 받으면 실패(종료 코드 1). 기본은 경고만 하고 빌드를 막지 않음(종료 0)
 *   --json             결과를 JSON 한 줄로
 *
 * 종료 코드: 0 정상(또는 경고) · 1 --strict 에서 메타 실패 · 2 사용법 오류
 */
import { stat } from 'node:fs/promises';

import { injectDir } from '../src/inject.js';

const USAGE = '사용법: imagemeta inject <폴더> --api-base <url> [--lang ko] [--dry-run] [--strict] …  (imagemeta --help)';

function parse(argv) {
  const o = { hosts: [], positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} 에 값이 필요합니다`); return v; };
    switch (a) {
      case '--api-base': o.apiBase = val(); break;
      case '--lang': o.lang = val(); break;
      case '--cache-dir': o.cacheDir = val(); break;
      case '--host': o.hosts.push(val()); break;
      case '--no-cache': o.cacheDir = null; break;
      case '--no-jsonld': o.jsonld = false; break;
      case '--no-lang-from-html': o.langFromHtml = false; break;
      case '--force': o.force = true; break;
      case '--fill-empty-alt': o.fillEmpty = true; break;
      case '--dry-run': o.dryRun = true; break;
      case '--strict': o.strict = true; break;
      case '--json': o.json = true; break;
      case '-h': case '--help': o.help = true; break;
      case '--api-key': throw new Error('API 키는 명령줄로 받지 않습니다 — IMAGEMETA_API_KEY 환경 변수에 넣으세요');
      default:
        if (a.startsWith('--')) throw new Error(`모르는 옵션: ${a}`);
        o.positional.push(a);
    }
  }
  return o;
}

async function main() {
  let o;
  try { o = parse(process.argv.slice(2)); } catch (e) { console.error(`[imagemeta] ${e.message}\n${USAGE}`); return 2; }
  if (o.help) { console.log(USAGE); return 0; }
  const [cmd, dir] = o.positional;
  if (cmd !== 'inject' || !dir) { console.error(USAGE); return 2; }
  try { if (!(await stat(dir)).isDirectory()) throw new Error(); } catch { console.error(`[imagemeta] 폴더가 없습니다: ${dir}`); return 2; }
  const apiBase = o.apiBase || process.env.IMAGEMETA_API_BASE;
  if (!apiBase) { console.error(`[imagemeta] --api-base 또는 IMAGEMETA_API_BASE 가 필요합니다\n${USAGE}`); return 2; }
  const apiKey = process.env.IMAGEMETA_API_KEY || '';
  if (!apiKey) console.warn('[imagemeta] IMAGEMETA_API_KEY 가 없습니다 — public 이미지만 설명을 받습니다');
  try {
    const r = await injectDir(dir, {
      apiBase, apiKey, lang: o.lang || process.env.IMAGEMETA_LANG || 'ko', langFromHtml: o.langFromHtml, jsonld: o.jsonld,
      force: o.force, fillEmpty: o.fillEmpty, dryRun: o.dryRun, cacheDir: o.cacheDir, imageHosts: o.hosts.length ? o.hosts : undefined,
    });
    if (o.json) console.log(JSON.stringify(r));
    else {
      console.log(`[imagemeta] 페이지 ${r.pages} · 바뀐 페이지 ${r.changedPages}${r.dryRun ? '(dry-run, 안 씀)' : ''} · alt ${r.altAdded}개 넣음 · 건너뜀 ${r.altSkipped}`
        + ` · 요청 ${r.requests}회 · 받음 ${r.fetched} · 캐시 ${r.cached} · 없음 ${r.missing} · 언어 ${r.langs.map((l) => `${l.lang}:${l.images}`).join(' ') || '-'}`);
      for (const f of r.files) console.log(`  ${f.file} (${f.lang}) alt +${f.altAdded}`);
    }
    return 0;
  } catch (e) {
    const msg = String(e && e.message || e).split(apiKey || '\u0000').join('***');   // 혹시 메시지에 키가 섞여도 가린다
    if (o.strict) { console.error(`[imagemeta] 실패: ${msg}`); return 1; }
    console.warn(`[imagemeta] 메타를 받지 못해 아무것도 바꾸지 않았습니다(빌드는 계속): ${msg}`);
    return 0;
  }
}

process.exitCode = await main();
