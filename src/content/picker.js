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

  // ------------------------------------------------------------- 추론 수준
  //
  // 하위 메뉴가 아니라 **슬라이더**다. 그래서 아무리 열려고 해도 안 열렸다(2026-09-01 실측).
  //
  //   [role=menuitem][aria-label="성능"]
  //     └ [role=slider] aria-valuemin=0 aria-valuemax=2      ← 3단계
  //        aria-keyshortcuts="ArrowLeft ArrowRight"
  //        aria-describedby → "중간, 3개 중 2번째."
  //
  // 화살표 키를 네이티브로 쏘면 움직인다 — React 프롭을 만질 필요가 없다.
  // 라벨("성능"·"중간")은 로케일을 타므로 **슬라이더를 품은 항목**으로 구조 식별한다.

  function effortItem() {
    return items().find((e) => e.querySelector && e.querySelector('[role="slider"]'));
  }

  function readEffort(item) {
    if (!item) return null;
    const slider = item.querySelector('[role="slider"]');
    const max = Number(slider && slider.getAttribute('aria-valuemax'));
    const nowAttr = slider && slider.getAttribute('aria-valuenow');
    // 설명문에서 현재 라벨과 위치를 읽는다. 숫자만 뽑으므로 언어와 무관하다.
    const ids = String(item.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const desc = ids.map((id) => {
      const n = document.getElementById(id);
      return n ? (n.textContent || '').trim() : '';
    }).join(' ');
    const nums = desc.match(/(\d+)\D+(\d+)/);       // "3개 중 2번째" / "2 of 3"
    const steps = Number.isFinite(max) && max >= 0 ? max + 1 : (nums ? Number(nums[1]) : null);
    let index = nowAttr != null && nowAttr !== '' ? Number(nowAttr) : null;
    if (index == null && nums) index = Number(nums[2]) - 1;
    const label = (desc.split(',')[0] || '').trim();
    return { index, steps, label, desc };
  }

  async function effort() {
    if (!(await open())) return null;
    const state = readEffort(effortItem());
    await close();
    return state;
  }

  async function setEffort(target) {
    if (!(await open())) return { ok: false, reason: 'menu-not-found' };
    const item = effortItem();
    if (!item) { await close(); return { ok: false, reason: 'no-slider' }; }
    const cur = readEffort(item);
    if (!cur || cur.index == null || !cur.steps) { await close(); return { ok: false, reason: 'unreadable' }; }

    const want = Math.max(0, Math.min(cur.steps - 1, Number(target)));
    if (!Number.isFinite(want)) { await close(); return { ok: false, reason: 'bad-target' }; }

    const key = want > cur.index ? 'ArrowRight' : 'ArrowLeft';
    const n = Math.abs(want - cur.index);
    item.focus();
    for (let i = 0; i < n; i += 1) {
      item.dispatchEvent(new KeyboardEvent('keydown', {
        key, bubbles: true, cancelable: true, composed: true
      }));
      await wait(250);
    }
    const after = readEffort(item);
    await close();
    if (!after || after.index !== want) {
      return { ok: false, reason: 'no-move', from: cur.index, to: after ? after.index : null };
    }
    return { ok: true, index: after.index, label: after.label, steps: after.steps };
  }

  // 옛 이름 — 하위 메뉴 모델이었던 시절의 잔재. 라벨이 곧 현재값이다.
  function effortTrigger() {
    return items().find((e) => e.getAttribute('role') === 'menuitem' && label(e));
  }

  // 상단바가 매 렌더마다 메뉴를 열 수는 없다. 마지막으로 확인한 라벨만 들고 있는다.
  let lastEffort = null;
  const remember = (st) => { if (st && st.label) lastEffort = st.label; return st; };

  return {
    current, models, chooseModel, available: () => !!pill(),
    effort: async () => remember(await effort()),
    setEffort: async (t) => { const r = await setEffort(t); if (r && r.ok) lastEffort = r.label; return r; },
    get lastEffort() { return lastEffort; }
  };
})();
