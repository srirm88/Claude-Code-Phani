# JavaCompute / user-defined node Java review reference

## Message tree lifecycle — the leak that kills DataFlowEngine

The mandatory shape for a JavaCompute node that creates an output message:

```java
public void evaluate(MbMessageAssembly inAssembly) throws MbException {
    MbMessage inMessage  = inAssembly.getMessage();
    MbMessage outMessage = new MbMessage(inMessage);
    MbMessageAssembly outAssembly =
        new MbMessageAssembly(inAssembly, outMessage);
    try {
        // ... build the message ...
        getOutputTerminal("out").propagate(outAssembly);
    } finally {
        outMessage.clearMessage();          // NOT optional
    }
}
```

- **`new MbMessage(...)` without a matching `clearMessage()` leaks native
  memory.** The Java object is garbage collected; the underlying broker message
  tree is not. Under sustained load this grows the DataFlowEngine process until
  AIX kills it or the JVM heap is exhausted. HIGH, every time.
- **`clearMessage()` outside a `finally`** is the same defect with extra steps —
  any exception on the build path skips it.
- Do not call `clearMessage()` on the *input* message. That one belongs to the
  broker.

## Errors

- **Broad `catch (Exception e)` that logs and returns** swallows the failure: the
  message is treated as processed, and it is gone. Rethrow as `MbUserException`
  with real context:
  `throw new MbUserException(this, "evaluate()", "ACMEmsgs", "3001",
   e.toString(), new Object[]{orderId});`
- `printStackTrace()` and `System.out.println` go to stdout, which on AIX ends up
  in the integration server's stdout file or nowhere at all. Use
  `MbService.logInformation/logWarning/logError` so it reaches the syslog with a
  message number.
- Catching `MbException` and converting it to a return code loses the Failure
  terminal path entirely.

## Concurrency

Additional instances run the *same class instance* on multiple threads.

- **Mutable static fields are shared state.** `static SimpleDateFormat`,
  `static HashMap`, `static StringBuilder` — all unsafe. `SimpleDateFormat` in
  particular corrupts output silently rather than throwing.
- **Instance fields on the node class are also shared** across threads for the
  same node. Anything per-message belongs in a local variable inside
  `evaluate()`.
- Acceptable statics: immutable constants, thread-safe singletons, and
  `ThreadLocal` wrappers.

## Database and resources

- **Never `DriverManager.getConnection()`.** Use
  `getJDBCType4Connection(dsnName, JDBC_TransactionType.MB_TRANSACTION_AUTO)`.
  A raw connection does not join the broker transaction, is not pooled, is not
  managed on shutdown, and will leak file descriptors on AIX.
- Do not close a broker-supplied JDBC connection yourself; the broker owns it.
- Streams, readers and anything else you open yourself needs try-with-resources.

## Configuration and encoding

- Read configuration with `getUserDefinedAttribute("name")` so it is
  BAR-overridable. Hardcoded URLs, JDBC strings, hosts and ports are the same
  promotion defect as in ESQL.
- **Charset**: `String.getBytes()` and `new String(byte[])` use the platform
  default. On AIX 7.3 that is often ISO8859-1, and it differs from the container
  or workstation where the code was written. Always pass an explicit charset, and
  prefer taking the CCSID from the message `Properties` rather than assuming.
- Per-message object churn (compiling a regex, building an XML parser factory,
  constructing a client) belongs in `onInitialize()` or a thread-safe cache, not
  in `evaluate()`.

## Class loading

- Third-party jars belong in the shared-classes directory or a Java project
  referenced by the application — not duplicated per application, which causes
  hard-to-diagnose `ClassCastException` across class loaders.
- Static initialisers that touch the network or filesystem run at deploy time and
  can fail the deploy itself.
