import type { ClientOptions } from './index.js';

export interface InjectOptions extends Omit<ClientOptions, 'cacheFile' | 'lang'> {
  /** 기본 언어. 페이지 <html lang> 이 지원 언어면 그걸 쓴다(langFromHtml) */
  lang?: string;
  /** 기본 true */
  langFromHtml?: boolean;
  /** 기본 true — <head> 에 ImageObject JSON-LD(data-imagemeta) */
  jsonld?: boolean;
  /** 사람이 쓴 alt 도 덮어씀 */
  force?: boolean;
  /** alt="" 도 빈칸으로 보고 채움 (Next <Image> 처럼 alt 가 필수인 사이트). 기본 false — alt="" 는 꾸밈 이미지일 수 있음 */
  fillEmpty?: boolean;
  /** 쓰지 않고 결과만 */
  dryRun?: boolean;
  /** 캐시 폴더(언어별 imagemeta.<lang>.json). 기본 .cache, null 이면 캐시 없음 */
  cacheDir?: string | null;
}

export interface InjectReport {
  pages: number; changedPages: number; altAdded: number; altSkipped: number;
  requests: number; fetched: number; cached: number; missing: number;
  langs: { lang: string; images: number }[];
  files: { file: string; lang: string; altAdded: number }[];
  dryRun: boolean;
}

export function htmlLang(html: string): string | null;
export function injectDir(dir: string, opts: InjectOptions): Promise<InjectReport>;
