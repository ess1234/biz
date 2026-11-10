/// 4-5 연동 (biz-dev-08): 사이트 키 · 빌드 연동 · API 키를 탭으로. 코드 옆에 "언제 이 방법을 쓰나" 한 줄.
/// 사이트 키 · 끼워 넣기 코드는 sai 콘솔 Biz.tsx, API 키는 Workspace.tsx 에서 옮겨 B2B 문구로. 연동 확인(키별 요청 수 · 거절된 출처)은 다음 단계(DC-6).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError, api, type ApiKey } from '../lib/api';
import { copyText, imageOrigin, permanentUrl } from '../lib/assets';
import { useSession } from '../lib/auth';
import { API_BASE } from '../lib/env';
import { type SiteKey, useSiteKeys } from '../lib/queries';
import { toast } from '../lib/toast';

type FullSiteKey = SiteKey & { allowed_variants: string[] };
const SCRIPT_FILE = String(import.meta.env.VITE_PAGE_SCRIPT || 'imagemeta-0.1.0.min.js');   // 제품명 미정 — 자리표시자 파일명
const apiOrigin = () => (API_BASE.startsWith('http') ? API_BASE.replace(/\/t23\/v1$/, '') : location.origin);
const TABS: [string, string][] = [['site', '사이트 키'], ['build', '빌드 연동'], ['api', 'API 키']];

function CodeBox({ title, code, when }: { title: string; code: string; when?: string }) {
  return (
    <div className="bc-code">
      <div className="head"><b>{title}</b><button className="bc-btn small" onClick={() => copyText(code, () => toast('복사했어요'), () => toast('복사하지 못했어요'))}>복사</button></div>
      {when && <div className="bc-muted">{when}</div>}
      <pre>{code}</pre>
    </div>
  );
}

export function IntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'site';
  return (
    <>
      <h2 className="bc-h">연동</h2>
      <p className="bc-muted">고객 사이트에서 이미지 설명을 받아 가는 방법이에요. 검색 엔진 노출이 중요하면 빌드 연동, 지금 있는 페이지에 바로 붙이려면 스크립트 한 줄을 써요.</p>
      <div className="bc-tabs bc-sec" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'site' ? {} : { tab: k }, { replace: true })}>{label}</button>)}
      </div>
      <div className="bc-sec">{tab === 'build' ? <BuildTab /> : tab === 'api' ? <ApiKeysTab /> : <SiteKeysTab />}</div>
    </>
  );
}

/* ───────────── 사이트 키 + 스크립트 한 줄 ───────────── */

function Snippet({ k }: { k: FullSiteKey }) {
  const code = `<script src="${location.origin}/js/${SCRIPT_FILE}" data-key="${k.key}" data-lang="ko" data-api="${apiOrigin()}/t23/v1" defer></script>`;
  const img = `<img src="${permanentUrl('{이미지 id}')}" loading="lazy">`;
  return (
    <>
      <CodeBox title="1) 페이지 끝(</body> 앞)에 한 줄" when="지금 있는 페이지에 바로. 방문자 브라우저에서 alt 를 채워요 — 크롤러에 따라 못 읽을 수 있어요." code={code} />
      <CodeBox title="2) 이미지는 영구 주소로" when="alt 는 비워 두면 스크립트가 채워요. 이미지 id 는 이미지 상세의 '가져다 쓰기'에서 복사해요." code={img} />
    </>
  );
}

function KeyForm({ initial, onDone }: { initial?: FullSiteKey; onDone: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [origins, setOrigins] = useState((initial?.allowed_origins ?? []).join('\n'));
  const [variants, setVariants] = useState((initial?.allowed_variants ?? ['w=400', 'w=800', 'w=1200']).join(', '));
  const save = useMutation({
    mutationFn: () => {
      const body = { label: label.trim() || null, allowed_origins: origins.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean), allowed_variants: variants.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) };
      return initial ? api.patch<FullSiteKey>(`/site-keys/${initial.id}`, body) : api.post<FullSiteKey>('/site-keys', body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['site-keys'] }); toast(initial ? '저장했어요' : '사이트 키를 만들었어요'); onDone(); },
    onError: (e: any) => toast(e instanceof ApiError && e.details && (e.details as any).bad ? `형식이 맞지 않아요: ${(e.details as any).bad.join(', ')}` : e.message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <label className="bc-field">이름 (선택)<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 쇼핑몰 본점" maxLength={60} /></label>
      <label className="bc-field">허용 출처 — 이 키를 쓸 수 있는 사이트 주소, 한 줄에 하나
        <textarea className="bc-textarea" rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={'https://shop.example.com\nhttps://*.example.com'} required />
      </label>
      <p className="bc-muted" style={{ margin: '4px 0 0' }}>스킴 포함, 경로 없이. <code>https://*.example.com</code> 처럼 하위 도메인 전체도 돼요. 오타가 가장 흔한 실패예요 — 여기 없는 사이트에서 부르면 설명을 내주지 않아요.</p>
      <label className="bc-field">허용 변형<input value={variants} onChange={(e) => setVariants(e.target.value)} placeholder="w=400, w=800, w=1200" /></label>
      <div className="bc-row">
        <button className="bc-btn primary" type="submit" disabled={save.isPending}>{initial ? '저장' : '키 만들기'}</button>
        <button className="bc-btn" type="button" onClick={onDone}>취소</button>
      </div>
    </form>
  );
}

