// 에이전트용 명령 검사 (biz-dev-09 1단계) — upload · wait · rewrite · list · describe · visibility · usage · sites list.
// project/ 를 임시 폴더에 복사하고 이미지 바이트를 만든 뒤, 실제 CLI 를 자식 프로세스로 돌린다.
// 서버는 가짜(실제 dos 와 같은 경로 · 응답 모양 · 상태 흐름: registered → backed_up → analyzed). DB · 네트워크 없음.
// 실행: node check.mjs
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '../../packages/core/bin/imagemeta.js');
const KEY = 'imk_agent_secret_should_not_leak';

/* ───────── 가짜 서버 ───────── */
const S = { assets: new Map(), bySha: new Map(), aiOn: false, limit: false, analyzeAfter: 2, pageCap: 2, log: [], puts: 0 };
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const err = (res, code, c, message, extra = {}) => json(res, code, { code: c, message, retryable: false, details: null, ...extra });
const body = (req) => new Promise((r) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => r(Buffer.concat(b))); });
const IMG = 'https://img.example-cdn.test';
const summary = (a) => ({ id: a.id, status: a.status, visibility: a.visibility, caption: a.cap.ko ?? null, file_name: a.file_name, created_at: a.created_at, has_thumb: a.status !== 'registered' });
function tick() {   // 목록을 부를 때마다 분석이 한 걸음 진행 (실제: 완료 뒤 작업 큐가 돌며 analyzed)
  if (!S.aiOn) return;
  for (const a of S.assets.values()) if (a.status === 'backed_up' && ++a.ticks >= S.analyzeAfter) {
    a.status = a.file_name.startsWith('broken') ? 'failed' : 'analyzed';
    if (a.status === 'analyzed') { a.cap = { ko: `AI 설명 ${a.file_name}`, en: `AI caption ${a.file_name}` }; a.analysis_version = 1; a.sources = ['ai']; }
  }
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(/^\/t23\/v1/, ''); const b = await body(req);
  S.log.push(`${req.method} ${p}`);
  if (p.startsWith('/storage/put/')) {   // Supabase 서명 업로드 흉내
    const id = p.split('/').pop(); const a = S.assets.get(id);
    if (!a || req.headers.authorization !== `Bearer tok-${id}` || req.headers['content-type'] !== a.mime) return err(res, 400, 'BAD_PUT', 'token/content-type');
    if (createHash('sha256').update(b).digest('hex') !== a.sha) return err(res, 400, 'BAD_PUT', 'sha');
    a.uploaded = true; S.puts++; return json(res, 200, { Key: id });
  }
  if (req.headers.authorization !== `ApiKey ${KEY}`) return err(res, 401, 'AUTH_INVALID', 'key');
  if (req.headers['x-t23-device']) return err(res, 400, 'UNEXPECTED_DEVICE', 'CLI 는 기기 헤더를 보내지 않는다');
  const j = b.length ? JSON.parse(b.toString()) : {};
  if (req.method === 'POST' && p === '/assets:batch') {
    const items = j.items.map((it) => {
      const sha = it.sha256.toLowerCase();
      if (S.bySha.has(sha)) { const a = S.assets.get(S.bySha.get(sha)); return { local_id: it.local_id, asset_id: a.id, dup: true, upload_required: a.status === 'registered' }; }
      const a = { id: randomUUID(), sha, mime: it.mime, bytes: it.bytes, file_name: it.file_name, status: 'registered', visibility: 'site', cap: {}, ticks: 0, manual_version: 0, analysis_version: 0, sources: [], created_at: new Date(Date.now() + S.assets.size).toISOString() };
      S.assets.set(a.id, a); S.bySha.set(sha, a.id); return { local_id: it.local_id, asset_id: a.id, dup: false, upload_required: true };
    });
    return json(res, 200, { items });
  }
  if (req.method === 'POST' && p === '/uploads:batch') {
    if (S.limit) return err(res, 429, 'LIMIT_EXCEEDED', '체험 요금제 저장 한도를 넘었습니다');
    return json(res, 200, { items: j.asset_ids.map((id) => ({ asset_id: id, skip: false, url: `${base}/storage/put/${id}`, headers: { 'content-type': S.assets.get(id).mime, 'x-upsert': 'false' }, token: `tok-${id}` })) });
  }
  if (req.method === 'POST' && p === '/uploads:complete-batch') {
    return json(res, 200, { items: j.asset_ids.map((id) => { const a = S.assets.get(id); if (!a?.uploaded) return { id, ok: false, error: { code: 'NOT_UPLOADED', message: '파일 없음' } }; a.status = 'backed_up'; return { id, ok: true, status: 'backed_up' }; }) });
  }
  if (req.method === 'GET' && p === '/settings') return json(res, 200, { ai_consent_at: S.aiOn ? '2026-11-13T00:00:00Z' : null });
  if (req.method === 'GET' && p === '/assets') {
    tick();
    const all = [...S.assets.values()].sort((x, y) => y.created_at.localeCompare(x.created_at));
    const start = Number(u.searchParams.get('cursor') || 0); const n = Math.min(Number(u.searchParams.get('limit') || 100), S.pageCap);
    const page = all.slice(start, start + n);
    return json(res, 200, { items: page.map(summary), next_cursor: start + n < all.length ? String(start + n) : null });
  }
  let m = p.match(/^\/assets\/([0-9a-f-]{36})$/);
  if (m && req.method === 'GET') { const a = S.assets.get(m[1]); if (!a) return err(res, 404, 'NOT_FOUND', '없음'); return json(res, 200, { ...summary(a), manual_version: a.manual_version, chosen: { caption: a.cap, details: { keywords: ['테스트'] } }, analyses: a.sources.map((s) => ({ source: s })) }); }
  if (m && req.method === 'PATCH') {
    const a = S.assets.get(m[1]); if (!a) return err(res, 404, 'NOT_FOUND', '없음');
    if ((j.base_version ?? 0) < a.manual_version) return err(res, 409, 'CONFLICT_STALE', '먼저 바뀜');
    if (j.caption) { a.cap = { ...a.cap, ...j.caption }; a.manual_version++; if (!a.sources.includes('manual')) a.sources.push('manual'); }
    return json(res, 200, { ...summary(a), manual_version: a.manual_version, chosen: { caption: a.cap } });
  }
  if (req.method === 'POST' && p === '/assets:batch-visibility') { return json(res, 200, { items: j.ids.map((id) => { const a = S.assets.get(id); if (!a) return { id, ok: false, error: { message: '없음' } }; a.visibility = j.visibility; return { id, ok: true }; }) }); }
  if (req.method === 'GET' && p === '/meta:batch') {
    const ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean); const lang = u.searchParams.get('lang') || 'ko';
    const ok = ids.map((i) => S.assets.get(i)).filter((a) => a && a.visibility !== 'private');
    return json(res, 200, { items: ok.map((a) => ({ id: a.id, rev: a.analysis_version * 1000 + a.manual_version, visibility: a.visibility, alt: a.cap[lang] ?? a.cap.ko ?? null, src: `${IMG}/i/${a.id}` })), missing: ids.filter((i) => !ok.find((a) => a.id === i)) });
  }
  if (req.method === 'GET' && p === '/usage') return json(res, 200, { from: '2026-11-01', to: '2026-11-13', plan: 'trial', totals: { storage_bytes: 900, egress_bytes: 10 }, limits: { storage_bytes: 1000, egress_bytes: null }, overage_policy: 'block', warnings: ['storage_bytes'], days: [] });
  if (req.method === 'GET' && p === '/site-keys') return json(res, 200, { items: [{ id: 'k1', key: 'pk_demo', label: '본점', allowed_origins: ['https://shop.example.com'], allowed_variants: ['w=400'], revoked_at: null, created_at: '2026-11-01' }] });
  return err(res, 404, 'NOT_FOUND', `${req.method} ${p}`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/t23/v1`;

/* ───────── 도우미 ───────── */
const pass = [], fail = [];
const check = (name, ok, info = '') => { (ok ? pass : fail).push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? `  ${info}` : ''}`); };
let cwd;
const run = (args, env = {}) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args, '--api-base', base], { cwd, env: { ...process.env, IMAGEMETA_API_KEY: KEY, ...env }, encoding: 'utf8' },
  (e, stdout, stderr) => resolve({ code: e ? e.code ?? 1 : 0, out: stdout, err: stderr })));
