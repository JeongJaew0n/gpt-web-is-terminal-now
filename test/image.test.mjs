// 생성된 이미지. role 'tool' · multimodal_text · image_asset_pointer 로 온다.
// docs/plan/2026-09-09-image-generation.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

// ---------------------------------------------------------------- conversation

function loadConv() {
  const sandbox = { console, Object, Set, Map, Array, Number, String, Boolean, JSON, Math, Promise, Error,
    location: { pathname: '/' }, encodeURIComponent };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { oai: { get: async () => { throw new Error('no network'); } } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/conversation.js', 'utf8'), sandbox, { filename: 'conversation.js' });
  return sandbox.GT.conversation;
}

function conv(msgs) {
  const mapping = { root: { id: 'root', parent: null, children: [], message: null } };
  let prev = 'root';
  msgs.forEach((m, i) => {
    const id = m.id || 'n' + i;
    mapping[id] = { id, parent: prev, children: [], message: { id, ...m } };
    mapping[prev].children.push(id);
    prev = id;
  });
  return { mapping, current_node: prev, title: 'T' };
}

const PTR = 'sediment://file_00000000291081fdbac3898d5e140bb8';
// 실측한 모양 그대로 (2026-09-09)
const imgPart = (over) => Object.assign({
  content_type: 'image_asset_pointer',
  asset_pointer: PTR,
  mime_type: 'image/png',
  size_bytes: 934342,
  width: 1254,
  height: 1254,
  fovea: null,
  metadata: { dalle: { gen_id: 'x', prompt: '' } }
}, over || {});

// author.name 은 판별자가 아니다 — 실측값을 넣되 테스트가 이 값에 기대지 않게 둔다
const toolImg = (parts, extra) => ({
  author: { role: 'tool', name: 't2uay3k.sj1i4kz' }, recipient: 'all',
  content: { content_type: 'multimodal_text', parts },
  create_time: 1757400000, ...(extra || {})
});
const M = (role, ct, text, extra) => ({
  author: { role }, recipient: 'all',
  content: { content_type: ct, parts: text == null ? [] : [text] },
  create_time: 1757400000, ...(extra || {})
});

const C = loadConv();

{
  const r = C.toRecords(conv([M('user', 'text', '그림 그려줘'), toolImg([imgPart()])]));
  t('이미지 메시지가 레코드로 들어온다', r.length === 2);
  const rec = r[1] || {};
  t('images 에 담긴다', !!rec.images && rec.images.length === 1);
  const im = (rec.images || [{}])[0];
  t('포인터를 그대로 옮긴다', im.pointer === PTR);
  t('크기를 옮긴다', im.w === 1254 && im.h === 1254);
  t('mime 을 옮긴다', im.mime === 'image/png');
  t('바이트를 옮긴다', im.bytes === 934342);
  // role 'tool' 을 그대로 두면 메타줄에 tool 이 찍히고 gutter 색이 갈린다
  t('화면에서는 assistant 다', rec.role === 'assistant');
  t('본문은 비어 있다', rec.text === '');
}

{
  // 한 장에 메시지가 둘 온다. 뒤엣것은 hidden 사본이다 — 그리면 같은 그림이 두 번 나온다
  const r = C.toRecords(conv([
    M('user', 'text', '그림'),
    toolImg([imgPart()]),
    toolImg([imgPart(), '프롬프트 원문 2551자…'], { metadata: { is_visually_hidden_from_conversation: true } })
  ]));
  t('hidden 사본은 버린다', r.length === 2);
  t('그림은 한 장만 남는다', r.filter((x) => x.images).length === 1);
}

{
  // multimodal_text 라는 이유만으로 열어 주면 web.run 결과가 빈 줄로 쌓인다
  const r = C.toRecords(conv([
    M('user', 'text', '질문'),
    { author: { role: 'tool', name: 'web.run' }, recipient: 'all',
      content: { content_type: 'multimodal_text', parts: ['검색 결과 텍스트'] }, create_time: 1 },
    M('assistant', 'text', '답')
  ]));
  t('이미지 없는 tool 메시지는 안 들어온다', r.length === 2);
  t('사용자와 응답만 남는다', r.map((x) => x.role).join(',') === 'user,assistant');
}

{
  // 실측 모양: parts=[image]|str — 텍스트와 그림이 같은 메시지에 있다
  const r = C.toRecords(conv([toolImg([imgPart(), '설명이 붙은 경우'])]));
  const rec = r[0] || {};
  t('텍스트와 이미지가 함께 온다', !!rec.images && rec.text === '설명이 붙은 경우');
}

{
  // 모르는 파트를 이미지로 오해하지 않는다
  const r = C.toRecords(conv([toolImg([{ content_type: 'audio_asset_pointer', asset_pointer: 'x' }])]));
  t('다른 종류의 포인터는 이미지가 아니다', r.length === 0);

  const r2 = C.toRecords(conv([toolImg([imgPart({ asset_pointer: '' })])]));
  t('포인터가 비면 이미지로 세지 않는다', r2.length === 0);
}

{
  // 이미지가 없는 대화는 전과 똑같아야 한다
  const r = C.toRecords(conv([M('user', 'text', 'a'), M('assistant', 'text', 'b')]));
  t('이미지 없는 대화는 그대로', r.length === 2 && r.every((x) => x.images === null));
}

// ---------------------------------------------------------------- image.js

function loadImage(getImpl) {
  const calls = [];
  const logs = [];
  const sandbox = { console, Object, Map, Array, Number, String, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    encodeURIComponent, setTimeout };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.document = {
    createElement: (tag) => ({
      tag, className: '', style: {}, children: [], _t: '',
      width: 0, height: 0,
      get textContent() { return this._t || this.children.map((c) => c.textContent || '').join(''); },
      set textContent(v) { this._t = String(v); this.children = []; },
      appendChild(c) { this.children.push(c); return c; },
      getContext: () => sandbox.__ctx,
      all(pred, acc) { acc = acc || []; if (pred(this)) acc.push(this);
        this.children.forEach((c) => c.all && c.all(pred, acc)); return acc; }
    })
  };
  sandbox.GT = {
    log: (...a) => logs.push(a.join(' ')),
    oai: { get: async (p) => { calls.push(p); return getImpl ? getImpl(p) : null; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/image.js', 'utf8'), sandbox, { filename: 'image.js' });
  return { I: sandbox.GT.image, calls, logs, sandbox };
}

{
  const { I } = loadImage();
  t('sediment 스킴에서 id 를 뽑는다', I.fileId(PTR) === 'file_00000000291081fdbac3898d5e140bb8');
  // 스킴은 한 번 바뀐 적이 있다(문헌의 file-service, 실측의 sediment)
  t('file-service 스킴도 받는다', I.fileId('file-service://file_abc123') === 'file_abc123');
  t('맨 id 도 받는다', I.fileId('file_abc123') === 'file_abc123');
  t('모르는 모양은 null', I.fileId('https://example.com/a.png') === null);
  t('빈 값도 null', I.fileId('') === null && I.fileId(null) === null);
  // 경로 조작을 그대로 URL 에 끼워 넣으면 안 된다
  t('이상한 문자는 걸러진다', I.fileId('sediment://../../etc/passwd') === null);
}

{
  t('바이트를 사람이 읽게 만든다', (() => {
    const { I } = loadImage();
    return I.size(0) === '' && I.size(512) === '512 B'
      && I.size(934342) === '912 KB' && I.size(3 * 1024 * 1024) === '3.0 MB';
  })());
}

{
  const { I, calls } = loadImage((p) => ({
    status: 'success', download_url: 'https://chatgpt.com/backend-api/estuary/content?sig=x',
    file_name: '요정.png', mime_type: 'image/png', file_size_bytes: 934342
  }));
  const e = await I.resolve(PTR);
  t('주소를 받아온다', !!e && /^https:\/\//.test(e.url));
  t('파일명도 받아온다', e.name === '요정.png');
  t('download 경로를 부른다', calls.length === 1 && /\/backend-api\/files\/file_[0-9a-f]+\/download$/.test(calls[0]));

  await I.resolve(PTR);
  t('두 번째는 캐시로 답한다', calls.length === 1);
  t('peek 로 바로 꺼낼 수 있다', !!I.peek(PTR));

  I.forget();
  t('비우면 캐시가 없다', I.peek(PTR) === null);
}

{
  // 같은 그림을 동시에 물어도 요청은 한 번만
  const { I, calls } = loadImage(() => ({ download_url: 'https://chatgpt.com/x' }));
  const [a, b, c] = await Promise.all([I.resolve(PTR), I.resolve(PTR), I.resolve(PTR)]);
  t('동시 요청을 합친다', calls.length === 1);
  t('셋 다 같은 것을 받는다', a === b && b === c && !!a);
}

{
  const { I, logs } = loadImage(() => ({ status: 'success' }));   // download_url 이 없다
  const e = await I.resolve(PTR);
  t('주소가 없으면 null', e === null);
  t('왜 실패했는지 남긴다', logs.some((x) => /이미지 주소를 받지 못했다/.test(x)));
}

{
  const { I, logs, calls } = loadImage();
  const e = await I.resolve('https://example.com/a.png');
  t('읽을 수 없는 포인터는 요청하지 않는다', e === null && calls.length === 0);
  t('그 사실을 남긴다', logs.some((x) => /포인터를 읽지 못했다/.test(x)));
}

{
  const { I, logs } = loadImage(() => { throw new Error('401'); });
  const e = await I.resolve(PTR);
  t('요청이 던져도 null 로 떨어진다', e === null);
  t('두 번째도 다시 시도한다', await I.resolve(PTR) === null && logs.length === 2);
}

// --- 문자 블록의 격자 계산 ---
{
  const { I, sandbox } = loadImage();
  // getImageData 가 돌려줄 픽셀을 흉내낸다
  sandbox.__ctx = {
    drawImage() {},
    getImageData: (x, y, w, h) => ({ data: new Array(w * h * 4).fill(200) })
  };
  const g = I.grid({ naturalWidth: 1254, naturalHeight: 1254 }, 48);
  t('정사각형은 픽셀 행이 폭과 같다', g.cols === 48 && g.rows === 48);
  t('문자 행은 그 절반', g.rows / 2 === 24);

  // 세로로 긴 그림 — 이 계산을 틀리면 그림이 늘어난다
  const tall = I.grid({ naturalWidth: 1024, naturalHeight: 1536 }, 48);
  t('종횡비를 지킨다', tall.rows === 72);
  t('픽셀 행은 늘 짝수', tall.rows % 2 === 0 && I.grid({ naturalWidth: 100, naturalHeight: 33 }, 48).rows % 2 === 0);

  t('폭이 없으면 그리지 않는다', I.grid({ naturalWidth: 0, naturalHeight: 0 }, 48) === null);
  t('폭을 너무 좁게 주면 바닥을 둔다', I.grid({ naturalWidth: 10, naturalHeight: 10 }, 1).cols === 8);

  const box = I.blocks({ naturalWidth: 10, naturalHeight: 10 }, 8);
  const rows = box.children;
  t('행마다 노드를 만든다', rows.length === 4);
  t('한 행에 폭만큼 셀', rows[0].children.length === 8);
  t('셀 글자는 반칸 블록', rows[0].children[0].textContent === I.BLOCK);
  t('글자색과 배경색을 각각 준다', (() => {
    const c = rows[0].children[0];
    return /^#c8c8c8$/.test(c.style.color) && /^#c8c8c8$/.test(c.style.background);
  })());
}

// ---------------------------------------------------------------- 배선 (정적)

{
  const conv2 = fs.readFileSync('src/content/conversation.js', 'utf8');
  const store = fs.readFileSync('src/content/store.js', 'utf8');
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const plan = fs.readFileSync('src/content/renderplan.js', 'utf8');
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  const mani = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const def = fs.readFileSync('src/shared/defaults.js', 'utf8');
  const i18n = fs.readFileSync('src/shared/i18n.js', 'utf8');

  t('hidden 사본을 거르는 코드가 있다', /is_visually_hidden_from_conversation/.test(conv2));
  // 주석에는 실측값을 남겨 두되, 코드가 그 값에 기대면 안 된다 — 바뀔 값이다.
  const noComments = conv2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  t('author.name 을 판별자로 쓰지 않는다', !/t2uay3k/.test(noComments));
  t('author.name 자체를 보지 않는다', !/author\.name/.test(noComments));
  t('store 가 images 를 지킨다', /old\.images && !m\.images/.test(store));
  t('harvest 병합에서도 지킨다', /if \(m\.images\) rec\.images = m\.images;/.test(store));
  t('tty 가 이미지를 그린다', /\(m\.images \|\| \[\]\)\.forEach\(\(im\) => body\.appendChild\(imageBox\(im\)\)\)/.test(tty));
  t('자리표시자와 겹치지 않게 한다', /!\(drew && t === 'image'\)/.test(tty));
  t('서명에 포인터가 들어간다', /m\.images\[0\]\.pointer/.test(plan));
  t('image.js 가 로드된다', mani.content_scripts.some((c) => (c.js || []).includes('src/content/image.js')));
  t('tty 보다 먼저 로드된다', (() => {
    const js = mani.content_scripts.find((c) => (c.js || []).includes('src/content/image.js')).js;
    return js.indexOf('src/content/image.js') < js.indexOf('src/content/tty.js');
  })());
  t('설정 항목이 있다', /key: 'image', type: 'enum', def: 'inline'/.test(def));
  t('폭 설정도 있다', /key: 'image\.columns', type: 'int', def: 48/.test(def));
  t('세 가지 방식을 고른다', /choices: \['inline', 'blocks', 'off'\]/.test(def));
  t('문자 블록 CSS 가 있다', /\.gt-img-blocks i \{/.test(css));
  t('셀 높이가 2ch 다', /height: 2ch/.test(css));
  t('셀 폭을 못 박는다 (틈 방지)', /width: 1ch; height: 2ch/.test(css));

  const keys = ['opt.image.label', 'opt.image.columns.label', 'img.placeholder', 'img.failed', 'img.loading'];
  const both = keys.filter((k) => (i18n.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 2);
  t('두 언어에 문구가 다 있다', both.length === keys.length);

  // canvas 가 오리진 때문에 던질 수 있다 — 받아서 그림으로 떨어져야 한다
  t('문자 블록 실패를 받아낸다', /try \{ node = GT\.image\.blocks/.test(tty));
  t('실패하면 그림으로 떨어진다', /GT\.log\('문자 블록 실패', err\)/.test(tty));
  t('블록 모드에서만 CORS 를 켠다', /if \(mode === 'blocks'\) img\.crossOrigin = 'anonymous'/.test(tty));
  t('캐시가 있으면 안 깜빡인다', /GT\.image\.peek\(im\.pointer\) \? label :/.test(tty));
  t('없는 명령을 안내하지 않는다', !/:q 로 원본/.test(tty) && !/:open 으로 원본/.test(i18n));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
