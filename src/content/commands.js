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
    GT.navigate.to(lastList[n].href);
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

  def(':model', '현재 모델 — 전환은 아직 원본 UI 에서', () => {
    const last = [...GT.store.state.messages].reverse().find((m) => m.model);
    info(last ? `현재 응답 모델: ${last.model}` : '아직 응답이 없어 모델을 알 수 없다');
    warn('모델 전환은 v1 미구현이다. :q 로 원본 UI 에서 바꾼 뒤 돌아오면 된다.');
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
