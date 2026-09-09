# 이미지 생성 — 결과와 과정을 터미널에 보여준다

**1단계 구현 완료 (2026-09-09).** 새로고침하면 그림이 뜬다.
스트리밍 중에는 아직 아무것도 안 나온다 — 2단계가 남았다.

아래 1~3절은 손대기 전의 조사 기록이다. 4절에 실측으로 확정한 결과가 있다.

실측: 2026-09-09 · 대화 `6a9e88a3-…` · `6aa126f5-…` (새로 만들어 확인) · 이미지 라이브러리 API

---

## 1. 왜 아무것도 안 보이나

이미지는 **`role: 'tool'`** 메시지로 온다. 우리 파이프라인은 입구부터 그걸 버린다.

`src/content/conversation.js:16`
```js
function isVisible(m) {
  const role = m.author.role;
  if (role !== 'user' && role !== 'assistant') return false;   // ← 'tool' 탈락
  if (m.recipient && m.recipient !== 'all') return false;
  const ct = m.content && m.content.content_type;
  return ct === 'text';                                         // ← 'multimodal_text' 탈락
}
```

두 조건에 **각각** 걸린다. 하나만 풀어도 안 된다.

통과했더라도 다음 줄에서 내용이 사라진다.

`src/content/conversation.js:76`
```js
text: parts.filter((p) => typeof p === 'string').join('\n'),   // 객체 파트를 버린다
```

스트리밍 경로도 같다.

| 파일·줄 | 코드 | 무엇을 놓치나 |
|---|---|---|
| `tap.js:99` | `if (role !== 'assistant') return;` | tool 메시지의 `add` |
| `tap.js:143` | `typeof o.v === 'string' && …parts/\d+$` | 객체 파트 델타 |
| `tap.js:373` | `text: pending ? '' : …innerText` | `.markdown` 이 없는 이미지 노드 |
| `store.js:6` | `{id, role, model, text, …}` | 레코드에 이미지를 담을 자리가 없다 |

`tty.js:283` 에 **비텍스트 파트 자리표시자가 이미 있다.**

```js
const nonText = (m.parts || []).filter((t) => t && t !== 'text');
// ▤  image — :q 로 원본에서 확인
```

이것조차 안 뜨는 이유는 **레코드 자체가 만들어지지 않기** 때문이다. 화면에 그릴 대상이 없다.

---

## 2. 이미지가 어떻게 오나 — 실측

### 메시지 구조

한 장을 만들면 메시지가 **두 개** 생긴다.

```
tool/t2uay3k.sj1i4kz → all · multimodal_text · hidden=false · parts=[image_asset_pointer]
assistant            → all · thoughts
tool/t2uay3k.sj1i4kz → all · multimodal_text · hidden=true  · parts=[image_asset_pointer]|str2551
```

- **첫 번째가 화면에 그릴 것이다** (`hidden=false`)
- 두 번째는 `is_visually_hidden_from_conversation: true` 인 사본이다. 프롬프트 텍스트(2551자)를
  같이 들고 있다 — 모델이 다음 턴에 참고하는 컨텍스트다. **그리면 같은 그림이 두 번 나온다**
- `author.name` 이 `t2uay3k.sj1i4kz` 다. 사람이 읽을 이름이 아니고 바뀔 수 있는 값으로 보인다.
  **판별자로 쓰지 않는다** — `content_type` 과 파트 모양으로 가린다

### 파트

```json
{
  "content_type": "image_asset_pointer",
  "asset_pointer": "sediment://file_00000000291081fdbac3898d5e140bb8",
  "mime_type": "image/png",
  "size_bytes": 934342,
  "width": 1254, "height": 1254,
  "fovea": null,
  "metadata": { "dalle": { "gen_id": "…", "prompt": "" }, "generation": { "gen_size": "smimage", … } }
}
```

`sediment://` 스킴이다. 예전 문헌의 `file-service://` 와 다르다.
`metadata.dalle.prompt` 는 **빈 문자열**이었다 — 프롬프트를 여기서 기대하면 안 된다.

### 주소를 얻는 길

```
GET /backend-api/files/<file_id>/download
→ { status: "success", download_url: <서명 URL>, file_name: "…png", mime_type, file_size_bytes }
```

`asset_pointer` 에서 `sediment://` 를 떼면 그대로 `file_id` 다.
`/backend-api/files/download/<id>` 도 같은 것을 준다.

