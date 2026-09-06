---
name: ace-build
description: Write new IBM ACE / IIB integration code — ESQL compute and database modules, JavaCompute and user-defined nodes, message flows and subflows, error-handling subflows, DFDL and XMLNSC message models, UDPs and BAR override files. Use when asked to write, create, generate, scaffold, add, or extend an ACE artifact, an integration flow, an ESQL module, a JavaCompute node, or an ACE application; also when asked how to implement a particular integration pattern in ACE. Enforces the patterns that stop the code failing review or production — mandatory exception handlers, wired Catch/Failure terminals, clearMessage in a finally block, UDP-driven configuration, XMLNSC/DFDL parsers, thread-safe state.
---

# Writing IBM ACE code

Target: **IBM ACE 12.0.12.26 on AIX 7.3, IBM MQ 9.3.0.35**.
Same source promoted DEV → SIT → UAT → PRD with only overrides changing.

This skill is the inverse of `ace-code-review`. Every HIGH-severity finding that
review looks for is a pattern this skill writes correctly the first time. If code
produced here would fail that review, it is wrong — fix it before handing it over.

## Scope rule

Work scoped to ACE or MQ stays there. **Do not widen to the NGINX gateway
unless the user names it** — no gateway findings, no requests for `nginx.conf`,
no speculation about what the DMZ tier might be doing. If a gateway concern
looks genuinely material, say so in one line and let the user decide; do not
act on it.

The reverse is not symmetric: work that starts at the gateway *does* pull ACE
and MQ in, because the gateway's timeouts, retries and limits are meaningless
without them. That rule lives in the `nginx-review` skill.

## Workflow

### 1. Establish the contract before writing anything

Do not start from a blank ESQL module. Pin these down first, asking only where
you genuinely cannot infer the answer:

- **Trigger** — MQ, HTTP/REST, SOAP, file, scheduled, Kafka? That decides the
  input node and the whole error-handling shape.
- **Payload in and out** — domain and format (XMLNSC, DFDL, JSON, BLOB), and
  whether a message model already exists in a shared library.
- **Delivery semantics** — at-least-once, at-most-once, exactly-once? This
  decides transaction mode and whether the target must be idempotent. Getting it
  wrong is not fixable later by tuning.
- **Failure behaviour** — retry, backout, dead-letter, or alert? Name the queue
  or destination.
- **What varies per environment** — every one of those becomes a UDP or a policy,
  never a literal.

If the answer to "what happens when the target is down" is missing, that is a
blocking question. Everything else you can assume and state.

### 2. Read the conventions

Load `../ace-code-review/references/conventions.md` (same skills directory). It
carries the shop's naming and structure standards. Sections still marked `TBD`
have no standard — ask which convention applies rather than inventing one, and
never silently invent a queue or module naming scheme.

### 3. Write against the templates

`templates/` holds working skeletons. Start from them rather than from memory:

| File | Use |
|---|---|
| `templates/ComputeModule.esql` | Compute/Filter module with handler, UDPs, header copy |
| `templates/JavaComputeNode.java` | JavaCompute node with the correct message lifecycle |
| `templates/RootCauseException.esql` | Reusable root-cause extraction from ExceptionList |
| `templates/bar-override.md` | How to build the per-environment override file |

Non-negotiables, in `references/patterns.md`. Read it before writing ESQL or
Java. The short version:

- Every Compute module: an exception handler, and `RETURN TRUE`/`FALSE` on every
  path.
- Every `new MbMessage(...)`: a matching `clearMessage()` in a `finally` block.
- Every input node: Catch **and** Failure terminals wired to something real.
- Every request node: an explicit timeout and a wired Failure terminal.
- Every environment-specific value: a UDP (`DECLARE X EXTERNAL ...`) or a policy.
- Every exception: a message catalog, a number, and inserts that identify the
  message — never bare text.
- No mutable statics in Java, no unguarded `SHARED` in ESQL.
- No Windows path literals, no platform-default charset. You are writing on
  Windows for an AIX runtime — see `../ace-code-review/references/windows-to-aix.md`.
- XMLNSC for XML, DFDL for fixed-width/delimited, JSON for JSON. Not XMLNS, not
  MRM.

### 4. Message flow XML — be honest about what you can produce

`.msgflow` and `.subflow` are generated XML with internal identifiers and
positional metadata. **Hand-writing them is error-prone and a malformed flow
fails at BAR build with an unhelpful message.**

Default to producing a **node-and-property specification** the user builds in the
Toolkit: nodes in order, the exact property values, and every wire including the
Catch and Failure terminals. That is faster to act on and cannot be subtly
corrupt.

Generate flow XML only when explicitly asked, and when you do, say plainly that
it must be opened in the Toolkit and rebuilt before it is trusted.

### 5. Self-check before handing over

Run the review skill's scanner over what you wrote:

```sh
sh ../ace-code-review/scripts/ace-prescan.sh <the files you created>
```

Fix every HIGH. For each MED, either fix it or state why it is correct here. A
clean scan is not proof of correctness — re-read the code against
`references/patterns.md` as well.

### 6. State what you could not verify

Nothing here is compiled, packaged or deployed. When handing over, say so
explicitly and name what the user must run — typically `ibmint package` /
`mqsipackagebar`, then a test message through the flow. Do not imply the code is
proven.

## Choosing a node

| Need | Use | Not |
|---|---|---|
| Field-level transformation with logic, loops, database access | Compute (ESQL) | JavaCompute for the sake of it |
| Straight structural mapping, model to model | Mapping node | hand-written ESQL that re-implements a map |
| Existing Java library, complex algorithm, third-party client | JavaCompute | ESQL calling out awkwardly |
| Routing on message content | Route or Filter | a Compute that only does `PROPAGATE` |
| Reusable logic across flows | `.subflow` in a shared library | copy-paste between flows |

ESQL is the default. Reach for JavaCompute when there is a real reason, and
accept the memory-lifecycle discipline that comes with it.
