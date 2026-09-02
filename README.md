# gpt-term

ChatGPT 웹을 터미널 TUI 로 재구성하는 크롬 확장. 개인용 언팩 배포.

원본 UI 를 지우지 않는다. 덮고, 우리가 자체 상태에서 다시 그린다.

## 설계 결정

| 항목 | 결정 |
|---|---|
| 스코프 | 읽기 + 입력 + 명령 |
| 원본 UI | 숨김 토글 (지우지 않음) |
| 깨졌을 때 | **설정 항목**. 기본은 `터미널 유지 + 배지 알림`, `원본 UI 복귀`·`무시` 선택 가능 |
| 배포 | 개인 언팩 (스토어 미등록) |

## 설치

1. 크롬에서 `chrome://extensions` → 우측 상단 **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드** → 이 폴더 선택
3. `https://chatgpt.com` 열기

Chrome 111 이상이 필요하다 (`world: "MAIN"` 콘텐츠 스크립트).

### 코드를 고친 뒤

```
1. chrome://extensions → gpt-term 의 ↻
2. 대상 탭 새로고침            ← 빠뜨리면 이전 스크립트가 그 탭에 남는다
3. 터미널 부팅 줄의 build 값 확인 (또는 :version)
```

**제거 후 재설치는 필요 없다.** 크롬이 언팩 확장 파일을 캐시하므로 ↻ 가 필요하고,
↻ 는 열려 있는 탭의 이전 스크립트를 정리하지 않으므로 탭 새로고침이 필요하다.

`build` 값이 소스를 고친 뒤에도 그대로면 확장이 다시 로드되지 않은 것이다.

`chrome://extensions` 의 오류 목록은 **↻ 로 지워지지 않는다.** 거슬리면 "모두 지우기"를 누르면 된다 —
거기 남아 있는 건 대개 이미 고친 과거 기록이다. 자세한 내용은
`docs/issue/2026-09-01-orphaned-content-script.md`.

## 조작

| 키 / 명령 | 동작 |
|---|---|
| `Ctrl` + `` ` `` | 터미널 ↔ 원본 UI 토글 |
| 툴바 아이콘 | 같은 토글 |
| `⌘K` / `Ctrl+K` | 명령 팔레트 |
| 화면 아무 데나 클릭 · 타이핑 | 입력창으로 들어간다 (직접 클릭할 필요 없음) |
| `Enter` | 전송 (`:` 로 시작하면 명령) |
| `Shift+Enter` | 줄바꿈 |
| `Ctrl+C` | 생성 중단 |

| 좌측 상단 손잡이(≡) | 대화 목록 접기/펼치기 |
| 본문 아무 데나 클릭 · `Esc` | 목록이 비켜난다 (오버레이 바깥 클릭) |
| 목록에서 대화 선택 | 목록이 비켜난다 (설정으로 끌 수 있음) |
| 목록 오른쪽 가장자리 드래그 | 폭 조절 (더블클릭 = 기본값) |
| 프로젝트 헤더 클릭 | 접기/펴기 — 처음 펼 때 그 안의 대화를 읽어온다 |
| `Ctrl` + `B` | 같은 토글 |
| `⌥` + `=` / `-` / `0` | 글씨 크게 / 작게 / 기본값 |
| `/` (입력창이 빈 상태) | 사이드바 검색 |

명령: `:help` `ls` `:open <n>` `:new` `:sidebar` `:font` `:theme <name>` `:config` `:set <k> <v>` `:model` `:effort` `:w` `:health` `:options` `:rename` `:pin` `:archive` `:rm` `:mv` `:share` `:select` `clear` `:q` `:reload`

상단바 오른쪽에 모델과 추론 수준이 뜬다. **추론 수준을 누르면 골라서 바꿀 수 있고**, 바꾸는 동안에는 `⠴ 중간 →` 로 표시된다.

## 배지

| 배지 | 뜻 |
|---|---|
| 초록 `▮` | 터미널 켜짐, 이상 없음 |
| 노랑 `⚠` | 터미널은 그대로 켜져 있고 경고가 있다. 아이콘에 마우스를 올리면 사유 |
| 빨강 `!` | 원본 UI 로 복귀함 (`onBreak = revert` 일 때만) |
| 없음 | 꺼짐 (원본 UI) |

## 설정

툴바 아이콘 우클릭 → **옵션**, 또는 터미널에서 `:options`.

핵심은 **전제가 깨졌을 때** 항목이다.

| 값 | 동작 |
|---|---|
| `warn` (기본) | 터미널을 유지하고 배지·스크롤백에 경고만 남긴다 |
| `revert` | 원본 UI 로 자동 복귀한다 |
| `ignore` | 콘솔에만 기록한다 |

`:health` 로 현재 점검 상태와 경고 목록을 볼 수 있다.

설정 항목은 `src/shared/defaults.js` 의 `GT_SCHEMA` 한 곳에서 정의된다 — 옵션 화면은 거기서 생성된다.

## 아이콘

```
icons/source.png       마스터 (512px)
icons/icon{16,32,48,128}.png

