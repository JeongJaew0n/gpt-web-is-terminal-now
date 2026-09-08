#!/usr/bin/env bash
# 테스트 전체를 돌린다.
#
#     tools/test.sh
#
# 판정은 종료 코드로 한다. 예전에는 출력에서 'FAIL' 문자열만 찾았는데,
# 로드 중 예외로 죽은 파일은 FAIL 을 찍지도 못해 조용히 0건으로 집계됐다.
# 실제로 네 파일이 그렇게 빠진 적이 있다 — 그래서 '죽음' 을 따로 센다.
set -uo pipefail

cd "$(dirname "$0")/.."

pass=0
nbad=0
failed=""
broken=""

for f in test/*.test.mjs; do
  out=$(node "$f" 2>&1); code=$?
  n=$(printf '%s\n' "$out" | grep -c 'PASS' || true)
  pass=$((pass + n))
  name=$(basename "$f")

  if [ "$code" -ne 0 ]; then
    nbad=$((nbad + 1))
    if printf '%s\n' "$out" | grep -q 'FAIL'; then
      failed="$failed $name"
      printf '  x  %-26s %s\n' "$name" "$(printf '%s\n' "$out" | grep -c 'FAIL') failed"
      printf '%s\n' "$out" | grep 'FAIL' | sed 's/^/       /'
    else
      broken="$broken $name"
      printf '  !  %-26s crashed (exit %s)\n' "$name" "$code"
      printf '%s\n' "$out" | grep -Ei 'error' | head -3 | sed 's/^/       /'
    fi
  else
    printf '  ok %-26s %s\n' "$name" "$n"
  fi
done

files=$(ls test/*.test.mjs | wc -l | tr -d ' ')
echo
printf '  %s cases in %s files\n' "$pass" "$files"
[ -n "$failed" ] && printf '  FAILED:%s\n' "$failed"
[ -n "$broken" ] && printf '  CRASHED:%s\n' "$broken"
if [ "$nbad" -eq 0 ]; then
  echo '  all green'
  exit 0
fi
exit 1
