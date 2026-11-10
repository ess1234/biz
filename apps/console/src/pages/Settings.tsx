/// 4-7 설정 (biz-dev-08): 워크스페이스 이름 · AI 분석 · 멤버 · 내보내기 · 삭제. B2C 의 보관 기간 · Wi-Fi · 내 방은 없다.
/// 삭제는 60일 유예 + 운영자 승인(BD-02-4). 멤버 초대는 서버에 없어서 2차(DC-5) — 1차는 소유자만 보여 준다.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/auth';
import { useSettings } from '../lib/queries';
import { toast } from '../lib/toast';

type ExportJob = { id: string; status: string; url: string | null; bytes: number | null; expires_at: string | null; created_at: string; finished_at: string | null; error?: string | null };

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ko-KR') : '—');
const STATUS: Record<string, string> = { queued: '대기', running: '만드는 중', done: '완료', failed: '실패', expired: '만료' };

export function SettingsPage() {
  const { me, session, refresh } = useSession();
  const settings = useSettings();
  const qc = useQueryClient();
  const acc = me!.account;
  const owner = acc.role === 'owner' || acc.role === 'admin';

  const [name, setName] = useState(acc.name);
  useEffect(() => setName(acc.name), [acc.name]);
  const rename = useMutation({
    mutationFn: () => api.patch(`/accounts/${acc.id}`, { name: name.trim() }),
    onSuccess: async () => { toast('이름을 바꿨어요'); await refresh(); },
    onError: (e: any) => toast(e instanceof ApiError && (e.status === 404 || e.status === 405) ? '이름 바꾸기는 아직 서버에 없어요' : e.message),
  });

  const ai = useMutation({
    mutationFn: (on: boolean) => api.patch('/settings', { ai_consent: on }),
    onSuccess: (_d, on) => { qc.invalidateQueries({ queryKey: ['settings'] }); toast(on ? 'AI 분석을 켰어요' : 'AI 분석을 껐어요 — 대기 중인 분석도 취소했어요'); },
    onError: (e: any) => toast(e.message),
  });

  const exports = useQuery({ queryKey: ['exports'], queryFn: () => api.get<{ items: ExportJob[] }>('/account/exports'), refetchInterval: (q) => (q.state.data?.items.some((x) => x.status === 'queued' || x.status === 'running') ? 5000 : false) });
  const startExport = useMutation({
    mutationFn: () => api.post('/account:export', {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exports'] }); toast('내보내기를 요청했어요 — 준비되면 여기서 받을 수 있어요'); },
    onError: (e: any) => toast(e instanceof ApiError && e.code === 'CONFLICT_DUP' ? '이미 진행 중인 내보내기가 있어요' : e.message),
  });

  const [confirm, setConfirm] = useState('');
  const del = useMutation({
    mutationFn: () => api.delete('/account'),
    onSuccess: async () => { toast('삭제를 요청했어요'); await refresh(); },
    onError: (e: any) => toast(e.message),
  });

  const s = settings.data;
  const grace = s?.delete_grace_days ?? 60;
  return (
    <>
      <h2 className="bc-h">설정</h2>

      <section className="bc-sec bc-box">
        <h3 style={{ fontSize: 15 }}>워크스페이스</h3>
        <dl className="bc-kv" style={{ marginTop: 12 }}>
          <dt>이름</dt>
          <dd>
            {owner ? (
              <form className="bc-row" style={{ marginTop: 0 }} onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== acc.name) rename.mutate(); }}>
                <input className="bc-field" style={{ margin: 0, padding: '6px 10px', border: '1px solid var(--bc-line)', borderRadius: 8, font: 'inherit', minWidth: 220 }} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="워크스페이스 이름" />
                <button className="bc-btn small" type="submit" disabled={rename.isPending || !name.trim() || name.trim() === acc.name}>저장</button>
              </form>
            ) : acc.name}
          </dd>
          <dt>플랜</dt><dd>{s?.plan ?? acc.plan}</dd>
          <dt>만든 날</dt><dd>{day(acc.created_at)}</dd>
        </dl>
      </section>

      <section className="bc-sec bc-box">
        <h3 style={{ fontSize: 15 }}>AI 분석 {s?.ai_consent_at ? <span className="bc-badge">켜짐</span> : <span className="bc-badge gray">꺼짐</span>}</h3>
        <p className="bc-muted">켜면 올린 이미지를 외부 AI 로 보내 4개 언어 설명 · 키워드를 만들어요. 끄면 앞으로 올리는 이미지는 보내지 않고, 대기 중인 분석도 취소해요. 이미 만든 설명은 남아요.</p>
        {s?.ai_consent_at && <p className="bc-muted">{day(s.ai_consent_at)} 에 켰어요.</p>}
        {owner && s && (
          <div className="bc-row">
            {s.ai_consent_at
              ? <button className="bc-btn" disabled={ai.isPending} onClick={() => ai.mutate(false)}>AI 분석 끄기</button>
              : <button className="bc-btn primary" disabled={ai.isPending} onClick={() => ai.mutate(true)}>AI 분석 켜기</button>}
          </div>
        )}
      </section>

      <section className="bc-sec bc-box">
        <h3 style={{ fontSize: 15 }}>멤버</h3>
        <table className="bc-table" style={{ marginTop: 8 }}><tbody>
          <tr><td>{session?.user.email}</td><td className="bc-muted">{acc.role === 'owner' ? '소유자' : acc.role === 'admin' ? '관리자' : '멤버'} · 나</td></tr>
        </tbody></table>
        <p className="bc-muted" style={{ marginBottom: 0 }}>{(acc.member_count ?? 1) > 1 ? `멤버 ${acc.member_count}명 중 나만 보여요. ` : ''}멤버 초대는 다음 단계에서 들어와요.</p>
      </section>

      <section className="bc-sec bc-box">
        <h3 style={{ fontSize: 15 }}>내보내기</h3>
        <p className="bc-muted">워크스페이스의 이미지 원본과 설명을 zip 으로 받아요. zip 은 서버의 정기 작업이 만들어서 준비까지 하루가 걸릴 수 있어요. 받기 링크는 7일 동안 열려요.</p>
        {owner && <div className="bc-row"><button className="bc-btn" disabled={startExport.isPending} onClick={() => startExport.mutate()}>내보내기 시작</button></div>}
        {exports.data && exports.data.items.length > 0 && (
          <table className="bc-table" style={{ marginTop: 12 }}>
            <thead><tr><th>요청</th><th>상태</th><th>크기</th><th /></tr></thead>
            <tbody>{exports.data.items.map((x) => (
              <tr key={x.id}>
                <td>{day(x.created_at)}</td>
                <td>{STATUS[x.status] ?? x.status}{x.error ? ` — ${x.error}` : ''}</td>
                <td>{x.bytes ? `${(x.bytes / 1024 ** 2).toFixed(1)} MB` : '—'}</td>
                <td>{x.url ? <a className="bc-btn small" href={x.url}>받기</a> : x.status === 'done' ? <span className="bc-muted">만료</span> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="bc-sec bc-box danger">
        <h3 style={{ fontSize: 15 }}>워크스페이스 삭제</h3>
        <p className="bc-muted">삭제를 요청하면 바로 모든 화면 · 키 · 이미지 주소가 멈춰요. {grace}일 유예 뒤 운영자가 승인하면 이미지 · 설명 · 키가 영구 삭제돼요. 유예 기간에는 취소할 수 있어요.</p>
        {acc.role === 'owner' ? (
          <div className="bc-row">
            <input style={{ padding: '7px 10px', border: '1px solid var(--bc-line)', borderRadius: 8, font: 'inherit', minWidth: 220 }} placeholder={`확인: ${acc.name}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="워크스페이스 이름 확인" />
            <button className="bc-btn danger" disabled={del.isPending || confirm !== acc.name} onClick={() => del.mutate()}>삭제 요청</button>
          </div>
        ) : <p className="bc-muted">소유자만 요청할 수 있어요.</p>}
      </section>
    </>
  );
}
