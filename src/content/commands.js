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

  def(':mv', '프로젝트로 이동 — :mv <n|id> <프로젝트|none>', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    const projects = GT.chats.projects ? GT.chats.projects() : [];
    const want = args.slice(1).join(' ').trim();

    if (!want) {
      if (!projects.length) return err('프로젝트 목록이 비었다 — ls 로 목록을 먼저 불러와라');
      GT.tty.system('info', null, table(projects.map((p, i) => [String(i), p.name, ''])));
      return info(`:mv ${args[0]} <번호|이름>  ·  빼려면 :mv ${args[0]} none`);
    }

    let gid = '';
    if (!/^(none|없음|-)$/i.test(want)) {
      const n = Number(want);
      const p = (Number.isInteger(n) && projects[n])
        || projects.find((x) => x.name.toLowerCase().includes(want.toLowerCase()));
      if (!p) return err(`일치하는 프로젝트가 없다. 가능: ${projects.map((x) => x.name).join(', ')}`);
      gid = p.id;
    }

    const r = await GT.convops.moveToProject(c.id, gid);
    if (!r.ok) {
      return err(r.reason === 'not-applied'
        ? '요청은 받아들여졌는데 실제로 안 바뀌었다 — 원본이 바뀌었을 수 있다'
        : `이동 실패 (${r.reason})`);
    }
    const name = gid ? (projects.find((x) => x.id === gid) || {}).name : null;
    info(name ? `${c.title} → ${name}` : `${c.title} → 프로젝트에서 뺐다`);
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  // 공유는 공개 링크를 만든다. API 로 곧장 만들지 않고 원본 대화상자를 띄운다 —
  // 무엇이 공개되는지 ChatGPT 자신의 확인 절차를 거치게 한다.
  def(':share', '공유 — 원본 공유 대화상자를 연다', async (args) => {
    const c = args.length ? needTarget(args[0]) : null;
    if (args.length && !c) return;
    const id = c ? c.id : GT.conversation.idFromPath();
    if (!id) return err('공유할 대화를 특정하지 못했다 — :share <n|id>');

    if (location.pathname !== '/c/' + id) {
      GT.navigate.to('/c/' + id);
      await new Promise((r) => setTimeout(r, 1200));
    }
    const btn = document.querySelector(GT.convops.SHARE_BUTTON);
    if (!btn) return err('원본의 공유 버튼을 찾지 못했다 — 창이 좁으면 숨겨진다');

    // 대화상자는 원본 UI 위에 뜬다. 터미널을 덮어둔 채로는 보이지 않는다.
    GT.tty.hide();
    btn.click();
    warn('원본 공유 대화상자를 열었다 — 링크를 만들면 대화가 공개된다. 끝나면 ^` 로 돌아온다');
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

  // 글씨 크기. 브라우저 확대(⌘ +/-)는 페이지 전체를 키우고, 이건 터미널만 키운다.
  def(':font', '글씨 크기 — :font <10-24 | + | - | reset>', async (args) => {
    const MIN = 10, MAX = 24;
    const cur = Number(GT.config.get('font.size')) || 13;
    const a = String(args[0] || '').toLowerCase();
    let next;
    if (!a) {
      info(`글씨 크기 ${cur}px (${MIN}–${MAX})`);
      return info(':font +  ·  :font -  ·  :font 15  ·  :font reset   (⌥= / ⌥- / ⌥0)');
    }
    if (a === '+') next = cur + 1;
    else if (a === '-') next = cur - 1;
    else if (a === 'reset') next = GT.config.DEFAULTS['font.size'];
    else if (/^\d+$/.test(a)) next = Number(a);
    else return err(':font <10-24 | + | - | reset>');

    next = Math.max(MIN, Math.min(MAX, next));
    if (next === cur) return info(`이미 ${cur}px`);
    await GT.config.set('font.size', next);
    GT.tty.applyConfig(GT.config.all);
    GT.tty.render();
    info(`글씨 크기 ${cur} → ${next}px`);
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

  def(':effort', '추론 수준 — :effort <0-2 | 낮음|중간|높음 | + | ->', async (args) => {
    if (!GT.picker.available()) {
      return err('원본의 선택기를 찾지 못했다. 창이 좁으면 숨겨진다 — 넓히거나 :q 로 원본에서 바꿔라');
    }

    if (!args.length) {
      const cur = await GT.picker.effort();
      if (!cur) return err('추론 수준을 읽지 못했다 — :health 확인');
      info(`추론 수준: ${cur.label} (${cur.index + 1}/${cur.steps})`);
      return info(':effort 0 · 1 · 2 또는 낮음/중간/높음, +/- 로 한 칸씩');
    }

    // 라벨은 로케일을 타므로 이름은 별칭으로만 받고 실제 이동은 인덱스로 한다.
    const ALIAS = { '낮음': 0, low: 0, instant: 0, '중간': 1, mid: 1, medium: 1,
                    '높음': 2, high: 2, thinking: 2 };
    const a = String(args[0]).toLowerCase();
    let want;
    if (a === '+' || a === '-') want = a;
    else if (Object.prototype.hasOwnProperty.call(ALIAS, a)) want = ALIAS[a];
    else if (/^\d+$/.test(a)) want = Number(a);
    else return err(':effort <0-2 | 낮음|중간|높음 | + | ->');

    // 진행 상태는 상단바가 보여준다(⠴ 중간 →). 스크롤백에 남기지 않는다.
    const r = await GT.picker.setEffort(want);
    if (r.ok) {
      return info(r.noop ? `이미 ${r.label}` : `추론 수준 → ${r.label} (${r.index + 1}/${r.steps})`);
    }
    if (r.reason === 'no-move') return err(`움직이지 않았다 (${r.from} → ${r.to}). 원본이 바뀌었을 수 있다`);
    err(`전환 실패 (${r.reason})`);
  });

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