python3 tools/make-icons.py    다시 생성
```

48·128 은 원본을 줄이고, **16·32 는 다시 그린다.**
줄이기만 하면 16px 에서 매듭이 초록 덩어리로 뭉개져 아무것도 안 읽힌다 —
그 크기에서는 `>_` 만 크게 그리는 게 낫다.

## 구조

```
manifest.json
src/main/tap.js              MAIN world — fetch 래핑(SSE), React fiber 수확
src/content/protocol.js      두 월드 사이 postMessage 브리지
src/content/config.js        chrome.storage.sync 설정
src/content/store.js         대화 모델
src/content/markdown.js      마크다운 → tty 노드 (innerHTML 미사용)
src/content/theme.js         테마 CSS 변수 + 셸 스타일
src/content/tty.js           shadow root 셸
src/content/palette.js       퍼지 명령 팔레트
src/content/compose.js       원본 컴포저 주입 · 전송 · 중단
src/content/commands.js      명령 레지스트리
src/content/health.js        깨짐 감지 · 자동 복귀
src/content/index.js         부팅과 배선
src/background/service-worker.js  배지와 토글
src/shared/defaults.js       설정 스키마 (콘텐츠 스크립트 · 옵션 화면 공용)
src/options/options.html     설정 화면
```

### 왜 월드를 둘로 나누는가

`__reactFiber$…` 와 ProseMirror 의 `pmViewDesc` 는 페이지 월드의 expando 라 isolated world 에서 보이지 않는다.
반대로 `chrome.storage` 는 MAIN world 에서 쓸 수 없다. 그래서 tap 만 MAIN 에 두고 `postMessage` 로 잇는다.

### 데이터 소스가 둘인 이유

- **기존 메시지**: `GET /backend-api/conversation/<id>` (Bearer 인증) 로 대화 원본을 받아
  `current_node` 부모 사슬을 따라 활성 분기만 뽑는다. DOM 렌더 여부와 무관하다.
  실패하면 React fiber 의 `react-markdown` 노드에서 마크다운 원문을 읽는 예전 경로로 내려간다.
- **새 메시지**: `POST /backend-api/f/conversation` 의 SSE 델타를 누적한다.
- 응답이 끝나면 **fiber 원문으로 화면을 교정한 뒤**, 스트림 누적본과 대조한다. 임계값(기본 8%)을 넘게 어긋나면 델타 파서가 뒤처졌다는 신호로 **경고만** 남긴다 — 표시는 이미 원본 기준으로 맞춰져 있으므로 복귀시킬 이유가 없다.

## 확인된 전제 (2026-08-31 실측)

- 스트리밍은 `POST /backend-api/f/conversation` 의 **SSE**. WebSocket 은 쓰지 않는다.
- 델타 인코딩은 `event: delta_encoding` / `data: "v1"` 로 자기 버전을 선언한다. `{p, o, v}` = 경로 / 오퍼레이션 / 값.
- 전송 전 `sentinel/chat-requirements` proof-of-work 가 붙는다. **자체 API 호출은 불가능**하고, 반드시 원본 컴포저를 거쳐야 한다.
- 컴포저는 ProseMirror. `document.execCommand('insertText')` 로 주입하면 내부 상태까지 갱신된다(전송 버튼이 활성화되는 것으로 확인).
- 전송 버튼은 `[data-testid="send-button"]`.
- 안정 앵커: `#thread`, `#prompt-textarea`, `[data-message-id]`, `[data-message-author-role]`, `[data-message-model-slug]`, `[data-turn]`, `.markdown`.
- 쓰면 안 되는 앵커: 클래스명(Tailwind + 난독화), `aria-label`(로케일마다 다름).
- 페이지 CSP 는 `require-trusted-types-for` 를 걸지 않고 `style-src` 에 `'unsafe-inline'` 이 있다. 다만 `fonts.googleapis.com` 은 없으므로 웹폰트 `<link>` 는 차단된다 — 시스템에 설치된 JetBrains Mono 를 `local()` 로 쓴다.

