# biz

B2B(이미지 클라우드) 프런트 저장소. 서버는 `dos`(`T23_PRODUCT=biz`, Vercel `dos-biz-stage`), 엣지는 `dos/edge`.
구성 전체는 `../doc/architecture-as-is-to-be.html` — DA-2 수정(11-10): B2B 콘솔은 sai 가 아니라 이 저장소에 둔다.

| 위치 | 무엇 | 상태 |
|---|---|---|
| `apps/console` | B2B 콘솔 (biz-dev-08 화면 설계) — Vercel `biz-console-stage` | 예정 (지금은 sai 의 biz 빌드가 서빙) |
| `packages/core` | `@imagemeta/core` — 메타 묶음 조회 · alt 주입 · JSON-LD | v0.1 |
| `packages/vite` | `@imagemeta/vite` — 빌드 연동 | v0.1 |
| `packages/pagescript` | 고객 페이지 스크립트 한 줄(imagemeta.js) | 예정 (지금은 `sai/pagescript`) |
| `fixtures/vite-static` | 빌드 연동 검사용 사이트 — `dos/scripts/biz_client_fixture.py` 가 채워 빌드 | |

- 패키지 이름 `imagemeta` 는 자리표시자 — 제품명이 정해지면 한 곳에서 바꾼다. 코드에 호스트를 박지 않는다(`apiBase` 는 필수 인자).
- npm 11 은 install-scripts 를 막는다 → esbuild 는 `npm rebuild esbuild`.
