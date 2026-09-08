// 다국어. 사전이 어긋나면 화면에 키가 그대로 노출되거나 문장이 깨진다.
// docs/plan/2026-09-08-i18n.md
import fs from 'node:fs'; import vm from 'node:vm';

function load(navLang) {
  const sb = { console, Object, Array, String, Number, Boolean, JSON, Math };
  sb.window = sb; sb.globalThis = sb;
  if (navLang !== undefined) sb.navigator = { language: navLang };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/shared/defaults.js', 'utf8'), sb, { filename: 'defaults.js' });
  return sb;
}

const results = []; const t = (n, ok) => results.push([n, ok]);
const S = load('ko-KR');
const { GT_I18N, GT_SCHEMA, GT_T, GT_SET_LOCALE, GT_LABEL, GT_HELP, GT_SECTION, GT_CHOICE } = S;
const locales = Object.keys(GT_I18N);

// --- 로케일이 둘 이상 있고 키 집합이 같다 ---
{
  t('로케일이 둘 이상', locales.length >= 2);
  const base = locales[0];
  const baseKeys = Object.keys(GT_I18N[base]).sort();
  locales.slice(1).forEach((l) => {
    const keys = Object.keys(GT_I18N[l]).sort();
    const missing = baseKeys.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !baseKeys.includes(k));
    t(`${l} 에 빠진 키가 없다`, missing.length === 0);
    t(`${l} 에 남는 키가 없다`, extra.length === 0);
    if (missing.length) console.log('        빠짐:', missing.slice(0, 6).join(', '));
    if (extra.length) console.log('        남음:', extra.slice(0, 6).join(', '));
  });
}

// --- 자리표시자 개수가 로케일 간에 같다 ---
{
  // $1 만 쓰고 $2 를 빠뜨리면 그 값이 화면에서 사라진다. 조용해서 못 잡는다.
  const slots = (s) => [...new Set((String(s).match(/\$\d+/g) || []))].sort().join(',');
  const base = locales[0];
  const bad = [];
  Object.keys(GT_I18N[base]).forEach((k) => {
    const want = slots(GT_I18N[base][k]);
    locales.slice(1).forEach((l) => {
      const got = slots((GT_I18N[l] || {})[k] || '');
      if (got !== want) bad.push(`${k}: ${base}=${want || '-'} ${l}=${got || '-'}`);
    });
  });
  t('자리표시자가 로케일 간에 일치', bad.length === 0);
  if (bad.length) bad.slice(0, 6).forEach((b) => console.log('        ' + b));
}

// --- 빈 문구가 없다 ---
{
  const empty = [];
  locales.forEach((l) => Object.entries(GT_I18N[l]).forEach(([k, v]) => {
    if (typeof v !== 'string' || !v.trim()) empty.push(`${l}/${k}`);
  }));
  t('빈 문구가 없다', empty.length === 0);
}

// --- 스키마가 요구하는 키가 전부 사전에 있다 ---
{
  const need = [];
  GT_SCHEMA.forEach((f) => {
    need.push('opt.section.' + f.section);
    need.push('opt.' + f.key + '.label');
    if (!f.rawChoices) (f.choices || []).forEach((v) => need.push(`opt.${f.key}.choice.${v}`));
  });
  const bad = [];
  locales.forEach((l) => need.forEach((k) => { if (!GT_I18N[l][k]) bad.push(`${l}/${k}`); }));
  t('스키마가 쓰는 키가 전부 있다', bad.length === 0);
  if (bad.length) bad.slice(0, 8).forEach((b) => console.log('        ' + b));

  // 사전에만 있고 스키마에 없는 opt.* 키 = 지워진 설정의 잔재
  const known = new Set(need);
  GT_SCHEMA.forEach((f) => known.add('opt.' + f.key + '.help'));
  // opt.ui.* 는 설정 화면 자체의 문구라 스키마에서 파생되지 않는다
  const orphan = Object.keys(GT_I18N[locales[0]])
    .filter((k) => k.startsWith('opt.') && !k.startsWith('opt.ui.') && !known.has(k));
  t('스키마에 없는 opt 키가 남아 있지 않다', orphan.length === 0);
  if (orphan.length) console.log('        고아:', orphan.slice(0, 6).join(', '));
}

// --- opt.ui.* 는 전부 실제로 쓰인다 ---
{
  const used = fs.readFileSync('src/options/options.js', 'utf8');
  const dead = Object.keys(GT_I18N[locales[0]])
    .filter((k) => k.startsWith('opt.ui.'))
    .filter((k) => !used.includes(`'${k}'`));
  t('안 쓰는 opt.ui 키가 없다', dead.length === 0);
  if (dead.length) console.log('        안 씀:', dead.join(', '));
}

// --- 스키마에 문구를 직접 박지 않았다 ---
{
  const src = fs.readFileSync('src/shared/defaults.js', 'utf8');
  const body = src.slice(src.indexOf('var GT_SCHEMA'), src.indexOf('var GT_DEFAULTS'));
  t('스키마에 한글 문구가 없다', !/[가-힣]/.test(body.replace(/\/\/[^\n]*/g, '')));
  t('라벨은 규칙으로 만든다', /GT_T\('opt\.' \+ f\.key \+ '\.label'\)/.test(src));
}

