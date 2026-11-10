/// 4-4 이미지 상세 — 모달이 아니라 페이지(DC-3, 주소로 공유 가능). 오른쪽은 설명 → 키워드 → 공개 범위 → 가져다 쓰기 순서.
/// 휴대폰 · 기기 · 즐겨찾기는 없다. 위치는 "공개 사본에서 제거됨"으로만(L-7). 설명 표시는 "AI 생성 · 직접 고침"(DC-7).
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { ApiError, api, type Asset } from '../lib/api';
import { VIS, VIS_ORDER, copyText, permanentUrl, useAsset } from '../lib/assets';
import { fileUrl, useFileUrl } from '../lib/thumbs';
import { toast } from '../lib/toast';

const LANGS: [string, string][] = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh', '中文']];
const WIDTHS = [400, 800, 1200];

function Copy({ label, text }: { label: string; text: string }) {
  return (
    <div className="bc-copy">
      <div className="bc-muted">{label}</div>
      <div className="line"><code>{text}</code><button className="bc-btn small" onClick={() => copyText(text, () => toast('복사했어요'), () => toast('복사하지 못했어요'))}>복사</button></div>
    </div>
  );
}

export function ImageDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const ids: string[] = (loc.state as any)?.ids ?? [];
  const idx = id ? ids.indexOf(id) : -1;
  const asset = useAsset(id);
  const big = useFileUrl('thumb1024', asset.data?.has_thumb ? id : null);
  const go = (d: number) => { const n = ids[idx + d]; if (n) nav(`/images/${n}`, { replace: true, state: { ids } }); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  if (asset.isLoading) return <p className="bc-muted">불러오는 중…</p>;
  if (asset.isError || !asset.data) return <><p className="bc-msg">이미지를 찾지 못했어요.</p><Link className="bc-btn" to="/images">이미지 목록</Link></>;
  const a = asset.data;
  return (
    <>
      <div className="bc-row" style={{ marginTop: 0 }}>
        <Link className="bc-btn small" to="/images">← 이미지</Link>
        {idx >= 0 && ids.length > 1 && <>
          <button className="bc-btn small" disabled={idx <= 0} onClick={() => go(-1)}>‹ 이전</button>
          <span className="bc-muted">{idx + 1} / {ids.length}</span>
          <button className="bc-btn small" disabled={idx >= ids.length - 1} onClick={() => go(1)}>다음 ›</button>
        </>}
        <span className="bc-spacer" />
        <b style={{ wordBreak: 'break-all' }}>{a.file_name ?? a.id}</b>
      </div>
      {a.deleted_at && <div className="bc-box warn bc-sec">휴지통에 있는 이미지예요. 영구 주소가 멈춰 있어요. <Restore a={a} /></div>}
      <div className="bc-detail bc-sec">
        <div className="stage">{big ? <img src={big} alt={a.caption ?? ''} /> : <div className="bc-spinner" />}</div>
        <div className="side">
          <Description a={a} />
          <Keywords a={a} />
          <Visibility a={a} />
          <UseIt a={a} />
          <Info a={a} />
        </div>
      </div>
    </>
  );
}

function usePatch(a: Asset) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<Asset>(`/assets/${a.id}`, { base_version: a.manual_version ?? 0, ...body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asset', a.id] }); qc.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (e: any) => {
      if (e instanceof ApiError && e.code === 'CONFLICT_STALE') { toast('다른 곳에서 먼저 바뀌었어요 — 최신 내용을 불러왔어요. 다시 고쳐 주세요'); qc.invalidateQueries({ queryKey: ['asset', a.id] }); }
      else toast(`저장하지 못했어요: ${e.message}`);
    },
  });
}

