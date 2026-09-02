# 모델 · 추론 수준 선택

- 상태: **구현 완료** (2026-09-02) — 모델·추론 수준 모두 동작
- 관련 파일: `src/content/picker.js`, `src/content/commands.js`

## 제약 — 왜 원본 메뉴를 조작하는가

우리가 직접 고를 방법이 없다. 전송은 원본이 하고(sentinel proof-of-work 때문에
자체 API 호출 불가), 모델·추론 수준은 원본이 **자기 상태에서 읽어** 요청 본문에 넣는다.
그래서 원본의 선택 메뉴를 대신 조작하는 것 말고는 길이 없다.

`GET /backend-api/models` 로 16종 목록을 받을 수는 있지만(슬러그·제목·max_tokens),
그건 **읽기**일 뿐 선택을 바꾸지 못한다.

## 확인된 구조 (2026-09-01 실측)

컴포저의 `.__composer-pill` **하나가 모델과 추론 수준을 겸한다.**

```
button.__composer-pill[aria-haspopup=menu]   라벨 = 현재 추론 수준 ("중간")
 └ 메뉴
    ├ [role=menuitem]        라벨이 현재 추론 수준. 누르면 하위 메뉴
    ├ [role=menuitemradio]   GPT-5.6 Sol   aria-checked=true   ← 현재 모델
    └ [role=menuitemradio]   GPT-5.5       aria-checked=false
```

- Radix 메뉴라 **pointerdown/pointerup 을 봐야 열린다.** `click()` 만으로는 안 열린다.
- 창이 좁으면 pill 자체가 사라진다.

## 설계 원칙 — 라벨을 로직에 쓰지 않는다

메뉴 라벨은 로케일을 탄다("중간"/"Medium"). 문자열로 분기하면 언어가 바뀌는 순간 깨진다.

- 모델 = `[role=menuitemradio]`
- 추론 수준 트리거 = **라디오가 아니면서 글자가 있는 항목**
- 현재값 = `aria-checked` 와 pill 의 라벨

사용자에게는 메뉴가 주는 라벨을 그대로 보여주고, 번호로도 고를 수 있게 했다.

## 명령

```
:model               목록 + 현재 표시
:model 1             번호로 전환
:model 5.5           이름 일부로 전환
:effort              현재값 + 가능한 값
:effort 높음         전환
```

상단바에 `gpt-5-6-thinking · 중간` 처럼 모델과 추론 수준이 함께 뜬다.
추론 수준은 우리가 따로 들고 있지 않고 **원본 pill 의 라벨을 그대로 읽는다** — 정본이 하나다.

## 추론 수준 — 하위 메뉴가 아니라 슬라이더였다 (2026-09-02)

며칠간 "하위 메뉴가 안 열린다"고 붙잡고 있었는데, **애초에 하위 메뉴가 아니었다.**

```html
[role=menuitem][aria-label="성능"]  aria-keyshortcuts="ArrowLeft ArrowRight"
  └ [role=slider] aria-valuemin=0 aria-valuemax=2      ← 3단계
     aria-describedby → "중간, 3개 중 2번째. 왼쪽/오른쪽 화살표 키로 성능을 조정합니다."
     자손: Track / Range / TickRail / Tick×3 / Thumb
```

열릴 리가 없었다. 열 것이 없었으니까. 관측한 3단계는 `Instant / 중간 / (상위)` 다.

**화살표 키를 네이티브로 쏘면 움직인다.** React 프롭을 만질 필요가 없어 isolated world 에서 끝난다.

```js
item.focus();
item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
```

### 구조로 식별한다

라벨("성능"·"중간")은 로케일을 탄다. 그래서 문자열이 아니라
**`[role="slider"]` 를 품은 메뉴 항목**으로 찾는다. 현재 위치는 `aria-valuenow`,
없으면 설명문에서 숫자만 뽑는다(`"3개 중 2번째"` → 2/3). 언어와 무관하다.

### 명령

```
:effort              현재값 + 안내
:effort 0 | 1 | 2    위치로
:effort 낮음|중간|높음  별칭 (실제 이동은 인덱스로 한다)
:effort + | -        한 칸씩
```

이동 후 실제 위치를 다시 읽어 확인한다. 안 움직였으면 그대로 보고한다.

### 되짚어볼 교훈

`aria-expanded` 가 있는 다른 항목(`aria-label="모델 선택"`)을 추론 수준 트리거로 **오인**했다.
텍스트가 "중간"이라 더 헷갈렸다. `aria-label` 을 먼저 봤으면 첫날 끝났을 일이다.
**보이는 글자가 아니라 접근성 속성이 그 컨트롤의 정체를 말해준다.**

## 옛 한계 기록 (해결됨)

**추론 수준 하위 메뉴가 합성 이벤트로 열리지 않는다.** 세 가지를 시도했다.

1. `pointerover`/`pointermove`/`pointerenter`
2. 키보드 `ArrowRight` (Radix 표준)
3. `pointerdown`/`pointerup`/`click`

셋 다 실패했다. 실제 마우스 좌표가 필요한 것으로 보이나 확정하지 못했다.

그래서 `:effort` 는 **현재값 읽기와 전환 시도까지** 하고,
열지 못하면 조용히 실패하는 대신 이렇게 말한다.

```
[warn] 하위 메뉴를 열지 못했다 — :q 로 원본 UI 에서 바꿔라
```

모델 전환은 하위 메뉴를 거치지 않으므로 **정상 동작한다.**

## TODO — 추론 수준 하위 메뉴 뚫기

**현재 유일하게 사용자가 원본 UI 를 봐야 하는 지점이다.** 나머지는 전부 터미널 안에서 끝난다.

- [ ] **좌표 기반 pointer 이벤트** — `getBoundingClientRect()` 로 트리거의 중심을 구하고
      `clientX`/`clientY` 를 실어 `pointerover` → `pointermove` → `pointerdown` 을 쏜다.
      Radix 가 좌표 없는 합성 이벤트를 무시하는 것으로 보인다 `[가정]`.
      `document.elementFromPoint()` 로 그 좌표에 실제로 트리거가 있는지 먼저 확인할 것 —
      우리 오버레이가 덮고 있으면 좌표가 엉뚱한 요소를 가리킨다.
- [ ] **저장소 경로 확인** — 추론 수준이 `localStorage` 나 사용자 설정 API
      (`/backend-api/settings` 계열)에 저장된다면 메뉴를 아예 안 거쳐도 된다.
      값을 바꾸고 원본이 그걸 읽는지 확인해야 한다.
- [ ] 뚫으면 `:effort` 의 `submenu-unavailable` 분기와 안내 문구를 제거한다.

시도해서 실패한 것(반복하지 말 것): `pointerover`/`pointermove`/`pointerenter` 좌표 없이,
키보드 `ArrowRight`(Radix 표준), `pointerdown`/`pointerup`/`click` 좌표 없이.

## 회귀 테스트

`test/picker.test.mjs` (18 케이스) — 가짜 Radix 메뉴로 목록 읽기·번호/이름 전환·
없는 이름일 때 후보 안내·하위 메뉴가 없을 때 사유 보고를 검사한다.
정적으로는 로케일 라벨이 **코드에** 들어가지 않았는지도 본다.
