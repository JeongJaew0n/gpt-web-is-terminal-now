// gpt-term 빌드 스탬프.
// 크롬은 언팩 확장 파일을 캐시한다. "고쳤는데 왜 그대로지?" 를 추측으로 풀지 않으려고 둔다.
// 터미널 부팅 줄과 :version 에 찍힌다. 이 값이 안 바뀌면 확장이 다시 로드되지 않은 것이다.
var GT_BUILD = '2026-09-02 21:05';

// gpt-term — 설정 스키마. 콘텐츠 스크립트와 옵션 화면이 같은 정의를 쓴다.
// 여기가 유일한 출처다. 옵션 화면에 항목을 늘리려면 이 배열만 고치면 된다.
var GT_SCHEMA = [
  {
    section: '동작',
    key: 'enabled', label: '페이지를 열면 터미널로 시작', type: 'bool',
    def: true, help: '끄면 원본 UI 로 시작한다. Ctrl+` 로 언제든 전환.'
  },
  {
    section: '동작',
    key: 'onBreak', label: '전제가 깨졌을 때', type: 'enum',
    def: 'warn',
    choices: [
      ['warn', '터미널 유지 + 배지로 알림'],
      ['revert', '원본 UI 로 자동 복귀'],
      ['ignore', '무시 (콘솔에만 기록)']
    ],
    help: 'ChatGPT 내부 구조가 바뀌어 확장이 따라가지 못할 때의 처리.'
  },
  {
    section: '동작',
    key: 'drift.threshold', label: '본문 대조 경고 임계값 (%)', type: 'int',
    def: 8, min: 1, max: 100,
    help: '스트림으로 받은 본문과 원본이 이만큼 넘게 어긋나면 경고한다. 화면은 항상 원본 쪽으로 교정되므로 경고일 뿐이다.'
  },

  { section: '사이드바', key: 'sidebar.visible', label: '대화 목록 표시', type: 'bool', def: true,
    help: 'Ctrl+B 로도 토글한다.' },
  { section: '사이드바', key: 'sidebar.width', label: '폭 (ch)', type: 'int', def: 30, min: 16, max: 80 },
  { section: '사이드바', key: 'sidebar.closeOnOpen', label: '대화를 열면 목록 닫기', type: 'bool', def: true,
    help: '원본과 같은 동작. 목록이 본문 위에 떠 있으므로 고르고 나면 비켜준다. ≡ 로 다시 연다.' },
  { section: '사이드바', key: 'sidebar.groups', label: '고정·프로젝트 그룹 표시', type: 'bool', def: true },
  { section: '사이드바', key: 'sidebar.minColumns', label: '이보다 좁으면 처음에 접어둠 (칸)', type: 'int',
    def: 100, min: 0, max: 400,
    help: '0 이면 항상 표시. 목록은 본문 위에 덮이므로 좁은 창에서는 기본값을 접어둔다. 손잡이로 열면 폭과 무관하게 열린다.' },

  { section: '표시', key: 'theme', label: '테마', type: 'enum', def: 'modern-dark',
    choices: [['modern-dark', 'modern-dark'], ['crt-green', 'crt-green'], ['amber', 'amber']] },
  { section: '표시', key: 'font.family', label: '폰트', type: 'text',
    def: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
    help: '설치돼 있지 않으면 뒤쪽 스택으로 폴백한다.' },
  { section: '표시', key: 'font.size', label: '글자 크기 (px)', type: 'int', def: 13, min: 10, max: 24 },
  { section: '표시', key: 'line.height', label: '줄 간격', type: 'float', def: 1.62, min: 1, max: 3, step: 0.01 },
  { section: '표시', key: 'wrap.columns', label: '본문 최대 너비 (ch)', type: 'int', def: 96, min: 0, max: 400,
    help: '0 이면 창 전체 너비.' },
  { section: '표시', key: 'gutter.markers', label: '응답 왼쪽 세로 바', type: 'bool', def: true },
  { section: '표시', key: 'scanlines', label: '스캔라인', type: 'bool', def: false,
    help: 'crt-green 테마에서만 권장.' },

  { section: '커서와 알림', key: 'cursor.style', label: '커서 모양', type: 'enum', def: 'block',
    choices: [['block', 'block'], ['bar', 'bar'], ['underline', 'underline']] },
  { section: '커서와 알림', key: 'cursor.blink', label: '커서 깜빡임', type: 'bool', def: true },
  { section: '커서와 알림', key: 'timestamps', label: '타임스탬프', type: 'enum', def: 'relative',
    choices: [['relative', '상대 (3분 전)'], ['absolute', '절대 (14:22:01)'], ['off', '끄기']] },
  { section: '커서와 알림', key: 'bell', label: '응답 완료 알림', type: 'enum', def: 'visual',
    choices: [['visual', '상태줄 플래시'], ['off', '끄기']] }
];

var GT_DEFAULTS = GT_SCHEMA.reduce((o, f) => { o[f.key] = f.def; return o; }, {});

var GT_COERCE = function (key, raw) {
  const f = GT_SCHEMA.find((x) => x.key === key);
  if (!f) return raw;
  if (f.type === 'int') { const n = parseInt(raw, 10); return Number.isFinite(n) ? n : f.def; }
  if (f.type === 'float') { const n = parseFloat(raw); return Number.isFinite(n) ? n : f.def; }
  if (f.type === 'bool') return raw === true || raw === 'on' || raw === 'true' || raw === '1';
  if (f.type === 'enum') return f.choices.some(([v]) => v === raw) ? raw : f.def;
  return String(raw);
};
