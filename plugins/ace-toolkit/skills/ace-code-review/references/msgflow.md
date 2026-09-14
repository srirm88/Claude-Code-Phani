# Message flow / subflow review reference

`.msgflow` and `.subflow` are XML. Read them directly; the graphical view hides
exactly the properties that matter for review.

## Error terminals — check this first

- **Every input node needs its failure path wired.** `MQInput`, `HTTPInput`,
  `SOAPInput`, `FileInput`, `KafkaConsumer`, `TCPIPServerInput`: the **Catch**
  terminal handles exceptions thrown downstream after the message is read; the
  **Failure** terminal handles errors reading/parsing it. Neither wired means the
  message backs out.
- **MQInput without a backout queue and threshold** turns any unhandled exception
  into an infinite redelivery loop that saturates a flow instance. Check
  `BOTHRESH` on the queue *and* that a backout requeue queue exists.
- **Every request node needs its Failure/Timeout terminal handled**:
  `HTTPRequest`, `SOAPRequest`, `RESTRequest`, `DatabaseRoute`. A downstream
  outage with no failure path is an outage of your flow.
- A Failure terminal wired straight to a Trace node is not error handling.
- In subflows, the failure path must be surfaced through an Output node — a
  subflow that catches internally and returns normally hides errors from the
  parent flow.

## Environment coupling

Node properties that must be promoted or policy-driven, never literal:

- `queueName`, `queueManagerName`, backout queue names
- `URLSpecifier` / hostnames / ports on request nodes
- data source names on Database and Mapping nodes
- file paths and patterns on File nodes
- `securityIdentity` — the *identity name* is fine in the flow; the credential
  behind it belongs in `mqsisetdbparms`, never in the XML

Prefer **policies** (MQEndpoint, HTTPEndpoint, JDBCProviders, Workload
Management) over BAR overrides where a policy exists: policies are changeable
without a redeploy.

## Transactions

- `transactionMode="no"` on an MQInput makes delivery at-most-once. Sometimes
  correct, usually accidental. Ask.
- Mixed coordination — a coordinated MQ get with an uncoordinated JDBC write —
  gives you a message consumed and a database row missing on failure. Either
  coordinate both or make the operation idempotent and say so.
- `MQOutput` with `transactionMode="yes"` inside a flow whose input is
  uncoordinated does not do what the name suggests.

## Parsers and validation

- **XMLNSC** for XML, **DFDL** for fixed-width/delimited, **JSON** for JSON.
  `XMLNS` and plain `XML` are legacy, slower and heavier. MRM is deprecated —
  new work using it needs justification.
- `validateMaster="none"` on an input node means bad payloads fail deep inside
  the flow with a useless error instead of at the boundary. Validation at the
  input node is cheaper and produces a diagnosable message.
- Parse timing: `parseTiming="immediate"` surfaces malformed input at the input
  node; `onDemand` (the default) defers the failure to wherever the field is
  first touched. Immediate is usually the better trade for validation-critical
  flows.

## Throughput

- **Trace nodes** cost on every message even when the trace file is not being
  read. They should not survive to production.
- `additionalInstances` set on the flow is baked into the BAR. Prefer a Workload
  Management policy so it can be tuned on a running system.
- Long-running request nodes with no `requestTimeout` hold a flow instance
  indefinitely; with limited instances that is a full stall.
- Deeply nested subflow chains add per-message overhead — worth noting when a
  flow is on a hot path.

## Maintainability

- Default node labels (`Compute1`, `Java Compute`, `Mapping`) appear verbatim in
  exception lists and monitoring events. Rename them to say what they do; this is
  LOW severity but pays for itself at 2am.
- Unconnected nodes left on the canvas still deploy.
- Logic duplicated across flows belongs in a `.subflow`.
- Monitoring events configured on nodes should be consistent across the
  application, not sprinkled on whichever node someone was debugging.
