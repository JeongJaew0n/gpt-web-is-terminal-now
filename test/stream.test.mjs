// SSE 스트림을 실제로 흘려보내 tap.js 의 판별을 검증한다.
// 이 파일이 존재하는 이유: 건너뛴 메시지의 본문 델타가 그대로 새어나와
// '중간 답변'으로 보이던 회귀를 다시 만들지 않기 위해서다.
import fs from 'node:fs'; import vm from 'node:vm';

function runStream(lines) {
  const posted = [];
  const sandbox = {
    console: { debug(){}, warn(){}, error(){}, log(){} },
    location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/', pathname: '/' },
    document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, title: '' },
    TextDecoder, Response, ReadableStream, CSS: { escape: (x) => x },
    Object, Array, Set, Map, JSON, Math, Number, String, Boolean, Promise, Error, RegExp, Date,
    setTimeout, queueMicrotask
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.window.addEventListener = () => {};
  sandbox.postMessage = (msg) => { if (msg && msg.__gpt_term__) posted.push(msg); };
  // 원본 fetch: SSE 본문을 돌려준다
  sandbox.fetch = async () => new Response(
    new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(lines.join('\n') + '\n')); c.close(); } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/main/tap.js', 'utf8'), sandbox, { filename: 'tap.js' });
  return { posted, call: () => sandbox.window.fetch('https://chatgpt.com/backend-api/f/conversation', { method: 'POST' }) };
}

async function collect(lines) {
  const { posted, call } = runStream(lines);
  const res = await call();
  await res.text();                       // 페이지 쪽 소비
  await new Promise((r) => setTimeout(r, 30));
  return posted.filter((m) => m.dir === 'm2i');
}

const D = (o) => 'data: ' + JSON.stringify(o);
const ENC = ['event: delta_encoding', 'data: "v1"'];
const addMsg = (id, role, ctype, extra) => D({ p: '', o: 'add', v: { message: {
  id, author: { role, name: null, metadata: {} },
  content: { content_type: ctype, parts: [''] },
  status: 'in_progress', end_turn: null, recipient: 'all',
  metadata: { model_slug: 'gpt-5-thinking', ...((extra && extra.metadata) || {}) },
  ...(extra || {}) } } });
const append = (t) => D({ p: '/message/content/parts/0', o: 'append', v: t });
const cont = (t) => D({ v: t });
const marker = (id, mk) => D({ type: 'message_marker', message_id: id, marker: mk, event: 'first' });
const COMPLETE = D({ type: 'message_stream_complete', conversation_id: 'c1' });

const results = []; const t = (n, ok) => results.push([n, ok]);
const kinds = (evs) => evs.map((e) => e.kind);
const lastEnd = (evs) => (evs.filter((e) => e.kind === 'end').pop() || {}).payload || {};
const finalText = (evs) => { const d = evs.filter((e) => e.kind === 'delta').pop(); return d ? d.payload.text : null; };

