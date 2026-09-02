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
  t('추론 항목은 슬라이더 보유로 식별한다', /querySelector\('\[role="slider"\]'\)/.test(src));
  t('화살표 키로 조작한다', /ArrowRight/.test(src) && /ArrowLeft/.test(src));
  t('모델은 menuitemradio 로 식별', /menuitemradio/.test(src));
  t('현재값은 aria-checked 로', /aria-checked/.test(src));
  t('메뉴를 반드시 닫는다', (src.match(/await close\(\)/g) || []).length >= 6);
}

// --- 동작: 가짜 Radix 메뉴로 ---
function world(opt) {
  const o = opt || {};
  const mk = (role, text, checked, extra) => {
    const el = {
      role, text, checked, clicks: 0,
      getAttribute: (k) => (k === 'role' ? role : k === 'aria-checked' ? checked
        : k === 'aria-describedby' ? (extra && extra.describedby) || null : null),
      textContent: text, focus(){}, click(){ el.clicks++; },
      dispatchEvent(e){ if (extra && extra.onKey && e && e.key) extra.onKey(e.key); return true; },
      querySelector: (sel) => (extra && extra.slider && sel === '[role="slider"]' ? extra.slider : null)
    };
    return el;
  };

  // 3단계 슬라이더. 0=Instant 1=중간 2=Thinking
  const LABELS = ['Instant', '중간', 'Thinking'];
  const slider = { pos: 1, keys: [],
    getAttribute: (k) => (k === 'aria-valuemax' ? '2' : k === 'aria-valuemin' ? '0'
      : k === 'aria-valuenow' ? String(slider.pos) : null) };
  const descNode = { textContent: '' };
  const sync = () => { descNode.textContent = `${LABELS[slider.pos]}, 3개 중 ${slider.pos + 1}번째.`; };
  sync();

  const perf = mk('menuitem', '', null, {
    describedby: 'desc1', slider,
    onKey: (k) => { slider.keys.push(k);
                    if (k === 'ArrowRight' && slider.pos < 2) slider.pos++;
                    if (k === 'ArrowLeft' && slider.pos > 0) slider.pos--; sync(); }
  });

  const pillEl = {
    className: '__composer-pill x', textContent: '중간',
    getAttribute: (k) => (k === 'aria-haspopup' ? 'menu' : null),
    click(){ state.open = true; }, dispatchEvent(){ return true; }, focus(){}
  };
  const base = [mk('menuitem', '모델 선택'), perf,
                mk('menuitemradio', 'GPT-5.6 Sol', 'true'), mk('menuitemradio', 'GPT-5.5', 'false')];
  if (o.noSlider) base.splice(1, 1);
  const state = { open: false };
  const sandbox = {
    console, Object, Array, Set, Map, Number, String, Boolean, JSON, Promise, Error, Date, setTimeout,
    PointerEvent: class { constructor(t){ this.type=t; } },
    KeyboardEvent: class { constructor(t,o2){ this.type=t; Object.assign(this,o2); } },
    MouseEvent: class { constructor(t){ this.type=t; } },
    document: {
      querySelector: () => pillEl,
      getElementById: (id) => (id === 'desc1' ? descNode : null),
      querySelectorAll: (sel) => {
        if (sel === 'button') return [pillEl];
        return state.open ? base : [];
      },
      dispatchEvent(e){ if (e && e.key === 'Escape') state.open = false; return true; }
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.GT = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'picker.js' });
  return { P: sandbox.GT.picker, base, slider, state };
}

{
  const { P, base } = world();
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
}

// --- 추론 수준: 하위 메뉴가 아니라 슬라이더 ---
{
  const { P, slider } = world();
  const st = await P.effort();
  t('슬라이더에서 현재 위치를 읽는다', st && st.index === 1 && st.steps === 3);
  t('현재 라벨도 읽는다', st.label === '중간');

  const up = await P.setEffort(2);
  t('오른쪽으로 한 칸', up.ok === true && up.index === 2);
  t('ArrowRight 를 쐈다', slider.keys.join(',') === 'ArrowRight');

  slider.keys.length = 0;
  const down = await P.setEffort(0);
  t('왼쪽으로 두 칸', down.ok === true && down.index === 0);
  t('ArrowLeft 두 번', slider.keys.join(',') === 'ArrowLeft,ArrowLeft');

  slider.keys.length = 0;
  const clamp = await P.setEffort(9);
  t('범위를 벗어나면 끝으로 고정', clamp.ok === true && clamp.index === 2);

  t('마지막 라벨을 기억한다', typeof P.lastEffort === 'string');
}

// --- 슬라이더가 없으면 사유를 밝힌다 ---
{
  const { P } = world({ noSlider: true });
  t('슬라이더 없으면 null', (await P.effort()) === null);
  const r = await P.setEffort(1);
  t('실패 사유를 밝힌다', r.ok === false && r.reason === 'no-slider');
}

// --- 상대 이동을 내부에서 푼다 (메뉴를 두 번 열지 않으려고) ---
{
  const { P, slider } = world();
  slider.keys.length = 0;
  const up = await P.setEffort('+');
  t("'+' 를 직접 받는다", up.ok === true && up.index === 2);
  t("'+' 는 ArrowRight 한 번", slider.keys.join(',') === 'ArrowRight');

  slider.keys.length = 0;
  const down = await P.setEffort('-');
  t("'-' 도 받는다", down.ok === true && down.index === 1);
}

// --- 이미 그 값이면 움직이지 않는다 ---
{
  const { P, slider } = world();
  slider.keys.length = 0;
  const same = await P.setEffort(1);      // 시작이 1
  t('같은 값이면 키를 안 쏜다', slider.keys.length === 0);
  t('noop 으로 알린다', same.ok === true && same.noop === true);
}

// --- 닫힘을 단정하지 않는다 ---
{
  const src2 = fs.readFileSync('src/content/picker.js', 'utf8');
  t('close() 가 결과를 돌려준다', /return !items\(\)\.length;/.test(src2));
  t('합성 Escape 로 안 닫힌다는 사실을 주석에 남겼다', /합성 Escape 로는 이 메뉴가 닫히지 않는다/.test(src2));
  t('focus() 로 포커스를 뺏지 않는다', !/item\.focus\(\)/.test(src2));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
