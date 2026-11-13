#!/usr/bin/env node
/**
 * imagemeta — 이미지 클라우드 CLI. 사람 없이 에이전트 · CI 가 끝까지 돌리도록 (biz-dev-09).
 *
 *   imagemeta upload <폴더|파일…>        이미지 올리기 → imagemeta.json(매니페스트) 갱신. 같은 내용은 다시 안 올림
 *   imagemeta wait [--timeout 600]       매니페스트 이미지가 모두 분석될 때까지
 *   imagemeta rewrite <소스 폴더|파일…>   소스의 로컬 이미지 경로(/images/a.jpg · ./a.jpg)를 영구 주소로
 *   imagemeta list                       매니페스트 + 서버 상태 · alt
 *   imagemeta describe <경로|id> [--set "설명"]   설명 보기 · 고치기 (--lang)
 *   imagemeta visibility <site|public|private> <경로|id…>   public · private 는 --yes 필요
 *   imagemeta usage                      이번 달 사용량 · 한도
 *   imagemeta sites list                 사이트 키 · 허용 출처(읽기만 — 만들기는 콘솔, AG-2)
 *   imagemeta inject <빌드 결과 폴더>      빌드 뒤 HTML 에 alt · JSON-LD
 *
 * 공통: --api-base <url>(또는 IMAGEMETA_API_BASE) · 키는 IMAGEMETA_API_KEY 환경 변수로만 · --json · --dry-run(쓰기 명령)
 *       --manifest <파일>(기본 imagemeta.json) · --lang <ko|en|ja|zh>(또는 IMAGEMETA_LANG)
 * 종료 코드: 0 정상 · 1 실패(API 오류 · 분석 실패 · 시간 초과 · 한도) · 2 사용법 오류(확인 필요한 --yes 포함)
 * 결과는 stdout, 진행 상황은 stderr.
 */
import { stat } from 'node:fs/promises';

import { api, describe, list, rewrite, sitesList, upload, usage, visibility, wait } from '../src/agent.js';
import { injectDir } from '../src/inject.js';

const USAGE = `사용법: imagemeta <upload|wait|rewrite|list|describe|visibility|usage|sites|inject> … [--json]
  imagemeta upload public/images            imagemeta wait --timeout 600
  imagemeta rewrite src --public-dir public  imagemeta inject dist
  키: IMAGEMETA_API_KEY 환경 변수 · 주소: --api-base 또는 IMAGEMETA_API_BASE   (imagemeta --help)`;

const FLAGS = { '--no-cache': ['cacheDir', null], '--no-jsonld': ['jsonld', false], '--no-lang-from-html': ['langFromHtml', false], '--force': ['force', true],
  '--fill-empty-alt': ['fillEmpty', true], '--dry-run': ['dryRun', true], '--strict': ['strict', true], '--json': ['json', true], '--yes': ['yes', true] };
const VALUES = { '--api-base': 'apiBase', '--lang': 'lang', '--cache-dir': 'cacheDir', '--manifest': 'manifest', '--timeout': 'timeout', '--interval': 'interval',
  '--public-dir': 'publicDir', '--query': 'query', '--set': 'set', '--from': 'from', '--to': 'to' };

function parse(argv) {
  const o = { hosts: [], positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { o.help = true; continue; }
    if (a === '--api-key') throw new Error('API 키는 명령줄로 받지 않습니다 — IMAGEMETA_API_KEY 환경 변수에 넣으세요');
    if (a in FLAGS) { o[FLAGS[a][0]] = FLAGS[a][1]; continue; }
    if (a in VALUES || a === '--host') {
      const v = argv[++i];
      if (v === undefined || (v.startsWith('--') && a !== '--set')) throw new Error(`${a} 에 값이 필요합니다`);
      if (a === '--host') o.hosts.push(v); else o[VALUES[a]] = v;
      continue;
    }
    if (a.startsWith('--')) throw new Error(`모르는 옵션: ${a}`);
    o.positional.push(a);
  }
  return o;
}

