/**
 * 에이전트용 명령의 본체 (biz-dev-09 1단계) — upload · wait · rewrite · list · describe · visibility · usage · sites list.
 * 사람 없이 끝나도록: 키는 환경 변수, 결과는 객체(→ CLI 가 --json 으로), 다시 돌려도 같은 결과(sha256 중복 판정 · 매니페스트).
 * 서버는 지금 API 그대로(AG-1~3): 등록 → 서명 URL PUT → 완료 · 목록 폴링 · /meta:batch · PATCH /assets · batch-visibility · /usage · /site-keys.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

export const MANIFEST = 'imagemeta.json';
const IMAGE_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.cache', '.vercel', 'coverage']);
const DONE = new Set(['analyzed', 'failed']);

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `HTTP ${status}`);
    this.status = status; this.code = body?.code || `HTTP_${status}`; this.retryable = Boolean(body?.retryable) || status >= 500 || status === 429;
    this.details = body?.details ?? null;
  }
}

const posix = (p) => p.split(sep).join('/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** API 호출 — Authorization: ApiKey, JSON, 재시도 가능한 오류는 한 번 더 (1초 뒤) */
export function api({ apiBase, apiKey, fetch: fetchImpl = globalThis.fetch, retryDelayMs = 1000 }) {
  const base = String(apiBase || '').replace(/\/$/, '');
  if (!base) throw new Error('apiBase 가 필요합니다 (예: https://<B2B API>/t23/v1)');
  async function call(method, path, { query, body } = {}, attempt = 0) {
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
    const headers = { Accept: 'application/json', ...(apiKey ? { Authorization: `ApiKey ${apiKey}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
    let res;
    try { res = await fetchImpl(`${base}${path}${qs}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { if (attempt < 1) { await sleep(retryDelayMs); return call(method, path, { query, body }, attempt + 1); } throw new ApiError(0, { code: 'NETWORK', message: String(e.message || e), retryable: true }); }
    if (res.status === 204) return null;
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text.slice(0, 200) }; }
    if (!res.ok) {
      const err = new ApiError(res.status, json);
      if (err.retryable && err.code !== 'LIMIT_EXCEEDED' && attempt < 1) { await sleep(retryDelayMs); return call(method, path, { query, body }, attempt + 1); }
      throw err;
    }
    return json;
  }
  return {
    get: (p, query) => call('GET', p, { query }),
    post: (p, body, query) => call('POST', p, { body, query }),
    patch: (p, body) => call('PATCH', p, { body }),
    fetch: fetchImpl,
  };
}

/* ───────── 매니페스트 imagemeta.json — 로컬 경로 → 이미지. 키 정렬 · 시각 없음(diff 가 조용하게) ───────── */

export async function loadManifest(file) {
  try {
    const j = JSON.parse(await readFile(file, 'utf8'));
    if (j && j.version === 1 && j.images) return j;
  } catch { /* 없음 */ }
  return { version: 1, images: {} };
}

export async function saveManifest(file, m) {
  const images = Object.fromEntries(Object.keys(m.images).sort().map((k) => [k, m.images[k]]));
  await writeFile(file, JSON.stringify({ version: 1, images }, null, 2) + '\n', 'utf8');
}

/** 경로나 id 로 매니페스트 항목 찾기 */
export function resolveTargets(m, refs, root) {
  const byId = new Map(Object.entries(m.images).map(([k, v]) => [v.id, k]));
  return refs.map((ref) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return { ref, id: ref.toLowerCase(), path: byId.get(ref.toLowerCase()) ?? null };
    const key = posix(relative(root, resolve(root, ref)));
    const it = m.images[key];
    return { ref, id: it?.id ?? null, path: it ? key : null };
  });
}

async function* walk(dir, exts) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) yield* walk(p, exts); }
    else if (exts.has(extname(e.name).toLowerCase())) yield p;
  }
}

/* ───────── upload ───────── */

async function imageFiles(paths, root) {
  const out = [];
  for (const p of paths) {
    const abs = resolve(root, p);
    const st = await stat(abs);
    if (st.isDirectory()) { for await (const f of walk(abs, new Set(Object.keys(IMAGE_EXT)))) out.push(f); }
    else if (IMAGE_EXT[extname(abs).toLowerCase()]) out.push(abs);
    else throw Object.assign(new Error(`이미지가 아닙니다: ${p}`), { usage: true });
  }
  return [...new Set(out)].sort();
}

/**
 * 파일 · 폴더를 올리고 매니페스트를 갱신한다. 같은 내용(sha256)은 다시 올리지 않는다.
 * @returns {{uploaded, unchanged, duplicate, failed, items:[{path,id,result,error?}]}}
 */