// --- 꺼내 쓰기 ---
{
  t('라벨을 꺼낸다', GT_LABEL({ key: 'enabled' }) === GT_I18N.ko['opt.enabled.label']);
  t('도움말이 없으면 빈 문자열', GT_HELP({ key: 'sidebar.width' }) === '');
  t('도움말이 있으면 그 문장', GT_HELP({ key: 'sidebar.visible' }).length > 0);
  t('섹션 이름을 꺼낸다', GT_SECTION({ section: 'behavior' }) === '동작');
  t('선택지를 번역한다', GT_CHOICE({ key: 'onBreak' }, 'warn') === GT_I18N.ko['opt.onBreak.choice.warn']);
  t('rawChoices 는 값 그대로', GT_CHOICE({ key: 'theme', rawChoices: true }, 'crt-green') === 'crt-green');
}

// --- 보간과 없는 키 ---
{
  const S2 = load('ko-KR');
  S2.GT_I18N.ko['test.one'] = '값은 $1 입니다';
  S2.GT_I18N.ko['test.two'] = '$1 에서 $2 로';
  t('$1 을 채운다', S2.GT_T('test.one', 7) === '값은 7 입니다');
  t('여러 개를 채운다', S2.GT_T('test.two', 'a', 'b') === 'a 에서 b 로');
  t('인자가 모자라면 자리표시자를 남긴다', S2.GT_T('test.two', 'a') === 'a 에서 $2 로');
  t('없는 키는 키를 그대로 돌려준다', S2.GT_T('없는.키') === '없는.키');
  t('키를 돌려주므로 화면에서 눈에 띈다', S2.GT_T('없는.키').length > 0);
}

// --- 로케일 고르기 ---
{
  t('설정한 값을 쓴다', load('en-US').GT_SET_LOCALE('ko') === 'ko');
  t('auto 는 브라우저를 따른다', load('en-US').GT_SET_LOCALE('auto') === 'en');
  t('지역 코드가 붙어도 앞부분으로 고른다', load('ko-KR').GT_SET_LOCALE('auto') === 'ko');
  t('모르는 언어는 폴백', load('fr-FR').GT_SET_LOCALE('auto') === 'ko');
  t('없는 로케일을 주면 폴백', load('en-US').GT_SET_LOCALE('de') === 'en');
  t('navigator 가 없어도 터지지 않는다', typeof load(undefined).GT_SET_LOCALE('auto') === 'string');
}

// --- 언어를 바꾸면 문구가 바뀐다 ---
{
  const S3 = load('ko-KR');
  S3.GT_SET_LOCALE('ko');
  const ko = S3.GT_LABEL({ key: 'enabled' });
  S3.GT_SET_LOCALE('en');
  const en = S3.GT_LABEL({ key: 'enabled' });
  t('같은 키가 언어별로 다른 문구', ko !== en && ko.length > 0 && en.length > 0);
  t('영어에는 한글이 없다', !/[가-힣]/.test(en));
}

// --- 매니페스트 쪽 ---
{
  const mf = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  t('default_locale 을 선언한다', typeof mf.default_locale === 'string' && mf.default_locale.length > 0);
  t('default_locale 의 메시지 파일이 있다',
    fs.existsSync(`_locales/${mf.default_locale}/messages.json`));

  const msgKeys = [];
  const collect = (v) => { const m = /^__MSG_(\w+)__$/.exec(String(v || '')); if (m) msgKeys.push(m[1]); };
  collect(mf.name); collect(mf.description); collect((mf.action || {}).default_title);
  t('이름·설명을 __MSG_ 로 둔다', msgKeys.length >= 2);

  const dirs = fs.readdirSync('_locales');
  t('스토어 로케일이 둘 이상', dirs.length >= 2);
  const bad = [];
  dirs.forEach((d) => {
    const j = JSON.parse(fs.readFileSync(`_locales/${d}/messages.json`, 'utf8'));
    msgKeys.forEach((k) => { if (!j[k] || !j[k].message) bad.push(`${d}/${k}`); });
  });
  t('모든 로케일이 그 키를 갖는다', bad.length === 0);
  if (bad.length) console.log('        빠짐:', bad.join(', '));

  const short = JSON.parse(fs.readFileSync('_locales/en/messages.json', 'utf8')).extDesc.message;
  t('스토어 짧은 설명이 132자 이내', short.length <= 132);
}

// --- 주입 순서: i18n 이 defaults 보다 먼저 ---
{
  const mf = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const js = mf.content_scripts.find((c) => (c.world || 'ISOLATED') === 'ISOLATED').js;
  t('i18n 을 주입한다', js.includes('src/shared/i18n.js'));
  t('defaults 보다 먼저 온다', js.indexOf('src/shared/i18n.js') < js.indexOf('src/shared/defaults.js'));

  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  t('preflight 가 GT_T 를 확인한다', /GT_T !== 'function'/.test(idx));
  t('첫 렌더 전에 로케일을 정한다', /GT_SET_LOCALE\(cfg\.locale\)/.test(idx));
  t('설정이 바뀌면 로케일도 따라간다', /GT_SET_LOCALE\(c\.locale\)/.test(idx));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
