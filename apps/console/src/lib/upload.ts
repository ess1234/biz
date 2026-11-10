/// 업로드 엔진 (sai 콘솔 Upload.tsx 에서 화면을 떼고 복사, DA-2): sha256(브라우저) → assets:batch → uploads:batch → PUT(서명 URL) → complete-batch.
/// 파일 바이트는 dos 를 거치지 않는다. B2B 는 위치(GPS)를 서버에 보내지 않는다 — 제품 이미지에 필요 없고, 공개 사본에서도 지운다(L-7).
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, webDeviceId } from './api';

export type UploadItem = { key: number; file: File; status: 'wait' | 'hash' | 'register' | 'upload' | 'complete' | 'done' | 'dup' | 'error'; assetId?: string; error?: string; progress?: number };

export const UPLOAD_LABEL: Record<UploadItem['status'], string> = { wait: '대기', hash: '확인 중', register: '등록', upload: '올리는 중', complete: '마무리', done: '완료', dup: '이미 있음', error: '실패' };
const ACCEPT = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
export const isImageFile = (f: File) => ACCEPT.includes(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);

async function sha256Hex(file: File): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function putWithProgress(url: string, file: File, headers: Record<string, string>, token: string | undefined, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('네트워크 오류'));
    xhr.send(file);
  });
}

let seq = 0;

export function useUploader() {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;
  const update = (key: number, patch: Partial<UploadItem>) => setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const add = useCallback((files: FileList | File[]): number => {
    const list = [...files].filter(isImageFile);
    if (list.length) setItems((cur) => [...cur, ...list.map((file) => ({ key: ++seq, file, status: 'wait' as const }))]);
    return list.length;
  }, []);

  const clearFinished = () => setItems((c) => c.filter((it) => it.status !== 'done' && it.status !== 'dup'));

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const pending = itemsRef.current.filter((it) => it.status === 'wait' || it.status === 'error');
      for (let b = 0; b < pending.length; b += 20) {
        const batch = pending.slice(b, b + 20);
        const regs: { key: number; body: Record<string, unknown> }[] = [];
        for (const it of batch) {
          update(it.key, { status: 'hash', error: undefined });
          try {
            const sha = await sha256Hex(it.file);
            regs.push({ key: it.key, body: { local_id: `web:${webDeviceId()}:${sha.slice(0, 16)}`, sha256: sha, mime: it.file.type || 'image/jpeg', bytes: it.file.size, file_name: it.file.name,
              taken_at: it.file.lastModified ? new Date(it.file.lastModified).toISOString() : undefined } });
          } catch (e: any) { update(it.key, { status: 'error', error: `파일 읽기: ${e.message}` }); }
        }
        if (!regs.length) continue;
        regs.forEach(({ key }) => update(key, { status: 'register' }));
        let res: { items: { local_id: string; asset_id?: string; upload_required?: boolean; error?: { message: string } }[] };
        try { res = await api.post('/assets:batch', { items: regs.map((r) => r.body) }); }
        catch (e: any) { regs.forEach(({ key }) => update(key, { status: 'error', error: `등록: ${e.message}` })); continue; }
        const toUpload: { key: number; assetId: string; file: File }[] = [];
        for (const r of res.items) {
          const reg = regs.find((x) => x.body.local_id === r.local_id);
          if (!reg) continue;
          if (r.error || !r.asset_id) { update(reg.key, { status: 'error', error: r.error?.message ?? '등록 실패' }); continue; }
          if (r.upload_required === false) { update(reg.key, { status: 'dup', assetId: r.asset_id }); continue; }
          update(reg.key, { assetId: r.asset_id });
          toUpload.push({ key: reg.key, assetId: r.asset_id, file: batch.find((x) => x.key === reg.key)!.file });
        }
        if (!toUpload.length) continue;
        let urls: { items: { asset_id: string; url?: string; headers?: Record<string, string>; token?: string }[] };
        try { urls = await api.post('/uploads:batch', { asset_ids: toUpload.map((t) => t.assetId) }); }
        catch (e: any) { toUpload.forEach(({ key }) => update(key, { status: 'error', error: `주소: ${e.message}` })); continue; }
        const completed: string[] = [];
        for (const t of toUpload) {
          const u = urls.items.find((x) => x.asset_id === t.assetId);
          if (!u?.url) { update(t.key, { status: 'error', error: '올릴 주소가 없어요' }); continue; }
          update(t.key, { status: 'upload', progress: 0 });
          try {
            await putWithProgress(u.url, t.file, u.headers ?? {}, u.token, (p) => update(t.key, { progress: p }));
            update(t.key, { status: 'complete' });
            completed.push(t.assetId);
          } catch (e: any) { update(t.key, { status: 'error', error: e.message }); }
        }
        if (!completed.length) continue;
        try {
          const done: { items: { id: string; ok: boolean; error?: { code: string; message: string } }[] } = await api.post('/uploads:complete-batch', { asset_ids: completed });
          for (const d of done.items) {
            const t = toUpload.find((x) => x.assetId === d.id);
            if (t) update(t.key, d.ok ? { status: 'done' } : { status: 'error', error: d.error?.message ?? d.error?.code });
          }
        } catch (e: any) { toUpload.filter((t) => completed.includes(t.assetId)).forEach(({ key }) => update(key, { status: 'error', error: `마무리: ${e.message}` })); }
      }
      qc.invalidateQueries({ queryKey: ['assets'] });
    } finally { setRunning(false); }
  }

  return { items, running, add, run, clearFinished };
}
