---
name: ace-code-review
description: Review IBM ACE / IIB integration code — ESQL (.esql), JavaCompute and user-defined node Java, message flows and subflows (.msgflow, .subflow), plus BAR overrides, policies and descriptors. Use when asked to review, check, audit, or sanity-check ACE artifacts, an integration application, a broker change, or a pull request touching ESQL or message flows; also use before promoting a BAR to a higher environment. Covers correctness, exception handling and Catch/Failure wiring, thread safety, message-tree memory leaks, hardcoded environment values, credentials in source, parser choice, transaction semantics, and shop naming conventions.
---

# IBM ACE code review

Review ACE integration artifacts the way an experienced integration architect
does: find the failures that reach production, not the ones a linter would find.

Target runtime is **IBM ACE 12.0.12.26 on AIX 7.3, IBM MQ 9.3.0.35**. Assume ksh, assume the
deployed unit is a BAR, assume the same source is promoted DEV → SIT → UAT → PRD
with only overrides changing. Anything that pins a flow to one environment is a
defect, not a style issue.

## Workflow

### 1. Scope the review

Decide what is under review before reading anything:

- **A change** (default when there is a diff, a branch, or a PR): review only
  what changed, plus enough surrounding code to judge it. Get the file list with
  `git diff --name-only --diff-filter=ACMR <base>`.
- **A whole application**: review every artifact under the application folder.
- **Named files**: exactly those.

State the scope in one line before you start. Do not silently widen it.

### 2. Run the deterministic pre-scan

```sh
sh .claude/skills/ace-code-review/scripts/ace-prescan.sh --changed        # scope to a diff
sh .claude/skills/ace-code-review/scripts/ace-prescan.sh <path> [path...] # scope to paths
```

Output is `SEVERITY|RULE|path:line|message`.

**These are candidates, not findings.** The script is grep — it does not know
about scope, comments, dead code, or intent. Open every candidate and confirm it
before it goes in the report. Drop the ones that do not hold up; say nothing
about them. A report padded with false positives gets the whole review ignored.

If the script is unavailable or errors, do the review by reading — the reference
files below carry the same rules in prose.

### 3. Read the code

The pre-scan cannot see the defects that actually cause incidents. Read the
artifacts and check for these yourself, consulting the references as you go:

| Area | Reference |
|---|---|
| ESQL semantics, message tree, transactions, performance | `references/esql.md` |
| JavaCompute and user-defined nodes | `references/java.md` |
| Message flows, subflows, node properties, policies | `references/msgflow.md` |
| Shop naming and structure standards | `references/conventions.md` |

Judge each artifact against three questions:

1. **What happens when this fails?** Trace the error path to a terminal. If the
   exception path is not wired to somewhere a human or a retry mechanism can see,
   that is the finding — regardless of how clean the happy path is.
2. **What happens under load and concurrency?** Additional instances mean the
   same ESQL and the same Java class run on multiple threads. SHARED variables,
   static fields and unclosed message trees only break here.
3. **What breaks on promotion?** Any queue name, hostname, port, URL, DSN,
   file path, or credential that is not overridable will break in the next
   environment.

### 4. Verify before reporting

For each surviving finding, write down the concrete failure: the input or
condition, and the wrong outcome. If you cannot state one, it is a preference,
not a defect — either drop it or clearly mark it as a suggestion.

Never report:
- Style opinions dressed as defects.
- A rule ID with no explanation of why it matters *here*.
- Anything you have not opened and read in context.

### 5. Report

Order by severity, highest first. For each finding:

```
[SEVERITY] path/to/File.esql:42  (RULE-ID if from the pre-scan)
What is wrong: one sentence.
How it fails:  the concrete scenario — input, state, wrong outcome.
Fix:           the specific change, with a code snippet when it is short.
```

Severity:

- **HIGH** — data loss, message loss or duplication, poison-message loop,
  credential exposure, injection, a leak that will exhaust the DataFlowEngine
  heap, or a value that guarantees breakage on promotion.
- **MEDIUM** — a real defect with a bounded blast radius: missing timeout,
  weak error context, thread-unsafe code that is currently single-instance,
  avoidable per-message cost.
- **LOW** — maintainability and convention: default node names, dead code,
  leftover TODOs, comments that no longer match the code.

Close with a two-line verdict: is this safe to promote, and if not, what is the
single thing that must change first. If nothing of substance was found, say so
plainly — do not manufacture findings to look thorough.

## Applying fixes

Only edit code when explicitly asked. When you do:

- Change one thing per fix; keep the diff minimal.
- Do not reformat, rename, or restructure alongside a fix.
- ESQL and flow changes cannot be compiled or tested here. Say what you could
  not verify, and what the reviewer should run — usually `mqsicreatebar` /
  `mqsipackagebar` plus a unit test through the flow — rather than implying the
  change is proven.
