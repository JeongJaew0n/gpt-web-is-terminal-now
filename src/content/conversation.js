// gpt-term — 대화 원본을 백엔드에서 읽는다.
//
// DOM 수확은 원본이 그려준 만큼만 볼 수 있다. 진입 경로에 따라 앞쪽 턴이 통째로 빠진다
// (docs/issue/2026-08-31-partial-thread-harvest.md).
// 여기가 그 문제의 근본 해결이다 — 렌더 여부와 무관하게 전체를 받는다.
GT.conversation = (function () {
  'use strict';

  const idFromPath = (p) => {
    const m = /^\/c\/([0-9a-zA-Z:-]+)/.exec(p || location.pathname);
    return m ? m[1] : null;
  };

  // 최종 응답만 고른다. 추론 조각(reasoning_recap)과 툴 호출은 화면에 그리지 않는다.
  // 판별자는 실측으로 확정했다 — content_type 이 'text' 이고 recipient 가 'all' 인 것만 본문이다.
  function isVisible(m) {
    if (!m || !m.author) return false;
    const role = m.author.role;
    if (role !== 'user' && role !== 'assistant') return false;
    if (m.recipient && m.recipient !== 'all') return false;
    const ct = m.content && m.content.content_type;
    return ct === 'text';
  }

  function isReasoning(m) {
    const ct = m && m.content && m.content.content_type;
    if (ct === 'reasoning_recap' || ct === 'thoughts') return true;
    return !!(m && m.metadata && m.metadata.reasoning_status);
  }

  // current_node 에서 부모를 따라 올라가면 지금 보이는 분기가 나온다.
  // 트리 전체를 순회하면 버려진 분기(재생성 이전 응답)까지 섞인다.
  function activeBranch(conv) {
    const line = [];
    const seen = new Set();
    let id = conv.current_node;
    while (id && conv.mapping[id] && !seen.has(id)) {
      seen.add(id);
      const n = conv.mapping[id];
      if (n.message) line.push(n.message);
      id = n.parent;
    }
    return line.reverse();
  }

  function toRecords(conv) {
    const branch = activeBranch(conv);
    const out = [];
    let pendingThinking = 0;

    branch.forEach((m) => {
      if (isReasoning(m)) { pendingThinking += 1; return; }
      if (!isVisible(m)) return;
      const parts = (m.content && m.content.parts) || [];
      out.push({
        id: m.id,
        role: m.author.role,
        model: (m.metadata && m.metadata.model_slug) || null,
        text: parts.filter((p) => typeof p === 'string').join('\n'),
        at: m.create_time ? Math.round(m.create_time * 1000) : null,
        thinking: m.author.role === 'assistant' && pendingThinking ? pendingThinking : 0
      });
      if (m.author.role === 'assistant') pendingThinking = 0;
    });
    return out;
  }

  async function load(id) {
    const cid = id || idFromPath();
    if (!cid) return null;
    const conv = await GT.oai.get(`/backend-api/conversation/${encodeURIComponent(cid)}`);
    if (!conv || !conv.mapping) throw new Error('mapping 없음');
    return {
      id: cid,
      title: conv.title || '',
      messages: toRecords(conv),
      model: conv.default_model_slug || null
    };
  }

  return { load, toRecords, activeBranch, isVisible, isReasoning, idFromPath };
})();
