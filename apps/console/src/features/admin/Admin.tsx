/// 운영 (운영자만, 메뉴 맨 아래 — biz-dev-08 3절): 현황 · 사용량 상위 · 청구서 · 삭제 승인 · 백업 · 계정.
/// 데이터만 — 이미지 · 주소는 보여 주지 않는다. 경로는 GET /me 의 admin.path 로만 안다(무작위 슬러그). 이 화면을 연 기록은 서버가 남긴다.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { VIS } from '../../data/assets';
import { INVOICE_STATUS } from '../../data/invoices';
import { qk } from '../../data/keys';
import { type AdminAccount, type AdminAccountDetail, type AdminAuditRequests, type AuditRequest, type AdminBackups, type AdminDeletions, type AdminInvoice, type AdminInvoices, type AdminJobs, type AdminLangs, type AdminSummary, type AdminUsageTop, type InvoiceGenerated } from '../../data/types';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { fmtDate, fmtDateTime, fmtMB, krw } from '../../lib/format';
import { useSession } from '../../lib/session';
import { toast } from '../../lib/toast';
import { InvoiceSheet } from '../../ui/InvoiceSheet';
import { PageHead } from '../../ui/common';
import { askConfirm } from '../../ui/confirm';

const STATUS_LABEL: Record<string, string> = { registered: '등록', uploaded: '업로드', backed_up: '보관', analyzed: '분석', failed: '실패', queued: '대기', running: '실행', done: '완료' };
const VIS_LABEL: Record<string, string> = Object.fromEntries(Object.entries(VIS).map(([k, v]) => [k, v.label]));
const counts = (o: Record<string, number> | undefined, labels: Record<string, string>) => Object.entries(o ?? {}).map(([k, v]) => `${labels[k] ?? k} ${v}`).join(' · ') || '—';

/// 운영 API 경로 — GET /me 의 admin.path(무작위 슬러그). 운영자가 아니면 null
function useAdminPath() {
  const { me } = useSession();
  return me?.admin?.path ?? null;
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="bc-box"><div className="bc-muted">{label}</div><div style={{ marginTop: 4 }}>{v}</div></div>;
}

