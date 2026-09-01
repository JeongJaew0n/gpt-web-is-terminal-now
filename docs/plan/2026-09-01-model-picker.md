# 모델 · 추론 수준 선택

- 상태: **구현됨** (2026-09-01) — 모델 전환 검증 완료, 추론 수준은 부분
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

## 한계 `[미정]`

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

## 다음에 볼 것

- 하위 메뉴를 `elementFromPoint` + 실제 좌표 기반 pointer 이벤트로 여는 방법
- 추론 수준이 localStorage 나 사용자 설정 API 에 저장되는지 (그렇다면 메뉴를 안 거쳐도 된다)

## 회귀 테스트

`test/picker.test.mjs` (18 케이스) — 가짜 Radix 메뉴로 목록 읽기·번호/이름 전환·
없는 이름일 때 후보 안내·하위 메뉴가 없을 때 사유 보고를 검사한다.
정적으로는 로케일 라벨이 **코드에** 들어가지 않았는지도 본다.
