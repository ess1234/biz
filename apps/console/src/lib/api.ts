/// dos /t23/v1 호출 래퍼 (sai 콘솔에서 복사, DA-2): 요청마다 JWT, X-T23-Device(웹 기기 id), 03 오류 본문 → ApiError. 401 AUTH_EXPIRED 는 세션 갱신 1회 뒤 재시도.
import { API_BASE } from './env';
import { accessToken, supabase } from './supabase';

export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  details: unknown;
  requestId?: string;
  constructor(status: number, body: Partial<{ code: string; message: string; retryable: boolean; details: unknown; request_id: string }>) {
    super(body.message || `HTTP ${status}`);
    this.status = status;
    this.code = body.code || (status === 401 ? 'AUTH_INVALID' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL' : `HTTP_${status}`);
    this.retryable = Boolean(body.retryable);
    this.details = body.details;
    this.requestId = body.request_id;
  }
}

const DEVICE_KEY = 'biz:web-device-id';
const ACCOUNT_KEY = 'biz:account';

/// 현재 작업 계정(워크스페이스) — 비어 있으면 서버 기본(개인 계정). 비즈니스 계정으로 바꾸면 X-T23-Account 로 보낸다 (03 인증).
export function currentAccountId(): string | null {
  try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; }
}
/// 서버가 이 기기 id 를 다른 계정 것이라 하면(409) 버리고 새로 만든다.
export function rotateWebDeviceId(): string {
  const acc = currentAccountId();
  const key = `${DEVICE_KEY}${currentUserId ? `:u:${currentUserId.slice(0, 8)}` : ''}${acc ? `:${acc}` : ''}`;
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
  return webDeviceId();
}

export function setCurrentAccountId(id: string | null): void {
  try { if (id) localStorage.setItem(ACCOUNT_KEY, id); else localStorage.removeItem(ACCOUNT_KEY); } catch { /* 저장 못 해도 진행 */ }
}

/// 웹 기기 id — 첫 로그인 때 만들어 localStorage 에 보관, PUT /devices/{id} (platform=web). 03 X-T23-Device.
/// 기기 행은 계정에 속하므로(다른 계정의 id 면 409) 계정마다 다른 id 를 쓴다.
/// 로그인한 사용자 id — 웹 기기 id 를 사용자별로 나누기 위해 (같은 브라우저에서 다른 계정으로 로그인하면 이전 사용자의 기기 id 를 PUT 해 409 CONFLICT_DUP → /me 를 못 받아 이름·운영 탭이 사라지던 것, 2026-11-05)
let currentUserId: string | null = null;
export function setCurrentUserId(id: string | null): void { currentUserId = id; }

/// 같은 사용자·같은 작업 계정이면 같은 id. 다른 사용자는 다른 id (서버 devices 는 계정 소유).
export function webDeviceId(): string {
  const acc = currentAccountId();
  const key = `${DEVICE_KEY}${currentUserId ? `:u:${currentUserId.slice(0, 8)}` : ''}${acc ? `:${acc}` : ''}`;
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(query?: Query): string {
  if (!query) return '';
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function send<T>(method: string, path: string, opts: { query?: Query; body?: unknown; auth?: boolean; retry?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const token = await accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    headers['X-T23-Device'] = webDeviceId();
    headers['X-T23-Client'] = 'biz-console';
    const acc = currentAccountId();
    if (acc) headers['X-T23-Account'] = acc;
  }
  const res = await fetch(`${API_BASE}${path}${qs(opts.query)}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text.slice(0, 200) }; }
  if (!res.ok) {
    if (res.status === 401 && json?.code === 'AUTH_EXPIRED' && opts.retry !== false && opts.auth !== false) {
      await supabase().auth.refreshSession();
      return send<T>(method, path, { ...opts, retry: false });
    }
    throw new ApiError(res.status, json);
  }
  return json as T;
}

export const api = {
  get: <T = any>(path: string, query?: Query, auth = true) => send<T>('GET', path, { query, auth }),
  post: <T = any>(path: string, body?: unknown, query?: Query) => send<T>('POST', path, { body, query }),
  put: <T = any>(path: string, body?: unknown) => send<T>('PUT', path, { body }),
  patch: <T = any>(path: string, body?: unknown) => send<T>('PATCH', path, { body }),
  delete: <T = any>(path: string) => send<T>('DELETE', path),
};

// ── 03 리소스 (필요한 필드만)
export type AssetSummary = {
  id: string; taken_at: string | null; status: string; local_state: string | null; has_thumb: boolean;
  caption: string | null; category: string | null; favorite: boolean; visibility: string; file_name: string | null;
};
export type Asset = AssetSummary & {
  mime: string | null; bytes: number | null; width: number | null; height: number | null; lat: number | null; lng: number | null;
  analysis_version: number; manual_version?: number; chosen: any; backed_up_at: string | null; deleted_at: string | null; created_at: string;
  devices?: { device_id: string; local_state: string; name?: string }[];
};
export type Page<T> = { items: T[]; next_cursor?: string | null };
export type FileUrl = { asset_id: string; variant: string; url?: string; error?: { code: string } };
export type Share = { id: string; asset_id: string | null; album_id: string | null; url?: string; allow_download: boolean; expires_at: string; revoked_at: string | null; created_at: string };
export type Account = { id: string; kind: 'personal' | 'business'; name: string; slug: string | null; role: string | null; member_count?: number; plan: string; created_at?: string };
export type Me = { user_id: string; via: string; account: Account; accounts: Account[]; scopes: string[]; settings: Record<string, any>; admin?: { path: string } | null };
export type ApiKey = { id: string; label: string | null; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string; key?: string };
export type Profile = { owner_id: string; handle: string; display_name: string; bio: string | null; skin: Record<string, any>; is_public: boolean; handle_changed_at: string | null; created_at: string; updated_at: string; url: string };
export type Gallery = { id: string; slug: string; title: string | null; default_lang: string; is_public: boolean; item_count: number | null; url: string | null; items?: AssetSummary[]; created_at: string; updated_at: string };
