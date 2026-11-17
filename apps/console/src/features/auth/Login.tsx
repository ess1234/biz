/// 로그인 · 가입 (메일 링크 또는 비밀번호) · 메일 링크 돌아오는 곳(/auth/callback)
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { BRAND, configured } from '../../lib/env';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Notice } from './RequireAuth';

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
