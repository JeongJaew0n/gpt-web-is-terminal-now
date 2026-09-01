# 응답 하나가 '점점 길어지는 접두사' 수십 줄로 쌓인다

- 상태: **해결** (2026-09-01) — 1차 수정 후 '중간 답변이 보인다'로 재발, 2차에서 원인 확정
- 증상 문구: `최종 응답을 찾지 못했다 — 건너뛴 종류: …`
- 관련 파일: `src/content/store.js`, `src/main/tap.js`

## 증상

응답 하나가 여러 줄로 쌓인다. 각 줄이 **같은 답변의 점점 긴 접두사**이고,
전부 스트리밍 커서가 붙어 있고, 시각도 같다.

```
⏺ assistant · 75.3s
│ 3의 제곱근은 소수 넷째 자리까지 약 1.7321입니다. 왜냐하면 √3은 "제곱해서 3이 되는 양
│ ▮
⏺ assistant · 75.3s
│ 3의 제곱근은 … 실제로 √3 =
│ ▮
⏺ assistant · 75.3s
│ 3의 제곱근은 … 1.732050807…처럼 무한히 이어지는 무리수이기 때문입니다. 소수 넷째 자리까지
│ ▮
    (계속)
```

**별개 메시지가 여러 개인 게 아니라, 델타 하나하나가 새 줄이 된 것이다.**
이전에 고쳤던 "추론 조각이 여러 줄로 보인다"와 겉모습이 비슷해서 헷갈리기 쉽다 — 원인은 전혀 다르다.

## 원인 — 세 겹

### 1. 익명 레코드 (진짜 원인)

```js
delta(id, text) {
  const rec = id && state.byId.get(id);
  if (rec) { rec.text = text; }
  else upsert({ id, role: 'assistant', text, streaming: true });   // ← id 가 없으면 새 레코드
}
```

그리고 `upsert` 는 **id 가 있을 때만** 색인에 등록한다.

```js
if (rec.id) state.byId.set(rec.id, rec);
```

id 가 `null` 이면 → 레코드는 만들어지지만 색인에 안 들어감 → **다음 델타도 또 새 레코드**.
델타 수만큼 줄이 늘어난다. 화면에 보인 그대로다.

### 2. 앵커 없는 델타

`tap.js` 는 `this.messageId` 가 `null` 인 채로도 델타를 계속 내보냈다.
`messageId` 는 `add` 를 봤을 때만 채워진다. **`add` 를 못 보면 모든 델타가 id 없이 나간다.**

### 3. fail-closed 판별자 (내가 만든 회귀)

전날 넣은 수정 A 가 이랬다.

```js
if (ctype !== 'text' || rcp !== 'all') return;   // 본문이 아니면 버린다
```

이 `return` 은 `this.messageId` 를 채우기 **전에** 걸린다.
즉 판별자가 한 번이라도 빗나가면 그 턴 전체가 앵커 없이 흘러가고, 1번과 만나 폭발한다.

**"맞히기"로 설계한 게 잘못이었다.** 모르는 종류가 나오면 화면이 비는 게 아니라 망가진다.

## 왜 판별자가 빗나가나

스트림을 직접 떠서 확인했다.

| 상황 | assistant `add` | 판별자 통과 |
|---|---|---|
| 단순 응답 ("2 더하기 2는?") | 있음 · `content_type:"text"`, `recipient:"all"` | 통과 |
| 추론 응답 (강 건너기 퍼즐) | 있음 · 동일 | 통과 |
| **일부 스트림** | **없음** — `role:"system"` 인 숨김 메시지 하나뿐 | — |

세 번째 경우에도 본문 델타는 정상적으로 들어온다.
즉 **`add` 없이 본문부터 오는 스트림이 실재한다.**

`[가정]` 생성이 다른 연결에서 재개될 때로 보인다 —
`/backend-api/conversation/<id>/stream_status` 가 호출되는 것을 초기 조사에서 봤고,
그 경로는 우리가 감시하는 `/backend-api/f/conversation` 이 아니다.
`[미정]` 확정하지 못했다. 재현 중 렌더러가 반복해서 멈춰 더 파지 못했다.

