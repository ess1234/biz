/// 4-2 홈 (biz-dev-08): 시작하기 4단계(끝나면 한 줄로 접힘) + 이번 달 한도 + 최근 이미지. 연동 카드의 키별 요청 수는 2차(DC-6) — 1차는 키 목록만.
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, type AssetSummary } from '../lib/api';
import { useSession } from '../lib/auth';
import { METRIC_LABEL, fmtMetric, useRecent, useSettings, useSiteKeys, useUsage, welcomed } from '../lib/queries';
import { useFileUrl } from '../lib/thumbs';
import { toast } from '../lib/toast';

const SNIPPET_KEY = (id: string) => `biz:snippet-done:${id}`;
const VIS_LABEL: Record<string, string> = { site: '사이트', public: '공개', private: '비공개' };

function Thumb({ a }: { a: AssetSummary }) {
  const url = useFileUrl('thumb256', a.has_thumb ? a.id : null);
  return (
    <div className="cell" title={a.caption ?? a.file_name ?? ''}>
      {url && <img src={url} alt={a.caption ?? ''} loading="lazy" />}
      <span className={`vis ${a.visibility}`}>{VIS_LABEL[a.visibility] ?? a.visibility}</span>
    </div>
  );
}

export function HomePage() {
  const { me } = useSession();
  const settings = useSettings();
  const usage = useUsage();
  const keys = useSiteKeys();
  const recent = useRecent(12);
  const qc = useQueryClient();
  const accId = me!.account.id;
  const [snippetDone, setSnippetDone] = useState(() => { try { return localStorage.getItem(SNIPPET_KEY(accId)) === '1'; } catch { return false; } });
  const consent = useMutation({
    mutationFn: () => api.patch('/settings', { ai_consent: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast('AI 분석을 켰어요'); },
    onError: (e: any) => toast(e.message),
  });

  const activeKeys = (keys.data?.items ?? []).filter((k) => !k.revoked_at);
  const steps = useMemo(() => [
    { done: Boolean(settings.data?.ai_consent_at), title: 'AI 분석 켜기', body: '켜기 전에는 이미지를 올려도 설명이 생기지 않아요.', action: 'consent' as const },
    { done: Boolean(recent.data?.items.length), title: '이미지 올리기', body: '분석이 끝나면 4개 언어 설명이 붙고 영구 주소가 생겨요.', to: '/images' },
    { done: activeKeys.length > 0, title: '사이트 키 만들기', body: '설명을 받아 갈 사이트 주소(허용 출처)를 적어요.', to: '/integrations' },
    { done: snippetDone, title: '사이트에 한 줄 붙이기', body: '스크립트 한 줄 또는 빌드 연동. 붙였으면 표시해 두세요.', action: 'snippet' as const },
  ], [settings.data, recent.data, activeKeys.length, snippetDone]);
  const doneCount = steps.filter((s) => s.done).length;

  if (!welcomed(accId) && settings.data && !settings.data.ai_consent_at) return <Navigate to="/welcome" replace />;

  const limits = Object.entries(usage.data?.limits ?? {}).filter(([, v]) => v);
  return (
    <>
      <h2 className="bc-h">{me!.account.name}</h2>
      <p className="bc-muted">플랜 {usage.data?.plan ?? settings.data?.plan ?? '—'}</p>

      <section className="bc-sec">
        <h3>시작하기 <span className={`bc-badge${doneCount < 4 ? ' gray' : ''}`}>{doneCount}/4</span></h3>
        {doneCount === 4 ? (
          <div className="bc-steps-folded">✓ 시작하기 4단계를 모두 끝냈어요</div>
        ) : (
          <ol className="bc-steps">
            {steps.map((s, i) => (
              <li key={s.title} className={s.done ? 'done' : ''}>
                <span className="n">{s.done ? '✓' : i + 1}</span>
                <div className="t"><b>{s.title}</b><div className="bc-muted">{s.body}</div></div>
                {!s.done && s.action === 'consent' && <button className="bc-btn small primary" disabled={consent.isPending || settings.isLoading} onClick={() => consent.mutate()}>켜기</button>}
                {!s.done && s.action === 'snippet' && <button className="bc-btn small" onClick={() => { try { localStorage.setItem(SNIPPET_KEY(accId), '1'); } catch { /* 무시 */ } setSnippetDone(true); }}>붙였어요</button>}
                {!s.done && 'to' in s && s.to && <Link className="bc-btn small" to={s.to}>열기</Link>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="bc-grid2 bc-sec">
        <div className={`bc-box${usage.data?.warnings?.length ? ' warn' : ''}`}>
          <h3 style={{ fontSize: 15 }}>이번 달 한도</h3>
          {usage.isLoading && <p className="bc-muted">불러오는 중…</p>}
          {usage.isError && <p className="bc-muted">사용량을 불러오지 못했어요.</p>}
          {usage.data && limits.length === 0 && <p className="bc-muted">이 플랜에는 한도가 없어요.</p>}
          {limits.map(([m, lim]) => {
            const used = usage.data!.totals[m] ?? 0;
            const pct = Math.min(100, Math.round((used / (lim as number)) * 100));
            return (
              <div key={m} className={`bc-meter${pct >= 100 ? ' over' : pct >= 80 ? ' warn' : ''}`}>
                <div className="lab"><span>{METRIC_LABEL[m] ?? m}</span><span>{fmtMetric(m, used)} / {fmtMetric(m, lim as number)} · {pct}%</span></div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          {usage.data && <p className="bc-muted" style={{ marginBottom: 0 }}>한도를 넘으면 {usage.data.overage_policy === 'block' ? '이번 달 남은 기간 동안 막혀요' : '초과분이 청구돼요'}. 전송 · 요청 수치는 전날까지 집계돼요.</p>}
        </div>
        <div className="bc-box">
          <h3 style={{ fontSize: 15 }}>연동</h3>
          {keys.isLoading && <p className="bc-muted">불러오는 중…</p>}
          {keys.data && activeKeys.length === 0 && <p className="bc-muted">아직 사이트 키가 없어요.</p>}
          {activeKeys.length > 0 && (
            <table className="bc-table"><tbody>
              {activeKeys.slice(0, 5).map((k) => <tr key={k.id}><td><b>{k.label ?? '이름 없음'}</b></td><td className="bc-muted">{k.allowed_origins.join(', ') || '허용 출처 없음'}</td></tr>)}
            </tbody></table>
          )}
          <p className="bc-muted" style={{ marginBottom: 0 }}>키별 요청 수는 다음 단계에서 보여요.</p>
        </div>
      </div>

      <section className="bc-sec">
        <h3>최근 이미지</h3>
        {recent.isLoading && <p className="bc-muted">불러오는 중…</p>}
        {recent.data && recent.data.items.length === 0 && <p className="bc-muted">아직 올린 이미지가 없어요.</p>}
        {recent.data && recent.data.items.length > 0 && <div className="bc-thumbs">{recent.data.items.map((a) => <Thumb key={a.id} a={a} />)}</div>}
      </section>
    </>
  );
}
