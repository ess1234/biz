/// 인쇄용 청구서 — 숫자 · 항목만. 창 인쇄로 PDF 저장 (사용량 · 청구 탭과 운영 화면이 같이 씀)
import { INVOICE_STATUS } from '../data/invoices';
import { type Invoice } from '../data/types';
import { fmtDate, krw } from '../lib/format';

export function InvoiceSheet({ inv, onClose, account }: { inv: Invoice; onClose: () => void; account?: string }) {
  return (
    <div className="bc-sheet-backdrop" onClick={onClose}>
      <div className="bc-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="bc-row" style={{ marginTop: 0, justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>청구서 {inv.period}</h3>
          <div className="bc-row bc-noprint" style={{ marginTop: 0 }}><button className="bc-btn small" onClick={() => window.print()}>인쇄 / PDF</button><button className="bc-btn small" onClick={onClose}>닫기</button></div>
        </div>
        <p className="bc-muted">{account ? `${account} · ` : ''}플랜 {inv.plan} · 발행 {fmtDate(inv.issued_at)}{inv.due_at ? ` · 입금 기한 ${fmtDate(inv.due_at)}` : ''} · {INVOICE_STATUS[inv.status]}{inv.paid_at ? ` (${fmtDate(inv.paid_at)})` : ''}</p>
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
