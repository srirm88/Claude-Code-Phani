# Per-environment BAR overrides

The same BAR is promoted through every environment. Only the override file
changes. If a value cannot be overridden, the design is wrong — go back and make
it a UDP or drive it from a policy.

## Find out what is actually overridable

Do not guess the property keys. Ask the BAR:

```sh
mqsireadbar -b OrderApp.bar -r
```

That reports every overridable property with its exact key. Build the override
file from those keys verbatim — a key that does not match is silently ignored by
some ACE levels, which is how a flow reaches PRD still pointing at SIT.

## Apply

```sh
mqsiapplybaroverride -b OrderApp.bar -k OrderApp -p uat.properties -o OrderApp_UAT.bar
```

Then verify the result, every time:

```sh
mqsireadbar -b OrderApp_UAT.bar -r | grep -i -E 'queue|url|host|dsn'
```

Verification is the point. An override that did not apply produces no error.

## Shape of the properties file

One key per line, `#` for comments. Values are literal — no shell expansion.

```
# ---- UAT ----------------------------------------------------------------
# node property overrides
Order_To_Sap#MQInput.queueName=UAT.ORDER.IN
Order_To_Sap#MQInput.backoutRequeueQueue=UAT.ORDER.IN.BO
Order_To_Sap#HTTPRequest.requestTimeout=30

# user-defined property overrides
Order_To_Sap#TARGET_QUEUE=UAT.SAP.ORDER.OUT
```

## Rules

- **Never put a credential in an override file.** Credentials go in
  `mqsisetdbparms` against a security identity name; the flow references the
  identity, and the identity name is the only thing that appears in source.
- One override file per environment, committed alongside the source, named so it
  is obvious which environment it targets.
- Diff the override files between environments before a promotion. A key present
  in SIT and missing in PRD is the defect you are looking for.
- Prefer a **policy** over an override where a policy exists (MQEndpoint,
  HTTPEndpoint, JDBCProviders, Workload Management): a policy changes on a
  running system, an override needs a redeploy.
