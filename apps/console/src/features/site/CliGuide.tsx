/// biz.dossai.app/cli — 고객이 AI 개발 도구(Claude Code · Cursor 등)로 직접 연동해 보는 안내(11-27).
/// 사람은 키를 만들고 한 문장만 말하면 되고, 나머지는 AI 도구가 /cli/AGENTS.md 를 읽고 한다 — "AI 로 편하게 만들어진다"를 느끼게.
/// CLI 는 npm 에 올리기 전이라 /cli/imagemeta.mjs 한 파일로 내려준다(packages/core/scripts/build-cli.mjs).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { CONTACT, SITE_BRAND, SiteFoot, SiteTop } from './Landing';
import './site.css';

const AGENT_DOC = 'https://biz.dossai.app/cli/AGENTS.md';
const PROMPT = `${AGENT_DOC} 를 읽고, 이 프로젝트의 이미지를 ${SITE_BRAND} 와 연동해 줘. 바꾸기 전에 무엇을 바꿀지 먼저 보여 줘.`;

function Copy({ text, label = '복사' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="bs-btn bs-copy" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* 복사 막힘 — 직접 선택 */ } }}>
      {done ? '복사했어요' : label}
    </button>
  );
}

function Code({ children, copy = true }: { children: string; copy?: boolean }) {
  return (
    <div className="bs-codebox">
      <pre className="bs-code">{children}</pre>
      {copy && <Copy text={children} />}
    </div>
  );
}

