# DOSSAI 이미지 연동 — AI 개발 도구용 안내

이 문서는 Claude Code · Cursor 같은 AI 개발 도구가 읽고 그대로 따라 하라고 만든 안내입니다.
사용자가 "이 프로젝트의 이미지를 DOSSAI 와 연동해 줘" 라고 하면 아래 순서로 진행하세요.

목표: 프로젝트의 이미지를 DOSSAI 에 올리고, 소스의 이미지 경로를 DOSSAI 영구 주소로 바꾸고,
페이지에 이미지 설명(alt · 4개 언어 중 페이지 언어)이 들어가게 한다.

## 지켜야 할 것

- **API 키는 환경 변수 `IMAGEMETA_API_KEY` 로만 씁니다.** 사용자에게 키를 대화에 붙여 넣으라고 하지 말고,
  키를 파일 · 커밋 · 로그에 남기지 마세요. 없으면 사용자에게 "biz.dossai.app › 연동 › API 키에서
  'CLI · AI 개발 도구' 키를 만들어 환경 변수에 넣어 달라"고 안내하고 기다리세요.
- 원본 이미지 파일은 지우거나 옮기지 않습니다. 바뀌는 것은 소스 안의 이미지 **주소**뿐입니다.
- 실제로 올리기 전에 `--dry-run` 으로 무엇이 올라갈지 먼저 보여 주세요.
- 소스를 고친 뒤에는 바뀐 내용(diff)을 사용자에게 보여 주고, 배포는 사용자가 하게 두세요.
- 결과는 stdout, 진행 상황은 stderr 에 나옵니다. 자동 처리에는 `--json` 을 붙이세요.
  종료 코드: 0 정상 · 1 실패(API 오류 · 분석 실패 · 시간 초과 · 한도) · 2 사용법 오류.

## 순서

### 0. CLI 받기 (Node 18 이상)

한 파일짜리입니다. 프로젝트 밖이나 무시되는 폴더에 두세요.

```bash
curl -fsSL https://biz.dossai.app/cli/imagemeta.mjs -o imagemeta.mjs
```
Windows PowerShell:
```powershell
Invoke-WebRequest https://biz.dossai.app/cli/imagemeta.mjs -OutFile imagemeta.mjs
```
확인용 해시: https://biz.dossai.app/cli/imagemeta.mjs.sha256 · 도움말: `node imagemeta.mjs --help`
기본 API 주소가 들어 있어 `--api-base` 는 필요 없습니다.

키가 들어 있는지 먼저 확인합니다(사용량이 나오면 정상):
```bash
node imagemeta.mjs usage
```

### 1. 이미지 찾기 · 올리기

프로젝트에서 사이트가 쓰는 이미지 폴더를 찾습니다(예: `public/images`, `static/img`, `src/assets`).

```bash
node imagemeta.mjs upload public/images --dry-run
node imagemeta.mjs upload public/images
```
- `imagemeta.json`(로컬 경로 ↔ 이미지 id 목록)이 생깁니다. **커밋하세요** — 다시 돌릴 때 같은 사진은 올리지 않습니다.
- 큰 사진은 장마다 몇 초 걸립니다. 진행 상황이 stderr 에 나옵니다.

### 2. 설명 만들기 기다리기

```bash
node imagemeta.mjs wait --timeout 900
```
워크스페이스 설정에서 AI 분석이 꺼져 있으면 설명이 만들어지지 않습니다 — 사용자에게 콘솔 › 설정에서 켜 달라고 하세요.

### 3. 소스의 이미지 주소 바꾸기

```bash
node imagemeta.mjs rewrite src --public-dir public --dry-run
node imagemeta.mjs rewrite src --public-dir public
```
`<img src="/images/a.jpg">` 같은 로컬 경로가 `https://img.dossai.app/i/<id>` 로 바뀝니다.
크기는 `?w=400` · `?w=800` · `?w=1200` 을 붙여 고를 수 있고, 형식(WebP · AVIF)은 브라우저에 맞춰 자동입니다.

### 4. 설명(alt) 넣기 — 둘 중 하나

**A. 빌드 결과에 넣기(권장 — 검색엔진 · AI 검색이 HTML 에서 바로 읽음)**
```bash
npm run build
node imagemeta.mjs inject dist
```
빌드 결과 HTML 의 `<img>` 에 alt 와 이미지 구조화 데이터(JSON-LD)가 들어갑니다. 빌드 명령 뒤에 붙여 두면 됩니다
(예: package.json 의 `"build": "vite build && node imagemeta.mjs inject dist"`).

**B. 페이지 스크립트 한 줄(빌드가 없는 정적 페이지)**
사용자가 콘솔 › 연동 › 사이트 키에서 키를 만들고 허용 출처에 사이트 주소(예: `https://www.example.co.kr`)를 넣어야 합니다.
```html
<script src="https://biz.dossai.app/js/imagemeta-0.1.0.min.js" data-key="pk_…" data-lang="ko" data-api="https://biz.dossai.app/t23/v1" defer></script>
```

### 5. 확인 · 보고

```bash
node imagemeta.mjs list
```
이미지마다 상태와 alt 가 나옵니다. 사용자에게 다음을 알려 주세요:
올린 이미지 수 · 바뀐 파일과 바꾼 곳 · alt 를 넣은 방법(A/B) · 남은 일(배포, 사이트 키).

## 그 밖의 명령

| 명령 | 하는 일 |
|---|---|
| `describe <경로\|id> [--set "설명"] [--lang en]` | 설명 보기 · 고치기 |
| `visibility <site\|public\|private> <경로…> --yes` | 공개 범위 바꾸기(public · private 는 --yes 필요) |
| `usage` | 이번 달 사용량 · 한도 |
| `sites list` | 사이트 키 · 허용 출처 보기(만들기는 콘솔) |

문의: hello@dossai.app · 사람이 읽는 안내: https://biz.dossai.app/cli
