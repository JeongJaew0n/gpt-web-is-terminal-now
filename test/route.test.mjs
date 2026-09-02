// 대화를 옮겼을 때 이전 대화의 흔적이 남지 않아야 한다. esc 는 생성을 멈춘다.
import fs from 'node:fs'; import vm from 'node:vm';

function loadStore() {
  const sandbox = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Date, Error };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sandbox, { filename: 'store.js' });
  return sandbox.GT.store;
}

const results = []; const t = (n, ok) => results.push([n, ok]);
const msg = (id, role, text) => ({ id, role, text });

// --- 새 대화로 나가면 제목이 지워진다 ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', '안녕'), msg('b', 'assistant', '반가워')],
    { title: '크라운 후 통증 상담', path: '/c/abc' });
  t('대화를 열면 제목이 잡힌다', S.state.conversationTitle === '크라운 후 통증 상담');
  t('본문도 들어온다', S.state.messages.length === 2);

  S.replaceAll([], { path: '/', title: '' });
  t('새 대화로 나가면 본문이 비워진다', S.state.messages.length === 0);
  t('제목도 같이 지워진다', S.state.conversationTitle === '');
  t('경로가 갱신된다', S.state.path === '/');
}

// --- 빈 제목이 와도 '모른다' 로 넘기지 않는다 (같은 자리에서의 교체) ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: '이전 대화', path: '/c/one' });
  S.applyHarvest([msg('z', 'user', 'y')], { title: '', path: '/c/two' });
  t('다른 대화로 옮기면 이전 제목이 남지 않는다', S.state.conversationTitle === '');
  t('본문도 갈아엎는다', S.state.messages.length === 1 && S.state.messages[0].id === 'z');
}

// --- 같은 대화 안에서는 제목을 지우지 않는다 ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: '제목', path: '/c/one' });
  S.applyHarvest([msg('a', 'user', 'x'), msg('b', 'assistant', 'y')], { title: '', path: '/c/one' });
  t('같은 대화면 제목을 지키다', S.state.conversationTitle === '제목');
  t('메시지는 합쳐진다', S.state.messages.length === 2);
}

// --- setTitle 은 그대로 동작한다 (:rename) ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: '옛 이름', path: '/c/one' });
  S.setTitle('새 이름');
  t(':rename 은 즉시 반영된다', S.state.conversationTitle === '새 이름');
}

// --- 정적: 라우팅과 esc 처리 ---
{
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');

  t('대화 id 가 없으면 수확하지 않는다', /if \(GT\.conversation\.idFromPath\(\)\) \{/.test(idx));
  t('새 대화 화면에서는 store 를 바로 비운다',
    /GT\.store\.replaceAll\(\[\], \{ path: location\.pathname, title: '' \}\)/.test(idx));

  t('esc 가 생성을 멈춘다', /Escape' && GT\.compose\.stopButton\(\)/.test(idx));
  t('멈췄다고 알려준다', /중단 요청 \(esc\)/.test(idx));
  t('상태줄에 esc 를 적어둔다', /esc·\^C 중단/.test(tty));

  // 우선순위: 선택 모드 → 사이드바 → 중단
  const iSel = idx.indexOf("GT.sidebar.selecting");
  const iBar = idx.indexOf("GT.sidebar.isOpen() && !GT.palette.isOpen()");
  const iStop = idx.indexOf("GT.compose.stopButton()");
  t('선택 모드가 중단보다 먼저', iSel > 0 && iSel < iStop);
  t('사이드바 닫기가 중단보다 먼저', iBar > 0 && iBar < iStop);

  t('입력줄에서 처리한 esc 를 두 번 쓰지 않는다', /if \(e\.defaultPrevented\) return;/.test(idx));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
