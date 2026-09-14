---
name: nginx-review
description: Configure, review, or troubleshoot NGINX acting as an API gateway on RHEL 9, typically in a DMZ, in front of IBM App Connect Enterprise and IBM MQ. Use when asked to write or set up an NGINX config, add or onboard an API route or upstream, harden or secure a gateway, review or audit nginx.conf, check a gateway before go-live, or fix an NGINX problem — 502, 504, 413, 400, connection refused, TLS or client-certificate handshake failures, SELinux denials, permission denied, slow responses, dropped connections, upstream not resolving, or certificate expiry. Covers RHEL 9 specifics — SELinux booleans, firewalld, systemd limits, system-wide crypto policy — and DMZ constraints such as no outbound egress, internal DNS, and manual certificate renewal.
---

# NGINX API gateway — configure, review, fix

Platform: **NGINX on RHEL 9, in the DMZ**, acting as API gateway for **IBM App
Connect Enterprise 12.0.12.26 and IBM MQ 9.3.0.35 on AIX 7.3** in the internal
zone.

That zone split is the defining constraint. The gateway is the trust boundary:
it is the only component that knows who the caller really is, everything behind
it trusts what it says, and every hop from DMZ to internal tier is an explicit
firewall rule that someone has to have opened.

## Scope rule — asymmetric, and not negotiable

**NGINX in scope means ACE and MQ are in scope, automatically.** The gateway
never stands alone. Its three most important settings are only correct
*relative* to what sits behind them, so a gateway change made without those
numbers is a guess:

| Gateway setting | Correct only relative to |
|---|---|
| `proxy_read_timeout` | the ACE flow's total budget, including every downstream call it makes |
| `proxy_next_upstream` | whether the operation is idempotent — if not, a retry is a duplicate MQ put |
| `client_max_body_size` | the ACE parser limit **and** MQ `MAXMSGL` on the queue and the queue manager |

So before finishing any configure, review or fix, establish:

1. The ACE flow's timeout budget and its downstream `requestTimeout` values.
2. Whether the route is idempotent, and what carries the idempotency key.
3. `MAXMSGL` on every queue in the path, and on the queue manager.
4. Which ACE integration servers and ports, and whether the flows are actually
   running — not just whether the port answers.
5. Whether ACE reads `X-Request-ID` and carries it onto the MQMD.

Ask for what you do not have. A gateway review that never mentions the flow
budget or `MAXMSGL` has not been done.

The reverse does **not** hold: work scoped to ACE or MQ alone does not pull in
the gateway. See the scope rule in those skills.

---

Three modes. Decide which one the request is, and say so in one line before
starting — they have different outputs and mixing them produces a document that
does neither job.

| The ask | Mode | Output |
|---|---|---|
| "set this up", "add a route", "harden it" | **Configure** | a config change, with the reasoning |
| "review this", "is it ready", "audit it" | **Review** | prioritised findings and a verdict |
| "it's returning 502", "handshake fails" | **Fix** | root cause, evidence, then a change |

Two rules apply in every mode:

- **Never recommend a change to a running DMZ gateway without saying what it
  costs.** A reload drops nothing; a restart drops in-flight connections; an
  SELinux boolean is system-wide; a firewall change needs a change record.
- **`nginx -t` before every reload, always.** A gateway that fails to start
  after a config error is an outage, and in a DMZ you may not have console
  access to recover quickly.

---

## Mode: CONFIGURE

### 1. Get the facts before writing config

- Route: hostname, path, method(s). Public, partner, or internal caller?
- Upstream: which ACE integration servers, which ports, HTTP or HTTPS.
- Authentication: TLS only, mutual TLS, an API key, a JWT? Who validates it —
  the gateway or ACE?
- Payload size, expected rate, and the **ACE flow's own timeout budget**.
- Idempotent or not. This decides `proxy_next_upstream`, and getting it wrong
  produces duplicate transactions rather than an error.

If the timeout budget is unknown, that is a blocking question — see
`references/gateway-config.md`. Everything else you can assume and state.

### 2. Start from the baseline

