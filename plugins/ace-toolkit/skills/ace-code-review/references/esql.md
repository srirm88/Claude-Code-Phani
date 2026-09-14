# ESQL review reference

## Exception handling and the error path

- **Every Compute/Filter/Database module needs a deliberate failure story.**
  Either it handles the error locally (`DECLARE ... CONTINUE|EXIT HANDLER`) or it
  lets the exception reach the node's Failure/Catch terminal — and something must
  be wired there. Unhandled and unwired means a backed-out message and, on an
  MQInput with no backout queue, a poison loop that pins a thread.
- **`THROW USER EXCEPTION` must carry a catalog and message number**, not just
  free text: `THROW USER EXCEPTION CATALOG 'ACMEmsgs' MESSAGE 3001 SEVERITY 3
  VALUES(orderId, sqlcode)`. Free-text-only exceptions cannot be keyed on by
  monitoring and show up as BIP2952 noise in the AIX syslog.
- **Handlers that swallow.** A `CONTINUE HANDLER` with an empty body silently
  discards the failure. If it is deliberate, it needs a comment saying why and a
  `LOG EVENT`. If it is not, it is a HIGH.
- **Do not lose the original exception.** When re-throwing, carry the inbound
  `ExceptionList` detail into the new exception's inserts, or the root cause is
  gone by the time it reaches the error queue.
- **`SQLCODE` / `SQLSTATE` after a database call**: a DatabaseException is thrown
  automatically only when the node's Throw Exception On Database Error is on.
  If it is off, unchecked `SQLCODE` means silent data loss.

## Message tree

- **`RETURN TRUE` vs `RETURN FALSE`.** A Compute `Main()` that ends without an
  explicit `RETURN TRUE` does not propagate. Missing propagation is the single
  most common "message vanished" ticket.
- **`PROPAGATE` semantics.** After an explicit `PROPAGATE`, `OutputRoot` is
  cleared unless `DELETE NONE` is specified. Code that propagates in a loop and
  then keeps writing to `OutputRoot` without `DELETE NONE` is building an empty
  message.
- **Compute Mode.** If the node's Compute Mode already copies the message,
  `SET OutputRoot = InputRoot` duplicates the whole tree for nothing. On large
  payloads this is measurable heap and CPU per message.
- **`Properties` folder.** Building an output message without copying
  `InputRoot.Properties` loses CCSID, encoding and the message domain — the
  downstream parser then guesses, and on AIX the guess is usually wrong for
  anything non-ASCII.
- **REFERENCE navigation.** Every `MOVE ref NEXTSIBLING|FIRSTCHILD` must be
  guarded by `LASTMOVE(ref)`. Without it, the reference silently points at the
  wrong element and the flow processes garbage rather than failing.
- **`Environment` vs `LocalEnvironment`.** `Environment` survives the whole
  message's journey through the flow; anything large parked there stays resident
  for the message lifetime. `LocalEnvironment` is the right place for routing
  data. Neither is shared between messages — code that assumes it is, is wrong.

## Concurrency

- **`SHARED` variables are cross-thread state.** With additional instances, a
  read-modify-write on a `SHARED ROW` or `SHARED` scalar outside a `BEGIN ATOMIC`
  block is a race. Cache-warming code (`IF cache IS NULL THEN load...`) is the
  usual offender: several instances load simultaneously and one wins.
- `BEGIN ATOMIC` serialises all instances for its duration. A database read
  inside an ATOMIC block turns the flow single-threaded — correct, but a
  throughput cliff worth calling out.

## SQL and injection

- **`PASSTHRU` with `||` concatenation is SQL injection.** Use the parameterised
  form: `PASSTHRU('SELECT * FROM ORDERS WHERE ID = ?' VALUES(orderId))`, or a
  broker `SELECT ... FROM Database.SCHEMA.TABLE`.
- **`EVAL()`** builds and runs ESQL at runtime. No compile-time checking, an
  injection surface, and it defeats every static review. Flag it and ask what it
  is for; there is almost always a data-driven alternative.
- **Hardcoded DSN** — `Database.{'PRODDS'}` pins the flow to one environment.
  Use a UDP or the node's configured datasource.

## Environment coupling

Anything below must come from a UDP (`DECLARE X EXTERNAL CHARACTER '';`, set via
BAR override), a policy, or a configurable service — never a literal:

queue names · queue manager names · hostnames · IP addresses · ports · URLs ·
DSN / database names · file paths and directories · credentials of any kind ·
certificate labels and aliases.

UDPs are the mechanism because `mqsiapplybaroverride` can change them per
environment without a rebuild. A literal cannot be overridden at all.

## Performance

- `CARDINALITY(...)` inside a `WHILE` condition is recomputed every iteration.
  Hoist it.
- Repeated `SET Out.a.b.c[i]` path navigation inside a loop re-walks the tree
  from the root each time. Use a `REFERENCE` and `CREATE LASTCHILD OF ref`.
- `CAST` to `TIMESTAMP`/`DATE`/`TIME` without an explicit `FORMAT` depends on
  locale defaults; the AIX broker locale and the developer's workstation locale
  are rarely the same. Always specify `FORMAT`.
- Row-at-a-time database access inside a loop: one round trip per row. Consider a
  set-based `SELECT` or a stored procedure.
- Tracing left on (`LOG EVENT` at debug level, or a Trace node) costs on every
  message, not just when someone is looking.
