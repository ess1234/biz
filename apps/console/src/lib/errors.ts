/// 오류 → 화면 문구. useMutation 의 onError 에 그대로 넘긴다.
import { toast } from './toast';

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const toastError = (e: unknown) => toast(errorText(e));