const J = (r) => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return {}; } };
const manifest = async () => JSON.parse(await readFile(join(cwd, 'imagemeta.json'), 'utf8'));
const calls = (prefix) => S.log.filter((l) => l.startsWith(prefix)).length;

const work = await mkdtemp(join(tmpdir(), 'imagemeta-agent-'));
try {
  cwd = join(work, 'project');
  await cp(join(here, 'project'), cwd, { recursive: true });
  const img = (name, seed) => writeFile(join(cwd, name), Buffer.from(`fake-image ${seed} ${'x'.repeat(64)}`));
  await img('public/images/hero.jpg', 'hero'); await img('public/images/tent.png', 'tent'); await img('public/images/secret.jpg', 'secret'); await img('src/assets/chair.webp', 'chair');

  /* upload */
  let r = await run(['upload', 'public/images', 'src/assets', '--json']); let x = J(r);
  check('upload: 4장 올림(README.txt 는 건너뜀) · 종료 0', r.code === 0 && x.uploaded === 4 && x.failed === 0, `uploaded=${x.uploaded}`);
  check('upload: 서명 URL PUT 4번 · 바이트 sha256 일치 · 토큰 · content-type', S.puts === 4);
  let mf = await manifest();
  const keys = Object.keys(mf.images);
  check('매니페스트: 경로 4개 · 키 정렬 · id · sha256 · backed_up', keys.join() === [...keys].sort().join() && keys.length === 4 && keys.every((k) => mf.images[k].id && mf.images[k].sha256 && mf.images[k].status === 'backed_up'), keys.join(' '));
  check('출력 · 오류에 키 없음, 기기 헤더 안 보냄', !r.out.includes(KEY) && !r.err.includes(KEY) && !S.log.some((l) => l.includes('UNEXPECTED')));

  const before = calls('POST /assets:batch');
  r = await run(['upload', 'public/images', 'src/assets', '--json']); x = J(r);
  check('다시 upload: 4장 그대로 · 서버에 등록 요청 0', x.unchanged === 4 && calls('POST /assets:batch') === before, `unchanged=${x.unchanged}`);

  await img('public/images/tent.png', 'tent v2');
  const oldTent = mf.images['public/images/tent.png'].id;
  r = await run(['upload', 'public/images', '--json']); x = J(r); mf = await manifest();
  check('내용이 바뀐 tent.png 만 다시 올림 → 새 id', x.uploaded === 1 && x.unchanged === 2 && mf.images['public/images/tent.png'].id !== oldTent);

  await copyFile(join(cwd, 'public/images/hero.jpg'), join(cwd, 'public/images/hero-copy.jpg'));
  const puts = S.puts;
  r = await run(['upload', 'public/images/hero-copy.jpg', '--json']); x = J(r); mf = await manifest();
  check('같은 내용의 다른 파일: 이미 있음(같은 id) · PUT 없음', x.duplicate === 1 && S.puts === puts && mf.images['public/images/hero-copy.jpg'].id === mf.images['public/images/hero.jpg'].id);

  await img('public/images/new.jpg', 'new');
  const snapshot = await readFile(join(cwd, 'imagemeta.json'), 'utf8'); const regs = calls('POST /assets:batch');
  r = await run(['upload', 'public/images', '--dry-run', '--json']); x = J(r);
  check('upload --dry-run: 올릴 것만 보고 · 서버 호출 · 매니페스트 변화 없음', x.items.filter((i) => i.result === 'would-upload').length === 1 && calls('POST /assets:batch') === regs && (await readFile(join(cwd, 'imagemeta.json'), 'utf8')) === snapshot);
  await rm(join(cwd, 'public/images/new.jpg'));

  /* visibility */
  r = await run(['visibility', 'private', 'public/images/secret.jpg']);
  check('visibility private: --yes 없으면 거절 · 종료 2', r.code === 2 && /--yes/.test(r.err));
  r = await run(['visibility', 'private', 'public/images/secret.jpg', '--yes', '--json']); mf = await manifest();
  check('visibility private --yes: 바뀜 · 매니페스트 반영', r.code === 0 && mf.images['public/images/secret.jpg'].visibility === 'private');

  /* wait */
  r = await run(['wait', '--json']);
  check('wait: AI 분석이 꺼져 있으면 바로 실패(종료 1 · AI_OFF)', r.code === 1 && J(r).error?.code === 'AI_OFF', r.err.trim().slice(0, 80));
  S.aiOn = true;
  const lists = calls('GET /assets');
  r = await run(['wait', '--interval', '0.05', '--json']); x = J(r); mf = await manifest();
  check('wait: 모두 analyzed · 종료 0', r.code === 0 && x.ok && x.analyzed === x.total && x.total === 5, `analyzed=${x.analyzed}/${x.total}`);
  check('wait: 목록을 쪽 단위로 넘김(cursor) · 여러 번 폴링', calls('GET /assets') - lists >= 4, `GET /assets ${calls('GET /assets') - lists}회`);
  check('wait 뒤 매니페스트: site 이미지는 영구 주소 · rev, private 은 주소 없음', mf.images['public/images/hero.jpg'].url?.startsWith(IMG + '/i/') && mf.images['public/images/hero.jpg'].rev === 1000 && !mf.images['public/images/secret.jpg'].url);

  S.analyzeAfter = 1000;
  await img('public/images/slow.jpg', 'slow');
  await run(['upload', 'public/images/slow.jpg']);
  r = await run(['wait', '--interval', '0.05', '--timeout', '0.3', '--json']); x = J(r);
  check('wait --timeout: 끝나지 않으면 시간 초과 · 종료 1 · 남은 이미지 보고', r.code === 1 && x.timedOut && x.pending.includes('public/images/slow.jpg'));
  S.analyzeAfter = 1; await run(['wait', '--interval', '0.05']);

  /* rewrite */
  const before1 = await readFile(join(cwd, 'src/App.jsx'), 'utf8');
  r = await run(['rewrite', 'src', 'index.html', '--dry-run', '--json']); x = J(r);
  check('rewrite --dry-run: 바꿀 곳 보고 · 파일 그대로', x.replaced >= 6 && (await readFile(join(cwd, 'src/App.jsx'), 'utf8')) === before1, `replaced=${x.replaced}`);
  r = await run(['rewrite', 'src', 'index.html', '--json']); x = J(r); mf = await manifest();
  const hero = mf.images['public/images/hero.jpg'].url, tent = mf.images['public/images/tent.png'].url, chair = mf.images['src/assets/chair.webp'].url;
  const app = await readFile(join(cwd, 'src/App.jsx'), 'utf8'), data = await readFile(join(cwd, 'src/data.js'), 'utf8'), css = await readFile(join(cwd, 'src/styles.css'), 'utf8');
  const html = await readFile(join(cwd, 'index.html'), 'utf8'), vue = await readFile(join(cwd, 'src/components/Card.vue'), 'utf8');
  check('JSX "/images/hero.jpg" → 영구 주소', app.includes(`src="${hero}"`));
  check('import 줄은 그대로 + 건너뜀 보고', app.includes("import chairUrl from './assets/chair.webp'") && x.skipped.some((s) => /import/.test(s.reason)));
  check('비공개 secret.jpg 는 그대로 + 건너뜀 보고', app.includes("'/images/secret.jpg'") && x.skipped.some((s) => s.text === '/images/secret.jpg'));
  check('상대 경로(./assets/chair.webp · ../assets/chair.webp) → 영구 주소', data.includes(`'${chair}'`) && vue.includes(`src="${chair}"`));
  check('템플릿 문자열 `/images/tent.png` → 새 tent 주소', data.includes('`' + tent + '`'));
  check('CSS url(/images/tent.png) · url("/images/hero.jpg") → 영구 주소', css.includes(`url(${tent})`) && css.includes(`url("${hero}")`));
  check('index.html: hero 바뀜 · 매니페스트에 없는 /images/unknown.jpg 그대로', html.includes(`src="${hero}"`) && html.includes('src="/images/unknown.jpg"'));
  r = await run(['rewrite', 'src', 'index.html', '--json']); x = J(r);
  check('rewrite 다시: 바꿀 곳 0 (멱등)', x.replaced === 0 && x.changedFiles === 0);

  /* describe · list · usage · sites */
  r = await run(['describe', 'public/images/hero.jpg', '--json']); x = J(r);
  check('describe: 설명 · 출처 ai', x.captions?.ko === 'AI 설명 hero.jpg' && x.origin === 'ai');
  r = await run(['describe', 'public/images/hero.jpg', '--set', '주황 머그컵 정면', '--lang', 'ko', '--json']); x = J(r);
  const heroId = mf.images['public/images/hero.jpg'].id;
  check('describe --set: 서버 설명 고침 · 출처 manual · base_version 맞음(409 없음)', x.captions?.ko === '주황 머그컵 정면' && x.origin === 'manual' && S.assets.get(heroId).cap.ko === '주황 머그컵 정면');
  r = await run(['list', '--json']); x = J(r);
  check('list: 매니페스트 6장 · 서버 상태 · alt', x.items?.length === 6 && x.items.find((i) => i.path === 'public/images/hero.jpg')?.alt === '주황 머그컵 정면', `items=${x.items?.length}`);
  r = await run(['usage', '--json']); x = J(r);
  check('usage: 사용량 · 80% 경고 그대로 전달', r.code === 0 && x.warnings?.includes('storage_bytes'));
  r = await run(['sites', 'list', '--json']); x = J(r);
  check('sites list: 사이트 키 · 허용 출처(읽기)', x.items?.[0]?.origins?.[0] === 'https://shop.example.com');
  r = await run(['sites', 'create']);
  check('sites create: 거절(콘솔에서 — AG-2) · 종료 2', r.code === 2 && /콘솔/.test(r.err));

  /* 실패 정책 */
  S.limit = true;
  await img('public/images/over.jpg', 'over');
  const prevCount = Object.keys((await manifest()).images).length;
  r = await run(['upload', 'public/images/over.jpg', '--json']); x = J(r);
  check('한도 초과(429 LIMIT_EXCEEDED): 종료 1 · JSON 오류 코드 · 매니페스트 보존', r.code === 1 && x.error?.code === 'LIMIT_EXCEEDED' && Object.keys((await manifest()).images).length === prevCount && prevCount === 6, `before=${prevCount}`);
  S.limit = false;
  r = await run(['list'], { IMAGEMETA_API_KEY: '' });
  check('키 없음: 종료 2', r.code === 2 && /IMAGEMETA_API_KEY/.test(r.err));
  r = await run(['list', '--api-key', 'x']);
  check('--api-key 명령줄: 거절 · 종료 2', r.code === 2);
  r = await run(['upload', 'index.html']);
  check('이미지가 아닌 파일 upload: 종료 2', r.code === 2);
} finally {
  server.close();
  await rm(work, { recursive: true, force: true });
}
console.log(`\n${pass.length}/${pass.length + fail.length} 통과`);
process.exit(fail.length ? 1 : 0);