export async function upload(client, { paths, root = process.cwd(), manifest = MANIFEST, dryRun = false, putFetch } = {}) {
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const files = await imageFiles(paths, root);
  const rows = [];
  for (const abs of files) {
    const buf = await readFile(abs);
    const key = posix(relative(root, abs));
    rows.push({ abs, key, buf, sha: createHash('sha256').update(buf).digest('hex'), mime: IMAGE_EXT[extname(abs).toLowerCase()], mtime: (await stat(abs)).mtime });
  }
  const report = { uploaded: 0, unchanged: 0, duplicate: 0, failed: 0, dryRun, items: [] };
  const todo = [];
  for (const r of rows) {
    const prev = m.images[r.key];
    if (prev && prev.sha256 === r.sha && prev.status && prev.status !== 'registered') { report.unchanged++; report.items.push({ path: r.key, id: prev.id, result: 'unchanged' }); continue; }
    todo.push(r);
  }
  if (dryRun) { for (const r of todo) report.items.push({ path: r.key, id: m.images[r.key]?.id ?? null, result: 'would-upload' }); return report; }

  try {
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const reg = await client.post('/assets:batch', { items: chunk.map((r) => ({ local_id: `cli:${r.sha.slice(0, 16)}`, sha256: r.sha, mime: r.mime, bytes: r.buf.length, file_name: basename(r.abs), taken_at: r.mtime.toISOString() })) });
    const need = [];
    for (const r of chunk) {
      const it = (reg.items || []).find((x) => x.local_id === `cli:${r.sha.slice(0, 16)}`);
      if (!it || it.error || !it.asset_id) { report.failed++; report.items.push({ path: r.key, id: null, result: 'failed', error: it?.error?.message || '등록 실패' }); continue; }
      r.id = it.asset_id;
      if (it.upload_required === false) { report.duplicate++; m.images[r.key] = { ...(m.images[r.key] || {}), id: r.id, sha256: r.sha, bytes: r.buf.length, status: m.images[r.key]?.id === r.id ? (m.images[r.key].status || 'backed_up') : 'backed_up' }; report.items.push({ path: r.key, id: r.id, result: 'duplicate' }); continue; }
      need.push(r);
    }
    if (!need.length) continue;
    const urls = await client.post('/uploads:batch', { asset_ids: need.map((r) => r.id) });
    const done = [];
    for (const r of need) {
      const u = (urls.items || []).find((x) => x.asset_id === r.id);
      if (!u || u.error || !u.url) { report.failed++; report.items.push({ path: r.key, id: r.id, result: 'failed', error: u?.error?.message || '업로드 주소 없음' }); continue; }
      const res = await (putFetch || client.fetch)(u.url, { method: 'PUT', headers: { ...(u.headers || {}), ...(u.token ? { Authorization: `Bearer ${u.token}` } : {}) }, body: r.buf });
      if (!res.ok) { report.failed++; report.items.push({ path: r.key, id: r.id, result: 'failed', error: `PUT ${res.status}` }); continue; }
      done.push(r);
    }
    if (!done.length) continue;
    const comp = await client.post('/uploads:complete-batch', { asset_ids: done.map((r) => r.id) });
    for (const r of done) {
      const c = (comp.items || []).find((x) => x.id === r.id);
      if (!c || !c.ok) { report.failed++; report.items.push({ path: r.key, id: r.id, result: 'failed', error: c?.error?.message || '완료 실패' }); continue; }
      m.images[r.key] = { id: r.id, sha256: r.sha, bytes: r.buf.length, status: c.status || 'backed_up' };
      report.uploaded++; report.items.push({ path: r.key, id: r.id, result: 'uploaded' });
    }
  }
  } finally {
    await saveManifest(mfile, m);   // 중간에 한도(429) 등으로 멈춰도 끝난 묶음은 남긴다 — 다시 돌리면 이어서
  }
  return report;
}

/* ───────── 서버 상태 · 메타 ───────── */

/** 목록 API 를 넘기며(500장씩) ids 의 상태를 모은다. 다 찾으면 멈춘다. */
export async function statuses(client, ids) {
  const want = new Set(ids);
  const found = new Map();
  let cursor;
  do {
    const page = await client.get('/assets', { sort: 'uploaded', limit: 500, cursor });
    for (const a of page.items || []) if (want.has(a.id)) found.set(a.id, a);
    cursor = page.next_cursor || undefined;
  } while (cursor && found.size < want.size);
  return found;
}

/** /meta:batch (100개씩) — 공개 범위 site · public 만 돌아온다(비공개는 missing) */
export async function metas(client, ids, lang = 'ko') {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await client.get('/meta:batch', { ids: ids.slice(i, i + 100).join(','), lang });
    for (const it of r.items || []) out.set(it.id, it);
  }
  return out;
}

