/// 4-6 사용량 · 청구 (biz-dev-08): 사용량 · 청구서 · 플랜을 탭으로. sai 콘솔 Usage.tsx · Billing.tsx 에서 옮김.
/// 보이는 숫자 = 청구 기준(usage_daily). 결제는 수동(계좌이체 · 세금계산서) — 운영자가 입금을 확인하면 '결제 완료'.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { api } from '../lib/api';
import { METRIC_LABEL, fmtMetric } from '../lib/queries';

type UsageResp = { from: string; to: string; days: { day: string; metrics: Record<string, number> }[]; totals: Record<string, number>; plan: string; limits: Record<string, number | null>; overage_policy: string; warnings?: string[]; edge_note?: string };
type Plan = { plan: string; label: string; overage_policy: string; limits: Record<string, number | null>; prices: { base_krw: number; storage_krw_per_gb: number; egress_krw_per_gb: number };
  month: { from: string; to: string; totals: Record<string, number>; warnings: string[] }; billing_note: string };
type Line = { kind: string; label: string; qty: number; unit: string; unit_krw: number; amount_krw: number };
export type Invoice = { id: string; period: string; plan: string; currency: string; lines: Line[]; usage: Record<string, number>; subtotal_krw: number; vat_krw: number; total_krw: number;
  status: 'draft' | 'issued' | 'paid' | 'void'; issued_at: string; due_at: string | null; paid_at: string | null; note: string | null };

export const krw = (v: number) => `${Math.round(v).toLocaleString()}원`;
export const INVOICE_STATUS: Record<Invoice['status'], string> = { draft: '초안', issued: '발행 — 입금 대기', paid: '결제 완료', void: '취소' };
const METRICS = ['storage_bytes', 'egress_bytes', 'image_requests', 'meta_requests', 'transforms', 'uploads', 'analyses'];
const TABS: [string, string][] = [['usage', '사용량'], ['invoices', '청구서'], ['plan', '플랜']];
const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('ko-KR') : '—');

function monthRange(offset: number) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset);
  const y = d.getFullYear(), m = d.getMonth();
  const last = offset === 0 ? new Date() : new Date(y, m + 1, 0);
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: f(new Date(y, m, 1)), to: f(last), label: `${y}년 ${m + 1}월` };
}

export function BillingPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'usage';
  return (
    <>
      <h2 className="bc-h">사용량 · 청구</h2>
      <div className="bc-tabs bc-sec" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'usage' ? {} : { tab: k }, { replace: true })}>{label}</button>)}
      </div>
      <div className="bc-sec">{tab === 'invoices' ? <InvoicesTab /> : tab === 'plan' ? <PlanTab /> : <UsageTab />}</div>
    </>
  );
}

function Meter({ metric, used, limit, warn }: { metric: string; used: number; limit: number | null | undefined; warn?: boolean }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div className="bc-box">
      <div className="bc-muted">{METRIC_LABEL[metric] ?? metric}</div>
      <div className="bc-big">{fmtMetric(metric, used)}</div>
      {limit ? (
        <div className={`bc-meter${pct! >= 100 ? ' over' : warn || pct! >= 80 ? ' warn' : ''}`} style={{ marginTop: 6 }}>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="bc-muted" style={{ fontSize: 12, marginTop: 4 }}>한도 {fmtMetric(metric, limit)} · {pct}%</div>
        </div>
      ) : <div className="bc-muted" style={{ fontSize: 12 }}>한도 없음</div>}
    </div>
  );
}

