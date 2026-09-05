# Claude-Code-Phani

Claude Code skills for IBM ACE integration work.

Target runtime: **IBM ACE 12.0.12.0 on AIX 7.3 (ksh)**.

## Skills

### `ace-code-review`

Reviews IBM ACE artifacts — ESQL, JavaCompute/user-defined node Java, message
flows and subflows, plus BAR overrides, policies and descriptors.

It runs in two stages:

1. **`scripts/ace-prescan.sh`** — a deterministic grep pass that produces
   *candidates*, not findings. POSIX sh, no bashisms and no GNU-only flags, so it
   runs unchanged under AIX ksh, Linux and macOS.
2. **Reading the code** — the part that finds unwired Catch terminals, leaked
   message trees, cross-thread `SHARED` races and values that will break on
   promotion. The pre-scan cannot see any of these.

Every candidate is opened and verified before it reaches the report. Unverified
hits are dropped silently.

## Install

The skill is project-scoped: clone this repo and Claude Code picks it up from
`.claude/skills/` when you work inside it.

To use it against any repo on your machine, symlink it into your user skills:

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD/.claude/skills/ace-code-review" ~/.claude/skills/ace-code-review
```

## Use

Ask in plain language — the skill triggers on intent, not a command:

- "review the ESQL changes on this branch"
- "check this message flow before I promote it to UAT"
- "audit the ORDER_MGMT application"

Or run the pre-scan on its own:

```sh
sh .claude/skills/ace-code-review/scripts/ace-prescan.sh --changed
sh .claude/skills/ace-code-review/scripts/ace-prescan.sh /path/to/application
```

Output is `SEVERITY|RULE|path:line|message`, sorted HIGH → MED → LOW.

## Before you rely on it

**Edit `references/conventions.md`.** It ships as placeholders. Naming standards,
queue conventions, error-handling patterns and repo layout are shop-specific, and
the skill is instructed not to report a convention finding unless that file
states the rule — so until you fill it in, you get the correctness and
environment-coupling checks but nothing about your standards.

## Limitations

Read these before trusting a clean report:

- **Nothing is compiled or executed.** No `mqsicreatebar`, no deploy, no test
  message through a flow. Findings are read from source.
- **No broker access.** The skill cannot query an integration node, read
  `/var/mqsi`, check queue depths or inspect a running flow.
- **Runtime configuration is invisible.** Queue attributes such as `BOTHRESH`,
  policy contents on the server, and `mqsisetdbparms` entries are outside the
  repo, so a finding about them is a prompt to check, not a verdict.
- **A clean pre-scan is not a clean review.** The grep rules cover known
  patterns; the review is the reading.
