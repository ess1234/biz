/// 사용량 지표 — 이름(biz-dev-08 5절 용어)과 숫자 표시. 홈 · 셸 한도 알림 · 사용량 탭이 같이 쓴다.
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
