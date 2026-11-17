import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL, configured } from './env';

let client: SupabaseClient | null = null;

/// 세션은 supabase-js 기본(localStorage), 탭 간 공유 · 자동 갱신. 콘솔은 Supabase 를 Auth 로만 쓴다 — 데이터는 모두 dos API 로.
export function supabase(): SupabaseClient {
  if (!configured) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않은 빌드');
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
