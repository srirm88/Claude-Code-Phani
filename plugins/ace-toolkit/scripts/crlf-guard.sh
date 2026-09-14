#!/bin/sh
#
# SessionStart guard.
#
# The scanners in this plugin are POSIX sh. If the repository is cloned on a
# Windows workstation with core.autocrlf=true, git rewrites them with CRLF line
# endings and every one of them dies on the first line:
#
#     ace-prescan.sh: set: Illegal option -
#
# That failure is silent from Claude's side -- the skill just reports no
# candidates. This hook makes it loud, once, at session start.
#
# Read-only. Changes nothing. Always exits 0 so it can never block a session.

set -u

ROOT=${CLAUDE_PLUGIN_ROOT:-`dirname "$0"`/..}
CR=`printf '\r'`
BAD=

for f in "$ROOT"/skills/*/scripts/*.sh; do
    [ -f "$f" ] || continue
    if grep -q "$CR$" "$f" 2>/dev/null; then
        BAD="$BAD
  $f"
    fi
done

[ -n "$BAD" ] || exit 0

cat <<EOF
ace-toolkit: CRLF line endings detected in these scripts --$BAD

They will fail with "set: Illegal option -" and the scanners will silently
report nothing. Do not trust any scan result until this is fixed.

Fix in the plugin's source repository, then reinstall:

  git config core.autocrlf input
  git rm --cached -r . && git reset --hard

The repository ships a .gitattributes marking *.sh as eol=lf, so a fresh clone
should be correct -- a hit here usually means the clone predates it, or the
files were copied through a Windows editor that rewrote them.
EOF

exit 0
