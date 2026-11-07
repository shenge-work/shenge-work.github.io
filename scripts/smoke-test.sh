#!/usr/bin/env bash
# 简历 AI 助手 —— 线上回归脚本（V1–V11）
#
# 用法：
#   ./scripts/smoke-test.sh                  # 只跑不花钱的用例（不调模型）
#   ./scripts/smoke-test.sh --with-model     # 追加真实问答用例（消耗资源点，约 3–4 点）
#   ./scripts/smoke-test.sh --with-rate      # 追加限流压测（连发 25 次，用便宜问题）
#   ENDPOINT=http://127.0.0.1:9000/chat ./scripts/smoke-test.sh   # 打本地
#
# 退出码：全部通过 0，有失败 1。

set -uo pipefail

ENDPOINT="${ENDPOINT:-https://resume-ai-d9g7zghnxda2ee2cb-1307508155.ap-shanghai.app.tcloudbase.com/chat}"
ORIGIN="${ORIGIN:-https://shenge-work.github.io}"
BAD_ORIGIN="${BAD_ORIGIN:-https://evil.example.com}"
WITH_MODEL=0
WITH_RATE=0

for arg in "$@"; do
  case "$arg" in
    --with-model) WITH_MODEL=1 ;;
    --with-rate)  WITH_RATE=1 ;;
    -h|--help)    sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg"; exit 2 ;;
  esac
done

PASS=0
FAIL=0
TMP="$(mktemp -t smoke.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

c_green=$'\033[32m'; c_red=$'\033[31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
if [ ! -t 1 ]; then c_green=""; c_red=""; c_dim=""; c_off=""; fi

# post <origin> <body> <timeout>  → 打印 "STATUS"; 响应体写进 $TMP
post() {
  local origin="$1" body="$2" tmo="${3:-15}"
  curl -s -o "$TMP" -w '%{http_code}' -m "$tmo" \
    -X POST "$ENDPOINT" \
    -H "origin: $origin" \
    -H 'content-type: application/json' \
    -d "$body"
}

# 从响应体里取一个字段（json.path，只支持顶层 + 布尔/字符串/数字）
jget() {
  python3 - "$1" "$TMP" <<'PY' 2>/dev/null
import json,sys
key=sys.argv[1]
try:
    d=json.load(open(sys.argv[2]))
except Exception:
    print(""); raise SystemExit
v=d.get(key,"")
if isinstance(v,bool): print("true" if v else "false")
elif v is None: print("")
else: print(v)
PY
}

check() {  # check <编号> <描述> <期望> <实际>
  local id="$1" what="$2" expect="$3" actual="$4"
  if [ "$expect" = "$actual" ]; then
    printf '%sPASS%s  %-6s %s\n' "$c_green" "$c_off" "$id" "$what"
    PASS=$((PASS+1))
  else
    printf '%sFAIL%s  %-6s %s\n       期望=%s 实际=%s\n' "$c_red" "$c_off" "$id" "$what" "$expect" "$actual"
    FAIL=$((FAIL+1))
  fi
}

check_has() {  # check_has <编号> <描述> <要找的子串> <实际>
  local id="$1" what="$2" needle="$3" actual="$4"
  case "$actual" in
    *"$needle"*) printf '%sPASS%s  %-6s %s\n' "$c_green" "$c_off" "$id" "$what"; PASS=$((PASS+1)) ;;
    *) printf '%sFAIL%s  %-6s %s\n       没找到「%s」\n       实际=%s\n' "$c_red" "$c_off" "$id" "$what" "$needle" "${actual:0:120}"; FAIL=$((FAIL+1)) ;;
  esac
}

check_any() {  # check_any <编号> <描述> <候选1|candidate2|...> <实际>
  local id="$1" what="$2" cands="$3" actual="$4"
  local ok=0 c
  local IFS='|'
  for c in $cands; do
    case "$actual" in *"$c"*) ok=1 ;; esac
  done
  unset IFS
  if [ "$ok" -eq 1 ]; then
    printf '%sPASS%s  %-6s %s\n' "$c_green" "$c_off" "$id" "$what"; PASS=$((PASS+1))
  else
    printf '%sFAIL%s  %-6s %s\n       候选都不在回答里：%s\n       实际=%s\n' "$c_red" "$c_off" "$id" "$what" "$cands" "${actual:0:120}"; FAIL=$((FAIL+1))
  fi
}

echo "端点：$ENDPOINT"
echo "来源：$ORIGIN"
echo "模式：$([ $WITH_MODEL -eq 1 ] && echo '含真实问答' || echo '仅零成本用例')$([ $WITH_RATE -eq 1 ] && echo ' + 限流压测')"
echo "───────────────────────────────────────────────"

# ---------------------------------------------------------------- V2 预检（先跑，它最便宜）
CODES=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X OPTIONS "$ENDPOINT" \
  -H "origin: $ORIGIN" -H 'access-control-request-method: POST' -H 'access-control-request-headers: content-type')
check V2 "CORS 预检 OPTIONS" 204 "$CODES"

ACAO_COUNT=$(curl -s -D - -o /dev/null -m 10 -X OPTIONS "$ENDPOINT" -H "origin: $ORIGIN" \
  | tr -d '\r' | grep -ci '^access-control-allow-origin:')
