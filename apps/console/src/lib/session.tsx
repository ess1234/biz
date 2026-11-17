/// 세션: Supabase 세션 → 첫 로그인 때 PUT /devices (platform=web) + GET /me. 화면은 useSession 으로 읽는다.
/// B2B 가입은 dossaiBiz 의 가입 트리거가 회사 워크스페이스를 만든다(biz_0001) — 개인 계정 개념은 화면에 없다.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { type Me } from '../data/types';
import { ApiError, api, currentAccountId, rotateWebDeviceId, setCurrentAccountId, setCurrentUserId, webDeviceId } from './api';
import { configured } from './env';
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

  const qc = useQueryClient();
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
      // 로그아웃하면 조회 캐시를 비운다 — 같은 브라우저에서 다른 계정으로 들어왔을 때 이전 워크스페이스의 사용량 · 설정이 보이지 않게
      if (event === 'SIGNED_OUT') { setMe(null); setErrorCode(null); qc.clear(); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [bootstrap, qc]);

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

/// 키 · 이름 · AI 분석 같은 워크스페이스 관리는 소유자 · 관리자만
export const canManage = (me: Me | null | undefined) => me?.account.role === 'owner' || me?.account.role === 'admin';
