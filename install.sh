#!/bin/sh
#
# Install the ACE skills into your personal Claude Code skills directory so they
# work in every project, not just this repo.
#
#   sh install.sh            symlink (default -- git pull keeps them current)
#   sh install.sh --copy     copy instead (independent of this clone)
#   sh install.sh --remove   uninstall
#
# The three skills MUST be installed together: ace-build and ace-triage
# reference ace-code-review by relative path for the shared conventions file
# and the pre-scan script.

set -u

SRC=`cd "\`dirname "$0"\`/.claude/skills" 2>/dev/null && pwd`
DEST=${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}
SKILLS="ace-code-review ace-build ace-triage"
MODE=${1:---link}

if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
    echo "error: cannot find .claude/skills next to this script" >&2
    exit 1
fi

case "$MODE" in
--remove)
    for s in $SKILLS; do
        if [ -e "$DEST/$s" ] || [ -L "$DEST/$s" ]; then
            rm -rf "$DEST/$s" && echo "removed  $DEST/$s"
        fi
    done
    exit 0
    ;;
--link|--copy) ;;
*)
    echo "usage: sh install.sh [--link|--copy|--remove]" >&2
    exit 2
    ;;
esac

mkdir -p "$DEST" || exit 1

for s in $SKILLS; do
    if [ ! -d "$SRC/$s" ]; then
        echo "error: $SRC/$s is missing -- refusing a partial install" >&2
        exit 1
    fi
done

for s in $SKILLS; do
    [ -e "$DEST/$s" ] || [ -L "$DEST/$s" ] && rm -rf "$DEST/$s"
    if [ "$MODE" = --copy ]; then
        cp -R "$SRC/$s" "$DEST/$s" && echo "copied   $DEST/$s"
    else
        ln -s "$SRC/$s" "$DEST/$s" && echo "linked   $DEST/$s -> $SRC/$s"
    fi
done

# The cross-skill relative references only resolve if all three are siblings.
for s in ace-build ace-triage; do
    if [ ! -f "$DEST/$s/../ace-code-review/SKILL.md" ]; then
        echo "warning: $s cannot see ace-code-review -- shared references will fail" >&2
    fi
done

echo
echo "Installed to $DEST"
echo "Start a new Claude Code session, then run /doctor to confirm the skills loaded."
echo
echo "Next: fill in $DEST/ace-code-review/references/conventions.md"
echo "      until you do, the skills will not report against your naming standards."
