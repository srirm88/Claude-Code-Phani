# Gateway configuration decisions

Gateway-internal depth. For anything that spans tiers — the end-to-end timeout
budget, the HTTP-to-MQ transaction boundary, idempotency across the stack — use
the `integration-review` skill; this file stops at the gateway.

## Trust boundary

The gateway is the only component that knows who the caller is. Everything
behind it, across the zone boundary into the AIX tier, trusts what it says.

**Overwrite identity headers, never forward them.**

```nginx
proxy_set_header X-Client-DN     $ssl_client_s_dn;      # from the TLS session
proxy_set_header X-Client-Verify $ssl_client_verify;
proxy_set_header X-Real-IP       $remote_addr;
```

`proxy_set_header X-Client-DN $http_x_client_dn;` takes a header the **caller
controls** and hands it to ACE as fact. Any caller can set it. If ACE authorises
on that header, that single line is an authentication bypass.

Set every identity header explicitly even when you think nothing sends it —
absent a `proxy_set_header`, the client's version is forwarded unchanged.

`underscores_in_headers` stays off: on, `X_Client_DN` and `X-Client-DN` become
separately addressable, which is a smuggling primitive.

**Network-level check that outranks the config:** confirm the ACE HTTP listeners
on AIX are not reachable except through the gateway. A gateway that authenticates
while port 7800 is open from the wider network is decoration. That is a firewall
and listener-bind question on the AIX side, not an nginx one.

## TLS and mutual TLS

- `ssl_protocols TLSv1.2 TLSv1.3;` — and remember RHEL 9's system-wide crypto
  policy constrains this independently. See `rhel9-dmz.md`.
- `ssl_verify_client on` for partner APIs. **`optional` is usually a mistake**:
  it defers the decision to ACE, which then has to handle both the verified and
  unverified case and generally does not. Decide at the edge.
- `ssl_verify_depth` matched to the real chain depth.
- Re-encrypting to ACE (`proxy_pass https://`) requires `proxy_ssl_verify on`
  with a trusted CA. Off means the hop is encrypted but unauthenticated —
  anything that can answer that address is trusted.
- `ssl_session_cache shared:SSL:20m;` — without it every connection pays a full
  handshake, which is the dominant CPU cost on a TLS-terminating gateway.

## Limits

Payload size is capped in three places and they must agree, ordered so
rejection happens at the **edge** before work is done:

```
client_max_body_size  (NGINX)  <=  ACE parser limit  <=  MQ MAXMSGL
```

Accept 100MB at the gateway with `MAXMSGL` at 4MB and the failure arrives after
the payload has crossed the zone boundary, been parsed and transformed. Check
`MAXMSGL` on the queue *and* the queue manager; the effective limit is the
lower.

`client_max_body_size` defaults to **1m**, which surprises people the other way:
legitimate payloads rejected with 413 and a thin log line.

Also set `client_body_timeout` and `client_header_timeout`. Without them a slow
client holds a worker connection.

## Upstreams

- Named `upstream` blocks, never `proxy_pass` to a literal host or IP. The
  target is environment-specific configuration, not part of the route.
- `max_fails` / `fail_timeout` are the passive health check in open-source
  NGINX. `health_check` is NGINX Plus — confirm which you have before
  recommending it.
- **A TCP connect is not a health check.** An ACE integration server accepts
  connections while its flows are stopped, so the gateway keeps routing to a
  node that answers and does nothing. Point the check at something that
  exercises the flow path.
- `keepalive` in the upstream block plus `proxy_http_version 1.1` and
  `proxy_set_header Connection "";` — otherwise every request builds a new TCP
  connection across the zone boundary, and the firewall sees a connection storm.
- More than one server, or state plainly that there is no failover.

## Retries — the duplicate-transaction control

`proxy_next_upstream` **defaults to `error timeout`**. A slow ACE flow is
re-sent to the second integration server; both complete, both put to MQ. One
client request, two messages, no error logged anywhere.

```nginx
proxy_next_upstream off;              # anything not idempotent
proxy_next_upstream error;            # acceptable: connection-level only
```

Never include `timeout` or `non_idempotent` on a route that writes. Decide this
per location, not globally — a GET route and a POST route want different
answers.

## Error mapping

```nginx
proxy_intercept_errors on;
error_page 500 502 503 504 = @gw_error;
```

Without it the ACE error body reaches the client verbatim: BIP numbers, node
labels, queue names, sometimes a stack trace. That is an information leak about
the internal zone and a useless client experience at the same time.

Decide and document the mapping: upstream down → 503 with `Retry-After`;
timeout → 504; oversized → 413; unauthorised → 401 or 403 without revealing
which. Include `$request_id` in the error body so a caller reporting a failure
gives you the key to find it.

## Rate limiting

`limit_req` and `limit_conn` protect ACE, whose flow instances are a fixed pool.
Without a limit at the edge, one client's burst consumes the pool and every
other interface on that integration server degrades with it.

429 or 503 with `Retry-After` is a better outcome for both sides than a timeout —
and it does not trigger the client's own retry storm the way a timeout does.

## Logging

```nginx
log_format gw escape=json
  '$time_iso8601 $request_id $remote_addr "$request" $status '
  'rt=$request_time urt=$upstream_response_time ua=$upstream_addr us=$upstream_status';
```

`$upstream_response_time` beside `$request_time` is the field that answers "was
it the gateway or ACE" — the first question in every performance incident, and
unanswerable without it. `$upstream_addr` tells you *which* integration server,
which matters the moment one misbehaves.

`$request_id` must be propagated to ACE (`proxy_set_header X-Request-ID
$request_id;`), read there, and carried onto the MQMD. A correlation id that
stops at the gateway does not correlate anything.

`access_log off` on a DMZ host is an audit finding.
