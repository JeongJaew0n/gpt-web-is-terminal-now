// onBreak 정책이 실제로 동작하는지 검증한다.
// 이 파일이 존재하는 이유: 드리프트가 원본 UI 복귀를 유발하던 회귀를 다시 만들지 않기 위해서다.
import fs from 'node:fs'; import vm from 'node:vm';

function makeWorld(cfg) {
  const hidden = { called: false };
  const sandbox = {
    console: { warn(){}, error(){}, debug(){}, log(){} },
    chrome: { runtime: { id: 'x', sendMessage(){}, lastError: null } },
    Object, Math, Number, String, Boolean, Array, JSON
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/shared/defaults.js','utf8'), sandbox, {filename:'defaults'});
  // GT 스텁 — health 가 기대는 최소 표면만
  sandbox.GT = {
    sendToSW() {},
    config: { get: (k) => (k in cfg ? cfg[k] : sandbox.GT_DEFAULTS[k]) },
    tty: { system(){}, setMode(){}, hide(){ hidden.called = true; } }
  };
  vm.runInContext(fs.readFileSync('src/content/health.js','utf8'), sandbox, {filename:'health'});
  return { GT: sandbox.GT, hidden };
}

const results = [];
const t = (name, ok) => results.push([name, ok]);

// 1. 드리프트는 기본값(warn)에서 복귀시키지 않는다 — 이번 회귀의 본체
{
  const w = makeWorld({});
  w.GT.health.reconcile('a'.repeat(91), 'b'.repeat(100)); // 9% 차이
  t('드리프트 9% → 복귀하지 않음', w.hidden.called === false && w.GT.health.degraded === false);
  t('드리프트 9% → 경고로는 남음', w.GT.health.warned === true && w.GT.health.reasons.length === 1);
}

// 2. 임계값 미만이면 경고조차 없다
{
  const w = makeWorld({ 'drift.threshold': 20 });
  w.GT.health.reconcile('a'.repeat(91), 'b'.repeat(100));
  t('임계값 20% > 실제 9% → 조용함', w.GT.health.warned === false && w.GT.health.reasons.length === 0);
}

// 3. onBreak=revert 를 고르면 치명 실패는 복귀시킨다
{
  const w = makeWorld({ onBreak: 'revert' });
  w.GT.health.fail('tap', '응답 없음');
  t('onBreak=revert → 복귀함', w.hidden.called === true && w.GT.health.degraded === true);
}

// 4. onBreak=warn 이면 치명 실패여도 복귀하지 않는다
{
  const w = makeWorld({ onBreak: 'warn' });
  w.GT.health.fail('tap', '응답 없음');
  t('onBreak=warn → 복귀 안 함, 경고만', w.hidden.called === false && w.GT.health.degraded === false && w.GT.health.warned === true);
}

// 5. onBreak=ignore 는 경고도 남기지 않는다
{
  const w = makeWorld({ onBreak: 'ignore' });
  w.GT.health.fail('tap', '응답 없음');
  t('onBreak=ignore → 조용함', w.hidden.called === false && w.GT.health.warned === false);
}

// 6. 같은 사유는 한 번만 쌓인다
{
  const w = makeWorld({});
  w.GT.health.fail('tap', '응답 없음');
  w.GT.health.fail('tap', '응답 없음');
  t('중복 사유 억제', w.GT.health.reasons.length === 1);
}

// 7. 스키마 기본값 — 사용자가 요청한 '복귀하지 마'가 기본이어야 한다
{
  const sandbox = { globalThis: null }; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/shared/defaults.js','utf8'), sandbox, {filename:'d'});
  t('기본 onBreak 이 warn', sandbox.GT_DEFAULTS.onBreak === 'warn');
  t('옵션 화면 스키마에 onBreak 존재', sandbox.GT_SCHEMA.some((f) => f.key === 'onBreak'));
}

// 8. fiber 판정 — 사용자 메시지 때문에 오탐이 나면 안 된다
{
  const w = makeWorld({});
  const v = (e, h) => w.GT.health.fiberVerdict(e, h);
  t('대상 0건이면 판단하지 않는다 (사용자 메시지만 있는 순간)', v(0, 0) === 'unknown');
  t('대상 있고 전부 성공 → ok', v(3, 3) === 'ok');
  t('대상 있고 전부 실패 → broken', v(3, 0) === 'broken');
  t('일부만 실패 → partial', v(3, 1) === 'partial');
}

// 9. 오탐이 배지를 노랗게 만들지 않는다
{
  const w = makeWorld({});
  if (w.GT.health.fiberVerdict(0, 0) === 'broken') w.GT.health.soft('fiber 실패');
  t('대상 0건에서는 경고도 배지도 없다', w.GT.health.warned === false && w.GT.health.reasons.length === 0);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
