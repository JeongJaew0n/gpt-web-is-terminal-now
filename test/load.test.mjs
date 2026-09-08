// content script 들을 매니페스트 순서대로 같은 스코프에서 평가해
// "로드 시점에 던지는 예외"만 잡아낸다. DOM 은 최소 스텁.
import fs from 'node:fs';
import vm from 'node:vm';

const node = () => {
  const n = {
    tagName: 'DIV', id: '', className: '', textContent: '', innerHTML: '',
    style: new Proxy({}, { get: () => '', set: () => true }),
    dataset: {}, children: [], attributes: [], rows: 0, value: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c){ this.children.push(c); return c; },
    removeChild(){}, remove(){}, addEventListener(){}, removeEventListener(){},
    setAttribute(){}, getAttribute(){ return null; }, querySelector(){ return null; },
    querySelectorAll(){ return []; }, attachShadow(){ return node(); },
    focus(){}, click(){}, contains(){ return false; }, closest(){ return null; },
    get isConnected(){ return true; }, get shadowRoot(){ return null; },
    get scrollHeight(){ return 0; }, get clientHeight(){ return 0; }, scrollTop: 0
  };
  return n;
};

const documentStub = {
  createElement: () => node(),
  createTextNode: (t) => ({ nodeType: 3, textContent: t }),
  createDocumentFragment: () => node(),
  createRange: () => ({ selectNodeContents(){} }),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener(){}, execCommand(){ return true; },
  documentElement: node(), head: node(), body: node(), title: 'ChatGPT'
};

const sandbox = {
  console,
  window: null,
  document: documentStub,
  location: { href: 'https://chatgpt.com/', origin: 'https://chatgpt.com', pathname: '/' },
  navigator: { clipboard: { writeText: async () => {} } },
  chrome: {
    runtime: { sendMessage(){}, onMessage: { addListener(){} }, lastError: null },
    storage: { sync: { get: async (d) => ({ ...d }), set: async () => {} } }
  },
  MutationObserver: class { observe(){} disconnect(){} },
  KeyboardEvent: class { constructor(){} },
  Event: class { constructor(){} },
  CSS: { escape: (s) => s },
  TextDecoder: class { decode(){ return ''; } },
  Response: class { constructor(){} },
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  setTimeout, setInterval: () => 0, clearTimeout,
  getSelection: () => ({ removeAllRanges(){}, addRange(){} }),
  Date, Math, JSON, Number, Object, Array, String, Boolean, Map, Set, Promise, Error, RegExp
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.addEventListener = () => {};
vm.createContext(sandbox);

const files = JSON.parse(fs.readFileSync('manifest.json', 'utf8'))
  .content_scripts.find((c) => c.world === 'ISOLATED').js;

// index.js 는 평가되자마자 boot() 를 띄운다. 이 스텁에는 진짜 DOM 이 없으므로
// 그 비동기 작업은 뒤늦게 실패한다 — 하지만 이 파일이 보는 것은 '로드 시점' 이다.
// 평가 중의 예외는 아래 try/catch 가 세고, 그 뒤의 비동기 실패는 여기서 받아
// 종료 코드를 오염시키지 않게 한다. 무엇이 났는지는 그래도 보여준다.
const late = [];
process.on('unhandledRejection', (e) => late.push(String((e && e.message) || e)));
process.on('uncaughtException', (e) => late.push(String((e && e.message) || e)));

let bad = 0;
for (const f of files) {
  try {
    vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
    console.log('  ok   ' + f);
  } catch (e) {
    bad++;
    console.log('  THROW ' + f);
    console.log('        ' + e.constructor.name + ': ' + e.message);
    const line = (e.stack || '').split('\n').find((l) => l.includes(f));
    if (line) console.log('        ' + line.trim());
  }
}
console.log(bad ? `\n로드 시점 예외 ${bad}건` : '\n로드 시점 예외 없음');

// 부팅이 뒤늦게 실패한 것은 이 파일의 판정 대상이 아니다. 보이기만 한다.
setTimeout(() => {
  if (late.length) {
    console.log(`  (로드 뒤 비동기 실패 ${late.length}건 — 이 파일의 판정 대상이 아니다)`);
    console.log('   ' + late[0]);
  }
  process.exit(bad ? 1 : 0);
}, 50);
