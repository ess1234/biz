// 페이지 스크립트 번들 (sai/scripts/build-pagescript.mjs 에서 옮김) — src/imagemeta.js → <OUT_DIR>/<name>-<ver>.min.js (+ .sri.txt).
// 의존성 없음, esbuild(vite 동봉)로 압축만. 사용: node build.mjs [출력 폴더]  (기본 ../../apps/console/public/js — 콘솔이 /js/ 로 서빙)
// 이름은 PAGESCRIPT_NAME(기본 imagemeta — 제품명 미정 자리표시자), 버전은 PAGESCRIPT_VERSION(기본 0.1.0)
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || resolve(here, '../../apps/console/public/js'));
const name = process.env.PAGESCRIPT_NAME || 'imagemeta';
const ver = process.env.PAGESCRIPT_VERSION || '0.1.0';
const out = resolve(outDir, `${name}-${ver}.min.js`);
mkdirSync(outDir, { recursive: true });
await build({ entryPoints: [resolve(here, 'src/imagemeta.js')], outfile: out, bundle: false, minify: true, target: ['es2017'], legalComments: 'none', format: 'iife', logLevel: 'silent' });
const buf = readFileSync(out);
const gz = gzipSync(buf).length;
const sri = 'sha384-' + createHash('sha384').update(buf).digest('base64');
writeFileSync(resolve(outDir, `${name}-${ver}.sri.txt`), sri + '\n');
const limit = 6 * 1024;
console.log(`[pagescript] ${out}  raw ${buf.length} B · gzip ${gz} B (한도 ${limit}) · ${sri}`);
if (gz > limit) { console.error('[pagescript] gzip 한도 초과'); process.exit(1); }
