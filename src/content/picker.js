// gpt-term — 모델 · 추론 수준 선택.
//
// 우리가 직접 고를 방법은 없다. 전송은 원본이 하고(sentinel proof-of-work),
// 모델·추론 수준은 원본이 자기 상태에서 읽어 요청 본문에 넣는다.
// 그래서 원본의 선택 메뉴를 대신 조작한다.
//
// 확인된 구조(2026-09-01):
//   컴포저의 `.__composer-pill`(aria-haspopup=menu) 하나가 모델과 추론 수준을 겸한다.
//     [role=menuitemradio]  → 모델 후보. aria-checked 가 현재 모델
//     [role=menuitem]       → 추론 수준. 라벨이 현재값이고 누르면 하위 메뉴가 열린다
//   Radix 메뉴라 pointerdown/pointerup 을 봐야 열린다. click 만으로는 안 열린다.
//
// 라벨은 로케일을 탄다("중간"). 그래서 문자열을 로직에 쓰지 않는다 —
// '라디오가 아니면서 글자가 있는 항목'이 추론 수준 트리거다.
GT.picker = (function () {
  'use strict';

  const PILL = '.__composer-pill';
  const ITEM = '[role="menuitem"],[role="menuitemradio"]';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const pointer = (el, type) => el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, button: 0, isPrimary: true
  }));

  function pill() {
    return [...document.querySelectorAll('button')]
      .find((b) => String(b.className).includes('__composer-pill') && b.getAttribute('aria-haspopup') === 'menu')
      || document.querySelector(PILL);
  }

  function items() { return [...document.querySelectorAll(ITEM)]; }

  async function open() {
    const p = pill();
    if (!p) return false;
    if (items().length) return true;          // 이미 열려 있다
    pointer(p, 'pointerdown'); pointer(p, 'pointerup'); p.click();
    for (let i = 0; i < 12; i += 1) { await wait(80); if (items().length) return true; }
    return false;
  }

  async function close() {
    for (let i = 0; i < 3 && items().length; i += 1) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(120);
    }
  }

  const label = (el) => (el.textContent || '').trim();

  // 현재 상태는 메뉴를 열지 않고도 읽을 수 있다
  function current() {
    const p = pill();
    return { effort: p ? label(p) : null };
  }

  async function models() {
    if (!(await open())) return null;
    const out = items()
      .filter((e) => e.getAttribute('role') === 'menuitemradio')
      .map((e, i) => ({ index: i, label: label(e), current: e.getAttribute('aria-checked') === 'true' }));
    await close();
    return out;
  }

  async function chooseModel(want) {
    if (!(await open())) return { ok: false, reason: 'menu-not-found' };
    const radios = items().filter((e) => e.getAttribute('role') === 'menuitemradio');
    const n = Number(want);
    const el = Number.isInteger(n) && radios[n]
      ? radios[n]
      : radios.find((e) => label(e).toLowerCase().includes(String(want).toLowerCase()));
    if (!el) { const had = radios.map(label); await close(); return { ok: false, reason: 'no-match', had }; }
    const picked = label(el);
    pointer(el, 'pointerdown'); pointer(el, 'pointerup'); el.click();
    await wait(400);
    await close();
    return { ok: true, picked };
  }

  // 추론 수준 트리거 = 라디오가 아니면서 글자가 있는 항목.
  // 라벨이 곧 현재값이다.
  function effortTrigger() {
    return items().find((e) => e.getAttribute('role') === 'menuitem' && label(e));
  }

  async function efforts() {
    if (!(await open())) return null;
    const trig = effortTrigger();
    if (!trig) { await close(); return null; }
    const before = new Set(items().map(label));

    // Radix 하위 메뉴 열기. 합성 이벤트로는 안 열리는 경우가 있어 여러 방법을 시도한다.
    trig.focus();
    ['pointerover', 'pointermove', 'pointerenter'].forEach((t) => pointer(trig, t));
    trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    pointer(trig, 'pointerdown'); pointer(trig, 'pointerup'); trig.click();
    await wait(700);

    const fresh = items().map(label).filter((t) => t && !before.has(t));
    await close();
    return fresh.length ? fresh : null;
  }

  async function chooseEffort(want) {
    if (!(await open())) return { ok: false, reason: 'menu-not-found' };
    const trig = effortTrigger();
    if (!trig) { await close(); return { ok: false, reason: 'no-trigger' }; }
    const before = new Set(items());
    trig.focus();
    ['pointerover', 'pointermove', 'pointerenter'].forEach((t) => pointer(trig, t));
    trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    pointer(trig, 'pointerdown'); pointer(trig, 'pointerup'); trig.click();
    await wait(700);

    const fresh = items().filter((e) => !before.has(e));
    if (!fresh.length) { await close(); return { ok: false, reason: 'submenu-unavailable' }; }
    const n = Number(want);
    const el = Number.isInteger(n) && fresh[n]
      ? fresh[n]
      : fresh.find((e) => label(e).toLowerCase().includes(String(want).toLowerCase()));
    if (!el) { const had = fresh.map(label); await close(); return { ok: false, reason: 'no-match', had }; }
    const picked = label(el);
    pointer(el, 'pointerdown'); pointer(el, 'pointerup'); el.click();
    await wait(400);
    await close();
    return { ok: true, picked };
  }

  return { current, models, chooseModel, efforts, chooseEffort, available: () => !!pill() };
})();
