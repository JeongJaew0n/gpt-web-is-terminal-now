# Google 의 확장 개발 에이전트 도구 — 우리에게 무엇이 개선되나

출처: [코딩 에이전트로 확장 프로그램 빌드](https://developer.chrome.com/docs/extensions/ai/build-with-ai?hl=ko)

**결론부터.** 셋 중 **하나는 지금 당장 도입할 값어치가 있고**(`reload_extension`),
하나는 부분적으로 쓸모가 있으며(스토어 템플릿), 하나는 우리 문제의 대부분과
**겹치지 않는다**(MV3 스킬).

조사일: 2026-09-11 · 패키지를 실제로 받아 내용을 확인했다

---

## 1. 무엇인가 — 세 조각

| 이름 | 실체 | 설치 |
|---|---|---|
| **Chrome DevTools MCP** | MCP 서버. `--categoryExtensions` 로 확장 도구 5개가 켜진다 | `claude mcp add chrome-devtools --scope project -- npx chrome-devtools-mcp@latest --categoryExtensions --autoConnect` |
| **Modern Web Guidance** | 에이전트용 스킬 묶음. `chrome-extensions` 스킬이 그중 하나 | `npx modern-web-guidance@latest install --choose` |
| **CHROMEWEBSTORE.md** | 스토어 게시 정보를 한 파일로 추적하는 규약 | 스킬 안의 템플릿 |

버전 확인: `chrome-devtools-mcp@1.9.0` · `modern-web-guidance@0.0.187`

---

## 2. 지금 당장 값어치가 있는 것 — `reload_extension`

`--categoryExtensions` 로 켜지는 도구는 다섯이다.

```
install_extension        압축 안 된 확장을 경로로 설치
list_extensions          설치된 확장 목록 (이름·ID·버전·활성 여부)
reload_extension         ID 로 다시 로드              ← 이것
trigger_extension_action 기본 동작 실행
uninstall_extension      제거
```

### 이것이 우리의 실제 병목이다

이 저장소의 작업 루프는 이렇게 굴러간다.

```
코드 수정  →  테스트  →  GT_BUILD 올림  →  ??? →  브라우저에서 확인
                                          ↑
                              chrome://extensions 의 ↻
                              나는 누를 수 없다
```

`claude-in-chrome` 은 탭·클릭·JS 실행·콘솔·네트워크를 다 하지만 **확장을 다시
로드하지는 못한다.** 그래서 매번 사용자에게 부탁하고 답을 기다려야 했다.
이 저장소의 `CLAUDE.md` §2 에 "그 버튼은 내가 누를 수 없다" 라고 적어 둔 그 지점이다.

**최근 며칠 작업만 봐도 이 대기가 반복적으로 끼어들었다** — 인용 도메인, 스크롤바,
`url` 봉투, 이미지 1·2단계, 사이드바 수정. 고칠 때마다 한 번씩 멈췄다.

`reload_extension` 이 있으면 루프가 닫힌다.

```
코드 수정 → 테스트 → GT_BUILD → reload_extension → :version 으로 확인 → 실측
```

**도입 효과가 가장 큰 항목이다.** 기능이 늘어나는 게 아니라 확인이 스스로 돌아간다.

### 곁가지 이득

- `install_extension` — 깨끗한 프로필에 설치해 **첫 설치 경험**을 확인할 수 있다.
  지금은 이미 설치된 상태만 본다. 웹스토어 심사 전에 값어치가 있다
- `list_extensions` — 로드된 버전을 ID 로 확인. `GT_BUILD` 를 눈으로 읽는 우회로가 준다
- `trigger_extension_action` — 팝업을 열 수 있다. 지금은 **브라우저 UI 라 손을 못 댄다**

---

## 3. 부분적으로 쓸모 있는 것 — CHROMEWEBSTORE.md

템플릿 목차가 우리 `docs/store/` 와 거의 그대로 대응한다.

```
Store Listing · Graphics & Assets · Permissions Justification
Privacy & Data Use · Privacy Policy · Distribution · Developer Info
Version History · Review Notes · Rejection History
```

| 우리 것 | 템플릿 |
|---|---|
| `docs/store/listing.md` | Store Listing · Graphics |
| `docs/store/privacy-policy.md` | Privacy & Data Use · Privacy Policy |
| `docs/store/review-notes.md` | Review Notes · Permissions Justification |
| (없음) | **Version History · Rejection History** |

우리에게 없는 두 칸이 실제로 쓸모 있다. 거절당하면 이유와 대응을 남기는 자리인데,
지금은 그걸 둘 데가 없다.

같이 딸려 오는 `review-checklist.md` 를 우리 `tools/package.sh` 사전 점검과 대조해 봤다.
**대체로 이미 지키고 있다.**

| 항목 | 우리 상태 |
|---|---|
| `manifest_version` 3 | ✅ |
| 최소 권한 | ✅ `storage` 하나 + `host_permissions` 는 `chatgpt.com` 만 |
| `<all_urls>` 안 씀 | ✅ |
| zip 에 불필요 파일 없음 | ✅ `package.sh` 가 `docs`·`test`·`tools`·`*.md` 제외 |
| 절대 경로 없음 | ✅ |
| 권한별 근거 | ✅ `docs/store/review-notes.md` |

**세 파일을 한 파일로 합칠 필요는 없다.** 다만 Version History·Rejection History 두 절은
가져올 만하다.

---

## 4. 겹치지 않는 것 — MV3 스킬

`chrome-extensions` 스킬은 MV3 규칙 7개와 레퍼런스 19편을 준다.

```
api-calling · auth-identity · content-scripts · context-menus · csp-sandbox
declarative-net-request · devtools · icons · media-capture · message-passing
omnibox · permissions · popup-ui · prompt-api · service-worker · side-panel
storage · tab-management · user-scripts
```

### 우리가 이미 실측으로 알아낸 것들이 여기 있다

- **`chrome.action.onClicked` 는 `default_popup` 이 없을 때만 발동** — 우리가 겪고 알아내서
  테스트까지 박아 둔 것
- **아이콘은 크기마다 별도 파일** — `tools/make-icons.py` 로 해결한 것

즉 **스킬이 있었다면 그 두 번은 안 헤맸다.** 다만 그게 전부다.

### 우리 문제의 대부분은 이 스킬 밖이다

`docs/issue/` 14건을 성격별로 나눠 봤다.

| 성격 | 건수 | 예 |
|---|---|---|
| **ChatGPT 내부 역공학** | **7** | SSE 델타 인코딩, PUA 봉투, React fiber, 이미지 tool 메시지 |
| 우리 UI 로직 · 웹 플랫폼 일반 | 5 | 스크롤백 렌더, IME, `closest` 와 떨어진 노드 |
| **MV3 플랫폼** | **2** | 매니페스트 캐시, 고아 content script |

**스킬이 다루는 영역은 14건 중 2건이다.**

그리고 우리 핵심 기법인 **`world: "MAIN"` 은 `content-scripts.md` 에 언급이 없다.**
(`grep MAIN` 결과 0건) 우리가 SSE 를 가로채는 방식은 스킬의 사정거리 밖이다.

**이 프로젝트의 어려움은 "MV3 확장을 잘 만드는 법" 이 아니라 "원본이 문서로 주지 않는
내부를 실측으로 알아내는 것" 이다.** 스킬은 전자를 돕는다.

---

## 5. 스킬 규칙으로 우리 코드를 훑어 본 결과

조사하는 김에 대조해 봤다. **하나 걸렸다.**

### `service-worker.js` — 전역 변수에 상태를 둔다 `[확정]`

스킬 규칙 7: *"Service workers are ephemeral — never store state in variables"*

```js
// src/background/service-worker.js:3
const STATE = new Map(); // tabId -> {reverted, warned, reasons, visible}
```

SW 는 30초쯤 놀면 죽는다. 죽으면 `STATE` 가 비고, 다음 메시지는 빈 객체에서 시작한다.

```js
const s = STATE.get(tabId) || {};
if (msg.kind === 'visible') s.visible = msg.visible;   // reverted·warned·reasons 를 잃은 채
```

→ 경고를 안고 있던 탭의 배지가 **`⚠` 에서 `▮`(정상)로 잘못 돌아갈 수 있다.**

**심각도는 낮다.** 배지 표시뿐이고 기능은 멀쩡하다. 다만 실제 규칙 위반이고,
`chrome.storage.session` 으로 옮기면 없어진다.

### 걸리지 않은 것들

| 규칙 | 우리 |
|---|---|
| `eval`/`new Function` 금지 | ✅ 0건 (`markdown.js` 가 `createElement` 로만 조립한다) |
| `tab.url` 에 `tabs` 권한 | ⚠️ `popup.js:51` 이 쓰지만 `host_permissions` 로 chatgpt.com 은 보인다. 다른 탭에서는 `undefined` → "ChatGPT 탭이 아닙니다" 로 올바르게 떨어진다 |
| 콘텐츠 스크립트가 메인 스레드를 막지 않음 | ✅ `renderplan` 이 바뀐 블록만 다시 만든다 |
| `.then()` 대신 async/await | 7건 있으나 의도적 fire-and-forget (`pull(...).then`) |

---

## 6. 도입 비용과 주의

### chrome-devtools-mcp 를 넣으면 도구가 겹친다

이미 `claude-in-chrome` 으로 스크린샷·JS 실행·콘솔·네트워크를 다 하고 있다.
둘을 같이 켜면 **같은 일을 하는 도구가 두 벌**이 되어 고를 때 혼란이 생기고
컨텍스트도 더 먹는다.

우리가 실제로 필요한 건 **확장 도구 5개뿐**이다.

### `--autoConnect` 는 기본 프로필에 붙는다

문서가 권하는 옵션인데, **사용자의 실제 Chrome 프로필**에 연결된다는 뜻이다.
이 세션에서도 사용자가 쓰는 창을 건드리지 않으려고 조심해 왔다. 켜기 전에
어느 프로필에 붙는지 확인하는 편이 낫다.

### 스킬은 전역에 설치된다

`npx modern-web-guidance@latest install --choose` 는 `~/.claude/skills/` 에 깔린다.
다른 프로젝트에도 딸려 온다 — 이 저장소만의 선택이 아니다.

---

## 7. 추천

| 순위 | 무엇 | 왜 |
|---|---|---|
| **1** | **chrome-devtools-mcp 를 확장 도구만 켜서 도입** | 확인 루프가 닫힌다. 지금 가장 큰 병목 |
| 2 | `service-worker.js` 의 `STATE` 를 `chrome.storage.session` 으로 | 실제 규칙 위반. 작다 |
| 3 | `docs/store/` 에 Version History · Rejection History 추가 | 심사 대응 기록을 둘 자리가 없다 |
| 4 | `chrome-extensions` 스킬 설치 | 값어치가 없진 않으나 우리 문제의 14% 다. 전역에 깔리는 점도 감안 |

**1번만 해도 대부분의 이득을 가져온다.**

---

## 함께 볼 것

- [`CLAUDE.md`](../../CLAUDE.md) §2 — "↻ 는 내가 누를 수 없다" 가 여기서 풀린다
- [고아 content script](../issue/2026-09-01-orphaned-content-script.md) — MV3 쪽 이슈 2건 중 하나
