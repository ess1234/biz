/// 화면 표시 형식 — 날짜 · 용량 · 금액. 비어 있으면 '—'.
type When = string | null | undefined;

/** 날짜만 (2026. 11. 16.) */
export const fmtDate = (s: When) => (s ? new Date(s).toLocaleDateString('ko-KR') : '—');
/** 날짜 + 시각 */
export const fmtDateTime = (s: When) => (s ? new Date(s).toLocaleString('ko-KR') : '—');
/** 바이트 → 12.3MB */
export const fmtMB = (b: number | null | undefined) => `${((b ?? 0) / 1048576).toFixed(1)}MB`;
/** 12,300원 */
export const krw = (v: number) => `${Math.round(v).toLocaleString()}원`;