**`download_url` 의 호스트가 `chatgpt.com` 이다** — 같은 오리진이다. 서명 쿼리(`sig` `ts` `p` `cid` …)가
붙고 만료가 있다. `/backend-api/files/<id>` 는 `state`, `variants`, `use_case: "image_gen"` 등
메타데이터만 준다.

### 관문 세 개 — 다 열려 있다

| 확인한 것 | 결과 |
|---|---|
| 페이지 CSP `img-src` | **`* blob: data:`** — 어디서든 띄울 수 있다 |
| `<img>` 로드 | 1254×1254 성공 |
| `crossOrigin="anonymous"` + `canvas.getImageData` | **성공** — 픽셀을 읽을 수 있다 |

세 번째가 중요하다. **문자 아트로 바꿀 수 있다는 뜻이다.**

### 이미지 라이브러리

```
GET /backend-api/my/recent/image_gen?limit=N
→ items[]: { asset_pointer, conversation_id, message_id, width, height, url,
             prompt, title, encodings{ thumbnail{path}, … }, created_at }
```

`:images` 같은 목록 명령을 만들 재료가 이미 있다. 이번 범위는 아니다.

---

## 3. 어떻게 보여줄까

### A. 인라인 이미지 — 문자 그리드에 맞춘 `<img>` ← 추천

```
⏺ gpt-image-1                                              방금
  ┌────────────────────────────────────────────┐
  │                                            │
  │              (실제 이미지)                  │
  │                                            │
  └────────────────────────────────────────────┘
  민트 잎모자 아기 도토리 요정.png · 1254×1254 · 912 KB
```

- 폭을 `ch` 단위로 잡아 문자 격자에 맞춘다(`width: 48ch` 등). 테두리는 박스 문자로 두른다
- **진짜 터미널도 이렇게 한다.** iTerm2 인라인 이미지, kitty graphics protocol, sixel —
  현대 터미널은 이미지를 픽셀로 띄운다. 문자 아트는 그 수단이 없을 때의 대안이다
- 원본 그대로다. 뭉개지 않는다. 만든 그림을 확인하려면 이게 맞다
- 비용이 없다. `<img src>` 하나다

### B. 문자 아트 — `▀` 반칸 블록

**실제로 만들어 봤다.** 프로토타입 스크린샷:
`/var/folders/q4/4hy163xd0q15cbw0hbvqnc4r0000gn/T/claude-chrome-screenshots-kqrJ7s/screenshot-1788944757960-4.jpg`

`▀`(위 반칸)의 글자색 = 위 픽셀, 배경색 = 아래 픽셀. 한 글자에 픽셀 두 개가 들어가
세로 해상도가 두 배가 된다.

```
셀 폭 1ch · 셀 높이 2ch  →  픽셀 하나가 1ch × 1ch 정사각형
픽셀 행 수 = COLS × (height / width)
문자 행 수 = 픽셀 행 수 / 2
```

| 폭 | 문자 행 | 글리프 수 | 알아볼 수 있나 |
|---|---|---|---|
| 48ch | 24행 | 1,152 | 형태·색은 알아본다. 표정은 뭉개진다 |
| 80ch | 40행 | 3,200 | 꽤 선명하다. 표정도 보인다 |

- **터미널답다.** 이 프로젝트의 감성에 가장 맞는다
- 그림을 확인하는 용도로는 부족하다. 48ch 에서는 얼굴이 안 보인다
- 글리프마다 `<span>` 이 하나씩 필요하다 — 80ch 면 **DOM 노드 3,200개**, 이미지 한 장에.
  여러 장 있는 대화에서 스크롤이 무거워진다
- 세로 격자 틈이 보인다. `▀` 글리프가 셀을 꽉 채우지 않아서다. 없애려면 글리프를 버리고
  `background: linear-gradient(to bottom, 위색 50%, 아래색 50%)` 로 칠하면 된다 —
  대신 복사해도 글자가 남지 않는다

### C. 자리표시자만

```
▤ image/png 1254×1254 · 1.7 MB — ^` 로 원본에서 봅니다
```

- 지금 `tty.js:283` 에 있는 것과 같은 모양. 배선만 하면 된다
- 가장 싸다. 그러나 "결과가 안 보인다" 는 문제를 푸는 게 아니다

### 추천 — A 를 기본, B 를 설정으로

```
image   inline  →  <img> 를 문자 격자에 맞춰 띄운다     (기본값)
        blocks  →  ▀ 문자 아트                          (터미널 감성)
        off     →  자리표시자 한 줄
