// gpt-term — tty 셸. shadow root 안에 전부 그린다.
// 원본 UI 는 지우지 않고 opacity 0 + pointer-events none 으로 덮는다.
// 지우면 하이드레이션과 컴포저 포커스가 깨진다(원본은 살아 있어야 우리가 전송할 수 있다).
GT.tty = (function () {
  'use strict';

  const HOST_ID = 'gpt-term-host';
  const HIDE_CLASS = 'gpt-term-on';
  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

  let host = null, shadow = null, root = null, varStyle = null;
  const ui = {};
  let mode = 'NORMAL';
  const systemLog = [];

  // 원본 UI 를 덮는 스타일은 page document 에 있어야 한다(shadow root 밖).
  function pageStyle() {
    let s = document.getElementById('gpt-term-page-style');
    if (s) return s;
    s = document.createElement('style');
    s.id = 'gpt-term-page-style';
    s.textContent = `
html.${HIDE_CLASS} body > *:not(#${HOST_ID}) { opacity: 0 !important; pointer-events: none !important; }
html.${HIDE_CLASS} { overflow: hidden !important; }
#${HOST_ID} { position: fixed; inset: 0; z-index: 2147483000; }
html:not(.${HIDE_CLASS}) #${HOST_ID} { display: none; }
`;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }

  function build() {
    host = document.getElementById(HOST_ID) || el('div');
    host.id = HOST_ID;
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.textContent = '';

    const base = el('style'); base.textContent = GT.theme.CSS; shadow.appendChild(base);
    varStyle = el('style'); shadow.appendChild(varStyle);

    root = el('div', 'gt-root');

    // topbar
    const top = el('div', 'gt-topbar');

    // 대화 목록 손잡이. 원본의 햄버거 자리다.
    // 글리프 대신 그린다 — 폰트에 없는 문자에 기대지 않으려고.
    ui.burger = el('button', 'gt-burger');
    ui.burger.type = 'button';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 14 14');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
    [3, 7, 11].forEach((y) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '1.5'); line.setAttribute('x2', '12.5');
      line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y));
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-linecap', 'square');
      svg.appendChild(line);
    });
    ui.burger.appendChild(svg);
    ui.burger.addEventListener('click', (e) => { e.preventDefault(); GT.sidebar.toggle(); });
    top.appendChild(ui.burger);

    ui.dot = el('span', 'gt-dot');
    const brand = el('div'); brand.style.display = 'flex'; brand.style.alignItems = 'center'; brand.style.gap = '8px';
    brand.appendChild(ui.dot); brand.appendChild(el('span', 'gt-dim', 'gpt-term'));
    ui.title = el('div', 'gt-title', '~');
    ui.model = el('span', null, ''); ui.model.style.color = 'var(--gt-magenta)';
    ui.clock = el('span', 'gt-dim', '');
    const right = el('div'); right.style.display = 'flex'; right.style.gap = '14px'; right.style.alignItems = 'center';
    right.appendChild(ui.model); right.appendChild(ui.clock);
    top.appendChild(brand); top.appendChild(ui.title); top.appendChild(right);
    root.appendChild(top);

    // tabbar — v1 은 현재 대화 하나만 보여준다
    ui.tabs = el('div', 'gt-tabbar');
    root.appendChild(ui.tabs);

    // 중간 행 = 사이드바 + 스크롤백. 탭바·입력·상태줄은 전체 폭을 유지한다.
    ui.middle = el('div', 'gt-middle');
    ui.sidebarSlot = GT.sidebar.build();
    ui.middle.appendChild(ui.sidebarSlot);
    ui.scroll = el('div', 'gt-scroll');
    ui.middle.appendChild(ui.scroll);
    root.appendChild(ui.middle);

    // composer
    const comp = el('div', 'gt-composer');
    ui.compMeta = el('div', 'gt-composer-meta');
    const row = el('div', 'gt-composer-row');
    ui.mark = el('span', 'gt-prompt-mark', '❯');
    ui.input = el('textarea', 'gt-input');
    ui.input.rows = 1;
    ui.input.placeholder = '메시지 또는 명령 (:help)';
    ui.input.spellcheck = false;
    ui.cursor = el('span', 'gt-cursor');
    row.appendChild(ui.mark); row.appendChild(ui.input); row.appendChild(ui.cursor);
    comp.appendChild(ui.compMeta); comp.appendChild(row);
    root.appendChild(comp);

    // statusline
    const st = el('div', 'gt-status');
    ui.mode = el('span', 'gt-mode', 'NORMAL');
    ui.stat1 = el('span', 'gt-status-seg', '');
    ui.stat2 = el('span', 'gt-status-seg', '');
    ui.hint = el('span', 'gt-status-hint', '⌘K 팔레트   :help   ^C 중단');
    st.appendChild(ui.mode); st.appendChild(ui.stat1); st.appendChild(ui.stat2);
    st.appendChild(el('span', 'gt-spacer')); st.appendChild(ui.hint);
    root.appendChild(st);

    shadow.appendChild(root);
    return root;
  }

  function applyConfig(cfg) {
    if (!varStyle) return;
    varStyle.textContent = GT.theme.vars(cfg);
    syncSidebar();
    root.classList.toggle('gt-scanlines', !!cfg.scanlines);
    ui.cursor.dataset.style = cfg['cursor.style'];
    ui.cursor.dataset.blink = cfg['cursor.blink'] ? '1' : '0';
  }

  // 수확한 메시지는 at 이 null 이다 — 원본 DOM 이 시각을 노출하지 않는다.
  // 수확 시각을 대신 보여주면 "전부 46초 전"처럼 사실이 아닌 값이 찍힌다. 그럴 바엔 비운다.
  function stamp(at) {
    const cfg = GT.config.get('timestamps');
    if (cfg === 'off' || !at) return '';
    const d = new Date(at);
    if (cfg === 'absolute') return d.toLocaleTimeString('ko-KR', { hour12: false });
    const s = Math.round((Date.now() - at) / 1000);
    if (s < 60) return `${s}초 전`;
    if (s < 3600) return `${Math.round(s / 60)}분 전`;
    return d.toLocaleTimeString('ko-KR', { hour12: false });
  }

  function turnUser(m) {
    const wrap = el('div', 'gt-turn');
    const meta = el('div', 'gt-meta');
    const u = el('span', null, 'user@gpt'); u.style.color = 'var(--gt-green)';
    const p = el('span', null, GT.store.state.path); p.style.color = 'var(--gt-cyan)';
    meta.appendChild(u); meta.appendChild(p);
    meta.appendChild(el('span', 'gt-spacer'));
    meta.appendChild(el('span', null, stamp(m.at)));
    const line = el('div', 'gt-user-line');
    line.appendChild(el('span', 'gt-prompt-mark', '❯'));
    const body = el('span'); body.style.whiteSpace = 'pre-wrap'; body.style.wordBreak = 'break-word';
    body.style.maxWidth = 'var(--gt-wrap)';
    body.textContent = m.text;
    line.appendChild(body);
    wrap.appendChild(meta); wrap.appendChild(line);
    return wrap;
  }

  function turnAssistant(m) {
    const wrap = el('div', 'gt-turn');
    const meta = el('div', 'gt-meta');
    const head = el('span', null, `${m.streaming ? '⠴' : '⏺'} ${m.model || 'assistant'}`);
    head.style.color = m.streaming ? 'var(--gt-cyan)' : 'var(--gt-magenta)';
    meta.appendChild(head);
    if (m.streaming) {
      meta.appendChild(el('span', 'gt-faint', '·'));
      meta.appendChild(el('span', 'gt-faint', `${GT.store.elapsed().toFixed(1)}s`));
    }
    meta.appendChild(el('span', 'gt-spacer'));
    meta.appendChild(el('span', 'gt-faint', stamp(m.at)));

    const shell = el('div', 'gt-assistant');
    // 추론 과정 자체는 원본이 본문으로 주지 않는다. 있었다는 사실만 한 줄로 남긴다.
    if (m.thinking) {
      const th = el('div', 'gt-thinking');
      th.appendChild(el('span', null, '⏵'));
      th.appendChild(el('span', null, `thinking ×${m.thinking}`));
      wrap.appendChild(th);
    }
    if (GT.config.get('gutter.markers')) {
      const g = el('span', 'gt-gutter');
      if (m.streaming) g.dataset.streaming = '1';
      shell.appendChild(g);
    }
    const body = el('div', 'gt-body');
    body.appendChild(GT.markdown.render(m.text || ''));
    if (m.streaming) body.appendChild(el('span', 'gt-cursor'));

    // tty 로 그릴 수 없는 파트는 자리표시자로 남긴다
    const nonText = (m.parts || []).filter((t) => t && t !== 'text');
    if (nonText.length) {
      const ph = el('div', 'gt-placeholder');
      ph.appendChild(el('span', null, '▤'));
      ph.appendChild(el('span', 'gt-spacer'));
      ph.appendChild(el('span', null, `${nonText.join(', ')} — :q 로 원본에서 확인`));
      body.appendChild(ph);
    }

    shell.appendChild(body);
    wrap.appendChild(meta); wrap.appendChild(shell);
    return wrap;
  }

  function systemRow(rec) {
    const row = el('div', 'gt-sys');
    row.dataset.level = rec.level;
    row.appendChild(el('span', 'gt-sys-tag', `[${rec.level}]`));
    const b = el('span', 'gt-sys-body');
    if (rec.node) b.appendChild(rec.node); else b.textContent = rec.text;
    row.appendChild(b);
    return row;
  }

  let stickBottom = true;

  function render() {
    if (!root) return;
    const s = GT.store.state;
    stickBottom = ui.scroll.scrollTop + ui.scroll.clientHeight >= ui.scroll.scrollHeight - 40;

    ui.scroll.textContent = '';
    s.messages.forEach((m) => {
      ui.scroll.appendChild(m.role === 'user' ? turnUser(m) : turnAssistant(m));
    });
    systemLog.forEach((rec) => ui.scroll.appendChild(systemRow(rec)));

    // chrome
    ui.title.textContent = `${s.path}${s.conversationTitle ? ' — ' + s.conversationTitle : ''}`;
    const last = [...s.messages].reverse().find((m) => m.model);
    ui.model.textContent = last ? last.model : '';
    ui.clock.textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });

    ui.tabs.textContent = '';
    const tab = el('div', 'gt-tab'); tab.dataset.active = '1';
    tab.appendChild(el('span', null, '1'));
    tab.appendChild(el('span', null, s.conversationTitle || 'new'));
    if (s.streamingId) { const d = el('span', null, '⠴'); d.style.color = 'var(--gt-cyan)'; tab.appendChild(d); }
    ui.tabs.appendChild(tab);
    ui.tabs.appendChild(el('span', 'gt-spacer'));
    const plus = el('div', 'gt-tab', '+ :new'); ui.tabs.appendChild(plus);

    ui.compMeta.textContent = '';
    const g = el('span', null, 'user@gpt'); g.style.color = 'var(--gt-green)';
    const c = el('span', null, s.path); c.style.color = 'var(--gt-cyan)';
    ui.compMeta.appendChild(g); ui.compMeta.appendChild(c);
    if (ui.model.textContent) {
      const mm = el('span', null, `(${ui.model.textContent})`); mm.style.color = 'var(--gt-magenta)';
      ui.compMeta.appendChild(mm);
    }

    ui.stat1.textContent = `msg ${s.messages.length}`;
    ui.stat2.textContent = `~${(GT.store.approxChars() / 1000).toFixed(1)}k chars`;
    ui.dot.dataset.state = s.streamingId ? 'stream' : 'ok';
    refreshChrome();
    setMode(s.streamingId ? 'STREAM' : mode === 'STREAM' ? 'NORMAL' : mode);

    if (stickBottom) ui.scroll.scrollTop = ui.scroll.scrollHeight;
  }

  // 설정과 창 폭에 따라 사이드바를 붙이거나 뗀다.
  function syncSidebar() {
    if (!ui.middle || !ui.sidebarSlot) return;
    refreshChrome();
    const want = GT.sidebar.shouldShow();
    const attached = ui.sidebarSlot.parentElement === ui.middle;
    if (want && !attached) ui.middle.insertBefore(ui.sidebarSlot, ui.scroll);
    else if (!want && attached) ui.sidebarSlot.remove();
  }

  // 손잡이의 눌림 상태와 툴팁을 현재 사이드바 상태에 맞춘다.
  function refreshChrome() {
    if (!ui.burger) return;
    const open = GT.sidebar && GT.sidebar.isOpen ? GT.sidebar.isOpen() : false;
    ui.burger.dataset.open = open ? '1' : '0';
    ui.burger.title = open ? '대화 목록 접기 (^B)' : '대화 목록 펼치기 (^B)';
    ui.burger.setAttribute('aria-label', ui.burger.title);
    ui.burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setMode(m) {
    mode = m;
    if (ui.mode) { ui.mode.textContent = m; ui.mode.dataset.mode = m; }
  }

  function system(level, text, node) {
    systemLog.push({ level, text, node });
    if (systemLog.length > 60) systemLog.shift();
    render();
  }

  return {
    HOST_ID, HIDE_CLASS,
    get ui() { return ui; },
    get shadow() { return shadow; },
    mount(cfg) { pageStyle(); build(); applyConfig(cfg); return root; },
    applyConfig, syncSidebar, refreshChrome,
    render, setMode, system,
    clearSystem() { systemLog.length = 0; render(); },
    // 확장이 다시 로드되면 이 스크립트는 고아가 된다. 그때 화면에서 완전히 물러난다.
    destroy() {
      document.documentElement.classList.remove(HIDE_CLASS);
      const st = document.getElementById('gpt-term-page-style');
      if (st) st.remove();
      if (host) host.remove();
      host = null; shadow = null; root = null;
    },
    show() { document.documentElement.classList.add(HIDE_CLASS); ui.input && ui.input.focus(); },
    hide() { document.documentElement.classList.remove(HIDE_CLASS); },
    visible() { return document.documentElement.classList.contains(HIDE_CLASS); },
    focus() { ui.input && ui.input.focus(); }
  };
})();
