// gpt-term — 오케스트레이터. 부팅 순서와 이벤트 배선만 여기 있다.
// 모듈이 하나라도 빠지면 조용히 죽지 않고 이유를 말한다.
//
// 크롬은 언팩 확장의 매니페스트를 캐시한다. 매니페스트에 파일을 추가한 뒤 확장을 다시 로드하지 않으면
// 새 파일은 주입되지 않는데 나머지 파일은 디스크의 최신본이 들어온다.
// 그러면 그 파일을 참조하는 모듈이 ReferenceError 로 죽고, 뒤따르는 모듈이 전부 무너진다.
// 페이지를 새로고침해도 매니페스트는 다시 읽지 않으므로 증상이 계속된다.
// 이 검사가 없으면 화면에 아무것도 안 뜨고 이유도 안 보인다.
(function preflight() {
  'use strict';
  const missing = [];
  if (typeof GT === 'undefined') missing.push('GT (protocol.js)');
  else ['config', 'oai', 'store', 'chats', 'conversation', 'convops', 'markdown', 'renderplan', 'theme', 'tty', 'palette', 'sidebar', 'compose', 'picker', 'navigate', 'commands', 'health']
    .forEach((k) => { if (!GT[k]) missing.push('GT.' + k); });
  if (typeof GT_DEFAULTS === 'undefined') missing.push('GT_DEFAULTS (shared/defaults.js)');
  if (!missing.length) return;

  console.error(
    '[gpt-term] 모듈이 로드되지 않았다: ' + missing.join(', ') +
    '\nchrome://extensions 에서 gpt-term 카드의 ↻ 를 눌러 확장을 다시 로드한 뒤 이 페이지를 새로고침해라. ' +
    '(제거 후 재설치할 필요 없다)'
  );

  const show = () => {
    if (document.getElementById('gpt-term-preflight')) return;
    const box = document.createElement('div');
    box.id = 'gpt-term-preflight';
    box.setAttribute('style', [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'background:#161b22', 'color:#c9d1d9', 'border:1px solid #f85149',
      'padding:14px 16px', 'font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
      'display:flex', 'gap:14px', 'align-items:flex-start'
    ].join(';'));
    const tag = document.createElement('span');
    tag.textContent = '[error]';
    tag.setAttribute('style', 'color:#f85149;flex:0 0 auto');
    const body = document.createElement('div');
    body.style.flex = '1';
    const l1 = document.createElement('div');
    l1.textContent = 'gpt-term 이 로드되지 않았다 — ' + missing.join(', ');
    const l2 = document.createElement('div');
    l2.setAttribute('style', 'color:#8b949e;margin-top:4px');
    l2.textContent = 'chrome://extensions 에서 gpt-term 의 ↻ 를 누르고 이 페이지를 새로고침해라. 제거 후 재설치할 필요 없다.';
    body.appendChild(l1); body.appendChild(l2);
    const close = document.createElement('button');
    close.textContent = '닫기';
    close.setAttribute('style', 'background:none;border:1px solid #30363d;color:#8b949e;font:inherit;padding:2px 10px;cursor:pointer');
    close.addEventListener('click', () => box.remove());
    box.appendChild(tag); box.appendChild(body); box.appendChild(close);
    (document.body || document.documentElement).appendChild(box);
  };

  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show, { once: true });
})();