```

`GT_SCHEMA` 에 `image`(enum)와 `image.columns`(int, def 48) 를 넣는다.
사전 키는 `opt.image.*` 규칙을 그대로 따른다.

**왜 A 를 기본으로 두나.** 이미지 생성은 결과를 *보려고* 쓰는 기능이다. 48ch 문자 아트로는
얼굴이 안 보이는데, 그러면 매번 원본을 열게 된다 — 터미널을 쓰는 이유가 없어진다.
B 는 취향의 문제이므로 설정으로 남긴다. 폭도 설정으로 열어 둔다.

---

## 4. 생성 과정 — `[확정] 스트리밍 중에는 안 온다`

2026-09-09 실측. 이미지를 새로 만들어(`/c/6aa126f5-…`) 화면 변화를 400ms 간격으로 기록했다.

```
t=39.8s  턴 하나 · thinking 표시 뜸
t=41~45s thinking 이 붙었다 떨어짐 (검색·도구 왕복)
t=17.4s(재관찰)  턴이 1로 줄고 그대로 멈춤 — 이미지 없음
새로고침 후    이미지가 뜬다
```

**스트리밍 경로로는 그림이 오지 않는다.** 스트림이 끝난 뒤 화면에는 사용자 메시지만
남았고(`msg 1`), 새로고침해서 대화 원본을 다시 읽자 이미지가 나왔다.

대화 원본에는 이렇게 들어 있었다.

```
user                 → all · text            · parts=str32
tool/t2uay3k.sj1i4kz → all · multimodal_text · hidden=false · parts=[image]      ← 이것
tool/t2uay3k.sj1i4kz → all · multimodal_text · hidden=true  · parts=[image]|str3072
tool/t2uay3k.sj1i4kz → all · text            · hidden=true  · parts=str431
assistant            → all · reasoning_recap
assistant            → all · text            · hidden=true  · parts=str0
```

즉 **부분 이미지는 없다.** 3단계(과정을 그리는 것)는 그릴 것이 없다 —
2단계(만드는 동안 표시)로 끝내는 것이 맞다.

덤으로 확인한 것:

- 이미지 메시지에는 **`model_slug` 가 없다.** `image_gen_title` 만 있다.
  그래서 메타줄에 모델명을 못 찍는다 — 다른 메시지 것을 물려주면 만들지 않은 모델
  이름을 붙이는 셈이라, `image` 라고만 밝힌다
- 마지막 `assistant · text` 는 **본문이 빈 문자열**이다(`str0`). 그림만 주고 말이 없다
- `hidden=true` 사본이 실제로 왔다 — 안 걸렀으면 같은 그림이 두 번 나왔다

### 이전 기록 (참고)

**확인하지 못했다.** 이미지를 새로 만들어 SSE 를 보지 않았다.

원본 UI 는 흐릿한 그림이 점점 선명해지는 것을 보여주는데, 그것이

- 부분 이미지가 SSE 로 여러 번 오는 것인지 (`partial_images` 류)
- 자리표시자를 CSS 로 흐리게 처리하는 것인지

는 다르다. **전자면 그릴 것이 있고, 후자면 진행 표시만 만들면 된다.**

### 확인 방법

이미지가 만들어지는 대화를 하나 켜고 `:log on` 상태로 다음을 본다.

1. `tool` 메시지의 `add` 가 오는가, `message_marker` 로만 오는가
2. `content/parts/0` 에 **객체** 델타가 오는가 (`o.v` 가 문자열이 아닌 경우)
3. 같은 `asset_pointer` 가 여러 번 갱신되는가, 마지막에 한 번만 오는가
4. `metadata` 에 진행률·단계 필드가 있는가

`tap.js` 에 어제 넣은 진단(`markers`, `droppedOps`, `droppedChars`)이 1·2 를 바로 말해 준다.

### 확정되기 전까지의 설계

과정이 안 오더라도 **"만들고 있다" 는 표시는 필요하다.** 이미 있는 것을 재사용한다.

```
⏺ gpt-image-1
  ⠋ 그림을 만들고 있습니다…
