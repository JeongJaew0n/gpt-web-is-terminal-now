# 선택 모드에서 행을 누르면 사이드바가 닫힌다

`:select` 로 들어가 대화를 고르면 목록이 통째로 비켜난다. 고르는 중에 닫히니
여러 개를 고를 수가 없다 — 기능이 성립하지 않는다.

실측: 2026-09-11

## 무엇을 봤나

행을 누른 직후 `:health` 로 상태를 찍었다.

```
사이드바: 표시=true 붙음=false 비켜남=true 직접켬=false 열면닫기=true 선택모드=true 행=40
                                  ^^^^^^^^^^
```

**`선택모드` 는 살아 있는데 `비켜남(dismissed)` 만 true 가 됐다.** 즉 선택 자체는
제대로 됐고, 사이드바를 닫은 것은 다른 코드다.

`dismissed = true` 를 쓰는 곳은 `dismiss()` 하나뿐이고, 그것을 부르는 곳은 셋이다.

| 위치 | 언제 |
|---|---|
| `sidebar.js` `open()` | 대화를 열 때 (`closeOnOpen`) |
| `index.js` Escape | esc 를 누를 때 |
| **`tty.js:162`** | **본문(= 오버레이 바깥)을 누를 때** |

선택 모드에서는 `open()` 이 불리지 않는다(행 핸들러가 `togglePick` 후 `return`).
esc 도 누르지 않았다. 남은 것은 세 번째다.

## 원인

```js
const INSIDE_OVERLAY = '.gt-sidebar, .gt-burger, .gt-ctx, .gt-palette, .gt-scrim';
root.addEventListener('mousedown', (e) => {
  …
  const el = hit(e);
  if (el && el.closest && el.closest(INSIDE_OVERLAY)) return;   // ← 여기
  GT.sidebar.dismiss();
});
```

행을 누르면 이 순서로 일어난다.

```
1. 행의 mousedown 핸들러      togglePick(id)
2.                            draw()  →  listEl.textContent = ''   ← 행이 DOM 에서 떨어진다
3. 버블이 root 까지 올라옴     el.closest('.gt-sidebar')  →  null
4.                            '바깥을 눌렀다' 고 판단  →  dismiss()
```

**이미 떨어져 나간 노드는 `closest` 로 조상을 찾을 수 없다.** 브라우저에서 확인했다.

```
붙어 있을 때  closest('.gt-sidebar')  →  찾는다
떼어낸 뒤     closest('.gt-sidebar')  →  null
```

비선택 모드에서는 이 버그가 보이지 않았다. `open()` 이 어차피 `closeOnOpen` 으로
사이드바를 닫기 때문에 결과가 같아 보였을 뿐이다.

## 고친 것

`composedPath()` 로 판단한다. **이벤트가 났을 때의 경로라 노드가 떨어져도 그대로 남는다.**

```js
const insideOverlay = (e) => {
  const path = (e.composedPath && e.composedPath()) || [];
  for (let i = 0; i < path.length; i += 1) {
    const n = path[i];
    if (n && n.nodeType === 1 && n.matches && n.matches(INSIDE_OVERLAY)) return true;
  }
  const el = hit(e);                                   // composedPath 가 없는 환경
  return !!(el && el.closest && el.closest(INSIDE_OVERLAY));
};
```

같은 실험을 브라우저에서 돌려 확인했다.

```
떨어진 행      closest  →  못 찾는다
같은 상황      composedPath 에 사이드바가  →  남아 있다
```

행 핸들러에 `stopPropagation()` 을 넣는 방법도 있었지만 쓰지 않았다.
그러면 이 행 하나만 고쳐지고, **누르는 순간 다시 그리는 다른 곳이 생기면 같은 함정에
또 빠진다.** 판단 방법 자체를 고치는 편이 근본이다.

## 회귀 방지

- 안쪽 판단을 `composedPath` 로 하는가 (`closest` 를 1차 판단으로 쓰지 않는가)
- 떨어져 나간 노드로 두 방법의 답이 갈리는가 — 이 사실 자체를 테스트로 박아 뒀다
- 본문을 눌렀을 때는 여전히 닫히는가
- 손잡이·메뉴·팔레트를 누른 것은 바깥이 아닌가

`test/sidebar.test.mjs` §7 · §7-1
