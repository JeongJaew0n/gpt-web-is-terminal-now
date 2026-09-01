// 사이드바 손잡이(햄버거)와 표시 규칙.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 1. 정적: 토글 경로가 하나인가 ---
{
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  const sb = fs.readFileSync('src/content/sidebar.js', 'utf8');

  t('상단바에 손잡이가 있다', /gt-burger/.test(tty));
  t('손잡이는 글리프가 아니라 SVG 로 그린다', /createElementNS\([^)]*svg/.test(tty) && /'line'/.test(tty));
  t('손잡이 클릭이 toggle 로 간다', /burger\.addEventListener\('click'[\s\S]{0,120}GT\.sidebar\.toggle\(\)/.test(tty));
  t('사이드바 안에도 접기 손잡이', /gt-sb-close/.test(sb) && /toggle\(false\)/.test(sb));
  t('Ctrl\+B 도 같은 경로', /e\.key === 'b' && e\.ctrlKey[\s\S]{0,80}GT\.sidebar\.toggle\(\)/.test(idx));
  t(':sidebar 도 같은 경로', /GT\.sidebar\.toggle\(a === 'on'/.test(cmds));
  t('config.set 을 직접 부르는 토글이 남아 있지 않다',
    !/config\.set\('sidebar\.visible'/.test(cmds) && !/config\.set\('sidebar\.visible'/.test(idx));
  t('상태가 손잡이에 반영된다', /refreshChrome/.test(tty) && /aria-expanded/.test(tty));
}

// --- 1b. 정적: 본문을 밀어내지 않고 덮는가 ---
{
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  const block = (sel) => {
    const i = css.indexOf(sel + ' {');
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  };
  const sb = block('.gt-sidebar');
  const mid = block('.gt-middle');
  const scroll = block('.gt-scroll');

  t('사이드바가 절대 위치', /position:\s*absolute/.test(sb));
  t('좌측 상하로 붙는다', /left:\s*0/.test(sb) && /top:\s*0/.test(sb) && /bottom:\s*0/.test(sb));
  t('본문 위로 올라온다', /z-index/.test(sb));
  t('기준 컨테이너가 relative', /position:\s*relative/.test(mid));
  t('사이드바가 흐름에서 자리를 차지하지 않는다', !/flex:\s*0 0 auto/.test(sb));
  t('본문은 항상 flex:1 (폭이 줄지 않는다)', /flex:\s*1/.test(scroll));
  t('덮은 티가 나도록 그림자', /box-shadow/.test(sb));
  t('배경이 불투명해야 본문이 비치지 않는다', /background:\s*var\(--gt-bg-0\)/.test(sb));
}

// --- 2. 논리: 사용자가 직접 켜면 폭 규칙을 이긴다 ---
{
  const cfg = { 'sidebar.visible': true, 'sidebar.minColumns': 100, 'font.size': 13 };
  const sandbox = {
    console, Object, Set, Map, Array, Number, String, Boolean, JSON, Math, Promise, Error, Date,
    document: { createElement: () => ({ style:{}, dataset:{}, classList:{add(){},remove(){}}, appendChild(){}, addEventListener(){}, querySelector:()=>null, remove(){}, get isConnected(){return true;} }),
                querySelectorAll: () => [], querySelector: () => null },
    location: { pathname: '/' },
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } },
    innerWidth: 600     // 좁은 창 (100칸 미만)
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = {
    config: { get: (k) => cfg[k], set: async (k, v) => { cfg[k] = v; } },
    tty: { syncSidebar(){}, refreshChrome(){}, focus(){} },
    palette: {},
    chats: { load: async () => ({ pinned: [], projects: [], chats: [], total: 0, loaded: 0, hasMore: false, source: 'api' }),
             flatten: () => [] }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/sidebar.js', 'utf8'), sandbox, { filename: 'sidebar.js' });
  const S = sandbox.GT.sidebar;

  t('좁은 창에서는 기본적으로 접힌다', S.shouldShow() === false);
  await S.toggle(true);
  t('직접 켜면 좁아도 보인다', S.shouldShow() === true);
  await S.toggle(false);
  t('끄면 다시 숨는다', S.shouldShow() === false);
  t('설정에 반영된다', cfg['sidebar.visible'] === false);

  cfg['sidebar.minColumns'] = 0;
  await S.toggle(true);
  t('폭 규칙 0 이면 항상 표시', S.shouldShow() === true);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
