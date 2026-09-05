#!/bin/sh
#
# ace-prescan.sh - deterministic candidate scan for IBM ACE artifacts.
#
# Emits pipe-delimited candidate findings:
#     SEVERITY|RULE|path:line|message
#     SEVERITY|RULE|path|message          (file-level rules, no line)
#
# These are CANDIDATES, not findings. Every hit must be opened and verified
# before it is reported to a human. Grep does not understand scope, comments,
# or intent.
#
# Written in POSIX sh (no bashisms, no GNU-only flags, no -print0, no sed -i)
# so it runs under AIX ksh as well as Linux and macOS.

set -u

usage() {
    cat <<'USAGE'
Usage:
  ace-prescan.sh [path ...]              scan the given paths (default: .)
  ace-prescan.sh --changed [base-ref]    scan only files changed vs base-ref
                                         (default base: origin/main, then HEAD)
  ace-prescan.sh --help

Exit status is always 0 when the scan completes; findings go to stdout.
USAGE
}

TMPD=${TMPDIR:-/tmp}
STEM=$TMPD/ace-prescan.$$
cleanup() { rm -f "$STEM".* 2>/dev/null; }
trap cleanup 0 1 2 3 15

MODE=paths
BASE=
case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    --changed) MODE=changed; BASE=${2:-} ;;
esac

: > "$STEM".all

if [ "$MODE" = changed ]; then
    if [ -z "$BASE" ]; then
        if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
            BASE=origin/main
        elif git rev-parse --verify -q origin/master >/dev/null 2>&1; then
            BASE=origin/master
        else
            BASE=HEAD
        fi
    fi
    git diff --name-only --diff-filter=ACMR "$BASE" 2>/dev/null > "$STEM".changed
    git ls-files --others --exclude-standard 2>/dev/null >> "$STEM".changed
    while IFS= read -r f; do
        [ -f "$f" ] && printf '%s\n' "$f"
    done < "$STEM".changed > "$STEM".all