**다만 원인 확정이 수정의 전제가 아니다.** `add` 를 놓쳤을 때
"줄 하나가 비는" 정도로 끝나야지 "줄 수십 개가 생기는" 건 어떤 이유로도 정당하지 않다.

## 수정

### 익명 레코드를 만들지 않는다

붙일 곳을 순서대로 찾고, 정말 없을 때만 **한 번** 만든다.

```js
let rec = (id && byId.get(id))
  || (streamingId && byId.get(streamingId))
  || (slotId && byId.get(slotId))
  || null;
if (!rec) { rec = upsert({ id: id || `orphan-${Date.now()}`, … }); orphanDeltas++; }
```

id 없는 레코드는 이제 만들어지지 않는다.

### 델타보다 앵커를 먼저 보낸다

`tap.js` 가 `messageId` 없이 본문을 만나면 자리를 먼저 만들고 `begin` 을 보낸다.

### 판별자를 fail-open 으로 뒤집는다

'본문인 것'을 맞히는 대신 **'본문이 아닌 것'만 확실히 걸러낸다.**

```js
const reasoning = ctype === 'reasoning_recap' || ctype === 'thoughts' || meta.reasoning_status;
const toolCall  = rcp !== 'all';
const hidden    = meta.is_visually_hidden_from_conversation;
if (reasoning || toolCall || hidden) return;   // 그 외는 전부 본문으로 받는다
```

모르는 종류가 새로 생겨도 화면은 채워진다.
한 턴에 본문이 둘 오면 턴 자리(supersede)가 마지막 것만 남긴다 — 그래서 중복도 안 난다.

## 교훈

**판별자는 fail-open 이어야 한다.** 어제 `false-fiber-warning` 에서
"근거 없음과 실패를 구분하라"를 배웠는데, 같은 날 넣은 수정 A 는 그 반대로 갔다 —
모르면 버리는 쪽. 화면을 채우는 판단은 모를 때 **받는 쪽**으로 기울어야 한다.

그리고 **저장된 데이터로 스트림을 추론하지 말 것.** 판별자를 API 응답(`/backend-api/conversation/<id>`)에서
뽑아 스트림에 그대로 적용했는데, 스트림은 `add` 를 생략할 수 있다. 두 표현은 같지 않다.

## 2차 — 중간 답변이 새어나온다 (같은 날)

1차 수정 뒤에도 **최종 답변이 아닌 중간 내용**이 보였다. 원인이 하나 더 있었다.

### 건너뛴 메시지를 기억하지 않았다

`add` 를 건너뛸 때 `return` 만 하고 **"이 메시지는 버린다"는 사실을 남기지 않았다.**
v1 인코딩에서 `/message/…` 경로는 *가장 최근에 add 된 메시지*를 가리키므로,
건너뛴 메시지의 본문 델타가 그대로 이어진다. 그 결과:

- `messageId` 가 비어 있으면 → 1차에서 넣은 **앵커 합성**이 발동해 그 내용을 새 줄로 렌더한다
- `messageId` 가 직전 응답을 가리키면 → 건너뛴 내용이 **직전 답변 뒤에 붙는다**

즉 1차 수정(앵커 합성)이 2차 증상을 **더 잘 보이게** 만들었다. 버려야 할 내용에 자리를 만들어 준 셈이다.

### 수정 — 메시지별 수용 여부를 추적한다

```js
this.current = { id, accepted, initial };   // add 마다 갱신. 건너뛴 경우에도 세운다.
…
if (this.current && !this.current.accepted) return;   // 이 메시지의 본문은 버린다
if (!this.messageId && !this.sawAdd) { /* add 를 아예 못 본 스트림에서만 앵커 합성 */ }
```

### 3차 — marker 가 '현재 메시지'를 전환한다 (실측으로 모델 교체)

