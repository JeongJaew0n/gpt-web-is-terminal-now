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

## 확인해야 할 것

- **[가정]** fiber 표기의 `oaicite:N` / `index=N` 이 `content_references` 배열의
  N 번째와 대응한다. 이 응답에는 참조가 하나뿐이라 확증하지 못했다.
  → 참조가 2개 이상인 응답을 하나 만들어 인덱스와 순서를 대조한다.
- **[미정]** 스트리밍 중 SSE 델타는 어느 표기로 오는가.
  → 검색이 붙는 질문을 한 번 보내 `test/fixtures` 에 녹화하고 확인한다.
  스트리밍 경로도 같은 치환을 타야 한다.
- **[미정]** `grouped_webpages` `sources_footnote` 말고 어떤 `type` 이 더 있는가.
  → 이미지·상품·영상이 붙은 응답을 모아 `type` 을 수집한다.
  모르는 type 은 **마커만 지우고 넘어가는** 기본 경로로 떨어뜨린다.