function Description({ a }: { a: Asset }) {
  const caps: Record<string, string> = a.chosen?.caption ?? {};
  const sources = useMemo(() => ((a as any).analyses as { source: string }[] | undefined)?.map((x) => x.source) ?? [], [a]);
  const [lang, setLang] = useState(() => (caps.ko ? 'ko' : Object.keys(caps)[0] || 'ko'));
  const [draft, setDraft] = useState(caps[lang] ?? '');
  useEffect(() => { setDraft(caps[lang] ?? ''); }, [a.id, lang, a.manual_version, a.analysis_version]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = usePatch(a);
  const dirty = draft !== (caps[lang] ?? '');
  const origin = sources.includes('manual') ? '직접 고침' : sources.includes('ai') ? 'AI 생성' : null;
  return (
    <section className="bc-box">
      <h3 style={{ fontSize: 15 }}>설명 {origin ? <span className={`bc-badge${origin === 'AI 생성' ? ' gray' : ''}`}>{origin}</span> : <span className="bc-badge warn">없음</span>}</h3>
      <div className="bc-tabs" style={{ marginTop: 10 }}>{LANGS.map(([k, label]) => <button key={k} className={k === lang ? 'on' : ''} onClick={() => setLang(k)}>{label}{caps[k] ? '' : ' ·'}</button>)}</div>
      <textarea className="bc-textarea" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="이 언어의 설명 (alt 로 나가요)" rows={4} />
      <div className="bc-row" style={{ marginTop: 8 }}>
        <button className="bc-btn small primary" disabled={!dirty || patch.isPending} onClick={() => patch.mutate({ caption: { [lang]: draft } }, { onSuccess: () => toast('저장했어요 — 사이트에는 몇 분 안에 반영돼요') })}>저장</button>
        {dirty && <button className="bc-btn small" onClick={() => setDraft(caps[lang] ?? '')}>되돌리기</button>}
      </div>
    </section>
  );
}

function Keywords({ a }: { a: Asset }) {
  const keywords: string[] = a.chosen?.details?.keywords ?? [];
  const [kw, setKw] = useState('');
  const patch = usePatch(a);
  return (
    <section className="bc-box">
      <h3 style={{ fontSize: 15 }}>키워드</h3>
      <div className="bc-chips">
        {keywords.map((k) => <span key={k} className="bc-chip">{k}<button aria-label={`${k} 빼기`} disabled={patch.isPending} onClick={() => patch.mutate({ keywords_remove: [k] })}>✕</button></span>)}
        <form onSubmit={(e) => { e.preventDefault(); const v = kw.trim(); if (v) { patch.mutate({ keywords_add: [v] }); setKw(''); } }}>
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="+ 키워드" size={10} aria-label="키워드 더하기" />
        </form>
      </div>
    </section>
  );
}

function Visibility({ a }: { a: Asset }) {
  const patch = usePatch(a);
  return (
    <section className="bc-box">
      <h3 style={{ fontSize: 15 }}>공개 범위</h3>
      <div className="bc-seg" role="radiogroup" aria-label="공개 범위">
        {VIS_ORDER.map((v) => (
          <button key={v} role="radio" aria-checked={a.visibility === v} className={`${v}${a.visibility === v ? ' on' : ''}`} disabled={patch.isPending || Boolean(a.deleted_at)}
            onClick={() => a.visibility !== v && patch.mutate({ visibility: v }, { onSuccess: () => toast(`${VIS[v].label} 로 바꿨어요`) })}>{VIS[v].label}</button>
        ))}
      </div>
      <p className="bc-muted" style={{ marginBottom: 0 }}>{VIS[a.visibility]?.help}</p>
    </section>
  );
}

function UseIt({ a }: { a: Asset }) {
  if (a.visibility === 'private' || a.deleted_at) {
    return <section className="bc-box"><h3 style={{ fontSize: 15 }}>가져다 쓰기</h3><p className="bc-muted" style={{ marginBottom: 0 }}>비공개 · 휴지통 이미지는 주소가 나가지 않아요. 공개 범위를 사이트나 공개로 바꾸면 생겨요.</p></section>;
  }
  const url = permanentUrl(a.id);
  const alt = (a.chosen?.caption?.ko ?? a.caption ?? '').replace(/"/g, '&quot;');
  return (
    <section className="bc-box">
      <h3 style={{ fontSize: 15 }}>가져다 쓰기</h3>
      <Copy label="영구 주소 — 이미지를 바꿔도 주소는 그대로" text={url} />
      <Copy label="변형 — 폭(400 · 800 · 1200)과 포맷(webp · avif)" text={`${url}?w=800&f=webp`} />
      <Copy label="img 태그 — 스크립트를 붙인 사이트면 alt 는 비워 둬도 채워져요" text={`<img src="${url}?w=800" alt="${alt}" loading="lazy">`} />
      <div className="bc-row">
        <a className="bc-btn small" href={url} target="_blank" rel="noreferrer">새 탭에서 열기</a>
        {WIDTHS.map((w) => <a key={w} className="bc-btn small" href={`${url}?w=${w}`} target="_blank" rel="noreferrer">{w}px</a>)}
      </div>
    </section>
  );
}

function Info({ a }: { a: Asset }) {
  async function download(variant: 'original' | 'tagged') {
    const u = await fileUrl(variant, a.id);
    if (!u) { toast('서버에 파일이 없어요'); return; }
    const el = document.createElement('a'); el.href = u; el.download = a.file_name || `${a.id}.jpg`; el.rel = 'noopener'; el.click();
  }
  const qc = useQueryClient();
  const trash = useMutation({
    mutationFn: () => api.delete(`/assets/${a.id}`),
    onSuccess: () => { toast('휴지통으로 옮겼어요 — 영구 주소도 멈춰요'); qc.invalidateQueries({ queryKey: ['asset', a.id] }); qc.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (e: any) => toast(e.message),
  });
  const category = a.chosen?.details?.category;
  return (
    <section className="bc-box">
      <h3 style={{ fontSize: 15 }}>정보</h3>
      <dl className="bc-kv" style={{ marginTop: 10, gridTemplateColumns: '96px 1fr' }}>
        <dt>크기</dt><dd>{a.width && a.height ? `${a.width}×${a.height}` : '—'} · {a.bytes ? `${(a.bytes / 1048576).toFixed(1)}MB` : '—'}</dd>
        <dt>형식</dt><dd>{a.mime ?? '—'}</dd>
        <dt>올린 날</dt><dd>{new Date(a.created_at).toLocaleString('ko-KR')}</dd>
        {category && <><dt>분류</dt><dd>{category}</dd></>}
        <dt>위치 정보</dt><dd>{a.lat != null ? '원본에 있음 · 공개 사본에서는 지워요' : '없음'}</dd>
        <dt>id</dt><dd><code style={{ fontSize: 12 }}>{a.id}</code></dd>
      </dl>
      <div className="bc-row">
        <button className="bc-btn small" onClick={() => download('original')}>원본 받기</button>
        <button className="bc-btn small" onClick={() => download('tagged')}>설명 넣은 파일 받기</button>
        {!a.deleted_at && <button className="bc-btn small danger" disabled={trash.isPending} onClick={() => trash.mutate()}>휴지통으로</button>}
      </div>
    </section>
  );
}

function Restore({ a }: { a: Asset }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post(`/assets/${a.id}:restore`),
    onSuccess: () => { toast('되돌렸어요'); qc.invalidateQueries({ queryKey: ['asset', a.id] }); qc.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (e: any) => toast(e.message),
  });
  return <button className="bc-btn small" disabled={m.isPending} onClick={() => m.mutate()}>되돌리기</button>;
}
