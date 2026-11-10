/// 썸네일 서명 URL (sai 콘솔에서 복사): 보이는 셀의 id 를 모아 200ms 디바운스 → POST /files:batch, 메모리 캐시 50분, 만료·실패는 그 id 만 재발급.
import { useEffect, useState } from 'react';

import { api, type FileUrl } from './api';

type Variant = 'thumb256' | 'thumb1024' | 'original' | 'tagged';
const TTL_MS = 50 * 60 * 1000;
const cache = new Map<string, { url: string; at: number }>();
const pending = new Map<Variant, Set<string>>();
const waiters = new Map<string, Set<(url: string | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function key(v: Variant, id: string) { return `${v}:${id}`; }

async function flush() {
  timer = null;
  for (const [variant, ids] of pending) {
    pending.delete(variant);
    const list = [...ids];
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200);
      let items: FileUrl[] = [];
      try { items = (await api.post<{ items: FileUrl[] }>('/files:batch', { asset_ids: chunk, variant })).items; } catch { items = []; }
      const got = new Map(items.map((it) => [it.asset_id, it.url ?? null]));
      for (const id of chunk) {
        const url = got.get(id) ?? null;
        if (url) cache.set(key(variant, id), { url, at: Date.now() });
        const k = key(variant, id);
        for (const w of waiters.get(k) ?? []) w(url);
        waiters.delete(k);
      }
    }
  }
}

export function fileUrl(variant: Variant, id: string): Promise<string | null> {
  const k = key(variant, id);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    if (!waiters.has(k)) waiters.set(k, new Set());
    waiters.get(k)!.add(resolve);
    if (!pending.has(variant)) pending.set(variant, new Set());
    pending.get(variant)!.add(id);
    if (!timer) timer = setTimeout(flush, 200);
  });
}

export function invalidateFileUrl(variant: Variant, id: string) { cache.delete(key(variant, id)); }

export function useFileUrl(variant: Variant, id: string | null | undefined, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? cache.get(key(variant, id))?.url ?? null : null));
  useEffect(() => {
    if (!id || !enabled) return;
    let alive = true;
    fileUrl(variant, id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [variant, id, enabled]);
  return url;
}
