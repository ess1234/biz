/// 화면 하나가 그리다 실패해도 콘솔 전체가 하얗게 되지 않게 — 셸은 남기고 본문에만 안내와 새로 고침 버튼.
/// 경로별로 나눈 화면 조각을 못 받았을 때(배포 뒤 옛 파일이 없어짐)도 여기로 온다. resetKey(주소)가 바뀌면 다시 시도한다.
import { Component, type ReactNode } from 'react';

type Props = { resetKey?: string; children: ReactNode };

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="bc-center">
        <div className="bc-card">
          <h2>화면을 불러오지 못했어요</h2>
          <p className="bc-muted">새 버전이 올라왔거나 연결이 끊겼을 수 있어요. 새로 고치면 대부분 풀려요.</p>
          <div className="bc-row"><button className="bc-btn primary" onClick={() => location.reload()}>새로 고침</button></div>
        </div>
      </div>
    );
  }
}
