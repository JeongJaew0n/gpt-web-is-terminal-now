// 대화 원본(mapping)에서 화면에 그릴 메시지만 활성 분기 순서로 뽑는다.
// docs/issue/2026-08-31-partial-thread-harvest.md 와 -assistant-message-duplication.md 의 근본 수정.
import fs from 'node:fs'; import vm from 'node:vm';

function load() {
  const sandbox = { console, Object, Set, Map, Array, Number, String, Boolean, JSON, Math, Promise, Error,
    location: { pathname: '/' }, encodeURIComponent };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { oai: { get: async () => { throw new Error('no network'); } } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/conversation.js','utf8'), sandbox, {filename:'conversation.js'});
  return sandbox.GT.conversation;
}

const results = []; const t = (n, ok) => results.push([n, ok]);

// mapping 헬퍼: 부모 사슬로 이어 붙인다
function conv(msgs, opts) {
  const mapping = { root: { id: 'root', parent: null, children: [], message: null } };
  let prev = 'root';
  msgs.forEach((m, i) => {
    const id = m.id || 'n' + i;
    mapping[id] = { id, parent: prev, children: [], message: { id, ...m } };
    mapping[prev].children.push(id);
    prev = id;
  });
  return { mapping, current_node: prev, title: 'T', ...(opts || {}) };
}
const M = (role, ct, text, extra) => ({
  author: { role }, recipient: 'all',
  content: { content_type: ct, parts: text == null ? [] : [text] },
  create_time: 1756700000, ...(extra || {})
});

const C = load();

// 1. 추론 조각은 본문에서 빠진다
{
  const c = conv([
    M('user','text','질문'),
    M('assistant','reasoning_recap',null),
    M('assistant','text','최종 답'),
  ]);
  const r = C.toRecords(c);
  t('추론 조각 제외', r.length === 2);
  t('본문만 남음', r.map(x=>x.role+':'+x.text).join('|') === 'user:질문|assistant:최종 답');
  t('추론이 있었다는 사실은 기록', r[1].thinking === 1);
}

// 2. 추론이 여러 개여도 응답은 하나
{
  const c = conv([
    M('user','text','q'),
    M('assistant','reasoning_recap',null),
    M('assistant','reasoning_recap',null),
    M('assistant','text','답'),
  ]);
  const r = C.toRecords(c);
  t('응답 1건', r.filter(x=>x.role==='assistant').length === 1);
  t('추론 2회 기록', r[1].thinking === 2);
}

// 3. 툴 호출(recipient != all)은 본문이 아니다
{
  const c = conv([ M('user','text','q'), M('assistant','text','도구호출',{recipient:'python'}), M('assistant','text','답') ]);
  const r = C.toRecords(c);
  t('툴 호출 제외', r.filter(x=>x.role==='assistant').length === 1 && r[1].text === '답');
}

// 4. 활성 분기만 따라간다 — 버려진 분기(재생성 이전)는 섞이지 않는다
{
  const base = conv([ M('user','text','q') ]);
  const uid = Object.keys(base.mapping).find(k => k !== 'root');
  base.mapping.oldA = { id:'oldA', parent: uid, children: [], message: { id:'oldA', ...M('assistant','text','버려진 답') } };
  base.mapping.newA = { id:'newA', parent: uid, children: [], message: { id:'newA', ...M('assistant','text','다시 만든 답') } };
  base.mapping[uid].children = ['oldA','newA'];
  base.current_node = 'newA';
  const r = C.toRecords(base);
  t('버려진 분기 제외', r.length === 2 && r[1].text === '다시 만든 답');
}

// 5. metadata.reasoning_status 만 있어도 추론으로 본다
{
  const c = conv([ M('user','text','q'), M('assistant','text','중간',{metadata:{reasoning_status:'x'}}), M('assistant','text','답') ]);
  const r = C.toRecords(c);
  t('reasoning_status 로도 걸러짐', r.filter(x=>x.role==='assistant').length === 1);
}

// 6. 순서는 부모 사슬 순서 그대로
{
  const c = conv([ M('user','text','1'), M('assistant','text','2'), M('user','text','3'), M('assistant','text','4') ]);
  t('순서 보존', C.toRecords(c).map(x=>x.text).join('') === '1234');
}

// 7. create_time 을 실제 시각으로 옮긴다 (수확과 달리 시각을 안다)
{
  const r = C.toRecords(conv([ M('user','text','q') ]));
  t('시각 보존', r[0].at === 1756700000 * 1000);
}

// 8. 경로에서 id 추출
{
  t('경로 파싱', C.idFromPath('/c/6a95-abc') === '6a95-abc' && C.idFromPath('/') === null);
}

// 9. 순환 참조에도 멈춘다
{
  const c = conv([ M('user','text','q') ]);
  const uid = Object.keys(c.mapping).find(k => k !== 'root');
  c.mapping.root.parent = uid;   // 사이클
  t('사이클에서 무한루프 없음', C.activeBranch(c).length >= 1);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
