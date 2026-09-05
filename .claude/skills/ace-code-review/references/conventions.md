# Shop conventions — EDIT THIS FILE

Naming and structure standards are shop-specific. This file is the only part of
the skill you are expected to rewrite. Everything below is a placeholder.

**Rule for the reviewer:** only report a convention finding when this file states
the rule. A section still marked `TBD` is not a standard — do not invent one, and
do not report against a guess. Convention findings are LOW unless this file says
otherwise.

---

## Applications and libraries

- Application naming: `TBD`  (e.g. `<DOMAIN>_<SYSTEM>_APP`)
- Shared library naming: `TBD`
- What belongs in a shared library vs an application: `TBD`

## Message flows

- Flow naming: `TBD`  (e.g. `<Source>_To_<Target>_<Function>`)
- Subflow naming: `TBD`
- Node labels: `TBD`  (e.g. verb-first: `Build Order Request`, `Route By Type`)
- One flow per business function? `TBD`

## ESQL

- Module naming: `TBD`  (e.g. `<FlowName>_<NodeLabel>`)
- Schema/broker schema path: `TBD`
- Variable naming (locals, UDPs, SHARED, constants): `TBD`
- Header comment block required? `TBD` — if yes, paste the template here
- Common/utility ESQL location: `TBD`

## Java

- Package naming: `TBD`
- Class naming for JavaCompute nodes: `TBD`
- Where shared jars live: `TBD`

## Queues and topics

- Queue naming: `TBD`  (e.g. `<ENV>.<APP>.<FUNCTION>.<IN|OUT|BO>`)
- Backout queue naming: `TBD`
- Backout threshold standard: `TBD`

## Error handling standard

- Standard error subflow name: `TBD`
- Error queue naming: `TBD`
- Message catalog name and reserved number ranges: `TBD`
- Mandatory fields in an error record: `TBD`

## Configuration

- UDP naming: `TBD`
- Where BAR override files live and how they are named per environment: `TBD`
- Policy projects in use: `TBD`
- Security identity naming: `TBD`

## Logging

- Levels and when to use each: `TBD`
- Correlation identifier field and how it is propagated: `TBD`
- What must never be logged (PII, payloads, credentials): `TBD`

## Repository layout

```
TBD — paste the expected directory structure here
```

## Deployment

- Target ACE version: 12.0.12.26
- Target MQ version: 9.3.0.35
- Target OS: AIX 7.3
- BAR build command in use: `TBD`
- Anything that must never be committed: `TBD`
