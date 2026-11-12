export interface Meta {
  id: string;
  rev: number;
  visibility: 'site' | 'public';
  alt: string | null;
  captions: Record<string, string>;
  keywords: string[];
  width: number | null;
  height: number | null;
  src: string;
  jsonld?: Record<string, unknown>;
}

export interface ClientOptions {
  /** 메타 API 기준, 예: https://<dos>/t23/v1 */
  apiBase: string;
  /** API 키(assets:read). 서버·빌드 전용 — 사이트 키 아님. 없으면 public 이미지만 */
  apiKey?: string;
  /** 기본 'ko' */
  lang?: string;
  /** 디스크 캐시 파일. 기본 .cache/imagemeta.json, null 이면 캐시 없음 */
  cacheFile?: string | null;
  /** 캐시 TTL(초). 기본 3600 */
  cacheTtlSeconds?: number;
  /** /i 주소를 이 호스트들로 한정(없으면 모든 /i/{uuid}) */
  imageHosts?: string[];
  fetch?: typeof fetch;
}

export interface ClientStats { requests: number; fetched: number; cached: number; missing: number }

export interface Client {
  fetchMany(ids: string[]): Promise<Map<string, Meta | null>>;
  extractIds(text: string): string[];
  readonly stats: ClientStats;
  readonly lang: string;
}

export const ID_RE: RegExp;
export function extractIds(text: string, imageHosts?: string[]): string[];
export function createClient(opts: ClientOptions): Client;
export function injectAlt(code: string, metas: Map<string, Meta | null>, opts?: { force?: boolean; fillEmpty?: boolean; imageHosts?: string[]; attr?: string }): { code: string; changed: number; skipped: number };
export function jsonLdScript(metas: Map<string, Meta | null>): string;