`templates/api-gateway.conf` is a known-good starting point for an ACE upstream
on RHEL 9 in a DMZ: TLS, trust boundary headers, limits, timeouts, error
mapping, correlation id, catch-all host block. Adapt it; do not write from
memory.

### 3. Cover the platform, not just the config file

A correct `nginx.conf` still fails on RHEL 9 if the host is not prepared:
SELinux booleans, firewalld, systemd limits, crypto policy, DNS and egress.
See `references/rhel9-dmz.md`. State the host-level steps alongside the config
change, because whoever applies one usually forgets the other.

### 4. Validate

```sh
nginx -t                              # syntax, before anything else
nginx -T > /tmp/effective.conf        # what the server will actually run
sh scripts/nginx-prescan.sh /tmp/effective.conf
sh scripts/rhel9-gateway-check.sh     # host readiness; read-only
systemctl reload nginx                # only after nginx -t passes
```

---

## Mode: REVIEW

### 1. Get the effective configuration

```sh
nginx -T > effective.conf
```

**Review that, not individual files.** Directives inherit down `http` →
`server` → `location`; a single `.conf` tells you almost nothing about the
effective value for a route. A review based on one file will produce false
findings, and the first one a gateway engineer disproves is the one that gets
the whole review ignored.

### 2. Scan, then read

```sh
sh scripts/nginx-prescan.sh effective.conf
```

`SEVERITY|RULE|path:line|message`. **Candidates, not findings** — confirm the
effective value before reporting. Then read against:

| Area | Reference |
|---|---|
| TLS, headers, limits, upstreams, timeouts, error mapping | `references/gateway-config.md` |
| SELinux, firewalld, systemd, crypto policy, DMZ constraints | `references/rhel9-dmz.md` |

Run `scripts/rhel9-gateway-check.sh` on the host too. Half of what makes a
gateway fail is not in the config file.

### 3. Report

```
[SEVERITY] server/location or host-level     (RULE-ID if from the scan)
What is wrong: one sentence.
How it fails:  the concrete scenario, with the numbers.
Fix:           the exact directive and value, or the exact command.
Cost:          reload / restart / firewall change / system-wide.
```

- **HIGH** — an unauthenticated path, trusting a caller-supplied identity
  header, duplicate transactions from retry, internal detail leaking to
  clients, an outage mode with no backpressure, or an expiring certificate.
- **MEDIUM** — a real defect with bounded blast radius.
- **LOW** — hygiene.

Close with a verdict: safe to go live, and the one thing to change first.

For anything spanning ACE or MQ — the timeout cascade end to end, the HTTP-to-MQ
transaction boundary, idempotency — use the `integration-review` skill. This one
stops at the gateway.

---

## Mode: FIX

Diagnose before you change anything. A speculative `systemctl restart` on a DMZ
gateway drops live connections and destroys the evidence.

### 1. Get the symptom exactly

Status code, or the exact error text. "It's broken" is not a symptom; `502 Bad
Gateway`, or `SSL_do_handshake() failed`, is. Then: every request or some? Since
when? What changed — a deploy, a certificate, a firewall rule, a patch?

### 2. Read the error log first

```sh
tail -100 /var/log/nginx/error.log
journalctl -u nginx --since '1 hour ago' -p err --no-pager
```

NGINX error logs are unusually good. The upstream error, the SELinux permission
denial, the certificate problem — the answer is usually literally in there.

### 3. Match the symptom

`references/troubleshooting.md` maps each symptom to its usual causes and, for
each, the one command that confirms or kills it. Work it in that order rather
than changing settings hopefully.

### 4. Then fix, and say what it costs

Name the root cause and the evidence for it before proposing the change. If two
causes remain, say so and give the command that separates them — a confident
wrong diagnosis on a DMZ gateway costs a change window.

---

## What you cannot verify

You are reading configuration and pasted output, not a running gateway. You
cannot see the effective merged config unless you are given `nginx -T`, the live
SELinux and firewall state, real certificate chains as clients see them, or
actual latency. Say which findings are inference and name the command that
settles each.