export function CliGuidePage() {
  useEffect(() => { document.title = `${SITE_BRAND} — AI 개발 도구로 연동하기`; }, []);
  return (
    <div className="bs">
      <SiteTop />
      <main className="bs-wrap bs-doc">
        <span className="bs-lbl">AI 개발 도구로 연동하기</span>
        <h1>한 문장만 말하세요.<br />나머지는 AI 개발 도구가 합니다.</h1>
        <p className="bs-lead">Claude Code · Cursor 같은 AI 개발 도구에게 아래 문장을 붙여 넣으면, 도구가 이 안내를 읽고 이미지 올리기 · 4개 언어 설명 만들기 · 사이트의 이미지 주소 바꾸기 · 설명(alt) 넣기까지 진행합니다. 사람은 키를 만들고 바뀐 내용을 확인만 하면 됩니다.</p>

        <section className="bs-sec">
          <h2>1. API 키 만들기</h2>
          <p className="bs-lead"><Link to="/login">콘솔</Link>에 로그인 › <b>연동 › API 키</b>에서 <b>"CLI · AI 개발 도구"</b>를 골라 키를 만드세요. 키는 만들 때 한 번만 보입니다. <b>설정 › AI 분석</b>도 켜져 있어야 설명이 만들어집니다.</p>
        </section>

        <section className="bs-sec">
          <h2>2. 키를 환경 변수에 넣기</h2>
          <p className="bs-lead">AI 개발 도구를 여는 터미널에 넣습니다. <b>키를 AI 와의 대화창에 붙여 넣지 마세요</b> — 도구는 환경 변수에서 읽습니다.</p>
          <div className="bs-cards two">
            <div className="bs-card"><h3>Windows PowerShell</h3><Code>{'$env:IMAGEMETA_API_KEY = "만든 키"'}</Code></div>
            <div className="bs-card"><h3>macOS · Linux</h3><Code>{'export IMAGEMETA_API_KEY="만든 키"'}</Code></div>
          </div>
          <p className="bs-small">이 창을 닫으면 사라집니다. 계속 쓰려면 셸 설정 파일이나 비밀 값 관리 도구에 넣으세요. 저장소 파일에는 넣지 마세요.</p>
        </section>

        <section className="bs-sec">
          <h2>3. AI 개발 도구에게 말하기</h2>
          <p className="bs-lead">사이트 소스가 있는 폴더에서 AI 개발 도구를 열고, 이 문장을 그대로 붙여 넣으세요.</p>
          <Code>{PROMPT}</Code>
          <div className="bs-cards two" style={{ marginTop: 16 }}>
            <div className="bs-card"><h3>도구가 하는 일</h3><p>CLI 한 파일 받기 → 올릴 이미지 미리 보여 주기 → 올리기 → 설명이 만들어질 때까지 기다리기 → 소스의 이미지 주소를 영구 주소로 바꾸기 → 빌드 결과에 alt · 구조화 데이터 넣기</p></div>
            <div className="bs-card"><h3>사람이 하는 일</h3><p>도구가 보여 주는 바뀐 내용(diff)을 확인하고, 괜찮으면 배포. 원본 이미지 파일은 지워지지 않고, 바뀌는 건 소스 안의 주소뿐입니다</p></div>
          </div>
        </section>

        <section className="bs-sec">
          <h2>어떻게 바뀌나요</h2>
          <Code copy={false}>{`<!-- 전 -->
<img src="/images/sofa-gray.jpg">

<!-- 후 -->
<img src="https://img.dossai.app/i/3cdeca05-…?w=800"
     alt="밝은 회색 패브릭 3인용 소파, 나무 다리, 쿠션 두 개">`}</Code>
          <p className="bs-small">이미지는 {SITE_BRAND} 가 화면에 맞는 크기 · 형식(WebP · AVIF)으로 빠르게 전달하고, 설명은 페이지 언어(한국어 · 영어 · 일본어 · 중국어)에 맞춰 들어갑니다. 설명은 콘솔에서 언제든 고칠 수 있고, 고치면 몇 분 안에 사이트에 반영됩니다.</p>
        </section>

        <section className="bs-sec">
          <h2>직접 해 보고 싶다면</h2>
          <p className="bs-lead">AI 개발 도구 없이도 같은 명령으로 할 수 있습니다(Node 18 이상).</p>
          <Code>{`curl -fsSL https://biz.dossai.app/cli/imagemeta.mjs -o imagemeta.mjs
node imagemeta.mjs upload public/images
node imagemeta.mjs wait
node imagemeta.mjs rewrite src --public-dir public
npm run build && node imagemeta.mjs inject dist`}</Code>
          <p className="bs-small">명령 전체와 규칙은 AI 개발 도구가 읽는 안내와 같습니다: <a href="/cli/AGENTS.md" target="_blank" rel="noreferrer">/cli/AGENTS.md</a> · CLI 파일 해시 <a href="/cli/imagemeta.mjs.sha256" target="_blank" rel="noreferrer">sha256</a></p>
        </section>

        <section className="bs-sec">
          <h2>자주 묻는 것</h2>
          <div className="bs-cards two">
            <div className="bs-card"><h3>키가 AI 회사로 넘어가나요?</h3><p>키는 환경 변수에만 두고 대화에 붙여 넣지 않습니다. 도구는 명령을 실행할 때만 키를 씁니다.</p></div>
            <div className="bs-card"><h3>되돌릴 수 있나요?</h3><p>소스 변경은 git 으로 되돌릴 수 있고, 올린 이미지는 콘솔에서 지우거나 비공개로 바꿀 수 있습니다.</p></div>
            <div className="bs-card"><h3>이미지가 많으면요?</h3><p>같은 사진은 다시 올리지 않습니다. 중간에 끊겨도 다시 돌리면 이어서 진행합니다.</p></div>
            <div className="bs-card"><h3>막히면요?</h3><p>도구가 보여 준 오류 줄을 <a href={`mailto:${CONTACT}`}>{CONTACT}</a> 로 보내 주세요(키는 빼고).</p></div>
          </div>
        </section>

        <section className="bs-cta">
          <div><h2>아직 계정이 없으신가요?</h2><p>무료 이미지 진단부터 받아 보셔도 됩니다.</p></div>
          <Link className="bs-btn primary" to="/#audit">무료 진단 신청</Link>
        </section>
        <SiteFoot />
      </main>
    </div>
  );
}
