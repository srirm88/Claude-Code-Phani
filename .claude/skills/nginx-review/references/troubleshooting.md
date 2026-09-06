# Troubleshooting

Match the symptom, then run **the one command that confirms or kills** the
hypothesis. Read `/var/log/nginx/error.log` first in every case — NGINX error
messages are unusually specific and the answer is often literally in there.

Before changing anything on a live DMZ gateway, say what it costs: `reload`
drops nothing, `restart` drops in-flight connections, an SELinux boolean is
system-wide, a firewall change needs a record.

---

## 502 Bad Gateway

Read the error log and match the parenthesised errno — it separates the three
causes immediately.

| Error log says | Cause | Confirm |
|---|---|---|
| `(13: Permission denied)` | **SELinux** blocking the outbound connect | `getsebool httpd_can_network_connect` |
| `(111: Connection refused)` | ACE listener down, or wrong port | `timeout 3 bash -c 'exec 3<>/dev/tcp/<host>/7800'` |
| `(110: Connection timed out)` | Firewall between DMZ and the AIX tier | same test; timeout rather than refusal means filtered |
| `no live upstreams` | all servers marked down by `max_fails` | `journalctl -u nginx` for the preceding failures |
| `upstream sent invalid header` | ACE returning something non-HTTP | look at the flow's HTTPReply, not the gateway |

`13: Permission denied` is SELinux until proven otherwise. `setsebool -P
httpd_can_network_connect 1` — never `setenforce 0`.

If it resolves but does not connect, check DNS separately: hostnames in an
`upstream` block are resolved **once at startup**, so a changed ACE address
needs a reload before traffic recovers.

---

## 504 Gateway Timeout

The gateway gave up while ACE was still working. **This is not just a gateway
problem** — the flow usually completed and committed its MQ put, so the client
sees failure while the work happened. If the client retries, you have duplicate
transactions.

```sh
grep 'upstream timed out' /var/log/nginx/error.log | tail
```

Compare `proxy_read_timeout` against the ACE flow's real budget, including every
downstream call it makes. The gateway must wait **longer** than everything
beneath it. Then check `proxy_next_upstream` — if it includes `timeout`, NGINX
also re-sent the request to the second integration server, doubling the effect.

Raising the timeout treats the symptom. Ask why the flow is slow (`ace-triage`),
and fix the retry behaviour regardless.

---

## 400 Bad Request / 413 / 414

- **413** — payload exceeds `client_max_body_size` (default **1m**). Confirm the
  new value against the ACE parser limit and MQ `MAXMSGL` before raising it, or
  you have moved the failure downstream rather than fixed it.
- **400 with a client certificate** — verification failed. `ssl_verify_client`,
  the CA bundle, `ssl_verify_depth`, and on RHEL 9 the **system crypto policy**,
  which rejects SHA-1 signed certificates under `DEFAULT` and will refuse a
  partner certificate that worked on RHEL 8.
- **400 on large headers** — raise `large_client_header_buffers`; common with
  large JWTs.

---

## TLS handshake failures

```sh
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null
update-crypto-policies --show
```

- Missing intermediate: works in a browser (which caches it), fails for Java and
  curl clients. `openssl s_client` shows the chain the server actually sends.
- Protocol or cipher mismatch: the RHEL 9 crypto policy constrains this
  independently of `ssl_protocols`. Check the policy before editing nginx.
- Client certificate rejected: verify the chain and, on RHEL 9, the signature
  algorithm.
- SNI: `-servername` matters when several server blocks share an address.

---

## Slow, but no errors

```sh
awk '{print $NF}' /var/log/nginx/gateway.log | sort -n | tail    # if urt is last
```

Compare `$upstream_response_time` with `$request_time`:

- **urt high, rt ≈ urt** → ACE is slow. Gateway is fine; go to `ace-triage`.
- **rt >> urt** → the time is at the gateway: TLS handshakes (no
  `ssl_session_cache`), rate limiting, DNS, or client-side slowness.
- **Both low but clients complain** → look between the client and the DMZ, not
  here.

If neither field is in your log format, add `$upstream_response_time` before
theorising further.

---

## Dropped connections under load

`worker_connections` is capped by the process file-descriptor limit.

```sh
systemctl show nginx -p LimitNOFILE --value
nginx -T | grep -E 'worker_connections|worker_rlimit_nofile'
```

Set high in nginx and low in systemd, the shortfall shows as dropped connections
with nothing obvious logged. Raise both together.

Also check `keepalive` on the upstream — without it, every request opens a new
TCP connection across the zone boundary, which can exhaust ephemeral ports or
trip a firewall connection-rate limit.

---

## Config change did not take effect

```sh
nginx -t && systemctl reload nginx
nginx -T | grep -n '<the directive>'
```

Three usual causes: the file is not included by `nginx.conf`; a more specific
`location` or `server` block overrides it; or the reload silently failed and the
old workers are still serving. `nginx -T` is the arbiter — it shows what the
server will actually run, and disagreements with the file you edited are the
answer.

---

## Certificate expired

In a DMZ there is no ACME renewal, so this is always a manual task that someone
did not calendar.

```sh
for c in $(nginx -T 2>/dev/null | awk '/ssl_certificate /{print $2}' | tr -d ';' | sort -u); do
    printf '%s ' "$c"; openssl x509 -in "$c" -noout -enddate
done
```

Replace, `nginx -t`, then **reload** — a restart is not needed and drops
in-flight connections. Then set a calendar reminder at 30 days for the next one;
`scripts/rhel9-gateway-check.sh` will flag it if run regularly.
