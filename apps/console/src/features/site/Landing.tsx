/// biz.dossai.app 첫 페이지(로그인 전) — 기업 웹사이트 이미지 서비스 소개 + 무료 이미지 진단 신청 (2026-11-25, dossai.app/business 에서 옮김).
/// 내용은 B2B 카탈로그(doc/dossai-b2b-catalog.html)를 줄인 것: 진단 신청 → 왜 필요한가 → 도입 효과 → 실제 결과 → 절차 → 요금 → 다시 신청.
/// 어떻게 만들었는지(스크립트 · 빌드 연동 코드)는 넣지 않는다 — 가입 뒤 콘솔의 연동 화면에서 안내한다.
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { API_BASE } from '../../lib/env';
import './site.css';

export const SITE_BRAND = 'DOSSAI';
// 공용 문의 주소 (2026-11-25 결정) — 신청 기록 삭제 요청 · 문의. 대표 개인 연락처는 쓰지 않는다
export const CONTACT = String(import.meta.env.VITE_CONTACT || 'hello@dossai.app');
// 개인 사진 보관 앱(B2C) 안내 — 비우면 맨 아래 줄을 숨긴다
const B2C_SITE = String(import.meta.env.VITE_B2C_SITE_URL ?? 'https://dossai.app').replace(/\/$/, '');
// 보고서 예시 — 우리 이미지로 만든 진단 보고서가 준비되면 빌드 환경 변수로. 비어 있으면 링크를 숨긴다(다른 고객사 · 외부 이미지는 쓰지 않음)
const REPORT_SAMPLE = String(import.meta.env.VITE_REPORT_SAMPLE_URL || '');
const CONSENT_VER = '2026-11-20';