```

`thinkingRow()` · `tickSpin()` 이 그대로 쓸 수 있는 모양이다
([생각 중 표시](../issue/2026-09-07-thinking-indicator-flicker.md)에서 만든 것).
`store.setThinking()` 처럼 `MIN_THINKING_MS` 를 두어 깜빡임을 막는다.

부분 이미지가 실제로 온다면 같은 자리를 갱신하면 된다 — `renderplan` 의 서명에
`asset_pointer` 를 넣어 바뀔 때만 다시 그리게 한다.

---

## 5. 구현 순서

작은 것부터, 각 단계가 혼자서도 쓸 만하게.

### 1단계 — 새로고침하면 보인다 (API 경로)

가장 작고 확실하다. 스트리밍을 건드리지 않는다.

- `conversation.js` — `isVisible()` 이 `role: 'tool'` + `multimodal_text` 를 통과시킨다.
  단 `is_visually_hidden_from_conversation` 인 것은 계속 버린다
- `toRecords()` — 객체 파트에서 `{kind:'image', pointer, mime, w, h, bytes}` 를 뽑아
  레코드의 `images` 배열에 담는다. `text` 는 문자열 파트만으로 그대로 둔다
- `store.js` — 레코드에 `images` 를 보존한다(`parts` 와 같은 방식, `store.js:145` 참고)
- 새 파일 `src/content/image.js` — `pointer → download_url` 을 캐시한다.
  서명 URL 은 만료되므로 **캐시에 나이를 둔다**. 실패하면 자리표시자로 떨어진다
- `tty.js` — `images` 를 그린다. 렌더 방식은 설정을 따른다
- `renderplan.js` — 서명에 `images.length` 와 첫 `pointer` 를 넣는다.
  안 넣으면 주소가 늦게 붙을 때 그림이 안 살아난다 (`refs` 와 같은 함정)

### 2단계 — 만드는 동안 표시가 뜬다

- `tap.js` — tool 메시지를 `image` 신호로 바꿔 보낸다. 본문으로 착각하지 않게 별도 이벤트로
- `store.js`·`tty.js` — 스피너 한 줄

### 3단계 — 취소

4절에서 확정했다. **부분 이미지는 오지 않는다.** 그릴 것이 없으므로 2단계로 끝낸다.

### 4단계 — 곁가지 (범위 밖)

`:images` 목록, `:open <n>` 으로 새 탭, 저장. `/backend-api/my/recent/image_gen` 이 재료다.

---

## 6. 회귀 방지

- `hidden=true` 사본을 그리지 않는가 (같은 그림이 두 번 나오면 실패)
- `role: 'tool'` 이지만 이미지가 아닌 메시지(`web.run` 결과 등)를 끌어들이지 않는가
- 텍스트와 이미지가 같은 메시지에 있을 때 둘 다 나오는가 (`parts=[image]|str2551` 모양)
- `asset_pointer` 가 `sediment://` 가 아닌 다른 스킴이어도 죽지 않는가
- `download_url` 이 만료·실패했을 때 자리표시자로 떨어지는가
- `image: off` 면 자리표시자 한 줄만 남는가
- 문자 아트의 종횡비가 맞는가 (픽셀 행 수 = COLS × h/w)
- `image.columns` 를 바꾸면 다시 그리는가 (epoch)
- 이미지가 없는 대화에서 아무 변화가 없는가

`author.name` 값(`t2uay3k.sj1i4kz`)을 **테스트에 박아 넣지 않는다.** 바뀔 값이다.

---

## 7. 열어 둔 질문

- ~~생성 과정이 SSE 로 오는가~~ — 확정. 오지 않는다 (4절)
- **스트리밍 중 tool 메시지를 tap 이 어디서 버리는가.** 2단계에서 그 자리에
  '만들고 있습니다' 를 띄우려면 필요하다
- **업로드한 이미지**도 같은 `image_asset_pointer` 로 오는가. 그렇다면 사용자 메시지의
  첨부도 같은 코드로 보인다 — 확인하면 덤으로 얻는다
- 문자 아트에서 **투명 배경**(`transparent_background: false` 필드가 있었다)을 어떻게 칠하나
- 서명 URL 만료 시간. 캐시 나이를 정하려면 알아야 한다

---

## 함께 볼 것

- [url 봉투를 통째로 지운다](../issue/2026-09-09-url-marker-dropped.md) — 같은 뿌리다.
  모르는 종류를 조용히 버리는 판단이 두 번째로 문제가 됐다
- [생각 중 표시가 깜빡인다](../issue/2026-09-07-thinking-indicator-flicker.md) — 2단계가 쓸 코드
