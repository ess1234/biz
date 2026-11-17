/// 이미지 영구 주소 (/i/{id}) — 상세의 '가져다 쓰기' · 연동 코드가 쓴다
import { IMAGE_BASE, apiOrigin } from './env';

/// 영구 주소 호스트 — 빌드 변수(VITE_IMAGE_BASE, Cloudflare Worker)로만. 비면 API 호스트(dos 가 302)
export function imageOrigin(): string {
  return IMAGE_BASE || apiOrigin();
}
export const permanentUrl = (id: string, query = '') => `${imageOrigin()}/i/${id}${query}`;
