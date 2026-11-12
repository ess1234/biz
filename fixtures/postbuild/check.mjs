// 빌드 뒤 주입 CLI(imagemeta inject) 검사 — Next 정적 export(out/) · webpack(dist/) 결과물을 흉내 낸 폴더를 임시 폴더에 복사해
// 실제 CLI 를 자식 프로세스로 돌린다. 메타는 가짜 서버(실제 /meta:batch 와 같은 응답 모양). DB · 네트워크 없음.
// 실행: node check.mjs
import { execFile } from 'node:child_process';
import http from 'node:http';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '../../packages/core/bin/imagemeta.js');
const KEY = 'imk_postbuild_secret_should_not_leak';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333', P = '99999999-9999-4999-8999-999999999999';
let META = {
  [A]: { rev: 1000, cap: { ko: '주황 머그컵', en: 'Orange mug' } },
  [B]: { rev: 1000, cap: { ko: '초록 텐트 & "타프"', en: 'Green tent' } },
  [C]: { rev: 1000, cap: { ko: '파란 의자', en: 'Blue chair' } },
};
let fail500 = false;
const seen = { requests: 0, langs: [], auth: new Set() };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/t23/v1/meta:batch') { res.writeHead(404).end(); return; }
  seen.requests++; seen.auth.add(req.headers.authorization || ''); seen.langs.push(u.searchParams.get('lang'));
  if (fail500) { res.writeHead(500).end('boom'); return; }
  const lang = u.searchParams.get('lang') || 'ko';
  const ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean);
  const items = ids.filter((i) => META[i]).map((i) => {
    const alt = META[i].cap[lang] || META[i].cap.ko;
    return { id: i, rev: META[i].rev, visibility: 'site', alt, captions: META[i].cap, keywords: [], width: 800, height: 600, src: `https://img.example-cdn.test/i/${i}`,
      jsonld: { '@context': 'https://schema.org', '@type': 'ImageObject', contentUrl: `https://img.example-cdn.test/i/${i}`, caption: alt } };
  });
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ items, missing: ids.filter((i) => !META[i]) }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/t23/v1`;

const pass = [], fail = [];
const check = (name, ok, info = '') => { (ok ? pass : fail).push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? `  ${info}` : ''}`); };
const run = (args, env = {}) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { env: { ...process.env, IMAGEMETA_API_KEY: KEY, ...env }, encoding: 'utf8' },
  (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr })));
const tag = (html, needle) => (html.match(new RegExp(`<img\\b[^>]*${needle}[^>]*>`, 'i')) || [''])[0];
const lds = (html) => html.match(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g) || [];

