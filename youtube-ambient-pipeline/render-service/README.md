# Render service

A small HTTP service that renders the pipeline's RenderScript with ffmpeg, exposing the same
contract the workflow already uses for Creatomate:

| Call | Creatomate | This service |
|---|---|---|
| Start | `POST https://api.creatomate.com/v2/renders` `{source, metadata, webhook_url}` | `POST http://<host>:8787/v1/renders`, same body |
| Poll | `GET …/v2/renders/:id` | `GET …/v1/renders/:id` |
| Result | `{id, status, url, width, height, …}`; `status` = `planned` → `rendering` → `succeeded` / `failed` | same fields, same statuses |
| Callback | POSTs the render object to `webhook_url` | same |
| File | public URL on their CDN | `http://<host>:8787/files/<id>.mp4`, unguessable id, kept 7 days |

Auth is `Authorization: Bearer <RENDER_SECRET>` on the two API calls; the file URL is unauthenticated so the
workflow's download node works unchanged. Only `source` requests are accepted; `template_id` is a Creatomate
concept and is rejected with a 400.

## What it renders

The RenderScript subset the workflow produces: scene compositions with one image each and a `pan`
animation (start/end scale and x), a `fade` transition into each scene, a `Fade-Out` shape, an optional
`Title-Card` text, and one audio element with `audio_fade_out`, `volume` and `loop`. Output is H.264
(CRF 20, preset faster), AAC 192 kb/s, at the script's width, height and frame rate. Scene stills are
cover-scaled onto a 2× canvas before the zoom so the push-in stays sharp.

Render speed is roughly real time on 2 vCPU: an 8-minute piece takes 8–12 minutes, a 45-minute piece
40–60. Jobs run one at a time; extra requests queue.

## Install (Ubuntu 24.04, as root)

From your PC, copy this folder up and run the installer:

```
scp -r youtube-ambient-pipeline/render-service root@<ip>:/root/render-service
ssh root@<ip> "bash /root/render-service/install.sh <ip>"
```

The installer adds ffmpeg and Node 22, creates an `ambient` system user, writes `/etc/ambient-render.env`
with a generated secret, installs a systemd unit `ambient-render`, and prints the base URL and secret.
Re-running it upgrades the code and keeps the secret. Open TCP 8787 in the Hetzner firewall (and 22 for SSH).

Logs: `journalctl -u ambient-render -f`. Health: `curl http://<ip>:8787/healthz`.

## Wire it into n8n

1. **Credentials → Create → Header Auth**: name `Render Service`, header name `Authorization`, value
   `Bearer <secret>` (the secret the installer printed).
2. Open **Render: Start** and **Render: Get** and pick that credential.
3. **Pipeline Config**: `render_mode` = `creatomate` (the value means "call the render API"),
   `render_api_base` = `http://<ip>:8787/v1`.

To go back to Creatomate: `render_api_base` = `https://api.creatomate.com/v2` and pick the
`Creatomate API` credential on the same two nodes.

## Hardening later

The service speaks plain HTTP with a bearer secret. Good enough for a pilot on a box that renders and
does nothing else. Before launch: put Caddy in front with a domain for TLS, or move n8n onto the same
box so the calls never leave localhost.
