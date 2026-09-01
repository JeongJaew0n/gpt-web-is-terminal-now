// 대화 조작(원본 "..." 메뉴). 되돌릴 수 없는 것은 확인 없이 실행되면 안 된다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const ops = fs.readFileSync('src/content/convops.js', 'utf8');
const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
const sb = fs.readFileSync('src/content/sidebar.js', 'utf8');

// --- 정적 ---
t('모달을 띄우지 않는다', !/\bprompt\(|\bconfirm\(|\balert\(/.test(sb + cmds + ops));
t('삭제는 yes 없이는 실행 안 된다', /!== 'yes'\)/.test(cmds));
t('삭제 전에 대상을 보여준다', /대상: \$\{c\.title\}/.test(cmds));
t('메뉴의 삭제는 두 번 눌러야 한다', /armed/.test(sb));
t('미검증 표시', /\[미검증\]/.test(ops));
t('공유·프로젝트 이동은 다루지 않는다고 명시', /unsupported/.test(ops) && /공유하기/.test(ops));
t('이름 바꾸기는 입력줄에 명령을 채운다', /:rename \$\{rec\.id\.slice/.test(sb));

// --- 동작: 가짜 oai 로 ---
{
  const calls = [];
  const sandbox = { console, Object, Array, JSON, Promise, Error, String, Number, Boolean,
    encodeURIComponent };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { oai: { patch: async (url, body) => { calls.push({ url, body }); return { success: true }; } } };
  vm.createContext(sandbox);
  vm.runInContext(ops, sandbox, { filename: 'convops.js' });
  const C = sandbox.GT.convops;

  await C.rename('abc', '새 이름');
  t('rename 은 title 만 보낸다', calls[0].url.endsWith('/backend-api/conversation/abc')
    && JSON.stringify(calls[0].body) === '{"title":"새 이름"}');

  await C.pin('abc', true);
  t('pin 은 is_starred', JSON.stringify(calls[1].body) === '{"is_starred":true}');
  await C.pin('abc', false);
  t('pin 해제도 같은 필드', JSON.stringify(calls[2].body) === '{"is_starred":false}');

  await C.archive('abc', true);
  t('archive 는 is_archived', JSON.stringify(calls[3].body) === '{"is_archived":true}');

  await C.remove('abc');
  t('remove 는 is_visible:false', JSON.stringify(calls[4].body) === '{"is_visible":false}');

  t('id 를 URL 인코딩한다', (await C.rename('a/b', 'x'), calls[5].url.includes('a%2Fb')));
  t('불리언을 강제한다', (await C.pin('abc', 'truthy'), calls[6].body.is_starred === true));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