function UsageTab() {
  const [offset, setOffset] = useState(0);
  const range = useMemo(() => monthRange(offset), [offset]);
  const q = useQuery({ queryKey: ['usage', range.from, range.to], queryFn: () => api.get<UsageResp>('/usage', { from: range.from, to: range.to }) });
  const [pick, setPick] = useState('image_requests');
  const u = q.data;
  const max = Math.max(1, ...(u?.days ?? []).map((d) => d.metrics[pick] ?? 0));
  return (
    <>
      <p className="bc-muted" style={{ marginTop: 0 }}>여기 보이는 숫자가 청구 기준이에요. {u?.edge_note ?? '전송 · 이미지 요청 · 변환은 전날까지 집계돼요.'}</p>
      <div className="bc-row" style={{ marginTop: 0 }}>
        <button className="bc-btn small" onClick={() => setOffset((o) => o + 1)}>◀ 이전 달</button>
        <b>{range.label}</b>
        <button className="bc-btn small" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))}>다음 달 ▶</button>
        {u && <span className="bc-badge gray">플랜 {u.plan} · 넘으면 {u.overage_policy === 'block' ? '막힘' : '초과분 청구'}</span>}
      </div>
      {q.isLoading && <p className="bc-muted">불러오는 중…</p>}
      {q.isError && <p className="bc-msg">사용량을 불러오지 못했어요.</p>}
      {u && (
        <>
          <div className="bc-cards bc-sec">{METRICS.map((m) => <Meter key={m} metric={m} used={u.totals[m] ?? 0} limit={u.limits[m]} warn={u.warnings?.includes(m)} />)}</div>
          <h3 className="bc-sec" style={{ fontSize: 15 }}>일별 <select className="bc-select" value={pick} onChange={(e) => setPick(e.target.value)}>{METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}</select></h3>
          {u.days.length === 0 ? <p className="bc-muted">이 달에는 기록이 없어요.</p> : (
            <table className="bc-table bc-days"><tbody>
              {u.days.map((d) => { const v = d.metrics[pick] ?? 0; return (
                <tr key={d.day}><td className="bc-muted" style={{ width: 64 }}>{d.day.slice(5)}</td><td><div className="bar"><i style={{ width: `${Math.round((v / max) * 100)}%` }} /></div></td><td style={{ width: 110, textAlign: 'right' }}>{fmtMetric(pick, v)}</td></tr>
              ); })}
            </tbody></table>
          )}
        </>
      )}
    </>
  );
}

function PlanTab() {
  const plan = useQuery({ queryKey: ['plan'], queryFn: () => api.get<Plan>('/plan') });
  const p = plan.data;
  if (plan.isLoading) return <p className="bc-muted">불러오는 중…</p>;
  if (!p) return <p className="bc-msg">플랜을 불러오지 못했어요.</p>;
  return (
    <>
      <div className="bc-box">
        <div className="bc-muted">지금 플랜</div>
        <div className="bc-big">{p.label} <span className="bc-badge gray">{p.overage_policy === 'block' ? '넘으면 막힘' : '초과분 청구'}</span></div>
        <dl className="bc-kv" style={{ marginTop: 12 }}>
          <dt>기본료</dt><dd>{krw(p.prices.base_krw)} / 월 (부가세 별도)</dd>
          <dt>저장 초과</dt><dd>{krw(p.prices.storage_krw_per_gb)} / GB</dd>
          <dt>전송 초과</dt><dd>{krw(p.prices.egress_krw_per_gb)} / GB</dd>
        </dl>
        <p className="bc-muted" style={{ marginBottom: 0 }}>{p.billing_note}</p>
      </div>
      <h3 className="bc-sec" style={{ fontSize: 15 }}>이번 달 한도</h3>
      <div className="bc-cards">{(['storage_bytes', 'egress_bytes', 'transforms', 'analyses'] as const).map((m) => <Meter key={m} metric={m} used={p.month.totals[m] ?? 0} limit={p.limits[m]} warn={p.month.warnings.includes(m)} />)}</div>
      <p className="bc-muted bc-sec">플랜을 바꾸려면 담당자에게 요청해 주세요. 바꾼 플랜은 다음 청구서부터 적용돼요.</p>
    </>
  );
}

