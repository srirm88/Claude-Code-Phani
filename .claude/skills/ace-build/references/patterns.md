# Mandatory patterns

Read this before writing ESQL or Java. Each item exists because its absence
causes a specific production failure, named below.

## ESQL

**Exception handler in every module.**
Without it the raw exception reaches the Catch/Failure terminal naming no
business identifier, and the on-call engineer cannot tell which order failed.
Use `DECLARE EXIT HANDLER FOR SQLSTATE LIKE '%'` and rethrow with a catalog,
number and inserts.

**`RETURN TRUE` on every path out of `Main()`.**
Falling off the end does not propagate. Symptom: message consumed, nothing
downstream, no error. The hardest failure to diagnose from a ticket.

**`PROPAGATE ... DELETE NONE` when you keep writing to `OutputRoot`.**
A plain `PROPAGATE` clears `OutputRoot`. Code that propagates in a loop and then
appends is building empty messages after the first pass.

**Copy `InputRoot.Properties` when building an output message.**
Otherwise CCSID, encoding and domain are lost and the downstream parser guesses.
On AIX that guess corrupts anything non-ASCII.

**Guard every `MOVE` with `LASTMOVE`.**
An unguarded reference silently points at the wrong element. The flow processes
the wrong data rather than failing — worse than an exception.

**`BEGIN ATOMIC` around every read-modify-write on a `SHARED` variable.**
With additional instances these run concurrently. The lazy-cache idiom
(`IF cache IS NULL THEN load`) races and several instances load at once.

**Parameterised `PASSTHRU`, never concatenation.**
`PASSTHRU('SELECT ... WHERE ID = ?' VALUES(orderId))`. Concatenation is SQL
injection, reachable from message content.

**`FORMAT` on every temporal `CAST`.**
Without it the conversion follows the locale. The AIX broker locale is not the
developer's workstation locale, so it works in DEV and fails in PRD.

**Hoist `CARDINALITY` out of loop conditions**, and navigate with a `REFERENCE`
plus `CREATE LASTCHILD` instead of re-walking `a.b.c[i]` from the root.

## Java

**`new MbMessage(...)` and `clearMessage()` in a `finally`, always paired.**
The native message tree is not garbage collected. Unpaired, the DataFlowEngine
grows until AIX kills it — usually a week after go-live, under production volume.

**Never `DriverManager.getConnection()`.**
Use `getJDBCType4Connection(dsn, JDBC_TransactionType.MB_TRANSACTION_AUTO)` so
the connection joins the broker transaction and the managed pool. A raw
connection leaks file descriptors and is not rolled back with the message.

**No mutable statics, no per-message instance fields.**
Additional instances run the same object on multiple threads. `static
SimpleDateFormat` corrupts output silently instead of throwing.

**Rethrow, never swallow.**
`catch (Exception e) { log(e); }` tells the broker the message succeeded. It is
gone. Rethrow as `MbUserException(this, "method()", catalog, key, text,
inserts)`; rethrow `MbException` unchanged.

**Explicit charset on every byte/String conversion.**
`getBytes()` and `new String(byte[])` use the AIX platform default. Take the
CCSID from the message `Properties` where you can.

**Expensive setup in `onInitialize()`**, not `evaluate()`. Compiled patterns,
factories and clients built per message are pure throughput loss.

## Flows

**Catch and Failure both wired on every input node.**
Catch handles exceptions thrown downstream; Failure handles read/parse errors.
Neither wired means backout, and on MQInput with no backout queue that is an
infinite redelivery loop pinning a flow instance.

**Backout queue and threshold on every MQInput.** `BOTHRESH` on the queue plus a
real backout requeue queue. Check both; the flow property alone is not enough.

**Explicit timeout and wired Failure on every request node.**
`HTTPRequest`, `SOAPRequest`, `RESTRequest`. No timeout means one slow downstream
consumes every flow instance and the flow stops accepting work.

**Transaction mode chosen deliberately.**
Coordinated MQ get plus uncoordinated JDBC write loses data on failure. Either
coordinate both, or make the target idempotent and write down that you did.

**XMLNSC / DFDL / JSON.** Not XMLNS, not plain XML, not MRM.

**Validation at the input node**, not deep in the flow. `validateMaster="none"`
turns a clear boundary rejection into an obscure mid-flow failure.

**Name every node for what it does.** Node labels appear verbatim in exception
lists and monitoring events. `Compute1` at 2am costs real minutes.

## Configuration

Nothing environment-specific may be a literal, anywhere:

queue names · queue managers · hostnames · IPs · ports · URLs · DSNs · file paths
· certificate labels · credentials

Mechanism, in order of preference:
1. **Policy** (MQEndpoint, HTTPEndpoint, JDBCProviders, Workload Management) —
   changeable on a running system.
2. **UDP** + BAR override — `DECLARE X EXTERNAL CHARACTER '';` — needs a
   redeploy but travels with the artifact.
3. Never a literal.

Credentials are separate: `mqsisetdbparms` against a security identity. The flow
carries the identity *name* only. A credential must never appear in ESQL, Java,
flow XML, an override file, or this repository.
