// 웹스토어 제출 상태를 지킨다. 한 번 맞춰 놓은 것이 조용히 되돌아가면 안 된다.
// docs/plans/web-store-submission/spec.md
import fs from 'node:fs';

const results = []; const t = (n, ok) => results.push([n, ok]);
const mf = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const src = (p) => fs.readFileSync(p, 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name]);
const SRC = walk('src').filter((f) => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css'));
const ALL = SRC.map(src).join('\n');

// --- 리스팅 문구 ---
{
  t('이름이 있다', typeof mf.name === 'string' && mf.name.length > 0);
  t('이름이 75자 이내', mf.name.length <= 75);
  t('설명이 132자 이내', (mf.description || '').length <= 132);
  t("설명에 '개인용 언팩' 류 문구가 없다", !/개인용|언팩|unpacked/i.test(mf.description || ''));
  t('버전이 있다', /^\d+(\.\d+)*$/.test(mf.version || ''));
}

// --- 권한을 늘리지 않았는지 ---
{
  t('권한은 storage 하나', JSON.stringify(mf.permissions) === JSON.stringify(['storage']));
  t('호스트 권한은 chatgpt.com 하나',
    JSON.stringify(mf.host_permissions) === JSON.stringify(['https://chatgpt.com/*']));
  t('web_accessible_resources 없음', !mf.web_accessible_resources);
  t('externally_connectable 없음', !mf.externally_connectable);
  t('minimum_chrome_version 을 밝힌다', mf.minimum_chrome_version === '111' || mf.minimum_chrome_version === 111);
}

// --- 정책상 즉시 거절되는 것들 ---
{
  t('동적 코드 실행이 없다', !/\beval\s*\(|new Function\s*\(/.test(ALL));
  t('innerHTML 계열이 없다', !/innerHTML|outerHTML|insertAdjacentHTML/.test(ALL));
  t('원격 스크립트를 불러오지 않는다', !/<script[^>]+src=["']https?:/i.test(ALL));

  // 외부 주소가 섞이면 데이터 전송 의혹을 산다. w3.org 는 SVG 네임스페이스라 예외다.
  const urls = (ALL.match(/https?:\/\/[^\s"'`)]+/g) || [])
    .filter((u) => !/^https?:\/\/(www\.)?w3\.org/.test(u))
    .filter((u) => !/chatgpt\.com/.test(u));
  t('외부 주소가 없다', urls.length === 0);

  t('텔레메트리 전송 API 를 안 쓴다', !/sendBeacon|new WebSocket|XMLHttpRequest/.test(ALL));
  t('다른 사이트 저장소를 안 건드린다', !/document\.cookie|localStorage|sessionStorage/.test(ALL));
}

// --- 토큰 취급 ---
{
  const oai = src('src/content/oai.js');
  t('토큰을 storage 에 쓰지 않는다', !/storage\.(sync|local)\.set/.test(oai));
  t('토큰에 TTL 이 있다', /TTL\s*=/.test(oai));
  t('토큰을 콘솔에 찍지 않는다', !/console\.\w+\([^)]*token/i.test(oai));
  t('취급 방침을 파일에 적어뒀다', /메모리에만 둔다/.test(oai));
}

// --- postMessage 가 와일드카드가 아닌지 ---
{
  const posts = (ALL.match(/postMessage\([\s\S]{0,200}?\)/g) || []);
  t('postMessage 를 쓴다', posts.length > 0);
  t('대상이 전부 location.origin', posts.every((p) => /location\.origin/.test(p)));
  t("'*' 로 보내는 곳이 없다", !posts.some((p) => /,\s*['"]\*['"]/.test(p)));
}

// --- 아이콘 ---
{
  const need = ['16', '32', '48', '128'];
  t('매니페스트가 네 크기를 선언한다', need.every((n) => mf.icons && mf.icons[n]));
  t('선언한 아이콘 파일이 실제로 있다',
    need.every((n) => fs.existsSync(mf.icons[n])));
  t('스토어 리스팅용 512px 이 있다', fs.existsSync('icons/icon512.png'));
  t('OpenAI 파생 원본을 지웠다', !fs.existsSync('icons/source.png'));
  t('아이콘 생성기가 원본 이미지에 의존하지 않는다', !/source\.png/.test(src('tools/make-icons.py')));
}

// --- 제출 문서가 있는지 ---
{
  ['docs/store/listing.md', 'docs/store/privacy-policy.md', 'docs/store/review-notes.md']
    .forEach((f) => t(`${f} 가 있다`, fs.existsSync(f)));
  t('배포 스크립트가 실행 가능하다',
    fs.existsSync('tools/package.sh') && !!(fs.statSync('tools/package.sh').mode & 0o111));

  const policy = src('docs/store/privacy-policy.md');
  t('방침이 외부 전송 없음을 명시한다', /sends no data|어떤 데이터도 외부로 보내지 않습니다/.test(policy));
  t('방침이 대화 본문 미저장을 명시한다', /never written to storage|저장소에 쓰지 않습니다/.test(policy));
  t('방침에 OpenAI 무관 고지가 있다', /not affiliated/i.test(policy) && /상표/.test(policy));
}

// --- 화면에 보이는 글은 존댓말이다 ---
{
  // 코드 주석은 반말로 쓴다(개발자용). 사용자에게 보이는 글만 검사한다.
  const files = ['src/content/commands.js', 'src/content/sidebar.js', 'src/content/index.js',
    'src/content/health.js', 'src/content/tty.js', 'src/shared/defaults.js',
    'src/popup/popup.js', 'src/popup/popup.html', 'src/options/options.js', 'src/options/options.html'];

  // 반말 종결. 주석 줄은 빼고 문자열·태그 안쪽만 본다.
  //
  // 종결 뒤에 마침표·물음표나 공백이 올 수 있다. 전에는 따옴표가 바로 오는 경우만
  // 봐서 '…새로고침해라.' 를 놓쳤다 — 실제로 그 문구가 화면에 그대로 나갔다.
  const RUDE = /(했다|한다|없다|있다|된다|간다|온다|린다|본다|아니다|해라|봐라|와라|바꿔라|어라)[.!?…)\s]*(?=['"\u0060<]|$)/;
  const bad = [];
  files.forEach((f) => {
    src(f).split('\n').forEach((line, i) => {
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');   // 주석 줄 제거
      if (!code) return;
      if (/GT\.log\(/.test(code)) return;                        // 콘솔 진단은 개발자용이다
      const strings = code.match(/'[^']*'|"[^"]*"|\u0060[^\u0060]*\u0060|>[^<>]+</g) || [];
      strings.forEach((v) => { if (RUDE.test(v)) bad.push(`${f}:${i + 1} ${v.slice(0, 46)}`); });
    });
  });
  t('사용자에게 보이는 글에 반말이 없다', bad.length === 0);
  if (bad.length) bad.slice(0, 8).forEach((b) => console.log('        ' + b));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