function InvoicesTab() {
  const inv = useQuery({ queryKey: ['invoices'], queryFn: () => api.get<{ items: Invoice[] }>('/invoices') });
  const [open, setOpen] = useState<Invoice | null>(null);
  return (
    <>
      <p className="bc-muted" style={{ marginTop: 0 }}>매월 1일에 전월 청구서가 만들어져요. 결제는 계좌이체 · 세금계산서로 하고, 입금이 확인되면 '결제 완료'로 바뀌어요.</p>
      {inv.isLoading && <p className="bc-muted">불러오는 중…</p>}
      {inv.data && inv.data.items.length === 0 && <p className="bc-muted">아직 청구서가 없어요.</p>}
      {inv.data && inv.data.items.length > 0 && (
        <table className="bc-table">
          <thead><tr><th>기간</th><th>플랜</th><th>저장(월말)</th><th>전송</th><th style={{ textAlign: 'right' }}>합계(부가세 포함)</th><th>상태</th><th /></tr></thead>
          <tbody>{inv.data.items.map((i) => (
            <tr key={i.id}><td>{i.period}</td><td>{i.plan}</td><td>{i.usage?.storage_gb?.toFixed?.(2) ?? '—'} GB</td><td>{i.usage?.egress_gb?.toFixed?.(2) ?? '—'} GB</td>
              <td style={{ textAlign: 'right' }}>{krw(i.total_krw)}</td>
              <td><span className={`bc-badge${i.status === 'paid' ? '' : i.status === 'issued' ? ' warn' : ' gray'}`}>{INVOICE_STATUS[i.status]}</span></td>
              <td><button className="bc-btn small" onClick={() => setOpen(i)}>보기</button></td></tr>
          ))}</tbody>
        </table>
      )}
      {open && <InvoiceSheet inv={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/// 인쇄용 청구서 — 숫자 · 항목만. 창 인쇄로 PDF 저장 (운영 탭도 같이 씀)
export function InvoiceSheet({ inv, onClose, account }: { inv: Invoice; onClose: () => void; account?: string }) {
  return (
    <div className="bc-sheet-backdrop" onClick={onClose}>
      <div className="bc-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="bc-row" style={{ marginTop: 0, justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>청구서 {inv.period}</h3>
          <div className="bc-row bc-noprint" style={{ marginTop: 0 }}><button className="bc-btn small" onClick={() => window.print()}>인쇄 / PDF</button><button className="bc-btn small" onClick={onClose}>닫기</button></div>
        </div>
        <p className="bc-muted">{account ? `${account} · ` : ''}플랜 {inv.plan} · 발행 {day(inv.issued_at)}{inv.due_at ? ` · 입금 기한 ${day(inv.due_at)}` : ''} · {INVOICE_STATUS[inv.status]}{inv.paid_at ? ` (${day(inv.paid_at)})` : ''}</p>
        <table className="bc-table">
          <thead><tr><th>항목</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>금액</th></tr></thead>
          <tbody>
            {inv.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td style={{ textAlign: 'right' }}>{l.qty} {l.unit}</td><td style={{ textAlign: 'right' }}>{krw(l.unit_krw)}</td><td style={{ textAlign: 'right' }}>{krw(l.amount_krw)}</td></tr>)}
            <tr><td colSpan={3} style={{ textAlign: 'right' }}>공급가액</td><td style={{ textAlign: 'right' }}>{krw(inv.subtotal_krw)}</td></tr>
            <tr><td colSpan={3} style={{ textAlign: 'right' }}>부가세 10%</td><td style={{ textAlign: 'right' }}>{krw(inv.vat_krw)}</td></tr>
            <tr style={{ fontWeight: 700 }}><td colSpan={3} style={{ textAlign: 'right' }}>합계</td><td style={{ textAlign: 'right' }}>{krw(inv.total_krw)}</td></tr>
          </tbody>
        </table>
        <p className="bc-muted" style={{ fontSize: 12 }}>그 달 사용량: 저장 {inv.usage?.storage_gb} GB(월말) · 전송 {inv.usage?.egress_gb} GB · 변환 {inv.usage?.transforms?.toLocaleString?.()} · 분석 {inv.usage?.analyses?.toLocaleString?.()} · 업로드 {inv.usage?.uploads}{inv.note ? ` · 메모: ${inv.note}` : ''}</p>
      </div>
    </div>
  );
}