// 1. 평범한 응답
{
  const ev = await collect([...ENC, addMsg('a1','assistant','text'), append('최종 '), append('답변'), COMPLETE]);
  t('begin 1회', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('본문 누적', finalText(ev) === '최종 답변');
  t('end.began true', lastEnd(ev).began === true);
}

// 2. 추론 조각이 앞에 오고 그 본문 델타가 흐른다 — 새어나오면 안 된다 (이번 회귀)
{
  const ev = await collect([...ENC,
    addMsg('r1','assistant','reasoning_recap'),
    append('사용자가 원하는 것은'), append(' 아마도…'),   // ← 추론 본문
    addMsg('a1','assistant','text'),
    append('최종 답변입니다'),
    COMPLETE]);
  t('추론 알림 발생', kinds(ev).includes('thinking'));
  t('begin 은 최종 것 1회만', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('추론 본문이 새지 않는다', !ev.some((e) => e.kind === 'delta' && /아마도/.test(e.payload.text)));
  t('최종 본문만 보인다', finalText(ev) === '최종 답변입니다');
}

// 3. 숨김 시스템 메시지만 있고 그 본문이 흐른다 — 렌더되면 안 된다
{
  const ev = await collect([...ENC,
    addMsg('s1','assistant','text',{ metadata: { is_visually_hidden_from_conversation: true } }),
    append('내부 컨텍스트 문자열'),
    COMPLETE]);
  t('숨김 메시지는 begin 없음', !kinds(ev).includes('begin'));
  t('숨김 본문이 새지 않는다', !ev.some((e) => e.kind === 'delta'));
  t('빈 스트림으로 보고', lastEnd(ev).began === false);
}

// 4. 서버가 user_visible_token 을 주면 건너뛴 것도 받아들인다
{
  const ev = await collect([...ENC,
    addMsg('x1','assistant','reasoning_recap'),
    marker('x1','user_visible_token'),
    append('사실은 최종 답변'),
    COMPLETE]);
  t('marker 로 승격', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('승격 후 본문 수신', finalText(ev) === '사실은 최종 답변');
  t('marker 로 받아들였음을 보고', lastEnd(ev).markerAnchored === true);
}

// 5. add 가 아예 없는 스트림 — 자리를 만들어 한 줄로 받는다
{
  const ev = await collect([...ENC, append('앵커 없는 '), cont('본문'), COMPLETE]);
  t('앵커 합성', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('한 줄로 누적', finalText(ev) === '앵커 없는 본문');
  t('orphan 보고', lastEnd(ev).orphan === true);
}

// 6. 툴 호출(recipient != all)은 본문이 아니다
{
  const ev = await collect([...ENC,
    addMsg('t1','assistant','text',{ recipient: 'python' }),
    append('print(1)'),
    addMsg('a1','assistant','text'),
    append('결과는 1입니다'),
    COMPLETE]);
  t('툴 본문이 새지 않는다', !ev.some((e) => e.kind === 'delta' && /print/.test(e.payload.text)));
  t('최종만 남음', finalText(ev) === '결과는 1입니다');
}

// 7. 모르는 content_type 은 버리지 않는다 (fail-open)
{
  const ev = await collect([...ENC, addMsg('u1','assistant','brand_new_type'), append('새 종류 본문'), COMPLETE]);
  t('모르는 종류도 받는다', finalText(ev) === '새 종류 본문');
}

// 8. add 는 숨김 시스템 메시지뿐인데 서버가 marker 로 진짜 메시지를 알려주는 경우
//    실측에서 반복해 나온 모양이다. 서버 표시를 앵커로 삼아 한 줄로 받아야 한다.
{
  const ev = await collect([...ENC,
    addMsg('sys1','system','text',{ metadata: { is_visually_hidden_from_conversation: true } }),
    marker('real1','user_visible_token'),
    marker('real1','final_channel_token'),
    append('진짜 응답입니다'),
    COMPLETE]);
  t('marker 앵커로 begin 1회', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('marker 앵커 본문 수신', finalText(ev) === '진짜 응답입니다');
  t('markerAnchored 보고', lastEnd(ev).markerAnchored === true);
  t('begin 의 id 가 서버가 준 id', ev.find((e) => e.kind === 'begin').payload.id === 'real1');
}

// 9. 이미 본문을 받고 있으면 marker 가 새 줄을 만들지 않는다
{
  const ev = await collect([...ENC,
    addMsg('a1','assistant','text'), marker('a1','final_channel_token'),
    append('본문'), COMPLETE]);
  t('marker 가 중복 begin 을 만들지 않는다', kinds(ev).filter((k) => k === 'begin').length === 1);
}

// 10. 실측한 모양 그대로 — add 는 숨김 시스템 하나, 나머지는 marker 로만 등장
//     cot 본문이 답변에 섞이면 안 된다.
{
  const ev = await collect([...ENC,
    addMsg('sys1','system','text',{ metadata: { is_visually_hidden_from_conversation: true } }),
    marker('cot1','cot_token'),
    append('사용자가 묻는 것은 산의 높이'),          // ← 추론 본문
    marker('ans1','user_visible_token'),
    marker('ans1','final_channel_token'),
    append('에베레스트산이다.'),
    marker('ans1','last_token'),
    COMPLETE]);
  t('실측형: begin 1회', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('실측형: 추론 알림', kinds(ev).includes('thinking'));
  t('실측형: cot 본문이 섞이지 않는다', !ev.some((e) => e.kind === 'delta' && /사용자가 묻는/.test(e.payload.text)));
  t('실측형: 최종 본문만', finalText(ev) === '에베레스트산이다.');
  t('실측형: begin id 가 서버 id', ev.find((e) => e.kind === 'begin').payload.id === 'ans1');
}

// 11. last_token 은 전환 신호가 아니다 (새 줄을 만들면 안 된다)
{
  const ev = await collect([...ENC,
    marker('a1','user_visible_token'), append('본문'), marker('a1','last_token'), COMPLETE]);
  t('last_token 은 begin 을 늘리지 않는다', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('last_token 뒤에도 본문 유지', finalText(ev) === '본문');
}

// 12. 같은 메시지에 visible marker 가 두 번 와도 한 줄
{
  const ev = await collect([...ENC,
    marker('a1','user_visible_token'), marker('a1','final_channel_token'),
    append('본문'), COMPLETE]);
  t('중복 marker 무해', kinds(ev).filter((k) => k === 'begin').length === 1 && finalText(ev) === '본문');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