async function refreshManifest(client, m, keys, lang) {
  const ids = keys.map((k) => m.images[k].id);
  const st = await statuses(client, ids);
  const mt = await metas(client, ids, lang);
  for (const k of keys) {
    const e = m.images[k]; const s = st.get(e.id); const meta = mt.get(e.id);
    if (s) { e.status = s.status; e.visibility = s.visibility; } else e.status = 'missing';
    if (meta) { e.url = meta.src; e.rev = meta.rev; } else { delete e.url; delete e.rev; }
  }
  return { st, mt };
}

/* ───────── wait ───────── */

/** 매니페스트 이미지가 모두 analyzed(또는 failed)가 될 때까지. AI 분석이 꺼져 있으면 바로 실패. */
export async function wait(client, { root = process.cwd(), manifest = MANIFEST, timeoutSec = 600, intervalSec = 10, lang = 'ko', onTick } = {}) {
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const keys = Object.keys(m.images);
  if (!keys.length) return { ok: true, total: 0, analyzed: 0, failed: [], pending: [], missing: [], seconds: 0 };
  const settings = await client.get('/settings');
  if (!settings.ai_consent_at) {
    const e = new Error('AI 분석이 꺼져 있어 설명이 생기지 않습니다 — 콘솔 설정에서 켜세요'); e.code = 'AI_OFF'; throw e;
  }
  const started = Date.now();
  for (;;) {
    const st = await statuses(client, keys.map((k) => m.images[k].id));
    const pending = keys.filter((k) => { const s = st.get(m.images[k].id); return s && !DONE.has(s.status); });
    onTick?.({ done: keys.length - pending.length, total: keys.length });
    const elapsed = (Date.now() - started) / 1000;
    if (!pending.length || elapsed >= timeoutSec) {
      await refreshManifest(client, m, keys, lang);
      await saveManifest(mfile, m);
      const failed = keys.filter((k) => m.images[k].status === 'failed');
      const missing = keys.filter((k) => m.images[k].status === 'missing');
      const stillPending = keys.filter((k) => !DONE.has(m.images[k].status) && m.images[k].status !== 'missing');
      return { ok: !stillPending.length && !failed.length && !missing.length, timedOut: stillPending.length > 0, total: keys.length,
        analyzed: keys.filter((k) => m.images[k].status === 'analyzed').length, failed, pending: stillPending, missing, seconds: Math.round(elapsed) };
    }
    await sleep(intervalSec * 1000);
  }
}

/* ───────── rewrite — 소스의 로컬 이미지 경로를 영구 주소로 ───────── */

