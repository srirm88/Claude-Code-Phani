# Timeout budget and retries

The two questions that catch more production defects than everything else in
this review combined.

## The cascade rule

On any synchronous chain, **each layer must wait longer than everything beneath
it, plus the processing time at each hop.** When an outer layer gives up first,
it reports failure to its caller while the inner work carries on — and commits.

The caller then retries. The original work also completes. That is a duplicate
transaction that no tier logs as an error, because from each tier's own point of
view nothing went wrong.

Work the budget inward from the client:

```
client socket timeout                    120s
  └─ gateway proxy_read_timeout           90s   <- must be < client
       └─ ACE flow total budget           60s   <- must be < gateway
            ├─ HTTPRequest requestTimeout 30s
            ├─ database call              10s
            └─ processing + MQ put       ~5s
                                    total ~45s  <- must fit inside 60s with headroom
```

Every inequality in that diagram is a review item. Ask for the real numbers and
add them up. "It's the default" is not an answer — defaults are what produce the
inversion, because NGINX `proxy_read_timeout` defaults to 60s while an ACE
`HTTPRequest` node with no explicit timeout can wait far longer.

**The classic inversion:** gateway 60s, ACE downstream call 90s. Every slow
request returns 504 to the client while the flow keeps running and still puts
its message. Under a downstream slowdown, this generates duplicates at exactly
the moment the system is least able to cope.

## Asynchronous paths have the same question

There is no socket timeout, but the budget still exists:

- **Message expiry** — an MQMD `Expiry` shorter than the worst-case processing
  time silently discards work. Longer than the business meaning of the message
  and you process stale data. Both are findings.
- **Poll interval and batch window** — a file or scheduled trigger that fires
  again before the previous run finishes produces two concurrent runs over the
  same input. Ask what prevents overlap.
- **Backout threshold** — `BOTHRESH` is the retry budget for MQ redelivery.
  Zero means infinite; too high means a poison message is reprocessed many times
  before anyone notices.
- **Downstream call timeouts still apply** — an asynchronous entry point with an
  unbounded synchronous call inside it pins a flow instance indefinitely.

## Retry amplification

Something in every chain retries. Enumerate them explicitly:

| Layer | Default behaviour |
|---|---|
| Client | usually retries; often not documented, ask |
| NGINX `proxy_next_upstream` | **defaults to `error timeout`** — retries timed-out requests to another upstream |
| ACE request nodes | retry only if configured |
| MQ redelivery after backout | until `BOTHRESH` |
| Scheduler / batch | reruns the window |

Multiply them. Two layers retrying three times each is nine executions of a
non-idempotent operation.

**NGINX `proxy_next_upstream` deserves specific attention.** The default retries
on timeout, so a slow ACE flow is re-sent to a second ACE server — and both
complete, both put to MQ. For any route that is not idempotent, this must be
`proxy_next_upstream off`, or restricted to connection errors only (never
`timeout`, never `non_idempotent`).

## What makes retries safe

Exactly one of these, and the review should confirm which:

1. **The operation is naturally idempotent** — a read, or a write keyed on
   client-supplied data that overwrites rather than appends.
2. **An idempotency key is carried and enforced.** The client supplies a key,
   and the first component that can deduplicate does so. "We use the message id"
   is not enough — a retried HTTP request generates a *new* message id, so the
   key must come from the client or be derived from the payload.
3. **Duplicates are acceptable and that is written down**, with the downstream
   owner's agreement.

If the answer is none of the three, that is a HIGH finding regardless of how
carefully the timeouts are set — timeouts reduce the frequency, they do not
remove the mode.

## Review checklist

1. Write out the full budget with real numbers, per interface.
2. Confirm every inequality holds, with headroom — not exactly equal.
3. Enumerate every retrying layer and multiply.
4. For each non-idempotent operation, name which of the three safety
   conditions applies.
5. Check the values are per-environment: a PRD downstream is slower than SIT,
   and the budget that held in test can invert on promotion.
