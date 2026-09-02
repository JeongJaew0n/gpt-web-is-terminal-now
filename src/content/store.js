// gpt-term — 대화 모델. 원본 DOM 을 미러링하지 않고 자체 상태를 유지한다.
GT.store = (function () {
  'use strict';

  const state = {
    messages: [],           // {id, role, model, text, streaming, parts, at}
    byId: new Map(),
    streamingId: null,      // 지금 토큰을 받고 있는 메시지
    slotId: null,           // 현재 턴이 차지한 assistant 레코드 (아래 설명)
    superseded: 0,          // 대체해서 버린 중간 메시지 수 (진단용)
    pendingThinking: 0,     // 다음 응답 앞에 쌓인 추론 조각 수
    orphanDeltas: 0,        // add 없이 도착한 본문 델타 (스트림 해석이 어긋났다는 신호)
    startedAt: 0,
    conversationTitle: '',
    path: '/'
  };

  const listeners = [];
  const emit = (why) => listeners.forEach((fn) => fn(state, why));

  const upsert = (m) => {
    const existing = m.id && state.byId.get(m.id);
    if (existing) { Object.assign(existing, m); return existing; }
    const rec = { at: Date.now(), streaming: false, parts: null, ...m };
    state.messages.push(rec);
    if (rec.id) state.byId.set(rec.id, rec);
    return rec;
  };

  // 한 턴에 assistant 메시지가 여러 개 온다.
  // 추론 모델은 사고 조각·중간 산출물을 각각 별개 메시지로 흘리고, 원본 UI 는 마지막 것만 그린다.
  // 우리는 턴마다 자리(slot)를 하나만 두고, 새 메시지가 오면 그 자리를 대체한다.
  // 자리는 사용자 메시지가 올 때만 비워진다 — 스트림이 끝났다고 비우면
  // end → begin 순서로 오는 후속 메시지가 다시 새 줄로 쌓인다.
  const supersede = (oldId, m) => {
    const old = state.byId.get(oldId);
    const idx = state.messages.indexOf(old);
    const rec = { at: old ? old.at : Date.now(), parts: null, ...m, streaming: true };
    state.byId.delete(oldId);
    if (idx >= 0) state.messages[idx] = rec; else state.messages.push(rec);
    if (rec.id) state.byId.set(rec.id, rec);
    state.superseded += 1;
    return rec;
  };

  return {
    state,
    onChange(fn) { listeners.push(fn); },

    replaceAll(messages, meta) {
      state.messages = [];
      state.byId.clear();
      state.slotId = null;
      state.streamingId = null;
      state.superseded = 0;
      state.orphanDeltas = 0;
      messages.forEach((m) => upsert({ at: null, ...m }));
      if (meta) {
        if (meta.title) state.conversationTitle = meta.title;
        if (meta.path) state.path = meta.path;
      }
      emit('harvest');
    },

    // DOM 수확 결과를 반영한다.
    //
    // 원본은 진입 경로에 따라 턴을 다 그리지 않는다 — 콜드 로드에서 앞쪽 턴이 통째로 빠지는 걸 확인했다.
    // 그래서 수확 결과를 정답으로 믿고 갈아엎으면 안 된다. 두 가지를 지킨다.
    //   1. 대화가 바뀌었으면 갈아엎는다.
    //   2. 같은 대화면 합친다. 수확에 없는 메시지는 '삭제된 것'이 아니라 '아직 안 그려진 것'이므로 지키고,
    //      수확이 우리보다 많이 알고 있으면 그 순서를 채택한다.
    //      스트림으로 받은 메시지도 이 규칙 덕에 살아남는다(DOM 에 뜨기 전에 수확이 돌 수 있다).
    applyHarvest(messages, meta) {
      const path = meta && meta.path;
      if (meta && meta.title) state.conversationTitle = meta.title;

      if (path && path !== state.path) {
        state.path = path;
        this.replaceAll(messages, meta);
        return { mode: 'replace', kept: 0, gained: messages.length };
      }
      if (path) state.path = path;

      const incoming = new Set(messages.map((m) => m.id).filter(Boolean));
      const missing = state.messages.filter((m) => m.id && !incoming.has(m.id));

      if (missing.length === 0) {
        // 수확이 우리가 아는 것을 전부 포함한다 — DOM 순서를 그대로 채택한다.
        const gained = messages.length - state.messages.length;
        const prev = new Map(state.byId);
        state.messages = [];
        state.byId.clear();
        messages.forEach((m) => {
          const old = m.id && prev.get(m.id);
          upsert({ at: old ? old.at : null, ...m });
        });
        emit('harvest');
        return { mode: 'adopt', kept: 0, gained };
      }

      // 수확이 우리보다 적게 안다. 가진 것을 버리지 않고 갱신·추가만 한다.
      let gained = 0;
      messages.forEach((m) => {
        if (m.id && state.byId.has(m.id)) {
          const rec = state.byId.get(m.id);
          if (typeof m.text === 'string' && m.text) rec.text = m.text;
          if (m.model) rec.model = m.model;
          if (m.parts) rec.parts = m.parts;
        } else {
          upsert({ at: null, ...m });
          gained += 1;
        }
      });
      emit('harvest');
      return { mode: 'merge', kept: missing.length, gained };
    },

    // 이름을 바꾸면 다음 수확을 기다리지 않고 상단바를 바로 고친다.
    setTitle(t) {
      state.conversationTitle = String(t || '');
      emit('title');
    },

    userSent(text, id) {
      state.slotId = null;        // 새 턴이 열린다
      state.pendingThinking = 0;
      upsert({ id: id || `local-${Date.now()}`, role: 'user', text, model: null });
      emit('user');
    },

    // 추론 조각이 흘러왔다. 본문은 아니지만 "생각 중이었다"는 사실은 남긴다.
    thinking() {
      state.pendingThinking += 1;
      emit('thinking');
    },

    begin(m) {
      if (state.slotId && state.slotId !== m.id && state.byId.has(state.slotId)) {
        supersede(state.slotId, m);
      } else {
        if (!state.slotId) state.startedAt = Date.now();
        upsert({ ...m, streaming: true });
      }
      state.slotId = m.id;
      state.streamingId = m.id;
      if (state.pendingThinking) {
        const rec = state.byId.get(m.id);
        if (rec) rec.thinking = state.pendingThinking;
        state.pendingThinking = 0;
      }
      emit('begin');
    },

    // 델타는 반드시 기존 레코드에 붙는다.
    //
    // 예전에는 id 가 없으면 새 레코드를 만들었다. 그런데 id 가 없는 레코드는 byId 에 등록되지
    // 않으므로 다음 델타도 또 새 레코드를 만든다 — 응답 하나가 '점점 길어지는 접두사' 수십 줄로
    // 쌓였다. 스트림이 add 없이 본문부터 보내는 경우가 실재한다(재개 연결 등).
    // 그래서 붙일 곳을 순서대로 찾고, 정말 없을 때만 한 번 만든다.
    delta(id, text) {
      let rec = (id && state.byId.get(id))
        || (state.streamingId && state.byId.get(state.streamingId))
        || (state.slotId && state.byId.get(state.slotId))
        || null;

      if (!rec) {
        const synth = id || `orphan-${Date.now()}`;
        rec = upsert({ id: synth, role: 'assistant', text: '', streaming: true });
        state.streamingId = synth;
        if (!state.slotId) state.slotId = synth;
        state.orphanDeltas += 1;   // add 를 놓쳤다는 신호. :health 에 뜬다.
      }

      rec.text = text;
      rec.streaming = true;
      emit('delta');
    },

    end(id, text) {
      const rec = (id && state.byId.get(id)) || state.messages[state.messages.length - 1];
      if (rec) { if (typeof text === 'string' && text) rec.text = text; rec.streaming = false; }
      state.streamingId = null;
      // slotId 는 그대로 둔다. 같은 턴에서 또 begin 이 오면 이 자리를 대체해야 한다.
      emit('end');
    },

    isStreaming() { return state.streamingId !== null; },
    elapsed() { return state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0; },
    // 컨텍스트 사용량은 페이지가 노출하지 않는다. 근사치임을 UI 에서 명시한다.
    approxChars() { return state.messages.reduce((n, m) => n + (m.text ? m.text.length : 0), 0); }
  };
})();
