#!/bin/sh
#
# Build self-contained ZIPs for upload to claude.ai (Chat, Cowork, Desktop,
# M365 add-ins) at https://claude.ai/customize/skills.
#
#   sh bundle.sh [output-dir]        default: ./dist
#
# claude.ai takes one ZIP per skill and each must stand alone, so the shared
# files that the Claude Code install resolves by relative path are COPIED into
# each bundle here:
#
#   ace-build   <- conventions.md, windows-to-aix.md, ace-prescan.sh
#   ace-triage  <- conventions.md, patterns.md, RootCauseException.esql
#   integration-review <- nginx-prescan.sh
#
# Those copies are a SNAPSHOT. Edit the originals in the repo, then re-run this
# and re-upload -- never edit inside a bundle.

set -u

ROOT=`cd "\`dirname "$0"\`" && pwd`
SRC=$ROOT/.claude/skills
OUT=${1:-$ROOT/dist}
REVIEW=$SRC/ace-code-review

[ -d "$SRC" ] || { echo "error: $SRC not found" >&2; exit 1; }

STAGE=$OUT/.stage
rm -rf "$STAGE"
mkdir -p "$STAGE" || exit 1

COPY_NOTE='<!-- BUNDLED COPY. The canonical file lives in the ace-code-review
     skill in the source repository. Edit it there and re-run bundle.sh;
     changes made inside this bundle are lost on the next build. -->'

for s in ace-code-review ace-build ace-triage integration-review nginx-review; do
    [ -d "$SRC/$s" ] || { echo "error: $SRC/$s missing" >&2; exit 1; }
    cp -R "$SRC/$s" "$STAGE/$s" || exit 1
done

# --- inline the shared files -----------------------------------------------
mkdir -p "$STAGE/ace-build/references" "$STAGE/ace-build/scripts" \
         "$STAGE/ace-triage/references" "$STAGE/ace-triage/templates"

for target in ace-build ace-triage; do
    { printf '%s\n\n' "$COPY_NOTE"; cat "$REVIEW/references/conventions.md"; } \
        > "$STAGE/$target/references/conventions.md"
done

{ printf '%s\n\n' "$COPY_NOTE"; cat "$REVIEW/references/windows-to-aix.md"; } \
    > "$STAGE/ace-build/references/windows-to-aix.md"

cp "$REVIEW/scripts/ace-prescan.sh" "$STAGE/ace-build/scripts/ace-prescan.sh"
chmod +x "$STAGE/ace-build/scripts/ace-prescan.sh"

mkdir -p "$STAGE/integration-review/scripts"
cp "$SRC/nginx-review/scripts/nginx-prescan.sh" "$STAGE/integration-review/scripts/nginx-prescan.sh"
chmod +x "$STAGE/integration-review/scripts/nginx-prescan.sh"

{ printf '%s\n\n' "$COPY_NOTE"; cat "$SRC/ace-build/references/patterns.md"; } \
    > "$STAGE/ace-triage/references/patterns.md"
cp "$SRC/ace-build/templates/RootCauseException.esql" \
   "$STAGE/ace-triage/templates/RootCauseException.esql"

# --- rewrite the sibling-relative paths to bundle-local ones ---------------
rewrite() {
    # $1 = file, $2 = from, $3 = to
    [ -f "$1" ] || return 0
    sed -e "s|$2|$3|g" "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}
rewrite "$STAGE/ace-build/SKILL.md"  '\.\./ace-code-review/references/conventions\.md' 'references/conventions.md'
rewrite "$STAGE/ace-build/SKILL.md"  '\.\./ace-code-review/scripts/ace-prescan\.sh'    'scripts/ace-prescan.sh'
rewrite "$STAGE/ace-build/SKILL.md"  '\.\./ace-code-review/references/windows-to-aix\.md' 'references/windows-to-aix.md'
rewrite "$STAGE/ace-triage/SKILL.md" '\.\./ace-build/references/patterns\.md'          'references/patterns.md'
rewrite "$STAGE/integration-review/SKILL.md" '\.\./nginx-review/scripts/nginx-prescan\.sh' 'scripts/nginx-prescan.sh'
rewrite "$STAGE/ace-triage/references/exception-list.md" \
        '\.\./ace-build/templates/RootCauseException\.esql' 'templates/RootCauseException.esql'

# --- verify no sibling references survive ----------------------------------
LEFT=`grep -rl '\.\./ace-' "$STAGE" 2>/dev/null`
if [ -n "$LEFT" ]; then
    echo "error: unresolved cross-skill references remain in:" >&2
    echo "$LEFT" >&2
    exit 1
fi

# --- zip -------------------------------------------------------------------
zipdir() {  # $1 = skill name
    ( cd "$STAGE" && \
      if command -v zip >/dev/null 2>&1; then
          zip -q -r "$OUT/$1.zip" "$1"
      elif command -v python3 >/dev/null 2>&1; then
          python3 -c 'import shutil,sys; shutil.make_archive(sys.argv[1],"zip",".",sys.argv[2])' \
                  "$OUT/$1" "$1"
      else
          return 1
      fi )
}

RC=0
for s in ace-code-review ace-build ace-triage integration-review nginx-review; do
    rm -f "$OUT/$s.zip"
    if zipdir "$s"; then
        echo "built  $OUT/$s.zip"
    else
        echo "error: neither zip nor python3 available -- archive $STAGE/$s by hand" >&2
        RC=1
    fi
done

[ "$RC" -eq 0 ] && rm -rf "$STAGE"

cat <<'NOTE'

Upload each ZIP separately at https://claude.ai/customize/skills
  -> "+"  ->  "+ Create skill"  ->  "Upload a skill"

Code execution must be enabled in your Claude settings for the skills to run.

The bundled conventions.md is a snapshot. After editing the canonical copy in
.claude/skills/ace-code-review/references/conventions.md, re-run this script and
re-upload, or the two will drift.
NOTE
exit $RC
