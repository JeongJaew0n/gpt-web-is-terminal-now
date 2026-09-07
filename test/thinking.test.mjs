// '생각 중' 표시. 본문이 오기 전 구간에만 떠 있어야 하고, 끄는 걸 빠뜨리면 영원히 남는다.
import fs from 'node:fs'; import vm from 'node:vm';

function loadStore() {
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Date, Error };
  sb.window = sb; sb.globalThis = sb; sb.GT = {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sb, { filename: 'store.js' });
  return sb.GT.store;
}

const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 기본 흐름: 추론 → 본문 → 끝 ---
{
  const S = loadStore();
  t('처음에는 안 뜬다', S.isThinking() === false);

  S.thinking();
  t('추론 조각이 오면 뜬다', S.isThinking() === true);
  t('경과 시간을 잰다', S.thinkingElapsed() >= 0);

  S.thinking(); S.thinking();
  t('여러 조각이 와도 계속 떠 있다', S.isThinking() === true);

  S.begin({ id: 'a', role: 'assistant', text: '' });
  t('본문이 시작되면 내려간다', S.isThinking() === false);
  t('몇 조각이었는지는 응답에 남는다', S.state.byId.get('a').thinking === 3);

  S.end('a', '답');
  t('끝난 뒤에도 안 뜬다', S.isThinking() === false);
}

// --- 본문이 흐르는 동안 추론이 또 와도 두 개를 겹쳐 띄우지 않는다 ---
{
  const S = loadStore();
  S.begin({ id: 'a', role: 'assistant', text: '' });
  S.thinking();
  t('스트리밍 중이면 안 뜬다 (블록 회전자가 대신한다)', S.isThinking() === false);
  S.end('a', '답');
  t('끝나면 표시도 정리된다', S.isThinking() === false);
}

// --- 끄는 걸 빠뜨리면 영원히 남는다: 나가는 문을 전부 확인 ---
{
  const S = loadStore();
  S.thinking();
  S.userSent('다음 질문');
  t('새 질문을 보내면 꺼진다', S.isThinking() === false);
}
{
  const S = loadStore();
  S.thinking();
  S.replaceAll([], { path: '/', title: '' });
  t('대화를 갈아엎으면 꺼진다', S.isThinking() === false);
}
{
  const S = loadStore();
  S.thinking();
  t('thinkingDone 이 끈다', S.thinkingDone() === true && S.isThinking() === false);
  t('이미 꺼져 있으면 false', S.thinkingDone() === false);
}

// --- 경과 시간 ---
{
  const S = loadStore();
  t('안 도는 동안에는 0', S.thinkingElapsed() === 0);
  S.thinking();
  const a = S.thinkingElapsed();
  t('돌기 시작하면 0 이상', a >= 0);
  S.begin({ id: 'x', role: 'assistant', text: '' });
  t('끝나면 다시 0', S.thinkingElapsed() === 0);
}

// --- 시작 시각은 첫 조각에서 고정된다 ---
{
  const S = loadStore();
  S.thinking();
  const first = S.state.thinkingSince;
  S.thinking();
  t('두 번째 조각이 시계를 되돌리지 않는다', S.state.thinkingSince === first);
}

// --- 렌더 쪽 배선 ---
{
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  const css = fs.readFileSync('src/content/theme.js', 'utf8');

  t('생각 중 줄을 그리는 함수가 있다', /function thinkingRow\(/.test(tty));
  t('맨 아래에 붙인다', /GT\.store\.isThinking\(\)[\s\S]{0,120}key: 'thinking'/.test(tty));
  t('서명에 경과 시각을 넣지 않는다', /sig: JSON\.stringify\(\['thinking', epoch\]\)/.test(tty));

  // 매 프레임 renderScrollback 을 돌리면 선택이 깨진다 — 제자리 갱신이어야 한다
  t('회전자는 제자리에서 갱신한다', /function tickSpin\(\)/.test(tty));
  t('회전자 틱이 render 를 부르지 않는다',
    !/function tickSpin\(\)[\s\S]{0,400}?\brender\(\)/.test(tty));
  t('회전자 프레임이 여러 장', /const SPIN = \[[^\]]{20,}\]/.test(tty));
  t('돌 게 없으면 DOM 을 훑지 않는다',
    /if \(!s\.streamingId && !GT\.store\.isThinking\(\)\) return;/.test(tty));
  t('스트리밍 블록도 같은 회전자를 쓴다', /el\('span', 'gt-spin'/.test(tty));

  t('틱이 등록돼 있다', /every\(90, \(\) => \{ if \(GT\.tty\.visible\(\)\) GT\.tty\.tickSpin\(\); \}\)/.test(idx));
  t('틱은 터미널이 보일 때만 돈다', /if \(GT\.tty\.visible\(\)\) GT\.tty\.tickSpin\(\)/.test(idx));
  t('tickSpin 을 밖으로 내보낸다', /copy, tickSpin,/.test(tty));

  t('스타일이 있다', /\.gt-thinking-live/.test(css));
  t('모션을 줄이는 설정을 존중한다', /prefers-reduced-motion/.test(css));

  // 커서는 세 군데(입력줄·스트리밍 본문·생각 중)에 뜬다. 셋이 같아야 한다.
  t('커서를 만드는 자리가 하나다', /const cursorEl = \(\) => dressCursor/.test(tty));
  t('생각 중 줄에 답할 때와 같은 커서가 붙는다',
    /function thinkingRow\(\)[\s\S]{0,500}?row\.appendChild\(cursorEl\(\)\)/.test(tty));
  t('스트리밍 본문 끝에도 같은 커서', /if \(m\.streaming\) body\.appendChild\(cursorEl\(\)\)/.test(tty));
  t('모양·깜빡임 설정을 반영한다',
    /dressCursor[\s\S]{0,300}?cursor\.style[\s\S]{0,120}?cursor\.blink/.test(tty));
  // 날것으로 만드는 곳은 생성기 안 한 군데뿐이어야 한다
  t('커서를 날것으로 만드는 곳이 하나뿐',
    (tty.match(/el\('span', 'gt-cursor'\)/g) || []).length === 1);
  t('입력줄 커서도 같은 생성기를 쓴다', /ui\.cursor = cursorEl\(\);/.test(tty));
  t('커서 깜빡임도 모션 축소를 존중한다',
    /prefers-reduced-motion[\s\S]{0,120}\.gt-cursor\[data-blink="1"\] \{ animation: none/.test(css));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
