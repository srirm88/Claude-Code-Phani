# Reading an ExceptionList

## Structure

An ExceptionList is a nested tree. Each level is a wrapper added as the exception
travelled up the call stack:

```
ExceptionList
  RecoverableException          <- outermost: the node that caught it. Least useful.
    File, Line, Function, Type, Name, Label, Catalog, Severity, Number, Text
    Insert[1..n]                <- Type + Text, the message inserts
    RecoverableException        <- next level down
      ...
        DatabaseException       <- innermost with a Number: THE ROOT CAUSE
          Number  = 2321
          Text    = 'Database error: ODBC return code ...'
          Insert  = the SQLSTATE, native error, statement
```

**Read the deepest exception that carries a `Number`.** The outer ones tell you
where the failure surfaced; the innermost tells you what actually broke. Going by
the first entry sends you to the wrong node — the most common triage mistake in
ACE.

Fields worth reading at the root level:

| Field | Use |
|---|---|
| `Number` | The BIP message number. Search IBM Docs for the exact one. |
| `Text` | The message text with inserts already substituted. |
| `Label` | **The node that failed** — this is your location. |
| `Insert` | The variable parts: SQL codes, queue names, URLs, field names. |
| `File` / `Line` | Broker source, not yours. Ignore unless raising a PMR. |

Child exception types name the subsystem: `DatabaseException`,
`ParserException`, `ConversionException`, `UserException`, `SocketException`,
`SocketTimeoutException`, `MessageException`, `SqlException`.

## Extract it in code

Do not read this by eye in production. `../ace-build/templates/RootCauseException.esql`
is a reusable ESQL procedure that walks to the deepest exception and returns its
number, text and node label — drop it in your error-handling subflow so every
error record carries the root cause instead of the wrapper.

## BIP number families

Orientation only — confirm the exact meaning from the `Text` field, which
already carries the substituted inserts, or from IBM Docs. Do not guess a
specific number's meaning from memory.

| Range | Area |
|---|---|
| BIP2xxx | Runtime, message flow execution, MQ interaction, database |
| BIP3xxx | Parsers and ESQL execution |
| BIP4xxx | Deployment, administration, configuration |
| BIP5xxx | Message model / MRM / DFDL parsing |
| BIP7xxx | HTTP, SOAP, web services transport |
| BIP8xxx | `mqsi*` command line |
| BIP9xxx | Administration, security, security identities |

**MQ reason codes** appear as inserts inside ACE exceptions and are a different
scheme. Decode them on the box:

```ksh
mqrc 2033
```

Ones you will meet constantly:

| Code | Meaning | Usual cause in ACE |
|---|---|---|
| 2033 | No message available | Normal on a `MQGET` with wait expiry — not an error by itself |
| 2035 | Not authorized | The service user lacks authority on the queue or qmgr |
| 2059 | Queue manager not available | QM down, or wrong QM name in the node/policy |
| 2085 | Unknown object name | Queue does not exist in this environment — an override that did not apply |
| 2080 | Truncated message | Buffer/segmentation issue |
| 2110 | Format error | Message format does not match what the node expects |

2085 in a higher environment after a promotion is almost always a BAR override
that did not apply. Verify with `mqsireadbar -b <bar> -r`, not by assumption.

## Turning an ExceptionList into a question

Once you have the root exception, you have three facts: **which node** (`Label`),
**what subsystem** (exception type), **what specifically** (`Number` + inserts).
Frame the next step from those, not from the symptom the user reported.
