#!/bin/sh
#
# nginx-prescan.sh - deterministic candidate scan for NGINX API-gateway config
# fronting IBM ACE.
#
# Emits:  SEVERITY|RULE|path:line|message
#         SEVERITY|RULE|path|message        (file-level rules)
#
# CANDIDATES, not findings. NGINX directives inherit down the http/server/
# location hierarchy, and grep cannot see scope -- a directive set once in
# http{} covers every server below it. Open every hit and confirm the effective
# value before reporting it.
#
# POSIX sh: runs under Git Bash on Windows, AIX ksh, and Linux.

set -u

usage() {
    cat <<'USAGE'
Usage:
  nginx-prescan.sh [path ...]     scan nginx config under the given paths (default: .)
  nginx-prescan.sh --help

Detects NGINX config by content, not filename: any *.conf / nginx.conf-style
file containing proxy_pass, upstream, listen or server_name.
USAGE
}

case "${1:-}" in --help|-h) usage; exit 0 ;; esac

TMPD=${TMPDIR:-/tmp}
STEM=$TMPD/nginx-prescan.$$
trap 'rm -f "$STEM".* 2>/dev/null' 0 1 2 3 15

[ $# -eq 0 ] && set -- .
: > "$STEM".cand
for p in "$@"; do
    find "$p" -type f \( -name '*.conf' -o -name 'nginx.conf*' -o -name '*.nginx' \) 2>/dev/null
done | grep -v '/\.git/' > "$STEM".cand

: > "$STEM".all
while IFS= read -r f; do
    [ -f "$f" ] || continue
    if grep -q -E '(^|[;{])[[:space:]]*(proxy_pass|upstream|listen|server_name)[[:space:]]' "$f" 2>/dev/null; then
        printf '%s\n' "$f"
    fi
done < "$STEM".cand > "$STEM".all

# strip comments before matching so a commented-out directive never counts
uncomment() { sed -e 's/#.*$//' "$1" 2>/dev/null; }

# line-level:  sev rule pattern message
scan() {
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        uncomment "$f" | grep -n -E "$3" 2>/dev/null | while IFS= read -r hit; do
            printf '%s|%s|%s:%s|%s\n' "$1" "$2" "$f" "${hit%%:*}" "$4"
        done
    done < "$STEM".all
}

# file-level, fires when the file proxies but never sets the directive:
#   sev rule required-pattern message
scan_missing() {
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        uncomment "$f" > "$STEM".u
        grep -q -E '(^|[;{])[[:space:]]*proxy_pass[[:space:]]' "$STEM".u 2>/dev/null || continue
        if ! grep -q -E "$3" "$STEM".u 2>/dev/null; then
            printf '%s|%s|%s|%s\n' "$1" "$2" "$f" "$4"
        fi
    done < "$STEM".all
}

{
# --- retry amplification: the duplicate-transaction generator ---------------
scan HIGH NGX001 '(^|[;{])[[:space:]]*proxy_next_upstream[^;]*(timeout|non_idempotent)' \
  'proxy_next_upstream retries on timeout - a slow ACE flow is re-sent to another server and the work runs twice. Non-idempotent POSTs become duplicate MQ messages.'
scan_missing HIGH NGX002 '(^|[;{])[[:space:]]*proxy_next_upstream[[:space:]]' \
  'No proxy_next_upstream directive - the default is "error timeout", so NGINX silently retries timed-out requests. Set "proxy_next_upstream off" for non-idempotent routes.'

# --- the timeout cascade ---------------------------------------------------
scan_missing HIGH NGX003 '(^|[;{])[[:space:]]*proxy_read_timeout[[:space:]]' \
  'No proxy_read_timeout - defaults to 60s. It must exceed the ACE flow budget, or NGINX returns 504 while the flow is still running and still commits its MQ put.'
scan_missing MED  NGX004 '(^|[;{])[[:space:]]*proxy_connect_timeout[[:space:]]' \
  'No proxy_connect_timeout - defaults to 60s, so a dead ACE server holds a client connection for a full minute before failover.'

# --- payload size limits, three tiers that must agree ----------------------
scan_missing HIGH NGX005 '(^|[;{])[[:space:]]*client_max_body_size[[:space:]]' \
  'No client_max_body_size - defaults to 1m. Larger payloads are rejected with 413 at the edge; reconcile against the ACE parser limit and MQ MAXMSGL.'

# --- trusting client-supplied identity -------------------------------------
scan HIGH NGX006 'proxy_set_header[^;]*\$http_(x_client_cert|x_forwarded_for|x_forwarded_user|x_user|x_authenticated)' \
  'Forwarding a client-supplied header as trusted identity - a caller can set it themselves. NGINX must overwrite these, never pass them through.'
scan HIGH NGX007 '(^|[;{])[[:space:]]*underscores_in_headers[[:space:]]+on' \
  'underscores_in_headers on - permits header smuggling between underscore and hyphen variants.'

# --- TLS -------------------------------------------------------------------
scan HIGH NGX008 '(^|[;{])[[:space:]]*ssl_protocols[^;]*(TLSv1[[:space:]]|TLSv1;|TLSv1\.1|SSLv[23])' \
  'Obsolete TLS version enabled.'
scan HIGH NGX009 '(^|[;{])[[:space:]]*proxy_ssl_verify[[:space:]]+off' \
  'proxy_ssl_verify off - the hop to ACE is encrypted but unauthenticated; anything that can answer the address is trusted.'
scan MED  NGX010 '(^|[;{])[[:space:]]*listen[[:space:]]+([0-9.]+:)?80[[:space:]]*;' \
  'Plain HTTP listener - confirm it only redirects to HTTPS and never proxies.'

# --- error leakage ---------------------------------------------------------
scan_missing MED NGX011 '(^|[;{])[[:space:]]*proxy_intercept_errors[[:space:]]+on' \
  'proxy_intercept_errors not on - ACE error bodies reach the client verbatim, leaking BIP numbers, node labels, queue names and stack traces.'
scan MED NGX012 '(^|[;{])[[:space:]]*server_tokens[[:space:]]+on' \
  'server_tokens on - discloses the NGINX version.'

# --- traceability ----------------------------------------------------------
scan_missing MED NGX013 '\$request_id' \
  'No $request_id - without a gateway-generated correlation id propagated to ACE and onto MQMD, a transaction cannot be traced across the three tiers.'
scan_missing MED NGX014 '\$upstream_response_time' \
  'Log format omits $upstream_response_time - you cannot tell whether latency is NGINX or ACE, which is the first question in every performance incident.'

# --- backpressure ----------------------------------------------------------
scan_missing MED NGX015 '(^|[;{])[[:space:]]*(limit_req|limit_conn)[[:space:]]' \
  'No rate or connection limiting - a client burst is passed straight through to ACE, where flow instances are a fixed pool.'

# --- config hygiene --------------------------------------------------------
scan HIGH NGX016 '(password|passwd|secret|api_key|apikey|token|credential)[^;]*[=[:space:]]"?[A-Za-z0-9/+_-]{6,}' \
  'Possible credential in NGINX config.'
scan MED  NGX017 '(^|[;{])[[:space:]]*proxy_pass[[:space:]]+https?://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' \
  'proxy_pass to a literal IP - use a named upstream so the target is environment-specific config, not embedded in the route.'
scan LOW  NGX018 '(^|[;{])[[:space:]]*proxy_pass[[:space:]]+https?://[A-Za-z0-9.-]+\.(com|net|org|local|internal)' \
  'proxy_pass to a literal hostname - prefer a named upstream block for failover and per-environment substitution.'
} | sort -t'|' -k1,1 -k2,2 > "$STEM".out

for sev in HIGH MED LOW; do grep "^$sev|" "$STEM".out 2>/dev/null; done

T=`wc -l < "$STEM".out | tr -d ' '`
H=`grep '^HIGH|' "$STEM".out 2>/dev/null | wc -l | tr -d ' '`
M=`grep '^MED|'  "$STEM".out 2>/dev/null | wc -l | tr -d ' '`
L=`grep '^LOW|'  "$STEM".out 2>/dev/null | wc -l | tr -d ' '`
N=`wc -l < "$STEM".all | tr -d ' '`
printf '\n--- nginx prescan: %s candidate(s) across %s config file(s) [HIGH %s / MED %s / LOW %s] ---\n' "$T" "$N" "$H" "$M" "$L"
printf -- '--- directives inherit down http/server/location; confirm the EFFECTIVE value before reporting ---\n'
