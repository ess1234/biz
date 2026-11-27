/// 콘솔 라우트 (biz-dev-08 3절): 로그인 · 첫 로그인 · 셸 안의 화면들 · 옛 주소 넘기기.
/// biz.dossai.app 의 로그인 전 화면(2026-11-25): / 는 로그인하지 않았으면 서비스 소개 + 진단 신청, 로그인했으면 콘솔 홈. /audit 는 수집기 안내(누구나).
/// 화면은 경로별로 따로 받는다(lazy) — 로그인 · 셸만 첫 번들에. 받는 동안 셸은 그대로, 본문만 Loading.
import { type ReactNode, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AuthCallbackPage, LoginPage } from '../features/auth/Login';
import { RequireAuth } from '../features/auth/RequireAuth';
import { SessionProvider, useSession } from '../lib/session';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Loading } from '../ui/common';
import { Shell } from './Shell';
import { page } from './lazyPage';

const HomePage = page(() => import('../features/home/Home'), 'HomePage');
const WelcomePage = page(() => import('../features/home/Welcome'), 'WelcomePage');
const ImagesPage = page(() => import('../features/images/Images'), 'ImagesPage');
const ImageDetailPage = page(() => import('../features/images/ImageDetail'), 'ImageDetailPage');
const IntegrationsPage = page(() => import('../features/integrations/Integrations'), 'IntegrationsPage');
const BillingPage = page(() => import('../features/billing/Billing'), 'BillingPage');
const SettingsPage = page(() => import('../features/settings/Settings'), 'SettingsPage');
const AdminPage = page(() => import('../features/admin/Admin'), 'AdminPage');
const AdminAccountPage = page(() => import('../features/admin/Admin'), 'AdminAccountPage');
const LandingPage = page(() => import('../features/site/Landing'), 'LandingPage');
const AuditInfoPage = page(() => import('../features/site/AuditInfo'), 'AuditInfoPage');
const CliGuidePage = page(() => import('../features/site/CliGuide'), 'CliGuidePage');

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

/// 옛 주소(/me, /me/login?next=/me/start … — 예전 B2B 콘솔이 쓰던 주소) → 새 주소.
function LegacyRedirect() {
  const loc = useLocation();
  const map = (p: string) => {
    const rest = p.replace(/^\/me/, '') || '/';
    if (rest === '/start' || rest === '/') return '/';
    if (rest.startsWith('/a/')) return `/images/${rest.slice(3)}`;
    if (rest.startsWith('/upload') || rest.startsWith('/search') || rest.startsWith('/trash')) return '/images';
    if (rest.startsWith('/sites')) return '/integrations';
    if (rest.startsWith('/usage')) return '/billing';
    if (rest.startsWith('/billing')) return '/billing?tab=invoices';
    if (rest.startsWith('/workspace')) return '/integrations?tab=api';
    return rest;
  };
  const q = new URLSearchParams(loc.search);
  const next = q.get('next');
  if (next) q.set('next', map(next));
  const target = map(loc.pathname);
  // hash 유지 — 메일 링크 로그인 토큰이 #access_token 으로 온다 (옛 /me/auth/callback 이 Supabase 허용 목록에 있어도 끊기지 않게)
  return <Navigate to={`${target}${q.toString() ? `?${q}` : ''}${loc.hash}`} replace />;
}

/// 첫 페이지 문: 세션이 없으면(로그인 전) 소개, 있으면 콘솔. 하위 경로(/images …)는 RequireAuth 가 로그인으로 보낸다.
function Root() {
  const { loading, session } = useSession();
  const loc = useLocation();
  if (!loading && !session && loc.pathname === '/') return <Public><LandingPage /></Public>;
  return <RequireAuth><Shell /></RequireAuth>;
}

function Public({ children }: { children: ReactNode }) {
  return <ErrorBoundary><Suspense fallback={<div className="bc-center"><div className="bc-spinner" /></div>}>{children}</Suspense></ErrorBoundary>;
}

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/audit" element={<Public><AuditInfoPage /></Public>} />
            <Route path="/cli" element={<Public><CliGuidePage /></Public>} />
            <Route path="/me/*" element={<LegacyRedirect />} />
            <Route path="/me" element={<LegacyRedirect />} />
            <Route path="/welcome" element={<RequireAuth><ErrorBoundary><Suspense fallback={<Loading />}><WelcomePage /></Suspense></ErrorBoundary></RequireAuth>} />
            <Route path="/" element={<Root />}>
              <Route index element={<HomePage />} />
              <Route path="images" element={<ImagesPage />} />
              <Route path="images/:id" element={<ImageDetailPage />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="admin/acc/:id" element={<AdminAccountPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}