const work = await mkdtemp(join(tmpdir(), 'imagemeta-postbuild-'));
try {
  /* ───────── Next 정적 export ───────── */
  const out = join(work, 'out'); await cp(join(here, 'next-export'), out, { recursive: true });
  const cache = join(work, 'cache');
  let r = await run(['inject', out, '--api-base', base, '--cache-dir', cache, '--json']);
  const rep = JSON.parse(r.out.trim().split('\n').pop());
  check('Next: 종료 0 · 페이지 2 · 언어 ko·en 각 1회 요청', r.code === 0 && rep.pages === 2 && seen.requests === 2 && seen.langs.sort().join() === 'en,ko', `requests=${seen.requests} langs=${seen.langs}`);
  check('API 키는 Authorization: ApiKey 로만 · 출력에 키 없음', [...seen.auth].every((a) => a === `ApiKey ${KEY}`) && !r.out.includes(KEY));
  let ko = await readFile(join(out, 'index.html'), 'utf8');
  check('Next ko: alt="" 는 기본으로 유지(꾸밈 이미지일 수 있음)', /alt=""/.test(tag(ko, A)) && !tag(ko, A).includes('data-meta-rev'), tag(ko, A).slice(0, 90));
  check('Next ko: 손으로 쓴 alt 유지', tag(ko, B).includes('alt="손으로 쓴 대표 사진"') && !tag(ko, B).includes('data-meta-rev'));
  check('Next ko: alt 없는 img(꾸밈말·&amp; 쿼리) → alt 파란 의자 + rev, 자기닫힘 유지', tag(ko, C).includes('alt="파란 의자" data-meta-rev="1000" />'), tag(ko, C).slice(-60));
  const koLd = lds(ko);
  check('Next ko: 고객 JSON-LD(Organization) 유지 + 우리 것 1개(data-imagemeta)', koLd.length === 2 && koLd.some((s) => s.includes('Organization')) && koLd.filter((s) => s.includes('data-imagemeta')).length === 1);
  let en = await readFile(join(out, 'en/index.html'), 'utf8');
  check('Next en: <html lang="en-US"> → 영어 alt Blue chair', tag(en, C).includes('alt="Blue chair"'), tag(en, C).slice(-50));
  check('Next: JS 번들은 그대로', (await readFile(join(out, '_next/static/chunks/app.js'), 'utf8')) === (await readFile(join(here, 'next-export/_next/static/chunks/app.js'), 'utf8')));

  // --fill-empty-alt: Next <Image alt=""> 채우기
  const before = seen.requests;
  r = await run(['inject', out, '--api-base', base, '--cache-dir', cache, '--fill-empty-alt']);
  ko = await readFile(join(out, 'index.html'), 'utf8'); en = await readFile(join(out, 'en/index.html'), 'utf8');
  check('--fill-empty-alt: alt="" → 주황 머그컵 / Orange mug, alt 속성 하나만', tag(ko, A).includes('alt="주황 머그컵"') && (tag(ko, A).match(/\balt=/g) || []).length === 1 && tag(en, A).includes('alt="Orange mug"'), tag(ko, A).slice(0, 80));
  check('다시 돌리면 캐시 — 요청 0회', seen.requests === before, `+${seen.requests - before}`);

  // 같은 폴더에 또: 바뀔 것 없음 · JSON-LD 중복 없음
  const snap = ko;
  r = await run(['inject', out, '--api-base', base, '--cache-dir', cache, '--fill-empty-alt', '--json']);
  check('세 번째 실행: 바뀐 페이지 0 · 파일 동일 · JSON-LD 중복 없음', JSON.parse(r.out.trim().split('\n').pop()).changedPages === 0 && (await readFile(join(out, 'index.html'), 'utf8')) === snap && lds(snap).length === 2);

  // 설명이 바뀌면(rev↑) 우리가 넣은 alt 만 갱신, 손으로 쓴 alt 는 그대로
  META = { ...META, [C]: { rev: 1001, cap: { ko: '파란 의자 (새 설명)', en: 'Blue chair v2' } } };
  r = await run(['inject', out, '--api-base', base, '--no-cache']);
  ko = await readFile(join(out, 'index.html'), 'utf8');
  check('rev 1000→1001: 우리 alt 갱신 · data-meta-rev 1001 · 속성 중복 없음', tag(ko, C).includes('alt="파란 의자 (새 설명)" data-meta-rev="1001"') && (tag(ko, C).match(/data-meta-rev/g) || []).length === 1);
  check('rev 바뀌어도 손으로 쓴 alt 는 그대로', tag(ko, B).includes('alt="손으로 쓴 대표 사진"'));
  check('JSON-LD 도 새 설명으로 바뀌고 여전히 1개', lds(ko).filter((s) => s.includes('data-imagemeta')).length === 1 && lds(ko).some((s) => s.includes('새 설명')));

  /* ───────── webpack dist ───────── */
  const dist = join(work, 'dist'); await cp(join(here, 'webpack-dist'), dist, { recursive: true });
  const original404 = await readFile(join(dist, '404.html'), 'utf8');
  // dry-run: 쓰지 않음
  r = await run(['inject', dist, '--api-base', base, '--no-cache', '--dry-run', '--json']);
  const dry = JSON.parse(r.out.trim().split('\n').pop());
  check('dry-run: 바뀔 페이지 2개 보고 · 파일은 그대로', dry.changedPages === 2 && dry.dryRun && (await readFile(join(dist, 'index.html'), 'utf8')) === (await readFile(join(here, 'webpack-dist/index.html'), 'utf8')), `changed=${dry.changedPages}`);
  r = await run(['inject', dist, '--api-base', base, '--no-cache', '--lang', 'ko']);
  const w = await readFile(join(dist, 'index.html'), 'utf8');
  check('webpack: 대문자 <IMG SRC=\'…\'> 도 alt (태그 이름은 소문자 <img> 로 바뀜)', /<img SRC='[^']*11111111[^']*' class="hero" alt="주황 머그컵"/.test(w), tag(w, A).slice(0, 90));
  check('webpack: <picture> 안 img 에 alt, & " 는 escape', tag(w, `src="[^"]*${B}`).includes('alt="초록 텐트 &amp; &quot;타프&quot;"'), tag(w, `src="[^"]*${B}`).slice(-70));
  check('webpack: 비공개(missing) alt 없음 · 남의 이미지 그대로', !tag(w, P).includes('alt=') && w.includes('<img src="https://example.com/logo.png">'));
  check('webpack: data-src(지연 로딩 라이브러리)도 alt — 나중에 src 로 바뀌어도 alt 유지', tag(w, 'data-src').includes('alt="파란 의자 (새 설명)"') /* 위에서 C 의 설명을 바꿨다 */, tag(w, 'data-src').slice(-60));
  const tent = await readFile(join(dist, 'products/tent.html'), 'utf8');
  check('webpack: 하위 폴더 페이지 · <html lang> 없음 → --lang ko', tent.includes('alt="초록 텐트 &amp; &quot;타프&quot;"'));
  check('webpack: 이미지 없는 404.html 은 손대지 않음', (await readFile(join(dist, '404.html'), 'utf8')) === original404);

  /* ───────── 실패 정책 ───────── */
  const dist2 = join(work, 'dist2'); await cp(join(here, 'webpack-dist'), dist2, { recursive: true });
  fail500 = true;
  r = await run(['inject', dist2, '--api-base', base, '--no-cache']);
  check('메타 서버 500: 경고만 · 종료 0 · 파일 그대로(빌드 안 막음)', r.code === 0 && /받지 못해/.test(r.out) && (await readFile(join(dist2, 'index.html'), 'utf8')) === (await readFile(join(here, 'webpack-dist/index.html'), 'utf8')));
  r = await run(['inject', dist2, '--api-base', base, '--no-cache', '--strict']);
  check('메타 서버 500 + --strict: 종료 1 · 출력에 키 없음', r.code === 1 && !r.out.includes(KEY), `code=${r.code}`);
  fail500 = false;
  r = await run(['inject', join(work, 'nope'), '--api-base', base]);
  check('없는 폴더: 종료 2', r.code === 2);
  r = await run(['inject', dist2], { IMAGEMETA_API_BASE: '' });
  check('api-base 없음: 종료 2', r.code === 2);
  r = await run(['inject', dist2, '--api-base', base, '--api-key', 'x']);
  check('--api-key 를 명령줄로 주면 거절(기록에 남지 않게): 종료 2', r.code === 2 && /환경 변수/.test(r.out));
} finally {
  server.close();
  await rm(work, { recursive: true, force: true });
}
console.log(`\n${pass.length}/${pass.length + fail.length} 통과`);
process.exit(fail.length ? 1 : 0);
