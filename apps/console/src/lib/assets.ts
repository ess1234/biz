/// 이미지 화면들이 함께 쓰는 것: 공개 범위 문구(BD-02-1) · 영구 주소 · 설명 상태.
import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, type Asset, type AssetSummary } from './api';
import { IMAGE_BASE, apiOrigin } from './env';

export const VIS: Record<string, { label: string; help: string }> = {
  site: { label: '사이트', help: '영구 주소로 이미지가 나가고, 설명은 등록한 사이트(사이트 키의 허용 출처)에서만 받아 가요' },
  public: { label: '공개', help: '이미지와 설명을 어디서나 받을 수 있어요 (사이트 키 없이도)' },
  private: { label: '비공개', help: '어디에도 나가지 않아요 — 영구 주소도 열리지 않아요' },
};
export const VIS_ORDER = ['site', 'public', 'private'] as const;

/// 영구 주소 호스트 — 빌드 변수(VITE_IMAGE_BASE, Cloudflare Worker)로만. 비면 API 호스트(dos 가 302)
export function imageOrigin(): string {
  return IMAGE_BASE || apiOrigin();
}
export const permanentUrl = (id: string, query = '') => `${imageOrigin()}/i/${id}${query}`;

/// 목록 배지용 설명 상태 — 상세의 "AI 생성 · 직접 고침"(DC-7)은 analyses 가 있어야 해서 상세에서만
export function descState(a: AssetSummary, aiOn: boolean): { label: string; tone: '' | 'gray' | 'warn' } {
  if (a.caption) return { label: '설명 있음', tone: '' };
  if (a.status === 'failed') return { label: '분석 실패', tone: 'warn' };
  if (aiOn && a.status !== 'analyzed') return { label: '분석 중', tone: 'gray' };
  return { label: '설명 없음', tone: 'gray' };
}

export function useAsset(id: string | undefined) {
  return useQuery({ queryKey: ['asset', id], queryFn: () => api.get<Asset>(`/assets/${id}`, { include: 'analyses' }), enabled: Boolean(id), staleTime: 10_000 });
}

/// 이미지 하나를 바꾼 뒤 — 상세와 목록(['assets', …]) 모두 다시 받기
export function invalidateAsset(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: ['asset', id] });
  qc.invalidateQueries({ queryKey: ['assets'] });
}
