/// 세션 (sai 콘솔 auth.tsx 에서 복사해 B2B 문구로, DA-2): Supabase 세션 → <RequireAuth> → 첫 로그인 때 PUT /devices (platform=web) + GET /me.
/// B2B 가입은 dossaiBiz 의 가입 트리거가 회사 워크스페이스를 만든다(biz_0001) — 개인 계정 개념은 화면에 없다.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { ApiError, api, currentAccountId, rotateWebDeviceId, setCurrentAccountId, setCurrentUserId, webDeviceId, type Me } from './api';
import { BRAND, configured } from './env';
import { supabase } from './supabase';

type SessionState = {
  loading: boolean;
  session: Session | null;
  me: Me | null;
  errorCode: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inflight = React.useRef<string | null>(null);
  const bootstrap = useCallback(async (s: Session | null) => {
    if (!s) { setCurrentUserId(null); setMe(null); setErrorCode(null); setError(null); return; }
    if (inflight.current === s.user.id) return;
    inflight.current = s.user.id;
    setCurrentUserId(s.user.id);
    try {
      const device = { platform: 'web', name: '웹 콘솔' };
      try {
        await api.put(`/devices/${webDeviceId()}`, device);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) { try { await api.put(`/devices/${rotateWebDeviceId()}`, device); } catch { /* /me 로 진행 */ } }
      }
      let m = await api.get<Me>('/me');
      // B2B 콘솔은 회사 워크스페이스만 다룬다 — 현재 계정이 개인이면 첫 회사 워크스페이스로 바꿔 다시
      if (m.account.kind !== 'business') {
        const biz = m.accounts.find((a) => a.kind === 'business');
        if (biz) { setCurrentAccountId(biz.id); m = await api.get<Me>('/me'); }
      }
      setMe(m);
      setErrorCode(null); setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.code === 'FORBIDDEN' && currentAccountId()) {
        setCurrentAccountId(null); inflight.current = null; location.reload(); return;
      }
      setMe(null);
      if (e instanceof ApiError) { setErrorCode(e.code); setError(e.message); } else { setErrorCode('NETWORK'); setError(String(e)); }
    } finally {
      inflight.current = null;
    }
  }, []);

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let alive = true;
    supabase().auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await bootstrap(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase().auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') bootstrap(s);
      if (event === 'SIGNED_OUT') { setMe(null); setErrorCode(null); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [bootstrap]);

  const value = useMemo<SessionState>(() => ({
    loading, session, me, errorCode, error,
    refresh: async () => { inflight.current = null; await bootstrap(session); },
    signOut: async () => { await supabase().auth.signOut(); setCurrentAccountId(null); setMe(null); },
  }), [loading, session, me, errorCode, error, bootstrap]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider 밖');
  return v;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
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

function Notice({ title, body }: { title: string; body: string }) {
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

export function LoginPage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('magic');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (!loading && session) nav(next, { replace: true }); }, [loading, session, nav, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'password') {
        const { error } = await supabase().auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
        if (error) throw error;
        setMsg('로그인 링크를 메일로 보냈어요. 메일의 링크를 누르면 여기로 돌아와요. 처음이면 이 링크로 가입까지 끝나요.');
      }
    } catch (err: any) {
      const m = String(err?.message || err);
      setMsg(m.includes('Invalid login credentials') ? '이메일 또는 비밀번호가 맞지 않아요' : m);
    } finally { setBusy(false); }
  }

  if (!configured) return <Notice title="설정이 없는 빌드" body="VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 넣어 다시 빌드하세요." />;
  return (
    <div className="bc-center">
      <form className="bc-card" onSubmit={submit}>
        <div className="bc-logo">{BRAND}</div>
        <h2>콘솔 로그인 · 가입</h2>
        <p className="bc-muted">이미지를 올리면 4개 언어 설명이 붙고, 사이트 키 하나로 고객 페이지의 alt 가 채워져요.</p>
        <label className="bc-field">회사 이메일<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        {mode === 'password' && <label className="bc-field">비밀번호<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>}
        {msg && <p className="bc-msg">{msg}</p>}
        <div className="bc-row">
          <button className="bc-btn primary" type="submit" disabled={busy}>{mode === 'password' ? '로그인' : '로그인 링크 받기'}</button>
          <button className="bc-btn" type="button" onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}>{mode === 'password' ? '메일 링크로' : '비밀번호로'}</button>
        </div>
      </form>
    </div>
  );
}

export function AuthCallbackPage() {
  const { session, loading } = useSession();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get('next') || '/';
  if (!loading && session) return <Navigate to={next} replace />;
  if (!loading && !session) return <Navigate to="/login" replace />;
  return <div className="bc-center"><div className="bc-spinner" /></div>;
}
