// gpt-term — 좌측 대화 목록 페인.
// 데이터는 GT.chats 가 준다. 여기는 그리기·선택·필터·키 처리만 한다.
GT.sidebar = (function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

  let root = null, listEl = null, footEl = null, filterEl = null;
  const COLLAPSED_KEY = 'sidebar.collapsed';

  let rows = [];          // flatten 결과
  let visibleRows = [];   // 필터 적용 후
  let sel = 0;
  let filtering = false;
  let query = '';
  let source = 'none';
  let total = 0;
  let loaded = 0;
  let hasMore = false;
  let loading = false;
  let collapsed = new Set();

  async function loadCollapsed() {
    try {
      const got = await chrome.storage.local.get(COLLAPSED_KEY);
      collapsed = new Set(got[COLLAPSED_KEY] || []);
    } catch (_) { collapsed = new Set(); }
  }

  async function saveCollapsed() {
    try { await chrome.storage.local.set({ [COLLAPSED_KEY]: [...collapsed] }); } catch (_) {}
  }

  function toggleGroup(key) {
    if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
    saveCollapsed();
    rebuild();
  }

  const currentId = () => {
    const m = /^\/c\/([0-9a-f-]+)/.exec(location.pathname);
    return m ? m[1] : null;
  };

  function applyFilter() {
    if (!query) { visibleRows = rows; return; }
    const hits = [];
    rows.forEach((r) => {
      if (r.kind !== 'chat') return;
      const m = GT.palette.fuzzy ? GT.palette.fuzzy(query, r.title) : null;
      if (m) hits.push({ ...r, _hits: m.hits, _score: m.score });
    });
    hits.sort((a, b) => b._score - a._score);
    visibleRows = hits;
  }

  function chatRows() { return visibleRows.filter((r) => r.kind === 'chat'); }

  function draw() {
    if (!root) return;
    listEl.textContent = '';
    const cur = currentId();
    let chatIndex = -1;

    visibleRows.forEach((r) => {
      if (r.kind === 'header') {
        const h = el('div', 'gt-sb-head');
        h.appendChild(el('span', 'gt-sb-caret', r.collapsed ? '▸' : '▾'));
        h.appendChild(el('span', 'gt-sb-headlabel', r.label));
        h.appendChild(el('span', 'gt-sb-count', String(r.count)));
        h.addEventListener('mousedown', (e) => { e.preventDefault(); toggleGroup(r.key); });
        listEl.appendChild(h);
        return;
      }
      chatIndex += 1;
      const isSel = filtering && chatIndex === sel;
      const isCur = cur && r.id === cur;
      const row = el('div', 'gt-sb-row');
      if (isSel) row.dataset.sel = '1';
      if (isCur) row.dataset.cur = '1';
      row.appendChild(el('span', 'gt-sb-mark', isCur ? '❯' : ' '));
      const t = el('span', 'gt-sb-title');
      if (r._hits && GT.palette.highlight) t.appendChild(GT.palette.highlight(r.title, r._hits));
      else t.textContent = r.title;
      row.appendChild(t);
      if (r.pinned) row.appendChild(el('span', 'gt-sb-pin', '★'));
      const dots = el('span', 'gt-sb-dots', '⋯');
      dots.title = '대화 메뉴';
      dots.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); menu(r, dots); });
      row.appendChild(dots);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); open(r); });
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(r, row); });
      listEl.appendChild(row);
    });

    if (!visibleRows.length) {
      const why = loading ? '읽는 중…'
        : source === 'none' ? '목록을 얻지 못했다 — :health'
        : query ? '일치 없음'
        : '대화 없음';
      listEl.appendChild(el('div', 'gt-sb-empty', why));
    }

    // 검색은 이미 읽어온 것만 훑는다. 전부인 척하지 않는다.
    if (filtering && hasMore) {
      listEl.appendChild(el('div', 'gt-sb-note', `읽어온 ${loaded}개에서만 검색 중 (전체 ${total})`));
    }

    if (!filtering && hasMore) {
      const more = el('div', 'gt-sb-more');
      more.appendChild(el('span', null, loading ? '읽는 중…' : `… ${total - loaded}개 더`));
      if (!loading) more.appendChild(el('span', 'gt-sb-hint', '⏎'));
      more.addEventListener('mousedown', (e) => { e.preventDefault(); loadMore(); });
      listEl.appendChild(more);
    }

    footEl.textContent = '';
    const n = chatRows().length;
    footEl.appendChild(el('span', null, query ? `${n} / ${loaded}` : `${loaded} / ${total}`));
    footEl.appendChild(el('span', 'gt-spacer'));
    const src = el('span', 'gt-sb-src', source);
    if (source === 'cache') src.dataset.stale = '1';
    if (source === 'none') src.dataset.bad = '1';
    footEl.appendChild(src);

    filterEl.hidden = !filtering;
    if (filtering) filterEl.querySelector('input').value = query;
  }

  // 원본 사이드바의 "..." 에 해당한다. 동작은 백엔드를 직접 부른다(GT.convops).
  let menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function menu(rec, anchor) {
    closeMenu();
    const box = el('div', 'gt-ctx');
    const rect = anchor.getBoundingClientRect();
    const host = GT.tty.shadow.querySelector('.gt-root').getBoundingClientRect();
    box.style.top = Math.round(rect.bottom - host.top + 2) + 'px';
    box.style.left = Math.round(rect.left - host.left) + 'px';

    const act = (label, fn, danger) => {
      const it = el('div', 'gt-ctx-item', label);
      if (danger) it.dataset.danger = '1';
      it.addEventListener('mousedown', async (e) => {
        e.preventDefault(); e.stopPropagation();
        closeMenu();
        try { await fn(); } catch (err) { GT.tty.system('error', `실패: ${err.message}`); }
      });
      box.appendChild(it);
      return it;
    };

    // 모달을 띄우지 않는다. 입력줄에 명령을 채워주고 편집하게 한다 — 터미널이 그렇게 동작한다.
    act('이름 바꾸기', () => {
      const inp = GT.tty.ui.input;
      inp.value = `:rename ${rec.id.slice(0, 8)} ${rec.title}`;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      GT.tty.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
      GT.tty.system('info', '이름을 고치고 Enter');
    });

    act(rec.pinned ? '고정 해제' : '채팅 고정', async () => {
      await GT.convops.pin(rec.id, !rec.pinned);
      GT.tty.system('info', rec.pinned ? '고정 해제됨' : '고정됨');
      await refresh();
    });

    act('아카이브에 보관', async () => {
      await GT.convops.archive(rec.id, true);
      GT.tty.system('info', `보관됨 — :archive ${rec.id.slice(0, 8)} off 로 되돌린다`);
      if (currentId() === rec.id) GT.navigate.newChat();
      await refresh();
    });

    // 삭제는 되돌릴 수 없다. 한 번 더 누르게 한다.
    const del = act('삭제', () => {}, true);
    del.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (del.dataset.armed) return;
      del.dataset.armed = '1';
      del.textContent = '정말 삭제? 한 번 더';
      setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = '삭제'; } }, 4000);
      const once = async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        del.removeEventListener('mousedown', once);
        closeMenu();
        try {
          await GT.convops.remove(rec.id);
          GT.tty.system('warn', `삭제 요청: ${rec.title}`);
          if (currentId() === rec.id) GT.navigate.newChat();
          await refresh();
        } catch (err) { GT.tty.system('error', `삭제 실패: ${err.message}`); }
      };
      setTimeout(() => del.addEventListener('mousedown', once), 0);
    }, true);

    const note = el('div', 'gt-ctx-note', '공유·프로젝트 이동은 :q 로 원본에서');
    box.appendChild(note);

    GT.tty.shadow.querySelector('.gt-root').appendChild(box);
    menuEl = box;
    setTimeout(() => {
      const away = (e) => {
        if (menuEl && !menuEl.contains(e.composedPath ? e.composedPath()[0] : e.target)) {
          closeMenu();
          GT.tty.shadow.removeEventListener('mousedown', away, true);
        }
      };
      GT.tty.shadow.addEventListener('mousedown', away, true);
    }, 0);
  }

  function open(r) {
    if (!r || !r.href) return;
    exitFilter();
    GT.navigate.to(r.href);
  }

  function enterFilter() {
    filtering = true; sel = 0;
    draw();
    const inp = filterEl.querySelector('input');
    inp.value = query; inp.focus();
  }

  function exitFilter() {
    filtering = false; query = ''; sel = 0;
    applyFilter(); draw();
    GT.tty.focus();
  }

  function move(d) {
    const n = chatRows().length;
    if (!n) return;
    sel = Math.max(0, Math.min(n - 1, sel + d));
    draw();
  }

  function build() {
    root = el('div', 'gt-sidebar');

    const head = el('div', 'gt-sb-topline');
    head.appendChild(el('span', null, 'CHATS'));
    head.appendChild(el('span', 'gt-spacer'));
    head.appendChild(el('span', 'gt-sb-hint', '/ 검색'));
    const shut = el('span', 'gt-sb-close', '‹');
    shut.title = '목록 접기 (^B)';
    shut.addEventListener('mousedown', (e) => { e.preventDefault(); toggle(false); });
    head.appendChild(shut);
    root.appendChild(head);

    filterEl = el('div', 'gt-sb-filter');
    filterEl.hidden = true;
    const slash = el('span', null, '/');
    const inp = el('input');
    inp.spellcheck = false;
    inp.addEventListener('input', () => { query = inp.value.trim(); sel = 0; applyFilter(); draw(); });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); exitFilter(); }
      else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); open(chatRows()[sel]); }
    });
    filterEl.appendChild(slash); filterEl.appendChild(inp);
    root.appendChild(filterEl);

    listEl = el('div', 'gt-sb-list');
    root.appendChild(listEl);

    footEl = el('div', 'gt-sb-foot');
    root.appendChild(footEl);
    return root;
  }

  function absorb(g) {
    source = g.source;
    total = g.total;
    loaded = g.loaded != null ? g.loaded : g.total;
    hasMore = !!g.hasMore;
    rows = GT.chats.flatten(g, collapsed);
    applyFilter();
  }

  // 접힘 상태만 바뀌었을 때 — 다시 읽지 않고 다시 그린다.
  function rebuild() {
    absorb(GT.chats.state);
    draw();
  }

  async function refresh() {
    if (!collapsed.size) await loadCollapsed();
    loading = true; draw();
    const g = await GT.chats.load();
    loading = false;
    absorb(g);
    draw();
    return g;
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true; draw();
    const g = await GT.chats.more();
    loading = false;
    absorb(g);
    draw();
    return g;
  }

  // 목록은 본문 위에 덮이므로 본문이 좁아지지는 않는다.
  // 다만 창이 좁으면 목록이 화면 대부분을 가리므로 처음에는 접어둔다.
  // 사용자가 손잡이를 눌러 직접 켠 경우에는 폭 규칙보다 그 의사를 우선한다.
  let forcedOpen = false;

  function shouldShow() {
    if (!GT.config.get('sidebar.visible')) return false;
    if (forcedOpen) return true;
    const min = Number(GT.config.get('sidebar.minColumns')) || 0;
    if (!min) return true;
    const size = Number(GT.config.get('font.size')) || 13;
    const cols = Math.floor(window.innerWidth / (size * 0.6));
    return cols >= min;
  }

  // 켜고 끄는 유일한 경로. 햄버거 손잡이 · Ctrl+B · :sidebar 가 모두 여기로 온다.
  async function toggle(force) {
    const cur = GT.config.get('sidebar.visible');
    const next = force === undefined ? !cur : !!force;
    forcedOpen = next;
    await GT.config.set('sidebar.visible', next);
    GT.tty.syncSidebar();
    GT.tty.refreshChrome();
    if (next) await refresh();
    return next;
  }

  const isOpen = () => !!root && root.isConnected;

  return {
    build, refresh, loadMore, rebuild, draw, shouldShow, toggle, isOpen, closeMenu,
    chats: () => rows.filter((r) => r.kind === 'chat'),
    enterFilter, exitFilter, toggleGroup,
    get hasMore() { return hasMore; },
    get filtering() { return filtering; },
    get element() { return root; },
    get source() { return source; }
  };
})();
