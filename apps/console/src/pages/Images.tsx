/// 4-3 이미지 목록 (biz-dev-08, DC-2): 업로드(버튼 + 끌어다 놓기) · 검색 · 공개 범위 · 휴지통이 한 화면에. 기본 정렬은 올린 순(BD-06-2).
/// 썸네일마다 공개 범위(파랑 사이트 · 초록 공개 · 회색 비공개)와 설명 상태. 여러 장을 고르면 작업 바.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { api, type AssetSummary, type Page } from '../lib/api';
import { VIS, VIS_ORDER, descState } from '../lib/assets';
import { useSettings } from '../lib/queries';
import { useFileUrl } from '../lib/thumbs';
import { toast } from '../lib/toast';
import { UPLOAD_LABEL, useUploader } from '../lib/upload';

const PAGE = 120;
type Filter = 'all' | 'site' | 'public' | 'private' | 'trash';
const FILTERS: [Filter, string][] = [['all', '전체'], ['site', '사이트'], ['public', '공개'], ['private', '비공개'], ['trash', '휴지통']];

function Cell({ a, selected, aiOn, onOpen, onToggle }: { a: AssetSummary; selected: boolean; aiOn: boolean; onOpen: () => void; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  const url = useFileUrl('thumb256', a.has_thumb ? a.id : null, visible);
  const d = descState(a, aiOn);
  return (
    <div ref={ref} className={`bc-cell${selected ? ' selected' : ''}`} role="button" tabIndex={0} title={a.caption ?? a.file_name ?? ''}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); if (e.key === ' ') { e.preventDefault(); onToggle(); } }}>
      <div className="img">{url && <img src={url} alt={a.caption ?? ''} loading="lazy" decoding="async" />}
        <span className="chk" role="checkbox" aria-checked={selected} aria-label="선택" onClick={(e) => { e.stopPropagation(); onToggle(); }} />
        <span className={`vis ${a.visibility}`}>{VIS[a.visibility]?.label ?? a.visibility}</span>
      </div>
      <div className="meta"><span className="name">{a.file_name ?? a.id.slice(0, 8)}</span><span className={`bc-badge${d.tone ? ` ${d.tone}` : ''}`}>{d.label}</span></div>
    </div>
  );
}