const SRC_EXT = new Set(['.html', '.htm', '.jsx', '.tsx', '.js', '.ts', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.md', '.mdx', '.css', '.scss']);
const IMPORT_LINE = /^\s*(import\b|export\b[^\n]*\bfrom\b)|\brequire\s*\(/;

/**
 * 매니페스트의 이미지를 가리키는 문자열 리터럴(따옴표 · url())을 영구 주소로 바꾼다.
 * 찾는 모양: public 폴더 기준 웹 경로(/images/a.jpg)와 각 소스 파일 기준 상대 경로(./a.jpg · ../assets/a.jpg).
 * import/require 줄은 바꾸지 않는다(모듈 import 를 URL 로 바꾸면 빌드가 깨짐) — 경고로 알린다.
 * 영구 주소는 /meta:batch 의 src — 비공개 이미지는 주소가 없어 바꾸지 않는다.
 */
export async function rewrite(client, { srcPaths, root = process.cwd(), manifest = MANIFEST, publicDir = 'public', dryRun = false, query = '' } = {}) {
  const m = await loadManifest(resolve(root, manifest));
  const keys = Object.keys(m.images);
  const report = { files: 0, changedFiles: 0, replaced: 0, dryRun, changes: [], skipped: [] };
  if (!keys.length) return report;
  const mt = await metas(client, keys.map((k) => m.images[k].id));
  const urlOf = new Map(keys.map((k) => [k, mt.get(m.images[k].id)?.src ? mt.get(m.images[k].id).src + query : null]));
  const pub = posix(publicDir).replace(/\/$/, '') + '/';
  const webPath = new Map(keys.filter((k) => k.startsWith(pub)).map((k) => ['/' + k.slice(pub.length), k]));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const files = [];
  for (const sp of srcPaths) {
    const abs = resolve(root, sp);
    if ((await stat(abs)).isDirectory()) { for await (const f of walk(abs, SRC_EXT)) files.push(f); }
    else files.push(abs);
  }
  for (const abs of [...new Set(files)].sort()) {
    report.files++;
    const rel = posix(relative(root, abs));
    const text = await readFile(abs, 'utf8');
    // 이 파일에서 통하는 참조 → 매니페스트 키
    const refs = new Map(webPath);
    for (const k of keys) {
      let r = posix(relative(dirname(abs), resolve(root, k)));
      if (!r.startsWith('.')) r = './' + r;
      refs.set(r, k);
      if (r.startsWith('./')) refs.set(r.slice(2), k);
    }
    const pattern = new RegExp(`(["'\`(])(${[...refs.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})(["'\`)])`, 'g');
    const lines = text.split('\n');
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!pattern.test(line)) continue;
      pattern.lastIndex = 0;
      if (IMPORT_LINE.test(line)) { report.skipped.push({ file: rel, line: i + 1, reason: 'import/require — 바꾸지 않음', text: line.trim().slice(0, 120) }); continue; }
      lines[i] = line.replace(pattern, (all, open, ref, close) => {
        if ((open === '(' && close !== ')') || (open !== '(' && open !== close)) return all;   // 짝이 맞는 따옴표 · url() 만
        const key = refs.get(ref); const url = urlOf.get(key);
        if (!url) { report.skipped.push({ file: rel, line: i + 1, reason: '영구 주소 없음(비공개이거나 서버에 없음)', text: ref }); return all; }
        report.replaced++; report.changes.push({ file: rel, line: i + 1, from: ref, to: url });
        changed = true;
        return `${open}${url}${close}`;
      });
      pattern.lastIndex = 0;
    }
    if (changed) { report.changedFiles++; if (!dryRun) await writeFile(abs, lines.join('\n'), 'utf8'); }
  }
  return report;
}

/* ───────── list · describe · visibility · usage · sites ───────── */

export async function list(client, { root = process.cwd(), manifest = MANIFEST, lang = 'ko' } = {}) {
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const keys = Object.keys(m.images);
  if (!keys.length) return { items: [] };
  const { mt } = await refreshManifest(client, m, keys, lang);
  await saveManifest(mfile, m);
  return { items: keys.map((k) => ({ path: k, ...m.images[k], alt: mt.get(m.images[k].id)?.alt ?? null })) };
}

export async function describe(client, { target, lang = 'ko', set, root = process.cwd(), manifest = MANIFEST } = {}) {
  const m = await loadManifest(resolve(root, manifest));
  const [t] = resolveTargets(m, [target], root);
  if (!t.id) throw Object.assign(new Error(`매니페스트에 없는 이미지: ${target}`), { usage: true });
  let a = await client.get(`/assets/${t.id}`, { lang, include: 'analyses' });
  if (set !== undefined) {
    a = await client.patch(`/assets/${t.id}`, { base_version: a.manual_version ?? 0, caption: { [lang]: set } });
  }
  const sources = (a.analyses || []).map((x) => x.source);
  return { id: t.id, path: t.path, status: a.status, visibility: a.visibility, captions: a.chosen?.caption || {}, keywords: a.chosen?.details?.keywords || [],
    origin: set !== undefined || sources.includes('manual') ? 'manual' : sources.includes('ai') ? 'ai' : null, updated: set !== undefined };
}

export async function visibility(client, { value, targets, yes = false, root = process.cwd(), manifest = MANIFEST } = {}) {
  if (!['site', 'public', 'private'].includes(value)) throw Object.assign(new Error('공개 범위는 site · public · private'), { usage: true });
  if ((value === 'public' || value === 'private') && !yes) {
    throw Object.assign(new Error(value === 'public' ? 'public 은 사이트 키 없이 어디서나 설명을 받게 됩니다 — --yes 로 확인하세요'
      : 'private 은 영구 주소를 멈춰 고객 페이지에서 이미지가 사라집니다 — --yes 로 확인하세요'), { usage: true, code: 'CONFIRM_REQUIRED' });
  }
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const ts = resolveTargets(m, targets, root);
  const unknown = ts.filter((t) => !t.id).map((t) => t.ref);
  if (unknown.length) throw Object.assign(new Error(`매니페스트에 없는 이미지: ${unknown.join(', ')}`), { usage: true });
  const r = await client.post('/assets:batch-visibility', { ids: ts.map((t) => t.id), visibility: value });
  for (const t of ts) if (t.path && (r.items || []).find((x) => x.id === t.id && x.ok)) m.images[t.path].visibility = value;
  await saveManifest(mfile, m);
  return { value, items: (r.items || []).map((x) => ({ id: x.id, ok: x.ok, error: x.error?.message })) };
}

export const usage = (client, { from, to } = {}) => client.get('/usage', { from, to });
export const sitesList = async (client) => (await client.get('/site-keys')).items.map((k) => ({ label: k.label, key: k.key, origins: k.allowed_origins, revoked: Boolean(k.revoked_at) }));
