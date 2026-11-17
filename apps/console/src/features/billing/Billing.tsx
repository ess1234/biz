/// 4-6 사용량 · 청구 (biz-dev-08): 사용량 · 청구서 · 플랜을 탭으로.
/// 보이는 숫자 = 청구 기준(usage_daily). 결제는 수동(계좌이체 · 세금계산서) — 운영자가 입금을 확인하면 '결제 완료'.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { INVOICE_STATUS } from '../../data/invoices';
import { qk } from '../../data/keys';
import { type Invoice, type PlanInfo, type UsageByDay } from '../../data/types';
import { METRIC_LABEL, fmtMetric } from '../../data/usage';
import { api } from '../../lib/api';
import { krw } from '../../lib/format';
import { InvoiceSheet } from '../../ui/InvoiceSheet';
import { PageHead, Tabs } from '../../ui/common';


const METRICS = ['storage_bytes', 'egress_bytes', 'image_requests', 'meta_requests', 'transforms', 'uploads', 'analyses'];
const TABS = [['usage', '사용량'], ['invoices', '청구서'], ['plan', '플랜']] as const;

function monthRange(offset: number) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset);
  const y = d.getFullYear(), m = d.getMonth();
  const last = offset === 0 ? new Date() : new Date(y, m + 1, 0);
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: f(new Date(y, m, 1)), to: f(last), label: `${y}년 ${m + 1}월` };
}

export function BillingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') || 'usage') as (typeof TABS)[number][0];
  return (
    <>
      <PageHead title="사용량 · 청구" sub="이번 달 사용량과 한도, 청구서, 요금제예요. 전송 · 요청 수치는 전날까지 집계돼요." />
      <Tabs items={TABS} value={tab} onChange={(k) => setParams(k === 'usage' ? {} : { tab: k }, { replace: true })} />
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
  const q = useQuery({ queryKey: qk.usageRange(range.from, range.to), queryFn: () => api.get<UsageByDay>('/usage', { from: range.from, to: range.to }) });
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
        {u && <span className="bc-badge gray">플랜 {u.plan_label ?? u.plan} · 넘으면 {u.overage_policy === 'block' ? '막힘' : '초과분 청구'}</span>}
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
  const plan = useQuery({ queryKey: qk.plan, queryFn: () => api.get<PlanInfo>('/plan') });
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
  const inv = useQuery({ queryKey: qk.invoices, queryFn: () => api.get<{ items: Invoice[] }>('/invoices') });
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
