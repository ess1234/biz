/// biz.dossai.app/audit — 이미지 진단 수집기 안내(biz-dev-11 DG-6, 2026-11-25 dossai.app/audit 에서 옮김). 수집기 User-Agent 에 이 주소를 적어 두므로,
/// 접속 기록에서 이름을 본 사이트 운영자가 무엇인지 · 어떻게 막는지 알 수 있게 한다. 숫자는 dos 의 audit/crawl.py 기본값과 같다.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { CONTACT, SITE_BRAND, SiteFoot, SiteTop } from './Landing';
import './site.css';

export function AuditInfoPage() {
  useEffect(() => { document.title = `${SITE_BRAND}-ImageAudit — 이미지 진단 수집기 안내`; }, []);
  return (
    <div className="bs">
      <SiteTop />
      <main className="bs-wrap bs-doc">
        <span className="bs-lbl">DOSSAI-ImageAudit</span>
        <h1>이미지 진단 수집기 안내</h1>
        <p className="bs-lead">접속 기록에서 <code>DOSSAI-ImageAudit/1.0 (+https://biz.dossai.app/audit)</code> 을 보셨다면, {SITE_BRAND} 의 무료 이미지 진단이 귀사 사이트의 공개 페이지를 읽은 것입니다.</p>

        <section className="bs-sec">
          <h2>무엇을 하나요</h2>
          <p className="bs-lead">공개된 페이지를 사람이 보듯 읽고, 이미지마다 설명(alt)이 있는지와 이미지 용량을 셉니다. 결과는 진단을 신청한 분께 보내는 보고서 한 장이 됩니다.</p>
          <div className="bs-cards two">
            <div className="bs-card"><h3>읽는 것</h3><p>공개 페이지의 HTML 과 그 페이지의 이미지</p></div>
            <div className="bs-card"><h3>읽지 않는 것</h3><p>로그인 · 회원 · 장바구니 · 주문 · 검색 결과 페이지, 양식 제출</p></div>
            <div className="bs-card"><h3>받은 이미지</h3><p>크기를 잰 뒤 지웁니다. 보관하지 않습니다</p></div>
            <div className="bs-card"><h3>AI 분석</h3><p>사이트 주인이 진단을 요청한 경우에만, 대표 이미지 3장</p></div>
          </div>
        </section>

        <section className="bs-sec">
          <h2>얼마나 자주, 얼마나 많이</h2>
          <p className="bs-lead">귀사 서버에 부담이 되지 않게 천천히 읽습니다.</p>
          <div className="bs-cards two">
            <div className="bs-card"><h3>1초에 1번</h3><p>같은 호스트에 한 번에 요청 하나. robots.txt 의 Crawl-delay 가 더 길면 그 값을 따릅니다</p></div>
            <div className="bs-card"><h3>최대 100쪽</h3><p>보통 30쪽. 같은 사이트 안에서만, 다른 도메인으로 넘어가지 않습니다</p></div>
            <div className="bs-card"><h3>이미지 300장</h3><p>용량을 재려고 받는 이미지의 상한</p></div>
            <div className="bs-card"><h3>한 번만</h3><p>페이지 읽기는 10분이면 멈추고, 이미지도 같은 간격으로 받습니다. 자동으로 반복하지 않습니다</p></div>
          </div>
        </section>

        <section className="bs-sec">
          <h2>막고 싶으시면</h2>
          <p className="bs-lead">robots.txt 를 지킵니다. 아래 두 줄을 넣으시면 다음 진단부터 귀사 사이트를 읽지 않습니다. 일부 경로만 막을 수도 있습니다.</p>
          <pre className="bs-code">{`User-agent: DOSSAI-ImageAudit
Disallow: /`}</pre>
          <p className="bs-small">robots.txt 가 접근 금지(401 · 403)로 답해도 전체를 읽지 않습니다. 모든 수집기를 막는 <code>User-agent: *</code> 규칙도 따릅니다.</p>
        </section>

        <section className="bs-sec">
          <h2>왜 우리 사이트에 왔나요</h2>
          <p className="bs-lead">누군가 biz.dossai.app 에서 귀사 사이트 주소로 무료 진단을 신청했거나, {SITE_BRAND} 운영자가 진단을 실행했기 때문입니다. 신청이 들어와도 자동으로 읽지 않고, 운영자가 확인한 뒤에만 실행합니다.</p>
          <p className="bs-lead">진단 보고서 · 신청 기록의 삭제나 그 밖의 문의는 <a href={`mailto:${CONTACT}`}>{CONTACT}</a> 로 보내 주세요.</p>
        </section>

        <section className="bs-cta">
          <div><h2>귀사 이미지도 진단해 보시겠어요?</h2><p>웹사이트 주소만 알려 주시면 보고서를 보내 드립니다.</p></div>
          <Link className="bs-btn primary" to="/#audit">무료 진단 신청</Link>
        </section>
        <SiteFoot />
      </main>
    </div>
  );
}
