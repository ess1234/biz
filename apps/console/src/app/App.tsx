/// 콘솔 라우트 (biz-dev-08 3절): 로그인 · 첫 로그인 · 셸 안의 화면들 · 옛 주소 넘기기.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AdminAccountPage, AdminPage } from '../features/admin/Admin';
import { AuthCallbackPage, LoginPage } from '../features/auth/Login';
import { RequireAuth } from '../features/auth/RequireAuth';
import { BillingPage } from '../features/billing/Billing';
import { HomePage } from '../features/home/Home';
import { WelcomePage } from '../features/home/Welcome';
import { ImageDetailPage } from '../features/images/ImageDetail';
import { ImagesPage } from '../features/images/Images';
import { IntegrationsPage } from '../features/integrations/Integrations';
import { SettingsPage } from '../features/settings/Settings';
import { SessionProvider } from '../lib/session';
import { Shell } from './Shell';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

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
