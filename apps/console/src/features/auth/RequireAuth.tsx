/// 로그인이 필요한 화면의 문: 세션 · 워크스페이스(GET /me)를 기다리고, 삭제 요청된 워크스페이스는 취소 화면으로.
import { type ReactNode, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { api } from '../../lib/api';
import { configured } from '../../lib/env';
import { useSession } from '../../lib/session';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session, me, errorCode, error } = useSession();
  const loc = useLocation();
  if (!configured) return <Notice title="설정이 없는 빌드" body="VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 넣어 다시 빌드하세요." />;
  if (loading) return <div className="bc-center"><div className="bc-spinner" /></div>;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (errorCode === 'ACCOUNT_DELETING') return <DeletingNotice />;
  if (!me && errorCode) return <Notice title="워크스페이스를 불러오지 못했어요" body={`${error ?? errorCode} — 잠시 뒤 새로고침해 주세요.`} />;
  if (!me) return <div className="bc-center"><div className="bc-spinner" /></div>;
  return <>{children}</>;
}

export function Notice({ title, body }: { title: string; body: string }) {
  return <div className="bc-center"><div className="bc-card"><h2>{title}</h2><p>{body}</p></div></div>;
}

function DeletingNotice() {
  const { refresh, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <div className="bc-center">
      <div className="bc-card">
        <h2>삭제가 요청된 워크스페이스예요</h2>
        <p>유예 기간(60일)이 지나고 운영자가 승인하면 이미지 · 설명 · 키가 영구 삭제돼요. 그 전까지 취소할 수 있어요.</p>
        <div className="bc-row">
          <button className="bc-btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await api.post('/account:cancel-delete'); await refresh(); } finally { setBusy(false); } }}>삭제 취소</button>
          <button className="bc-btn" onClick={signOut}>로그아웃</button>
        </div>
      </div>
    </div>
  );
}
