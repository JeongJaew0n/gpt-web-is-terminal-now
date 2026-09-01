// gpt-term — 명령 레지스트리. 입력이 ':' 나 알려진 동사로 시작하면 명령, 아니면 메시지다.
GT.commands = (function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
  const info = (t) => GT.tty.system('info', t);
  const warn = (t) => GT.tty.system('warn', t);
  const err = (t) => GT.tty.system('error', t);

  const table = (rows) => {
    const box = el('div');
    box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '2px';
    rows.forEach(([a, b, c]) => {
      const r = el('div'); r.style.display = 'flex'; r.style.gap = '14px';
      const k = el('span', null, a); k.style.width = '190px'; k.style.flex = '0 0 auto'; k.style.color = 'var(--gt-cyan)';
      r.appendChild(k);
      if (c !== undefined) {
        const v = el('span', null, String(b)); v.style.width = '150px'; v.style.flex = '0 0 auto';
        r.appendChild(v);
        r.appendChild(el('span', 'gt-dim', String(c)));
      } else {
        r.appendChild(el('span', 'gt-dim', String(b)));
      }
      box.appendChild(r);
    });
    return box;
  };

  const REG = [];
  const def = (name, desc, run, hint) => { REG.push({ name, desc, run, hint }); };

  def(':help', '명령 목록', () => {
    GT.tty.system('info', null, table(REG.map((c) => [c.name, c.desc])));
  });

  def(':new', '새 대화', () => { GT.navigate.newChat(); });

  // ls 와 사이드바는 같은 제공자를 쓴다. 출처가 갈리면 둘이 다른 걸 보여준다.
  let lastList = [];

  def('ls', '대화 목록', async () => {
    const g = await GT.chats.load();
    // flatten 은 한 번만 부른다. 두 번 부르면 객체가 달라져 indexOf 가 -1 을 낸다.
    const flat = GT.chats.flatten(g);
    lastList = flat.filter((r) => r.kind === 'chat');
    if (!lastList.length) {
      return err('목록을 얻지 못했다 — :health 로 출처를 확인해라');
    }
    let i = -1;
    const rows = flat.map((r) => r.kind === 'header'
      ? ['', r.label, '']
      : [String(++i), r.title, r.pinned ? '★' : '']);
    GT.tty.system('info', null, table(rows));
    info(`${lastList.length} / ${g.total}개 (출처: ${g.source}) — :open <n>`);
    if (g.hasMore) info(`${g.total - g.loaded}개가 더 있다 — :sidebar more`);
  });

  def(':open', '대화 열기 — :open <n>', (args) => {
    const n = Number(args[0]);
    if (!lastList.length) return err('먼저 ls 로 목록을 불러와라');
    if (!Number.isInteger(n) || !lastList[n]) return err(`:open <0-${lastList.length - 1}>`);
    if (GT.config.get('sidebar.closeOnOpen')) GT.sidebar.dismiss();
    GT.navigate.to(lastList[n].href);
  });

  // 대화 조작 — 원본 "..." 메뉴에 해당한다.
  // 대상은 ls 번호 또는 대화 id 앞자리로 지정한다.
  function findChat(key) {
    if (key == null || key === '') return null;
    const n = Number(key);
    if (Number.isInteger(n) && lastList[n]) return lastList[n];
    const pool = lastList.concat(GT.sidebar.chats ? GT.sidebar.chats() : []);
    return pool.find((c) => c.id && c.id.startsWith(String(key)))
      || pool.find((c) => (c.title || '').toLowerCase().includes(String(key).toLowerCase()))
      || null;
  }

  const needTarget = (key) => {
    const c = findChat(key);
    if (!c) err(`대상을 못 찾았다: ${key} — ls 번호나 id 앞자리로 지정해라`);
    return c;
  };

  def(':rename', '이름 바꾸기 — :rename <n|id> <새 이름>', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    const name = args.slice(1).join(' ').trim();
    if (!name) return err(':rename <n|id> <새 이름>');
    await GT.convops.rename(c.id, name);
    info(`이름 변경: ${name}`);
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  def(':pin', '고정 — :pin <n|id> [off]', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    const on = String(args[1] || '').toLowerCase() !== 'off';
    await GT.convops.pin(c.id, on);
    info(on ? `고정: ${c.title}` : `고정 해제: ${c.title}`);
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  def(':archive', '보관 — :archive <n|id> [off]', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    const on = String(args[1] || '').toLowerCase() !== 'off';
    await GT.convops.archive(c.id, on);
    info(on ? `보관: ${c.title}` : `보관 해제: ${c.title}`);
    if (on && location.pathname === '/c/' + c.id) GT.navigate.newChat();
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  // 삭제는 되돌릴 수 없다. 확인 없이는 실행하지 않는다.
  def(':rm', '삭제 — :rm <n|id> yes', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    if (String(args[1] || '').toLowerCase() !== 'yes') {
      warn(`되돌릴 수 없다. 지우려면: :rm ${c.id.slice(0, 8)} yes`);
      return info(`대상: ${c.title}`);
    }
    await GT.convops.remove(c.id);
    warn(`삭제 요청: ${c.title}`);
    if (location.pathname === '/c/' + c.id) GT.navigate.newChat();
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  def(':select', '대화 다중 선택 모드 (원본에 없는 기능)', () => {
    if (!GT.sidebar.isOpen()) return err('사이드바를 먼저 열어라 (^B)');
    if (GT.sidebar.selecting) { GT.sidebar.exitSelect(); return info('선택 모드 종료'); }
    GT.sidebar.enterSelect();
    info('행을 클릭해 고르고, 아래 버튼으로 삭제·보관한다. esc 로 나간다');
  });

  def(':sidebar', '사이드바 — on | off | toggle | more | width <n> | clear-cache', async (args) => {
    const a = (args[0] || 'toggle').toLowerCase();
    if (a === 'more') {
      if (!GT.sidebar.hasMore) return info('더 읽을 대화가 없다');
      const g = await GT.sidebar.loadMore();
      return info(`${g.loaded} / ${g.total}개 읽음`);
    }
    if (a === 'width') {
      const n = Number(args[1]);
      if (!Number.isInteger(n)) return err(':sidebar width <16-80>');
      await GT.config.set('sidebar.width', n);
      GT.tty.applyConfig(GT.config.all);
      return info(`sidebar.width = ${n}`);
    }
    if (a === 'clear-cache') {
      const ok = await GT.chats.clearCache();
      return ok ? info('목록 캐시를 지웠다') : err('캐시를 지우지 못했다');
    }
    const next = await GT.sidebar.toggle(a === 'on' ? true : a === 'off' ? false : undefined);
    info(`사이드바 ${next ? '켬' : '끔'}`);
  });

  def(':theme', `테마 — ${GT.theme.names().join(' · ')}`, async (args) => {
    const name = args[0];
    if (!name) return info(`현재 ${GT.config.get('theme')} · 가능: ${GT.theme.names().join(', ')}`);
    if (!GT.theme.names().includes(name)) return err(`알 수 없는 테마: ${name}`);
    await GT.config.set('theme', name);
    GT.tty.applyConfig(GT.config.all);
    info(`theme = ${name}`);
  }, 'modern-dark');

  def(':config', '설정 전체 보기', () => {
    const cfg = GT.config.all;
    GT.tty.system('info', null, table(GT.config.keys().map((k) => [k, cfg[k], k === 'enabled' ? '' : ''])));
    info(':set <key> <value> 로 바꾼다');
  });

  def(':set', '설정 변경 — :set <key> <value>', async (args) => {
    const [k, ...rest] = args;
    if (!k) return err(':set <key> <value>');
    if (!GT.config.has(k)) return err(`알 수 없는 키: ${k}`);
    try {
      const v = await GT.config.set(k, rest.join(' '));
      GT.tty.applyConfig(GT.config.all);
      GT.tty.render();
      info(`${k} = ${v}`);
    } catch (e) { err(String(e.message || e)); }
  });

  def(':model', '모델 — 인자 없으면 목록, :model <n|이름> 으로 전환', async (args) => {
    const last = [...GT.store.state.messages].reverse().find((m) => m.model);
    if (!GT.picker.available()) {
      return err('원본의 모델 선택기를 찾지 못했다. 창이 좁으면 숨겨진다 — 넓히거나 :q 로 원본에서 바꿔라');
    }
    if (!args.length) {
      const list = await GT.picker.models();
      if (!list || !list.length) return err('모델 목록을 읽지 못했다');
      GT.tty.system('info', null, table(list.map((m) => [String(m.index), m.label, m.current ? '● 현재' : ''])));
      if (last) info(`직전 응답 모델 슬러그: ${last.model}`);
      return info(':model <번호|이름> 으로 전환한다');
    }
    const r = await GT.picker.chooseModel(args.join(' '));
    if (r.ok) return info(`모델 → ${r.picked}`);
    if (r.reason === 'no-match') return err(`일치하는 모델이 없다. 가능: ${(r.had || []).join(', ')}`);
    err(`전환 실패 (${r.reason})`);
  });

  def(':effort', '추론 수준 — 인자 없으면 현재값, :effort <n|이름> 으로 전환', async (args) => {
    if (!GT.picker.available()) {
      return err('원본의 선택기를 찾지 못했다. 창이 좁으면 숨겨진다 — 넓히거나 :q 로 원본에서 바꿔라');
    }
    const cur = GT.picker.current().effort;
    if (!args.length) {
      info(`현재 추론 수준: ${cur || '알 수 없음'}`);
      const list = await GT.picker.efforts();
      if (!list) {
        return warn('하위 메뉴를 열지 못했다 — 원본이 합성 이벤트로는 안 열어준다. :q 로 원본에서 바꿔라');
      }
      GT.tty.system('info', null, table(list.map((t, i) => [String(i), t, t === cur ? '● 현재' : ''])));
      return info(':effort <번호|이름> 으로 전환한다');
    }
    const r = await GT.picker.chooseEffort(args.join(' '));
    if (r.ok) return info(`추론 수준 → ${r.picked}`);
    if (r.reason === 'submenu-unavailable') {
      return warn('하위 메뉴를 열지 못했다 — :q 로 원본 UI 에서 바꿔라');
    }
    if (r.reason === 'no-match') return err(`일치 없음. 가능: ${(r.had || []).join(', ')}`);
    err(`전환 실패 (${r.reason})`);
  });

  def(':w', '대화를 마크다운으로 클립보드에 복사', async () => {
    const md = GT.store.state.messages
      .map((m) => (m.role === 'user' ? `## user\n\n${m.text}` : `## ${m.model || 'assistant'}\n\n${m.text}`))
      .join('\n\n');
    try { await navigator.clipboard.writeText(md); info(`${md.length}자 복사됨`); }
    catch (e) { err('클립보드 접근 실패 — 페이지에 포커스가 있어야 한다'); }
  });

  def('clear', '스크롤백의 시스템 출력만 지운다', () => GT.tty.clearSystem());

  def(':q', '원본 UI 로 (토글은 ^` 또는 툴바 아이콘)', () => {
    GT.tty.hide();
  });

  def(':reload', '대화를 다시 수확한다', () => { GT.toMain('harvest'); info('원본에서 다시 읽는 중'); });

  def(':version', '지금 실행 중인 코드의 빌드 시각', () => {
    info(`gpt-term 0.1.0 · build ${GT_BUILD}`);
    info('이 값이 소스를 고친 뒤에도 그대로면 확장이 다시 로드되지 않은 것이다 (chrome://extensions 의 ↻)');
  });

  def(':options', '확장 설정 화면 열기', () => {
    GT.sendToSW({ kind: 'openOptions' });
    info('설정 탭을 연다');
  });

  def(':health', '점검 상태와 경고 목록', () => {
    const rows = Object.entries(GT.health.CHECKS).map(([k, v]) => [k, v.ok ? 'ok' : 'FAIL', v.label]);
    GT.tty.system('info', null, table(rows));
    const rs = GT.health.reasons;
    if (rs.length) rs.forEach((r) => warn(r)); else info('경고 없음');
    const sup = GT.store.state.superseded;
    info(`대화 목록 출처: ${GT.sidebar.source || GT.chats.source || '미조회'}`);
    const sb = GT.sidebar.state ? GT.sidebar.state() : null;
    if (sb) {
      info(`사이드바: 표시=${sb.visible} 붙음=${sb.attached} 비켜남=${sb.dismissed} `
        + `직접켬=${sb.forcedOpen} 열면닫기=${sb.closeOnOpen} 선택모드=${sb.selecting} 행=${sb.rows}`);
    }
    info(`onBreak = ${GT.config.get('onBreak')} · 드리프트 임계 ${GT.config.get('drift.threshold')}%`);
    const orph = GT.store.state.orphanDeltas;
    if (orph) info(`add 없이 도착한 본문 델타 ${orph}건`);
    info(`턴 안에서 대체한 중간 메시지 ${sup}개` + (sup ? ' — 추론 조각으로 보인다' : ''));
  });

  function parse(line) {
    const t = line.trim();
    if (!t) return null;
    const isCmd = t.startsWith(':') || /^(ls|clear|help)\b/.test(t);
    if (!isCmd) return null;
    const parts = t.split(/\s+/);
    let name = parts[0];
    if (name === 'help') name = ':help';
    return { name, args: parts.slice(1) };
  }

  async function run(line) {
    const p = parse(line);
    if (!p) return false;
    const cmd = REG.find((c) => c.name === p.name);
    if (!cmd) { err(`알 수 없는 명령: ${p.name} — :help`); return true; }
    try { await cmd.run(p.args); } catch (e) { err(String((e && e.message) || e)); }
    return true;
  }

  return {
    registry: REG,
    run,
    parse,
    openPalette() {
      GT.palette.open(REG.map((c) => ({ name: c.name, desc: c.desc, hint: c.hint })), (item) => {
        GT.tty.ui.input.value = item.name + ' ';
        GT.tty.focus();
      });
    }
  };
})();
