/// 확인 창 — window.confirm 대신. 앱 내장 브라우저는 confirm · alert · prompt 를 막아 버튼이 아무 일도 안 했다.
/// const ok = await askConfirm('이 키를 폐기할까요?', { ok: '폐기', danger: true }) — 확인이면 true, 취소 · Esc · 바깥 누르기면 false.
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type Opts = { ok?: string; danger?: boolean };

function ConfirmDialog({ message, ok = '확인', danger, done }: { message: string; done: (v: boolean) => void } & Opts) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [done]);
  return (
    <div className="bc-sheet-backdrop" onClick={() => done(false)}>
      <div className="bc-sheet narrow" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-describedby="bc-confirm-msg">
        <p id="bc-confirm-msg" className="mt-0">{message}</p>
        <div className="bc-row">
          <button ref={okRef} className={`bc-btn ${danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{ok}</button>
          <button className="bc-btn" onClick={() => done(false)}>취소</button>
        </div>
      </div>
    </div>
  );
}

export function askConfirm(message: string, opts: Opts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean) => { root.unmount(); host.remove(); resolve(v); };
    root.render(<ConfirmDialog message={message} done={done} {...opts} />);
  });
}
