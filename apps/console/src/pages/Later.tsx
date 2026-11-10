/// 아직 만들지 않은 메뉴의 자리 (biz-dev-08 8절: 2차 이미지 · 3차 연동 · 사용량·청구). 그동안은 지금 콘솔(sai 의 B2B 빌드)에서 한다.
export function LaterPage({ title, round, body }: { title: string; round: number; body: string }) {
  return (
    <>
      <h2 className="bc-h">{title}</h2>
      <div className="bc-box bc-sec">
        <p className="bc-muted" style={{ margin: 0 }}>{body}</p>
        <p className="bc-muted">이 화면은 {round}차 배포에서 들어와요.</p>
      </div>
    </>
  );
}
