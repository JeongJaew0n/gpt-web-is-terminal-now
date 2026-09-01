// gpt-term — isolated world 전역 네임스페이스와 MAIN world 브리지.
var GT = (function () {
  'use strict';
  const CH = '__gpt_term__';
  const handlers = new Map();
  // MAIN world 는 document_start 에 곧바로 ready 를 쏜다. 그때 isolated 쪽 핸들러가
  // 아직 안 붙어 있으면 postMessage 는 그냥 사라진다 — 핸드셰이크가 통째로 깨진다.
  // 그래서 임자 없는 메시지는 버리지 않고 담아뒀다가 핸들러가 붙는 순간 흘려준다.
  const pending = new Map();
  const MAX_PENDING = 50;

  const deliver = (fn, payload) => {
    try { fn(payload); } catch (err) { console.error('[gpt-term]', err); }
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[CH] !== true || d.dir !== 'm2i') return;
    const hs = handlers.get(d.kind);
    if (hs && hs.length) { hs.forEach((fn) => deliver(fn, d.payload || {})); return; }
    const q = pending.get(d.kind) || [];
    q.push(d.payload || {});
    while (q.length > MAX_PENDING) q.shift();
    pending.set(d.kind, q);
  });

  return {
    CH,
    on(kind, fn) {
      if (!handlers.has(kind)) handlers.set(kind, []);
      handlers.get(kind).push(fn);
      const q = pending.get(kind);
      if (q && q.length) { pending.delete(kind); q.forEach((payload) => deliver(fn, payload)); }
    },
    toMain(kind, payload) {
      window.postMessage({ [CH]: true, dir: 'i2m', kind, payload: payload || {} }, location.origin);
    },
    // 서비스 워커로 보내는 유일한 통로.
    // 콜백을 반드시 넘긴다 — 콜백이 없으면 전달 실패가 unchecked runtime.lastError 가 되어
    // try/catch 로 잡히지 않고 chrome://extensions 에 빨간 에러로 남는다.
    // chrome.runtime.id 검사는 언팩 확장을 리로드했을 때(컨텍스트 무효화) 터지는 걸 막는다.
    sendToSW(msg) {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return;
        chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
      } catch (_) { /* 컨텍스트가 이미 죽었다 */ }
    },
    log(...a) { console.debug('[gpt-term]', ...a); }
  };
})();
