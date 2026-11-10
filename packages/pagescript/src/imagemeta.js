/* 페이지 스크립트 v1 — 고객 페이지의 <img src=".../i/{id}"> 에 설명(alt)을 채운다. (biz-dev-05, 제품명 미정이라 파일명은 자리표시자)
 * <script src="https://…/js/imagemeta-0.1.0.min.js" data-key="pk_…" data-lang="ko" [data-api="https://…/t23/v1"] [data-jsonld] [data-force] defer></script>
 *  - 의존성 없음 · ES2017 · 페이지당 메타 요청 1회(100장 단위) · 나중에 추가된 <img> 도 MutationObserver 로 채움
 *  - alt 가 이미 있으면 건드리지 않는다(data-force 면 덮어씀). data-jsonld 면 ImageObject JSON-LD 를 <head> 에 넣는다
 *  - 실패해도 페이지는 그대로(조용히 끝). 콘솔에 아무것도 찍지 않는다
 */
(function () {
  'use strict';
  var s = document.currentScript || (function () { var a = document.getElementsByTagName('script'); return a[a.length - 1]; })();
  if (!s) return;
  var key = s.getAttribute('data-key') || '';
  var lang = s.getAttribute('data-lang') || (document.documentElement.lang || 'ko').slice(0, 2);
  var api = s.getAttribute('data-api');
  if (!api) { try { api = new URL(s.src).origin + '/t23/v1'; } catch (e) { api = '/t23/v1'; } }
  api = api.replace(/\/$/, '');
  var wantLd = s.hasAttribute('data-jsonld');
  var force = s.hasAttribute('data-force');
  var ID_RE = /\/i\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
  var done = {};       // id → true (요청했거나 채운 것)
  var pending = {};    // id → [img]
  var timer = null;

  function idOf(img) {
    var m = ID_RE.exec(img.currentSrc || img.src || img.getAttribute('src') || '');
    return m ? m[1].toLowerCase() : null;
  }
  function collect(root) {
    var imgs = root.querySelectorAll ? root.querySelectorAll('img') : [];
    if (root.tagName === 'IMG') imgs = [root];
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!force && img.getAttribute('alt')) continue;
      var id = idOf(img);
      if (!id || done[id]) continue;
      (pending[id] = pending[id] || []).push(img);
    }
    schedule();
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, 0);
  }
  function flush() {
    timer = null;
    var ids = Object.keys(pending);
    if (!ids.length) return;
    var batch = pending; pending = {};
    for (var i = 0; i < ids.length; i++) done[ids[i]] = true;
    for (var j = 0; j < ids.length; j += 100) fetchBatch(ids.slice(j, j + 100), batch);
  }
  function fetchBatch(ids, batch) {
    var url = api + '/meta:batch?ids=' + ids.join(',') + '&lang=' + encodeURIComponent(lang) + (key ? '&key=' + encodeURIComponent(key) : '') + (wantLd ? '&jsonld=1' : '');
    fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.items) return;
      var ld = [];
      for (var i = 0; i < j.items.length; i++) {
        var it = j.items[i], imgs = batch[it.id] || [];
        for (var k = 0; k < imgs.length; k++) {
          if (it.alt && (force || !imgs[k].getAttribute('alt'))) imgs[k].setAttribute('alt', it.alt);
          if (it.rev != null) imgs[k].setAttribute('data-meta-rev', String(it.rev));
        }
        if (wantLd && it.jsonld) ld.push(it.jsonld);
      }
      if (ld.length) {
        var el = document.createElement('script');
        el.type = 'application/ld+json';
        el.textContent = JSON.stringify(ld.length === 1 ? ld[0] : ld);
        (document.head || document.documentElement).appendChild(el);
      }
    }).catch(function () { /* 조용히 */ });
  }

  function start() {
    collect(document);
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'attributes') { if (m.target.tagName === 'IMG') { var id = idOf(m.target); if (id) delete done[id]; collect(m.target); } continue; }
          for (var k = 0; k < m.addedNodes.length; k++) if (m.addedNodes[k].nodeType === 1) collect(m.addedNodes[k]);
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
