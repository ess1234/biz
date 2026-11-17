/// 첫 로그인 화면을 이미 거쳤는지 — 워크스페이스별, 이 브라우저 기준(서버에 둘 만한 값이 아님)
const WELCOME_KEY = (accountId: string) => `biz:welcomed:${accountId}`;
export function welcomed(accountId: string): boolean { try { return localStorage.getItem(WELCOME_KEY(accountId)) === '1'; } catch { return true; } }
export function markWelcomed(accountId: string): void { try { localStorage.setItem(WELCOME_KEY(accountId), '1'); } catch { /* 저장 못 해도 진행 */ } }
