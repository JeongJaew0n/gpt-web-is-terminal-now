// 콘솔 진단 로그 on/off. 껐다고 하고 계속 찍으면 껐다고 할 수 없다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

// ---- protocol 의 GT.log 를 실제로 돌린다 ----
function loadProtocol(cfg) {
  const debug = []; const error = [];
  const sb = {
    console: { debug: (...a) => debug.push(a.join(' ')), error: (...a) => error.push(a.join(' ')), warn() {}, log() {} },
    Object, Array, JSON, String, Number, Boolean, Promise, Error, Date, Map, Set,
    location: { origin: 'https://chatgpt.com' }, setTimeout
  };
  sb.window = sb; sb.globalThis = sb;
  sb.addEventListener = () => {}; sb.window.addEventListener = () => {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/protocol.js', 'utf8'), sb, { filename: 'protocol.js' });
  if (cfg !== undefined) sb.GT.config = cfg;
  return { GT: sb.GT, debug, error };
}

// --- 설정이 아직 없을 때는 찍는다 (부팅 진단을 잃지 않는다) ---
{
  const p = loadProtocol(undefined);
  p.GT.log('부팅 중');
  t('config 가 없으면 찍는다', p.debug.length === 1);
  t('접두사를 붙인다', /^\[gpt-term\]/.test(p.debug[0]));
}

// --- 켜짐 ---
{
  const p = loadProtocol({ get: (k) => (k === 'log' ? true : undefined) });
  p.GT.log('한 줄');
  t('켜져 있으면 찍는다', p.debug.length === 1);
}

// --- 꺼짐 ---
{
  const p = loadProtocol({ get: (k) => (k === 'log' ? false : undefined) });
  p.GT.log('한 줄'); p.GT.log('두 줄'); p.GT.log('세 줄');
  t('꺼져 있으면 한 줄도 안 찍는다', p.debug.length === 0);
}

// --- 설정이 undefined 를 돌려주면(키가 없으면) 찍는다 ---
{
  const p = loadProtocol({ get: () => undefined });
  p.GT.log('한 줄');
  t('값을 모르면 찍는다 — 조용히 잃지 않는다', p.debug.length === 1);
}

// --- 켰다 껐다 ---
{
  let on = true;
  const p = loadProtocol({ get: (k) => (k === 'log' ? on : undefined) });
  p.GT.log('a');
  on = false; p.GT.log('b');
  on = true; p.GT.log('c');
  t('매번 설정을 다시 본다', p.debug.length === 2);
  t('꺼진 사이의 줄만 빠진다', p.debug.every((x) => !/ b$/.test(x)));
}

// ---- :log 명령 ----
function loadCommands(initial) {
  const store = { log: initial };
  const said = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/' },
    document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/shared/defaults.js', 'utf8'), sb, { filename: 'defaults.js' });
  sb.GT = {
    theme: { names: () => ['modern-dark'] },
    config: {
      keys: () => Object.keys(sb.GT_DEFAULTS), DEFAULTS: sb.GT_DEFAULTS,
      get: (k) => (k in store ? store[k] : sb.GT_DEFAULTS[k]),
      set: async (k, v) => { store[k] = v; return v; }
    },
    chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0, conversationTitle: '' } },
    tty: { system: (lvl, x) => said.push(lvl + ':' + x), applyConfig() {}, render() {}, ui: { input: {} } },
    sidebar: { chats: () => [], isOpen: () => false }, convops: {},
    conversation: { idFromPath: () => null }, picker: {}, navigate: {},
    health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {}
  };
  vm.runInContext(fs.readFileSync('src/content/commands.js', 'utf8'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, store, said, T: sb.GT_T };
}

{
  const a = loadCommands(true);
  await a.C.run(':log');
  t('인자 없으면 현재 상태를 알려준다', a.said.some((x) => /켜짐/.test(x)));
  t('상태만 묻는 것은 바꾸지 않는다', a.store.log === true);

  await a.C.run(':log off');
  t('off 로 끈다', a.store.log === false);
  t('껐다고 알려준다', a.said.some((x) => /껐습니다/.test(x)));

  await a.C.run(':log');
  t('꺼진 상태를 알려준다', a.said.some((x) => /꺼짐/.test(x)));

  await a.C.run(':log on');
  t('on 으로 켠다', a.store.log === true);

  await a.C.run(':log toggle');
  t('toggle 로 뒤집는다', a.store.log === false);
  await a.C.run(':log toggle');
  t('다시 뒤집는다', a.store.log === true);

  await a.C.run(':log 1');
  t('1 도 켜기', a.store.log === true);
  await a.C.run(':log 0');
  t('0 도 끄기', a.store.log === false);

  const before = a.store.log;
  await a.C.run(':log 뭐라고');
  t('모르는 인자는 바꾸지 않는다', a.store.log === before);
  t('사용법을 알려준다', a.said.some((x) => /error:/.test(x) && /:log/.test(x)));

  t('자동완성이 on·off·toggle 을 준다', (() => {
    const c = a.C.complete(':log ').candidates;
    return ['on', 'off', 'toggle'].every((v) => c.includes(v));
  })());
}

// --- 설정 항목으로도 있다 ---
{
  const { T } = loadCommands(true);
  const sb = { Object, Array, String, Number, Boolean, JSON, Math };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/shared/defaults.js', 'utf8'), sb, { filename: 'defaults.js' });
  const f = sb.GT_SCHEMA.find((x) => x.key === 'log');
  t('스키마에 log 항목이 있다', !!f && f.type === 'bool');
  t('기본은 켜짐 — 조용해지는 쪽으로 몰래 바꾸지 않는다', f.def === true);
  t('라벨이 사전에 있다', sb.GT_LABEL(f) !== 'opt.log.label');
  t('도움말이 사전에 있다', sb.GT_HELP(f).length > 0);
  t('명령 문구도 사전에서 온다', T('cmd.log.desc') !== 'cmd.log.desc');
}

// --- 정본이 한 곳인가 ---
{
  const files = ['src/content/health.js', 'src/content/index.js', 'src/content/chats.js'];
  const leaked = files.filter((f) => /console\.debug/.test(fs.readFileSync(f, 'utf8')));
  t('진단 출력이 GT.log 한 곳을 지난다', leaked.length === 0);
  if (leaked.length) console.log('        직접 찍는 곳:', leaked.join(', '));

  // 하드 실패는 계속 보여야 한다 — 끌 수 있게 만들면 안 된다
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  t('preflight 오류는 console.error 로 남는다', /console\.error\(/.test(idx));
  const proto = fs.readFileSync('src/content/protocol.js', 'utf8');
  t('핸들러 예외도 console.error 로 남는다', /console\.error\('\[gpt-term\]', err\)/.test(proto));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
