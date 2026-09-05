# Gateway review (NGINX)

Applies when a gateway fronts the flows. Skip for MQ-, file- or
schedule-triggered projects.

NGINX directives inherit down `http` → `server` → `location`. **Always review
the effective merged configuration**, not one file:

```sh
nginx -t          # syntax
nginx -T          # the full effective config, all includes resolved
```

A finding based on a single `.conf` file is unverified until you have seen
`nginx -T`.

## Trust boundary — the security core

The gateway is the only place that knows who the caller really is. Everything
after it trusts what the gateway says.

- **Never forward a client-supplied header as identity.**
  `proxy_set_header X-Client-Cert $http_x_client_cert;` takes a header the
  caller controls and hands it to ACE as fact. Any caller can set it. Identity
  headers must be *overwritten* from NGINX variables
  (`$ssl_client_escaped_cert`, `$ssl_client_s_dn`, `$remote_addr`), never passed
  through.
- **Strip inbound `X-Forwarded-*`** before setting your own, for the same
  reason.
- `underscores_in_headers on` allows `X_Client_Cert` and `X-Client-Cert` to be
  treated differently — header smuggling. Leave it off.
- If ACE authorises on any header, confirm ACE is **not reachable except through
  the gateway.** A gateway that authenticates while the ACE HTTP listener is
  open on the network is decoration. Check the AIX side: listener bind address
  and firewall, not just the NGINX config.

## TLS

- `ssl_protocols TLSv1.2 TLSv1.3;` — anything older is a finding.
- Client certificates: `ssl_verify_client on` and `ssl_client_certificate`
  pointing at the right CA. `optional` is frequently a mistake, because the flow
  then has to handle both cases and usually does not.
- Re-encryption to ACE: if `proxy_pass https://`, then `proxy_ssl_verify on` with
  a trusted CA. `proxy_ssl_verify off` means the hop is encrypted but
  unauthenticated — anything that can answer that address is trusted.
- Certificate expiry belongs on the promotion checklist. It is the single most
  common self-inflicted outage in a gateway-fronted stack.

## Limits — three tiers that must agree

Payload size is capped in three places, and they must be consistent and ordered
so that rejection happens at the **edge**, before work is done:

```
client_max_body_size  (NGINX)   <=  ACE parser / message size limit
                                <=  MQ MAXMSGL on every queue in the path
```

If NGINX accepts 100MB, ACE parses it, and MQ `MAXMSGL` is 4MB, the failure
arrives after the entire cost has been paid. Check `MAXMSGL` on the queue *and*
the queue manager — the effective limit is the lower.

`client_max_body_size` defaults to 1m, which surprises people in the other
direction: legitimate payloads rejected with 413 and no useful log line.

## Error mapping and leakage

- `proxy_intercept_errors on` plus explicit `error_page` handling. Without it,
  the ACE error body goes to the client verbatim — BIP numbers, node labels,
  queue names, sometimes stack traces. That is both an information leak and a
  useless client experience.
- Decide and document the mapping: downstream down → 502 or 503 with
  `Retry-After`; timeout → 504; payload too large → 413; unauthorised → 401 or
  403 without revealing which. Silence here means whatever ACE happens to emit.
- `server_tokens off;`.

## Upstreams and health

- A TCP-only health check is not a health check. An ACE integration server
  accepts connections while its flows are stopped, so NGINX keeps routing to a
  broken node. Point the check at an endpoint that exercises the flow path.
- Passive checks (`max_fails`, `fail_timeout`) are what open-source NGINX gives
  you; `health_check` is NGINX Plus. Confirm which you have before recommending.
- More than one upstream server, or state clearly that there is no failover.
- Named `upstream` blocks rather than `proxy_pass` to a literal host or IP — the
  target is environment-specific configuration, not part of the route.

## Backpressure

`limit_req` and `limit_conn` protect ACE from a client burst. ACE serves
requests from a fixed pool of flow instances; without a limit at the edge, a
burst consumes the pool and every other interface on that integration server
degrades with it.

Returning 429 or 503 with `Retry-After` at the gateway is a far better outcome
than a timeout, for both sides.