2차 수정 뒤에도 남는 의문이 있었다. **assistant `add` 가 아예 없는 스트림이 왜 생기나?**
요청별로 따로 기록해 확인했다(2026-09-01). 한 요청 안에서:

```
add     404c0f   role:system,  hidden:true      ← add 는 이것 하나뿐
marker  b5841c   cot_token                       ← 추론 메시지
marker  5032df   user_visible_token              ← 진짜 답변
marker  5032df   final_channel_token
marker  5032df   last_token
append  ×3, replace ×2, (cont) ×10               ← 본문은 정상으로 흐른다
```

**메시지 id 가 셋인데 `add` 는 숨김 시스템 것 하나다.**
나머지 둘은 오직 `message_marker` 로만 등장한다.

즉 `add` 로 현재 메시지를 판단한다는 모델 자체가 틀렸다.
**현재 메시지를 전환하는 것은 marker 다.**

| marker | 뜻 | 처리 |
|---|---|---|
| `cot_token` | 추론(chain of thought) 메시지 | 이후 본문 버림 + `thinking` 알림 |
| `user_visible_token` | 사용자에게 보이는 메시지 | 이후 본문 수용 |
| `final_channel_token` | 최종 채널 | 동일 |
| `last_token` | 그 메시지의 끝 | 전환 아님 (무시) |

`content_type` 추측은 이제 보조다. **서버가 직접 말해주는 것을 쓴다.**

관측된 차이 `[가정]`: assistant `add` 가 없는 것은 **새 대화의 첫 메시지**에서,
있는 것은 **기존 대화의 후속 질문**에서였다. 표본이 각각 2회·1회라 단정하지 않는다.
어느 쪽이든 marker 기반 모델은 양쪽 다 처리한다.

### 서버가 알려주는 신호를 쓰고 있지 않았다

스트림에 이런 이벤트가 있었는데 `break` 로 버리고 있었다.

```json
{"type":"message_marker","message_id":"065568bd…","marker":"user_visible_token","event":"first"}
{"type":"message_marker","message_id":"065568bd…","marker":"final_channel_token","event":"first"}
```

**서버가 "이 메시지가 사용자에게 보이는 최종 채널"이라고 직접 말해준다.**
`content_type` 으로 추측하는 것보다 확실하다. 이제 이 표시가 오면
건너뛰기로 했던 메시지라도 받아들인다 — fail-open 의 긍정판이다.

### 빈 스트림 복구

스트림에서 본문을 하나도 못 받았으면(`began === false`)
`GET /backend-api/conversation/<id>` 로 **정본을 다시 읽는다.**
스트림은 반응성용이고 대화 원본이 정답이다. 화면이 비는 경우가 없어진다.

## 회귀 테스트

`test/stream.test.mjs` (19 케이스) — SSE 본문을 실제로 흘려보내 `tap.js` 의 판별을 검증한다.
추론 본문·숨김 시스템 본문·툴 호출 본문이 **새어나오지 않는지**,
marker 승격이 되는지, 모르는 종류를 버리지 않는지(fail-open), 앵커 합성이 한 줄인지.

가드를 빼고 돌리면 3건이 즉시 실패하는 것을 확인했다 — 진짜로 이 회귀를 잡는 테스트다.

`test/replay.test.mjs` — **실제 ChatGPT 스트림을 녹화해 디스크의 `tap.js` 에 그대로 재생한다.**
정답은 같은 응답을 원본이 렌더한 마크다운 원문(fiber)이다.
녹화본은 `test/fixtures/*.sse`, 기대값은 같은 이름의 `.json`.
새 모양을 만나면 녹화만 추가하면 회귀 테스트가 된다.

`test/store.test.mjs` 에 6 케이스 추가:
id 없는 델타 3회 → 레코드 1개, 익명 레코드가 하나도 없는지, `orphanDeltas` 계수,
뒤늦게 `add` 가 와도 한 줄인지, 모르는 id 의 델타가 진행 중 레코드에 붙는지.

`:health` 에 `add 없이 도착한 본문 델타 N건` 이 뜬다.
