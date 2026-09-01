// 원본은 진입 경로에 따라 턴을 다 그리지 않는다. 부분 수확이 스크롤백을 갉아먹으면 안 된다.
// docs/issue/2026-08-31-partial-thread-harvest.md 회귀 방지.
import fs from 'node:fs'; import vm from 'node:vm';

function fresh() {
  const sandbox = { console, Object, Map, Set, Array, Date, Number, String, Boolean };
  sandbox.globalThis = sandbox; sandbox.GT = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sandbox, { filename: 'store.js' });
  return sandbox.GT.store;
}
const ids = (s) => s.state.messages.map((m) => m.id).join(',');
const results = []; const t = (n, ok) => results.push([n, ok]);

const M = (id, role, text) => ({ id, role, text: text || id, model: null });

// 1. 부분 수확이 기존 메시지를 지우면 안 된다 (콜드 로드에서 앞쪽 턴이 빠지는 경우)
{
  const s = fresh();
  s.applyHarvest([M('t1','user'),M('t2','assistant'),M('t3','user'),M('t4','assistant')], {path:'/c/x'});
  const r = s.applyHarvest([M('t3','user'),M('t4','assistant')], {path:'/c/x'});   // 앞쪽 2개가 빠진 수확
  t('부분 수확에도 4건 유지', s.state.messages.length === 4 && ids(s) === 't1,t2,t3,t4');
  t('merge 로 보고', r.mode === 'merge' && r.kept === 2);
}

// 2. 더 많이 본 수확은 순서를 포함해 채택한다 (뒤늦게 앞쪽 턴이 붙는 경우)
{
  const s = fresh();
  s.applyHarvest([M('t3','user'),M('t4','assistant')], {path:'/c/x'});
  const r = s.applyHarvest([M('t1','user'),M('t2','assistant'),M('t3','user'),M('t4','assistant')], {path:'/c/x'});
  t('늦게 붙은 앞쪽 턴 반영', ids(s) === 't1,t2,t3,t4');
  t('adopt 로 보고', r.mode === 'adopt' && r.gained === 2);
}

// 3. 대화가 바뀌면 갈아엎는다 (이전 대화가 새 대화에 섞이면 안 된다)
{
  const s = fresh();
  s.applyHarvest([M('a1','user'),M('a2','assistant')], {path:'/c/A'});
  const r = s.applyHarvest([M('b1','user')], {path:'/c/B'});
  t('대화 전환 시 교체', ids(s) === 'b1' && r.mode === 'replace');
}

// 4. 스트림으로 받은 메시지는 수확이 몰라도 살아남는다
{
  const s = fresh();
  s.applyHarvest([M('t1','user')], {path:'/c/x'});
  s.userSent('새 질문', 'u2');
  s.begin({id:'a2', role:'assistant', text:''});
  s.delta('a2','스트리밍 결과');
  s.end('a2','스트리밍 결과');
  s.applyHarvest([M('t1','user')], {path:'/c/x'});      // DOM 은 아직 새 턴을 모른다
  t('스트림 결과 보존', s.state.byId.has('a2') && s.state.byId.get('a2').text === '스트리밍 결과');
  t('사용자 메시지도 보존', s.state.byId.has('u2'));
}

// 5. 재수확이 본문을 갱신한다 (스트림 누적본 → fiber 원문 교정)
{
  const s = fresh();
  s.applyHarvest([M('t1','user','원본')], {path:'/c/x'});
  s.applyHarvest([M('t1','user','고쳐진 본문'), M('t2','assistant','새 턴')], {path:'/c/x'});
  t('본문 갱신', s.state.byId.get('t1').text === '고쳐진 본문');
  t('새 턴 추가', s.state.messages.length === 2);
}

// 6. 수확된 메시지는 시각을 모른다 — 가짜 시각을 만들지 않는다
{
  const s = fresh();
  s.applyHarvest([M('t1','user')], {path:'/c/x'});
  t('수확 메시지 at 은 null', s.state.byId.get('t1').at === null);
  s.begin({id:'a1', role:'assistant', text:''});
  t('스트림 메시지는 실제 시각', typeof s.state.byId.get('a1').at === 'number');
}

// 7. 같은 수확을 반복해도 변하지 않는다
{
  const s = fresh();
  const set = [M('t1','user'),M('t2','assistant')];
  s.applyHarvest(set, {path:'/c/x'});
  s.applyHarvest(set, {path:'/c/x'});
  s.applyHarvest(set, {path:'/c/x'});
  t('멱등', s.state.messages.length === 2 && ids(s) === 't1,t2');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
