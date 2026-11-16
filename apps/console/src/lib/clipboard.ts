/// 클립보드 복사 + 결과 토스트.
import { toast } from './toast';

export function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => toast('복사했어요'), () => toast('복사하지 못했어요'));
}