export function AdminPage() {
  const base = useAdminPath();
  const summary = useQuery({ queryKey: [...qk.admin, 'summary'], queryFn: () => api.get<AdminSummary>(`${base}/summary`), enabled: Boolean(base), staleTime: 30_000 });
  const accounts = useQuery({ queryKey: [...qk.admin, 'accounts'], queryFn: () => api.get<{ items: AdminAccount[] }>(`${base}/accounts`), enabled: Boolean(base), staleTime: 30_000 });
  const jobs = useQuery({ queryKey: [...qk.admin, 'jobs'], queryFn: () => api.get<AdminJobs>(`${base}/jobs`), enabled: Boolean(base), staleTime: 30_000 });
  const usageTop = useQuery({ queryKey: [...qk.admin, 'usage-top'], queryFn: () => api.get<AdminUsageTop>(`${base}/usage-top`, { days: 7 }), enabled: Boolean(base), staleTime: 60_000 });
  if (!base) return <p className="bc-muted">운영자만 볼 수 있어요.</p>;
  const s = summary.data;
  const u = usageTop.data;
  return (
    <>
      <PageHead title="운영" badge={<span className="bc-badge gray">데이터만</span>} sub="워크스페이스 · 이미지 · 분석 큐 · 청구의 현황이에요. 이미지와 주소는 보여 주지 않고, 이 화면을 연 기록이 남아요." />
      {s && (
        <div className="bc-cards bc-sec">
          <Stat label="워크스페이스" v={`${s.accounts?.business ?? s.accounts?.total ?? 0} (오늘 +${s.accounts?.today ?? 0})`} />
          <Stat label="이미지" v={`${s.assets?.total ?? 0} · 휴지통 ${s.assets?.trash ?? 0} · ${fmtMB(s.assets?.bytes)}`} />
          <Stat label="상태" v={counts(s.assets?.by_status, STATUS_LABEL)} />
          <Stat label="분석 큐" v={counts(s.jobs, STATUS_LABEL)} />
        </div>
      )}

      {u && (
        <section className="bc-sec">
          <h3 className="bc-h3">사용량 상위 <span className="bc-badge gray">최근 {u.days}일</span> <span className="bc-muted">{u.edge_note}</span></h3>
          <table className="mt-8 bc-table">
            <thead><tr><th>워크스페이스</th><th>이미지 요청</th><th>전송</th><th>변환</th><th>메타 요청</th><th>업로드</th><th>분석</th><th>저장</th></tr></thead>
            <tbody>
              {u.items.map((x) => (
                <tr key={x.account_id}><td><Link to={`/admin/acc/${x.account_id}`}>{x.name}</Link></td><td>{x.image_requests.toLocaleString()}</td><td>{fmtMB(x.egress_bytes)}</td><td>{x.transforms.toLocaleString()}</td><td>{x.meta_requests.toLocaleString()}</td><td>{x.uploads.toLocaleString()}</td><td>{x.analyses.toLocaleString()}</td><td>{fmtMB(x.storage_bytes)}</td></tr>
              ))}
              {u.totals && <tr className="total"><td>합계</td><td>{u.totals.image_requests.toLocaleString()}</td><td>{fmtMB(u.totals.egress_bytes)}</td><td>{u.totals.transforms.toLocaleString()}</td><td>{u.totals.meta_requests.toLocaleString()}</td><td>{u.totals.uploads.toLocaleString()}</td><td>{u.totals.analyses.toLocaleString()}</td><td>{fmtMB(u.totals.storage_bytes)}</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <BizOps base={base} />

      <section className="bc-sec">
        <h3 className="bc-h3">워크스페이스 <span className="bc-badge gray">{accounts.data?.items.length ?? '–'}</span></h3>
        {accounts.isLoading ? <p className="bc-muted">불러오는 중…</p> : (
          <table className="mt-8 bc-table">
            <thead><tr><th>이름</th><th>멤버 · 마지막 로그인</th><th>이미지</th><th>상태</th><th>공개 범위</th><th>마지막 업로드</th></tr></thead>
            <tbody>{accounts.data?.items.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/admin/acc/${a.id}`}>{a.name}</Link><div className="bc-muted">{fmtDate(a.created_at)} 가입</div></td>
                <td>{(a.members ?? []).map((m, j) => <div key={m.email ?? j}>{m.email ?? '—'} <span className="bc-muted">{fmtDateTime(m.last_sign_in_at)}</span></div>)}</td>
                <td>{a.assets?.total ?? 0}<div className="bc-muted">휴지통 {a.assets?.trash ?? 0} · {fmtMB(a.assets?.bytes)}</div></td>
                <td>{counts(a.assets?.by_status, STATUS_LABEL)}</td>
                <td>{counts(a.assets?.by_visibility, VIS_LABEL)}</td>
                <td>{fmtDateTime(a.assets?.last_upload)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="bc-sec">
        <h3 className="bc-h3">분석 큐</h3>
        {jobs.data && (
          <>
            <p>{counts(jobs.data.by_status, STATUS_LABEL)} (최근 {jobs.data.sample}건 기준){jobs.data.oldest_queued_at && <span className="bc-muted"> · 가장 오래된 대기 {fmtDateTime(jobs.data.oldest_queued_at)}</span>}</p>
            {jobs.data.recent_failed.length > 0 && <ul className="bc-plain">{jobs.data.recent_failed.map((f, i) => <li key={i}><span className="bc-muted">{fmtDateTime(f.at)} · 시도 {f.attempts}</span><div className="bc-mono">{f.error}</div></li>)}</ul>}
          </>
        )}
      </section>
    </>
  );
}

/// 청구서 · 삭제 승인 · 백업 기록 — 숫자 · 상태 · 이름만
const AR_STATUS: Record<AuditRequest['status'], [string, string]> = {
  new: ['새 신청', ' warn'], running: ['진단 중', ''], sent: ['보냄', ''], rejected: ['거절', ' gray'], spam: ['스팸', ' gray'], duplicate: ['중복', ' gray'],
};

/// 진단 명령 — 운영자 PC 의 dos 폴더에서 실행. 이메일 도메인이 사이트와 같을 때만 --ai(사이트 주인 요청, biz-dev-11 DG-5)
const auditCommand = (r: AuditRequest) => `python scripts/site_audit.py ${r.site_url}${r.owner_match ? ' --ai' : ''}`;

function NoteEdit({ value, busy, onSave }: { value: string; busy: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <>
      <input className="bc-input w-110" value={v} onChange={(e) => setV(e.target.value)} placeholder="메모" aria-label="메모" />{' '}
      <button className="bc-btn small" disabled={busy || v === value} onClick={() => onSave(v)}>메모 저장</button>
    </>
  );
}

/// 진단 신청(biz-dev-12): 들어온 신청을 보고 진단을 돌린 뒤 상태를 바꾼다. 신청자가 삭제를 요청하면 지운다
function AuditRequests({ base }: { base: string }) {
  const qc = useQueryClient();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const q = useQuery({ queryKey: qk.adminAuditRequests, queryFn: () => api.get<AdminAuditRequests>(`${base}/audit-requests`, { limit: 200 }), staleTime: 30_000 });
  const done = () => qc.invalidateQueries({ queryKey: qk.adminAuditRequests });
  const patch = useMutation({ mutationFn: ({ id, ...b }: { id: string; status?: string; note?: string }) => api.patch(`${base}/audit-requests/${id}`, b), onSuccess: done, onError: toastError });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`${base}/audit-requests/${id}`), onSuccess: () => { toast('지웠어요'); done(); }, onError: toastError });
  const d = q.data;
  const items = (d?.items ?? []).filter((r) => show === 'all' || r.status === 'new' || r.status === 'running');
  const copy = async (r: AuditRequest) => {
    try { await navigator.clipboard.writeText(auditCommand(r)); toast('진단 명령을 복사했어요'); } catch { toast(auditCommand(r)); }
  };
  return (
    <section className="bc-sec">
      <h3 className="bc-h3">진단 신청 <span className={`bc-badge${d?.new_count ? ' warn' : ' gray'}`}>새 신청 {d?.new_count ?? '–'}</span> <span className="bc-muted">dossai.app/business 양식 · 진단은 자동으로 돌지 않아요</span></h3>
      {d && !d.ready && <p className="bc-muted">신청 표가 아직 없어요(DB 마이그레이션 biz_0007 전). 양식은 "준비 중"으로 답해요.</p>}
      {d?.ready && (
        <>
          <div className="bc-row">
            <button className={`bc-btn small${show === 'open' ? ' primary' : ''}`} onClick={() => setShow('open')}>처리할 것</button>
            <button className={`bc-btn small${show === 'all' ? ' primary' : ''}`} onClick={() => setShow('all')}>전체 {d.items.length}</button>
          </div>
          {items.length === 0 && <p className="bc-muted">{show === 'open' ? '처리할 신청이 없어요' : '신청 없음'}</p>}
          {items.length > 0 && (
            <table className="mt-8 bc-table">
              <thead><tr><th>받은 때</th><th>사이트</th><th>이메일 · 회사</th><th>상태</th><th /></tr></thead>
              <tbody>{items.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td><a href={r.site_url} target="_blank" rel="noreferrer noopener">{r.site_host}</a>{r.owner_match && <> <span className="bc-badge" title="이메일 도메인이 사이트와 같아요 — AI 미리보기 대상">주인</span></>}</td>
                  <td>{r.email ?? '(1년 지나 지움)'}{r.free_mail && <> <span className="bc-badge gray">개인 메일</span></>}{r.company && <div className="bc-muted">{r.company}</div>}{r.note && <div className="bc-muted">메모: {r.note}</div>}</td>
                  <td><span className={`bc-badge${AR_STATUS[r.status][1]}`}>{AR_STATUS[r.status][0]}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="bc-btn small" onClick={() => copy(r)} title={auditCommand(r)}>명령 복사</button>{' '}
                    {r.status === 'new' && <button className="bc-btn small" disabled={patch.isPending} onClick={() => patch.mutate({ id: r.id, status: 'running' })}>진단 중</button>}{' '}
                    {(r.status === 'new' || r.status === 'running') && <button className="bc-btn small primary" disabled={patch.isPending} onClick={async () => { if (await askConfirm(`${r.site_host} 보고서를 보냈나요?`, { ok: '보냄으로' })) patch.mutate({ id: r.id, status: 'sent' }); }}>보냄</button>}{' '}
                    {r.status !== 'rejected' && r.status !== 'sent' && <button className="bc-btn small" disabled={patch.isPending} onClick={() => patch.mutate({ id: r.id, status: 'rejected' })}>거절</button>}{' '}
                    <NoteEdit value={r.note ?? ''} busy={patch.isPending} onSave={(note) => patch.mutate({ id: r.id, note })} />{' '}
                    <button className="bc-btn small danger" disabled={del.isPending} onClick={async () => { if (await askConfirm(`${r.site_host} 신청을 지울까요? 신청자가 삭제를 요청했을 때 써요. 되돌릴 수 없어요.`, { ok: '지우기', danger: true })) del.mutate(r.id); }}>지우기</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function BizOps({ base }: { base: string }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState('');
  const [open, setOpen] = useState<AdminInvoice | null>(null);
  const inv = useQuery({ queryKey: [...qk.adminInvoices, period], queryFn: () => api.get<AdminInvoices>(`${base}/invoices`, period ? { period } : {}), staleTime: 30_000 });
  const dels = useQuery({ queryKey: qk.adminDeletions, queryFn: () => api.get<AdminDeletions>(`${base}/deletions`), staleTime: 30_000 });
  const backups = useQuery({ queryKey: [...qk.admin, 'backups'], queryFn: () => api.get<AdminBackups>(`${base}/backups`, { limit: 10 }), staleTime: 60_000 });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`${base}/invoices/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminInvoices }), onError: toastError });
  const generate = useMutation({ mutationFn: () => api.post<InvoiceGenerated>(`${base}/invoices:generate`, {}), onSuccess: (r) => { toast(`전월 청구서 ${r.created}건 생성 (건너뜀 ${r.skipped})`); qc.invalidateQueries({ queryKey: qk.adminInvoices }); }, onError: toastError });
  const approve = useMutation({ mutationFn: (id: string) => api.post(`${base}/accounts/${id}/approve-delete`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminDeletions }), onError: toastError });
  const tot = inv.data?.totals;
  return (
    <>
      <AuditRequests base={base} />

      <section className="bc-sec">
        <h3 className="bc-h3">청구서 <span className="bc-badge gray">{period || '전체'}</span> <span className="bc-muted">결제는 수동 — 입금 확인 뒤 '결제 확인'</span></h3>
        <div className="bc-row">
          <input className="bc-input w-110" placeholder="YYYY-MM" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="기간" />
          <button className="bc-btn small" onClick={() => setPeriod(inv.data?.previous_period ?? '')}>전월</button>
          <button className="bc-btn small" disabled={generate.isPending} onClick={async () => { if (await askConfirm('전월 청구서를 지금 만들까요? (이미 있는 워크스페이스는 건너뜀)', { ok: '만들기' })) generate.mutate(); }}>전월 청구서 만들기</button>
          {tot && <span className="bc-muted">{tot.count}건 · 합계 {krw(tot.total_krw)} · 미수 {krw(tot.unpaid_krw)}</span>}
        </div>
        {inv.data && inv.data.items.length > 0 && (
          <table className="mt-8 bc-table">
            <thead><tr><th>기간</th><th>워크스페이스</th><th>플랜</th><th>저장</th><th>전송</th><th className="num">합계</th><th>상태</th><th /></tr></thead>
            <tbody>{inv.data.items.map((i) => (
              <tr key={i.id}><td>{i.period}</td><td><Link to={`/admin/acc/${i.account.id}`}>{i.account.name}</Link></td><td>{i.plan}</td><td>{i.usage?.storage_gb} GB</td><td>{i.usage?.egress_gb} GB</td><td className="num">{krw(i.total_krw)}</td>
                <td><span className={`bc-badge${i.status === 'paid' ? '' : i.status === 'issued' ? ' warn' : ' gray'}`}>{INVOICE_STATUS[i.status]}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="bc-btn small" onClick={() => setOpen(i)}>보기</button>{' '}
                  {i.status === 'issued' && <button className="bc-btn small primary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: i.id, status: 'paid' })}>결제 확인</button>}{' '}
                  {i.status === 'issued' && <button className="bc-btn small" onClick={async () => { if (await askConfirm('이 청구서를 취소할까요?', { ok: '청구서 취소', danger: true })) setStatus.mutate({ id: i.id, status: 'void' }); }}>취소</button>}
                  {i.status !== 'issued' && <button className="bc-btn small" onClick={() => setStatus.mutate({ id: i.id, status: 'issued' })}>발행으로</button>}
                </td></tr>
            ))}</tbody>
          </table>
        )}
        {inv.data && inv.data.items.length === 0 && <p className="bc-muted">청구서 없음</p>}
        {open && <InvoiceSheet inv={open} account={open.account?.name} onClose={() => setOpen(null)} />}
      </section>

      <section className="bc-sec">
        <h3 className="bc-h3">삭제 요청 <span className="bc-badge gray">{dels.data?.items.length ?? '–'}</span> <span className="bc-muted">유예 {dels.data?.grace_days ?? 60}일 + 운영자 승인 둘 다 지나야 실행</span></h3>
        {dels.data && dels.data.items.length === 0 && <p className="bc-muted">없음</p>}
        {dels.data && dels.data.items.length > 0 && (
          <table className="mt-8 bc-table">
            <thead><tr><th>워크스페이스</th><th>요청</th><th>승인</th><th>실행 예정</th><th /></tr></thead>
            <tbody>{dels.data.items.map((d) => (
              <tr key={d.account_id}><td><Link to={`/admin/acc/${d.account_id}`}>{d.name ?? d.account_id.slice(0, 8)}</Link></td><td>{fmtDateTime(d.delete_requested_at)}</td>
                <td>{d.delete_approved_at ? fmtDateTime(d.delete_approved_at) : <span className="bc-badge warn">대기</span>}</td><td>{fmtDateTime(d.delete_at)}</td>
                <td>{!d.delete_approved_at && <button className="bc-btn small danger" disabled={approve.isPending} onClick={async () => { if (await askConfirm(`${d.name} 의 삭제를 승인할까요? 유예가 끝나면 원본 · 사본 · DB 가 지워져요.`, { ok: '삭제 승인', danger: true })) approve.mutate(d.account_id); }}>승인</button>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="bc-sec">
        <h3 className="bc-h3">백업 <span className="bc-muted">DB 덤프 · 원본 복제 · 복구 리허설 — 마지막 성공이 하루 넘게 비면 경보</span></h3>
        {backups.data && (
          <>
            <p>{['db_json', 'originals', 'drill'].map((k) => <span key={k} className={`bc-badge${backups.data.last_ok?.[k] ? '' : ' gray'}`} style={{ marginRight: 6 }}>{k} {backups.data.last_ok?.[k] ? fmtDateTime(backups.data.last_ok[k]) : '기록 없음'}</span>)}</p>
            {backups.data.items.length > 0 && (
              <table className="bc-small bc-table">
                <thead><tr><th>시작</th><th>종류</th><th>대상</th><th>결과</th><th>객체</th><th>바이트</th><th>메모</th></tr></thead>
                <tbody>{backups.data.items.map((b) => <tr key={b.id}><td>{fmtDateTime(b.started_at)}</td><td>{b.kind}</td><td className="bc-mono">{b.dest}</td><td>{b.ok ? 'OK' : '실패'}</td><td>{b.objects}</td><td>{fmtMB(b.bytes ?? 0)}</td><td>{b.note}</td></tr>)}</tbody>
              </table>
            )}
          </>
        )}
      </section>
    </>
  );
}

/// 추가 언어(biz-dev-10 LG-2): 요금이 정해질 때까지 운영자만 켠다. 기본 4개 언어는 항상이라 여기 없다.
/// "기존 이미지에도"는 이미 분석된 이미지를 다시 보내 그 언어의 설명만 만든다 — AI 비용이 든다.
function LangsBox({ base, id }: { base: string; id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.adminLangs(id), queryFn: () => api.get<AdminLangs>(`${base}/accounts/${id}/langs`), enabled: Boolean(id) });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const save = useMutation({
    mutationFn: (backfill: boolean) => api.patch<AdminLangs>(`${base}/accounts/${id}/langs`, { extra_langs: [...(picked ?? new Set(q.data?.extra_langs ?? []))], backfill }),
    onSuccess: (r, backfill) => { qc.setQueryData(qk.adminLangs(id), r); setPicked(null); toast(backfill ? `저장했어요 — 기존 이미지 ${r.queued ?? 0}장에 언어 추가를 걸었어요` : '저장했어요'); },
    onError: toastError,
  });
  if (q.isError) return <p className="bc-muted bc-sec">추가 언어 설정을 불러오지 못했어요.</p>;
  if (!q.data) return null;
  const d = q.data;
  const on = picked ?? new Set(d.extra_langs);
  const dirty = picked !== null && (picked.size !== d.extra_langs.length || d.extra_langs.some((l) => !picked.has(l)));
  return (
    <section className="bc-box bc-sec">
      <h3 className="bc-h3">추가 언어 <span className="bc-muted">기본 4개 언어는 항상 · 추가는 언어마다 요금</span></h3>
      {d.options.map((l) => (
        <label key={l} className="bc-check" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={on.has(l)} onChange={(e) => { const n = new Set(on); if (e.target.checked) n.add(l); else n.delete(l); setPicked(n); }} />
          <span><b>{d.labels[l] ?? l}</b> <span className="bc-muted">{l}</span></span>
        </label>
      ))}
      <div className="bc-row">
        <button className="bc-btn small primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(false)}>저장</button>
        {d.extra_langs.length > 0 && !dirty && d.missing_count > 0 && (
          <button className="bc-btn small" disabled={save.isPending || !d.ai_consent} title={d.ai_consent ? '' : '이 워크스페이스는 AI 분석이 꺼져 있어요'}
            onClick={async () => { if (await askConfirm(`기존 이미지 ${d.missing_count}장에 켠 언어의 설명을 만들까요? 이미지마다 AI 를 한 번 더 불러 비용이 들어요.`, { ok: '만들기' })) save.mutate(true); }}>
            기존 이미지 {d.missing_count}장에도 적용
          </button>
        )}
      </div>
      <p className="mb-0 bc-muted">켜면 새로 올리는 이미지부터 그 언어의 설명이 같이 만들어져요. 끄면 만든 설명은 남기고 내보내기만 멈춰요.</p>
    </section>
  );
}

export function AdminAccountPage() {
  const base = useAdminPath();
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: qk.adminAccount(id), queryFn: () => api.get<AdminAccountDetail>(`${base}/accounts/${id}`, { recent: 50 }), enabled: Boolean(base && id) });
  if (!base) return <p className="bc-muted">운영자만 볼 수 있어요.</p>;
  if (q.isLoading) return <p className="bc-muted">불러오는 중…</p>;
  if (!q.data) return <p className="bc-msg">워크스페이스가 없어요.</p>;
  const d = q.data;
  return (
    <>
      <div className="mt-0 bc-row"><Link className="bc-btn small" to="/admin">← 운영</Link></div>
      <h2 className="bc-h bc-sec">{d.account.name}</h2>
      <p className="bc-muted">가입 {fmtDateTime(d.account.created_at)} · 분석 작업(최근 50) {counts(d.jobs?.by_status, STATUS_LABEL)}</p>
      {d.jobs.recent_failed.length > 0 && <ul className="bc-plain">{d.jobs.recent_failed.map((f, i) => <li key={i}><span className="bc-muted">{fmtDateTime(f.at)}</span><div className="bc-mono">{f.error}</div></li>)}</ul>}
      <LangsBox base={base} id={id} />
      <h3 className="bc-h3 bc-sec">최근 이미지 {d.recent_assets?.length ?? 0}건 <span className="bc-badge gray">글만</span></h3>
      <table className="mt-8 bc-table">
        <thead><tr><th>올림</th><th>상태</th><th>공개 범위</th><th>크기</th><th>설명</th><th>키워드</th><th>출처</th></tr></thead>
        <tbody>{(d.recent_assets ?? []).map((a) => (
          <tr key={a.id} style={a.deleted ? { opacity: .5 } : undefined}>
            <td>{fmtDateTime(a.created_at)}</td>
            <td>{STATUS_LABEL[a.status] ?? a.status}{a.deleted ? ' · 휴지통' : ''}</td><td>{VIS_LABEL[a.visibility ?? 'private'] ?? a.visibility}</td>
            <td>{a.size ?? '—'}<div className="bc-muted">{a.bytes ? fmtMB(a.bytes) : ''}</div></td>
            <td style={{ maxWidth: 360 }}>{a.caption ?? <span className="bc-muted">(설명 없음)</span>}</td>
            <td className="bc-muted">{(a.keywords ?? []).join(' · ')}</td>
            <td className="bc-muted">{(a.sources ?? []).join('+')}</td>
          </tr>
        ))}</tbody>
      </table>
    </>
  );
}
