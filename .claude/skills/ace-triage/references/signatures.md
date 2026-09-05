# Failure signatures

Match the symptom, then **confirm with the discriminating evidence** before
calling it. Several of these look identical from the outside.

---

## Messages disappear, no error anywhere

**Looks like:** message consumed off the input queue, nothing downstream, empty
exception list, nothing on the backout queue.

**Usual cause:** a Compute module that falls off the end of `Main()` without
`RETURN TRUE`, or a `PROPAGATE` without `DELETE NONE` followed by more writes to
a now-cleared `OutputRoot`.

**Discriminate:** read the ESQL for the last node reached. User trace shows the
node entered and exited with no propagation.

**Also consider:** a Filter or Route node whose default terminal is unwired —
messages matching nothing are silently discarded.

---

## Poison-message loop / backout queue filling

**Looks like:** the same message reprocessed endlessly, CPU on one flow instance
pinned, log flooded with the same BIP number, or a backout queue growing.

**Usual cause:** an exception thrown downstream with the MQInput **Catch**
terminal unwired, and `BOTHRESH` at 0 so MQ never gives up.

**Discriminate:** `DIS QL(<queue>) BOTHRESH BOQNAME` and check the flow XML for
`sourceTerminalName="catch"`. Both absent confirms it.

**Immediate:** stop the flow — that halts the loop without destroying the
message. **Read a backed-out message before purging anything.**

**Permanent:** wire Catch and Failure, set `BOTHRESH`, create the backout queue.

---

## DataFlowEngine memory grows until the server dies

**Looks like:** RSS climbing steadily under constant load; restart fixes it for a
few days; eventually an abend in `/var/mqsi/common/errors` or AIX kills the
process.

**Usual cause:** `new MbMessage(...)` in a JavaCompute node with no matching
`clearMessage()` in a `finally` block. The Java object is collected; the native
message tree is not.

**Discriminate:** `svmon -P <pid>` at intervals under steady load — steady growth,
not a plateau. Then grep the Java sources: every `new MbMessage` needs a
`clearMessage()` on every path.

**Also consider:** large payloads parked in `Environment`; an ever-growing
`SHARED ROW` cache with no eviction; a third-party library holding references.

---

## Flow stalls — no error, no throughput

**Looks like:** `CURDEPTH` climbing, `IPPROCS` non-zero, no exceptions logged,
CPU low.

**Usual cause:** every flow instance blocked on a downstream call with no
timeout. One slow endpoint consumes the whole instance pool and the flow stops
accepting work.

**Discriminate:** check `requestTimeout` on every HTTPRequest / SOAPRequest /
RESTRequest node, and the additional-instances setting. Low CPU with high queue
depth means blocked, not busy.

**Also consider:** a `BEGIN ATOMIC` block containing a database call — that
serialises every instance by design; and database connection pool exhaustion.

---

## Works in the Toolkit on Windows, fails on AIX

**Looks like:** flows that test clean in the local integration server fail on
first deployment to AIX — `ClassNotFoundException`, a file poll that finds
nothing, a path that does not exist, mangled non-ASCII, or a trailing character
on every parsed record.

**Usual cause, in order:**

1. **Case.** Windows is case-insensitive, AIX is not. A Java package vs its
   directory, a jar name, a schema reference, a File node pattern, or a BAR
   override key whose case does not match — all resolve on Windows and fail on
   AIX. The override case mismatch is the nastiest: no error, it just does not
   apply.
2. **Charset.** Windows default is windows-1252 or UTF-8; the AIX service user's
   locale is often ISO8859-1. Any no-arg `getBytes()` / `new String(byte[])`, or
   an output message built without copying `Properties`, changes behaviour on
   the move.
3. **Line endings in data.** Test data authored on Windows is CRLF; the real
   AIX files are LF. A DFDL separator or a fixed-width record length tuned
   against CRLF test data parses locally and breaks — or silently leaves `\r`
   on the last field.
4. **Paths.** Drive letters, backslashes, UNC.
5. **Permissions.** The ACE service user on AIX is not an administrator; the
   developer on Windows usually is. Output, archive and temp directories must
   exist and be writable by that user.

**Discriminate:** deployment-time failures point at case and paths; runtime data
corruption points at charset and line endings. `ls` the exact path on AIX with
the exact case used in the code — that settles the largest group in one command.

**Also consider:** concurrency. Local debugging runs a single instance, so
`static SimpleDateFormat` and unguarded `SHARED` variables cannot reproduce on
Windows and appear as intermittent wrong data on AIX. **A clean local test is
not evidence of thread safety.**

---

## Works in SIT, fails in PRD

**Looks like:** MQ 2085 (unknown object), connection refused, authentication
failure, or a file path not found — immediately after a promotion.

**Usual cause, in order:** a BAR override that did not apply; a hardcoded literal
that was never overridable; a policy present in one environment and not the
other; a security identity not set with `mqsisetdbparms` on the target.

**Discriminate:** `mqsireadbar -b <deployed bar> -r` and compare against the
override file. This settles it in one command — do it before anything else.

---

## Garbled characters / encoding corruption

**Looks like:** accented or non-ASCII characters mangled downstream; works for
ASCII payloads; often only from one source system.

**Usual cause:** `Properties` folder not copied when building the output message,
so CCSID and encoding are lost. Or Java `getBytes()` / `new String(byte[])` using
the AIX platform default charset.

**Discriminate:** compare `InputRoot.Properties.CodedCharSetId` against the
output, and grep the Java for no-arg charset conversions.

---

## Intermittent wrong data under load, no exceptions

**Looks like:** occasional wrong values, only in production, never reproducible
in a single-instance test.

**Usual cause:** shared mutable state across threads — a `static
SimpleDateFormat` or `static` collection in a JavaCompute node, or a `SHARED`
ESQL variable read-modify-written outside `BEGIN ATOMIC`.

**Discriminate:** does it appear only with additional instances > 1? Set the flow
to a single instance in a test environment; if the corruption stops, it is
concurrency.

Under-diagnosed, because it produces no error — it produces wrong answers.

---

## Database errors under load only

**Looks like:** connection failures or timeouts that appear at volume and clear
when load drops.

**Usual cause:** connections opened with `DriverManager.getConnection()` instead
of `getJDBCType4Connection()` — unpooled, unmanaged, and leaked on exception
paths until the pool or the AIX file-descriptor limit is exhausted.

**Discriminate:** grep the Java for `DriverManager`; check `ulimit -n` for the
ACE service user; watch the descriptor count on the DataFlowEngine process.

---

## Deploy reports success but nothing changed

**Usual cause:** the BAR does not contain what you think. A stale build, a
compiled artifact not refreshed, or an override applied to the wrong BAR.

**Discriminate:** `mqsireadbar -b <bar> -r` and `mqsilist <node> -e <server> -d 2`.
Compare against the source you believe you built. Suspect the build pipeline
before the broker.
