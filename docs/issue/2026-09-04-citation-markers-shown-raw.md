# 인용 마커가 원문 그대로 보인다

검색이 붙은 응답에서 원본 UI 는 인용 칩(`고용노동부+1`)을 그리는데,
터미널에는 마커가 글자 그대로 나온다.

```
… 취업규칙에서 정하도록 하고 있어. :contentReference[oaicite:0]{index=0}예를 들어 …
```

## 실측 (2026-09-04)

대화 `6a9a3f0c…` 의 assistant 응답 하나를 세 경로에서 각각 읽었다.

| 출처 | 길이 | 그 자리에 든 것 |
|---|--:|---|
| **백엔드 API** `GET /backend-api/conversation/<id>` | 747자 | `\uE200cite\uE202turn692576search1\uE202turn692576search2\uE201` (42자) |
| **React fiber** (`react-markdown` 의 `children`) | 742자 | `:contentReference[oaicite:0]{index=0}` (36자) |
| **원본 DOM** (`.markdown` 의 textContent) | — | 둘 다 없음. 칩으로 그려짐 |

> `\uE200` `\uE201` `\uE202` 는 이스케이프 표기다. 실제 데이터에는 그 코드포인트의
> 문자가 **글자로** 들어 있다. 사용자 영역(Private Use Area)이라 폰트에 자형이 없고,
> 화면에서는 빈칸이나 두부(□)로 보인다.

**[확정] 마커의 표기가 경로마다 다르다.** 백엔드는 사용자 영역(PUA) 문자로 감싼
`cite` 토큰을 주고, 원본은 react-markdown 에 넘기기 전에 그걸
`:contentReference[oaicite:N]{index=N}` 로 치환한다. 렌더 단계의 remark/rehype
플러그인이 그 형태를 먹고 칩을 만든다.

원본이 만든 칩:

```
[data-testid="webpage-citation-pill"]   81×18px   "고용노동부+1"   (favicon 이미지 포함)
```

### 왜 우리 화면에는 fiber 쪽 표기가 나오나

**[확정]** 우리는 두 경로를 다 쓴다.

1. 대화를 열 때 `conversation.load()` 가 **API 원문**(PUA 형태)을 넣는다
2. 그 뒤 DOM 수확과 `verify` 가 **fiber 원문**으로 화면을 교정한다
   (`store.applyHarvest` 의 `adopt` 분기가 수확 텍스트를 채택한다)

그래서 최종적으로 화면에 남는 건 fiber 표기다.
실제로 터미널 본문에서 `:contentReference` 가 검출됐고, API 원문에서는 검출되지 않았다.

**두 형태를 모두 다뤄야 한다.** 한쪽만 지우면 다른 경로에서 다시 샌다.

## 무엇으로 바꿀 수 있나 — `content_references`

**[확정]** 백엔드가 마커의 의미를 메시지 메타데이터로 같이 준다.

`message.metadata.content_references` — 이 응답에서는 2건이었다.

| type | start_idx | end_idx | 들고 있는 것 |
|---|--:|--:|---|
| `grouped_webpages` | 254 | 296 | `items[]` — `title` `url` `attribution` `pub_date` `snippet` `hue` … |
| `sources_footnote` | 747 | 748 | `sources[]` 1건 (본문 끝에 붙는 출처 각주) |

`matched_text` 가 본문의 PUA 마커와 정확히 일치하고, `start_idx`/`end_idx` 가
그 구간을 가리킨다. **치환에 필요한 건 전부 여기 있다.**

관측된 키 전체:
`matched_text` `prefix` `start_idx` `end_idx` `safe_urls` `refs` `alt`
`prompt_text` `type` `items` `fallback_items` `status` `error` `style`
`sources` `has_images`

## 수정 방안

### 1단계 — 마커를 없애고 각주 번호로 (권장)

터미널이니 원본 칩을 흉내내지 않는다. 각주가 이 매체에 맞다.

```
… 취업규칙에서 정하도록 하고 있어.[1] 예를 들어 …

  [1] 고용노동부 · moel.go.kr
```

- `markdown.js` 의 inline 규칙에 마커 두 형태를 넣는다
  - PUA: `/\uE200cite\uE202[^\uE201]*\uE201/`
  - fiber: `/:contentReference\[[^\]]*\]\{[^}]*\}/`
