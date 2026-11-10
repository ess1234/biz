/// 운영 (운영자만, 메뉴 맨 아래 — biz-dev-08 3절). sai 콘솔 Admin.tsx 의 B2B 부분을 옮김: 현황 · 사용량 상위 · 청구서 · 삭제 승인 · 백업 · 계정.
/// 데이터만 — 이미지 · 주소는 보여 주지 않는다. 경로는 GET /me 의 admin.path 로만 안다(무작위 슬러그). 이 화면을 연 기록은 서버가 남긴다.
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { api } from '../lib/api';
import { useSession } from '../lib/auth';
import { INVOICE_STATUS, InvoiceSheet, krw } from './Billing';

const mb = (b: number) => `${((b ?? 0) / 1048576).toFixed(1)}MB`;
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('ko-KR') : '—');
const STATUS_LABEL: Record<string, string> = { registered: '등록', uploaded: '업로드', backed_up: '보관', analyzed: '분석', failed: '실패', queued: '대기', running: '실행', done: '완료' };
const VIS_LABEL: Record<string, string> = { private: '비공개', site: '사이트', public: '공개' };
const counts = (o: Record<string, number> | undefined, labels: Record<string, string>) => Object.entries(o ?? {}).map(([k, v]) => `${labels[k] ?? k} ${v}`).join(' · ') || '—';

export function useAdminPath() {
  const { me } = useSession();
  return me?.admin?.path ?? null;
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="bc-box"><div className="bc-muted">{label}</div><div style={{ marginTop: 4 }}>{v}</div></div>;
}

