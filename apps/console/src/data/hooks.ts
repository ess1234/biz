/// 화면 여러 곳이 같이 쓰는 조회 — 같은 queryKey 라 한 번만 부른다.
import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { qk } from './keys';
import { type Asset, type AssetSummary, type Page, type SiteKey, type UsageSummary, type WorkspaceSettings } from './types';

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api.get<WorkspaceSettings>('/settings') });
export const useUsage = () => useQuery({ queryKey: qk.usageMonth, queryFn: () => api.get<UsageSummary>('/usage'), staleTime: 5 * 60_000 });
export const useSiteKeys = () => useQuery({ queryKey: qk.siteKeys, queryFn: () => api.get<{ items: SiteKey[] }>('/site-keys') });
export const useRecent = (limit = 12) => useQuery({ queryKey: qk.recent(limit), queryFn: () => api.get<Page<AssetSummary>>('/assets', { limit, sort: 'uploaded' }) });

export function useAsset(id: string | undefined) {
  return useQuery({ queryKey: qk.asset(id), queryFn: () => api.get<Asset>(`/assets/${id}`, { include: 'analyses' }), enabled: Boolean(id), staleTime: 10_000 });
}

/// 이미지 하나를 바꾼 뒤 — 상세와 목록(['assets', …]) 모두 다시 받기
export function invalidateAsset(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: qk.asset(id) });
  qc.invalidateQueries({ queryKey: qk.assets });
}
