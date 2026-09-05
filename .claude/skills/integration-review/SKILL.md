---
name: integration-review
description: Review an end-to-end integration solution across NGINX as API gateway, IBM App Connect Enterprise, and IBM MQ — the seams between the tiers rather than the code inside one. Use when asked to review a project, a solution design, an integration architecture, an API onboarding, or a release before go-live; when asked whether a design is production-ready or safe to promote; or when reviewing NGINX gateway configuration, upstream and timeout settings, the HTTP-to-MQ boundary, retry and idempotency behaviour, correlation and traceability, or capacity and backpressure across the stack. Covers the timeout cascade, retry amplification and duplicate transactions, transaction boundaries, error mapping and leakage, TLS and header trust, and per-environment configuration across three separate config mechanisms.
---

# End-to-end integration review

Landscape: **NGINX (API gateway)**, **IBM ACE 12.0.12.26 on AIX 7.3**, **IBM MQ
9.3.0.35**, plus databases, files and downstream HTTP services.

This reviews the **seams** between tiers, for any project in that landscape.
For defects inside a single artifact — ESQL, Java, message flows — use the
`ace-code-review` skill; for diagnosing a live failure, `ace-triage`. This skill
exists because the failures that reach production are almost never inside one
tier. They live in the gaps, where each team assumes the other handled it.

**No project uses every tier.** Establish which are actually in play before
reviewing anything, and skip the rest — do not force a batch file interface
through an API-gateway checklist.

## Workflow

### 1. Establish the topology, then draw the transaction path

First, which tiers does this project actually involve?

| Entry point | Tiers in play |
|---|---|
| Public or partner REST/SOAP API | gateway → ACE → MQ / DB / downstream |
| Internal HTTP, no gateway | ACE → MQ / DB / downstream |
| MQ-triggered (queue or topic) | MQ → ACE → downstream |
| File-triggered or scheduled batch | filesystem → ACE → MQ / DB |
| Event stream (Kafka and similar) | broker → ACE → downstream |

Then write the path down, naming the concrete objects at each hop — listener and
location, input node and integration server, queue and queue manager, table or
endpoint. One line per interface.

Ask for what you cannot see. Gateway config, the flow, and the queue definitions
usually live with three different people, and reviewing one without the others
is how seam defects survive.

State the path back to the user before going further. If they correct you, that
correction is itself a finding — it means the design is not written down
anywhere.

### 2. Ask the five cross-tier questions

These are the review; everything else is detail. They apply to **every**
topology, not just the HTTP one — a "caller" may be a client, a queue, a
scheduler or a file poller, and a "hop" is any handoff between tiers.

**1. Where does the timeout budget break?**
On any synchronous chain, each layer must wait longer than everything beneath
it. When the caller gives up first, it sees a failure while the work continues
and still commits — and on asynchronous paths the same question becomes message
expiry and poll intervals. See `references/timeouts-and-retries.md`.

**2. What happens twice?**
Something retries: a gateway, a client, an MQ redelivery after backout, a
rescheduled batch. A retried non-idempotent operation is a duplicate
transaction, and usually no tier logs it as an error. See
`references/timeouts-and-retries.md`.

**3. Where is the transaction boundary?**
Wherever work crosses from one resource to another — HTTP to MQ, MQ to database,
file to queue — acknowledging before the write commits loses data, and
committing before acknowledging duplicates it on retry. You cannot have both
without an idempotency key. See `references/ace-mq-boundary.md`.

**4. Can you trace one transaction end to end?**
A correlation id generated at the gateway must survive into ACE, onto the MQMD,
into the error record, and into every log. One broken link and a production
incident becomes archaeology. See `references/observability.md`.

**5. What does the caller see when it goes wrong?**
Downstream down, downstream slow, queue full, payload too big, unauthorised,
malformed. Each should produce a deliberate, documented outcome that leaks
nothing internal — a status code for a synchronous caller, a backout or
dead-letter destination for an asynchronous one. See
`references/nginx-gateway.md` and `references/ace-mq-boundary.md`.

### 3. Run the deterministic scan on the gateway config

Only when a gateway is in play. Skip it for MQ-, file- or schedule-triggered
projects.

```sh
sh scripts/nginx-prescan.sh <path to nginx conf>
```

Output is `SEVERITY|RULE|path:line|message`.

**Candidates, not findings.** NGINX directives inherit down `http` → `server` →
`location`, and grep cannot see scope: a `proxy_read_timeout` set once in
`http{}` covers every server below it, and the scan will still report it missing
from a file that does not repeat it. Confirm the **effective** value for the
route under review before reporting anything.

### 4. Read the configuration of all three tiers

Read only the ones the topology calls for.

| Area | Reference | Applies when |
|---|---|---|
| Timeout budget, retries, duplicate transactions | `references/timeouts-and-retries.md` | always |
| Gateway: TLS, headers, limits, error mapping | `references/nginx-gateway.md` | a gateway fronts the flow |
| Transaction boundaries, idempotency, MQ capacity | `references/ace-mq-boundary.md` | any handoff between resources |
| Correlation, logging, what to alert on | `references/observability.md` | always |

### 5. Report

Order by severity. For each finding name the **tier boundary**, not just the
file — that is what makes it actionable by the right team:

```
[SEVERITY] NGINX → ACE          (RULE-ID if from the scan)
What is wrong:  one sentence.
How it fails:   the concrete scenario, end to end, with the numbers.
Who owns it:    gateway / integration / MQ admin.
Fix:            the specific change, with the value.
```

Severity here is about **business impact across the stack**, not local
correctness:

- **HIGH** — duplicate or lost transactions, a credential or internal detail
  reaching a client, an outage mode with no backpressure, or an untraceable
  transaction path.
- **MEDIUM** — a real defect with a bounded blast radius: a missing limit, weak
  error mapping, an alert that will not fire.
- **LOW** — hygiene and maintainability.

Close with: **is this safe to go live, and what is the one thing that must
change first.** A project review that ends in a list and no verdict is a
document nobody acts on.

### 6. State what you could not verify

You are reading configuration, not a running system. You cannot see the
effective merged NGINX config, the deployed BAR overrides, actual queue
attributes, or real latency. Say which findings are inference and name the
command that would settle each — `nginx -T`, `mqsireadbar -b <bar> -r`,
`DIS QL(...) MAXDEPTH MAXMSGL BOTHRESH`.

## The promotion checklist

Each tier carries its own configuration mechanism — gateway conf files, ACE BAR
overrides and policies, MQ object definitions — and they must move together. A
promotion that updates some but not all of them is the most common go-live
failure in this landscape.

Before sign-off, confirm for the target environment, skipping rows for tiers this
project does not use:

- [ ] Gateway upstreams point at that environment's ACE servers, and the config
      was validated with `nginx -t` and inspected with `nginx -T`
- [ ] TLS certificates valid, correct chain, and not expiring inside the release
      window
- [ ] BAR overrides applied and **verified** with `mqsireadbar -b <bar> -r`
- [ ] Queues, backout queues, `BOTHRESH`, `MAXMSGL` and depth alarms defined
- [ ] Security identities set with `mqsisetdbparms` on the target server
- [ ] MQ authorities granted to the ACE service user for that environment
- [ ] The timeout cascade re-checked — values are per-environment and drift
- [ ] Correlation id verified flowing end to end with one real test transaction
- [ ] Rollback path written down and actually tested