## 계획

- [좌측 사이드바 (대화 목록 상시 표시)](docs/plan/2026-09-01-sidebar.md) — 동작 확인됨
- [대화 조작 (이름·고정·보관·삭제)](docs/plan/2026-09-01-conversation-ops.md) — 4/6 + 다중 선택 삭제, 공유·프로젝트 이동은 TODO
- [모델 · 추론 수준 선택](docs/plan/2026-09-01-model-picker.md) — 모델·추론 수준 모두 동작

- [스크롤백 렌더 개선](docs/plan/2026-09-02-scrollback-render.md) — 구현됨, 브라우저 확인 대기

## 알려진 이슈

`docs/issue/` 에 조사·수정 기록이 있다 → [목록](docs/issue/README.md)

여섯 건 중 넷이 **해결**됐다. 남은 하나(매니페스트 캐시)는 크롬 동작이라 감지만 한다.

## 아직 안 된 것

- 모델 전환 (`:model` `:effort` 은 현재 모델만 보여준다)
- 탭(여러 대화 동시) — 현재 대화 하나만
- 메시지 편집 · 재생성 · 분기
- 첨부 · 이미지 업로드
- 이미지/canvas/툴 결과는 자리표시자로만 표시

## 테스트

```bash
node test/load.test.mjs        # 콘텐츠 스크립트를 매니페스트 순서대로 평가 — 로드 시점 예외 검출
node test/handshake.test.mjs   # MAIN↔ISOLATED 브리지 버퍼링과 ready/pong 핸드셰이크
node test/policy.test.mjs      # onBreak 정책과 드리프트 분류
node test/store.test.mjs       # 한 턴에 assistant 메시지가 여러 개 와도 한 줄만 남는가
node test/harvest.test.mjs     # 부분 수확이 스크롤백을 갉아먹지 않는가
node test/preflight.test.mjs   # 모듈이 빠졌을 때 조용히 죽지 않는가
node test/chats.test.mjs       # 대화 목록 그룹핑 (고정·프로젝트·일반)
node test/conversation.test.mjs # 대화 원본에서 활성 분기·본문만 뽑기
node test/stream.test.mjs      # SSE 판별 — 추론·툴·숨김 본문이 새지 않는가
node test/lifecycle.test.mjs   # 확장 재로드 시 자진 해체
node test/replay.test.mjs      # 녹화한 실제 스트림을 tap.js 에 재생
node test/sidebar.test.mjs     # 목록 손잡이와 표시 규칙
node test/picker.test.mjs      # 모델·추론 수준 선택 (원본 메뉴 조작)
node test/focus.test.mjs       # 클릭·타이핑이 입력창으로 가는가
node test/convops.test.mjs     # 대화 조작 — 되돌릴 수 없는 것은 확인 후에만
node test/renderplan.test.mjs  # 스크롤백 재구성 서명·재사용
node test/font.test.mjs        # 글씨 크기 — 물리 키로 받는가
```

## 검증 상태

- 문법 검사: 전체 파일 `node --check` 통과
- 로드 시점 예외: 없음 (`test/load.test.mjs`)
- 브리지 핸드셰이크: 5개 케이스 통과 (`test/handshake.test.mjs`)
- onBreak 정책 · 드리프트 · fiber 판정: 14개 케이스 통과 (`test/policy.test.mjs`)
- 턴 자리(중복 응답 방지): 13개 케이스 통과 (`test/store.test.mjs`)
- 수확 병합(부분 렌더 대응): 12개 케이스 통과 (`test/harvest.test.mjs`)
- 대화 목록 그룹핑·접기: 18개 케이스 통과 (`test/chats.test.mjs`)
- preflight(모듈 누락 감지): 7개 케이스 통과 (`test/preflight.test.mjs`)
- ProseMirror 주입 + 전송 버튼 활성화: 실제 페이지에서 확인
- SSE 가로채기(`res.body.tee()`): 실제 페이지에서 확인
- fiber 마크다운 원문 수확: 실제 페이지에서 확인
- **확장을 언팩 로드해 엔드투엔드로 돌려본 적은 없다.** 첫 로드 시 콘솔의 `[gpt-term]` 로그를 확인할 것.
