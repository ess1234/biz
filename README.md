# biz

B2B(이미지 클라우드) 프런트 저장소. 서버는 `dos`(`T23_PRODUCT=biz`, Vercel `dos-biz-stage`), 엣지는 `dos/edge`.
구성 전체는 `../doc/architecture-as-is-to-be.html` — DA-2 수정(11-10): B2B 콘솔은 sai 가 아니라 이 저장소에 둔다.

| 위치 | 무엇 | 상태 |
|---|---|---|
| `apps/console` | B2B 콘솔 (biz-dev-08 화면 설계) — Vercel `biz-console-stage` 로 갈 것 | 1~3차 완료 (11-10). 아직 sai 의 biz 빌드가 서빙 중 |
| `packages/core` | `@imagemeta/core` — 메타 묶음 조회 · alt 주입 · JSON-LD | v0.1 |
| `packages/vite` | `@imagemeta/vite` — 빌드 연동 | v0.1 |
| `packages/pagescript` | 고객 페이지 스크립트 한 줄(imagemeta.js). 콘솔 빌드 전에 `apps/console/public/js/` 로 빌드 → 콘솔이 `/js/` 로 서빙 | sai/pagescript 에서 옮김 |
| `fixtures/vite-static` | 빌드 연동 검사용 사이트 — `dos/scripts/biz_client_fixture.py` 가 채워 빌드 | |

## 콘솔

- 로컬: `cd apps/console` → `.env.local`(git 무시, `.env.example` 참고) → `npm run dev` (http://localhost:5174, `BIZ_API_BASE` 로 dos 지정 — 기본 127.0.0.1:8000).
- 빌드 변수: `VITE_BRAND`(제품명 자리표시자) · `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `VITE_IMAGE_BASE`(이미지 호스트) · `VITE_API_BASE`(비우면 같은 오리진 `/t23/v1`) · `VITE_PAGE_SCRIPT`(기본 `imagemeta-0.1.0.min.js`). sai 의 `VITE_T23_*` 와 이름이 다르다.
- 라우트: `/` 홈 · `/welcome` 첫 로그인 · `/images` · `/images/:id` · `/integrations?tab=site|build|api` · `/billing?tab=usage|invoices|plan` · `/settings` · `/admin`(운영자만). 옛 `/me*` 는 새 주소로 리다이렉트.
- 배포(Vercel, 모노레포): 프로젝트 Root Directory = `apps/console`, 저장소 루트(`biz/`)에서 `npx vercel deploy`. `npm run build` 의 prebuild 가 `../../packages/pagescript` 를 빌드한다.

- 패키지 이름 `imagemeta` 는 자리표시자 — 제품명이 정해지면 한 곳에서 바꾼다. 코드에 호스트를 박지 않는다(`apiBase` 는 필수 인자).
- npm 11 은 install-scripts 를 막는다 → esbuild 는 `npm rebuild esbuild`.
