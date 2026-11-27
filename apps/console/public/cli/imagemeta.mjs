#!/usr/bin/env node
// DOSSAI 이미지 CLI (imagemeta) — node imagemeta.mjs --help   · 안내: https://biz.dossai.app/cli
// 키는 IMAGEMETA_API_KEY 환경 변수로만. 기본 주소 https://biz.dossai.app/t23/v1

// packages/core/bin/imagemeta.js
import { stat as stat2 } from "node:fs/promises";

// packages/core/src/agent.js
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
var MANIFEST = "imagemeta.json";
var COMPLETE_GROUP = 4;
var IMAGE_EXT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif" };
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".cache", ".vercel", "coverage"]);
var DONE = /* @__PURE__ */ new Set(["analyzed", "failed"]);
var ApiError = class extends Error {
  constructor(status, body) {
    super(body?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.code || `HTTP_${status}`;
    this.retryable = Boolean(body?.retryable) || status >= 500 || status === 429;
    this.details = body?.details ?? null;
  }
};
var posix = (p) => p.split(sep).join("/");
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function api({ apiBase, apiKey, fetch: fetchImpl = globalThis.fetch, retryDelayMs = 1e3 }) {
  const base = String(apiBase || "").replace(/\/$/, "");
  if (!base) throw new Error("apiBase \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4 (\uC608: https://<B2B API>/t23/v1)");
  async function call(method, path, { query, body } = {}, attempt = 0) {
    const qs = query ? "?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== void 0 && v !== null && v !== "")).toString() : "";
    const headers = { Accept: "application/json", ...apiKey ? { Authorization: `ApiKey ${apiKey}` } : {}, ...body !== void 0 ? { "Content-Type": "application/json" } : {} };
    let res;
    try {
      res = await fetchImpl(`${base}${path}${qs}`, { method, headers, body: body === void 0 ? void 0 : JSON.stringify(body) });
    } catch (e) {
      if (attempt < 1) {
        await sleep(retryDelayMs);
        return call(method, path, { query, body }, attempt + 1);
      }
      throw new ApiError(0, { code: "NETWORK", message: String(e.message || e), retryable: true });
    }
    if (res.status === 204) return null;
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text.slice(0, 200) };
    }
    if (!res.ok) {
      const err = new ApiError(res.status, json);
      if (err.retryable && err.code !== "LIMIT_EXCEEDED" && attempt < 1) {
        await sleep(retryDelayMs);
        return call(method, path, { query, body }, attempt + 1);
      }
      throw err;
    }
    return json;
  }
  return {
    get: (p, query) => call("GET", p, { query }),
    post: (p, body, query) => call("POST", p, { body, query }),
    patch: (p, body) => call("PATCH", p, { body }),
    fetch: fetchImpl
  };
}
async function loadManifest(file) {
  try {
    const j = JSON.parse(await readFile(file, "utf8"));
    if (j && j.version === 1 && j.images) return j;
  } catch {
  }
  return { version: 1, images: {} };
}
async function saveManifest(file, m) {
  const images = Object.fromEntries(Object.keys(m.images).sort().map((k) => [k, m.images[k]]));
  await writeFile(file, JSON.stringify({ version: 1, images }, null, 2) + "\n", "utf8");
}
function resolveTargets(m, refs, root) {
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
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) yield* walk(p, exts);
    } else if (exts.has(extname(e.name).toLowerCase())) yield p;
  }
}
async function imageFiles(paths, root) {
  const out2 = [];
  for (const p of paths) {
    const abs = resolve(root, p);
    const st = await stat(abs);
    if (st.isDirectory()) {
      for await (const f of walk(abs, new Set(Object.keys(IMAGE_EXT)))) out2.push(f);
    } else if (IMAGE_EXT[extname(abs).toLowerCase()]) out2.push(abs);
    else throw Object.assign(new Error(`\uC774\uBBF8\uC9C0\uAC00 \uC544\uB2D9\uB2C8\uB2E4: ${p}`), { usage: true });
  }
  return [...new Set(out2)].sort();
}
async function upload(client, { paths, root = process.cwd(), manifest = MANIFEST, dryRun = false, putFetch, log: log2 = () => {
} } = {}) {
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const files = await imageFiles(paths, root);
  const rows = [];
  for (const abs of files) {
    const buf = await readFile(abs);
    const key = posix(relative(root, abs));
    rows.push({ abs, key, buf, sha: createHash("sha256").update(buf).digest("hex"), mime: IMAGE_EXT[extname(abs).toLowerCase()], mtime: (await stat(abs)).mtime });
  }
  const report = { uploaded: 0, unchanged: 0, duplicate: 0, failed: 0, dryRun, items: [] };
  const todo = [];
  for (const r of rows) {
    const prev = m.images[r.key];
    if (prev && prev.sha256 === r.sha && prev.status && prev.status !== "registered") {
      report.unchanged++;
      report.items.push({ path: r.key, id: prev.id, result: "unchanged" });
      continue;
    }
    todo.push(r);
  }
  if (dryRun) {
    for (const r of todo) report.items.push({ path: r.key, id: m.images[r.key]?.id ?? null, result: "would-upload" });
    return report;
  }
  try {
    for (let i = 0; i < todo.length; i += 100) {
      const chunk = todo.slice(i, i + 100);
      const reg = await client.post("/assets:batch", { items: chunk.map((r) => ({ local_id: `cli:${r.sha.slice(0, 16)}`, sha256: r.sha, mime: r.mime, bytes: r.buf.length, file_name: basename(r.abs), taken_at: r.mtime.toISOString() })) });
      const need = [];
      for (const r of chunk) {
        const it = (reg.items || []).find((x) => x.local_id === `cli:${r.sha.slice(0, 16)}`);
        if (!it || it.error || !it.asset_id) {
          report.failed++;
          report.items.push({ path: r.key, id: null, result: "failed", error: it?.error?.message || "\uB4F1\uB85D \uC2E4\uD328" });
          continue;
        }
        r.id = it.asset_id;
        if (it.upload_required === false) {
          report.duplicate++;
          m.images[r.key] = { ...m.images[r.key] || {}, id: r.id, sha256: r.sha, bytes: r.buf.length, status: m.images[r.key]?.id === r.id ? m.images[r.key].status || "backed_up" : "backed_up" };
          report.items.push({ path: r.key, id: r.id, result: "duplicate" });
          continue;
        }
        need.push(r);
      }
      if (!need.length) continue;
      const urls = await client.post("/uploads:batch", { asset_ids: need.map((r) => r.id) });
      const done = [];
      let n = 0;
      for (const r of need) {
        n++;
        log2(`\uC62C\uB9AC\uB294 \uC911 ${i + n}/${todo.length} \xB7 ${r.key} (${(r.buf.length / 1e6).toFixed(1)} MB)`);
        const u = (urls.items || []).find((x) => x.asset_id === r.id);
        if (!u || u.error || !u.url) {
          report.failed++;
          report.items.push({ path: r.key, id: r.id, result: "failed", error: u?.error?.message || "\uC5C5\uB85C\uB4DC \uC8FC\uC18C \uC5C6\uC74C" });
          continue;
        }
        const res = await (putFetch || client.fetch)(u.url, { method: "PUT", headers: { ...u.headers || {}, ...u.token ? { Authorization: `Bearer ${u.token}` } : {} }, body: r.buf });
        if (!res.ok) {
          report.failed++;
          report.items.push({ path: r.key, id: r.id, result: "failed", error: `PUT ${res.status}` });
          continue;
        }
        done.push(r);
      }
      if (!done.length) continue;
      for (let g = 0; g < done.length; g += COMPLETE_GROUP) {
        const group = done.slice(g, g + COMPLETE_GROUP);
        log2(`\uC11C\uBC84 \uB9C8\uBB34\uB9AC ${Math.min(g + group.length, done.length)}/${done.length} \u2026`);
        const comp = await client.post("/uploads:complete-batch", { asset_ids: group.map((r) => r.id) });
        for (const r of group) {
          const c = (comp.items || []).find((x) => x.id === r.id);
          if (!c || !c.ok) {
            report.failed++;
            report.items.push({ path: r.key, id: r.id, result: "failed", error: c?.error?.message || "\uC644\uB8CC \uC2E4\uD328" });
            continue;
          }
          m.images[r.key] = { id: r.id, sha256: r.sha, bytes: r.buf.length, status: c.status || "backed_up" };
          report.uploaded++;
          report.items.push({ path: r.key, id: r.id, result: "uploaded" });
        }
        await saveManifest(mfile, m);
      }
    }
  } finally {
    await saveManifest(mfile, m);
  }
  return report;
}
async function statuses(client, ids) {
  const want = new Set(ids);
  const found = /* @__PURE__ */ new Map();
  let cursor;
  do {
    const page = await client.get("/assets", { sort: "uploaded", limit: 500, cursor });
    for (const a of page.items || []) if (want.has(a.id)) found.set(a.id, a);
    cursor = page.next_cursor || void 0;
  } while (cursor && found.size < want.size);
  return found;
}
async function metas(client, ids, lang = "ko") {
  const out2 = /* @__PURE__ */ new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await client.get("/meta:batch", { ids: ids.slice(i, i + 100).join(","), lang });
    for (const it of r.items || []) out2.set(it.id, it);
  }
  return out2;
}
async function refreshManifest(client, m, keys, lang) {
  const ids = keys.map((k) => m.images[k].id);
  const st = await statuses(client, ids);
  const mt = await metas(client, ids, lang);
  for (const k of keys) {
    const e = m.images[k];
    const s = st.get(e.id);
    const meta = mt.get(e.id);
    if (s) {
      e.status = s.status;
      e.visibility = s.visibility;
    } else e.status = "missing";
    if (meta) {
      e.url = meta.src;
      e.rev = meta.rev;
    } else {
      delete e.url;
      delete e.rev;
    }
  }
  return { st, mt };
}
async function wait(client, { root = process.cwd(), manifest = MANIFEST, timeoutSec = 600, intervalSec = 10, lang = "ko", onTick } = {}) {
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const keys = Object.keys(m.images);
  if (!keys.length) return { ok: true, total: 0, analyzed: 0, failed: [], pending: [], missing: [], seconds: 0 };
  const settings = await client.get("/settings");
  if (!settings.ai_consent_at) {
    const e = new Error("AI \uBD84\uC11D\uC774 \uAEBC\uC838 \uC788\uC5B4 \uC124\uBA85\uC774 \uC0DD\uAE30\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4 \u2014 \uCF58\uC194 \uC124\uC815\uC5D0\uC11C \uCF1C\uC138\uC694");
    e.code = "AI_OFF";
    throw e;
  }
  const started = Date.now();
  for (; ; ) {
    const st = await statuses(client, keys.map((k) => m.images[k].id));
    const pending = keys.filter((k) => {
      const s = st.get(m.images[k].id);
      return s && !DONE.has(s.status);
    });
    onTick?.({ done: keys.length - pending.length, total: keys.length });
    const elapsed = (Date.now() - started) / 1e3;
    if (!pending.length || elapsed >= timeoutSec) {
      await refreshManifest(client, m, keys, lang);
      await saveManifest(mfile, m);
      const failed = keys.filter((k) => m.images[k].status === "failed");
      const missing = keys.filter((k) => m.images[k].status === "missing");
      const stillPending = keys.filter((k) => !DONE.has(m.images[k].status) && m.images[k].status !== "missing");
      return {
        ok: !stillPending.length && !failed.length && !missing.length,
        timedOut: stillPending.length > 0,
        total: keys.length,
        analyzed: keys.filter((k) => m.images[k].status === "analyzed").length,
        failed,
        pending: stillPending,
        missing,
        seconds: Math.round(elapsed)
      };
    }
    await sleep(intervalSec * 1e3);
  }
}
var SRC_EXT = /* @__PURE__ */ new Set([".html", ".htm", ".jsx", ".tsx", ".js", ".ts", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".md", ".mdx", ".css", ".scss"]);
var IMPORT_LINE = /^\s*(import\b|export\b[^\n]*\bfrom\b)|\brequire\s*\(/;
async function rewrite(client, { srcPaths, root = process.cwd(), manifest = MANIFEST, publicDir = "public", dryRun = false, query = "" } = {}) {
  const m = await loadManifest(resolve(root, manifest));
  const keys = Object.keys(m.images);
  const report = { files: 0, changedFiles: 0, replaced: 0, dryRun, changes: [], skipped: [] };
  if (!keys.length) return report;
  const mt = await metas(client, keys.map((k) => m.images[k].id));
  const urlOf = new Map(keys.map((k) => [k, mt.get(m.images[k].id)?.src ? mt.get(m.images[k].id).src + query : null]));
  const pub = posix(publicDir).replace(/\/$/, "") + "/";
  const webPath = new Map(keys.filter((k) => k.startsWith(pub)).map((k) => ["/" + k.slice(pub.length), k]));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const files = [];
  for (const sp of srcPaths) {
    const abs = resolve(root, sp);
    if ((await stat(abs)).isDirectory()) {
      for await (const f of walk(abs, SRC_EXT)) files.push(f);
    } else files.push(abs);
  }
  for (const abs of [...new Set(files)].sort()) {
    report.files++;
    const rel = posix(relative(root, abs));
    const text = await readFile(abs, "utf8");
    const refs = new Map(webPath);
    for (const k of keys) {
      let r = posix(relative(dirname(abs), resolve(root, k)));
      if (!r.startsWith(".")) r = "./" + r;
      refs.set(r, k);
      if (r.startsWith("./")) refs.set(r.slice(2), k);
    }
    const pattern = new RegExp(`(["'\`(])(${[...refs.keys()].sort((a, b) => b.length - a.length).map(esc).join("|")})(["'\`)])`, "g");
    const lines = text.split("\n");
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!pattern.test(line)) continue;
      pattern.lastIndex = 0;
      if (IMPORT_LINE.test(line)) {
        report.skipped.push({ file: rel, line: i + 1, reason: "import/require \u2014 \uBC14\uAFB8\uC9C0 \uC54A\uC74C", text: line.trim().slice(0, 120) });
        continue;
      }
      lines[i] = line.replace(pattern, (all, open, ref, close) => {
        if (open === "(" && close !== ")" || open !== "(" && open !== close) return all;
        const key = refs.get(ref);
        const url = urlOf.get(key);
        if (!url) {
          report.skipped.push({ file: rel, line: i + 1, reason: "\uC601\uAD6C \uC8FC\uC18C \uC5C6\uC74C(\uBE44\uACF5\uAC1C\uC774\uAC70\uB098 \uC11C\uBC84\uC5D0 \uC5C6\uC74C)", text: ref });
          return all;
        }
        report.replaced++;
        report.changes.push({ file: rel, line: i + 1, from: ref, to: url });
        changed = true;
        return `${open}${url}${close}`;
      });
      pattern.lastIndex = 0;
    }
    if (changed) {
      report.changedFiles++;
      if (!dryRun) await writeFile(abs, lines.join("\n"), "utf8");
    }
  }
  return report;
}
async function list(client, { root = process.cwd(), manifest = MANIFEST, lang = "ko" } = {}) {
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const keys = Object.keys(m.images);
  if (!keys.length) return { items: [] };
  const { mt } = await refreshManifest(client, m, keys, lang);
  await saveManifest(mfile, m);
  return { items: keys.map((k) => ({ path: k, ...m.images[k], alt: mt.get(m.images[k].id)?.alt ?? null })) };
}
async function describe(client, { target, lang = "ko", set, root = process.cwd(), manifest = MANIFEST } = {}) {
  const m = await loadManifest(resolve(root, manifest));
  const [t] = resolveTargets(m, [target], root);
  if (!t.id) throw Object.assign(new Error(`\uB9E4\uB2C8\uD398\uC2A4\uD2B8\uC5D0 \uC5C6\uB294 \uC774\uBBF8\uC9C0: ${target}`), { usage: true });
  let a = await client.get(`/assets/${t.id}`, { lang, include: "analyses" });
  if (set !== void 0) {
    a = await client.patch(`/assets/${t.id}`, { base_version: a.manual_version ?? 0, caption: { [lang]: set } });
  }
  const sources = (a.analyses || []).map((x) => x.source);
  return {
    id: t.id,
    path: t.path,
    status: a.status,
    visibility: a.visibility,
    captions: a.chosen?.caption || {},
    keywords: a.chosen?.details?.keywords || [],
    origin: set !== void 0 || sources.includes("manual") ? "manual" : sources.includes("ai") ? "ai" : null,
    updated: set !== void 0
  };
}
async function visibility(client, { value, targets, yes = false, root = process.cwd(), manifest = MANIFEST } = {}) {
  if (!["site", "public", "private"].includes(value)) throw Object.assign(new Error("\uACF5\uAC1C \uBC94\uC704\uB294 site \xB7 public \xB7 private"), { usage: true });
  if ((value === "public" || value === "private") && !yes) {
    throw Object.assign(new Error(value === "public" ? "public \uC740 \uC0AC\uC774\uD2B8 \uD0A4 \uC5C6\uC774 \uC5B4\uB514\uC11C\uB098 \uC124\uBA85\uC744 \uBC1B\uAC8C \uB429\uB2C8\uB2E4 \u2014 --yes \uB85C \uD655\uC778\uD558\uC138\uC694" : "private \uC740 \uC601\uAD6C \uC8FC\uC18C\uB97C \uBA48\uCDB0 \uACE0\uAC1D \uD398\uC774\uC9C0\uC5D0\uC11C \uC774\uBBF8\uC9C0\uAC00 \uC0AC\uB77C\uC9D1\uB2C8\uB2E4 \u2014 --yes \uB85C \uD655\uC778\uD558\uC138\uC694"), { usage: true, code: "CONFIRM_REQUIRED" });
  }
  const mfile = resolve(root, manifest);
  const m = await loadManifest(mfile);
  const ts = resolveTargets(m, targets, root);
  const unknown = ts.filter((t) => !t.id).map((t) => t.ref);
  if (unknown.length) throw Object.assign(new Error(`\uB9E4\uB2C8\uD398\uC2A4\uD2B8\uC5D0 \uC5C6\uB294 \uC774\uBBF8\uC9C0: ${unknown.join(", ")}`), { usage: true });
  const r = await client.post("/assets:batch-visibility", { ids: ts.map((t) => t.id), visibility: value });
  for (const t of ts) if (t.path && (r.items || []).find((x) => x.id === t.id && x.ok)) m.images[t.path].visibility = value;
  await saveManifest(mfile, m);
  return { value, items: (r.items || []).map((x) => ({ id: x.id, ok: x.ok, error: x.error?.message })) };
}
var usage = (client, { from, to } = {}) => client.get("/usage", { from, to });
var sitesList = async (client) => (await client.get("/site-keys")).items.map((k) => ({ label: k.label, key: k.key, origins: k.allowed_origins, revoked: Boolean(k.revoked_at) }));