function goAudit(e?: { preventDefault: () => void }) {
  e?.preventDefault();
  document.getElementById('audit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => (document.querySelector('#audit input[name=site_url]') as HTMLInputElement | null)?.focus({ preventScroll: true }), 400);
}

export function SiteTop({ home }: { home?: boolean }) {
  return (
    <header className="bs-top">
      <Link to="/" className="bs-brand">{SITE_BRAND}<small>기업 웹사이트 이미지 서비스</small></Link>
      <span className="bs-spacer" />
      <nav>
        {home ? <a href="#audit" onClick={goAudit}>무료 진단</a> : <Link to="/">서비스 소개</Link>}
        <Link to="/login" className="bs-login">고객 로그인</Link>
      </nav>
    </header>
  );
}

export function SiteFoot() {
  return (
    <footer className="bs-foot">
      <p>서비스 적용 방법은 가입 뒤 콘솔의 <b>연동</b> 화면에서 안내합니다. 문의 <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      {B2C_SITE && <p className="bs-muted">개인 사진 보관 앱을 찾으시나요? <a href={B2C_SITE}>{B2C_SITE.replace(/^https?:\/\//, '')} →</a></p>}
    </footer>
  );
}

/* ───────────────────────── 무료 이미지 진단 신청 (biz-dev-12) ───────────────────────── */
/// 본문은 JSON 을 text/plain 으로 — 같은 출처(/t23/v1 → dos-biz-stage rewrite)라 사전 요청이 없다.
/// website2 는 사람에게 안 보이는 칸(봇 거르기), fill_ms 는 화면을 연 뒤 걸린 시간. 서버가 둘을 보고 스팸을 가른다.
/// 서버가 state 로 결과를 알려 준다: received(새로 접수) · in_progress(같은 사이트를 다른 분이 신청해 진단 중) · already(같은 이메일로 이미 접수).
const AUDIT_GAINS: [string, string][] = [
  ['검색에서 안 보이는 이미지 수', '설명(대체 텍스트)이 없어 검색에 잡히지 않는 이미지가 몇 장인지'],
  ['줄일 수 있는 파일 용량', '페이지를 무겁게 하는 이미지와 줄일 수 있는 양'],
  ['귀사 이미지로 만든 4개 언어 설명', '도입하면 실제로 어떻게 바뀌는지, 대표 이미지 3장으로'],
  ['규모에 맞는 예상 월 요금', '이미지 수에 맞춘 요금제'],
];
const AUDIT_RESULT: Record<string, [string, string]> = {
  received: ['접수됐습니다', '보고서는 보통 2영업일 안에 입력하신 이메일로 보내 드립니다.'],
  already: ['이미 접수된 신청입니다', '보고서가 준비되면 입력하신 이메일로 보내 드립니다.'],
  in_progress: ['이 사이트는 현재 진단이 진행 중입니다', `먼저 신청하신 분께 보고서를 보내 드립니다. 따로 받으시려면 ${CONTACT} 으로 알려 주세요.`],
};

function AuditForm() {
  const opened = useRef(Date.now());
  const consentRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [result, setResult] = useState('received');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  if (state === 'done') {
    const [title, body] = AUDIT_RESULT[result] ?? AUDIT_RESULT.received;
    return (
      <div className="bs-audit" id="audit" role="status">
        <span className="bs-free">무료</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    );
  }
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consent) {   // 버튼은 늘 진하게 두고, 동의 전에 누르면 동의 칸을 가리킨다
      setNudge(true);
      setError('개인정보 수집 · 이용 동의에 체크해 주세요.');
      consentRef.current?.focus();
      return;
    }
    const f = new FormData(e.currentTarget);
    setError('');
    setState('sending');
    try {
      const r = await fetch(`${API_BASE}/audit-requests`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ site_url: f.get('site_url'), email: f.get('email'), company: f.get('company'), website2: f.get('website2'), consent, consent_ver: CONSENT_VER, fill_ms: Date.now() - opened.current }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { setResult(d?.state || 'received'); setState('done'); return; }
      setError(d?.message || '신청을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } catch {
      setError('신청을 보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    }
    setState('idle');
  };
  return (
    <form className="bs-audit" id="audit" onSubmit={submit}>
      <span className="bs-free">무료</span>
      <h2>우리 사이트 이미지, 검색에서 얼마나 놓치고 있을까?</h2>
      <p className="bs-muted">웹사이트 주소만 알려 주시면 무료로 진단해 보고서를 보내 드립니다.</p>
      <ul className="bs-gains">{AUDIT_GAINS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ul>
      {REPORT_SAMPLE && <a className="bs-link" href={REPORT_SAMPLE} target="_blank" rel="noreferrer">보고서 예시 보기 →</a>}
      <label>웹사이트 주소<input name="site_url" type="text" inputMode="url" required maxLength={500} placeholder="www.example.co.kr" autoComplete="url" /></label>
      <label>회사 이메일<input name="email" type="email" required maxLength={254} placeholder="보고서를 받을 주소" autoComplete="email" /></label>
      <label><span>회사명 <small className="bs-muted">(선택)</small></span><input name="company" type="text" maxLength={100} autoComplete="organization" /></label>
      <div className="bs-hp" aria-hidden="true"><label>홈페이지<input name="website2" type="text" tabIndex={-1} autoComplete="off" /></label></div>
      <label className={`bs-consent${nudge && !consent ? ' nudge' : ''}`}>
        <input ref={consentRef} type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (e.target.checked) { setNudge(false); setError(''); } }} aria-required="true" />
        <span>[필수] 개인정보 수집 · 이용에 동의합니다 <button type="button" className="bs-link" onClick={() => setShowTerms(!showTerms)} aria-expanded={showTerms}>{showTerms ? '접기' : '내용 보기'}</button></span>
      </label>
      {showTerms && (
        <ul className="bs-terms">
          <li>수집 항목: 웹사이트 주소, 회사 이메일, 회사명(선택)</li>
          <li>이용 목적: 무료 이미지 진단 보고서 작성 · 발송, 도입 상담 안내</li>
          <li>보유 기간: 신청일로부터 1년. 삭제를 원하시면 <a href={`mailto:${CONTACT}`}>{CONTACT}</a> 로 알려 주세요. 바로 삭제합니다.</li>
          <li>동의하지 않으실 수 있으나, 동의하지 않으면 진단을 신청할 수 없습니다.</li>
          <li>진단을 위해 입력하신 웹사이트의 공개 페이지를 robots.txt 를 지키며 읽습니다.</li>
        </ul>
      )}
      {error && <p className="bs-error" role="alert">{error}</p>}
      {/* 툴팁은 감싼 칸에 — 버튼에 title 을 달면 화면 낭독기가 버튼 이름을 툴팁 문구로 읽는 경우가 있어서 */}
      <div className="bs-submit" title={consent ? undefined : '개인정보 수집 · 이용 동의에 먼저 체크해 주세요'}>
        <button className={`bs-btn primary${consent ? '' : ' wait'}`} type="submit" disabled={state === 'sending'}>{state === 'sending' ? '보내는 중…' : '무료 진단 받기'}</button>
      </div>
      <p className="bs-safe">가입 필요 없음 · 공개 페이지만 읽습니다 · 보고서는 검토 뒤 이메일로 보내 드립니다</p>
    </form>
  );
}

/* ───────────────────────── 소개 ───────────────────────── */
const WHY: [string, string][] = [
  ['검색 유입 손실', '설명이 없는 이미지는 이미지 검색과 AI 검색 답변에 나타나기 어렵습니다.'],
  ['해외 고객 손실', '설명이 한국어뿐이거나 없으면 해외 방문자와 해외 검색에서 이미지가 의미를 갖지 못합니다.'],
  ['웹 접근성 미충족', "'이미지 대체 텍스트'는 웹 접근성 점검의 기본 항목입니다. 누락은 점검 때마다 지적됩니다."],
];
const MORE: [string, string][] = [
  ['해외 방문자 대응', '설명이 한국어 · 영어 · 일본어 · 중국어로 함께 작성됩니다. 따로 번역하지 않아도 됩니다.'],
  ['운영 인력 · 비용 절감', '1장에 설명 작성 · 번역이 3분이면 1만 장은 약 500시간. 이 작업이 사라지고, 담당자는 필요할 때만 검토합니다.'],
  ['페이지가 빨리 열립니다', '화면 크기와 가벼운 형식으로 자동 변환해 보냅니다. 방문자 이탈이 줄어듭니다.'],
];
const STEPS: [string, string][] = [
  ['진단 신청', '웹사이트 주소와 회사 이메일을 남겨 주십시오.'],
  ['보고서 수령', '보통 2영업일 안에 보고서 링크를 이메일로 보내 드립니다.'],
  ['도입 결정', '보고서를 보신 뒤 결정하시면 됩니다. 적용은 개발 담당자가 AI 개발 도구로 간편하게 진행합니다.'],
];
const PLANS: { name: string; price: ReactNode; lines: string[]; pick?: boolean }[] = [
  { name: '체험', price: '무료', lines: ['이미지 300장', '전체 기능', '한도를 넘으면 자동 중지'] },
  { name: '스타터', price: <>99,000원<small>/월</small></>, lines: ['이미지 1만 장', '월 신규 1,000장', '중소 규모 웹사이트'] },
  { name: '그로스', price: <>590,000원<small>/월</small></>, lines: ['이미지 10만 장', '월 신규 8,000장', '쇼핑몰 · 다국어 사이트', '적용 지원 포함'], pick: true },
  { name: '엔터프라이즈', price: '별도 협의', lines: ['이미지 100만 장 이상', '기존 이미지 이관 지원'] },
];

export function LandingPage() {
  useEffect(() => {
    document.title = `${SITE_BRAND} — 기업 웹사이트 이미지 서비스`;
    if (location.hash === '#audit') setTimeout(() => goAudit(), 50);   // 수집기 안내의 "무료 진단 신청" → /#audit
  }, []);
  return (
    <div className="bs">
      <SiteTop home />
      <main className="bs-wrap">
        <section className="bs-hero">
          <div>
            <span className="bs-lbl">AI 검색 시대의 이미지 노출</span>
            <h1>귀사 웹사이트의 이미지,<br />검색에서 보이고 있습니까?</h1>
            <p>검색엔진과 AI 검색은 이미지에 붙은 설명을 읽고 이미지를 이해합니다. {SITE_BRAND} 는 웹사이트의 모든 이미지에 AI 가 쓴 4개 언어 설명을 붙여, 이미지가 검색에 노출되게 합니다. 담당자의 추가 작업은 필요하지 않습니다.</p>
            <div className="bs-kpi">
              <div><b>53.1%</b><span>상위 100만 개 웹사이트 홈페이지 중 이미지 설명이 빠진 비율 (WebAIM, 2026)</span></div>
              <div><b>0시간</b><span>이미지 설명 작성 · 번역에 드는 담당자 시간</span></div>
              <div><b>1/3</b><span>이미지 전송 · 설명 도구를 따로 들이는 것 대비 비용</span></div>
            </div>
          </div>
          <AuditForm />
        </section>

        <section className="bs-sec">
          <h2>설명이 없는 이미지는 검색에서 보이지 않습니다</h2>
          <p className="bs-lead">검색엔진은 이미지를 볼 수 없습니다. 이미지에 붙은 설명(대체 텍스트)을 읽고 내용을 판단합니다. 그러나 대부분의 웹사이트는 이 설명이 비어 있습니다.</p>
          <div className="bs-cards three">{WHY.map(([t, d]) => <div key={t} className="bs-card"><h3>{t}</h3><p>{d}</p></div>)}</div>
        </section>

        <section className="bs-sec">
          <h2>도입하면 기대할 수 있는 효과</h2>
          <div className="bs-core">
            <span className="bs-lbl">가장 큰 효과</span>
            <h3>검색 노출 확대 — 광고비 없는 신규 유입</h3>
            <p>모든 이미지에 내용을 설명하는 문장과 키워드가 자동으로 붙습니다. 검색엔진이 읽을 수 있게 페이지 HTML 에 함께 들어가고, 새로 올리는 이미지도 같은 방식으로 처리됩니다.</p>
          </div>
          <div className="bs-cards three">{MORE.map(([t, d]) => <div key={t} className="bs-card"><h3>{t}</h3><p>{d}</p></div>)}</div>
        </section>

        <section className="bs-sec">
          <h2>운영 중인 서비스에서 확인한 결과</h2>
          <div className="bs-proof">
            <div className="bs-card">
              <span className="bs-lbl">이미지 설명</span>
              <h3>6장 중 6장 자동 적용</h3>
              <p>HTML 에는 이미지 주소만 넣었습니다. 이미지 아래 문장은 AI 가 작성해 자동으로 붙인 설명이며, 사람이 쓴 문장은 없습니다. 1장마다 4개 언어 · 키워드 23개.</p>
            </div>
            <div className="bs-card">
              <span className="bs-lbl">파일 용량</span>
              <h3>2,206KB → 72KB</h3>
              <div className="bs-bars">
                <div><span>원본 PNG</span><i style={{ width: '100%' }} /><b>2,206 KB</b></div>
                <div><span>폭 800 · WebP</span><i style={{ width: '3.3%' }} /><b>72 KB</b></div>
                <div><span>폭 400 · WebP</span><i style={{ width: '1.3%' }} /><b>29 KB</b></div>
              </div>
              <p className="bs-small">2026년 11월 20일, 1448×1086 PNG 1장 기준. 원본이 JPEG 이면 줄어드는 폭은 더 작습니다.</p>
            </div>
          </div>
        </section>

        <section className="bs-sec">
          <h2>진단부터 도입까지</h2>
          <ol className="bs-steps">{STEPS.map(([t, d], i) => <li key={t}><b><i>{i + 1}</i>{t}</b><span>{d}</span></li>)}</ol>
          <p className="bs-small">공개 페이지만 읽고 robots.txt 를 지킵니다 · 1초에 1회 이하로 천천히 읽습니다 · 보고서 링크는 90일 뒤 자동으로 닫힙니다. <Link to="/audit">수집기 안내</Link></p>
        </section>

        <section className="bs-sec">
          <h2>따로 들이는 것보다 1/3 수준의 비용</h2>
          <p className="bs-lead">이미지 전송 · 변환, 설명 생성, 4개 언어 번역, 웹사이트 적용까지 한 요금에. 같은 일을 따로 들이면 이미지 1만 장 기준 월 22~31만 원에 번역 · 개발 인건비가 더 듭니다.</p>
          <div className="bs-plans">{PLANS.map((p) => (
            <div key={p.name} className={`bs-plan${p.pick ? ' pick' : ''}`}>
              {p.pick && <span className="bs-pick">추천</span>}
              <h3>{p.name}</h3>
              <div className="bs-price">{p.price}</div>
              <ul>{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          ))}</div>
          <p className="bs-small">부가세 별도. 요금은 정식 출시 전 바뀔 수 있습니다. 초과 사용 · 언어 추가 요금은 따로 안내해 드립니다. 비교 비용은 해외 이미지 전송 서비스와 이미지 설명 생성 서비스의 2026년 11월 공개 요금 기준(1달러 1,400원).</p>
          <div className="bs-trust">
            <div><b>공개 범위 설정</b>등록한 웹사이트 전용 · 전체 공개 · 비공개</div>
            <div><b>위치 정보 자동 제거</b>밖으로 보내는 이미지에서 촬영 위치(GPS)를 지웁니다</div>
            <div><b>AI 학습에 쓰지 않음</b>고객사 이미지는 AI 학습에 쓰이지 않습니다</div>
          </div>
        </section>

        <section className="bs-cta">
          <div><h2>먼저 진단으로 확인해 보십시오</h2><p>귀사 이미지가 검색에서 얼마나 보이는지, 주소 하나로 확인할 수 있습니다. 초기 도입 고객사에는 6개월간 50% 할인을 드립니다.</p></div>
          <a className="bs-btn primary" href="#audit" onClick={goAudit}>무료 진단 신청</a>
        </section>
        <SiteFoot />
      </main>
    </div>
  );
}
