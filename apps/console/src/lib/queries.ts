/// 화면 여러 곳이 같이 쓰는 조회 — 같은 queryKey 라 한 번만 부른다.
import { useQuery } from '@tanstack/react-query';

import { api, type AssetSummary, type Page } from './api';

export type Settings = {
  ai_consent_at: string | null; plan: string; delete_requested_at: string | null; delete_approved_at: string | null;
  delete_grace_days: number; delete_approval_required: boolean; analysis_lang: string; updated_at?: string;
};
export type UsageSummary = {
  from: string; to: string; totals: Record<string, number>; limits: Record<string, number | null>; plan: string;
  overage_policy: string; warnings?: string[]; edge_note?: string;
};
export type SiteKey = { id: string; key: string; label: string | null; allowed_origins: string[]; revoked_at: string | null; created_at: string };

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
export const useUsage = () => useQuery({ queryKey: ['usage', 'this-month'], queryFn: () => api.get<UsageSummary>('/usage'), staleTime: 5 * 60_000 });
export const useSiteKeys = () => useQuery({ queryKey: ['site-keys'], queryFn: () => api.get<{ items: SiteKey[] }>('/site-keys') });
export const useRecent = (limit = 12) => useQuery({ queryKey: ['assets', 'recent', limit], queryFn: () => api.get<Page<AssetSummary>>('/assets', { limit, sort: 'uploaded' }) });

/// 한도 지표 이름 — 화면 문구 (biz-dev-08 5절 용어)
export const METRIC_LABEL: Record<string, string> = {
  storage_bytes: '저장', egress_bytes: '전송', image_requests: '이미지 요청', meta_requests: '메타 요청', transforms: '변환', uploads: '업로드', analyses: 'AI 분석',
};
export function fmtMetric(metric: string, v: number): string {
  if (metric.endsWith('_bytes')) {
    if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(2)} GB`;
    if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} MB`;
    if (v >= 1024) return `${(v / 1024).toFixed(0)} KB`;
    return `${v} B`;
  }
  return v.toLocaleString();
}

/// 첫 로그인 화면을 이미 거쳤는지 — 워크스페이스별, 이 브라우저 기준(서버에 둘 만한 값이 아님)
const WELCOME_KEY = (accountId: string) => `biz:welcomed:${accountId}`;
export function welcomed(accountId: string): boolean { try { return localStorage.getItem(WELCOME_KEY(accountId)) === '1'; } catch { return true; } }
export function markWelcomed(accountId: string): void { try { localStorage.setItem(WELCOME_KEY(accountId), '1'); } catch { /* 저장 못 해도 진행 */ } }