// packages/core/src/inject.js
import { readdir as readdir2, readFile as readFile3, writeFile as writeFile3 } from "node:fs/promises";
import { extname as extname2, join as join2, relative as relative2 } from "node:path";

// packages/core/src/index.js
import { mkdir, readFile as readFile2, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
var ID_RE = /\/i\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#"'\s]|$)/gi;
var BATCH = 100;
function extractIds(text, imageHosts) {
  const out2 = /* @__PURE__ */ new Set();
  const re = new RegExp(ID_RE.source, "gi");
  let m;
  while (m = re.exec(text)) {
    if (imageHosts && imageHosts.length) {
      const start = text.lastIndexOf("http", m.index);
      const url = start >= 0 ? text.slice(start, m.index + m[0].length) : "";
      if (!imageHosts.some((h) => url.startsWith(h))) continue;
    }
    out2.add(m[1].toLowerCase());
  }
  return [...out2];
}
function createClient(opts) {
  const apiBase = String(opts.apiBase || "").replace(/\/$/, "");
  if (!apiBase) throw new Error("[imagemeta] apiBase \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4 (\uC608: https://<dos>/t23/v1)");
  const apiKey = opts.apiKey || "";
  const lang = opts.lang || "ko";
  const cacheFile = opts.cacheFile === void 0 ? ".cache/imagemeta.json" : opts.cacheFile;
  const ttlMs = (opts.cacheTtlSeconds ?? 3600) * 1e3;
  const fetchImpl = opts.fetch || globalThis.fetch;
  const stats = { requests: 0, fetched: 0, cached: 0, missing: 0 };
  let cache = null;
  async function load() {
    if (cache) return cache;
    cache = { version: 1, entries: {} };
    if (!cacheFile) return cache;
    try {
      const j = JSON.parse(await readFile2(cacheFile, "utf8"));
      if (j && j.version === 1 && j.entries) cache = j;
    } catch {
    }
    return cache;
  }
  async function save() {
    if (!cacheFile || !cache) return;
    await mkdir(dirname2(cacheFile), { recursive: true });
    await writeFile2(cacheFile, JSON.stringify(cache, null, 1), "utf8");
  }
  async function fetchMany(ids) {
    const want = [...new Set(ids.map((s) => s.toLowerCase()))];
    const c = await load();
    const now = Date.now();
    const result = /* @__PURE__ */ new Map();
    const need = [];
    for (const id of want) {
      const e = c.entries[id];
      if (e && now - e.fetchedAt < ttlMs) {
        result.set(id, e.meta);
        stats.cached++;
      } else need.push(id);
    }
    for (let i = 0; i < need.length; i += BATCH) {
      const chunk = need.slice(i, i + BATCH);
      const url = `${apiBase}/meta:batch?ids=${chunk.join(",")}&lang=${encodeURIComponent(lang)}&jsonld=1`;
      stats.requests++;
      const r = await fetchImpl(url, { headers: apiKey ? { Authorization: `ApiKey ${apiKey}` } : {} });
      if (!r.ok) throw new Error(`[imagemeta] \uBA54\uD0C0 API ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      for (const it of j.items || []) {
        result.set(it.id, it);
        c.entries[it.id] = { meta: it, fetchedAt: now };
        stats.fetched++;
      }
      for (const id of j.missing || []) {
        result.set(id, null);
        c.entries[id] = { meta: null, fetchedAt: now };
        stats.missing++;
      }
    }
    if (need.length) await save();
    return result;
  }
  return { fetchMany, extractIds: (text) => extractIds(text, opts.imageHosts), stats, lang };
}
function injectAlt(code, metas2, { force = false, fillEmpty = false, imageHosts, attr = "alt" } = {}) {
  let changed = 0, skipped = 0;
  const out2 = code.replace(/<img\b([^>]*?)(\/?)>/gi, (tag, attrs, selfClose) => {
    const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    if (!src) return tag;
    const ids = extractIds(src[2] + " ", imageHosts);
    if (!ids.length) return tag;
    const meta = metas2.get(ids[0]);
    if (!meta || !meta.alt) {
      skipped++;
      return tag;
    }
    const emptyAlt = /\balt\s*=\s*(["'])\s*\1/i.test(attrs);
    const hasAlt = /\balt\s*=/i.test(attrs) && !(fillEmpty && emptyAlt);
    const ourRev = /\bdata-meta-rev\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    if (hasAlt && !force && !ourRev) {
      skipped++;
      return tag;
    }
    if (ourRev && !force && ourRev[2] === String(meta.rev ?? "")) {
      skipped++;
      return tag;
    }
    const esc = meta.alt.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    let cleaned = hasAlt || fillEmpty && emptyAlt ? attrs.replace(/\s*\balt\s*=\s*(["']).*?\1/i, "") : attrs;
    if (ourRev) cleaned = cleaned.replace(/\s*\bdata-meta-rev\s*=\s*(["']).*?\1/i, "");
    changed++;
    return `<img${cleaned.replace(/\s*$/, "")} ${attr}="${esc}" data-meta-rev="${meta.rev ?? ""}"${selfClose ? " /" : ""}>`;
  });
  return { code: out2, changed, skipped };
}
function jsonLdScript(metas2) {
  const items = [...metas2.values()].filter((m) => m && m.jsonld).map((m) => m.jsonld);
  if (!items.length) return "";
  return `<script type="application/ld+json">${JSON.stringify(items.length === 1 ? items[0] : items)}</script>`;
}

// packages/core/src/inject.js
var HTML_EXT = /* @__PURE__ */ new Set([".html", ".htm"]);
var LANGS = /* @__PURE__ */ new Set(["ko", "en", "ja", "zh", "es", "vi", "zh-Hant"]);
function normalizeLang(tag) {
  const parts = String(tag || "").trim().replace(/_/g, "-").toLowerCase().split("-");
  if (!parts[0]) return null;
  if (parts[0] === "zh") return parts.slice(1).some((p) => p === "hant" || p === "tw" || p === "hk" || p === "mo") ? "zh-Hant" : "zh";
  return LANGS.has(parts[0]) ? parts[0] : null;
}
var LD_RE = /\n?<script type="application\/ld\+json" data-imagemeta>[\s\S]*?<\/script>/i;
async function* walkHtml(dir) {
  for (const e of await readdir2(dir, { withFileTypes: true })) {
    const p = join2(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) yield* walkHtml(p);
    } else if (HTML_EXT.has(extname2(e.name).toLowerCase())) yield p;
  }
}
function htmlLang(html) {
  const m = /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)/i.exec(html);
  return m ? normalizeLang(m[1]) : null;
}
function withJsonLd(html, ld) {
  const had = LD_RE.test(html);
  let out2 = html.replace(LD_RE, "");
  if (!ld) return { html: out2, changed: had };
  const tag = ld.replace('<script type="application/ld+json">', '<script type="application/ld+json" data-imagemeta>');
  out2 = /<\/head>/i.test(out2) ? out2.replace(/<\/head>/i, `${tag}
</head>`) : tag + out2;
  return { html: out2, changed: true };
}
async function injectDir(dir, opts) {
  if (!opts || !opts.apiBase) throw new Error("[imagemeta] apiBase \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4 (\uC608: https://<dos>/t23/v1)");
  const defaultLang = (opts.lang || "ko").toLowerCase();
  const jsonld = opts.jsonld !== false;
  const cacheDir = opts.cacheDir === void 0 ? ".cache" : opts.cacheDir;
  const pages = [];
  for await (const file of walkHtml(dir)) {
    const html = await readFile3(file, "utf8");
    const lang = opts.langFromHtml !== false && htmlLang(html) || defaultLang;
    pages.push({ file, html, lang });
  }
  const byLang = /* @__PURE__ */ new Map();
  for (const p of pages) {
    if (!byLang.has(p.lang)) {
      byLang.set(p.lang, {
        client: createClient({ ...opts, lang: p.lang, cacheFile: cacheDir ? join2(cacheDir, `imagemeta.${p.lang}.json`) : null }),
        ids: /* @__PURE__ */ new Set(),
        metas: /* @__PURE__ */ new Map()
      });
    }
    const g = byLang.get(p.lang);
    for (const id of g.client.extractIds(p.html)) g.ids.add(id);
  }
  const stats = { pages: pages.length, changedPages: 0, altAdded: 0, altSkipped: 0, requests: 0, fetched: 0, cached: 0, missing: 0, langs: [] };
  for (const [lang, g] of byLang) {
    if (g.ids.size) g.metas = await g.client.fetchMany([...g.ids]);
    for (const k of ["requests", "fetched", "cached", "missing"]) stats[k] += g.client.stats[k];
    stats.langs.push({ lang, images: g.ids.size });
  }
  const files = [];
  for (const p of pages) {
    const g = byLang.get(p.lang);
    const ids = g.client.extractIds(p.html);
    if (!ids.length) continue;
    const r = injectAlt(p.html, g.metas, { force: opts.force, fillEmpty: opts.fillEmpty, imageHosts: opts.imageHosts });
    let out2 = r.code;
    if (jsonld) {
      const used = new Map(ids.filter((id) => g.metas.get(id)).map((id) => [id, g.metas.get(id)]));
      out2 = withJsonLd(out2, jsonLdScript(used)).html;
    }
    stats.altAdded += r.changed;
    stats.altSkipped += r.skipped;
    if (out2 !== p.html) {
      stats.changedPages++;
      files.push({ file: relative2(dir, p.file).replace(/\\/g, "/"), lang: p.lang, altAdded: r.changed });
      if (!opts.dryRun) await writeFile3(p.file, out2, "utf8");
    }
  }
  return { ...stats, files, dryRun: Boolean(opts.dryRun) };
}

// packages/core/bin/imagemeta.js
var DEFAULT_API_BASE = true ? "https://biz.dossai.app/t23/v1" : "";
var USAGE = `\uC0AC\uC6A9\uBC95: imagemeta <upload|wait|rewrite|list|describe|visibility|usage|sites|inject> \u2026 [--json]
  imagemeta upload public/images            imagemeta wait --timeout 600
  imagemeta rewrite src --public-dir public  imagemeta inject dist
  \uD0A4: IMAGEMETA_API_KEY \uD658\uACBD \uBCC0\uC218 \xB7 \uC8FC\uC18C: --api-base \uB610\uB294 IMAGEMETA_API_BASE   (imagemeta --help)`;
var FLAGS = {
  "--no-cache": ["cacheDir", null],
  "--no-jsonld": ["jsonld", false],
  "--no-lang-from-html": ["langFromHtml", false],
  "--force": ["force", true],
  "--fill-empty-alt": ["fillEmpty", true],
  "--dry-run": ["dryRun", true],
  "--strict": ["strict", true],
  "--json": ["json", true],
  "--yes": ["yes", true]
};
var VALUES = {
  "--api-base": "apiBase",
  "--lang": "lang",
  "--cache-dir": "cacheDir",
  "--manifest": "manifest",
  "--timeout": "timeout",
  "--interval": "interval",
  "--public-dir": "publicDir",
  "--query": "query",
  "--set": "set",
  "--from": "from",
  "--to": "to"
};
function parse(argv) {
  const o = { hosts: [], positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      o.help = true;
      continue;
    }
    if (a === "--api-key") throw new Error("API \uD0A4\uB294 \uBA85\uB839\uC904\uB85C \uBC1B\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4 \u2014 IMAGEMETA_API_KEY \uD658\uACBD \uBCC0\uC218\uC5D0 \uB123\uC73C\uC138\uC694");
    if (a in FLAGS) {
      o[FLAGS[a][0]] = FLAGS[a][1];
      continue;
    }
    if (a in VALUES || a === "--host") {
      const v = argv[++i];
      if (v === void 0 || v.startsWith("--") && a !== "--set") throw new Error(`${a} \uC5D0 \uAC12\uC774 \uD544\uC694\uD569\uB2C8\uB2E4`);
      if (a === "--host") o.hosts.push(v);
      else o[VALUES[a]] = v;
      continue;
    }
    if (a.startsWith("--")) throw new Error(`\uBAA8\uB974\uB294 \uC635\uC158: ${a}`);
    o.positional.push(a);
  }
  return o;
}
var out = (o, data, human) => {
  if (o.json) process.stdout.write(JSON.stringify(data) + "\n");
  else process.stdout.write(human(data) + "\n");
};
var log = (msg) => process.stderr.write(`[imagemeta] ${msg}
`);
async function main() {
  let o;
  try {
    o = parse(process.argv.slice(2));
  } catch (e) {
    log(e.message);
    process.stderr.write(USAGE + "\n");
    return 2;
  }
  if (o.help || !o.positional.length) {
    process.stdout.write(USAGE + "\n");
    return o.help ? 0 : 2;
  }
  const [cmd, ...args] = o.positional;
  const apiBase = o.apiBase || process.env.IMAGEMETA_API_BASE || DEFAULT_API_BASE;
  const apiKey = process.env.IMAGEMETA_API_KEY || "";
  const lang = o.lang || process.env.IMAGEMETA_LANG || "ko";
  const known = ["upload", "wait", "rewrite", "list", "describe", "visibility", "usage", "sites", "inject"];
  if (!known.includes(cmd)) {
    log(`\uBAA8\uB974\uB294 \uBA85\uB839: ${cmd}`);
    process.stderr.write(USAGE + "\n");
    return 2;
  }
  if (!apiBase) {
    log("--api-base \uB610\uB294 IMAGEMETA_API_BASE \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4");
    return 2;
  }
  if (cmd === "inject") return injectCmd(o, args, apiBase, apiKey, lang);
  if (!apiKey) {
    log("IMAGEMETA_API_KEY \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4 (\uCF58\uC194 \uC5F0\uB3D9 \u2192 API \uD0A4\uC5D0\uC11C \uB9CC\uB4E0 \uD0A4)");
    return 2;
  }
  const client = api({ apiBase, apiKey });
  const common = { manifest: o.manifest, lang };
  try {
    switch (cmd) {
      case "upload": {
        if (!args.length) {
          log("\uC62C\uB9B4 \uD3F4\uB354\uB098 \uD30C\uC77C\uC744 \uC8FC\uC138\uC694");
          return 2;
        }
        const r = await upload(client, { ...common, paths: args, dryRun: o.dryRun, log: o.json ? () => {
        } : log });
        out(o, r, (x) => `\uC62C\uB9BC ${x.uploaded} \xB7 \uADF8\uB300\uB85C ${x.unchanged} \xB7 \uC774\uBBF8 \uC788\uC74C ${x.duplicate} \xB7 \uC2E4\uD328 ${x.failed}${x.dryRun ? " (dry-run: " + x.items.filter((i) => i.result === "would-upload").length + "\uAC1C \uC62C\uB9B4 \uC608\uC815)" : ""}` + x.items.filter((i) => i.result === "failed").map((i) => `
  \uC2E4\uD328 ${i.path}: ${i.error}`).join(""));
        return r.failed ? 1 : 0;
      }
      case "wait": {
        const r = await wait(client, { ...common, timeoutSec: Number(o.timeout ?? 600), intervalSec: Number(o.interval ?? 10), onTick: (t) => log(`\uBD84\uC11D ${t.done}/${t.total}`) });
        out(o, r, (x) => `\uBD84\uC11D ${x.analyzed}/${x.total} \xB7 ${x.seconds}\uCD08${x.timedOut ? " \xB7 \uC2DC\uAC04 \uCD08\uACFC" : ""}${x.failed.length ? ` \xB7 \uC2E4\uD328 ${x.failed.join(", ")}` : ""}${x.missing.length ? ` \xB7 \uC11C\uBC84\uC5D0 \uC5C6\uC74C ${x.missing.join(", ")}` : ""}`);
        return r.ok ? 0 : 1;
      }
      case "rewrite": {
        if (!args.length) {
          log("\uBC14\uAFC0 \uC18C\uC2A4 \uD3F4\uB354\uB098 \uD30C\uC77C\uC744 \uC8FC\uC138\uC694");
          return 2;
        }
        const r = await rewrite(client, { ...common, srcPaths: args, publicDir: o.publicDir ?? "public", dryRun: o.dryRun, query: o.query ?? "" });
        out(o, r, (x) => `\uD30C\uC77C ${x.files} \xB7 \uBC14\uB010 \uD30C\uC77C ${x.changedFiles}${x.dryRun ? "(dry-run, \uC548 \uC500)" : ""} \xB7 \uBC14\uAFBC \uACF3 ${x.replaced}` + x.changes.map((c) => `
  ${c.file}:${c.line}  ${c.from} \u2192 ${c.to}`).join("") + x.skipped.map((s) => `
  \uAC74\uB108\uB700 ${s.file}:${s.line}  ${s.reason}`).join(""));
        return 0;
      }
      case "list": {
        const r = await list(client, common);
        out(o, r, (x) => x.items.map((i) => `${i.path}  ${i.id}  ${i.status}  ${i.visibility ?? ""}  ${i.alt ?? ""}`).join("\n") || "\uB9E4\uB2C8\uD398\uC2A4\uD2B8\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4");
        return 0;
      }
      case "describe": {
        if (!args[0]) {
          log("\uACBD\uB85C\uB098 id \uB97C \uC8FC\uC138\uC694");
          return 2;
        }
        const r = await describe(client, { ...common, target: args[0], set: o.set });
        out(o, r, (x) => `${x.path ?? x.id}  ${x.status} \xB7 ${x.visibility} \xB7 ${x.origin ?? "\uC124\uBA85 \uC5C6\uC74C"}${x.updated ? " \xB7 \uACE0\uCE68" : ""}
` + Object.entries(x.captions).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
        return 0;
      }
      case "visibility": {
        const [value, ...targets] = args;
        if (!value || !targets.length) {
          log("imagemeta visibility <site|public|private> <\uACBD\uB85C|id\u2026>");
          return 2;
        }
        const r = await visibility(client, { ...common, value, targets, yes: o.yes });
        out(o, r, (x) => `${x.value}: ` + x.items.map((i) => `${i.id.slice(0, 8)} ${i.ok ? "\uBC14\uAFC8" : "\uC2E4\uD328 " + i.error}`).join(" \xB7 "));
        return r.items.every((i) => i.ok) ? 0 : 1;
      }
      case "usage": {
        const r = await usage(client, { from: o.from, to: o.to });
        out(o, r, (x) => `${x.from} ~ ${x.to} \xB7 \uD50C\uB79C ${x.plan}
` + Object.entries(x.totals).map(([k, v]) => `  ${k}: ${v}${x.limits?.[k] ? ` / ${x.limits[k]} (${Math.round(v / x.limits[k] * 100)}%)` : ""}`).join("\n") + (x.warnings?.length ? `
  80% \uB118\uC74C: ${x.warnings.join(", ")}` : ""));
        return 0;
      }
      case "sites": {
        if (args[0] !== "list") {
          log("\uC0AC\uC774\uD2B8 \uD0A4\uB294 \uC77D\uAE30\uB9CC \uB429\uB2C8\uB2E4: imagemeta sites list (\uB9CC\uB4E4\uAE30 \xB7 \uC218\uC815\uC740 \uCF58\uC194\uC5D0\uC11C \u2014 AG-2)");
          return 2;
        }
        const r = await sitesList(client);
        out(o, { items: r }, (x) => x.items.map((s) => `${s.label ?? "\uC774\uB984 \uC5C6\uC74C"}  ${s.key}  ${s.origins.join(", ")}${s.revoked ? "  (\uD3D0\uAE30)" : ""}`).join("\n") || "\uC0AC\uC774\uD2B8 \uD0A4 \uC5C6\uC74C");
        return 0;
      }
    }
  } catch (e) {
    if (e.usage) {
      log(e.message);
      return 2;
    }
    const msg = String(e.message || e).split(apiKey || "\0").join("***");
    if (o.json) process.stdout.write(JSON.stringify({ error: { code: e.code || "ERROR", message: msg, retryable: Boolean(e.retryable), status: e.status ?? null } }) + "\n");
    log(`\uC2E4\uD328${e.code ? ` (${e.code})` : ""}: ${msg}`);
    return 1;
  }
  return 0;
}
async function injectCmd(o, args, apiBase, apiKey, lang) {
  const dir = args[0];
  if (!dir) {
    log("\uBE4C\uB4DC \uACB0\uACFC \uD3F4\uB354\uB97C \uC8FC\uC138\uC694");
    return 2;
  }
  try {
    if (!(await stat2(dir)).isDirectory()) throw new Error();
  } catch {
    log(`\uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4: ${dir}`);
    return 2;
  }
  if (!apiKey) log("IMAGEMETA_API_KEY \uAC00 \uC5C6\uC2B5\uB2C8\uB2E4 \u2014 public \uC774\uBBF8\uC9C0\uB9CC \uC124\uBA85\uC744 \uBC1B\uC2B5\uB2C8\uB2E4");
  try {
    const r = await injectDir(dir, {
      apiBase,
      apiKey,
      lang,
      langFromHtml: o.langFromHtml,
      jsonld: o.jsonld,
      force: o.force,
      fillEmpty: o.fillEmpty,
      dryRun: o.dryRun,
      cacheDir: o.cacheDir,
      imageHosts: o.hosts.length ? o.hosts : void 0
    });
    out(o, r, (x) => `[imagemeta] \uD398\uC774\uC9C0 ${x.pages} \xB7 \uBC14\uB010 \uD398\uC774\uC9C0 ${x.changedPages}${x.dryRun ? "(dry-run, \uC548 \uC500)" : ""} \xB7 alt ${x.altAdded}\uAC1C \uB123\uC74C \xB7 \uAC74\uB108\uB700 ${x.altSkipped} \xB7 \uC694\uCCAD ${x.requests}\uD68C \xB7 \uBC1B\uC74C ${x.fetched} \xB7 \uCE90\uC2DC ${x.cached} \xB7 \uC5C6\uC74C ${x.missing} \xB7 \uC5B8\uC5B4 ${x.langs.map((l) => `${l.lang}:${l.images}`).join(" ") || "-"}` + x.files.map((f) => `
  ${f.file} (${f.lang}) alt +${f.altAdded}`).join(""));
    return 0;
  } catch (e) {
    const msg = String(e && e.message || e).split(apiKey || "\0").join("***");
    if (o.strict) {
      log(`\uC2E4\uD328: ${msg}`);
      return 1;
    }
    log(`\uBA54\uD0C0\uB97C \uBC1B\uC9C0 \uBABB\uD574 \uC544\uBB34\uAC83\uB3C4 \uBC14\uAFB8\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4(\uBE4C\uB4DC\uB294 \uACC4\uC18D): ${msg}`);
    return 0;
  }
}
process.exitCode = await main();