else
    [ $# -eq 0 ] && set -- .
    for p in "$@"; do
        find "$p" -type f \
            \( -name '*.esql' -o -name '*.java' -o -name '*.msgflow' \
               -o -name '*.subflow' -o -name '*.map' -o -name '*.policyxml' \
               -o -name '*.descriptor' -o -name '*.properties' \
               -o -name '*.xml' -o -name '*.bar' \) \
            2>/dev/null
    done | grep -v '/\.git/' > "$STEM".all
fi

grep -i '\.esql$'                "$STEM".all > "$STEM".esql  2>/dev/null
grep -i '\.java$'                "$STEM".all > "$STEM".java  2>/dev/null
grep -i -E '\.(msgflow|subflow)$' "$STEM".all > "$STEM".flow  2>/dev/null
grep -i -E '\.(policyxml|descriptor|properties|xml)$' "$STEM".all > "$STEM".conf 2>/dev/null
for x in esql java flow conf; do [ -f "$STEM".$x ] || : > "$STEM".$x; done

# --- helpers ---------------------------------------------------------------
# line-level rule: list sev rule pattern message
scan() {
    [ -s "$1" ] || return 0
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        grep -n -i -E "$4" "$f" 2>/dev/null | while IFS= read -r hit; do
            printf '%s|%s|%s:%s|%s\n' "$2" "$3" "$f" "${hit%%:*}" "$5"
        done
    done < "$1"
}

# file-level rule: list sev rule trigger-pattern required-pattern message
# fires when trigger is present AND required is absent
scan_absent() {
    [ -s "$1" ] || return 0
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        if grep -q -i -E "$4" "$f" 2>/dev/null && ! grep -q -i -E "$5" "$f" 2>/dev/null; then
            printf '%s|%s|%s|%s\n' "$2" "$3" "$f" "$6"
        fi
    done < "$1"
}

# line-level rule with same-line exclusion:
#   list sev rule pattern exclude-pattern message
scan_x() {
    [ -s "$1" ] || return 0
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        grep -n -i -E "$4" "$f" 2>/dev/null | grep -v -i -E "$5" | while IFS= read -r hit; do
            printf '%s|%s|%s:%s|%s\n' "$2" "$3" "$f" "${hit%%:*}" "$6"
        done
    done < "$1"
}

# ESQL THROW statements span lines, so grep alone misreads them. Join each
# THROW ... ; statement before deciding whether it names a message catalog.
#   list sev rule message
scan_throw() {
    [ -s "$1" ] || return 0
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        awk '
        { line[NR] = $0 }
        END {
            for (i = 1; i <= NR; i++) {
                if (tolower(line[i]) ~ /throw[ \t]+user[ \t]+exception/) {
                    stmt = ""
                    for (j = i; j <= NR && j < i + 10; j++) {
                        stmt = stmt " " tolower(line[j])
                        if (line[j] ~ /;/) break
                    }
                    if (stmt !~ /catalog/) print i
                }
            }
        }' "$f" 2>/dev/null | while IFS= read -r ln; do
            printf '%s|%s|%s:%s|%s\n' "$2" "$3" "$f" "$ln" "$4"
        done
    done < "$1"
}

SECRET='(password|passwd|pwd|secret|apikey|api_key|accesskey|privatekey|credential|token)[^;]{0,40}('"'"'|")[^'"'"'"]{3,}('"'"'|")'
# lines that only *name* a secret rather than embed one
NOTSECRET='(getUserDefinedAttribute|EXTERNAL|mqsisetdbparms|getenv|System\.getProperty|securityIdentity|\$\{|@@|CHANGEME|xxxx|\*\*\*)'
IPLIT='([^0-9.]|^)(10|127|172|192|[0-9]{1,3})\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'

{
# --- ESQL ------------------------------------------------------------------
scan "$STEM".esql HIGH ESQL001 'PASSTHRU[^;]*\|\|' \
  'PASSTHRU with string concatenation - SQL injection risk; use parameterised PASSTHRU(stmt VALUES(...)) or a broker SELECT.'
scan "$STEM".esql HIGH ESQL002 '[^A-Za-z_]EVAL[[:space:]]*\(' \
  'EVAL() executes dynamically built ESQL - injection surface and no compile-time checking.'
scan_x "$STEM".esql HIGH ESQL003 "$SECRET" "$NOTSECRET" \
  'Possible hardcoded credential in ESQL - belongs in a security identity / vault, never in source.'
scan "$STEM".esql HIGH ESQL004 '(https?|ftp|sftp|mqsi)://' \
  'Hardcoded endpoint URL - promote to a UDP or a policy so it varies per environment.'
scan "$STEM".esql HIGH ESQL005 "$IPLIT" \
  'Hardcoded IP address - environment-specific value in source.'
scan "$STEM".esql HIGH ESQL006 '(queueName|DestinationData\.queueName)[[:space:]]*=[[:space:]]*'"'" \
  'Hardcoded queue name - promote to a UDP or set from the MQ Endpoint policy.'
scan "$STEM".esql HIGH ESQL007 'Database\.\{[[:space:]]*'"'" \
  'Hardcoded datasource/DSN literal - use a UDP or the default flow datasource.'
scan "$STEM".esql MED  ESQL008 'DECLARE[[:space:]]+[A-Za-z0-9_]+[[:space:]]+SHARED' \
  'SHARED variable - every read-modify-write on it must sit inside a BEGIN ATOMIC block.'
scan "$STEM".esql MED  ESQL009 'WHILE[^;]*CARDINALITY[[:space:]]*\(' \
  'CARDINALITY() re-evaluated on each loop iteration - hoist it into a variable.'
scan_throw "$STEM".esql MED ESQL010 \
  'THROW USER EXCEPTION with no message CATALOG/MESSAGE number - the exception list will carry free text that monitoring cannot key on.'
scan "$STEM".esql MED  ESQL011 'CAST[[:space:]]*\([^)]*AS[[:space:]]+(TIMESTAMP|DATE|TIME)[[:space:]]*\)' \
  'CAST to a temporal type without FORMAT - relies on locale defaults and will drift between environments.'
scan "$STEM".esql LOW  ESQL012 'SET[[:space:]]+OutputRoot[[:space:]]*=[[:space:]]*InputRoot[[:space:]]*;' \
  'Full message copy - confirm the Compute node Compute Mode is not already copying, otherwise this is wasted work.'
scan "$STEM".esql LOW  ESQL013 '--[[:space:]]*(TODO|FIXME|HACK|XXX)' \
  'Leftover TODO/FIXME marker.'
scan_absent "$STEM".esql MED ESQL014 'CREATE[[:space:]]+(COMPUTE|FILTER|DATABASE)[[:space:]]+MODULE' \
  '(DECLARE[[:space:]]+[A-Za-z0-9_]+[[:space:]]+(CONTINUE|RESUME)[[:space:]]+HANDLER|THROW|Environment\.Variables\.Error)' \
  'Module has no exception HANDLER and never THROWs - failures propagate raw to the Catch/Failure terminal with no context.'
scan_absent "$STEM".esql MED ESQL015 'CREATE[[:space:]]+COMPUTE[[:space:]]+MODULE' 'RETURN[[:space:]]+(TRUE|FALSE)' \
  'Compute module with no RETURN TRUE/FALSE - message will not be propagated as intended.'
scan_absent "$STEM".esql MED ESQL016 'MOVE[[:space:]]+[A-Za-z0-9_]+[[:space:]]+(NEXTSIBLING|FIRSTCHILD|LASTCHILD)' 'LASTMOVE[[:space:]]*\(' \
  'REFERENCE navigation without a LASTMOVE() guard - silent wrong-element reads when the tree is shorter than expected.'

# --- Java (JavaCompute / user-defined nodes) -------------------------------
scan "$STEM".java HIGH JAVA001 'DriverManager\.getConnection' \
  'Raw JDBC connection - use getJDBCType4Connection() so the connection joins the broker transaction and pool.'
scan_x "$STEM".java HIGH JAVA002 "$SECRET" "$NOTSECRET" \
  'Possible hardcoded credential in Java source.'
scan "$STEM".java HIGH JAVA003 'static[[:space:]]+(SimpleDateFormat|DateFormat|Calendar|HashMap|ArrayList|StringBuilder|StringBuffer|[A-Za-z0-9_]*Map|[A-Za-z0-9_]*List)[[:space:]]' \
  'Mutable static field in a node class - shared across flow instances and threads; not thread-safe.'
scan "$STEM".java MED  JAVA004 '(System\.(out|err)\.print|printStackTrace[[:space:]]*\()' \
  'Writing to stdout/stderr instead of MbService.logInformation/logError - output is lost or floods the AIX syslog.'
scan "$STEM".java MED  JAVA005 'catch[[:space:]]*\([[:space:]]*(Exception|Throwable)[[:space:]]' \
  'Broad catch - confirm it rethrows as MbUserException rather than swallowing the failure.'
scan "$STEM".java MED  JAVA006 '(getBytes[[:space:]]*\([[:space:]]*\)|new[[:space:]]+String[[:space:]]*\([[:space:]]*[A-Za-z0-9_]+[[:space:]]*\))' \
  'Platform-default charset conversion - AIX default CCSID differs from the deployment target; pass an explicit charset.'
scan "$STEM".java MED  JAVA007 '(https?://|jdbc:)' \
  'Hardcoded endpoint in Java - read it from getUserDefinedAttribute() or a policy instead.'
scan "$STEM".java MED  JAVA008 "$IPLIT" \
  'Hardcoded IP address in Java source.'
scan "$STEM".java LOW  JAVA009 '//[[:space:]]*(TODO|FIXME|HACK|XXX)' \
  'Leftover TODO/FIXME marker.'
scan_absent "$STEM".java HIGH JAVA010 'new[[:space:]]+MbMessage[[:space:]]*\(' 'clearMessage[[:space:]]*\(' \
  'Creates MbMessage but never calls clearMessage() - classic ACE Java heap leak; clear it in a finally block.'
scan_absent "$STEM".java HIGH JAVA011 'new[[:space:]]+MbMessage[[:space:]]*\(' 'finally' \
  'MbMessage created without a finally block - the clearMessage() will be skipped on any exception path.'
scan_absent "$STEM".java MED  JAVA012 'evaluate[[:space:]]*\([[:space:]]*MbMessageAssembly' 'MbUserException' \
  'JavaCompute evaluate() never raises MbUserException - errors will not carry node/method context to the Failure terminal.'

# --- Message flows / subflows ---------------------------------------------
scan_x "$STEM".flow HIGH FLOW001 "$SECRET" "$NOTSECRET" \
  'Possible credential embedded in flow XML - use a security identity (mqsisetdbparms), not a literal.'
scan "$STEM".flow HIGH FLOW002 'queueName="[^"$][^"]*"' \
  'Hardcoded queue name in a node property - promote it or drive it from an MQ Endpoint policy.'
scan "$STEM".flow HIGH FLOW003 '(queueManagerName|connection|hostName|serverName)="[^"$][^"]+"' \
  'Hardcoded queue manager / host in a node property - environment-specific value baked into the flow.'
scan "$STEM".flow HIGH FLOW004 "$IPLIT" \
  'Hardcoded IP address in flow XML.'
scan "$STEM".flow MED  FLOW005 'ComIbmTrace\.msgnode' \
  'Trace node in the flow - confirm it is disabled or removed before promotion; file tracing is a throughput killer.'
scan "$STEM".flow MED  FLOW006 'validateMaster="(none|None)"' \
  'Parser validation disabled - malformed payloads will surface deep in the flow instead of at the input node.'
scan "$STEM".flow MED  FLOW007 '(messageDomainProperty="(XMLNS|MRM|XML)"|ComIbmMSLMapping)' \
  'Deprecated or slower parser/domain (XMLNS, plain XML, MRM) - XMLNSC or DFDL is the current choice.'
scan "$STEM".flow MED  FLOW008 'transactionMode="(no|none)"' \
  'Transaction mode off - verify this is deliberate and not an accidental at-most-once path.'
scan "$STEM".flow MED  FLOW009 'additionalInstances="[1-9]' \
  'Additional instances set on the flow - prefer a Workload Management policy so it is tunable without a redeploy.'
scan "$STEM".flow LOW  FLOW010 'string="(Compute|Compute[0-9]+|Java Compute|Mapping|Filter|Trace|Passthrough)[0-9]*"' \
  'Default node label left unchanged - unhelpful in exception lists and monitoring events.'
scan_absent "$STEM".flow HIGH FLOW011 'ComIbm(MQInput|HTTPInput|SOAPInput|FileInput|TCPIPServerInput|Kafka)' 'sourceTerminalName="(failure|catch)"' \
  'Input node present but no Failure or Catch terminal is wired anywhere in the flow - poison messages will loop or be lost.'
scan_absent "$STEM".flow MED  FLOW012 'ComIbm(HTTPRequest|SOAPRequest|RESTRequest)' '(requestTimeout|timeoutForServer)=' \
  'Outbound request node with no explicit timeout - inherits a default that can pin a flow instance for a long time.'

# --- Config / descriptors / overrides -------------------------------------
scan_x "$STEM".conf HIGH CONF001 "$SECRET" "$NOTSECRET" \
  'Possible credential in a configuration/override file.'
scan "$STEM".conf MED  CONF002 "$IPLIT" \
  'Hardcoded IP in configuration - confirm it is not a production endpoint committed to source control.'
} | sort -t'|' -k1,1 -k2,2 > "$STEM".out

# HIGH before MED before LOW
for sev in HIGH MED LOW; do
    grep "^$sev|" "$STEM".out 2>/dev/null
done

TOTAL=`wc -l < "$STEM".out | tr -d ' '`
HI=`grep '^HIGH|' "$STEM".out 2>/dev/null | wc -l | tr -d ' '`
ME=`grep '^MED|'  "$STEM".out 2>/dev/null | wc -l | tr -d ' '`
LO=`grep '^LOW|'  "$STEM".out 2>/dev/null | wc -l | tr -d ' '`
FILES=`wc -l < "$STEM".all | tr -d ' '`
printf '\n--- prescan summary: %s candidate(s) across %s file(s) [HIGH %s / MED %s / LOW %s] ---\n' \
    "$TOTAL" "$FILES" "$HI" "$ME" "$LO"
printf -- '--- candidates are unverified; open each one before reporting it ---\n'
