// 명령 자동완성. 규칙이 흔들리지 않게 순수 함수로 검사한다.
import fs from 'node:fs'; import vm from 'node:vm';

function load() {
  const sandbox = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/' }, document: { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }) } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = {
    theme: { names: () => ['modern-dark', 'crt-green', 'amber'] },
    config: { keys: () => ['theme', 'font.size', 'sidebar.visible'], get: () => 13, DEFAULTS: {} },
    chats: { projects: () => [{ id: 'g1', name: '세무사' }, { id: 'g2', name: '공부2' }] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0 } },
    tty: { system(){}, applyConfig(){}, render(){}, ui: { input: {} } },
    sidebar: { chats: () => [], isOpen: () => false },
    picker: {}, navigate: {}, convops: {}, health: { CHECKS: {}, reasons: [] },
    conversation: {}, palette: {}, oai: {}, compose: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/commands.js', 'utf8'), sandbox, { filename: 'commands.js' });
  return sandbox.GT.commands;
}

const C = load();
const results = []; const t = (n, ok) => results.push([n, ok]);
const names = C.registry.map((c) => c.name);

// --- 명령 이름 ---
{
  const r = C.complete(':the');
  t('접두사로 명령을 찾는다', r.kind === 'command' && r.candidates.includes(':theme'));
  t('관계없는 건 빠진다', !r.candidates.includes(':rm'));

  const empty = C.complete('');
  t('빈 줄이면 전체', empty.candidates.length === names.length);

  const none = C.complete(':없는명령');
  t('없으면 빈 목록', none.candidates.length === 0);
}

// --- Tab 완성 ---
{
  t('하나면 끝까지 채우고 공백', C.applyCompletion(':the') === ':theme ');
  // ':s' 는 이미 공통 접두사라 더 채울 게 없다 — 목록만 보여주는 게 맞다
  t('이미 공통 접두사면 줄을 안 바꾼다', C.applyCompletion(':s') === null);
  t('그래도 후보는 여럿', C.complete(':s').candidates.length > 1);
  // 공통 접두사까지 채우는 경로는 직접 주입해 검사한다
  t('여럿이면 공통 접두사까지 채운다',
    C.applyCompletion(':x', { kind: 'command', token: ':x', candidates: [':xylophone', ':xylo'] }) === ':xylo');
  t('채울 게 없으면 null', C.applyCompletion(':없는명령') === null);
}

// --- 공통 접두사 ---
{
  t('공통 접두사', C.commonPrefix([':sidebar', ':select', ':share']) === ':s');
  t('하나뿐이면 그 자체', C.commonPrefix([':theme']) === ':theme');
  t('없으면 빈 문자열', C.commonPrefix([]) === '');
}

// --- 인자 완성 ---
{
  const r = C.complete(':theme ');
  t('인자 후보를 준다', r.kind === 'argument' && r.candidates.includes('modern-dark'));
  const r2 = C.complete(':theme crt');
  t('인자도 접두사로 거른다', r2.candidates.length === 1 && r2.candidates[0] === 'crt-green');
  t('인자 완성', C.applyCompletion(':theme crt') === ':theme crt-green ');

  const set = C.complete(':set ');
  t('설정 키를 준다', set.candidates.includes('font.size'));
  const eff = C.complete(':effort ');
  t('추론 수준 후보', eff.candidates.includes('낮음') && eff.candidates.includes('+'));
  const mv = C.complete(':mv 3 ');
  t('프로젝트 이름을 준다', mv.candidates.includes('세무사') && mv.candidates.includes('none'));
  const mv0 = C.complete(':mv ');
  t('첫 인자(대상)는 후보 없음', mv0.candidates.length === 0);
}

// --- 인자 완성기가 없는 명령 ---
{
  const r = C.complete(':help ');
  t('완성기 없으면 조용히 없음', r.candidates.length === 0);
}

// --- 대소문자 무시 ---
{
  t('대소문자 무시', C.complete(':THE').candidates.includes(':theme'));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
