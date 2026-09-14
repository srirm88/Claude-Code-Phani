# RHEL 9 and DMZ specifics

A correct `nginx.conf` still fails if the host is not prepared. On RHEL 9 in a
DMZ, most "NGINX is broken" tickets are one of the items below, not a directive.

## SELinux — the first thing to check on any 502

SELinux is **Enforcing** by default on RHEL 9, and it blocks NGINX from opening
outbound connections until you say otherwise.

```sh
getenforce
getsebool httpd_can_network_connect
```

If that boolean is off, every proxied request fails with `502 Bad Gateway`, and
the nginx error log says **`connect() to ... failed (13: Permission denied)`**.
The config is correct; the platform is refusing. `13: Permission denied` on a
connect is SELinux until proven otherwise — a plain firewall block gives
`110: Connection timed out` or `111: Connection refused` instead.

```sh
setsebool -P httpd_can_network_connect 1      # -P survives reboot
```

Other SELinux items that bite:

- **Non-standard listen ports.** Binding 8443 or similar needs the port
  labelled: `semanage port -a -t http_port_t -p tcp 8443` (use `-m` if the port
  is already labelled for something else).
- **Certificates or logs outside the default paths.** A cert in `/opt/...` is
  unreadable by the nginx process until relabelled: `restorecon -Rv <path>`, or
  a `semanage fcontext` rule for a permanent custom location.
- **Diagnosing anything else:** `ausearch -m AVC -ts recent -c nginx | audit2why`
  tells you exactly what was denied and which boolean or rule would allow it.

Never recommend `setenforce 0` as a fix. It proves SELinux is the cause and
nothing else, it is not permitted on most DMZ hosts, and it will end up in a
change record as a permanent regression.

## System-wide crypto policy

RHEL 9 enforces a system-wide crypto policy that **overrides what nginx asks
for**. You can set `ssl_protocols TLSv1.2 TLSv1.3;` and still have handshakes
rejected, because the policy is stricter.

```sh
update-crypto-policies --show
```

- `DEFAULT` — RHEL 9's default. Blocks TLS below 1.2 **and rejects SHA-1 signed
  certificates**. That second one catches people out: an older partner client
  certificate that worked on RHEL 8 is refused on RHEL 9, and the nginx error
  is not obviously about the signature algorithm.
- `LEGACY` — permits obsolete algorithms. A finding on a DMZ host; if it is set,
  ask what forced it, because it is usually one partner who needs to upgrade.
- `FUTURE` / `FIPS` — stricter still. Verify every client *and* every upstream
  certificate still negotiates before going live.

When a handshake fails and the nginx config looks right, check the policy before
anything else.

## firewalld and the zone boundary

Two separate directions, and both are somebody's change request:

```sh
firewall-cmd --list-all                       # what is open inbound
firewall-cmd --add-service=https --permanent  # inbound from clients
firewall-cmd --reload
```

**Egress from the DMZ to the internal AIX tier is the one people forget.** The
gateway must reach each ACE integration server's HTTP listener port. That rule
lives on the network firewall between zones, not in firewalld, and no amount of
nginx configuration substitutes for it.

Prove reachability from the gateway host itself, not from your laptop:

```sh
timeout 3 bash -c 'exec 3<>/dev/tcp/ace01.internal/7800' && echo reachable
```

## DNS in the DMZ

DMZ hosts often use a restricted internal resolver, and this interacts with
NGINX in a way that surprises people:

- **Hostnames in an `upstream` block are resolved once, at startup.** If an ACE
  server's address changes, the gateway keeps using the old one until it is
  reloaded. Traffic does not recover on its own.
- `proxy_pass` with a **variable** in the target requires a `resolver`
  directive. Without one, the request fails at runtime.
- Set `resolver` explicitly with a sane `valid=` so re-resolution actually
  happens, and never leave the target open to a caller-influenced variable —
  that is how a gateway becomes an open proxy.

## systemd

```sh
systemctl show nginx -p LimitNOFILE --value
```

`worker_connections` is bounded by the process file-descriptor limit. Set high
in nginx and low in systemd, the shortfall appears as dropped connections under
load with nothing obvious in the log. Raise both together:

```sh
systemctl edit nginx        # [Service] / LimitNOFILE=65535
```
plus `worker_rlimit_nofile 65535;` in `nginx.conf`.

Also: `nginx -t` before **every** reload. `systemctl reload nginx` on a bad
config leaves the old workers running, which masks the error until the next
restart — when the gateway does not come back, in a DMZ, possibly without
console access.

## Certificates without the internet

A DMZ has no path to Let's Encrypt or any ACME endpoint, so **renewal is a
manual, calendared task**. That makes expiry the single most preventable outage
in this stack.

```sh
openssl x509 -in /etc/pki/tls/certs/gateway.crt -noout -enddate -subject -issuer
openssl x509 -in <cert> -noout -checkend 2592000 || echo "expires within 30 days"
```

Related: **OCSP stapling needs outbound reachability to the CA's responder.**
With no egress it fails silently and adds handshake latency for every client. If
you cannot prove egress, set `ssl_stapling off` rather than leaving it on and
slow.

Check the chain the client actually sees, not just the leaf — a missing
intermediate works in a browser that caches it and fails for a Java or curl
client with a clean trust store.

## Packaging

NGINX from the RHEL AppStream and NGINX from nginx.org are different builds with
different module sets. Before recommending a directive, confirm the module is
present:

```sh
nginx -V 2>&1 | tr ' ' '\n' | grep -E 'with-|--add'
```

Do not assume a module exists because it is in the documentation.

## Time

Cross-tier correlation between gateway logs and AIX ACE logs is worthless if the
clocks disagree. Confirm `chronyd` is running and synchronised on the RHEL host,
and note that the gateway logs one time zone and the AIX servers may log
another.
