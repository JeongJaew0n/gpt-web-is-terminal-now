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
  const nav = [];
  sandbox.GT = {
    config: { get: (k) => cfg[k], set: async (k, v) => { cfg[k] = v; } },
    tty: { syncSidebar(){}, refreshChrome(){}, focus(){}, shadow: { querySelector: () => null } },
    palette: {},
    navigate: { to: (href) => nav.push(href) },
    chats: { load: async () => ({ pinned: [], projects: [], chats: [], total: 0, loaded: 0, hasMore: false, source: 'api' }),
             flatten: () => [] }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/sidebar.js', 'utf8'), sandbox, { filename: 'sidebar.js' });
  const S = sandbox.GT.sidebar;
  sandbox.__nav = nav;

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

// --- 3. 대화를 열면 목록이 비켜난다 ---
{
  const cfg = { 'sidebar.visible': true, 'sidebar.minColumns': 0, 'font.size': 13, 'sidebar.closeOnOpen': true };
  const nav = [];
  const node = () => ({ style:{}, dataset:{}, hidden:false,
    classList:{add(){},remove(){},toggle(){}}, appendChild(){}, addEventListener(){},
    querySelector:()=>({ value:'', focus(){} }), remove(){}, textContent:'',
    getBoundingClientRect:()=>({top:0,left:0,bottom:0,right:0,width:0,height:0}),
    get isConnected(){ return true; } });
  const sandbox = {
    console, Object, Set, Map, Array, Number, String, Boolean, JSON, Math, Promise, Error, Date, setTimeout,
    document: { createElement: node, querySelectorAll: () => [], querySelector: () => null },
    location: { pathname: '/' },
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } },
    innerWidth: 1400
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = {
    config: { get: (k) => cfg[k], set: async (k, v) => { cfg[k] = v; } },
    tty: { syncSidebar(){}, refreshChrome(){}, focus(){}, ui:{ input:{ value:'' } },
           shadow: { querySelector: () => null } },
    palette: {}, navigate: { to: (h) => nav.push(h) },
    chats: { load: async () => ({ pinned: [], projects: [], chats: [], total: 0, loaded: 0, hasMore: false, source: 'api' }),
             flatten: () => [] }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/sidebar.js', 'utf8'), sandbox, { filename: 'sidebar.js' });
  const S = sandbox.GT.sidebar;
  S.build();

  t('처음엔 보인다', S.shouldShow() === true);
  const gone = S.dismiss();
  t('dismiss 가 먹는다', gone === true && S.shouldShow() === false);
  t('설정은 그대로다 — 다음에도 나와야 한다', cfg['sidebar.visible'] === true);

  await S.toggle();
  t('비켜난 상태에서 ≡ 를 누르면 열린다', S.shouldShow() === true);

  await S.toggle();
  t('한 번 더 누르면 닫힌다', S.shouldShow() === false && cfg['sidebar.visible'] === false);

  await S.toggle(true);
  S.dismiss();
  t('닫힌 뒤에도 설정은 유지', cfg['sidebar.visible'] === true);
}

// --- 4. 설정으로 끌 수 있다 ---
{
  const sb = fs.readFileSync('src/content/sidebar.js', 'utf8');
  const d = fs.readFileSync('src/shared/defaults.js', 'utf8');
  const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
  t('열 때 닫는 동작이 설정에 걸려 있다', /config\.get\('sidebar\.closeOnOpen'\)\) dismiss\(\)/.test(sb));
  t('옵션 화면에 항목이 있다', /sidebar\.closeOnOpen/.test(d));
  t(':open 명령도 같은 동작', /closeOnOpen'\)\) GT\.sidebar\.dismiss\(\)/.test(cmds));
  t('토글은 DOM 이 아니라 표시 조건으로 뒤집는다', /force === undefined \? !shouldShow\(\)/.test(sb));
}

// --- 5. 보이지 않는 컨트롤이 클릭을 가로채면 안 된다 ---
{
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  const i = css.indexOf('.gt-sb-dots {');
  const block = css.slice(i, css.indexOf('}', i));
  t('숨은 ⋯ 는 클릭을 받지 않는다', /pointer-events:\s*none/.test(block));
  t('행에 마우스를 올리면 받는다', /\.gt-sb-row:hover \.gt-sb-dots \{[^}]*pointer-events:\s*auto/.test(css));
  t('왜 그런지 주석에 남겼다', /가로챈다/.test(css));
}

// --- 6. 상태를 한 줄로 볼 수 있어야 한다 (재현 안 될 때) ---
{
  const sb = fs.readFileSync('src/content/sidebar.js', 'utf8');
  const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
  t('사이드바 상태를 노출한다', /state: \(\) => \(\{/.test(sb));
  t('dismissed·forcedOpen 을 포함', /dismissed, forcedOpen, selecting/.test(sb));
  t(':health 가 찍는다', /사이드바: 표시=/.test(cmds));
}

// --- 7. 본문을 누르면 목록이 비켜난다 (오버레이 기본 동작) ---
{
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  const i = tty.indexOf("root.addEventListener('mousedown'");
  const block = tty.slice(i, i + 500);

  t('본문 mousedown 에서 dismiss 한다', /GT\.sidebar\.dismiss\(\)/.test(block));
  t('열려 있을 때만 동작', /isOpen\(\)\) return;/.test(block));
  t('좌클릭만', /e\.button !== 0\) return;/.test(block));
  t('목록 자신을 누른 건 바깥이 아니다', /\.gt-sidebar/.test(tty) && /INSIDE_OVERLAY/.test(block));
  t('손잡이를 누른 것도 제외', /\.gt-burger/.test(tty.slice(tty.indexOf('INSIDE_OVERLAY'), tty.indexOf('INSIDE_OVERLAY') + 160)));
  t('메뉴·팔레트도 제외', /gt-ctx/.test(tty) && /gt-palette/.test(tty));
  t('shadow 를 뚫고 실제 대상을 본다', /hit\(e\)/.test(block));
  t('Escape 로도 닫힌다', /Escape' && GT\.sidebar\.isOpen\(\)/.test(idx));
  t('팔레트가 열려 있으면 Escape 는 팔레트 몫', /!GT\.palette\.isOpen\(\)/.test(idx));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
