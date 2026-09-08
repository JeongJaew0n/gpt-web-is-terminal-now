// gpt-term — 화면 문구 사전.
//
// 왜 chrome.i18n 을 안 쓰나 (docs/plan/2026-09-08-i18n.md)
//   · chrome.i18n 은 브라우저 UI 언어를 따른다. 앱 안에서 못 바꾼다.
//     이 확장은 :set 과 옵션 화면으로 전부 바꾸는 물건이라 어긋난다.
//   · MAIN world(tap.js)에서는 chrome.* 를 아예 못 쓴다.
// 매니페스트의 name·description 만 _locales 로 두어 스토어 리스팅을 지역화하고,
// 화면 문구는 여기서 해결한다. 겹치는 건 그 두 줄뿐이다.
//
// 키 이름은 화면 위치를 따른다 — opt.* 설정, cmd.* 명령, sidebar.*, popup.*, health.*
// 보간은 $1 $2 … 로 쓴다.
var GT_I18N = {
  ko: {
    // ---------------------------------------------------------------- 설정
    'opt.section.behavior': '동작',
    'opt.section.sidebar': '사이드바',
    'opt.section.display': '표시',
    'opt.section.cursor': '커서와 알림',

    'opt.locale.label': '언어',
    'opt.locale.help': '자동은 브라우저 언어를 따릅니다. 바꾸면 바로 적용됩니다.',
    'opt.locale.choice.auto': '자동',
    'opt.locale.choice.ko': '한국어',
    'opt.locale.choice.en': 'English',

    'opt.enabled.label': 'ChatGPT 를 열면 바로 터미널로',
    'opt.enabled.help': '기본은 꺼짐 — 원본 UI 로 시작합니다. 툴바 아이콘이나 Ctrl+` 로 그때그때 켭니다.',

    'opt.onBreak.label': '전제가 깨졌을 때',
    'opt.onBreak.help': 'ChatGPT 내부 구조가 바뀌어 확장이 따라가지 못할 때의 처리.',
    'opt.onBreak.choice.warn': '터미널 유지 + 배지로 알림',
    'opt.onBreak.choice.revert': '원본 UI 로 자동 복귀',
    'opt.onBreak.choice.ignore': '무시 (콘솔에만 기록)',

    'opt.drift.threshold.label': '본문 대조 경고 임계값 (%)',
    'opt.drift.threshold.help': '스트림으로 받은 본문과 원본이 이만큼 넘게 어긋나면 경고합니다. 화면은 항상 원본 쪽으로 교정되므로 경고일 뿐입니다.',

    'opt.sidebar.visible.label': '대화 목록 표시',
    'opt.sidebar.visible.help': 'Ctrl+B 로도 토글합니다.',
    'opt.sidebar.width.label': '폭 (ch)',
    'opt.sidebar.closeOnOpen.label': '대화를 열면 목록 닫기',
    'opt.sidebar.closeOnOpen.help': '원본과 같은 동작입니다. 목록이 본문 위에 떠 있으므로 고르고 나면 비켜 줍니다. ≡ 로 다시 엽니다.',
    'opt.sidebar.groups.label': '고정·프로젝트 그룹 표시',
    'opt.sidebar.minColumns.label': '이보다 좁으면 처음에 접어둠 (칸)',
    'opt.sidebar.minColumns.help': '0 이면 항상 표시합니다. 목록은 본문 위에 덮이므로 좁은 창에서는 기본값을 접어 둡니다. 손잡이로 열면 폭과 무관하게 열립니다.',

    'opt.theme.label': '테마',
    'opt.font.family.label': '폰트',
    'opt.font.family.help': '설치돼 있지 않으면 뒤쪽 스택으로 폴백합니다.',
    'opt.font.size.label': '글자 크기 (px)',
    'opt.line.height.label': '줄 간격',
    'opt.wrap.columns.label': '본문 최대 너비 (ch)',
    'opt.wrap.columns.help': '0 이면 창 전체 너비.',
    'opt.gutter.markers.label': '응답 왼쪽 세로 바',
    'opt.scanlines.label': '스캔라인',
    'opt.scanlines.help': 'crt-green 테마에서만 권장.',

    'opt.cursor.style.label': '커서 모양',
    'opt.cursor.blink.label': '커서 깜빡임',
    'opt.timestamps.label': '타임스탬프',
    'opt.timestamps.choice.relative': '상대 (3분 전)',
    'opt.timestamps.choice.absolute': '절대 (14:22:01)',
    'opt.timestamps.choice.off': '끄기',
    'opt.bell.label': '응답 완료 알림',
    'opt.bell.choice.visual': '상태줄 플래시',
    'opt.bell.choice.off': '끄기',

    // 설정 화면 자체의 문구
    'opt.ui.saved': '저장됨 $1',
    'opt.ui.dirty': '기본값과 다른 항목 $1개',
    'opt.ui.allDefault': '전부 기본값',
    'opt.ui.default': '기본값: $1',
    'opt.ui.empty': '(빈 값)',
    'opt.ui.resetAll': '전체 기본값으로',
    'opt.ui.syncNote': '모든 기기에 동기화됩니다',
    'opt.ui.sections': 'SECTIONS'
  },

  en: {
    'opt.section.behavior': 'Behavior',
    'opt.section.sidebar': 'Sidebar',
    'opt.section.display': 'Display',
    'opt.section.cursor': 'Cursor & alerts',

    'opt.locale.label': 'Language',
    'opt.locale.help': 'Auto follows your browser language. Changes apply immediately.',
    'opt.locale.choice.auto': 'Auto',
    'opt.locale.choice.ko': '한국어',
    'opt.locale.choice.en': 'English',

    'opt.enabled.label': 'Start in the terminal on ChatGPT',
    'opt.enabled.help': 'Off by default — starts with the original UI. Turn it on per tab from the toolbar icon or Ctrl+`.',

    'opt.onBreak.label': 'When an assumption breaks',
    'opt.onBreak.help': "What to do when ChatGPT's internals change and the extension can no longer follow.",
    'opt.onBreak.choice.warn': 'Stay in the terminal, warn on the badge',
    'opt.onBreak.choice.revert': 'Fall back to the original UI',
    'opt.onBreak.choice.ignore': 'Ignore (console only)',

    'opt.drift.threshold.label': 'Drift warning threshold (%)',
    'opt.drift.threshold.help': 'Warn when the streamed text differs from the original by more than this. The display is always corrected to the original, so this is only a warning.',

    'opt.sidebar.visible.label': 'Show chat list',
    'opt.sidebar.visible.help': 'Ctrl+B toggles it too.',
    'opt.sidebar.width.label': 'Width (ch)',
    'opt.sidebar.closeOnOpen.label': 'Close the list after opening a chat',
    'opt.sidebar.closeOnOpen.help': 'Same as the original. The list floats over the thread, so it steps aside once you pick. Reopen with ≡.',
    'opt.sidebar.groups.label': 'Show pinned and project groups',
    'opt.sidebar.minColumns.label': 'Collapse initially below this width (columns)',
    'opt.sidebar.minColumns.help': '0 always shows it. The list overlays the thread, so it starts collapsed in narrow windows. The handle opens it regardless of width.',

    'opt.theme.label': 'Theme',
    'opt.font.family.label': 'Font',
    'opt.font.family.help': 'Falls back through the stack if not installed.',
    'opt.font.size.label': 'Font size (px)',
    'opt.line.height.label': 'Line height',
    'opt.wrap.columns.label': 'Max text width (ch)',
    'opt.wrap.columns.help': '0 uses the full window width.',
    'opt.gutter.markers.label': 'Vertical bar beside replies',
    'opt.scanlines.label': 'Scanlines',
    'opt.scanlines.help': 'Recommended only with the crt-green theme.',

    'opt.cursor.style.label': 'Cursor shape',
    'opt.cursor.blink.label': 'Cursor blink',
    'opt.timestamps.label': 'Timestamps',
    'opt.timestamps.choice.relative': 'Relative (3 min ago)',
    'opt.timestamps.choice.absolute': 'Absolute (14:22:01)',
    'opt.timestamps.choice.off': 'Off',
    'opt.bell.label': 'Reply-complete alert',
    'opt.bell.choice.visual': 'Flash the status line',
    'opt.bell.choice.off': 'Off',

    'opt.ui.saved': 'Saved $1',
    'opt.ui.dirty': '$1 changed from default',
    'opt.ui.allDefault': 'All at defaults',
    'opt.ui.default': 'Default: $1',
    'opt.ui.empty': '(empty)',
    'opt.ui.resetAll': 'Reset all to defaults',
    'opt.ui.syncNote': 'Synced across your devices',
    'opt.ui.sections': 'SECTIONS'
  }
};