(async function boot() {
  'use strict';

  // 모듈이 빠졌으면 부팅하지 않는다. 위 preflight 가 이미 알렸다.
  if (typeof GT === 'undefined' || !GT.config || !GT.tty || !GT.health) return;

  // ---------------------------------------------------------------- 생명주기
  //
  // 확장을 다시 로드(chrome://extensions 의 ↻)하면 이미 주입된 콘텐츠 스크립트는
  // '고아'가 된다 — chrome.* 는 죽지만 타이머·옵저버·키 리스너는 그대로 살아 돈다.
  // 정리하지 않으면 죽은 터미널이 화면을 덮은 채 키 입력을 계속 가로채고,
  // 매 틱마다 무효화된 컨텍스트를 건드려 오류를 만든다.
  // 그래서 등록하는 모든 것을 추적하고, 무효화를 감지하면 스스로 물러난다.
  const disposers = [];
  let gone = false;

  const every = (ms, fn) => { const t = setInterval(fn, ms); disposers.push(() => clearInterval(t)); return t; };
  const listen = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  const observe = (obs, node, cfg) => { obs.observe(node, cfg); disposers.push(() => obs.disconnect()); };

  function shutdown(why) {
    if (gone) return;
    gone = true;
    disposers.forEach((d) => { try { d(); } catch (_) {} });
    disposers.length = 0;
    try { GT.tty.destroy(); } catch (_) {}
    console.debug('[gpt-term] 물러남:', why, '— 페이지를 새로고침하면 새 코드로 다시 붙는다');
    notifyGone(why);
  }

  // 조용히 사라지면 원본 UI 가 그대로 보이는데, 그게 터미널인 줄 알고
  // "왜 안 되지?" 를 헤매게 된다. 실제로 그렇게 헷갈린 적이 있다.
  // 작게, 그러나 눈에 보이게 알린다.
  function notifyGone(why) {
    if (document.getElementById('gpt-term-gone')) return;
    const box = document.createElement('div');
    box.id = 'gpt-term-gone';
    box.setAttribute('style', [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'background:#161b22', 'color:#c9d1d9', 'border:1px solid #d29922',
      'padding:10px 14px', 'font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
      'display:flex', 'gap:12px', 'align-items:center', 'max-width:420px'
    ].join(';'));
    const txt = document.createElement('div');
    txt.textContent = `gpt-term 이 물러났다 (${why}). 지금 보이는 건 원본 UI 다 — 페이지를 새로고침해라.`;
    const close = document.createElement('button');
    close.textContent = '닫기';
    close.setAttribute('style', 'background:none;border:1px solid #30363d;color:#8b949e;font:inherit;padding:2px 8px;cursor:pointer;flex:0 0 auto');
    close.addEventListener('click', () => box.remove());
    box.appendChild(txt); box.appendChild(close);
    (document.body || document.documentElement).appendChild(box);
  }

  const contextAlive = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  };

  // ---------------------------------------------------------- MAIN world 배선
  // await 보다 먼저 붙인다. tap 은 document_start 에 곧바로 쏘기 때문에
  // 여기서 한 박자라도 늦으면 ready 를 놓친다(놓친 건 protocol 의 버퍼가 받아둔다).
  let tapSeen = false;
  const markTap = () => { if (!tapSeen) { tapSeen = true; GT.health.pass('tap'); } };
  GT.on('ready', markTap);
  GT.on('pong', markTap);
  GT.on('broken', (p) => GT.health.fail('schema', `${p.reason} ${p.detail}`));

  GT.on('harvest', (p) => {
    const r = GT.store.applyHarvest(p.messages || [], { title: cleanTitle(p.title), path: p.path });
    if (r.mode === 'merge' && r.kept) {
      // 원본이 앞쪽 턴을 안 그린 상태다. 우리가 이미 가진 것을 지켜서 넘어간다.
      GT.log(`수확이 ${r.kept}건 적게 봤다 — 기존 레코드를 유지한다`);
    }
    const verdict = GT.health.fiberVerdict(p.fiberEligible || 0, p.fiberHits || 0);
    if (verdict === 'broken') {
      GT.health.CHECKS.fiber.ok = false;
      GT.health.soft('fiber 에서 마크다운 원문을 못 읽었다 — 렌더된 텍스트로 대체한다(서식 손실)');
    } else if (verdict === 'partial') {
      GT.health.soft(`마크다운 원문을 ${p.fiberEligible - p.fiberHits}/${p.fiberEligible} 건 못 읽었다`);
    } else if (verdict === 'ok') {
      GT.health.CHECKS.fiber.ok = true;
    }
  });

  GT.on('thinking', () => GT.store.thinking());
  GT.on('user', (p) => GT.store.userSent(p.text, p.id));
  GT.on('begin', (p) => GT.store.begin(p));
  GT.on('delta', (p) => GT.store.delta(p.id, p.text));
  GT.on('end', (p) => {
    GT.store.end(p.id, p.text);
    // 응답이 끝났는데 본문을 한 번도 못 잡았다 = 판별자가 낡았다.
    if (p.began === false && (p.skipped || []).length) {
      GT.health.soft(`최종 응답을 찾지 못했다 — 건너뛴 종류: ${p.skipped.join(', ')}. 판별자가 낡았을 수 있다`);
    }
    // add 를 못 보고 본문부터 받은 스트림. 화면은 정상이지만 해석이 어긋났다는 신호다.
    if (p.orphan) {
      GT.health.soft('스트림이 메시지 생성(add) 없이 본문부터 보냈다 — 자리를 만들어 이어붙였다');
    }
    // 스트림에서 본문을 하나도 못 받았다. 화면을 비워두는 대신 정본(API)에서 다시 읽는다.
    // 스트림은 반응성용이고, 대화 원본이 정답이다.
    if (p.began === false) {
      setTimeout(() => pull('stream-empty'), 600);
    }
    if (p.totalOps && p.unknownOps / p.totalOps > 0.2) {
      GT.health.soft(`알 수 없는 델타 op ${p.unknownOps}/${p.totalOps} — 스키마가 바뀌었을 수 있다`);
    }
    // 스트림 결과를 fiber 원문과 대조한다
    setTimeout(() => GT.toMain('verify', { id: p.id }), 400);
    if (GT.config.get('bell') === 'visual') flash();
  });
  GT.on('verify', (p) => {
    const rec = p.id && GT.store.state.byId.get(p.id);
    if (!rec || !p.text) return;
    const streamed = rec.text || '';
    const fiber = p.text;

    // 원본이 아직 그리는 중이면 fiber 가 스트림보다 짧고, 스트림의 접두사다.
    // 그걸 정답으로 삼으면 화면이 오히려 짧아지고 드리프트 경고까지 뜬다.
    // 한 박자 뒤에 한 번만 다시 본다.
    if (streamed && fiber.length < streamed.length && streamed.startsWith(fiber)) {
      if (!rec.reverified) {
        rec.reverified = true;
        setTimeout(() => GT.toMain('verify', { id: p.id }), 900);
      }
      return;
    }

    // fiber 원문이 정답이다. 먼저 화면을 교정하고, 대조는 경고 목적으로만 한다.
    rec.text = fiber;
    GT.tty.render();
    GT.health.reconcile(streamed, fiber);
  });

  // -------------------------------------------------------------- 부팅 시퀀스
  const cfg = await GT.config.load();

  const domReady = () => new Promise((r) => {
    if (document.body) return r();
    new MutationObserver((_, o) => { if (document.body) { o.disconnect(); r(); } })
      .observe(document.documentElement, { childList: true, subtree: true });
  });
  await domReady();

  GT.tty.mount(cfg);
  GT.store.onChange(() => GT.tty.render());
  GT.config.onChange((c) => { GT.tty.applyConfig(c); GT.tty.render(); });

  function cleanTitle(t) {
    return String(t || '').replace(/\s*[-–—]\s*ChatGPT\s*$/i, '').replace(/^ChatGPT$/i, '');
  }

  function flash() {
    const m = GT.tty.ui.mode;
    if (!m) return;
    const prev = m.style.filter;
    m.style.filter = 'invert(1)';
    setTimeout(() => { m.style.filter = prev; }, 120);
  }

  // ------------------------------------------------------------------ 부팅 점검
  const waitFor = (sel, ms) => new Promise((res) => {
    const hit = () => document.querySelector(sel);
    if (hit()) return res(true);
    const t = setTimeout(() => { obs.disconnect(); res(false); }, ms);
    const obs = new MutationObserver(() => { if (hit()) { clearTimeout(t); obs.disconnect(); res(true); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });

  // tap 부터 확인한다. 실패하면 다른 점검을 15초씩 기다릴 이유가 없다.
  const waitTap = async (ms) => {
    const until = Date.now() + ms;
    while (!tapSeen && Date.now() < until) {
      GT.toMain('ping');
      await new Promise((r) => setTimeout(r, 250));
    }
    return tapSeen;
  };
  if (!(await waitTap(5000))) {
    GT.health.fail('tap', 'MAIN world 스크립트가 5초 안에 응답하지 않았다');
  }

  const okComposer = await waitFor('#prompt-textarea', 15000);
  okComposer ? GT.health.pass('composer')
             : GT.health.fail('composer', '15초 안에 나타나지 않았다');

  const okThread = await waitFor('#thread, main', 15000);
  okThread ? GT.health.pass('thread') : GT.health.fail('thread', '찾지 못했다');

  // 실제로 원본 UI 로 돌아간 경우에만 멈춘다.
  // onBreak 가 warn/ignore 면 문제를 안고서도 계속 간다 — 사용자가 그렇게 고른 것이다.
  if (GT.health.degraded) return;

  // ------------------------------------------------------------------- 입력 처리
  const input = GT.tty.ui.input;

  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 240) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('focus', () => GT.tty.setMode(GT.store.isStreaming() ? 'STREAM' : 'INSERT'));
  input.addEventListener('blur', () => GT.tty.setMode(GT.store.isStreaming() ? 'STREAM' : 'NORMAL'));

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = ''; autosize();
      const handled = await GT.commands.run(text);
      if (handled) return;
      const r = await GT.compose.send(text);
      if (!r.ok) GT.health.soft(`전송 실패(${r.reason}) — 원본 컴포저를 찾지 못했다`);
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      GT.compose.stop() ? GT.tty.system('info', '중단 요청') : GT.tty.system('warn', '중단 버튼을 찾지 못했다');
    }
  });

  // 전역 키
  listen(window, 'keydown', (e) => {
    if (e.key === '`' && e.ctrlKey) { e.preventDefault(); toggle(); return; }
    if (!GT.tty.visible()) return;
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); GT.commands.openPalette(); return; }
    if (e.key === 'b' && e.ctrlKey) { e.preventDefault(); GT.sidebar.toggle(); return; }

    // 글씨 크기. ⌘/Ctrl +/- 는 브라우저 가속키라 콘텐츠 스크립트가 못 막는다.
    // 그래서 Alt(⌥) 조합을 쓴다 — 브라우저가 쓰지 않고, 입력 처리에서도 이미 제외된다.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      // e.key 로 보면 안 된다 — macOS 에서 ⌥= 는 '≠', ⌥- 는 '–', ⌥0 은 'º' 로 온다.
      // e.code 는 물리 키라 레이아웃과 수정키의 영향을 받지 않는다.
      const zoom = {
        Equal: '+', NumpadAdd: '+',
        Minus: '-', NumpadSubtract: '-',
        Digit0: 'reset', Numpad0: 'reset'
      }[e.code];
      if (zoom) { e.preventDefault(); GT.commands.run(':font ' + zoom); return; }
    }
    if (e.key === 'Escape' && GT.sidebar.selecting) { e.preventDefault(); GT.sidebar.exitSelect(); return; }
    if (e.key === 'Escape' && GT.sidebar.isOpen() && !GT.palette.isOpen()) {
      e.preventDefault(); GT.sidebar.dismiss(); return;
    }
    // 입력창이 비어 있을 때만 '/' 를 사이드바 검색으로 가로챈다.
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !GT.sidebar.filtering
        && GT.tty.ui.input && GT.tty.ui.input.value === '' && GT.sidebar.element
        && GT.sidebar.element.isConnected) {
      e.preventDefault();
      GT.sidebar.enterFilter();
      return;
    }

    // 입력창을 먼저 클릭하지 않아도 그냥 타이핑하면 들어간다.
    //
    // 포커스만 옮기고 기본 동작에 맡기면 첫 글자가 새 포커스로 갈지 브라우저 구현에 달린다.
    // 그래서 기본 동작을 막고 우리가 직접 한 글자를 넣는다 — 두 번 들어가거나 빠지는 일이 없다.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const from = e.composedPath ? e.composedPath()[0] : e.target;
    if (from && from.closest && from.closest('input, textarea, select, [contenteditable="true"]')) return;
    const inp = GT.tty.ui.input;
    if (!inp) return;
    if (e.key.length === 1) {
      e.preventDefault();
      GT.tty.focus();
      inp.value += e.key;                 // 방금 포커스했으니 캐럿은 끝이다
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'Backspace' || e.key === 'Enter') {
      GT.tty.focus();                     // 파괴적인 키는 포커스만 옮기고 맡긴다
    }
  }, true);

  // pagehide 에서는 해체하지 않는다.
  // 진짜 언로드면 어차피 문서가 사라지므로 정리할 이유가 없고,
  // bfcache 로 들어간 것이라면 페이지가 되살아나는데 우리는 이미 자폭한 뒤다.
  // 해체는 '확장이 다시 로드됐다'는 신호 하나에만 반응한다.

  // 사이드바 — 최초 로드, 대화 전환 시 갱신, 창 크기 변화 시 표시 여부 재계산
  if (GT.sidebar.shouldShow()) GT.sidebar.refresh();
  listen(window, 'resize', () => {
    GT.tty.syncSidebar();
    if (GT.sidebar.element && GT.sidebar.element.isConnected) GT.sidebar.draw();
  });

  function toggle() {
    if (GT.health.degraded) return;
    GT.tty.visible() ? GT.tty.hide() : GT.tty.show();
    GT.sendToSW({ kind: 'visible', visible: GT.tty.visible() });
  }

  // 동기로 응답하므로 true 를 돌려주면 안 된다.
  // true 는 "나중에 응답하겠다"는 뜻이라, 처리하지 않는 메시지의 포트가 열린 채 남아
  // "message port closed before a response was received" 가 뜬다.
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (!msg) return;
    if (msg.kind === 'toggle') { toggle(); reply({ visible: GT.tty.visible() }); }
    else if (msg.kind === 'state') reply({ visible: GT.tty.visible(), degraded: GT.health.degraded });
  });

  // 라우팅(SPA) — 대화가 바뀌면 다시 수확한다
  let lastPath = location.pathname;
  every(600, () => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      pull('route').then((ok) => { if (!ok) GT.toMain('harvest'); });
      GT.sidebar.draw();                 // 현재 대화 강조를 옮긴다
    }
  });
  // 이 틱의 목적은 시계와 경과시간이다. 본문을 갈아엎을 이유가 없다.
  every(1000, () => { if (GT.tty.visible()) GT.tty.renderChrome(); });

  // 확장이 다시 로드됐는지 지켜본다. 감지되면 조용히 물러난다.
  every(4000, () => { if (!contextAlive()) shutdown('확장이 다시 로드됨'); });

  // 대화 본문은 백엔드에서 직접 읽는 게 정답이다.
  // DOM 은 원본이 그려준 만큼만 보여준다(진입 경로에 따라 앞쪽 턴이 통째로 빠진다).
  // 실패하면 DOM 수확으로 내려간다.
  async function pull(why) {
    const id = GT.conversation.idFromPath();
    if (!id) return false;
    try {
      const conv = await GT.conversation.load(id);
      if (!conv) return false;
      GT.store.applyHarvest(conv.messages, { title: conv.title, path: location.pathname });
      GT.log(`대화 원본 ${conv.messages.length}건 (${why})`);
      return true;
    } catch (e) {
      GT.log('대화 원본 API 실패 — DOM 수확으로 내려간다:', e.message);
      return false;
    }
  }

  // 첫 로드 — API 를 먼저 시도하고, 안 되면 원본이 스레드를 붙일 시간을 주고 수확한다
  pull('boot').then((ok) => { if (!ok) setTimeout(() => GT.toMain('harvest'), 1200); });

  // 원본은 턴을 한 번에 다 그리지 않는다(진입 경로에 따라 앞쪽이 늦게 붙거나 아예 안 붙는다).
  // 한 번 수확하고 끝내면 그 차이가 그대로 스크롤백의 구멍이 된다.
  // 그래서 메시지 노드 집합이 변할 때마다 다시 수확한다.
  (function watchThread() {
    const countMsgs = () => document.querySelectorAll('[data-message-id]').length;
    let last = countMsgs();
    let timer = 0;
    const obs = new MutationObserver(() => {
      const now = countMsgs();
      if (now === last) return;
      last = now;
      clearTimeout(timer);
      timer = setTimeout(() => GT.toMain('harvest'), 400);
    });
    const root = document.getElementById('thread') || document.querySelector('main');
    if (root) observe(obs, root, { childList: true, subtree: true });
  })();

  if (cfg.enabled) GT.tty.show();
  GT.health.report();
  GT.tty.system('info', `gpt-term 0.1.0 · build ${GT_BUILD} — :help 로 명령, ^\` 로 원본 토글`);
})();
