# fiber 추출이 멀쩡한데 "못 읽었다" 경고가 뜬다

- 상태: **해결** (2026-09-01)
- 관련 파일: `src/main/tap.js`, `src/content/health.js`, `src/content/index.js`

## 증상

콘솔에 경고가 뜨고 툴바 배지가 노랗게 바뀐다. 스택은 이렇게 찍힌다.

```
src/content/health.js:34 (note)      ← console.warn 자리
src/content/health.js:69 (soft)
src/content/index.js:80              ← 발원지
src/content/protocol.js:13 (deliver)
src/content/protocol.js:21
src/content/protocol.js:21
```

**예외가 아니다.** 크롬이 `console.warn` 에 붙여주는 호출 스택이다.
가장 안쪽 프레임(`health.js:34`)은 경고를 찍는 줄이지 던지는 줄이 아니다.

## 원인 — 비교 대상이 어긋났다

```js
if (p.total > 0 && p.fiberHits === 0) {
  GT.health.soft('fiber 에서 마크다운 원문을 못 읽었다 …');
}
```

- `total` = `[data-message-id]` **전체** 개수 (사용자 + assistant)
- `fiberHits` = react-markdown fiber 에서 원문을 얻은 개수 (**assistant 만 가능**)

**사용자 메시지는 react-markdown 을 거치지 않아 `.markdown` 요소가 없다.**
그래서 assistant 응답이 아직 없는 순간에는 `total > 0` 이면서 `fiberHits === 0` 이 된다.
추출이 깨진 게 아니라 **뽑을 대상이 없었을 뿐이다.**

실측(같은 날, 정상 동작 중인 대화):

| | 값 |
|---|---|
| 총 메시지 노드 | 5 |
| `.markdown` 을 가진 것 | **3** (assistant 만) |
| fiber 추출 성공 | **3 — 100%** |

fiber 추출은 처음부터 멀쩡했다.

## 왜 지금 터졌나

이 판정식은 원래 "정리된 대화를 1.2초 뒤에 한 번 수확한다"는 전제로 쓰였다.
`partial-thread-harvest` 를 고치면서 **메시지 노드가 변할 때마다 재수확**하도록 바꿨고,
그래서 *사용자 메시지가 막 DOM 에 붙은 순간*(= assistant 응답 전)에 수확이 돌게 됐다.
정확히 오탐 조건이다.

**앞선 수정이 만든 회귀다.** 판정식 자체는 처음부터 틀렸지만, 그때는 그 순간을 잘 안 밟았을 뿐이다.

## 해로움

경고 한 줄로 끝나지 않는다. `soft()` 는 `warned = true` 로 만들고,
배지가 **노란 ⚠** 로 바뀐다. 멀쩡한 상태를 문제 있다고 표시한다 —
진짜 경고가 떴을 때 믿지 못하게 만드는 게 더 큰 손해다.

## 수정

판정을 순수 함수로 빼고, 비교 대상을 맞췄다.

```js
fiberVerdict(eligible, hits) {
  if (!eligible) return 'unknown';   // 대상이 없다 → 아무 말도 하지 않는다
  if (hits === 0) return 'broken';
  if (hits < eligible) return 'partial';
  return 'ok';
}
```

`tap.js` 가 `fiberEligible`(= `.markdown` 을 가진 메시지 수)을 따로 세서 함께 보낸다.
`partial` 을 새로 구분해 "3건 중 1건 실패" 같은 부분 실패도 잡는다.
`ok` 면 `CHECKS.fiber` 를 다시 켠다 — 한 번 실패한 뒤 복구되면 상태가 따라가야 한다.

## 교훈

**"근거가 없다"와 "나쁘다"를 구분해야 한다.** 표본이 0일 때 실패로 처리한 게 원인이다.
다른 판정에도 같은 함정이 있는지 보는 게 좋다 —
`reconcile` 은 빈 문자열을 먼저 걸러내고 있어 괜찮다.

## 회귀 테스트

`test/policy.test.mjs` 에 5 케이스 추가:
대상 0건 → `unknown`(무음), 전부 성공 → `ok`, 전부 실패 → `broken`, 일부 실패 → `partial`,
그리고 대상 0건에서 배지가 노래지지 않는지.
