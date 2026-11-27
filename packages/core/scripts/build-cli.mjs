// 고객이 내려받아 바로 쓰는 CLI 한 파일 — apps/console/public/cli/imagemeta.mjs (biz.dossai.app/cli/imagemeta.mjs).
// npm 에 올리기 전(이름이 아직 자리표시자)이라 콘솔과 같은 곳에서 내려준다. 의존성이 없어 esbuild 로 한 파일로 묶고, API 주소를 기본값으로 넣는다.
// 사용: node packages/core/scripts/build-cli.mjs [API 주소]   (기본 https://biz.dossai.app/t23/v1)
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiBase = process.argv[2] || 'https://biz.dossai.app/t23/v1';
const out = resolve(here, '../../../apps/console/public/cli/imagemeta.mjs');
await mkdir(dirname(out), { recursive: true });
await build({
  entryPoints: [resolve(here, '../bin/imagemeta.js')], bundle: true, platform: 'node', format: 'esm', target: 'node18',
  outfile: out, define: { __IMAGEMETA_API_BASE__: JSON.stringify(apiBase) }, legalComments: 'none',
  banner: { js: `// DOSSAI 이미지 CLI (imagemeta) — node imagemeta.mjs --help   · 안내: https://biz.dossai.app/cli\n// 키는 IMAGEMETA_API_KEY 환경 변수로만. 기본 주소 ${apiBase}` },
});
const buf = await readFile(out);
const sha = createHash('sha256').update(buf).digest('hex');
await writeFile(out + '.sha256', `${sha}  imagemeta.mjs\n`);
console.log(`${out}  ${buf.length} B  sha256 ${sha.slice(0, 16)}…`);
