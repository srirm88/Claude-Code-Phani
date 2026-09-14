# Correlation, logging and alerting

The test: **take one transaction and follow it across every tier.** If you
cannot, the first hour of every incident is spent guessing. This is the review
item most often skipped and most regretted.

## The correlation chain

One identifier must survive every hop. It breaks at the joins, so check each:

| Hop | Mechanism | Common break |
|---|---|---|
| Client → gateway | client header, else gateway generates | neither, so requests are anonymous |
| Gateway → ACE | `proxy_set_header X-Request-ID $request_id;` | header set but ACE never reads it |
| ACE flow | read into `LocalEnvironment` / `Environment` at the input node | read in one flow, lost in a subflow |
| ACE → MQ | `MQMD.CorrelId`, or a header folder | put without setting it |
| MQ → next ACE flow | read `MQMD.CorrelId` back out | new id generated instead |
| ACE → downstream | propagate as a header | dropped on the outbound call |
| Error path | included in the error record | the one place it is always forgotten |
| Every log line | included in the format | present in some logs, absent in others |

**The error path matters most.** A correlation id that flows through the happy
path and is missing from the exception record is useless — the happy path is not
the one you investigate.

Where a client supplies its own id, decide whether you honour it or generate
your own and record both. Honouring a client id blindly means a caller can
collide with another caller's traces.

## Log fields that earn their place

At the gateway, the minimum that answers "was it us or them":

```
$request_id  $remote_addr  $request  $status
$request_time  $upstream_response_time  $upstream_addr  $upstream_status
```

`$upstream_response_time` alongside `$request_time` is the field that separates
gateway latency from ACE latency. Without it, the first question in every
performance incident is unanswerable and the two teams argue instead.
`$upstream_addr` tells you *which* ACE server, which matters the moment one
node misbehaves.

In ACE, every log and error record needs: correlation id, flow and node label,
the root-cause exception number and text (the **deepest** nested exception, not
the outermost), and enough business context to identify the transaction — an
order number, not just a message id.

Never log payloads by default. Where a payload is needed for diagnosis, it goes
behind an explicitly enabled level, with PII and credentials excluded, and with
someone accountable for turning it off again.

## Clock alignment

Cross-tier correlation is worthless if the clocks disagree. Confirm NTP on the
AIX servers and the gateway hosts, and confirm the timestamp format and time
zone recorded in each log. A gateway logging UTC and an ACE server logging local
time, with no offset recorded, makes correlation manual and error-prone.

## What to alert on

Alert on symptoms a user would notice, not on individual component state:

| Signal | Why |
|---|---|
| Backout queue depth > 0 | poison messages, and nobody is watching that queue |
| Input queue depth rising over N minutes | consumption has stopped or fallen behind |
| Gateway 5xx rate | the caller-visible failure rate |
| `$upstream_response_time` percentile | degradation before it becomes an outage |
| DataFlowEngine RSS trend | message-tree leaks surface here first |
| Certificate expiry, 30 days out | the most preventable outage in this stack |
| Flow or integration server stopped | it fails silently otherwise |

Two questions worth asking about any alert that already exists: **who receives
it, and what do they do?** An alert with no runbook and no owner is noise that
trains people to ignore the console.

## Verify it, do not assume it

The correlation chain is trivially testable and almost never tested. Push one
transaction through and grep for the id in every log. Either it appears
everywhere or you have just found your first HIGH finding.

State plainly in the review whether this was actually tested or only inferred
from configuration.
