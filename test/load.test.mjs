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
