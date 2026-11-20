/// 이미지 화면들이 함께 쓰는 문구: 공개 범위(BD-02-1) · 설명 상태.
import { type AssetSummary } from './types';

export const VIS: Record<string, { label: string; help: string }> = {
  site: { label: '사이트', help: '영구 주소로 이미지가 나가고, 설명은 등록한 사이트(사이트 키의 허용 출처)에서만 받아 가요' },
  public: { label: '공개', help: '이미지와 설명을 어디서나 받을 수 있어요 (사이트 키 없이도)' },
  private: { label: '비공개', help: '어디에도 나가지 않아요 — 영구 주소도 열리지 않아요' },
};
export const VIS_ORDER = ['site', 'public', 'private'] as const;

/// 설명 언어 — 서버 설정(langs · lang_labels)이 오기 전이나 옛 배포일 때 쓰는 기본 4개. 추가 언어는 서버가 알려 준다(biz-dev-10)
export const BASE_LANGS = ['ko', 'en', 'ja', 'zh'];
export const BASE_LANG_LABELS: Record<string, string> = { ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文' };

/// 목록 배지용 설명 상태 — 상세의 "AI 생성 · 직접 고침"(DC-7)은 analyses 가 있어야 해서 상세에서만
export function descState(a: AssetSummary, aiOn: boolean): { label: string; tone: '' | 'gray' | 'warn' } {
  if (a.caption) return { label: '설명 있음', tone: '' };
  if (a.status === 'failed') return { label: '분석 실패', tone: 'warn' };
  if (aiOn && a.status !== 'analyzed') return { label: '분석 중', tone: 'gray' };
  return { label: '설명 없음', tone: 'gray' };
}

