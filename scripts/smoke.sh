#!/usr/bin/env bash
# scripts/smoke.sh — End-to-end smoke test for Sada's Pages Functions.
#
# Hits every endpoint and verifies its happy path AND its auth/validation
# boundary, so a broken deploy fails loud instead of silent.
#
#   Local (against `wrangler pages dev`):
#     ./scripts/smoke.sh
#
#   Production:
#     BASE_URL=https://101n.app ./scripts/smoke.sh
#
#   With internal key (so internal-only endpoints are exercised):
#     INTERNAL_API_KEY=xxx BASE_URL=https://101n.app ./scripts/smoke.sh
#
#   With a Supabase JWT (so authed endpoints are fully exercised):
#     JWT=eyJhbGc... ./scripts/smoke.sh
#
# Exit code is the number of failed checks (0 = clean).

set -u

BASE_URL="${BASE_URL:-http://localhost:8788}"
JWT="${JWT:-}"
INTERNAL_API_KEY="${INTERNAL_API_KEY:-}"

# ── Colors (skip if not a TTY) ────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  BLUE=$'\033[34m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; DIM=''; BOLD=''; RESET=''
fi

PASS=0
FAIL=0
SKIP=0

# Pretty-print a check result.
#   ok <name> <status>           — green pass
#   bad <name> <expected> <got>  — red fail
#   skip <name> <reason>         — yellow skip
ok()   { PASS=$((PASS+1)); printf "  ${GREEN}✓${RESET} %-50s ${DIM}[%s]${RESET}\n" "$1" "$2"; }
bad()  { FAIL=$((FAIL+1)); printf "  ${RED}✗${RESET} %-50s ${RED}expected %s, got %s${RESET}\n" "$1" "$2" "$3"; }
skip() { SKIP=$((SKIP+1)); printf "  ${YELLOW}∼${RESET} %-50s ${YELLOW}skipped: %s${RESET}\n" "$1" "$2"; }

section() { printf "\n${BOLD}${BLUE}== %s ==${RESET}\n" "$1"; }

# Check that `curl` and `jq` are available.
command -v curl >/dev/null 2>&1 || { echo "curl not found"; exit 127; }
HAVE_JQ=1
if ! command -v jq >/dev/null 2>&1; then
  HAVE_JQ=0
  echo "${YELLOW}Warning: jq not found — JSON body assertions will be skipped${RESET}"
fi

# req METHOD URL [extra-curl-args...]
# Prints the HTTP status code on stdout, response body to /tmp/smoke.body
req() {
  local method="$1"; shift
  local url="$1"; shift
  curl -sS -o /tmp/smoke.body -w '%{http_code}' -X "$method" "$@" "$url" 2>/tmp/smoke.err || true
}

# expect_status NAME EXPECTED_CODE METHOD URL [extra-curl-args...]
expect_status() {
  local name="$1"; local expected="$2"; local method="$3"; local url="$4"
  shift 4
  local got
  got=$(req "$method" "$url" "$@")
  if [ "$got" = "$expected" ]; then
    ok "$name" "$got"
    return 0
  else
    bad "$name" "$expected" "$got"
    return 1
  fi
}

# expect_status_in NAME "200|503" METHOD URL ...   (any of N codes)
expect_status_in() {
  local name="$1"; local choices="$2"; local method="$3"; local url="$4"
  shift 4
  local got
  got=$(req "$method" "$url" "$@")
  case "|$choices|" in
    *"|$got|"*)
      ok "$name" "$got"
      return 0
      ;;
  esac
  bad "$name" "one of $choices" "$got"
  return 1
}

# assert_json_path NAME EXPRESSION EXPECTED   (jq path on /tmp/smoke.body)
assert_json_path() {
  local name="$1"; local expr="$2"; local expected="$3"
  if [ "$HAVE_JQ" -eq 0 ]; then
    skip "$name" "jq missing"
    return 0
  fi
  local got
  got=$(jq -r "$expr // empty" /tmp/smoke.body 2>/dev/null || echo "")
  if [ "$got" = "$expected" ]; then
    ok "$name" "$expr=$expected"
  else
    bad "$name" "$expected" "${got:-<empty>}"
  fi
}

