/* 페이지 스크립트 v1 — 고객 페이지의 <img src=".../i/{id}"> 에 설명(alt)을 채운다. (biz-dev-05, 제품명 미정이라 파일명은 자리표시자)
 * <script src="https://…/js/imagemeta-0.1.0.min.js" data-key="pk_…" data-lang="ko" [data-api="https://…/t23/v1"] [data-jsonld] [data-force] [data-xmp[="20"]] defer></script>
 *  - 의존성 없음 · ES2017 · 페이지당 메타 요청 1회(100장 단위) · 나중에 추가된 <img> 도 MutationObserver 로 채움
 *  - alt 가 이미 있으면 건드리지 않는다(data-force 면 덮어씀). data-jsonld 면 ImageObject JSON-LD 를 <head> 에 넣는다
 *  - data-xmp (선택, 11-16 자기 식별 이미지): 우리 주소가 아닌 이미지(퍼간 파일·고객 서버에 복사된 파일)와 메타 API 에 실패한 이미지는
 *    파일 앞부분(최대 256KB)을 받아 XMP 를 읽는다. im:id 가 있으면 그 id 로 최신 설명을 메타 API 에 묻고, 못 받으면 파일 안 설명을 쓴다.
 *    기본 최대 20장(data-xmp="50" 처럼 숫자로 조정). CORS 가 막힌 이미지는 조용히 건너뜀. JPEG(APP1)·PNG(iTXt)·WebP·AVIF.
 *  - 실패해도 페이지는 그대로(조용히 끝). 콘솔에 아무것도 찍지 않는다
 */
