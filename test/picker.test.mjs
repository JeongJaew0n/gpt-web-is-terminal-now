// 모델·추론 수준 선택은 원본 메뉴를 대신 조작하는 방식이다.
// 라벨이 로케일을 타므로 문자열을 로직에 쓰지 않는지, 실패를 정직하게 보고하는지 검사한다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const src = fs.readFileSync('src/content/picker.js', 'utf8');
// 주석은 예시로 로케일 라벨을 언급한다. 검사는 코드만 본다.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// --- 정적 ---
{
  t('Radix 는 pointer 이벤트로 연다', /pointerdown/.test(src) && /pointerup/.test(src));
  t('로케일 라벨을 로직에 쓰지 않는다', !/중간|빠름|높음/.test(code));
  t('추론 트리거는 역할로 식별한다', /role'\) === 'menuitem' && label\(e\)/.test(src));
  t('모델은 menuitemradio 로 식별', /menuitemradio/.test(src));
  t('현재값은 aria-checked 로', /aria-checked/.test(src));
  t('메뉴를 반드시 닫는다', (src.match(/await close\(\)/g) || []).length >= 6);
}

// --- 동작: 가짜 Radix 메뉴로 ---
function world({ withSubmenu }) {
  const mk = (role, text, checked) => {
    const el = {
      role, text, checked, clicks: 0,
      getAttribute: (k) => (k === 'role' ? role : k === 'aria-checked' ? checked : null),
      textContent: text, focus(){}, click(){ el.clicks++; },
      dispatchEvent(){ return true; }
    };
    return el;
  };
  const pillEl = {
    className: '__composer-pill x', textContent: '중간',
    getAttribute: (k) => (k === 'aria-haspopup' ? 'menu' : null),
    click(){ state.open = true; }, dispatchEvent(){ return true; }, focus(){}
  };
  const base = [mk('menuitem', '중간'), mk('menuitem', ''),
                mk('menuitemradio', 'GPT-5.6 Sol', 'true'), mk('menuitemradio', 'GPT-5.5', 'false')];
  const sub = [mk('menuitem', '빠름'), mk('menuitem', '높음')];
  const state = { open: false, subOpen: false };
  const sandbox = {
    console, Object, Array, Set, Map, Number, String, Boolean, JSON, Promise, Error, Date, setTimeout,
    PointerEvent: class { constructor(t){ this.type=t; } },
    KeyboardEvent: class { constructor(t,o){ this.type=t; Object.assign(this,o); } },
    MouseEvent: class { constructor(t){ this.type=t; } },
    document: {
      querySelector: () => pillEl,
      querySelectorAll: (sel) => {
        if (sel === 'button') return [pillEl];
        if (!state.open) return [];
        return state.subOpen && withSubmenu ? base.concat(sub) : base;
      },
      dispatchEvent(e){ if (e && e.key === 'Escape') { state.open = false; state.subOpen = false; } return true; }
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.GT = {};
  // 하위 메뉴는 트리거를 누를 때만 열린다
  base[0].dispatchEvent = () => { if (state.open) state.subOpen = true; return true; };
  base[0].click = () => { if (state.open) state.subOpen = true; base[0].clicks++; };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'picker.js' });
  return { P: sandbox.GT.picker, base, sub, state };
}

{
  const { P, base } = world({ withSubmenu: true });
  t('선택기 존재 감지', P.available() === true);
  t('현재 추론 수준을 메뉴 없이 읽는다', P.current().effort === '중간');

  const models = await P.models();
  t('모델 목록 2개', models.length === 2);
  t('현재 모델 표시', models[0].current === true && models[1].current === false);

  const r = await P.chooseModel('5.5');
  t('이름 일부로 전환', r.ok === true && r.picked === 'GPT-5.5');
  t('실제로 클릭했다', base[3].clicks === 1);

  const r2 = await P.chooseModel(0);
  t('번호로도 전환', r2.ok === true && r2.picked === 'GPT-5.6 Sol');

  const r3 = await P.chooseModel('없는모델');
  t('없으면 후보를 알려준다', r3.ok === false && r3.reason === 'no-match' && r3.had.length === 2);

  const eff = await P.efforts();
  t('하위 메뉴 항목을 읽는다', Array.isArray(eff) && eff.includes('빠름') && eff.includes('높음'));
  const r4 = await P.chooseEffort('높음');
  t('추론 수준 전환', r4.ok === true && r4.picked === '높음');
}

// 하위 메뉴가 안 열리는 환경 — 조용히 실패하면 안 된다
{
  const { P } = world({ withSubmenu: false });
  t('하위 메뉴 없으면 null', (await P.efforts()) === null);
  const r = await P.chooseEffort('높음');
  t('실패 사유를 밝힌다', r.ok === false && r.reason === 'submenu-unavailable');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
