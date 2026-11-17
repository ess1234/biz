/// 4-2 홈 (biz-dev-08): 시작하기 4단계(끝나면 한 줄로 접힘) + 이번 달 한도 + 최근 이미지. 연동 카드의 키별 요청 수는 2차(DC-6) — 1차는 키 목록만.
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { VIS } from '../../data/assets';
import { useRecent, useSettings, useSiteKeys, useUsage } from '../../data/hooks';
import { qk } from '../../data/keys';
import { type AssetSummary } from '../../data/types';
import { METRIC_LABEL, fmtMetric } from '../../data/usage';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { useFileUrl } from '../../lib/thumbs';
import { toast } from '../../lib/toast';
import { ArrowRight, Check, Empty, ExternalLink, PageHead, Upload } from '../../ui/common';
import { welcomed } from './welcomed';

const SNIPPET_KEY = (id: string) => `biz:snippet-done:${id}`;
/** https://shop.example.com → shop.example.com (홈 카드에는 주소만 짧게) */
const hostOf = (origin: string) => origin.replace(/^https?:\/\//, '').replace(/\/$/, '');

function Thumb({ a }: { a: AssetSummary }) {
  const url = useFileUrl('thumb256', a.has_thumb ? a.id : null);
  const nav = useNavigate();
  return (
    <div className="cell" title={a.caption ?? a.file_name ?? ''} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
      onClick={() => nav(`/images/${a.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/images/${a.id}`); }}>
      {url && <img src={url} alt={a.caption ?? ''} loading="lazy" />}
      <span className={`vis ${a.visibility}`}>{VIS[a.visibility]?.label ?? a.visibility}</span>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.settings }); toast('AI 분석을 켰어요'); },
    onError: toastError,
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
      <PageHead
        title={me!.account.name}
        sub={<>플랜 {usage.data?.plan_label ?? usage.data?.plan ?? settings.data?.plan_label ?? settings.data?.plan ?? '—'}{recent.data ? ` · 최근 이미지 ${recent.data.items.length}장` : ''}</>}
        /* 주 버튼은 화면에 하나 — AI 분석을 아직 안 켰으면 시작하기의 "켜기"가 주 버튼 */
        actions={<Link className={`bc-btn${settings.data?.ai_consent_at ? ' primary' : ''}`} to="/images"><Upload className="bc-ico" />이미지 올리기</Link>}
      />

      <section>
        <h3 style={{ fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>시작하기 <span className={`bc-badge${doneCount < 4 ? ' gray' : ''}`}>{doneCount}/4</span></h3>
        {doneCount === 4 ? (
          <div className="bc-steps-folded"><Check className="bc-ico" />시작하기 4단계를 모두 끝냈어요</div>
        ) : (
          <ol className="bc-steps">
            {steps.map((s, i) => (
              <li key={s.title} className={s.done ? 'done' : ''}>
                <span className="n">{s.done ? <Check className="bc-ico" /> : i + 1}</span>
                <div className="t"><b>{s.title}</b>{!s.done && <div className="bc-muted">{s.body}</div>}</div>
                {!s.done && s.action === 'consent' && <button className="bc-btn small primary" disabled={consent.isPending || settings.isLoading} onClick={() => consent.mutate()}>켜기</button>}
                {!s.done && s.action === 'snippet' && <button className="bc-btn small" onClick={() => { try { localStorage.setItem(SNIPPET_KEY(accId), '1'); } catch { /* 무시 */ } setSnippetDone(true); }}>붙였어요</button>}
                {!s.done && 'to' in s && s.to && <Link className="bc-btn small" to={s.to}>열기<ArrowRight className="bc-ico" /></Link>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="bc-grid2 bc-sec">
        <div className={`bc-box${usage.data?.warnings?.length ? ' warn' : ''}`}>
          <div className="bc-boxhead"><h3>이번 달 한도</h3><Link className="bc-btn small ghost" to="/billing">자세히</Link></div>
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
          <div className="bc-boxhead">
            <h3>사이트 연동</h3>
            <Link className="bc-btn small" to="/integrations">관리</Link>
          </div>
          {keys.isLoading && <p className="bc-muted">불러오는 중…</p>}
          {keys.data && activeKeys.length === 0 && (
            <p className="bc-muted" style={{ marginBottom: 0 }}>아직 사이트 키가 없어요. <Link to="/integrations">사이트 키 만들기</Link></p>
          )}
          {activeKeys.length > 0 && (
            <ul className="bc-keylist">
              {activeKeys.slice(0, 5).map((k) => {
                const hosts = k.allowed_origins.map(hostOf);
                return (
                  <li key={k.id}>
                    <div className="info">
                      <b>{k.label ?? '이름 없음'}</b>
                      <span className="bc-muted" title={k.allowed_origins.join('\n')}>
                        {hosts.length ? `설명을 받는 사이트 · ${hosts[0]}${hosts.length > 1 ? ` 외 ${hosts.length - 1}곳` : ''}` : '설명을 받을 사이트가 아직 없어요'}
                      </span>
                    </div>
                    {/* 연동 화면과 같은 데모(콘솔 주소 /d/{키} → dos) */}
                    <a className="bc-btn small" href={`${location.origin}/d/${k.key}`} target="_blank" rel="noreferrer">데모 보기<ExternalLink className="bc-ico" /></a>
                  </li>
                );
              })}
            </ul>
          )}
          {activeKeys.length > 5 && <p className="bc-muted" style={{ marginBottom: 0 }}>외 {activeKeys.length - 5}개 — 관리에서 모두 보기</p>}
        </div>
      </div>

      <section className="bc-box bc-sec">
        <div className="bc-boxhead"><h3>최근 이미지</h3><Link className="bc-btn small ghost" to="/images">모두 보기<ArrowRight className="bc-ico" /></Link></div>
        {recent.isLoading && <p className="bc-muted">불러오는 중…</p>}
        {recent.data && recent.data.items.length === 0 && (
          <Empty title="첫 이미지를 올려 보세요" body="분석이 끝나면 4개 언어 설명이 붙고 영구 주소가 생겨요." action={<Link className="bc-btn small" to="/images"><Upload className="bc-ico" />이미지 올리기</Link>} />
        )}
        {recent.data && recent.data.items.length > 0 && <div className="bc-thumbs">{recent.data.items.map((a) => <Thumb key={a.id} a={a} />)}</div>}
      </section>
    </>
  );
}
