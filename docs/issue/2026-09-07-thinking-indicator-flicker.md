# '생각 중' 표시가 깜빡인다

추론이 도는 동안 `생각 중` 줄이 나왔다 사라졌다를 반복한다.

## 실측 (2026-09-07)

`chatgpt.com` 에서 shadow root 에 MutationObserver 를 걸어 `.gt-thinking-live` 의
등장·소멸을 잡고, 같은 시계에 SSE 마커를 찍어 나란히 놓았다.

```
     0ms  화면 off  n=4 md=O role=assistant stop=.
 23520ms  SSE       cot_token
 23633ms  화면 ON   n=5 md=. role=user stop=O
 23638ms  SSE       user_visible_token
 23638ms  SSE       final_channel_token
 23868ms  화면 off  n=6 md=O role=assistant stop=O
 35984ms  SSE       last_token
```

읽는 법 — `n` 은 `[data-message-id]` 노드 수, `md` 는 마지막 노드에 `.markdown` 이
있는지(= `pending` 판정의 근거), `stop` 은 원본 중단 버튼(생성 중인지의 정본).

**[확정] 표시가 살아 있던 시간은 235ms 다.** `23633ms` 에 켜져 `23868ms` 에 꺼졌다.

**[확정] 정작 모델이 일하던 구간에는 표시가 없었다.** 질문을 보낸 `0ms` 부터
첫 마커가 오는 `23520ms` 까지 23.5초 동안 아무 마커도 오지 않는다. 그 23.5초가
사용자가 기다리는 시간인데 화면은 `off` 였다.

**[확정] `cot_token` 과 `user_visible_token` 이 118ms 차이로 붙어 온다.**
전자가 표시를 켜고 후자가(`begin` 을 통해) 끈다. 표시는 그 사이에만 존재한다.

같은 대화에서 세 번 돌렸고 세 번 다 같은 모양이었다. 마커는 매번
`cot_token → user_visible_token → final_channel_token → last_token` 각 1회씩이다.

## 왜 깜빡이나

표시를 켜고 끄는 주체가 **둘이고, 서로 모른 채 각자의 시점에 뒤집는다.**

**1. SSE 마커 (`src/main/tap.js` → `store.thinking()` / `store.begin()`)**

`cot_token` 이 켜고 `user_visible_token` 이 끈다. 위에서 본 대로 둘의 간격이
100ms 대라, 이 경로만으로는 표시가 눈에 띄지도 않는다.

**2. 수확의 `pending` (`src/main/tap.js` → `index.js` → `store.setThinking()`)**

`role === 'assistant' && !md` 를 '아직 답이 없다'로 읽는다. 그런데 **원본이 그
노드에 `.markdown` 을 붙였다 뗐다 한다.** 이번 실측에서는 assistant 노드가
처음부터 `.markdown` 을 달고 나타났고(`23868ms  md=O`), 그래서 `pending` 이 한 번도
참이 되지 않았다. 반면 같은 코드에서 다른 때는 `.markdown` 없이 나타나
자리표시자 텍스트("생각 중...")가 그대로 수확됐다 — 커밋 `61187bf` 이 고친 직전 증상이
바로 그것이다. 즉 `.markdown` 유무는 **때에 따라 달라진다.**

수확은 `watchThread` 가 **메시지 노드 수가 바뀔 때마다** 돈다. 원본이 추론 단계를
그리며 노드를 넣었다 뺐다 하면 수확이 여러 번 돌고, 그때마다 `.markdown` 유무가
달라져 `setThinking(true)` 와 `setThinking(false)` 가 번갈아 불린다. **이것이
깜빡임의 직접 원인이다.**

## 뿌리

**둘 다 '지금 모델이 일하고 있는가'를 나타내는 신호가 아니다.**

- 마커는 *어떤 종류의 토큰이 방금 왔는가* 다. 안 오는 동안(=가장 오래 기다리는
  구간)에는 아무 말도 해 주지 않는다.
- `.markdown` 유무는 *원본이 지금 그 노드를 어떻게 그리고 있는가* 다. 원본의
  렌더 사정에 따라 오르내린다.

우리는 이미 '생성 중'의 정본을 알고 있고 두 군데서 쓰고 있다 — **원본의 중단 버튼**
(`compose.stopButton()`). `esc` 중단과 표시 눌러앉음 방지가 그걸 쓴다.
정작 표시를 켜는 자리에서만 안 쓰고 있다.

## 수정 방안

**표시를 이벤트의 가장자리가 아니라 상태에서 끌어낸다.**

```
생각 중 = 생성 중이다(stopButton 있음)  AND  아직 보여줄 답이 없다(streamingId 없음)
```

- 1초 틱에서 이 조건을 평가해 `setThinking()` 을 부른다. 지금의 '눌러앉음 방지'
  틱을 양방향으로 바꾸면 된다
- 수확의 `pending` 은 **표시를 켜는 근거에서 뺀다.** 자리표시자를 본문으로 삼지
  않으려는 목적(직전 수정)은 그대로 두고, `setThinking` 호출만 떼어낸다
- SSE `cot_token` 은 켜는 신호로 남겨 둔다. 상태 평가보다 빨리 오므로 첫 반응이
  빨라진다. 끄는 건 상태 평가에 맡긴다
- **최소 표시 시간**을 둔다. 조건이 200ms 만에 뒤집혀도 눈에는 깜빡임으로 보인다.
  한 번 켜지면 최소 600ms 는 유지한다

이렇게 하면 위 타임라인에서 표시는 `0ms`(전송 직후, 중단 버튼 등장)부터
`23868ms`(본문 시작)까지 **23.9초 동안 연속으로** 떠 있게 된다. 지금은 235ms 다.

## 고친 방법 (2026-09-07)

방안대로 넣었다.

- `index.js` — 수확에서 `setThinking` 호출을 뺐다. `pending` 은 자리표시자를 본문으로
  삼지 않으려는 목적으로만 남는다
- `index.js` — `every(200, …)` 에서 상태를 평가한다
  `생성 중(중단 버튼) && 본문 없음(streamingId 없음)`
- `store.setThinking(on)` — 최소 표시 시간 600ms 를 지킨다. 그전에 끄라고 하면
  거절하고 `false` 를 돌려준다. **화면이 바뀌어야 할 때만 `true`** 를 돌려주므로
  부르는 쪽은 그때만 다시 그린다 (200ms 마다 렌더하지 않는다)
- SSE `cot_token`(`store.thinking()`)은 켜는 신호로 남겼다. 상태 평가보다 빨리 온다

## 회귀 방지

`test/thinking.test.mjs` 50 → 63건.

- 수확이 표시를 건드리지 않는다 (`pending` 근처에 `setThinking` 이 없다)
- 상태 평가가 중단 버튼과 `streamingId` 를 본다
- 최소 표시 시간 — 가짜 시계로 200ms 에 끄려 하면 거절, 700ms 에는 꺼진다
- 반복해서 켜도 `true` 는 최초 한 번뿐 (200ms 마다 다시 그리지 않는다)
