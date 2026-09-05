# Resource boundaries: transactions, idempotency, capacity

Applies wherever work crosses from one resource to another — HTTP to MQ, MQ to
database, file to queue, queue to downstream API.

## The dual-write problem

Two resources, one logical unit of work, no shared transaction. This is the
defect that survives every code review because each half is individually
correct.

Consider a synchronous API that puts a message on MQ and replies:

- **Reply first, then commit the put** — the client is told it succeeded. If the
  put fails, the work is lost and nobody knows.
- **Commit the put, then reply** — the put succeeds, the reply is lost (network,
  timeout, gateway gave up). The client retries. The message is now on the queue
  twice.

**There is no ordering that is safe on its own.** Choose deliberately:

1. **Commit first, plus an idempotency key** the consumer enforces. The retry
   produces a second message; the consumer discards it. This is usually the right
   answer.
2. **Reply first**, accepted only where losing the work is genuinely tolerable.
   Requires the business owner's agreement, in writing.
3. **Return 202 with a status endpoint** — acknowledge receipt, not completion,
   and let the client poll. The honest option when the work is asynchronous.

The review question is not "which did you pick" but "did anyone pick". Usually
nobody did, and the behaviour is an accident of node ordering.

The same applies to MQ-to-database: a coordinated MQ get with an uncoordinated
JDBC write loses the row on failure while consuming the message.

## Transaction coordination in ACE

- An MQInput with `transactionMode="no"` is at-most-once. Sometimes right,
  usually accidental.
- Coordinated MQ plus a JDBC connection obtained through
  `getJDBCType4Connection()` joins one unit of work. A raw
  `DriverManager.getConnection()` does not — it commits independently, and the
  rollback leaves the row behind.
- An HTTP reply is **never** inside the transaction. Whatever the flow does with
  MQ and the database, the reply is a separate event that can be lost.
- `PROPAGATE` inside a loop with a coordinated put commits per iteration or at
  the end depending on configuration. Confirm which, and what a mid-loop failure
  leaves behind.

## Idempotency

If an operation can run twice, one of these must hold:

1. It is naturally idempotent.
2. A key is carried end to end and someone enforces it.
3. Duplicates are acceptable, agreed and documented.

For (2), the key must originate with the **client** or be derived from payload
content. An MQ message id, a broker-generated UUID, or a timestamp are all
regenerated on retry and deduplicate nothing. This is the most common mistake in
a design that claims to handle duplicates.

Also settle: where is the key stored, how long is it retained, and what happens
when the store is unavailable? A deduplication table that fails open is not
deduplication.

## Queue and capacity review

For every queue in the path:

| Attribute | Why it matters |
|---|---|
| `MAXDEPTH` | Full queue means the put fails. What does the caller see then? |
| `MAXMSGL` | Must be >= the largest payload the edge accepts, on the queue *and* the qmgr |
| `BOTHRESH` | Zero means infinite redelivery — a poison message pins a flow instance |
| `BOQNAME` | The backout queue must exist, and someone must watch it |
| Depth alarm | Nobody notices a rising queue without one |

A backout queue that exists but has no alarm and no owner is the same as no
backout queue — the messages simply accumulate until someone stumbles on them.

## Backpressure — what happens when it is full

Trace the failure outward and confirm each step is deliberate:

```
queue full  →  ACE put fails  →  flow raises  →  what does the caller get?
```

The good answer is a 503 with `Retry-After` at the edge and an alert. The common
answer is a timeout, because the flow retried internally until the gateway gave
up — which also triggers the gateway's own retry, adding load to a system that
is already saturated.

Check the sizing too: ACE flow instances are a fixed pool per flow. Concurrent
gateway connections can far exceed them, and the excess simply queues. Compare
the gateway's connection limits against ACE's instance count and say whether
they are consistent. They usually are not, and nobody has ever compared them.

## Poison messages

Every asynchronous entry point needs an answer to "what happens to a message
that always fails":

- `BOTHRESH` set, backout queue defined, and Catch/Failure terminals wired
- Someone owns the backout queue and is alerted when it is non-empty
- A documented way to inspect a backed-out message **without destroying it** —
  browse it, do not purge it

Without all four, the failure mode is an infinite redelivery loop that consumes
a flow instance and looks, from the outside, exactly like a hang.