check V2b "ACAO 头只有一条（重复会被浏览器判非法）" 1 "$ACAO_COUNT"

# ---------------------------------------------------------------- V4 敏感问题（不调模型）
ST=$(post "$ORIGIN" '{"question":"期望薪资多少"}' 12)
AT=$(jget answer)
check V4 "敏感问题 200" 200 "$ST"
check_has V4b "走统一话术、不代替表态" "建议直接沟通" "$AT"
check V4c "fallback 标记为 true" true "$(jget fallback)"

# ---------------------------------------------------------------- V5 越界请求（不调模型）
ST=$(post "$ORIGIN" '{"question":"帮我写一段 Python 爬虫代码"}' 12)
AT=$(jget answer)
check V5 "越界请求 200" 200 "$ST"
check_has V5b "固定话术拒答" "只回答关于这份简历" "$AT"

# ---------------------------------------------------------------- V6 无匹配（检索后拒答，不调模型）
# 注意：char-bigram 检索对任意中文都可能给出微弱命中，所以要挑一个「字面完全不在知识库」的问题；
# 用「他会弹钢琴吗」这种会命中 0.2 分的问题测不到这条分支（模型会按规则 6 拒答，而不是 no_match）。
ST=$(post "$ORIGIN" '{"question":"如何养猪"}' 12)
AT=$(jget answer)
check V6 "无匹配 200" 200 "$ST"
check_has V6b "声明简历里没写" "简历里没写" "$AT"
check V6c "no_match 标记为 true" true "$(jget no_match)"
check V6d "top1_score 为 0（检索真的没命中）" 0 "$(jget top1_score)"

# ---------------------------------------------------------------- V7 超长输入
LONG=$(python3 -c 'print("问"*260)')
ST=$(post "$ORIGIN" "{\"question\":\"$LONG\"}" 12)
check V7 "超长输入 400" 400 "$ST"
check V7b "错误码 bad_request" bad_request "$(jget error)"

# ---------------------------------------------------------------- V8 陌生来源
ST=$(post "$BAD_ORIGIN" '{"question":"你做过哪些项目"}' 12)
check V8 "非白名单 Origin 403" 403 "$ST"
check V8b "错误码 origin_denied" origin_denied "$(jget error)"

# ---------------------------------------------------------------- V7c 非法 JSON / 缺字段
ST=$(post "$ORIGIN" 'not-json' 12)
check V7c "非法 JSON 400" 400 "$ST"
ST=$(post "$ORIGIN" '{}' 12)
check V7d "缺 question 400" 400 "$ST"

# ---------------------------------------------------------------- V3 检索命中（要调模型）
if [ "$WITH_MODEL" -eq 1 ]; then
  ST=$(post "$ORIGIN" '{"question":"你做过哪些项目"}' 30)
  AT=$(jget answer)
  check V3 "真实问答 200" 200 "$ST"
  check_any V3b "回答里出现知识库里的实体" "指数引力|hicreator|CRM|lessie|ChanMesh|潜客" "$AT"
  SRC=$(jget sources)
  check V3c "带回了检索出处" "true" "$([ "$SRC" != "[]" ] && [ -n "$SRC" ] && echo true || echo false)"

  ST=$(post "$ORIGIN" '{"question":"技术栈有哪些"}' 30)
  check V3d "第二个真实问题 200" 200 "$ST"
else
  printf '%sSKIP%s  V3     真实问答（加 --with-model 才跑）\n' "$c_dim" "$c_off"
fi

# ---------------------------------------------------------------- V11 限流
if [ "$WITH_RATE" -eq 1 ]; then
  echo "${c_dim}连发 25 次（敏感问题不调模型，只计次数）…"
  echo "注：本脚本前面的用例已经计入同一分钟窗口，所以首次 429 可能早于第 21 次，属于正常。${c_off}"
  FIRST_429=0
  LAST=""
  for i in $(seq 1 25); do
    ST=$(post "$ORIGIN" '{"question":"期望薪资"}' 12)
    LAST="$ST"
    if [ "$ST" = "429" ] && [ "$FIRST_429" -eq 0 ]; then FIRST_429=$i; fi
  done
  if [ "$FIRST_429" -gt 0 ]; then
    check V11 "出现过 429 限流（首次出现在第 $FIRST_429 次）" triggered triggered
  else
    check V11 "出现过 429 限流" triggered "never-429"
  fi
  check V11b "第 25 次仍被拦截" 429 "$LAST"
  check V11c "限流错误码 rate_limited" rate_limited "$(jget error)"
else
  printf '%sSKIP%s  V11    限流压测（加 --with-rate 才跑）\n' "$c_dim" "$c_off"
fi

# ---------------------------------------------------------------- 汇总
echo "───────────────────────────────────────────────"
printf '合计：%s%d 通过%s  %s%d 失败%s\n' "$c_green" "$PASS" "$c_off" "$([ $FAIL -eq 0 ] && echo "$c_dim" || echo "$c_red")" "$FAIL" "$c_off"
[ "$FAIL" -eq 0 ] || exit 1
