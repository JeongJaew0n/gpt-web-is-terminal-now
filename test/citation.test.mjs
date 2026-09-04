// 인용 마커. 같은 인용이 경로마다 다른 표기로 오고, 출처는 메타에만 있다.
// docs/issue/2026-09-04-citation-markers-shown-raw.md
import fs from 'node:fs'; import vm from 'node:vm';

const E200 = '', E201 = '', E202 = '';
const pua = (kind, payload) => E200 + kind + (payload === undefined ? '' : E202 + payload) + E201;
const oai = (n) => `:contentReference[oaicite:${n}]{index=${n}}`;

function makeDom() {
  const mk = (tag) => ({
    tag, className: '', children: [], attrs: {}, dataset: {}, style: {}, _t: '',
    get textContent() { return this._t || this.children.map((c) => c.textContent || '').join(''); },
    set textContent(v) { this._t = String(v); this.children = []; },
    get title() { return this.attrs.title; }, set title(v) { this.attrs.title = v; },
    get href() { return this.attrs.href; }, set href(v) { this.attrs.href = v; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, replaceChild() {},
    all(pred, acc) { acc = acc || []; if (pred(this)) acc.push(this);
      this.children.forEach((c) => c.all && c.all(pred, acc)); return acc; }
  });
  return { createElement: mk, createElementNS: (ns, t) => mk(t),
    createTextNode: (t) => ({ tag: '#text', children: [], textContent: t, all: (p, a) => a || [] }),
    createDocumentFragment: () => mk('#frag') };
}

function load() {
  const sandbox = { console, Object, Array, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    document: makeDom(), setTimeout };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.GT = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/markdown.js', 'utf8'), sandbox, { filename: 'markdown.js' });
  return sandbox.GT.markdown;
}

const M = load();
const results = []; const t = (n, ok) => results.push([n, ok]);
const cls = (c) => (n) => new RegExp('(^| )' + c + '( |$)').test(n.className || '');
const text = (frag) => frag.textContent;
const cites = (frag) => frag.all(cls('gt-cite'));
const sources = (frag) => frag.all(cls('gt-source'));

const REF = (over) => Object.assign({
  type: 'grouped_webpages', matched: '', title: '기사 제목', url: 'https://example.com/a', attribution: 'ZDNet'
}, over || {});

// --- 두 표기 모두 각주가 된다 ---
{
  const refs = [REF()];
  const a = M.render('앞 ' + pua('cite', 'turn0search1') + ' 뒤', { refs });
  const b = M.render('앞 ' + oai(0) + ' 뒤', { refs });
  t('PUA 표기를 각주로 바꾼다', cites(a).length === 1 && cites(a)[0].textContent === '[1]');
  t('fiber 표기도 각주로 바꾼다', cites(b).length === 1 && cites(b)[0].textContent === '[1]');
  t('PUA 원문이 본문에 남지 않는다', !text(a).includes(E200) && !text(a).includes('cite'));
  t('fiber 원문이 본문에 남지 않는다', !text(b).includes('contentReference'));
  t('앞뒤 글자는 그대로', /앞 .*뒤/.test(text(a)) && /앞 .*뒤/.test(text(b)));
  t('두 표기의 결과가 같다', text(a) === text(b));
}

// --- 출처 목록 ---
{
  const frag = M.render('본문 ' + pua('cite', 'turn0search1'), { refs: [REF()] });
  const s = sources(frag);
  t('출처를 한 줄 적는다', s.length === 1);
  t('번호가 각주와 맞는다', s[0].textContent.startsWith('[1]'));
  t('출처 이름을 쓴다', s[0].textContent.includes('ZDNet'));
  const link = frag.all((n) => n.tag === 'a')[0];
  t('주소가 있으면 링크로', !!link && link.href === 'https://example.com/a');
  // target·rel 은 setAttribute 가 아니라 프로퍼티로 넣는다
  t('새 탭으로 열고 referrer 를 안 준다',
    link.target === '_blank' && /noreferrer/.test(link.rel || ''));
}

// --- 출처를 모르면 번호만 ---
{
  const frag = M.render('본문 ' + pua('cite', 'turn0search1'));
  t('refs 가 없어도 마커는 지운다', !text(frag).includes(E200));
  t('번호는 남긴다', cites(frag).length === 1);
  t('빈 출처 줄을 만들지 않는다', sources(frag).length === 0);
}
{
  const frag = M.render('본문 ' + pua('cite', 'x'), { refs: [REF({ title: '', url: '', attribution: '' })] });
  t('내용 없는 ref 는 목록에 안 넣는다', sources(frag).length === 0);
  t('그래도 번호는 매긴다', cites(frag).length === 1);
}

// --- 인용이 아닌 봉투는 지운다 ---
{
  const frag = M.render('앞' + pua('genui', '{"suggest_automation":{"label":"x"}}') + '뒤');
  t('genui 봉투를 지운다', text(frag) === '앞뒤');
  t('각주를 매기지 않는다', cites(frag).length === 0);
}
{
  // 실측된 조합: cite 4개 뒤에 genui 1개, content_references 는 그 순서 그대로
  const refs = [REF(), REF(), REF(), REF(), REF({ type: 'dil', title: '', url: '', attribution: '' })];
  const src = ['a' + pua('cite', 't0search17'), 'b' + pua('cite', 't0view0'),
    'c' + pua('cite', 't0news27'), 'd' + pua('cite', 't0view0'),
    'e' + pua('genui', '{"x":1}')].join(' ');
  const frag = M.render(src, { refs });
  t('인용 4개만 번호를 받는다', cites(frag).length === 4);
  t('번호가 1..4', cites(frag).map((c) => c.textContent).join('') === '[1][2][3][4]');
  t('genui 는 빠진다', !text(frag).includes('genui'));
  t('출처도 4줄', sources(frag).length === 4);
}

// --- 마커 순서가 content_references 인덱스다 ---
{
  const refs = [REF({ attribution: '첫째' }), REF({ attribution: '둘째' })];
  const frag = M.render(pua('cite', 'a') + ' 그리고 ' + pua('cite', 'b'), { refs });
  const s = sources(frag).map((n) => n.textContent);
  t('첫 마커가 refs[0]', s[0].includes('첫째'));
  t('둘째 마커가 refs[1]', s[1].includes('둘째'));
}
{
  // fiber 표기는 index 를 스스로 들고 있다 — 순서가 아니라 그 값을 쓴다
  const refs = [REF({ attribution: '첫째' }), REF({ attribution: '둘째' })];
  const frag = M.render(oai(1), { refs });
  t('fiber 는 index 로 찾는다', sources(frag)[0].textContent.includes('둘째'));
}

// --- 모르는 타입은 각주를 매기지 않는다 ---
{
  const frag = M.render('본문' + pua('cite', 'x'), { refs: [REF({ type: '처음보는type' })] });
  t('모르는 type 은 지우기만 한다', cites(frag).length === 0 && !text(frag).includes(E200));
}

// --- 다른 블록 안에서도 동작한다 ---
{
  const refs = [REF(), REF()];
  const frag = M.render('- 목록 ' + pua('cite', 'a') + '\n\n> 인용문 ' + pua('cite', 'b'), { refs });
  t('리스트·인용문 안의 마커도 처리한다', cites(frag).length === 2);
  t('번호가 이어진다', cites(frag).map((c) => c.textContent).join('') === '[1][2]');
  t('출처 목록은 한 번만', frag.all(cls('gt-sources')).length === 1);
}

// --- 마커가 없으면 아무것도 붙이지 않는다 ---
{
  const frag = M.render('평범한 문단이다.', { refs: [REF()] });
  t('마커가 없으면 출처도 없다', sources(frag).length === 0 && cites(frag).length === 0);
}

// --- 배선 ---
{
  const conv = fs.readFileSync('src/content/conversation.js', 'utf8');
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const plan = fs.readFileSync('src/content/renderplan.js', 'utf8');
  const store = fs.readFileSync('src/content/store.js', 'utf8');
  t('API 가 content_references 를 실어준다', /content_references/.test(conv) && /refs: toRefs\(m\.metadata\)/.test(conv));
  t('tty 가 refs 를 넘긴다', /render\(m\.text \|\| '', \{ refs: m\.refs \}\)/.test(tty));
  t('서명에 refs 를 넣는다', /m\.refs \? m\.refs\.length : -1/.test(plan));
  t('수확이 refs 를 지운다면 각주가 죽는다 — 지키게 했다', /old\.refs && !m\.refs/.test(store));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
