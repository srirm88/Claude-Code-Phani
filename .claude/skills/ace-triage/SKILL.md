---
name: ace-triage
description: Diagnose IBM ACE / IIB production and test failures — decode an ExceptionList or BIP message, find the root cause of a failing message flow, work out why messages are backing out or sitting on a backout queue, investigate DataFlowEngine memory growth, hung or stalled flows, deploy and BAR failures, HTTP/SOAP timeouts, database connection errors, and CCSID or encoding corruption. Use when asked why a flow is failing, what a BIP error means, why a message was lost or duplicated, why an integration server is slow or restarting, or to help troubleshoot, debug, or investigate an ACE issue. Produces the AIX ksh commands to gather evidence and interprets the output that comes back.
---

# Diagnosing IBM ACE failures

Target: **IBM ACE 12.0.12.0 on AIX 7.3 (ksh)**.

**You have no access to the broker.** You cannot run `mqsilist`, read
`/var/mqsi`, or query a queue. So the loop is: form a hypothesis, name the one
command that would confirm or kill it, ask the user to run it, read what comes
back. That constraint is a feature — it forces evidence before action.

## Workflow

### 1. Get the failure straight before theorising

Establish, and say which of these you do not have:

- **Symptom** — exact wording. "Messages are failing" is not a symptom;
  "BIP2628 on the Failure terminal, 40 messages on the backout queue" is.
- **Blast radius** — one message, one flow, one integration server, or the node?
- **When it started**, and **what changed** immediately before. A deploy, an
  override change, a downstream release, a certificate rotation, a filesystem
  filling up. Most ACE incidents are a change, not a decay.
- **Reproducible?** Every message, one message, or intermittent under load?
  Intermittent-under-load points at concurrency or resources, not logic.
- **Environment** — and whether it works in a lower one. If SIT is fine and PRD
  is not, suspect configuration and overrides before code.

### 2. Read the ExceptionList properly

If you have an ExceptionList, this is where the answer usually is. See
`references/exception-list.md`. The one rule that matters most:

> **The root cause is the DEEPEST nested exception, not the first one.**

The outer entries are wrappers added on the way up. Reading the outermost is the
most common triage mistake, and it sends people to the wrong node.

### 3. Match against known signatures

`references/signatures.md` catalogues the failures that recur: poison-message
loops, DataFlowEngine heap growth, stalled flow instances, deploy failures,
CCSID corruption, connection pool exhaustion. Each entry gives the symptom, the
usual cause, and the specific evidence that separates it from its lookalikes.

Match the symptom, but do not stop there — confirm with evidence before saying
you have found it.

### 4. Gather evidence

`references/diagnostics.md` has the command playbook: ACE administration, MQ,
and AIX. Give the user **the smallest set of commands that discriminates between
your hypotheses**, in a copy-paste ksh block, and say what each one would show
under each hypothesis. Then wait.

Do not hand over twenty commands and hope. Two well-chosen commands beat a
diagnostic dump, and a user-trace dump nobody asked for costs throughput on a
system that is already struggling.

Before proposing anything that changes a running system — enabling a trace,
restarting a flow or server, deleting messages, changing a queue attribute —
say what it costs and what it may destroy. Enabling user trace on a busy PRD
integration server is not free. Purging a backout queue destroys evidence.

### 5. Name the root cause, then the fix

Separate them explicitly:

```
Root cause:  what is actually wrong, and the evidence that shows it.
Why it fails: the mechanism, in one or two sentences.
Immediate:   what stops the bleeding now, and what it costs.
Permanent:   the code or configuration change that prevents recurrence.
Not proven:  what you are still inferring rather than confirming.
```

That last line is not optional. If the evidence supports two causes, say both and
give the command that separates them. **A confident wrong diagnosis costs more
than an honest "I need one more data point"** — in ACE it usually costs a
speculative restart, which destroys the in-flight evidence.

### 6. Fixing

If the fix is a code change, hand it to the `ace-build` patterns rather than
patching ad hoc — most incidents trace back to a missing item in
`../ace-build/references/patterns.md`, and the fix should close that gap
everywhere it exists, not just where it bit.

Say what you could not verify. Nothing here is compiled, deployed or tested
against a running broker.
