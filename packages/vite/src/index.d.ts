import type { Plugin } from 'vite';
import type { ClientOptions } from '@imagemeta/core';

export interface ImagemetaViteOptions extends ClientOptions {
  /** 이미 alt 가 있는 <img> 도 덮어쓴다. 기본 false */
  force?: boolean;
  /** HTML <head> 에 ImageObject JSON-LD 삽입. 기본 true */
  jsonld?: boolean;
  /** 메타를 못 받으면 빌드 실패. 기본 false(경고만) */
  strict?: boolean;
  log?: (msg: string) => void;
}

export default function imagemeta(options?: ImagemetaViteOptions): Plugin;
