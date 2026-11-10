/// 4-1 첫 로그인 (biz-dev-08, DC-8): 가입 트리거가 만든 워크스페이스의 이름을 확인 · 고치고, AI 분석 동의를 받는다. 개인 계정은 어디에도 보이지 않는다.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/auth';
import { BRAND } from '../lib/env';
import { markWelcomed, useSettings } from '../lib/queries';
import { toast } from '../lib/toast';

export function WelcomePage() {
  const { me, refresh } = useSession();
  const settings = useSettings();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState(me?.account.name ?? '');
  const [ai, setAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!me) return null;
  const acc = me.account;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== acc.name) {
        try { await api.patch(`/accounts/${acc.id}`, { name: trimmed }); }
        catch (err) {
          // 서버에 이름 바꾸기가 아직 배포되지 않았으면(404/405) 이름은 그대로 두고 진행
          if (err instanceof ApiError && (err.status === 404 || err.status === 405)) toast('이름 바꾸기는 아직 서버에 없어요 — 설정에서 나중에 바꿀 수 있어요');
          else throw err;
        }
      }
      if (ai && !settings.data?.ai_consent_at) await api.patch('/settings', { ai_consent: true });
      markWelcomed(acc.id);
      await qc.invalidateQueries();
      await refresh();
      nav('/', { replace: true });
    } catch (err: any) {
      setMsg(err?.message ?? String(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="bc-center">
      <form className="bc-card" onSubmit={submit}>
        <div className="bc-logo">{BRAND}</div>
        <h2>워크스페이스를 확인해 주세요</h2>
        <p className="bc-muted">회사 단위로 이미지 · 키 · 청구가 묶여요. 이름은 청구서와 화면에 보여요.</p>
        <label className="bc-field">워크스페이스 이름
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="회사 이름" />
        </label>
        <label className="bc-check">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} disabled={Boolean(settings.data?.ai_consent_at)} />
          <span><b>AI 분석 켜기</b> — 올린 이미지를 외부 AI 로 보내 4개 언어 설명 · 키워드를 만들어요. 켜기 전에는 어떤 이미지도 보내지 않아요. 설정에서 언제든 끌 수 있어요.{settings.data?.ai_consent_at && ' (이미 켜져 있어요)'}</span>
        </label>
        {msg && <p className="bc-msg">{msg}</p>}
        <div className="bc-row">
          <button className="bc-btn primary" type="submit" disabled={busy || settings.isLoading}>시작하기</button>
        </div>
      </form>
    </div>
  );
}