export function AdminPage() {
  const base = useAdminPath();
  const summary = useQuery({ queryKey: ['admin', 'summary'], queryFn: () => api.get<any>(`${base}/summary`), enabled: Boolean(base), staleTime: 30_000 });
  const accounts = useQuery({ queryKey: ['admin', 'accounts'], queryFn: () => api.get<{ items: any[] }>(`${base}/accounts`), enabled: Boolean(base), staleTime: 30_000 });
  const jobs = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => api.get<any>(`${base}/jobs`), enabled: Boolean(base), staleTime: 30_000 });
  const usageTop = useQuery({ queryKey: ['admin', 'usage-top'], queryFn: () => api.get<any>(`${base}/usage-top`, { days: 7 }), enabled: Boolean(base), staleTime: 60_000 });
  if (!base) return <p className="bc-muted">운영자만 볼 수 있어요.</p>;
  const s = summary.data;
  const u = usageTop.data;
  return (
    <>
      <h2 className="bc-h">운영 <span className="bc-badge gray">데이터만</span></h2>
      <p className="bc-muted">워크스페이스 · 이미지 · 분석 큐 · 청구의 현황이에요. 이미지와 주소는 보여 주지 않고, 이 화면을 연 기록이 남아요.</p>
      {s && (
        <div className="bc-cards bc-sec">
          <Stat label="워크스페이스" v={`${s.accounts?.business ?? s.accounts?.total ?? 0} (오늘 +${s.accounts?.today ?? 0})`} />
          <Stat label="이미지" v={`${s.assets?.total ?? 0} · 휴지통 ${s.assets?.trash ?? 0} · ${mb(s.assets?.bytes)}`} />
          <Stat label="상태" v={counts(s.assets?.by_status, STATUS_LABEL)} />
          <Stat label="분석 큐" v={counts(s.jobs, STATUS_LABEL)} />
        </div>
      )}

      {u && (
        <section className="bc-sec">
          <h3 style={{ fontSize: 15 }}>사용량 상위 <span className="bc-badge gray">최근 {u.days}일</span> <span className="bc-muted" style={{ fontWeight: 400 }}>{u.edge_note}</span></h3>
          <table className="bc-table" style={{ marginTop: 8 }}>
            <thead><tr><th>워크스페이스</th><th>이미지 요청</th><th>전송</th><th>변환</th><th>메타 요청</th><th>업로드</th><th>분석</th><th>저장</th></tr></thead>
            <tbody>
              {u.items.map((x: any) => (
                <tr key={x.account_id}><td><Link to={`/admin/acc/${x.account_id}`}>{x.name}</Link></td><td>{x.image_requests.toLocaleString()}</td><td>{mb(x.egress_bytes)}</td><td>{x.transforms.toLocaleString()}</td><td>{x.meta_requests.toLocaleString()}</td><td>{x.uploads.toLocaleString()}</td><td>{x.analyses.toLocaleString()}</td><td>{mb(x.storage_bytes)}</td></tr>
              ))}
              {u.totals && <tr style={{ fontWeight: 700 }}><td>합계</td><td>{u.totals.image_requests.toLocaleString()}</td><td>{mb(u.totals.egress_bytes)}</td><td>{u.totals.transforms.toLocaleString()}</td><td>{u.totals.meta_requests.toLocaleString()}</td><td>{u.totals.uploads.toLocaleString()}</td><td>{u.totals.analyses.toLocaleString()}</td><td>{mb(u.totals.storage_bytes)}</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <BizOps base={base} />

      <section className="bc-sec">
        <h3 style={{ fontSize: 15 }}>워크스페이스 <span className="bc-badge gray">{accounts.data?.items.length ?? '–'}</span></h3>
        {accounts.isLoading ? <p className="bc-muted">불러오는 중…</p> : (
          <table className="bc-table" style={{ marginTop: 8 }}>
            <thead><tr><th>이름</th><th>멤버 · 마지막 로그인</th><th>이미지</th><th>상태</th><th>공개 범위</th><th>마지막 업로드</th></tr></thead>
            <tbody>{accounts.data?.items.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/admin/acc/${a.id}`}>{a.name}</Link><div className="bc-muted">{new Date(a.created_at).toLocaleDateString('ko-KR')} 가입</div></td>
                <td>{(a.members ?? []).map((m: any) => <div key={m.email ?? m.user_id}>{m.email ?? '—'} <span className="bc-muted">{dt(m.last_sign_in_at)}</span></div>)}</td>
                <td>{a.assets?.total ?? 0}<div className="bc-muted">휴지통 {a.assets?.trash ?? 0} · {mb(a.assets?.bytes)}</div></td>
                <td>{counts(a.assets?.by_status, STATUS_LABEL)}</td>
                <td>{counts(a.assets?.by_visibility, VIS_LABEL)}</td>
                <td>{dt(a.assets?.last_upload)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="bc-sec">
        <h3 style={{ fontSize: 15 }}>분석 큐</h3>
        {jobs.data && (
          <>
            <p>{counts(jobs.data.by_status, STATUS_LABEL)} (최근 {jobs.data.sample}건 기준){jobs.data.oldest_queued_at && <span className="bc-muted"> · 가장 오래된 대기 {dt(jobs.data.oldest_queued_at)}</span>}</p>
            {jobs.data.recent_failed?.length > 0 && <ul className="bc-plain">{jobs.data.recent_failed.map((f: any, i: number) => <li key={i}><span className="bc-muted">{dt(f.at)} · 시도 {f.attempts}</span><div className="bc-mono">{f.error}</div></li>)}</ul>}
          </>
        )}
      </section>
    </>
  );
}

/// 청구서 · 삭제 승인 · 백업 기록 — 숫자 · 상태 · 이름만
function BizOps({ base }: { base: string }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState('');
  const [open, setOpen] = useState<any | null>(null);
  const inv = useQuery({ queryKey: ['admin', 'invoices', period], queryFn: () => api.get<any>(`${base}/invoices`, period ? { period } : {}), staleTime: 30_000 });
  const dels = useQuery({ queryKey: ['admin', 'deletions'], queryFn: () => api.get<any>(`${base}/deletions`), staleTime: 30_000 });
  const backups = useQuery({ queryKey: ['admin', 'backups'], queryFn: () => api.get<any>(`${base}/backups`, { limit: 10 }), staleTime: 60_000 });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`${base}/invoices/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'invoices'] }) });
  const generate = useMutation({ mutationFn: () => api.post<any>(`${base}/invoices:generate`, {}), onSuccess: (r) => { alert(`전월 청구서 ${r.created}건 생성 (건너뜀 ${r.skipped})`); qc.invalidateQueries({ queryKey: ['admin', 'invoices'] }); } });
  const approve = useMutation({ mutationFn: (id: string) => api.post(`${base}/accounts/${id}/approve-delete`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'deletions'] }) });
  const tot = inv.data?.totals;
  return (
    <>
      <section className="bc-sec">
        <h3 style={{ fontSize: 15 }}>청구서 <span className="bc-badge gray">{period || '전체'}</span> <span className="bc-muted" style={{ fontWeight: 400 }}>결제는 수동 — 입금 확인 뒤 '결제 확인'</span></h3>
        <div className="bc-row">
          <input style={{ width: 110, padding: '6px 10px', border: '1px solid var(--bc-line)', borderRadius: 8, font: 'inherit' }} placeholder="YYYY-MM" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="기간" />
          <button className="bc-btn small" onClick={() => setPeriod(inv.data?.previous_period ?? '')}>전월</button>
          <button className="bc-btn small" disabled={generate.isPending} onClick={() => { if (confirm('전월 청구서를 지금 만들까요? (이미 있는 워크스페이스는 건너뜀)')) generate.mutate(); }}>전월 청구서 만들기</button>
          {tot && <span className="bc-muted">{tot.count}건 · 합계 {krw(tot.total_krw)} · 미수 {krw(tot.unpaid_krw)}</span>}
        </div>
        {inv.data && inv.data.items.length > 0 && (
          <table className="bc-table" style={{ marginTop: 8 }}>
            <thead><tr><th>기간</th><th>워크스페이스</th><th>플랜</th><th>저장</th><th>전송</th><th style={{ textAlign: 'right' }}>합계</th><th>상태</th><th /></tr></thead>
            <tbody>{inv.data.items.map((i: any) => (
              <tr key={i.id}><td>{i.period}</td><td><Link to={`/admin/acc/${i.account.id}`}>{i.account.name}</Link></td><td>{i.plan}</td><td>{i.usage?.storage_gb} GB</td><td>{i.usage?.egress_gb} GB</td><td style={{ textAlign: 'right' }}>{krw(i.total_krw)}</td>
                <td><span className={`bc-badge${i.status === 'paid' ? '' : i.status === 'issued' ? ' warn' : ' gray'}`}>{INVOICE_STATUS[i.status as keyof typeof INVOICE_STATUS]}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="bc-btn small" onClick={() => setOpen(i)}>보기</button>{' '}
                  {i.status === 'issued' && <button className="bc-btn small primary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: i.id, status: 'paid' })}>결제 확인</button>}{' '}
                  {i.status === 'issued' && <button className="bc-btn small" onClick={() => { if (confirm('이 청구서를 취소할까요?')) setStatus.mutate({ id: i.id, status: 'void' }); }}>취소</button>}
                  {i.status !== 'issued' && <button className="bc-btn small" onClick={() => setStatus.mutate({ id: i.id, status: 'issued' })}>발행으로</button>}
                </td></tr>
            ))}</tbody>
          </table>
        )}
        {inv.data && inv.data.items.length === 0 && <p className="bc-muted">청구서 없음</p>}
        {open && <InvoiceSheet inv={open} account={open.account?.name} onClose={() => setOpen(null)} />}
      </section>

      <section className="bc-sec">
        <h3 style={{ fontSize: 15 }}>삭제 요청 <span className="bc-badge gray">{dels.data?.items.length ?? '–'}</span> <span className="bc-muted" style={{ fontWeight: 400 }}>유예 {dels.data?.grace_days ?? 60}일 + 운영자 승인 둘 다 지나야 실행</span></h3>
        {dels.data && dels.data.items.length === 0 && <p className="bc-muted">없음</p>}
        {dels.data && dels.data.items.length > 0 && (
          <table className="bc-table" style={{ marginTop: 8 }}>
            <thead><tr><th>워크스페이스</th><th>요청</th><th>승인</th><th>실행 예정</th><th /></tr></thead>
            <tbody>{dels.data.items.map((d: any) => (
              <tr key={d.account_id}><td><Link to={`/admin/acc/${d.account_id}`}>{d.name ?? d.account_id.slice(0, 8)}</Link></td><td>{dt(d.delete_requested_at)}</td>
                <td>{d.delete_approved_at ? dt(d.delete_approved_at) : <span className="bc-badge warn">대기</span>}</td><td>{dt(d.delete_at)}</td>
                <td>{!d.delete_approved_at && <button className="bc-btn small danger" disabled={approve.isPending} onClick={() => { if (confirm(`${d.name} 의 삭제를 승인할까요? 유예가 끝나면 원본 · 사본 · DB 가 지워져요.`)) approve.mutate(d.account_id); }}>승인</button>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="bc-sec">
        <h3 style={{ fontSize: 15 }}>백업 <span className="bc-muted" style={{ fontWeight: 400 }}>DB 덤프 · 원본 복제 · 복구 리허설 — 마지막 성공이 하루 넘게 비면 경보</span></h3>
        {backups.data && (
          <>
            <p>{['db_json', 'originals', 'drill'].map((k) => <span key={k} className={`bc-badge${backups.data.last_ok?.[k] ? '' : ' gray'}`} style={{ marginRight: 6 }}>{k} {backups.data.last_ok?.[k] ? dt(backups.data.last_ok[k]) : '기록 없음'}</span>)}</p>
            {backups.data.items?.length > 0 && (
              <table className="bc-table" style={{ fontSize: 12 }}>
                <thead><tr><th>시작</th><th>종류</th><th>대상</th><th>결과</th><th>객체</th><th>바이트</th><th>메모</th></tr></thead>
                <tbody>{backups.data.items.map((b: any) => <tr key={b.id}><td>{dt(b.started_at)}</td><td>{b.kind}</td><td className="bc-mono">{b.dest}</td><td>{b.ok ? 'OK' : '실패'}</td><td>{b.objects}</td><td>{mb(b.bytes ?? 0)}</td><td>{b.note}</td></tr>)}</tbody>
              </table>
            )}
          </>
        )}
      </section>
    </>
  );
}

export function AdminAccountPage() {
  const base = useAdminPath();
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['admin', 'account', id], queryFn: () => api.get<any>(`${base}/accounts/${id}`, { recent: 50 }), enabled: Boolean(base && id) });
  if (!base) return <p className="bc-muted">운영자만 볼 수 있어요.</p>;
  if (q.isLoading) return <p className="bc-muted">불러오는 중…</p>;
  if (!q.data) return <p className="bc-msg">워크스페이스가 없어요.</p>;
  const d = q.data;
  return (
    <>
      <div className="bc-row" style={{ marginTop: 0 }}><Link className="bc-btn small" to="/admin">← 운영</Link></div>
      <h2 className="bc-h bc-sec">{d.account.name}</h2>
      <p className="bc-muted">가입 {dt(d.account.created_at)} · 분석 작업(최근 50) {counts(d.jobs?.by_status, STATUS_LABEL)}</p>
      {d.jobs?.recent_failed?.length > 0 && <ul className="bc-plain">{d.jobs.recent_failed.map((f: any, i: number) => <li key={i}><span className="bc-muted">{dt(f.at)}</span><div className="bc-mono">{f.error}</div></li>)}</ul>}
      <h3 className="bc-sec" style={{ fontSize: 15 }}>최근 이미지 {d.recent_assets?.length ?? 0}건 <span className="bc-badge gray">글만</span></h3>
      <table className="bc-table" style={{ marginTop: 8 }}>
        <thead><tr><th>올림</th><th>상태</th><th>공개 범위</th><th>크기</th><th>설명</th><th>키워드</th><th>출처</th></tr></thead>
        <tbody>{(d.recent_assets ?? []).map((a: any) => (
          <tr key={a.id} style={a.deleted ? { opacity: .5 } : undefined}>
            <td>{dt(a.created_at)}</td>
            <td>{STATUS_LABEL[a.status] ?? a.status}{a.deleted ? ' · 휴지통' : ''}</td><td>{VIS_LABEL[a.visibility] ?? a.visibility}</td>
            <td>{a.size ?? '—'}<div className="bc-muted">{a.bytes ? mb(a.bytes) : ''}</div></td>
            <td style={{ maxWidth: 360 }}>{a.caption ?? <span className="bc-muted">(설명 없음)</span>}</td>
            <td className="bc-muted">{(a.keywords ?? []).join(' · ')}</td>
            <td className="bc-muted">{(a.sources ?? []).join('+')}</td>
          </tr>
        ))}</tbody>
      </table>
    </>
  );
}
