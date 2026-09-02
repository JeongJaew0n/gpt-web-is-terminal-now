<div align="center">

<img src="icons/icon128.png" width="104" alt="gpt-term">

# gpt-term

**ChatGPT 웹을 터미널 TUI 로 재구성하는 크롬 확장**

원본 UI 를 지우지 않는다. 덮고, 우리가 자체 상태에서 다시 그린다.

<br>

![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)
![Chrome 111+](https://img.shields.io/badge/Chrome-111%2B-5A6570)
![언팩 배포](https://img.shields.io/badge/배포-개인_언팩-8B5CF6)
![의존성 0](https://img.shields.io/badge/의존성-0-22C55E)
![테스트 402](https://img.shields.io/badge/테스트-402_케이스-22C55E)

</div>

---

## 설계 결정

| 항목 | 결정 |
|---|---|
| **스코프** | 읽기 + 입력 + 명령 |
| **원본 UI** | 숨김 토글 — 지우지 않는다 |
| **깨졌을 때** | 설정 항목(`onBreak`). 기본은 `터미널 유지 + 배지 알림` |
| **배포** | 개인 언팩 (스토어 미등록) |

---

## 설치

```
1. chrome://extensions  →  우측 상단 개발자 모드 켜기
2. 압축해제된 확장 프로그램을 로드  →  이 폴더 선택
3. https://chatgpt.com 열기
```

> **Chrome 111 이상**이 필요하다. `world: "MAIN"` 콘텐츠 스크립트를 쓴다.

### 코드를 고친 뒤

| # | 할 일 | 빠뜨리면 |
|:--:|---|---|
| 1 | `chrome://extensions` → gpt-term 의 **↻** | 크롬이 언팩 파일을 캐시해 새 코드가 안 들어간다 |
| 2 | **대상 탭 새로고침** | 이전 스크립트가 그 탭에 그대로 남는다 |
| 3 | 부팅 줄의 `build` 확인 (또는 `:version`) | 값이 그대로면 ①②가 안 먹은 것 |

<details>
<summary><b>제거 후 재설치는 필요 없다</b> — 왜 두 단계인지</summary>

<br>

크롬은 언팩 확장의 **매니페스트와 파일 내용을 모두 캐시**한다. 그래서 ↻ 가 필요하다.
그리고 ↻ 는 **이미 열려 있는 탭의 콘텐츠 스크립트를 정리하지 않는다.** 그래서 탭 새로고침이 필요하다.

`chrome://extensions` 의 **오류 목록은 ↻ 로 지워지지 않는다.** 거슬리면 "모두 지우기"를 누르면 된다 —
거기 남아 있는 건 대개 이미 고친 과거 기록이다.

→ [`docs/issue/2026-09-01-orphaned-content-script.md`](docs/issue/2026-09-01-orphaned-content-script.md)

</details>

---

## 조작

### 터미널

| 키 | 동작 |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>&#96;</kbd> · 툴바 아이콘 | 터미널 ↔ 원본 UI 토글 |
| <kbd>⌘K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd> | 명령 팔레트 |
| **화면 아무 데나 클릭 · 타이핑** | 입력창으로 들어간다 (입력창을 직접 클릭할 필요 없음) |
| <kbd>Tab</kbd> | 명령·인자 자동완성 |
| <kbd>Enter</kbd> | 전송 (`:` 로 시작하면 명령) |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | 줄바꿈 |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> | 생성 중단 |
| <kbd>⌥</kbd> + <kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | 글씨 크게 / 작게 / 기본값 |

### 사이드바 (오버레이 — 본문을 밀어내지 않는다)

| 조작 | 동작 |
|---|---|
| 좌측 상단 손잡이 **≡** · <kbd>Ctrl</kbd>+<kbd>B</kbd> | 대화 목록 접기/펼치기 |
| 본문 아무 데나 클릭 · <kbd>Esc</kbd> | 목록이 비켜난다 (오버레이 바깥 클릭) |
| 목록에서 대화 선택 | 목록이 비켜난다 (설정으로 끌 수 있음) |
| 오른쪽 가장자리 드래그 | 폭 조절 · 더블클릭이면 기본값 |
| 프로젝트 헤더 클릭 | 접기/펴기 — 처음 펼 때 그 안의 대화를 읽어온다 |
| 행에 마우스 올리기 → **⋯** · 우클릭 | 이름·고정·보관·삭제·이동·공유 메뉴 |
| <kbd>/</kbd> (입력창이 빈 상태) | 사이드바 검색 |

---

## 명령

`:` 로 시작하면 입력줄 위에 후보가 뜨고 <kbd>Tab</kbd> 으로 완성한다.
**인자도 완성된다** — `:theme ⇥` 는 테마 이름을, `:set ⇥` 은 설정 키를, `:mv 3 ⇥` 는 프로젝트 이름을 준다.

<table>
<tr><th align="left" width="46%">명령</th><th align="left">동작</th></tr>

<tr><td colspan="2"><b>대화</b></td></tr>
<tr><td><code>ls</code></td><td>대화 목록</td></tr>
<tr><td><code>:open &lt;n&gt;</code></td><td>대화 열기</td></tr>
<tr><td><code>:new</code></td><td>새 대화</td></tr>
<tr><td><code>:rename &lt;새 이름&gt;</code></td><td><b>지금 대화</b>의 이름을 바꾼다</td></tr>
<tr><td><code>:rename @&lt;n|id&gt; &lt;새 이름&gt;</code></td><td>다른 대화를 지정해서 바꾼다</td></tr>
<tr><td><code>:pin &lt;n|id&gt; [off]</code></td><td>고정</td></tr>
<tr><td><code>:archive &lt;n|id&gt; [off]</code></td><td>보관</td></tr>
<tr><td><code>:rm &lt;n|id&gt; yes</code></td><td>삭제 — <code>yes</code> 없이는 대상만 보여주고 멈춘다</td></tr>
<tr><td><code>:mv &lt;n|id&gt; &lt;프로젝트|none&gt;</code></td><td>프로젝트로 이동 / 빼기</td></tr>
<tr><td><code>:share &lt;n|id&gt;</code></td><td>원본 공유 대화상자를 연다</td></tr>
<tr><td><code>:select</code></td><td>다중 선택 모드 <sub>(원본에 없는 기능)</sub></td></tr>

<tr><td colspan="2"><b>모델 · 화면</b></td></tr>
<tr><td><code>:model [n|이름]</code></td><td>인자 없으면 목록, 주면 전환</td></tr>
<tr><td><code>:effort &lt;0-2 | 낮음·중간·높음 | +·-&gt;</code></td><td>추론 수준</td></tr>
<tr><td><code>:sidebar &lt;on|off|toggle|more|width n&gt;</code></td><td>사이드바 <sub>(<code>clear-cache</code> 도 받는다)</sub></td></tr>
<tr><td><code>:font &lt;10-24 | + | - | reset&gt;</code></td><td>글씨 크기</td></tr>
<tr><td><code>:theme &lt;modern-dark|crt-green&gt;</code></td><td>테마</td></tr>

<tr><td colspan="2"><b>설정 · 점검</b></td></tr>
<tr><td><code>:help</code></td><td>명령 목록</td></tr>
<tr><td><code>:config</code></td><td>설정 전체 보기</td></tr>
<tr><td><code>:set &lt;key&gt; &lt;value&gt;</code></td><td>설정 변경</td></tr>
<tr><td><code>:options</code></td><td>확장 설정 화면 열기</td></tr>
<tr><td><code>:health</code></td><td>점검 상태와 경고 목록</td></tr>
<tr><td><code>:version</code></td><td>지금 실행 중인 코드의 빌드 시각</td></tr>
</table>

> 상단바 오른쪽에 모델과 추론 수준이 뜬다. **추론 수준을 누르면 골라서 바꿀 수 있고**, 바뀌는 동안에는 `⠴ 중간 →` 로 표시된다.

---

## 배지

| 배지 | 뜻 |
|---|---|
| 초록 `▮` | 터미널 켜짐, 이상 없음 |
| 노랑 `⚠` | 터미널은 그대로 켜져 있고 경고가 있다. 아이콘에 마우스를 올리면 사유 |
| 빨강 `!` | 원본 UI 로 복귀함 (`onBreak = revert` 일 때만) |
| 없음 | 꺼짐 (원본 UI) |

---

## 설정

툴바 아이콘 우클릭 → **옵션**, 또는 터미널에서 `:options`.

핵심은 **전제가 깨졌을 때**(`onBreak`) 항목이다.

| 값 | 동작 |
|---|---|
| **`warn`** <sub>기본</sub> | 터미널을 유지하고 배지·스크롤백에 경고만 남긴다 |
| `revert` | 원본 UI 로 자동 복귀한다 |
| `ignore` | 콘솔에만 기록한다 |

`:health` 로 현재 점검 상태와 경고 목록을 본다.
설정 항목은 [`src/shared/defaults.js`](src/shared/defaults.js) 의 `GT_SCHEMA` **한 곳**에서 정의되고, 옵션 화면은 거기서 생성된다.

---

## 구조

```
manifest.json                         MV3 · 콘텐츠 스크립트 두 월드

src/main/
  tap.js                              MAIN world — fetch 래핑(SSE), React fiber 수확

src/content/                          ← 매니페스트 주입 순서
  protocol.js                         두 월드 사이 postMessage 브리지
  config.js                           chrome.storage.sync 설정
  oai.js                              Bearer 인증 읽기 클라이언트
  store.js                            대화 모델 (턴 자리·수확 병합)
  chats.js                            대화 목록 (API → DOM → 캐시)
  conversation.js                     대화 원본에서 활성 분기 뽑기
  convops.js                          이름·고정·보관·삭제·이동
  markdown.js                         마크다운 → tty 노드 (innerHTML 미사용)
  renderplan.js                       스크롤백 서명·재조정 (순수 함수)
  theme.js                            테마 CSS 변수 + 셸 스타일
  tty.js                              shadow root 셸
  palette.js                          퍼지 명령 팔레트
  sidebar.js                          대화 목록 오버레이
  compose.js                          원본 컴포저 주입 · 전송 · 중단
  picker.js                           모델 · 추론 수준 선택
  navigate.js                         라우팅
  commands.js                         명령 레지스트리 + 자동완성
  health.js                           깨짐 감지 · 정책 적용
  index.js                            부팅과 배선

src/background/service-worker.js      배지와 토글
src/shared/defaults.js                설정 스키마 (콘텐츠 · 옵션 공용)
src/options/                          설정 화면 (스키마에서 생성)

icons/  tools/make-icons.py           아이콘
docs/issue/  docs/plan/               조사 기록 · 계획
test/                                 Node 테스트 (의존성 없음)
```

<details>
<summary><b>왜 월드를 둘로 나누는가</b></summary>

<br>

`__reactFiber$…` 와 ProseMirror 의 `pmViewDesc` 는 **페이지 월드의 expando** 라 isolated world 에서 보이지 않는다.
반대로 `chrome.storage` 는 **MAIN world 에서 쓸 수 없다.**

그래서 tap 만 MAIN 에 두고 `postMessage` 로 잇는다.

</details>

<details>
<summary><b>데이터 소스가 둘인 이유</b></summary>

<br>

- **기존 메시지** — `GET /backend-api/conversation/<id>` (Bearer 인증) 로 대화 원본을 받아
  `current_node` 부모 사슬을 따라 활성 분기만 뽑는다. DOM 렌더 여부와 무관하다.
  실패하면 React fiber 의 `react-markdown` 노드에서 마크다운 원문을 읽는 예전 경로로 내려간다.
- **새 메시지** — `POST /backend-api/f/conversation` 의 SSE 델타를 누적한다.
- 응답이 끝나면 **fiber 원문으로 화면을 교정한 뒤** 스트림 누적본과 대조한다.
  임계값(기본 8%)을 넘게 어긋나면 델타 파서가 뒤처졌다는 신호로 **경고만** 남긴다 —
  표시는 이미 원본 기준으로 맞춰져 있으므로 복귀시킬 이유가 없다.

</details>

<details>
<summary><b>아이콘을 두 벌 그리는 이유</b></summary>

<br>

```
icons/source.png                마스터 (512px)
icons/icon{16,32,48,128}.png
python3 tools/make-icons.py     다시 생성
```

48·128 은 원본을 줄이고, **16·32 는 다시 그린다.**
줄이기만 하면 16px 에서 매듭이 초록 덩어리로 뭉개져 아무것도 안 읽힌다 —
그 크기에서는 `>_` 만 크게 그리는 게 낫다.

</details>

---

## 확인된 전제 <sub>2026-08-31 실측</sub>

- 스트리밍은 `POST /backend-api/f/conversation` 의 **SSE**. WebSocket 은 쓰지 않는다.
- 델타 인코딩은 `event: delta_encoding` / `data: "v1"` 로 자기 버전을 선언한다. `{p, o, v}` = 경로 / 오퍼레이션 / 값.
- 한 턴 안에서 무엇이 최종 응답인지는 **`message_marker` 이벤트**가 알려준다
  (`cot_token` = 추론, `user_visible_token`·`final_channel_token` = 본문).
- 전송 전 `sentinel/chat-requirements` proof-of-work 가 붙는다.
  **자체 API 호출은 불가능**하고, 반드시 원본 컴포저를 거쳐야 한다.
- 컴포저는 ProseMirror. `document.execCommand('insertText')` 로 주입하면 내부 상태까지 갱신된다.
- 전송 버튼은 `[data-testid="send-button"]`.
- **안정 앵커** — `#thread`, `#prompt-textarea`, `[data-message-id]`, `[data-message-author-role]`,
  `[data-message-model-slug]`, `[data-turn]`, `.markdown`
- **쓰면 안 되는 앵커** — 클래스명(Tailwind + 난독화), `aria-label`(로케일마다 다름)
- 페이지 CSP 는 `require-trusted-types-for` 를 걸지 않고 `style-src` 에 `'unsafe-inline'` 이 있다.
  다만 `fonts.googleapis.com` 은 없으므로 웹폰트 `<link>` 는 차단된다 —
  시스템에 설치된 JetBrains Mono 를 `local()` 로 쓴다.

---

## 테스트

의존성 없음. Node 만 있으면 된다.

```bash
for f in test/*.test.mjs; do node "$f" || echo "FAIL $f"; done
```

<details>
<summary><b>19개 파일 · 402 케이스</b></summary>

<br>

| 파일 | 케이스 | 무엇을 지키는가 |
|---|--:|---|
| `load` | 20 모듈 | 콘텐츠 스크립트를 매니페스트 순서대로 평가 — 로드 시점 예외 검출 |
| `handshake` | 5 | MAIN↔ISOLATED 브리지 버퍼링과 `ready`/`pong` 핸드셰이크 |
| `policy` | 17 | `onBreak` 정책과 드리프트 분류 |
| `store` | 20 | 한 턴에 assistant 메시지가 여러 개 와도 한 줄만 남는가 |
| `harvest` | 12 | 부분 수확이 스크롤백을 갉아먹지 않는가 |
| `preflight` | 7 | 모듈이 빠졌을 때 조용히 죽지 않는가 |
| `chats` | 18 | 대화 목록 그룹핑 (고정·프로젝트·일반) |
| `conversation` | 12 | 대화 원본에서 활성 분기·본문만 뽑기 |
| `stream` | 37 | SSE 판별 — 추론·툴·숨김 본문이 새지 않는가 |
| `lifecycle` | 22 | 확장 재로드 시 자진 해체 |
| `replay` | 3 | 녹화한 실제 스트림을 `tap.js` 에 재생 |
| `sidebar` | 46 | 목록 손잡이·표시 규칙·오버레이 |
| `picker` | 58 | 모델·추론 수준 선택 (원본 메뉴 조작) |
| `focus` | 17 | 클릭·타이핑이 입력창으로 가는가 |
| `convops` | 33 | 대화 조작 — 되돌릴 수 없는 것은 확인 후에만 |
| `renderplan` | 38 | 스크롤백 재구성 서명·재사용 |
| `font` | 16 | 글씨 크기 — 물리 키(`e.code`)로 받는가 |
| `complete` | 28 | 명령·인자 자동완성 · `parse` 가 인식하는 이름은 전부 실재하는가 |
| `rename` | 13 | `:rename` 의 기본 대상은 지금 대화 |

</details>

---

## 계획과 이슈

| 계획 | 상태 |
|---|---|
| [좌측 사이드바 (대화 목록)](docs/plan/2026-09-01-sidebar.md) | 동작 확인 |
| [대화 조작 (이름·고정·보관·삭제·이동·공유)](docs/plan/2026-09-01-conversation-ops.md) | 다중 선택 삭제 포함 · 보관 목록 보기는 TODO |
| [모델 · 추론 수준 선택](docs/plan/2026-09-01-model-picker.md) | 둘 다 동작 |
| [스크롤백 렌더 개선](docs/plan/2026-09-02-scrollback-render.md) | 스크롤백 확인 · 스트리밍 중 블록 안의 선택은 미해결 |

조사·수정 기록은 [`docs/issue/`](docs/issue/README.md) 에 있다. **일곱 건 중 다섯이 해결**됐다.
매니페스트 캐시 건은 크롬 동작이라 감지만 하고, 선택 유실 건은 스크롤백 쪽만 고쳐졌다.

### 아직 안 된 것

- 탭(여러 대화 동시) — 현재 대화 하나만
- 메시지 편집 · 재생성 · 분기
- 첨부 · 이미지 업로드
- 이미지 / canvas / 툴 결과는 자리표시자로만 표시
- 보관된 대화 목록 보기

---

## 검증 상태

무엇을 어떻게 확인했는지 구분해 적는다. **확인하지 않은 것은 확인했다고 쓰지 않는다.**

| 항목 | 어떻게 |
|---|---|
| 문법 검사 | 전체 파일 `node --check` 통과 |
| 로드 시점 예외 | 없음 (`test/load.test.mjs` — 20개 모듈) |
| 순수 로직 | 402 케이스 통과 (위 표) |
| 녹화 스트림 재생 | 실제 SSE 1건을 `tap.js` 에 재생 (`test/replay.test.mjs`) |
| ProseMirror 주입 · 전송 버튼 활성화 | 실제 페이지에서 확인 |
| SSE 가로채기 (`res.body.tee()`) | 실제 페이지에서 확인 |
| fiber 마크다운 원문 수확 | 실제 페이지에서 확인 |
| 사이드바 · 모델/추론 수준 전환 · 자동완성 · 스크롤백 | 언팩 로드 후 실제 페이지에서 확인 |

<div align="center">
<br>
<sub>개인용 언팩 확장. 스토어 미등록.</sub>
</div>
