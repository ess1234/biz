/// 경로별로 나눠 받는 화면 — React.lazy 에 조각을 못 받았을 때의 처리를 붙인 것.
import { type ComponentType, lazy } from 'react';

const RELOADED = 'biz:chunk-reloaded';
/** 이름 있는 export 를 React.lazy 로 (lazy 는 default export 만 받는다).
 *  조각을 못 받으면 — 새 버전 배포로 옛 파일이 없어진 경우가 대부분 — 한 번만 새로 고친다. 그래도 안 되면 ErrorBoundary 가 안내한다. */
export function page<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then(
    (m) => { try { sessionStorage.removeItem(RELOADED); } catch { /* 무시 */ } return { default: m[name] as ComponentType }; },
    (e) => {
      let again = false;
      try { again = sessionStorage.getItem(RELOADED) === '1'; if (!again) sessionStorage.setItem(RELOADED, '1'); } catch { again = true; }
      if (again) throw e;
      location.reload();
      return new Promise<never>(() => {});   // 새로 고쳐질 때까지 Loading 그대로
    },
  ));
}