function SiteKeysTab() {
  const qc = useQueryClient();
  const { me } = useSession();
  const q = useSiteKeys();
  const [editing, setEditing] = useState<FullSiteKey | 'new' | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/site-keys/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['site-keys'] }); toast('폐기했어요 — 이미 받아 간 설명은 브라우저 캐시가 끝나는 10분 안에 사라져요'); },
    onError: (e: any) => toast(e.message),
  });
  const items = (q.data?.items ?? []) as FullSiteKey[];
  const active = items.filter((k) => !k.revoked_at);
  const revoked = items.filter((k) => k.revoked_at);
  const canEdit = me?.account.role === 'owner' || me?.account.role === 'admin';
  return (
    <>
      <p className="bc-muted" style={{ marginTop: 0 }}>사이트 키는 비밀이 아니라 공개 값이에요. 허용 출처로만 묶여서, 등록한 사이트에서만 설명을 받아 가요.</p>
      {editing === 'new' && <div className="bc-box"><h3 style={{ fontSize: 15 }}>새 사이트 키</h3><KeyForm onDone={() => setEditing(null)} /></div>}
      {!editing && canEdit && <div className="bc-row" style={{ marginTop: 0 }}><button className="bc-btn primary" onClick={() => setEditing('new')}>사이트 키 만들기</button></div>}
      {q.isLoading && <p className="bc-muted">불러오는 중…</p>}
      {!q.isLoading && !active.length && editing !== 'new' && <p className="bc-muted">아직 키가 없어요. 첫 키를 만들면 바로 끼워 넣기 코드가 나와요.</p>}
      {active.map((k) => (
        <div className="bc-box bc-sec" key={k.id}>
          <div className="bc-row" style={{ marginTop: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{k.label ?? '이름 없음'}</b> <code className="bc-keycode">{k.key}</code>
              <div className="bc-muted">허용 출처 {k.allowed_origins.join(' · ') || '—'} · 변형 {k.allowed_variants.join(', ')} · {new Date(k.created_at).toLocaleDateString('ko-KR')}</div>
            </div>
            <a className="bc-btn small" href={`${apiOrigin()}/d/${k.key}`} target="_blank" rel="noreferrer">데모 보기</a>
            {canEdit && <button className="bc-btn small" onClick={() => setEditing(editing === k ? null : k)}>수정</button>}
            {canEdit && <button className="bc-btn small danger" onClick={() => confirm('이 키를 폐기할까요? 이 키로 설명을 받던 페이지는 alt 가 비게 돼요.') && revoke.mutate(k.id)}>폐기</button>}
          </div>
          {editing === k ? <KeyForm initial={k} onDone={() => setEditing(null)} /> : <Snippet k={k} />}
        </div>
      ))}
      {revoked.length > 0 && <details className="bc-muted bc-sec"><summary>폐기한 키 {revoked.length}개</summary><ul>{revoked.map((k) => <li key={k.id}><code>{k.key.slice(0, 10)}…</code> {k.label ?? ''} · 폐기 {new Date(k.revoked_at!).toLocaleDateString('ko-KR')}</li>)}</ul></details>}
    </>
  );
}

/* ───────────── 빌드 연동 ───────────── */

function BuildTab() {
  const base = `${apiOrigin()}/t23/v1`;
  return (
    <>
      <div className="bc-box">
        <h3 style={{ fontSize: 15 }}>언제 쓰나</h3>
        <p className="bc-muted" style={{ marginBottom: 0 }}>사이트를 빌드해서 배포하는 경우(Vite 등). 빌드할 때 설명을 한 번에 받아 HTML 에 alt · 구조화 데이터를 미리 넣어서, 크롤러가 자바스크립트 없이 읽고 방문자 브라우저에서 할 일이 없어요.
          빌드 연동은 사이트 키가 아니라 <Link to="/integrations?tab=api">API 키</Link>(읽기)를 써요 — 빌드 서버의 환경 변수에만 두고 브라우저 코드에 넣지 마세요.</p>
      </div>
      <CodeBox title="vite.config.js" when="Vite 빌드 플러그인. 이미지 주소(/i/{id})를 소스에서 찾아 alt 를 채우고, 결과는 1시간 캐시해요." code={`import imagemeta from '@imagemeta/vite'

export default {
  plugins: [
    imagemeta({
      apiKey: process.env.IMAGEMETA_API_KEY,   // 읽기 범위 API 키
      apiBase: process.env.IMAGEMETA_API_BASE, // ${base}
      lang: 'ko',
    }),
  ],
}`} />
      <CodeBox title="빌드 환경 변수" code={`IMAGEMETA_API_KEY=<API 키>\nIMAGEMETA_API_BASE=${base}`} />
      <CodeBox title="이미지는 영구 주소로" code={`<img src="${imageOrigin()}/i/{이미지 id}?w=800" loading="lazy">`} />
      <p className="bc-muted">패키지는 아직 공개 저장소에 올리지 않았어요. 빌드 연동을 쓰려면 담당자에게 요청해 주세요. Next.js 서버 컴포넌트용은 요청이 있을 때 만들어요.</p>
    </>
  );
}

/* ───────────── API 키 ───────────── */

const SCOPES: { id: string; label: string; help: string }[] = [
  { id: 'assets:read', label: '읽기', help: '설명 · 메타 · 사용량 조회. 빌드 연동은 이것만' },
  { id: 'assets:write', label: '쓰기', help: '이미지 올리기 · 설명 고치기' },
  { id: 'publish', label: '공개 범위', help: '공개 범위 바꾸기' },
  { id: 'export', label: '내보내기', help: '설명 · 원본 내보내기' },
];

function ApiKeysTab() {
  const { me } = useSession();
  const accountId = me!.account.id;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['api-keys', accountId], queryFn: () => api.get<{ items: ApiKey[] }>(`/accounts/${accountId}/api-keys`) });
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState<Set<string>>(new Set(['assets:read']));
  const [issued, setIssued] = useState<ApiKey | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<ApiKey>(`/accounts/${accountId}/api-keys`, { label: label.trim() || null, scopes: [...scopes] }),
    onSuccess: (k) => { setIssued(k); setLabel(''); qc.invalidateQueries({ queryKey: ['api-keys', accountId] }); },
    onError: (e: any) => toast(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${accountId}/api-keys/${id}`),
    onSuccess: () => { toast('폐기했어요 — 그 키의 요청은 바로 거절돼요'); qc.invalidateQueries({ queryKey: ['api-keys', accountId] }); },
    onError: (e: any) => toast(e.message),
  });
  const canEdit = me?.account.role === 'owner' || me?.account.role === 'admin';
  const items = q.data?.items ?? [];
  return (
    <>
      <p className="bc-muted" style={{ marginTop: 0 }}>서버 · 빌드에서 쓰는 비밀 키예요. <code>Authorization: ApiKey &lt;키&gt;</code> 로 호출해요. 원문은 만들 때 한 번만 보여요 — 서버는 해시만 보관해요.</p>
      {issued?.key && (
        <div className="bc-box warn">
          <b>새 키 — 지금 복사해 두세요. 다시 볼 수 없어요.</b>
          <div className="bc-copy"><div className="line"><code>{issued.key}</code><button className="bc-btn small" onClick={() => copyText(issued.key!, () => toast('복사했어요'), () => toast('복사하지 못했어요'))}>복사</button></div></div>
          <div className="bc-row"><button className="bc-btn small" onClick={() => setIssued(null)}>복사했어요</button></div>
        </div>
      )}
      {canEdit && (
        <form className="bc-box bc-sec" onSubmit={(e) => { e.preventDefault(); if (scopes.size) create.mutate(); }}>
          <h3 style={{ fontSize: 15 }}>새 API 키</h3>
          <label className="bc-field">이름 (선택)<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 빌드 서버" maxLength={60} /></label>
          <div className="bc-field">범위 — 필요한 만큼만</div>
          {SCOPES.map((s) => (
            <label key={s.id} className="bc-check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={scopes.has(s.id)} onChange={(e) => { const n = new Set(scopes); if (e.target.checked) n.add(s.id); else n.delete(s.id); setScopes(n); }} />
              <span><b>{s.label}</b> — {s.help}</span>
            </label>
          ))}
          <div className="bc-row"><button className="bc-btn primary" type="submit" disabled={!scopes.size || create.isPending}>키 만들기</button></div>
        </form>
      )}
      {q.isLoading && <p className="bc-muted">불러오는 중…</p>}
      {items.length > 0 && (
        <table className="bc-table bc-sec">
          <thead><tr><th>이름</th><th>범위</th><th>마지막 사용</th><th>만든 날</th><th /></tr></thead>
          <tbody>{items.map((k) => (
            <tr key={k.id} style={k.revoked_at ? { opacity: .5 } : undefined}>
              <td>{k.label || '이름 없음'}</td>
              <td>{k.scopes.map((s) => SCOPES.find((x) => x.id === s)?.label ?? s).join(', ')}</td>
              <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString('ko-KR') : '—'}</td>
              <td>{new Date(k.created_at).toLocaleDateString('ko-KR')}</td>
              <td>{k.revoked_at ? <span className="bc-muted">폐기됨</span> : canEdit && <button className="bc-btn small danger" onClick={() => confirm('이 키를 폐기할까요? 그 키를 쓰는 서버 · 빌드가 바로 실패해요.') && revoke.mutate(k.id)}>폐기</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {!q.isLoading && !items.length && <p className="bc-muted">아직 API 키가 없어요.</p>}
    </>
  );
}
