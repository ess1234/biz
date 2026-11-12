// Vue 픽스처 검사 — 가짜 메타 서버(실제 /meta:batch 와 같은 응답 모양)로 vite build 를 2번 돌려 dist 를 본다. DB · 네트워크 없음.
// 실행: node check.mjs   (biz 루트에서 npm install 이 되어 있어야 함)
// 실제 서버로 확인하려면 dos/scripts/biz_client_fixture.py 처럼 임시 계정을 만들어야 한다(DB 쓰기).
import http from 'node:http';
import { readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const ID = { static: '11111111-1111-4111-8111-111111111111', slug: '22222222-2222-4222-8222-222222222222', child: '33333333-3333-4333-8333-333333333333',
  dyn: '44444444-4444-4444-8444-444444444444', priv: '99999999-9999-4999-8999-999999999999' };
const META = {   // dos routes_meta._meta 와 같은 필드
  [ID.static]: { alt: '주황 머그컵', rev: 3001, keywords: ['머그컵', '주황'] },
  [ID.slug]: { alt: '초록 텐트 "야외"용', rev: 2000, keywords: ['텐트'] },   // 따옴표 escape 검사
  [ID.child]: { alt: '파란 의자', rev: 1000, keywords: ['의자'] },
  [ID.dyn]: { alt: '런타임 상품', rev: 1000, keywords: [] },
};
const KEY = 'imk_fixture_secret_should_not_leak';
const seen = { requests: 0, ids: [], auth: new Set() };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/t23/v1/meta:batch') { res.writeHead(404).end(); return; }
  seen.requests++; seen.auth.add(req.headers.authorization || '');
  const ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean);
  seen.ids.push(...ids);
  const lang = u.searchParams.get('lang');
  const items = ids.filter((i) => META[i]).map((i) => ({
    id: i, rev: META[i].rev, visibility: 'site', alt: META[i].alt, captions: { [lang]: META[i].alt }, keywords: META[i].keywords, width: 800, height: 600,
    src: `https://img.example-cdn.test/i/${i}`,
    ...(u.searchParams.get('jsonld') === '1' ? { jsonld: { '@context': 'https://schema.org', '@type': 'ImageObject', contentUrl: `https://img.example-cdn.test/i/${i}`, caption: META[i].alt } } : {}),
  }));
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ items, missing: ids.filter((i) => !META[i]) }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/t23/v1`;

const pass = [], fail = [];
const check = (name, ok, info = '') => { (ok ? pass : fail).push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? `  ${info}` : ''}`); };

async function runBuild() {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try {
    process.env.IMAGEMETA_API_BASE = base; process.env.IMAGEMETA_API_KEY = KEY; process.env.IMAGEMETA_LANG = 'ko';
    await build({ root: here, configFile: join(here, 'vite.config.js'), logLevel: 'silent' });
  } finally { console.log = orig; }
  const html = await readFile(join(here, 'dist/index.html'), 'utf8');
  const assets = join(here, 'dist/assets');
  let js = '';
  for (const f of await readdir(assets)) if (f.endsWith('.js')) js += await readFile(join(assets, f), 'utf8');
  return { html, js, log: logs.join('\n') };
}

try {
  await rm(join(here, '.cache'), { recursive: true, force: true });
  const b1 = await runBuild();
  check('1회 빌드: 메타 요청 1회 · 소스의 /i/{id} 5개를 한 번에', seen.requests === 1 && new Set(seen.ids).size === 5, `requests=${seen.requests} ids=${new Set(seen.ids).size}`);
  check('API 키는 Authorization: ApiKey 로만', [...seen.auth].every((a) => a === `ApiKey ${KEY}`));
  check('dist 에 API 키 없음', !b1.html.includes(KEY) && !b1.js.includes(KEY));

  const h = b1.html;
  check('index.html: 정적 img 에 alt 주황 머그컵 + data-meta-rev', /<img id="h-static"[^>]*alt="주황 머그컵"[^>]*data-meta-rev="3001"/.test(h), (h.match(/<img id="h-static"[^>]*>/) || [''])[0]);
  const ld = h.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  check('index.html: JSON-LD ImageObject 1개', Boolean(ld) && ld[1].includes('"ImageObject"') && ld[1].includes('주황 머그컵'), ld ? ld[1].slice(0, 80) : '없음');

  // .vue 템플릿은 컴파일된 JS 로 나간다 — 문자열로 1차 확인, DOM 은 미리보기로 2차 확인
  const j = b1.js;
  check('App.vue 정적 img → alt 주황 머그컵', j.includes('주황 머그컵'));
  check('App.vue 꾸밈말·쿼리 주소 → alt 초록 텐트 (따옴표 escape)', j.includes('초록 텐트 &quot;야외&quot;용') || j.includes('초록 텐트 \\"야외\\"용') || j.includes('초록 텐트 "야외"용'));
  check('자식 컴포넌트 ProductCard.vue → alt 파란 의자', j.includes('파란 의자'));
  check('손으로 쓴 alt 유지', j.includes('손으로 쓴 설명'));
  check(':src 바인딩(런타임 데이터)은 손대지 않음 — 런타임 상품 alt 없음', !j.includes('런타임 상품'));
  check('비공개(missing)는 alt 없음', !/99999999-9999-4999-8999-999999999999[^}]{0,200}alt/.test(j));
  const count = (s) => j.split(s).length - 1;
  check(':alt 바인딩 img 는 덮지 않음 — 초록 텐트 alt 는 1곳(slug img)만', count('초록 텐트') === 1, `count=${count('초록 텐트')}`);

  const before = seen.requests;
  const b2 = await runBuild();
  check('2회 빌드: 메타 요청 0회(캐시)', seen.requests === before, `requests +${seen.requests - before}`);
  check('2회 빌드 결과 동일', b2.html === b1.html && b2.js === b1.js);
} finally {
  server.close();
}
console.log(`\n${pass.length}/${pass.length + fail.length} 통과`);
process.exit(fail.length ? 1 : 0);
