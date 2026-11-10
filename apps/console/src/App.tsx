/// B2B 콘솔 셸 (biz-dev-08 3절·4절): 상단 바(로고 자리표시자 · 워크스페이스 · 한도 알림 · 사람 메뉴) + 메뉴 다섯 개.
/// 1차: 셸 · 첫 로그인 · 홈 · 설정. 2차: 이미지 목록 · 상세. 연동 · 사용량·청구는 3차 — 그 전엔 자리만 있다.
import React, { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { AuthCallbackPage, LoginPage, RequireAuth, SessionProvider, useSession } from './lib/auth';
import { BRAND } from './lib/env';
import { supabase } from './lib/supabase';
import { toast } from './lib/toast';
import { METRIC_LABEL, useUsage } from './lib/queries';
import { HomePage } from './pages/Home';
import { ImageDetailPage } from './pages/ImageDetail';
import { ImagesPage } from './pages/Images';
import { LaterPage } from './pages/Later';
import { SettingsPage } from './pages/Settings';
import { WelcomePage } from './pages/Welcome';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const MENU: [string, string, boolean?][] = [
  ['/', '홈', true], ['/images', '이미지'], ['/integrations', '연동'], ['/billing', '사용량 · 청구'], ['/settings', '설정'],
];

function PersonMenu() {
  const { session, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  async function changePassword() {
    const pw = window.prompt('새 비밀번호 (8자 이상)');
    if (!pw) return;
    if (pw.length < 8) { toast('8자 이상이어야 해요'); return; }
    const { error } = await supabase().auth.updateUser({ password: pw });
    toast(error ? `바꾸지 못했어요: ${error.message}` : '비밀번호를 바꿨어요');
  }
  return (
    <div className="bc-person" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>{session?.user.email?.split('@')[0] ?? '나'} ▾</button>
      {open && (
        <div className="bc-menu" role="menu">
          <div className="who">{session?.user.email}</div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); changePassword(); }}>비밀번호 바꾸기</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); signOut(); }}>로그아웃</button>
        </div>
      )}
    </div>
  );
}

function UsageAlert() {
  const usage = useUsage();
  const warn = usage.data?.warnings ?? [];
  if (!warn.length) return null;
  return <NavLink to="/billing" className="bc-alert" title="이번 달 한도의 80% 를 넘었어요">한도 80% · {warn.map((m) => METRIC_LABEL[m] ?? m).join(', ')}</NavLink>;
}

function Shell() {
  const { me } = useSession();
  return (
    <div className="bc">
      <header className="bc-top">
        <NavLink to="/" className="bc-logo">{BRAND}</NavLink>
        <span className="bc-ws">{me?.account.name}</span>
        <span className="bc-spacer" />
        <UsageAlert />
        <PersonMenu />
      </header>
      <div className="bc-body">
        <nav className="bc-nav" aria-label="메뉴">
          {MENU.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
        <main className="bc-main"><Outlet /></main>
      </div>
    </div>
  );
}

/// 옛 주소(/me, /me/login?next=/me/start …, sai 의 B2B 빌드) → 새 주소. dossai.app /business 버튼도 이쪽으로 온다.
function LegacyRedirect() {
  const loc = useLocation();
  const map = (p: string) => {
    const rest = p.replace(/^\/me/, '') || '/';
    if (rest === '/start' || rest === '/') return '/';
    if (rest.startsWith('/a/')) return `/images/${rest.slice(3)}`;
    if (rest.startsWith('/upload') || rest.startsWith('/search') || rest.startsWith('/trash')) return '/images';
    if (rest.startsWith('/sites')) return '/integrations';
    if (rest.startsWith('/usage')) return '/billing';
    return rest;
  };
  const q = new URLSearchParams(loc.search);
  const next = q.get('next');
  if (next) q.set('next', map(next));
  const target = map(loc.pathname);
  return <Navigate to={`${target}${q.toString() ? `?${q}` : ''}`} replace />;
}

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/me/*" element={<LegacyRedirect />} />
            <Route path="/me" element={<LegacyRedirect />} />
            <Route path="/welcome" element={<RequireAuth><WelcomePage /></RequireAuth>} />
            <Route path="/" element={<RequireAuth><Shell /></RequireAuth>}>
              <Route index element={<HomePage />} />
              <Route path="images" element={<ImagesPage />} />
              <Route path="images/:id" element={<ImageDetailPage />} />
              <Route path="integrations" element={<LaterPage title="연동" round={3} body="사이트 키 · 빌드 연동 · API 키를 여기서 관리해요." />} />
              <Route path="billing" element={<LaterPage title="사용량 · 청구" round={3} body="이번 달 사용량 · 청구서 · 플랜이 탭으로 들어와요." />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}
