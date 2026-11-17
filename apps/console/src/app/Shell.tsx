/// 콘솔 셸 (biz-dev-08 3절·4절): 상단 바(로고 자리표시자 · 워크스페이스 · 한도 알림 · 사람 메뉴) + 메뉴 다섯 개, 운영자면 맨 아래 운영.
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useUsage } from '../data/hooks';
import { METRIC_LABEL } from '../data/usage';
import { BRAND } from '../lib/env';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { BarChart3, ChevronDown, ImageIcon, KeyRound, LayoutGrid, Loading, LogOut, Plug, Settings, Shield } from '../ui/common';

const MENU: [string, string, React.ComponentType<{ className?: string }>, boolean?][] = [
  ['/', '홈', LayoutGrid, true], ['/images', '이미지', ImageIcon], ['/integrations', '사이트 연동', Plug], ['/billing', '사용량 · 청구', BarChart3], ['/settings', '설정', Settings],
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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="bc-avatar" aria-hidden="true">{(session?.user.email ?? '나').slice(0, 1).toUpperCase()}</span>
        <span className="name">{session?.user.email?.split('@')[0] ?? '나'}</span>
        <ChevronDown className="bc-ico" />
      </button>
      {open && (
        <div className="bc-menu" role="menu">
          <div className="who">{session?.user.email}</div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); changePassword(); }}><KeyRound className="bc-ico" />비밀번호 바꾸기</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); signOut(); }}><LogOut className="bc-ico" />로그아웃</button>
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

export function Shell() {
  const { me } = useSession();
  return (
    <div className="bc">
      <header className="bc-top">
        <NavLink to="/" className="bc-logo"><span className="mark" aria-hidden="true"><ImageIcon className="bc-ico" /></span>{BRAND}</NavLink>
        <span className="bc-ws">{me?.account.name}</span>
        <span className="bc-spacer" />
        <UsageAlert />
        <PersonMenu />
      </header>
      <div className="bc-body">
        <nav className="bc-nav" aria-label="메뉴">
          {MENU.map(([to, label, Icon, end]) => <NavLink key={to} to={to} end={end}><Icon className="bc-ico" />{label}</NavLink>)}
          {me?.admin && <><span className="bc-spacer" /><NavLink to="/admin" className="bc-admin"><Shield className="bc-ico" />운영</NavLink></>}
        </nav>
        <main className="bc-main"><Suspense fallback={<Loading />}><Outlet /></Suspense></main>
      </div>
    </div>
  );
}
