/// 공통 화면 조각 (11-16 디자인 A): 페이지 머리 · 빈 화면. 아이콘은 lucide-react 를 .bc-ico 크기로.
import type { ReactNode } from 'react';

export { ArrowRight, BarChart3, Check, ChevronDown, Copy, ExternalLink, Image as ImageIcon, KeyRound, LayoutGrid, LogOut, Plug, Search, Settings, Shield, Upload, UserRound } from 'lucide-react';

/** 화면 맨 위: 제목 · 한 줄 설명 · 오른쪽 주 버튼(화면당 primary 하나). */
export function PageHead({ title, sub, badge, actions }: { title: ReactNode; sub?: ReactNode; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="bc-pagehead">
      <div className="txt">
        <h1>{title}{badge}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="act">{actions}</div>}
    </div>
  );
}

/** 비어 있을 때: 무엇을 하면 되는지 한 줄 + 행동 버튼. */
export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="bc-empty">
      <b>{title}</b>
      {body && <div>{body}</div>}
      {action && <div className="bc-row" style={{ justifyContent: 'center' }}>{action}</div>}
    </div>
  );
}

/** 탭 바(.bc-tabs) — 고른 탭은 .on · aria-selected. 주소 반영 등은 onChange 쪽 몫. */
export function Tabs<K extends string>({ items, value, onChange, disabled }: { items: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void; disabled?: (k: K) => boolean }) {
  return (
    <div className="bc-tabs" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} disabled={disabled?.(k)} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
