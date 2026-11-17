/// dos /t23/v1 응답 타입 (03 리소스 — 화면이 쓰는 필드만). 한 곳에 모아 둔다 — 페이지 파일 안에 두지 않는다.
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
export type WorkspaceSettings = {
  ai_consent_at: string | null; plan: string; plan_label?: string | null; delete_requested_at: string | null; delete_approved_at: string | null;
  delete_grace_days: number; delete_approval_required: boolean; analysis_lang: string; updated_at?: string;
};
export type UsageSummary = {
  from: string; to: string; totals: Record<string, number>; limits: Record<string, number | null>; plan: string; plan_label?: string | null;
  overage_policy: string; warnings?: string[]; edge_note?: string;
};
export type SiteKey = { id: string; key: string; label: string | null; allowed_origins: string[]; revoked_at: string | null; created_at: string };
export type InvoiceLine = { kind: string; label: string; qty: number; unit: string; unit_krw: number; amount_krw: number };
export type Invoice = { id: string; period: string; plan: string; currency: string; lines: InvoiceLine[]; usage: Record<string, number>; subtotal_krw: number; vat_krw: number; total_krw: number;
  status: 'draft' | 'issued' | 'paid' | 'void'; issued_at: string; due_at: string | null; paid_at: string | null; note: string | null };