printf "${BOLD}Sada smoke test${RESET}\n"
printf "  base url:  %s\n" "$BASE_URL"
printf "  jwt:       %s\n" "${JWT:+set}${JWT:-<none>}"
printf "  internal:  %s\n" "${INTERNAL_API_KEY:+set}${INTERNAL_API_KEY:-<none>}"

# ── /api/health ───────────────────────────────────────────────────────
section "health"
expect_status "GET /api/health"            200 GET "$BASE_URL/api/health"
assert_json_path "  ok=true"                ".ok"      "true"
assert_json_path "  has version"            ".version" "1.0.0"

expect_status_in "GET /api/health?deep=1"   "200|503" GET "$BASE_URL/api/health?deep=1"
if [ "$HAVE_JQ" -eq 1 ]; then
  services=$(jq -r '.services | keys | join(",")' /tmp/smoke.body 2>/dev/null || echo "")
  if [ -n "$services" ]; then
    ok "  services reported" "$services"
  else
    bad "  services reported" "non-empty" "<missing>"
  fi
fi

# ── /api/feeds ────────────────────────────────────────────────────────
section "feeds"
expect_status "GET /api/feeds?limit=5"     200 GET "$BASE_URL/api/feeds?limit=5"
if [ "$HAVE_JQ" -eq 1 ]; then
  count=$(jq -r '.items | length // 0' /tmp/smoke.body 2>/dev/null || echo "0")
  if [ "$count" -gt 0 ] 2>/dev/null; then
    ok "  items returned" "$count"
  else
    bad "  items returned" ">0" "$count"
  fi
fi

# ── /api/feed-since ───────────────────────────────────────────────────
section "feed-since"
# 200 if cache is warm, 503 if cache hasn't been built yet (acceptable on cold deploy)
expect_status_in "GET without since"        "200|503" GET "$BASE_URL/api/feed-since"
expect_status "GET with invalid since"     400 GET "$BASE_URL/api/feed-since?since=notanumber"
expect_status_in "GET with since=0"         "200|503" GET "$BASE_URL/api/feed-since?since=0&limit=10"
if [ "$HAVE_JQ" -eq 1 ]; then
  newest=$(jq -r '.newest // 0' /tmp/smoke.body 2>/dev/null || echo "0")
  if [ "$newest" -gt 0 ] 2>/dev/null; then
    ok "  newest timestamp present" "$newest"
    # Now check that since=newest returns an empty delta.
    req GET "$BASE_URL/api/feed-since?since=$newest" >/dev/null
    delta=$(jq -r '.count // -1' /tmp/smoke.body 2>/dev/null || echo "-1")
    if [ "$delta" = "0" ]; then
      ok "  since=newest returns empty delta" "0"
    else
      bad "  since=newest returns empty delta" "0" "$delta"
    fi
  fi
fi

# ── /api/trending ─────────────────────────────────────────────────────
section "trending"
expect_status_in "GET /api/trending"        "200|204" GET "$BASE_URL/api/trending"

# ── /api/alerts ───────────────────────────────────────────────────────
section "alerts"
expect_status_in "GET /api/alerts"          "200|204" GET "$BASE_URL/api/alerts"

# ── /api/proxy ────────────────────────────────────────────────────────
section "proxy"
expect_status "GET without url"            400 GET "$BASE_URL/api/proxy"
assert_json_path "  error=missing_url"      ".error" "missing_url"

expect_status "GET with disallowed host"   403 GET "$BASE_URL/api/proxy?url=https%3A%2F%2Fexample.com%2F"
assert_json_path "  error=host_not_allowed" ".error" "host_not_allowed"

expect_status "GET with localhost"         403 GET "$BASE_URL/api/proxy?url=http%3A%2F%2Flocalhost%2F"
expect_status "GET with private 10.x"      403 GET "$BASE_URL/api/proxy?url=http%3A%2F%2F10.0.0.1%2F"
expect_status "GET with bad protocol"      400 GET "$BASE_URL/api/proxy?url=file%3A%2F%2F%2Fetc%2Fpasswd"
expect_status "POST not allowed"           405 POST "$BASE_URL/api/proxy?url=https%3A%2F%2Fbbc.com%2F"

