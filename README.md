# Claude-Code-Phani

Claude Code skills for IBM ACE integration work.

Development on **Windows** (ACE Toolkit). Runtime: **IBM ACE 12.0.12.26 on
AIX 7.3 (ksh), IBM MQ 9.3.0.35**.

Three skills covering the actual working cycle — review what exists, write what
does not, diagnose what broke. They are deliberately connected: the review rules,
the authoring patterns and the failure signatures are three views of the same
list of things that go wrong in ACE.

## Skills

| Skill | Triggers on | What it does |
|---|---|---|
| `ace-code-review` | "review this", "check before I promote", a PR touching ESQL | Two stages: a deterministic pre-scan, then a reading pass |
| `ace-build` | "write an ESQL module", "create a flow", "how do I implement X" | Writes against templates; self-checks with the review scanner |
| `ace-triage` | "why is this failing", "what does this BIP mean", "messages are backing out" | Root-cause discipline; produces the AIX commands to gather evidence |

### `ace-code-review`

1. **`scripts/ace-prescan.sh`** — grep pass producing *candidates*, not findings.
   POSIX sh, no bashisms and no GNU-only flags, so it runs unchanged under AIX
   ksh, Linux and macOS.
2. **Reading the code** — unwired Catch terminals, leaked message trees,
   cross-thread `SHARED` races, values that break on promotion. The pre-scan
   cannot see any of these.

Candidates are verified before they reach the report; unverified hits are
dropped silently.

### `ace-build`

The inverse of the review skill: every HIGH the review looks for is a pattern
this one writes correctly first time. Ships working templates (Compute module
with handler and UDPs, JavaCompute node with the correct message lifecycle,
root-cause extraction from an ExceptionList, BAR override guidance) and
self-checks its own output by running the review scanner over it.

It will not hand-write `.msgflow` XML by default — that is generated XML with
internal identifiers, and a malformed flow fails at BAR build with an unhelpful
error. It produces a node-and-property specification instead, unless you ask.

### `ace-triage`

Built around the constraint that Claude has no broker access: form a hypothesis,
name the one command that confirms or kills it, read what comes back. Covers
ExceptionList navigation (the root cause is the *deepest* nested exception, not
the first — the most common triage mistake), the AIX/ACE/MQ command playbook, and
a catalogue of recurring failure signatures with the evidence that separates
lookalikes.

## Install

### Claude Code — this project only

Clone the repo. Claude Code picks the skills up from `.claude/skills/` whenever
you work inside it. Nothing else to do.

### Claude Code — everywhere

```sh
sh install.sh              # symlink; git pull keeps them current
sh install.sh --copy       # copy instead, independent of this clone
sh install.sh --remove     # uninstall
```

Installs into `~/.claude/skills/` (override with `CLAUDE_SKILLS_DIR`). Start a
new Claude Code session afterwards and run `/doctor` to confirm they loaded.

**On Windows, run these in Git Bash, not `cmd` or PowerShell.** They are POSIX
shell scripts. Git Bash ships with Git for Windows; WSL works too. `--copy` is
the safer choice on Windows, since symlinks need Developer Mode or an elevated
shell.

**All three install together, by design.** `ace-build` and `ace-triage` reach
into `ace-code-review` by relative path — for the shared conventions file and
the pre-scan script. The installer refuses a partial install and warns if the
references cannot resolve.

### claude.ai — Chat, Cowork, Desktop, M365 add-ins

One registry serves all of them. Build the ZIPs, then upload each one:

```sh
sh bundle.sh                          # writes dist/*.zip
```

Then at [claude.ai/customize/skills](https://claude.ai/customize/skills):
**+** → **+ Create skill** → **Upload a skill**, one ZIP per skill. Code
execution must be enabled in your Claude settings.

`bundle.sh` exists because claude.ai takes one self-contained ZIP per skill,
while the Claude Code install resolves shared files by relative path across
sibling skills. The bundler copies those shared files into each ZIP and rewrites
the paths, then fails the build if any `../ace-*` reference survives.

**The copies are a snapshot.** After editing the canonical
`ace-code-review/references/conventions.md`, re-run `bundle.sh` and re-upload,
or the uploaded skills drift from the repo. `dist/` is gitignored for that
reason — build it, do not commit it.

### Windows checkouts — read this first

Git for Windows defaults to `core.autocrlf=true`, which rewrites checked-out
files to CRLF. **A shell script converted to CRLF fails immediately** with
`set: Illegal option -`. The `.gitattributes` here pins `*.sh` and `*.ksh` to LF
to prevent that.

If you cloned before that file existed, force a re-checkout:

```sh
git rm --cached -r . && git reset --hard
```

Verify: `file install.sh` should say `ASCII text`, not `with CRLF line
terminators`.

### What actually works where

| | Claude Code | Cowork | Chat |
|---|---|---|---|
| `ace-triage` | yes | yes | yes — it is knowledge, not tooling |
| `ace-build` | yes | yes | yes, minus the self-check scan |
| `ace-code-review` | yes | yes, on files it can reach | only on files you upload |

`ace-triage` is the one that is fully portable: it never touches your source, it
reads output you paste in. `ace-code-review` is the least portable, because the
pre-scan needs ACE source files on a filesystem it can see.

## Use

Ask in plain language — the skills trigger on intent, not a command:

- "review the ESQL changes on this branch"
- "write me a compute module that maps this order to the SAP format"
- "why are messages piling up on ORDER.IN.BO?"

Or run the pre-scan directly:

```sh
sh .claude/skills/ace-code-review/scripts/ace-prescan.sh --changed
sh .claude/skills/ace-code-review/scripts/ace-prescan.sh /path/to/application
```

Output is `SEVERITY|RULE|path:line|message`, sorted HIGH → MED → LOW.

## Before you rely on any of this

**Edit `.claude/skills/ace-code-review/references/conventions.md`.** It ships as
placeholders and is the single shared conventions file for all three skills.
Naming standards, queue conventions, error-handling patterns and repo layout are
shop-specific, and the skills are instructed not to report or invent a convention
unless that file states the rule. Until you fill it in you get the correctness
and environment-coupling behaviour and nothing about your standards.

## Limitations

Read these before trusting a clean report or a generated artifact:

- **Nothing is compiled or executed.** No `ibmint package`, no
  `mqsipackagebar`, no deploy, no test message through a flow.
- **No broker access.** Cannot query an integration node, read `/var/mqsi`,
  check queue depths or inspect a running flow. `ace-triage` works from output
  you paste in, by design.
- **Runtime configuration is invisible.** Queue attributes such as `BOTHRESH`,
  deployed policy contents and `mqsisetdbparms` entries live outside the repo, so
  a finding about them is a prompt to check, not a verdict.
- **A clean pre-scan is not a clean review.** The grep rules cover known
  patterns; the review is the reading.
- **Command flags vary by ACE level and server model.** The skills are told to
  confirm with `-h` rather than trust a flag from memory. Verify the playbook
  against your installation once.