(function () {
  'use strict';
  var s = document.currentScript || (function () { var a = document.getElementsByTagName('script'); return a[a.length - 1]; })();
  if (!s) return;
  var key = s.getAttribute('data-key') || '';
  var lang = s.getAttribute('data-lang') || document.documentElement.lang || 'ko';   // 자르지 않는다 — zh-Hant · zh-TW(번체)가 zh(간체)로 바뀌지 않게. 맞추기는 서버가
  var api = s.getAttribute('data-api');
  if (!api) { try { api = new URL(s.src).origin + '/t23/v1'; } catch (e) { api = '/t23/v1'; } }
  api = api.replace(/\/$/, '');
  var wantLd = s.hasAttribute('data-jsonld');
  var force = s.hasAttribute('data-force');
  var xmpOn = s.hasAttribute('data-xmp');
  var xmpMax = parseInt(s.getAttribute('data-xmp') || '', 10) || 20;
  var xmpUsed = 0;
  var ID_RE = /\/i\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
  var done = {};       // id → true (요청했거나 채운 것)
  var pending = {};    // id → [img]
  var timer = null;
  var tried = typeof WeakSet === 'function' ? new WeakSet() : null;   // XMP 를 읽어 본 img

  function idOf(img) {
    var m = ID_RE.exec(img.currentSrc || img.src || img.getAttribute('src') || '');
    return m ? m[1].toLowerCase() : null;
  }
  function wants(img) { return force || !img.getAttribute('alt') || img.getAttribute('data-meta-src') === 'xmp'; }
  function collect(root) {
    var imgs = root.querySelectorAll ? root.querySelectorAll('img') : [];
    if (root.tagName === 'IMG') imgs = [root];
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!force && img.getAttribute('alt')) continue;
      var id = idOf(img);
      if (!id) { if (xmpOn) tryXmp(img); continue; }
      if (done[id]) continue;
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
  function apply(img, alt, rev, src) {
    // 파일(xmp)에서 채운 alt 는 API 가 더 새 버전을 주면 덮는다. 사람이 쓴 alt 는 force 아니면 그대로
    var cur = img.getAttribute('data-meta-src');
    if (alt && (force || !img.getAttribute('alt') || (cur === 'xmp' && src === 'api' && rev != null && rev >= (parseInt(img.getAttribute('data-meta-rev') || '0', 10) || 0)))) {
      img.setAttribute('alt', alt);
      img.setAttribute('data-meta-src', src);
    }
    if (rev != null && (src === 'api' || !img.getAttribute('data-meta-rev'))) img.setAttribute('data-meta-rev', String(rev));
  }
  function fetchBatch(ids, batch) {
    var url = api + '/meta:batch?ids=' + ids.join(',') + '&lang=' + encodeURIComponent(lang) + (key ? '&key=' + encodeURIComponent(key) : '') + (wantLd ? '&jsonld=1' : '');
    fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.items) { fail(); return; }
      var ld = [];
      for (var i = 0; i < j.items.length; i++) {
        var it = j.items[i], imgs = batch[it.id] || [];
        for (var k = 0; k < imgs.length; k++) apply(imgs[k], it.alt, it.rev, 'api');
        if (wantLd && it.jsonld) ld.push(it.jsonld);
      }
      if (ld.length) {
        var el = document.createElement('script');
        el.type = 'application/ld+json';
        el.textContent = JSON.stringify(ld.length === 1 ? ld[0] : ld);
        (document.head || document.documentElement).appendChild(el);
      }
    }).catch(fail);
    function fail() {
      // 메타 API 에 닿지 못함 → 파일 안 설명으로 (data-xmp 일 때만)
      if (!xmpOn) return;
      for (var i = 0; i < ids.length; i++) { var imgs = batch[ids[i]] || []; for (var k = 0; k < imgs.length; k++) tryXmp(imgs[k]); }
    }
  }

  // ── 파일 읽기 폴백 (data-xmp)
  function tryXmp(img) {
    if (!tried || tried.has(img) || xmpUsed >= xmpMax) return;
    tried.add(img);
    var src = img.currentSrc || img.src || img.getAttribute('src');
    if (!src || /^data:/i.test(src)) return;
    xmpUsed++;
    fetch(src, { mode: 'cors', credentials: 'omit', headers: { Range: 'bytes=0-262143' } })
      .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .then(function (buf) {
        if (!buf) return;
        var xml = xmpFromBytes(new Uint8Array(buf));
        if (!xml) return;
        var m = parseXmp(xml);
        if (!m) return;
        if (m.text) apply(img, m.text, m.rev, 'xmp');
        if (m.id && !done[m.id] && idOf(img) !== m.id) {   // 파일이 자기 id 를 안다 → 최신 설명을 API 에 묻는다
          (pending[m.id] = pending[m.id] || []).push(img);
          schedule();
        }
      }).catch(function () { /* CORS·네트워크 — 조용히 */ });
  }
  function xmpFromBytes(b) {
    var dec = function (u8) { try { return new TextDecoder('utf-8').decode(u8); } catch (e) { return null; } };
    if (b[0] === 0xFF && b[1] === 0xD8) {   // JPEG: APP1 "http://ns.adobe.com/xap/1.0/\0"
      var ns = 'http://ns.adobe.com/xap/1.0/\0', p = 2;
      while (p + 4 <= b.length && b[p] === 0xFF) {
        var mk = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
        if (mk === 0xDA || mk === 0xD9) break;
        if (mk === 0xE1 && p + 4 + ns.length <= b.length) {
          var ok = true;
          for (var i = 0; i < ns.length; i++) if (b[p + 4 + i] !== ns.charCodeAt(i)) { ok = false; break; }
          if (ok) return dec(b.subarray(p + 4 + ns.length, Math.min(b.length, p + 2 + len)));
        }
        p += 2 + len;
      }
      return null;
    }
    if (b[0] === 0x89 && b[1] === 0x50) {   // PNG: iTXt "XML:com.adobe.xmp"
      var q = 8;
      while (q + 8 <= b.length) {
        var n = ((b[q] << 24) | (b[q + 1] << 16) | (b[q + 2] << 8) | b[q + 3]) >>> 0;
        var type = String.fromCharCode(b[q + 4], b[q + 5], b[q + 6], b[q + 7]);
        if (type === 'IDAT' || type === 'IEND') break;
        if (type === 'iTXt' && q + 8 + n <= b.length) {
          var d = b.subarray(q + 8, q + 8 + n), j = 0, kw = '';
          while (j < d.length && d[j] !== 0) kw += String.fromCharCode(d[j++]);
          if (kw === 'XML:com.adobe.xmp') {
            var comp = d[j + 1]; j += 3;                       // \0, 압축 플래그, 압축 방식
            while (j < d.length && d[j] !== 0) j++; j++;       // 언어 태그
            while (j < d.length && d[j] !== 0) j++; j++;       // 번역된 키워드
            if (comp === 0) return dec(d.subarray(j));
          }
        }
        q += 12 + n;
      }
      return null;
    }
    // WebP(RIFF…WEBP) · AVIF/HEIF(…ftyp): XMP 는 압축 없이 들어 있어 패킷을 바이트로 찾는다 (AVIF 는 파일 앞쪽, WebP 는 끝 — 받은 256KB 안에 있을 때만)
    if ((b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[8] === 0x57) || (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)) {
      var s0 = find(b, '<x:xmpmeta', 0), e0 = s0 < 0 ? -1 : find(b, '</x:xmpmeta>', s0);
      if (e0 > 0) return dec(b.subarray(s0, e0 + 12));
    }
    return null;
  }
  function find(b, str, from) {
    var c0 = str.charCodeAt(0), n = str.length;
    for (var i = from; i + n <= b.length; i++) {
      if (b[i] !== c0) continue;
      var k = 1;
      while (k < n && b[i + k] === str.charCodeAt(k)) k++;
      if (k === n) return i;
    }
    return -1;
  }
  function parseXmp(xml) {
    var doc;
    try { doc = new DOMParser().parseFromString(xml.replace(/^[\s\S]*?(<x:xmpmeta)/, '$1').replace(/<\?xpacket end[\s\S]*$/, ''), 'application/xml'); } catch (e) { return null; }
    if (!doc || doc.getElementsByTagName('parsererror').length) return null;
    var IM = 'urn:t23:imagemeta:1.0', RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    var one = function (ns, name) { var el = doc.getElementsByTagNameNS(ns, name)[0]; return el ? (el.textContent || '').trim() : ''; };
    var id = one(IM, 'id').toLowerCase(), rev = parseInt(one(IM, 'rev'), 10);
    var text = '';
    var props = [].concat(toArr(doc.getElementsByTagNameNS('http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/', 'AltTextAccessibility')), toArr(doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'description')));
    for (var i = 0; i < props.length && !text; i++) {
      var lis = props[i].getElementsByTagNameNS(RDF, 'li'), def = '';
      for (var k = 0; k < lis.length; k++) {
        var l = (lis[k].getAttribute('xml:lang') || 'x-default').toLowerCase(), t = (lis[k].textContent || '').trim();
        if (!t) continue;
        if (l === lang.toLowerCase() || l.slice(0, 2) === lang.toLowerCase()) { text = t; break; }
        if (l === 'x-default' && !def) def = t;
      }
      if (!text) text = def;
    }
    if (!id && !text) return null;
    return { id: /^[0-9a-f-]{36}$/.test(id) ? id : null, rev: isNaN(rev) ? null : rev, text: text };
  }
  function toArr(c) { var a = []; for (var i = 0; i < c.length; i++) a.push(c[i]); return a; }

  function start() {
    collect(document);
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'attributes') { if (m.target.tagName === 'IMG') { var id = idOf(m.target); if (id) delete done[id]; if (tried) tried.delete(m.target); collect(m.target); } continue; }
          for (var k = 0; k < m.addedNodes.length; k++) if (m.addedNodes[k].nodeType === 1) collect(m.addedNodes[k]);
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
