/// 아주 작은 토스트 — 라이브러리 없이 (sai 콘솔에서 복사).
let el: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, ms = 3500) {
  if (typeof document === 'undefined') return;
  if (!el) { el = document.createElement('div'); el.className = 'bc-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = message;
  el.style.display = 'block';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { if (el) el.style.display = 'none'; }, ms);
}