- 매칭된 자리에 `[n]` 을 그린다. 링크가 있으면 `<a>`, 없으면 그냥 글자
- 응답 끝에 출처 줄을 붙인다

**출처 제목은 API 메타에서만 온다.** fiber 원문에는 없다. 그래서
`conversation.js` 가 `content_references` 를 같이 뽑아 store 레코드에 얹고,
fiber 로 본문이 교정돼도 그 메타는 유지해야 한다.

### 2단계 — 그래도 못 맞추면 지우기만 한다

메타가 없거나(스트리밍 중, DOM 폴백) 짝이 안 맞으면 **마커만 지운다.**
지금처럼 원문이 새는 것보다 낫고, 본문 의미는 안 변한다.

### 하지 않을 것

원본처럼 favicon + 제목 pill 을 그리는 것. 이미지를 끌어와야 하고
터미널 화면에서 겉돈다. `:q` 로 원본에서 보면 된다.

## 2차 실측 (2026-09-04) — 남았던 세 가지

검색이 붙는 질문을 하나 보내고 SSE 를 통째로 녹화해(545KB) 확인했다.

**[확정] 스트리밍 SSE 도 PUA 표기다.** 본문 델타에 마커가 그대로 들어온다.

```
{"p":"/message/content/parts/0","o":"append","v":" … 전망입니다. \uE200cite\uE202turn937490search17\uE201\n"}
```

**[확정] 출처 메타도 같은 스트림으로 온다.** 본문 델타 바로 뒤에 붙는다.

```
{"p":"/message/metadata/content_references","o":"append",
 "v":[{"matched_text":"\uE200cite\uE202turn937490search17\uE201",
       "start_idx":171,"end_idx":196, …}]}
```

**[확정] 봉투는 범용이다.** `\uE200<종류>\uE202<내용>\uE201` 이고,
`cite` 말고 `genui` 도 왔다 — 인용이 아니라 자동화 제안 UI 다.

```
\uE200genui\uE202{"suggest_automation":{"label":"매일 국내 IT 뉴스 3줄로 요약받기"}}\uE201
```

**[확정] `oaicite:N` = `index=N` = `content_references[N]`.**
마커 5개가 0..4 로 순서대로 대응했다. 인덱스는 **인용만이 아니라 모든 마커**를 센다 —
5번째 마커인 `genui` 가 `content_references[4]`(`type: "dil"`)였다.

관측된 `type`: `grouped_webpages` · `sources_footnote` · `dil`
cite 토큰 종류: `search` · `view` · `news`

한 가지 더 봤다 — **스트리밍이 끝난 직후 fiber 원문이 잠깐 조각으로 보인다**
(본문 641자인데 fiber 는 196자, 마커만 뭉쳐 있었다). 새로고침하면 674자로 정상이다.
수확이 그 순간을 물면 본문이 뭉텅 잘린다. 별건이라 여기서는 기록만 한다.

## 고친 방법 (2026-09-04)

방안 1단계를 그대로 넣었다.

- `conversation.js` — `content_references` 를 `refs` 로 정규화해 레코드에 싣는다
- `markdown.js` — 두 표기를 모두 인식한다. 인용이면 `[n]` 각주, 아니면 지운다.
  응답 끝에 출처 목록을 붙인다
- `store.js` — 수확(DOM·fiber)에는 refs 가 없다. **가진 것을 지키고 넘어간다** —
  안 지키면 fiber 교정이 도는 순간 각주가 번호만 남는다
- `renderplan.js` — 서명에 `refs.length` 를 넣는다. 출처는 본문보다 늦게 붙으므로
  빠뜨리면 각주가 살아나지 않는다

모르는 `type` 은 **각주를 매기지 않고 지운다.** 무엇인지 모르는 것을
출처인 양 번호 매기지 않는다.

`test/citation.test.mjs` 34건.

## 아직 안 한 것

- **스트리밍 중에는 출처 목록이 안 붙는다.** 마커는 각주 번호로 바뀌지만
  `refs` 가 store 에 없다 — SSE 의 `content_references` 델타를 tap 이 아직 안 모은다.
  스트림이 끝나고 API·fiber 로 교정될 때 붙는다.
  → `DeltaDecoder` 가 `/message/metadata/content_references` 를 누적하게 하면 된다.
- 이미지·상품·영상 인용의 `type` 은 아직 못 봤다. 기본 경로(지우기)로 떨어진다.