const out = (o, data, human) => { if (o.json) process.stdout.write(JSON.stringify(data) + '\n'); else process.stdout.write(human(data) + '\n'); };
const log = (msg) => process.stderr.write(`[imagemeta] ${msg}\n`);

async function main() {
  let o;
  try { o = parse(process.argv.slice(2)); } catch (e) { log(e.message); process.stderr.write(USAGE + '\n'); return 2; }
  if (o.help || !o.positional.length) { process.stdout.write(USAGE + '\n'); return o.help ? 0 : 2; }
  const [cmd, ...args] = o.positional;
  const apiBase = o.apiBase || process.env.IMAGEMETA_API_BASE;
  const apiKey = process.env.IMAGEMETA_API_KEY || '';
  const lang = o.lang || process.env.IMAGEMETA_LANG || 'ko';
  const known = ['upload', 'wait', 'rewrite', 'list', 'describe', 'visibility', 'usage', 'sites', 'inject'];
  if (!known.includes(cmd)) { log(`모르는 명령: ${cmd}`); process.stderr.write(USAGE + '\n'); return 2; }
  if (!apiBase) { log('--api-base 또는 IMAGEMETA_API_BASE 가 필요합니다'); return 2; }
  if (cmd === 'inject') return injectCmd(o, args, apiBase, apiKey, lang);
  if (!apiKey) { log('IMAGEMETA_API_KEY 가 필요합니다 (콘솔 연동 → API 키에서 만든 키)'); return 2; }

  const client = api({ apiBase, apiKey });
  const common = { manifest: o.manifest, lang };
  try {
    switch (cmd) {
      case 'upload': {
        if (!args.length) { log('올릴 폴더나 파일을 주세요'); return 2; }
        const r = await upload(client, { ...common, paths: args, dryRun: o.dryRun });
        out(o, r, (x) => `올림 ${x.uploaded} · 그대로 ${x.unchanged} · 이미 있음 ${x.duplicate} · 실패 ${x.failed}${x.dryRun ? ' (dry-run: ' + x.items.filter((i) => i.result === 'would-upload').length + '개 올릴 예정)' : ''}`
          + x.items.filter((i) => i.result === 'failed').map((i) => `\n  실패 ${i.path}: ${i.error}`).join(''));
        return r.failed ? 1 : 0;
      }
      case 'wait': {
        const r = await wait(client, { ...common, timeoutSec: Number(o.timeout ?? 600), intervalSec: Number(o.interval ?? 10), onTick: (t) => log(`분석 ${t.done}/${t.total}`) });
        out(o, r, (x) => `분석 ${x.analyzed}/${x.total} · ${x.seconds}초${x.timedOut ? ' · 시간 초과' : ''}${x.failed.length ? ` · 실패 ${x.failed.join(', ')}` : ''}${x.missing.length ? ` · 서버에 없음 ${x.missing.join(', ')}` : ''}`);
        return r.ok ? 0 : 1;
      }
      case 'rewrite': {
        if (!args.length) { log('바꿀 소스 폴더나 파일을 주세요'); return 2; }
        const r = await rewrite(client, { ...common, srcPaths: args, publicDir: o.publicDir ?? 'public', dryRun: o.dryRun, query: o.query ?? '' });
        out(o, r, (x) => `파일 ${x.files} · 바뀐 파일 ${x.changedFiles}${x.dryRun ? '(dry-run, 안 씀)' : ''} · 바꾼 곳 ${x.replaced}`
          + x.changes.map((c) => `\n  ${c.file}:${c.line}  ${c.from} → ${c.to}`).join('') + x.skipped.map((s) => `\n  건너뜀 ${s.file}:${s.line}  ${s.reason}`).join(''));
        return 0;
      }
      case 'list': {
        const r = await list(client, common);
        out(o, r, (x) => x.items.map((i) => `${i.path}  ${i.id}  ${i.status}  ${i.visibility ?? ''}  ${i.alt ?? ''}`).join('\n') || '매니페스트가 비어 있습니다');
        return 0;
      }
      case 'describe': {
        if (!args[0]) { log('경로나 id 를 주세요'); return 2; }
        const r = await describe(client, { ...common, target: args[0], set: o.set });
        out(o, r, (x) => `${x.path ?? x.id}  ${x.status} · ${x.visibility} · ${x.origin ?? '설명 없음'}${x.updated ? ' · 고침' : ''}\n` + Object.entries(x.captions).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
        return 0;
      }
      case 'visibility': {
        const [value, ...targets] = args;
        if (!value || !targets.length) { log('imagemeta visibility <site|public|private> <경로|id…>'); return 2; }
        const r = await visibility(client, { ...common, value, targets, yes: o.yes });
        out(o, r, (x) => `${x.value}: ` + x.items.map((i) => `${i.id.slice(0, 8)} ${i.ok ? '바꿈' : '실패 ' + i.error}`).join(' · '));
        return r.items.every((i) => i.ok) ? 0 : 1;
      }
      case 'usage': {
        const r = await usage(client, { from: o.from, to: o.to });
        out(o, r, (x) => `${x.from} ~ ${x.to} · 플랜 ${x.plan}\n` + Object.entries(x.totals).map(([k, v]) => `  ${k}: ${v}${x.limits?.[k] ? ` / ${x.limits[k]} (${Math.round((v / x.limits[k]) * 100)}%)` : ''}`).join('\n')
          + (x.warnings?.length ? `\n  80% 넘음: ${x.warnings.join(', ')}` : ''));
        return 0;
      }
      case 'sites': {
        if (args[0] !== 'list') { log('사이트 키는 읽기만 됩니다: imagemeta sites list (만들기 · 수정은 콘솔에서 — AG-2)'); return 2; }
        const r = await sitesList(client);
        out(o, { items: r }, (x) => x.items.map((s) => `${s.label ?? '이름 없음'}  ${s.key}  ${s.origins.join(', ')}${s.revoked ? '  (폐기)' : ''}`).join('\n') || '사이트 키 없음');
        return 0;
      }
    }
  } catch (e) {
    if (e.usage) { log(e.message); return 2; }
    const msg = String(e.message || e).split(apiKey || '\u0000').join('***');
    if (o.json) process.stdout.write(JSON.stringify({ error: { code: e.code || 'ERROR', message: msg, retryable: Boolean(e.retryable), status: e.status ?? null } }) + '\n');
    log(`실패${e.code ? ` (${e.code})` : ''}: ${msg}`);
    return 1;
  }
  return 0;
}

async function injectCmd(o, args, apiBase, apiKey, lang) {
  const dir = args[0];
  if (!dir) { log('빌드 결과 폴더를 주세요'); return 2; }
  try { if (!(await stat(dir)).isDirectory()) throw new Error(); } catch { log(`폴더가 없습니다: ${dir}`); return 2; }
  if (!apiKey) log('IMAGEMETA_API_KEY 가 없습니다 — public 이미지만 설명을 받습니다');
  try {
    const r = await injectDir(dir, { apiBase, apiKey, lang, langFromHtml: o.langFromHtml, jsonld: o.jsonld, force: o.force, fillEmpty: o.fillEmpty,
      dryRun: o.dryRun, cacheDir: o.cacheDir, imageHosts: o.hosts.length ? o.hosts : undefined });
    out(o, r, (x) => `[imagemeta] 페이지 ${x.pages} · 바뀐 페이지 ${x.changedPages}${x.dryRun ? '(dry-run, 안 씀)' : ''} · alt ${x.altAdded}개 넣음 · 건너뜀 ${x.altSkipped}`
      + ` · 요청 ${x.requests}회 · 받음 ${x.fetched} · 캐시 ${x.cached} · 없음 ${x.missing} · 언어 ${x.langs.map((l) => `${l.lang}:${l.images}`).join(' ') || '-'}`
      + x.files.map((f) => `\n  ${f.file} (${f.lang}) alt +${f.altAdded}`).join(''));
    return 0;
  } catch (e) {
    const msg = String(e && e.message || e).split(apiKey || '\u0000').join('***');
    if (o.strict) { log(`실패: ${msg}`); return 1; }
    log(`메타를 받지 못해 아무것도 바꾸지 않았습니다(빌드는 계속): ${msg}`);
    return 0;
  }
}

process.exitCode = await main();