var GT_LOCALES = Object.keys(GT_I18N);
var GT_LOCALE_FALLBACK = 'ko';

// 브라우저 언어에서 우리가 가진 로케일을 고른다. 없으면 폴백.
var GT_PICK_LOCALE = function (want) {
  if (want && want !== 'auto' && GT_I18N[want]) return want;
  var nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  var base = String(nav).toLowerCase().split('-')[0];
  return GT_I18N[base] ? base : GT_LOCALE_FALLBACK;
};

// 지금 로케일. 설정을 읽을 수 없는 문맥(MAIN world 등)에서도 동작해야 하므로
// 여기서는 값을 들고만 있고, 갱신은 config 를 아는 쪽이 한다.
var GT_LOCALE = GT_PICK_LOCALE(null);
var GT_SET_LOCALE = function (want) { GT_LOCALE = GT_PICK_LOCALE(want); return GT_LOCALE; };

// 사전에서 꺼내 $1 $2 … 를 채운다.
//
// 키가 없으면 키를 그대로 돌려준다. 빈 문자열을 돌려주면 화면에서 조용히 사라져
// 무엇이 빠졌는지 알 수 없다 — 키가 보이면 바로 눈에 띈다.
var GT_T = function (key) {
  var args = Array.prototype.slice.call(arguments, 1);
  var dict = GT_I18N[GT_LOCALE] || GT_I18N[GT_LOCALE_FALLBACK] || {};
  var s = dict[key];
  if (typeof s !== 'string') s = (GT_I18N[GT_LOCALE_FALLBACK] || {})[key];
  if (typeof s !== 'string') return key;
  return s.replace(/\$(\d+)/g, function (m, n) {
    var v = args[Number(n) - 1];
    return v === undefined || v === null ? m : String(v);
  });
};