# Allowed host: only run if we're hitting deployed Pages (otherwise wrangler
# pages dev won't reach the internet for upstream).
if [ "$BASE_URL" != "http://localhost:8788" ]; then
  expect_status_in "GET allowed host (bbc.com)" "200|502|504" GET \
    "$BASE_URL/api/proxy?url=https%3A%2F%2Fwww.bbc.com%2Farabic%2Farticles%2Fc8edd9z3jnpo"
else
  skip "GET allowed host (bbc.com)" "needs real network"
fi

# ── /api/cluster ──────────────────────────────────────────────────────
section "cluster"
expect_status "POST without body"          400 POST "$BASE_URL/api/cluster" \
  -H 'content-type: application/json'
expect_status "POST with empty body"       400 POST "$BASE_URL/api/cluster" \
  -H 'content-type: application/json' --data '{}'
# Valid call: cluster needs an `articles` array. We pass two stubs and accept
# 200 (clustered), 503 (AI unavailable), or 429 if local rate limit hit.
expect_status_in "POST with valid body" "200|429|503" POST "$BASE_URL/api/cluster" \
  -H 'content-type: application/json' \
  --data '{"articles":[{"id":"a","title":"اختبار خبر اقتصادي"},{"id":"b","title":"اختبار خبر سياسي"}]}'

# ── /api/summarize ────────────────────────────────────────────────────
section "summarize"
expect_status "POST without auth"          401 POST "$BASE_URL/api/summarize" \
  -H 'content-type: application/json' --data '{"articleId":"x","title":"y"}'
if [ -n "$JWT" ]; then
  expect_status_in "POST with JWT" "200|429|503" POST "$BASE_URL/api/summarize" \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $JWT" \
    --data '{"articleId":"smoke-test","title":"خبر اختبار","body":"هذا اختبار سريع لضمان عمل التلخيص."}'
else
  skip "POST with JWT" "set JWT env var to enable"
fi

# ── /api/comments ─────────────────────────────────────────────────────
section "comments"
expect_status "POST without auth"          401 POST "$BASE_URL/api/comments" \
  -H 'content-type: application/json' --data '{"articleId":"x","body":"hi"}'
expect_status "DELETE without auth"        401 DELETE "$BASE_URL/api/comments?id=00000000-0000-0000-0000-000000000000"

# ── /api/moderate ─────────────────────────────────────────────────────
section "moderate"
expect_status "POST without internal key"  403 POST "$BASE_URL/api/moderate" \
  -H 'content-type: application/json' --data '{"text":"hello"}'
if [ -n "$INTERNAL_API_KEY" ]; then
  expect_status_in "POST with internal key" "200|503" POST "$BASE_URL/api/moderate" \
    -H 'content-type: application/json' \
    -H "x-internal-key: $INTERNAL_API_KEY" \
    --data '{"text":"هذا تعليق طبيعي وودود تماماً."}'
else
  skip "POST with internal key" "set INTERNAL_API_KEY env var to enable"
fi

# ── Security headers (from _middleware.js) ────────────────────────────
section "security headers"
hdrs=$(curl -sSI "$BASE_URL/" 2>/dev/null || true)
if echo "$hdrs" | grep -qi '^x-frame-options:'; then
  ok "X-Frame-Options present" "$(echo "$hdrs" | grep -i '^x-frame-options:' | tr -d '\r' | cut -d: -f2- | xargs)"
else
  bad "X-Frame-Options present" "set" "missing"
fi
if echo "$hdrs" | grep -qi '^x-content-type-options:'; then
  ok "X-Content-Type-Options present" "nosniff"
else
  bad "X-Content-Type-Options present" "set" "missing"
fi
if echo "$hdrs" | grep -qi '^referrer-policy:'; then
  ok "Referrer-Policy present" "$(echo "$hdrs" | grep -i '^referrer-policy:' | tr -d '\r' | cut -d: -f2- | xargs)"
else
  bad "Referrer-Policy present" "set" "missing"
fi

# ── Summary ───────────────────────────────────────────────────────────
printf "\n${BOLD}Result:${RESET} ${GREEN}%d passed${RESET}, ${RED}%d failed${RESET}, ${YELLOW}%d skipped${RESET}\n" \
  "$PASS" "$FAIL" "$SKIP"

exit "$FAIL"