export function ImagesPage() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('f') as Filter) || 'all';
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const nav = useNavigate();
  const qc = useQueryClient();
  const settings = useSettings();
  const aiOn = Boolean(settings.data?.ai_consent_at);
  const up = useUploader();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [filter, q]);

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p, { replace: true });
  };

  const list = useInfiniteQuery({
    queryKey: ['assets', 'biz-list', filter],
    queryFn: ({ pageParam }) => api.get<Page<AssetSummary>>('/assets', {
      limit: PAGE, cursor: pageParam as string | undefined, sort: 'uploaded',
      trash: filter === 'trash' ? true : undefined, visibility: filter !== 'all' && filter !== 'trash' ? filter : undefined,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled: !q,
    staleTime: 30_000,
  });
  const search = useQuery({
    queryKey: ['assets', 'biz-search', q],
    queryFn: () => api.get<{ items: AssetSummary[]; total: number }>('/search', { q, limit: 200 }),
    enabled: Boolean(q),
  });
  const rows: AssetSummary[] = useMemo(() => {
    if (q) {
      const items = search.data?.items ?? [];
      return filter === 'all' || filter === 'trash' ? items : items.filter((a) => a.visibility === filter);
    }
    return list.data?.pages.flatMap((p) => p.items) ?? [];
  }, [q, search.data, list.data, filter]);
  const loading = q ? search.isLoading : list.isLoading;
  const ids = rows.map((a) => a.id);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['assets'] }); setSelected(new Set()); };
  const vis = useMutation({
    mutationFn: (v: string) => api.post<{ items: { id: string; ok: boolean; error?: { message: string } }[] }>('/assets:batch-visibility', { ids: [...selected], visibility: v }),
    onSuccess: (r, v) => { const bad = r.items.filter((x) => !x.ok).length; toast(bad ? `${r.items.length - bad}장 바꿈 · ${bad}장 실패` : `${r.items.length}장을 ${VIS[v]?.label} 로 바꿨어요`); refresh(); },
    onError: (e: any) => toast(e.message),
  });
  const trash = useMutation({
    mutationFn: () => api.post<{ items: { ok: boolean }[] }>('/assets:batch-delete', { ids: [...selected] }),
    onSuccess: (r) => { toast(`${r.items.filter((x) => x.ok).length}장을 휴지통으로 옮겼어요 — 영구 주소도 멈춰요`); refresh(); },
    onError: (e: any) => toast(e.message),
  });
  const restore = useMutation({
    mutationFn: async () => { for (const id of selected) await api.post(`/assets/${id}:restore`); },
    onSuccess: () => { toast('되돌렸어요'); refresh(); },
    onError: (e: any) => toast(e.message),
  });

  const addFiles = (files: FileList | File[]) => {
    const n = up.add(files);
    if (!n) toast('이미지 파일(JPEG · PNG · HEIC · WebP)만 올릴 수 있어요');
  };
  // 고르거나 놓으면 바로 올린다 — 실패한 것만 "다시 시도"로 (대기 상태만 자동이라 실패가 되풀이되지 않음)
  useEffect(() => { if (!up.running && up.items.some((i) => i.status === 'wait')) up.run(); }, [up.items, up.running]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingUploads = up.items.filter((i) => i.status === 'error').length;
  const counts = up.items.reduce((m, it) => ((m[it.status] = (m[it.status] ?? 0) + 1), m), {} as Record<string, number>);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      className={dragging ? 'bc-dropping' : undefined}
    >
      <div className="bc-row" style={{ marginTop: 0, justifyContent: 'space-between' }}>
        <h2 className="bc-h" style={{ margin: 0 }}>이미지</h2>
        <button className="bc-btn primary" onClick={() => fileRef.current?.click()}>이미지 올리기</button>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,.heic,.heif" style={{ display: 'none' }} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      <p className="bc-muted">끌어다 놓아도 올라가요. 같은 파일은 다시 올리지 않아요. {aiOn ? '올린 뒤 몇십 초 안에 4개 언어 설명이 붙어요.' : 'AI 분석이 꺼져 있어서 설명이 생기지 않아요 — 설정에서 켜요.'}</p>

      {up.items.length > 0 && (
        <div className="bc-box bc-sec" style={{ marginTop: 12 }}>
          <div className="bc-row" style={{ marginTop: 0 }}>
            <b>올리기 {up.items.length}개</b>
            <span className="bc-muted">완료 {counts.done ?? 0} · 이미 있음 {counts.dup ?? 0} · 실패 {counts.error ?? 0}</span>
            <span className="bc-spacer" />
            <button className="bc-btn small" disabled={up.running} onClick={up.clearFinished}>끝난 것 지우기</button>
            <button className="bc-btn small primary" disabled={up.running || !pendingUploads} onClick={up.run}>{up.running ? '올리는 중…' : `실패 ${pendingUploads}개 다시 시도`}</button>
          </div>
          <ul className="bc-uplist">
            {up.items.map((it) => (
              <li key={it.key}>
                <span className="name">{it.file.name}</span>
                <span className="bc-muted">{(it.file.size / 1048576).toFixed(1)}MB</span>
                {it.status === 'upload' && <progress value={it.progress ?? 0} max={1} />}
                {it.error && <span className="bc-msg" style={{ margin: 0 }}>{it.error}</span>}
                <span className={`bc-badge${it.status === 'error' ? ' warn' : it.status === 'done' || it.status === 'dup' ? '' : ' gray'}`}>{UPLOAD_LABEL[it.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bc-toolbar">
        <form onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() || null }); }} className="bc-search">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="설명 · 키워드 · 이미지 속 글자로 찾기" aria-label="검색" />
          {q && <button type="button" className="bc-btn small" onClick={() => set({ q: null })}>지우기</button>}
        </form>
        <div className="bc-tabs" role="tablist">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} disabled={Boolean(q) && k === 'trash'} onClick={() => set({ f: k === 'all' ? null : k })}>{label}</button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bc-actionbar">
          <b>{selected.size}장 선택</b>
          {filter === 'trash' ? (
            <button className="bc-btn small" disabled={restore.isPending} onClick={() => restore.mutate()}>되돌리기</button>
          ) : (
            <>
              <span className="bc-muted">공개 범위</span>
              {VIS_ORDER.map((v) => <button key={v} className="bc-btn small" title={VIS[v].help} disabled={vis.isPending} onClick={() => vis.mutate(v)}>{VIS[v].label}</button>)}
              <button className="bc-btn small danger" disabled={trash.isPending} onClick={() => trash.mutate()}>휴지통으로</button>
            </>
          )}
          <span className="bc-spacer" />
          <button className="bc-btn small" onClick={() => setSelected(new Set(ids))}>모두 선택</button>
          <button className="bc-btn small" onClick={() => setSelected(new Set())}>선택 해제</button>
        </div>
      )}

      {filter === 'trash' && !q && <p className="bc-muted">휴지통의 이미지는 영구 주소가 멈춰 있어요. 되돌리면 다시 나가요.</p>}
      {q && <p className="bc-muted">"{q}" 검색 결과 {rows.length}장{filter !== 'all' ? ` (${VIS[filter]?.label})` : ''}</p>}
      {loading && <p className="bc-muted">불러오는 중…</p>}
      {(q ? search.isError : list.isError) && <p className="bc-msg">목록을 불러오지 못했어요.</p>}
      {!loading && rows.length === 0 && <p className="bc-muted">{q ? '찾은 이미지가 없어요.' : filter === 'trash' ? '휴지통이 비어 있어요.' : filter === 'all' ? '아직 올린 이미지가 없어요. 오른쪽 위 "이미지 올리기"나 끌어다 놓기로 시작해요.' : '이 공개 범위의 이미지가 없어요.'}</p>}

      <div className="bc-gallery">
        {rows.map((a) => <Cell key={a.id} a={a} aiOn={aiOn} selected={selected.has(a.id)} onToggle={() => toggle(a.id)}
          onOpen={() => (selected.size ? toggle(a.id) : nav(`/images/${a.id}`, { state: { ids } }))} />)}
      </div>
      {!q && list.hasNextPage && <div className="bc-row"><button className="bc-btn" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? '불러오는 중…' : '더 보기'}</button></div>}
      {dragging && <div className="bc-dropmask">여기에 놓으면 올리기 목록에 들어가요</div>}
    </div>
  );
}
