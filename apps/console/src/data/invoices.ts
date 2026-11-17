/// 청구서 상태 문구 (사용량 · 청구 탭, 운영 화면)
import { type Invoice } from './types';

export const INVOICE_STATUS: Record<Invoice['status'], string> = { draft: '초안', issued: '발행 — 입금 대기', paid: '결제 완료', void: '취소' };
