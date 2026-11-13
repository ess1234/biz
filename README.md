# biz

B2B(이미지 클라우드) 프런트 저장소. 서버는 `dos`(`T23_PRODUCT=biz`, Vercel `dos-biz-stage`), 엣지는 `dos/edge`.
구성 전체는 `../doc/architecture-as-is-to-be.html` — DA-2 수정(11-10): B2B 콘솔은 sai 가 아니라 이 저장소에 둔다.

| 위치 | 무엇 | 상태 |
|---|---|---|
| `apps/console` | B2B 콘솔 (biz-dev-08 화면 설계) — Vercel `biz-console-stage` | 1~3차 완료 · 교체 배포(11-10) |
| `packages/core` | `@imagemeta/core` — 메타 묶음 조회 · alt 주입 · JSON-LD + CLI `imagemeta`(upload · wait · rewrite · list · describe · visibility · usage · sites list · inject) | v0.1 · CLI 11-12 · 에이전트 명령 11-13 |
| `packages/vite` | `@imagemeta/vite` — 빌드 연동 | v0.1 |
| `packages/pagescript` | 고객 페이지 스크립트 한 줄(imagemeta.js). 콘솔 빌드 전에 `apps/console/public/js/` 로 빌드 → 콘솔이 `/js/` 로 서빙 | sai/pagescript 에서 옮김 |
| `fixtures/vite-static` | 빌드 연동 검사용 사이트 — `dos/scripts/biz_client_fixture.py` 가 채워 빌드 | |
| `fixtures/agent` | 에이전트용 명령 검사 — 고객 프로젝트 흉내 + 가짜 서버(등록 → PUT → 완료 → 분석 · 중복 · 쪽 넘김 · 409 · 429), `node check.mjs` | 34/34 (11-13) · 실서버 17/17(`dos/scripts/biz_agent_cli_scenario.py`, 11-13) |
| `fixtures/postbuild` | CLI 검사 — Next 정적 export(out/) · webpack(dist/) 결과물 흉내, `node check.mjs`(가짜 메타 서버, DB 없음) | 26/26 (11-12) |
| `fixtures/vite-vue` | Vue 3 + Vite 빌드 연동 검사 — `node check.mjs`(가짜 메타 서버, DB 없음): .vue 정적 img · 자식 컴포넌트 · 손으로 쓴 alt · `:alt` · `:src` · 비공개 · 남의 이미지 · JSON-LD · 캐시 | 14/14 (11-12) |

## 콘솔

- 로컬: `cd apps/console` → `.env.local`(git 무시, `.env.example` 참고) → `npm run dev` (http://localhost:5174, `BIZ_API_BASE` 로 dos 지정 — 기본 127.0.0.1:8000).
- 빌드 변수: `VITE_BRAND`(제품명 자리표시자) · `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `VITE_IMAGE_BASE`(이미지 호스트) · `VITE_API_BASE`(비우면 같은 오리진 `/t23/v1`) · `VITE_PAGE_SCRIPT`(기본 `imagemeta-0.1.0.min.js`). sai 의 `VITE_T23_*` 와 이름이 다르다.
- 라우트: `/` 홈 · `/welcome` 첫 로그인 · `/images` · `/images/:id` · `/integrations?tab=site|build|api` · `/billing?tab=usage|invoices|plan` · `/settings` · `/admin`(운영자만). 옛 `/me*` 는 새 주소로 리다이렉트.
- 배포(Vercel, 모노레포): 프로젝트 Root Directory = `apps/console`, 저장소 루트(`biz/`)에서 `npx vercel deploy`. `npm run build` 의 prebuild 가 `../../packages/pagescript` 를 빌드한다.

- 패키지 이름 `imagemeta` 는 자리표시자 — 제품명이 정해지면 한 곳에서 바꾼다. 코드에 호스트를 박지 않는다(`apiBase` 는 필수 인자).
- npm 11 은 install-scripts 를 막는다 → esbuild 는 `npm rebuild esbuild`.

## 빌드 뒤 주입 CLI — Vite 가 아닌 빌드(Next 정적 export · Gatsby · Astro · Angular · webpack)

```bash
IMAGEMETA_API_KEY=<읽기 API 키> npx imagemeta inject out --api-base https://<dos>/t23/v1
```

- 결과 폴더의 `.html` 만 고친다: `<img src|data-src="…/i/{id}">` 에 alt + `data-meta-rev`, `<head>` 에 ImageObject JSON-LD 1개(`data-imagemeta`). JS 번들 안의 이미지는 그대로(페이지 스크립트 · 서버 렌더 몫).
- 언어는 페이지의 `<html lang>`(ko · en · ja · zh)을 따른다 — 없으면 `--lang`. 언어마다 요청 · 캐시를 따로(`.cache/imagemeta.<lang>.json`).
- 사람이 쓴 alt 는 유지(`--force` 로만 덮음). `alt=""` 도 기본은 유지(꾸밈 이미지) — Next `<Image alt="">` 처럼 비워 둔 사이트는 `--fill-empty-alt`.
- 다시 돌려도 안전: 우리 alt 는 rev 가 바뀔 때만 다시 쓰고, JSON-LD 는 중복 없이 바꿔 쓴다.
- 메타를 못 받으면 경고만 하고 종료 0(빌드를 막지 않음). `--strict` 면 종료 1. `--dry-run` 은 쓰지 않고 바뀔 파일만.
- API 키는 환경 변수로만 받는다(`--api-key` 는 거절 — 명령줄 기록에 남지 않게).

## 에이전트용 명령 — 사람 없이 끝까지 (biz-dev-09 1단계, AG-1~5)

```bash
export IMAGEMETA_API_KEY=<콘솔 연동 → API 키, 범위 assets:read+write>  IMAGEMETA_API_BASE=https://<B2B API>/t23/v1
imagemeta upload public/images        # → imagemeta.json(경로 → id · sha256 · status · url · rev) 커밋
imagemeta wait --timeout 600          # 모두 analyzed 일 때까지 (AI 분석이 꺼져 있으면 바로 실패)
imagemeta rewrite src --dry-run       # 바뀔 곳 확인
imagemeta rewrite src                 # /images/a.jpg · ./a.jpg · url(...) → 영구 주소
npm run build && imagemeta inject dist
```

- 같은 내용(sha256)은 다시 올리지 않는다. 파일 내용이 바뀌면 새 이미지로 올라가고 매니페스트의 id 가 바뀐다.
- `rewrite` 는 따옴표 · 템플릿 문자열 · `url()` 안의 정확한 경로만 바꾼다. `import`/`require` 줄은 그대로(경고), 비공개 이미지는 주소가 없어 그대로.
- `visibility public|private` 는 `--yes` 가 있어야 한다(공개 · 영구 주소 멈춤은 되돌리기 어려움). 사이트 키 만들기는 콘솔에서만(`sites list` 는 읽기).
- 모든 명령 `--json`(결과 stdout · 진행 stderr). 종료 코드 0 정상 · 1 실패(API 오류 · 분석 실패 · 시간 초과 · 한도) · 2 사용법 · 확인 필요.
