#!/bin/sh
#
# rhel9-gateway-check.sh - read-only health and readiness check for an NGINX
# API gateway on RHEL 9, typically in a DMZ, fronting IBM ACE.
#
# READ ONLY. It changes nothing: no setsebool, no firewall-cmd --add, no
# systemctl reload. Every remedy is printed for a human to run deliberately.
#
# Run on the gateway host. Some checks need root or sudo; those that cannot run
# are reported as SKIP rather than silently passing.
#
#   sh rhel9-gateway-check.sh [nginx.conf path]

set -u
CONF=${1:-/etc/nginx/nginx.conf}
PASS=0; WARN=0; FAIL=0; SKIP=0

ok()   { PASS=`expr $PASS + 1`; printf 'PASS  %s\n' "$1"; }
warn() { WARN=`expr $WARN + 1`; printf 'WARN  %s\n' "$1"; [ $# -gt 1 ] && printf '      fix: %s\n' "$2"; }
bad()  { FAIL=`expr $FAIL + 1`; printf 'FAIL  %s\n' "$1"; [ $# -gt 1 ] && printf '      fix: %s\n' "$2"; }
skip() { SKIP=`expr $SKIP + 1`; printf 'SKIP  %s\n' "$1"; }
head_() { printf '\n== %s ==\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

head_ "platform"
if [ -r /etc/redhat-release ]; then ok "`cat /etc/redhat-release`"; else warn "not a Red Hat family host - RHEL-specific checks may not apply"; fi
have nginx && ok "`nginx -v 2>&1`" || bad "nginx not on PATH"

head_ "configuration"
if have nginx; then
    if nginx -t -c "$CONF" >/dev/null 2>&1; then
        ok "nginx -t passes for $CONF"
    else
        bad "nginx -t FAILS for $CONF" "nginx -t -c $CONF   # read the error before reloading anything"
    fi
    # effective config is the only thing worth reviewing
    if nginx -T -c "$CONF" >/dev/null 2>&1; then
        ok "nginx -T works - dump it for review: nginx -T > effective.conf"
    else
        skip "nginx -T needs root to read all includes"
    fi
fi

head_ "service"
if have systemctl; then
    systemctl is-active --quiet nginx && ok "nginx is active" || bad "nginx is not active" "systemctl status nginx; journalctl -u nginx -n 50 --no-pager"
    systemctl is-enabled --quiet nginx 2>/dev/null && ok "nginx enabled at boot" || warn "nginx not enabled at boot" "systemctl enable nginx"
    NOFILE=`systemctl show nginx -p LimitNOFILE --value 2>/dev/null`
    [ -n "$NOFILE" ] && printf 'INFO  systemd LimitNOFILE = %s\n' "$NOFILE"
    WC=`have nginx && nginx -T 2>/dev/null | grep -E '^[[:space:]]*worker_connections' | head -1 | tr -dc '0-9'`
    if [ -n "${WC:-}" ] && [ -n "$NOFILE" ] && [ "$NOFILE" != "infinity" ]; then
        [ "$WC" -gt "$NOFILE" ] 2>/dev/null \
          && bad "worker_connections ($WC) exceeds systemd LimitNOFILE ($NOFILE) - connections will be dropped under load" \
                 "raise LimitNOFILE via systemctl edit nginx, and set worker_rlimit_nofile in nginx.conf" \
          || ok "worker_connections ($WC) within LimitNOFILE ($NOFILE)"
    fi
fi

head_ "SELinux"
if have getenforce; then
    MODE=`getenforce`
    printf 'INFO  SELinux is %s\n' "$MODE"
    if [ "$MODE" = "Enforcing" ]; then
        if have getsebool; then
            if getsebool httpd_can_network_connect 2>/dev/null | grep -q ' on$'; then
                ok "httpd_can_network_connect is on - nginx may open upstream connections"
            else
                bad "httpd_can_network_connect is OFF - this is the classic cause of 502 with 'Permission denied' in the nginx error log" \
                    "setsebool -P httpd_can_network_connect 1"
            fi
        else skip "getsebool not available"; fi
        if have ausearch; then
            N=`ausearch -m AVC -ts recent 2>/dev/null | grep -c 'comm="nginx"' 2>/dev/null || echo 0`
            [ "${N:-0}" -gt 0 ] 2>/dev/null \
              && bad "$N recent SELinux AVC denials for nginx" "ausearch -m AVC -ts recent -c nginx | audit2why" \
              || ok "no recent SELinux denials for nginx"
        else skip "ausearch not available (needs audit + root)"; fi
    fi
else skip "SELinux tools not present"; fi

head_ "firewall and listeners"
if have firewall-cmd; then
    firewall-cmd --state >/dev/null 2>&1 \
      && printf 'INFO  firewalld zones/ports:\n' && firewall-cmd --list-all 2>/dev/null | sed 's/^/      /' \
      || skip "firewalld not running"
else skip "firewall-cmd not present"; fi
if have ss; then
    printf 'INFO  listening sockets:\n'; ss -lntp 2>/dev/null | grep -i nginx | sed 's/^/      /' || printf '      (none found - needs root to show process names)\n'
else skip "ss not present"; fi

head_ "system crypto policy (RHEL 9)"
if have update-crypto-policies; then
    POL=`update-crypto-policies --show 2>/dev/null`
    printf 'INFO  crypto policy = %s\n' "$POL"
    case "$POL" in
      LEGACY*) warn "LEGACY policy permits obsolete algorithms" "prefer DEFAULT, and pin ssl_protocols in nginx" ;;
      DEFAULT*) ok "DEFAULT policy - note it blocks SHA-1 signed certificates and TLS < 1.2 system-wide, which can reject older client certs regardless of nginx settings" ;;
      FUTURE*|FIPS*) warn "$POL is stricter than DEFAULT - verify every client and every upstream certificate still negotiates" ;;
    esac
else skip "update-crypto-policies not present"; fi

head_ "certificates"
if have nginx && have openssl; then
    nginx -T 2>/dev/null | grep -E '^[[:space:]]*ssl_certificate[[:space:]]' | awk '{print $2}' | tr -d ';' | sort -u | while IFS= read -r c; do
        [ -r "$c" ] || { printf 'FAIL  cannot read certificate %s\n' "$c"; continue; }
        END=`openssl x509 -in "$c" -noout -enddate 2>/dev/null | cut -d= -f2`
        if openssl x509 -in "$c" -noout -checkend 2592000 >/dev/null 2>&1; then
            printf 'PASS  %s valid past 30 days (notAfter %s)\n' "$c" "$END"
        else
            printf 'FAIL  %s expires within 30 days (notAfter %s) - in a DMZ there is no ACME renewal, so this is a manual task\n' "$c" "$END"
        fi
    done
else skip "certificate expiry needs nginx and openssl"; fi

head_ "upstream reachability (DMZ egress)"
if have nginx; then
    nginx -T 2>/dev/null | awk '/upstream[[:space:]]+[A-Za-z0-9_.-]+[[:space:]]*\{/,/\}/' \
      | grep -E '^[[:space:]]*server[[:space:]]' | awk '{print $2}' | tr -d ';' | sort -u | while IFS= read -r hp; do
        h=`echo "$hp" | sed 's/:.*//'`; p=`echo "$hp" | sed -n 's/.*://p'`
        if have getent && ! getent hosts "$h" >/dev/null 2>&1; then
            printf 'FAIL  upstream %s does not resolve - DMZ DNS or /etc/hosts\n' "$h"
        elif [ -n "$p" ] && have timeout && have bash; then
            if timeout 3 bash -c "exec 3<>/dev/tcp/$h/$p" 2>/dev/null; then
                printf 'PASS  upstream %s:%s reachable\n' "$h" "$p"
            else
                printf 'FAIL  upstream %s:%s NOT reachable - egress firewall rule from the DMZ to the integration tier\n' "$h" "$p"
            fi
        else
            printf 'INFO  upstream %s resolves (port not tested)\n' "$h"
        fi
    done
fi

head_ "recent errors"
if have journalctl; then
    N=`journalctl -u nginx --since '1 hour ago' -p err --no-pager 2>/dev/null | grep -c . || echo 0`
    [ "${N:-0}" -gt 1 ] 2>/dev/null && warn "$N error lines from nginx in the last hour" "journalctl -u nginx --since '1 hour ago' -p err --no-pager" || ok "no nginx errors in the last hour"
else skip "journalctl not present"; fi
for L in /var/log/nginx/error.log; do
    [ -r "$L" ] && { printf 'INFO  last 5 lines of %s:\n' "$L"; tail -5 "$L" | sed 's/^/      /'; }
done

printf '\n== summary ==\nPASS %s  WARN %s  FAIL %s  SKIP %s\n' "$PASS" "$WARN" "$FAIL" "$SKIP"
printf 'This script changed nothing. Every remedy above is for a human to run deliberately.\n'
[ "$FAIL" -gt 0 ] && exit 1
exit 0
