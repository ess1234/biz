/// dos /t23/v1 응답 타입 (03 리소스 — 화면이 쓰는 필드만). 한 곳에 모아 둔다 — 페이지 파일 안에 두지 않는다.
export type AssetSummary = {
  id: string; taken_at: string | null; status: string; local_state: string | null; has_thumb: boolean;
  caption: string | null; category: string | null; favorite: boolean; visibility: string; file_name: string | null;
};
export type Asset = AssetSummary & {
  mime: string | null; bytes: number | null; width: number | null; height: number | null; lat: number | null; lng: number | null;
  analysis_version: number; manual_version?: number; chosen: Chosen | null; analyses?: { source: string }[]; backed_up_at: string | null; deleted_at: string | null; created_at: string;
};
/// 서버가 고른 설명(분석 결과 중 채택된 것) — 화면이 쓰는 필드만
export type Chosen = { caption?: Record<string, string>; details?: { keywords?: string[]; category?: string } };
export type Page<T> = { items: T[]; next_cursor?: string | null };
export type FileUrl = { asset_id: string; variant: string; url?: string; error?: { code: string } };
export type Account = { id: string; kind: 'personal' | 'business'; name: string; slug: string | null; role: string | null; member_count?: number; plan: string; created_at?: string };
export type Me = { user_id: string; via: string; account: Account; accounts: Account[]; scopes: string[]; settings: Record<string, any>; admin?: { path: string } | null };
export type ApiKey = { id: string; label: string | null; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string; key?: string };
export type WorkspaceSettings = {
  ai_consent_at: string | null; plan: string; plan_label?: string | null; delete_requested_at: string | null; delete_approved_at: string | null;
  delete_grace_days: number; delete_approval_required: boolean; analysis_lang: string; updated_at?: string;
  /// 설명 언어(biz-dev-10): langs = 기본 4개 + 켠 추가 언어. 추가 언어는 운영자가 켠다 — 서버가 아직 안 주면(옛 배포) 화면이 기본 4개로 그린다
  langs?: string[]; extra_langs?: string[]; extra_lang_options?: string[]; lang_labels?: Record<string, string>;
};
export type UsageSummary = {
  from: string; to: string; totals: Record<string, number>; limits: Record<string, number | null>; plan: string; plan_label?: string | null;
  overage_policy: string; warnings?: string[]; edge_note?: string;
};
export type SiteKey = { id: string; key: string; label: string | null; allowed_origins: string[]; allowed_variants: string[]; revoked_at: string | null; created_at: string };
export type InvoiceLine = { kind: string; label: string; qty: number; unit: string; unit_krw: number; amount_krw: number };
export type Invoice = { id: string; period: string; plan: string; currency: string; lines: InvoiceLine[]; usage: Record<string, number>; subtotal_krw: number; vat_krw: number; total_krw: number;
  status: 'draft' | 'issued' | 'paid' | 'void'; issued_at: string; due_at: string | null; paid_at: string | null; note: string | null };

// ── 사용량 · 청구 · 내보내기
export type UsageByDay = { from: string; to: string; days: { day: string; metrics: Record<string, number> }[]; totals: Record<string, number>; plan: string; plan_label?: string | null; limits: Record<string, number | null>; overage_policy: string; warnings?: string[]; edge_note?: string };
export type PlanInfo = { plan: string; label: string; overage_policy: string; limits: Record<string, number | null>; prices: { base_krw: number; storage_krw_per_gb: number; egress_krw_per_gb: number };
  month: { from: string; to: string; totals: Record<string, number>; warnings: string[] }; billing_note: string };
export type ExportJob = { id: string; status: string; url: string | null; bytes: number | null; expires_at: string | null; created_at: string; finished_at: string | null; error?: string | null };

// ── 운영 (GET {admin.path}/… — dos routes_admin)
type Counts = Record<string, number>;
export type AdminSummary = {
  accounts: { total: number; personal: number; business: number; today: number };
  assets: { total: number; by_status: Counts; trash: number; bytes: number };
  jobs: Counts; events_today: Counts; generated_at: string;
};
export type UsageTotals = { image_requests: number; egress_bytes: number; transforms: number; meta_requests: number; uploads: number; analyses: number; storage_bytes: number };
export type AdminUsageTop = { days: number; since?: string; items: (UsageTotals & { account_id: string; name: string })[]; totals?: UsageTotals; edge_note?: string; note?: string };
export type AdminAccount = {
  id: string; kind: string; name: string; slug: string | null; created_at: string;
  members: { email: string | null; role: string; last_sign_in_at: string | null }[];
  devices: { count: number; last_seen: string | null };
  assets: { total: number; trash: number; bytes: number; by_status: Counts; by_visibility: Counts; last_upload: string | null };
};
export type FailedJob = { error: string; at: string | null; attempts?: number; owner_id?: string };
export type AdminJobs = { by_status: Counts; oldest_queued_at: string | null; recent_failed: FailedJob[]; sample: number };
export type AdminInvoice = Invoice & { account: { id: string; name: string } };
export type AdminInvoices = { items: AdminInvoice[]; totals: { count: number; total_krw: number; unpaid_krw: number }; previous_period: string };
export type InvoiceGenerated = { period: string; created: number; skipped: number; ids: string[] };
export type AdminDeletion = { account_id: string; name: string | null; delete_requested_at: string; delete_approved_at: string | null; delete_at: string; approval_required: boolean };
export type AdminDeletions = { items: AdminDeletion[]; grace_days: number; approval_required: boolean };
export type BackupRun = { id: string; kind: string; dest: string | null; ok: boolean; objects: number | null; bytes: number | null; note: string | null; started_at: string; finished_at: string | null };
export type AdminBackups = { items: BackupRun[]; last_ok: Record<string, string> };
/// 진단 신청(biz-dev-12) — dossai.app/business 양식. owner_match = 이메일 도메인이 사이트와 같음(AI 미리보기 대상)
export type AuditRequest = {
  id: string; created_at: string; site_url: string; site_host: string; email: string | null; email_domain: string | null; company: string | null;
  owner_match: boolean; free_mail: boolean; status: 'new' | 'running' | 'review' | 'sent' | 'rejected' | 'spam' | 'duplicate'; note: string | null; handled_at: string | null;
  /// 보고서(biz-dev-13): 진단 도구 --request 가 붙임 → review. 보내면 sent_at
  has_report?: boolean; report_summary?: { lacking?: number; lacking_pct?: number; saved_pct?: number; plan?: string } | null;
  report_at?: string | null; report_expires_at?: string | null; sent_at?: string | null; send_error?: string | null;
};
export type AdminAuditRequests = { items: AuditRequest[]; new_count: number; ready: boolean };
export type AdminLangs = { langs: string[]; extra_langs: string[]; options: string[]; labels: Record<string, string>; ai_consent: boolean; missing_count: number; queued?: number };
export type AdminAccountAsset = {
  id: string; created_at: string; status: string; visibility: string | null; bytes: number | null; size: string | null; deleted: boolean;
  caption: string | null; keywords: string[]; sources: string[];
};
export type AdminAccountDetail = { account: { id: string; kind: string; name: string; slug: string | null; created_at: string }; jobs: { by_status: Counts; recent_failed: FailedJob[] }; recent_assets: AdminAccountAsset[] };
