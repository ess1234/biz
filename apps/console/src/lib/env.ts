/// B2B 콘솔 빌드 변수 — 브라우저에 들어가는 공개 값뿐. 제품명 · 호스트는 코드에 박지 않는다(biz-dev-08 5절, DA-3).
export const BRAND = String(import.meta.env.VITE_BRAND || '〈서비스〉');
export const API_BASE = String(import.meta.env.VITE_API_BASE || '/t23/v1').replace(/\/$/, '');
export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '');
export const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
/// 이미지 영구 주소(/i/{id}) 호스트 — Cloudflare Worker. 비우면 API 호스트(dos 가 302)
export const IMAGE_BASE = String(import.meta.env.VITE_IMAGE_BASE || '').replace(/\/$/, '');
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
