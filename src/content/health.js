// gpt-term — 깨짐 감지.
// 무엇을 할지는 설정(onBreak)이 정한다. 기본은 '터미널 유지 + 배지 알림'이다.
// 원본 UI 로 자동 복귀할지는 사용자가 옵션 화면에서 고른다.
GT.health = (function () {
  'use strict';

  const CHECKS = {
    tap: { ok: false, label: 'MAIN world tap', fatal: true },
    composer: { ok: false, label: '컴포저 #prompt-textarea', fatal: true },
    thread: { ok: false, label: '스레드 컨테이너 #thread', fatal: true },
    schema: { ok: true, label: '델타 인코딩 v1', fatal: false },
    fiber: { ok: true, label: 'React fiber 마크다운 원문', fatal: false }
  };

  let reverted = false;   // 원본 UI 로 돌아갔다
  let warned = false;     // 문제는 있지만 터미널은 유지 중
  const reasons = [];

  const policy = () => GT.config.get('onBreak') || 'warn';

  function report() {
    GT.sendToSW({
      kind: 'health',
      degraded: reverted,
      warned,
      reasons,
      checks: Object.fromEntries(Object.entries(CHECKS).map(([k, v]) => [k, v.ok]))
    });
  }

  function note(reason) {
    if (reasons.includes(reason)) return false;
    reasons.push(reason);
    // console.warn/error 는 chrome://extensions 의 오류 목록에 '영구히' 쌓인다.
    // 그 목록은 확장을 다시 로드해도 안 지워지고 제거해야 사라진다 —
    // 평범한 경고를 거기 남기면 이미 지나간 문제가 계속 떠 있는 것처럼 보인다.
    // 경고는 터미널 스크롤백과 배지로 이미 보이므로 콘솔은 debug 로만 남긴다.
    console.debug('[gpt-term]', reason);
    return true;
  }

  return {
    CHECKS,
    get degraded() { return reverted; },
    get warned() { return warned; },
    get reasons() { return reasons.slice(); },

    pass(name) { if (CHECKS[name]) { CHECKS[name].ok = true; report(); } },

    // 전제가 깨졌다. 처리 방식은 onBreak 설정이 정한다.
    fail(name, reason) {
      const check = CHECKS[name];
      if (check) check.ok = false;
      const text = `${(check && check.label) || name}: ${reason}`;
      if (!note(text)) return;

      const p = policy();
      if (p === 'ignore') { report(); return; }

      warned = true;
      try { GT.tty.system('error', text); } catch (_) {}

      if (p === 'revert' && !reverted) {
        reverted = true;
        try { GT.tty.setMode('BROKEN'); GT.tty.hide(); } catch (_) {}
        console.debug('[gpt-term] 원본 UI 로 복귀:', text);
      }
      report();
    },

    // 치명적이지 않은 경고. 절대 복귀시키지 않는다.
    soft(reason) {
      if (!note(reason)) return;
      warned = true;
      try { GT.tty.system('warn', reason); } catch (_) {}
      report();
    },

    report,

    // 수확 결과로 fiber 추출이 깨졌는지 판정한다.
    // 비교 대상을 맞추는 게 전부다 — 사용자 메시지는 .markdown 이 없어 애초에 대상이 아니다.
    // 전체 메시지 수로 나누면 assistant 응답이 아직 없는 순간마다 '깨졌다'고 오판한다.
    fiberVerdict(eligible, hits) {
      if (!eligible) return 'unknown';        // 판단 근거가 없다. 아무 말도 하지 않는다.
      if (hits === 0) return 'broken';
      if (hits < eligible) return 'partial';
      return 'ok';
    },

    // 스트림으로 누적한 본문과 fiber 원문을 대조한다.
    // 화면은 호출한 쪽에서 fiber 원문으로 덮어쓰므로 이미 교정돼 있다 — 그래서 경고에 그친다.
    // 파서가 스키마 변화를 못 따라가고 있다는 신호로서만 의미가 있다.
    reconcile(streamText, fiberText) {
      if (typeof fiberText !== 'string' || !fiberText) return;
      if (typeof streamText !== 'string') return;
      const a = streamText.trim(), b = fiberText.trim();
      if (a === b) return;
      const pct = Math.round((Math.abs(a.length - b.length) / Math.max(b.length, 1)) * 100);
      const limit = Number(GT.config.get('drift.threshold')) || 8;
      if (pct < limit) return;
      CHECKS.schema.ok = false;
      GT.health.soft(
        `스트림 본문이 원본과 ${pct}% 어긋난다 (스트림 ${a.length}자 / 원본 ${b.length}자). ` +
        '화면은 원본 기준으로 교정했다. 델타 파서가 일부 op 를 놓치고 있다는 뜻이다.'
      );
    }
  };
})();
