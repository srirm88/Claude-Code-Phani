# Ambient YouTube Pipeline (n8n + Claude)

Automated pipeline for a faceless ambient channel (sleep, focus, study, meditation; adult audience).
One run produces one long-form video concept, its upload metadata, a Slack approval, an optional
render, and a **private** YouTube upload.

```
Schedule (Mon-Fri) ─┐
Manual Run ─────────┴─► Pipeline Config ─► Prompts ─► Load Recent Videos
   ─► Build Concept Request ─► Claude: Concept ─► Parse Concept
   ─► Build Metadata Request ─► Claude: Metadata ─► Parse Metadata
   ─► Assemble Review Package ─► Slack: Request Approval (#yt-approvals)
        ├─ rejected / timed out ─► Record Rejection ─► Slack notice
        └─ approved ─► Produce Assets (placeholder) ─► Build Render Request
              ├─ render_mode = stub ──────► Record Stub ─► Slack notice (payload only)
              └─ render_mode = creatomate ─► Creatomate: Start Render ─► Wait (webhook)
                    ─► Get Render ─► Download ─► YouTube: Upload (PRIVATE)
                    ─► Record Publish ─► [AI disclosure flag] ─► Slack notice with Studio link
```

Nothing renders or uploads without an **Approve** click in Slack. Uploads are always private;
flipping to public is a manual act in YouTube Studio.

## Layout

| Path | What |
|---|---|
| `n8n/ambient-pipeline.workflow.json` | Importable workflow. Credentials referenced by name only. |
| `prompts/concept.system.md` | Claude system prompt: brief → video concept. Versioned in its header comment. |
| `prompts/metadata.system.md` | Claude system prompt: concept → title, description, tags, chapters, disclosure. |
| `prompts/schemas/*.schema.json` | JSON schemas enforced through the API's structured output (`output_config.format`). |
| `harness/run.mjs` | Local test harness: dry-run or live-run the prompts, validate output, sync prompts into the workflow. |
| `harness/lib/validate.js` | Validation rules shared by the harness and the workflow's Parse nodes (single source). |
| `harness/fixtures/` | Example brief, channel settings, and a hand-written concept used for dry runs. |

## Decisions still open (the workflow is parameterised, not opinionated, on these)

These were left undecided by the channel owner. The pipeline runs with placeholders so the
concept and metadata stages can be exercised now, but **the render stage is a stub until they are settled**.

| Decision | Where it lives | Placeholder today | What changes when decided |
|---|---|---|---|
| Audio source (Suno/Udio API, licensed library, own compositions) | `Pipeline Config.audio_source`, `Produce Assets (placeholder)` node | `undecided` | Replace the placeholder node with the fetch/generate call. `concept.audio_brief.generation_prompt` is already written to feed a generator or brief a composer. |
| Visual source (AI stills with subtle motion vs licensed loops) | `Pipeline Config.visual_source`, same node | `undecided` | Same node. Scenes carry `visual_description`, `motion`, `palette` and a per-video `generation_prompt_prefix`. |
| Format spec (length, scene count, spoken intro) | `Pipeline Config.format_spec` and `harness/fixtures/brief.example.json` | **Pilot:** 5–10 min range, 3–6 scenes, no intro, scenes ≥ 60 s, 1080p25, −16 LUFS, no title card | Update both places, bump the prompt version, re-run the harness. The concept prompt treats `format_spec` as binding; give it either `duration_minutes` (exact) or `duration_minutes_min`/`_max` (a range the model picks inside). |
| n8n hosting (Cloud vs self-hosted) | Not in the workflow | – | See **Hosting** below. The Slack gate needs public HTTPS either way; the download/upload stage almost certainly needs self-hosted. |

Things to weigh before deciding, because they interact:

- **Audio is the biggest Content ID and policy risk.** Licensed library tracks that thousands of other channels use are exactly what "templated sameness" detection and Content ID matches punish. Generated music per video avoids the match risk but check the generator's commercial and YouTube-monetisation terms. Own compositions are safest and slowest.
- **AI stills with motion vs licensed loops changes the render.** Stills need an image-generation call per scene (6–10 per video) plus a template that animates them; loops need a search and licence-tracking step. Both need the Creatomate template to be built around them, so the template cannot be finalised before this decision.
- **Format spec drives cost.** Creatomate bills per output minute; a 45–60 minute piece at 4–5 per week is a meaningful monthly line item. Get a quote for the launch duration before locking it.
- **The 5–10 minute pilot format is deliberately not the launch format.** Sleep and focus viewers use a video as a session, and watch time per view is what this niche is rewarded on; short pieces lose that even with better retention curves. The pilot range exists to get through the audio, visual, template and hosting decisions cheaply. Move `format_spec` to the launch duration before anything goes public, and keep the pilot uploads private.
- **Spoken intro** forces a voice decision (synthetic voice = mandatory AI disclosure) and adds a TTS step. Instrumental-only is simpler and what the placeholders assume.

## Setup

### 1. Anthropic

1. Create an API key in the Anthropic Console.
2. In n8n: **Credentials → New → Anthropic**. Name it exactly **`Anthropic API`**.
   The HTTP Request nodes use this credential through "Predefined credential type"; the URL comes
   from `Pipeline Config.anthropic_base_url`.

Why HTTP Request nodes instead of the native Anthropic node: the native node exposes no
structured-output option, and it always sends `temperature`, `top_p` and `top_k`, which
Claude Opus 5 rejects with a 400. The HTTP node sends `output_config.format` with the JSON schema,
so the model's output is schema-valid by construction; the Parse nodes then apply business rules
(YouTube length limits, chapter timestamps, compliance flags).

Default model is `claude-opus-5` at effort `high` (both in `Pipeline Config`). Each run makes
two calls with a cached system prompt; expect roughly 5–15k input and 4–8k output tokens per run.

### 2. Slack app (approval gate)

Create the app from a manifest at <https://api.slack.com/apps> → **Create New App → From a manifest**:

```yaml
display_information:
  name: YT Approvals
features:
  bot_user:
    display_name: YT Approvals
    always_online: true
oauth_config:
  scopes:
    bot:
      - chat:write        # post the review and notices
      - channels:read     # resolve "#yt-approvals" to a channel id
      - users:read        # record who clicked Approve
      - users:read.email  # optional: include the approver's email in the output
settings:
  interactivity:
    is_enabled: true
    request_url: https://<your-n8n-host>/webhook-waiting-slack
  org_deploy_enabled: false
  socket_mode_enabled: false
```

Then:

1. **Install to Workspace** and copy the **Bot User OAuth Token** (`xoxb-…`).
2. **Settings → Basic Information → Signing Secret**: copy it.
3. In n8n: **Credentials → New → Slack API**. Access token = the bot token, **Signature Secret** = the
   signing secret. Name it exactly **`Slack Bot (yt-approvals)`**. Without the signing secret the
   Approve/Reject buttons post back but n8n rejects the callback and the workflow never resumes.
4. Create the channel `#yt-approvals` and invite the bot: `/invite @YT Approvals`.
5. The Request URL must be reachable by Slack over public HTTPS. `localhost` does not work; use a
   tunnel for local testing and set `WEBHOOK_URL` in n8n to the public origin.

The approval message shows the title, format, scene list with timestamps, audio brief, tags, the AI
disclosure decision, every assumption the model made, and any validation warnings. Approve is a
double-button (Approve / Reject). Unanswered requests time out after
`Pipeline Config.approval_timeout_hours` (default 12) and are treated as rejected.

### 3. Google Cloud / YouTube Data API v3

1. <https://console.cloud.google.com> → new project (for example `ambient-pipeline`).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen**: User type **External**, app name, support email, your n8n domain
   under authorised domains. Under **Test users**, add the Google account that owns the channel.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised redirect
   URI: copy the **OAuth Redirect URL** that n8n shows when you open a new YouTube credential
   (`https://<your-n8n-host>/rest/oauth2-credential/callback`).
5. In n8n: **Credentials → New → YouTube OAuth2 API**, paste Client ID and Client Secret, sign in
   **with the channel-owner account**. Name it exactly **`YouTube (channel)`**. The node requests the
   `youtube.upload` and `youtube` scopes it needs; the "Flag Synthetic Media" HTTP node reuses the same
   credential.

Three YouTube realities that shape the workflow:

- **Uploads from an unaudited API project are locked to private.** Any project created after July 2020
  must pass YouTube's API compliance audit before its uploads can be public. Until then the upload
  node's `private` setting is redundant but harmless, and the "flip to public manually in Studio"
  step is the only way out. Apply for the audit early; it takes weeks.
- **Quota.** Default 10,000 units/day. `videos.insert` costs 1,600; `videos.update` (the disclosure
  flag) costs 50. That is six uploads per day, comfortably above 4–5 per week, but a test loop that
  retries uploads burns through it fast.
- **Testing-mode tokens expire after 7 days.** With the consent screen in *Testing*, the refresh
  token dies weekly and the credential needs a re-sign-in. Move the app to *In production*
  (the "unverified app" warning is cosmetic for your own account) so the token persists.

**AI disclosure.** When the metadata stage sets `ai_disclosure.required = true`, the workflow calls
`videos.update` with `status.containsSyntheticMedia = true`, which is YouTube's "altered or synthetic
content" flag. The metadata prompt applies YouTube's rule (realistic content a viewer could mistake for
real) plus the channel's own policy string in `Pipeline Config.ai_disclosure_policy`. The reviewer sees
the decision and reason in Slack before approving.

### 4. Creatomate (render; optional until `render_mode = creatomate`)

1. Create an API key under **Project settings → API Integration**.
2. In n8n: **Credentials → New → Header Auth**. Name **`Creatomate API`**, header name
   `Authorization`, value `Bearer <api key>`.
3. Build a template and paste its ID into `Pipeline Config.creatomate_template_id`.

The `Build Render Request` node expects these element names in the template (rename in the node
if your template differs):

| Element | Type | Set from |
|---|---|---|
| `Audio` | audio | `assets.audio_url` |
| `Title-Card` | text | `metadata.title` |
| `Scene-N` (N = 1..scene_count_max) | composition | `.duration` = scene seconds; unused scenes get duration 0 (verify this collapses them in your template) |
| `Scene-N-Image` | image or video | `assets.scene_image_urls[N-1]` (add slow zoom/pan inside the composition) |
| `Scene-N-Label` | text | scene name (optional; delete if you want no on-screen text) |

The render request passes `webhook_url = $execution.resumeUrl`, so the Wait node resumes the moment
Creatomate finishes; the node also times out after `render_timeout_hours` and re-checks status, so a
missed webhook is not fatal. Output is `mp4` (`Pipeline Config.creatomate_output_format`).

Until the audio and visual sources are decided, the `Produce Assets (placeholder)` node feeds
`placeholder_audio_url` and `placeholder_image_url` from config into every scene. Point those at any
public MP3 and JPG to smoke-test the render and upload path.

### 5. Import the workflow

1. n8n → **Workflows → Import from file** → `n8n/ambient-pipeline.workflow.json`.
2. Open each node that shows a credential warning and pick the credential of the same name
   (the JSON carries names, not ids; n8n binds them on first selection).
3. Edit **Pipeline Config**: channel description, `slack_channel`, `format_spec`, and leave
   `render_mode = stub` for the first runs.
4. Run **Manual Run**. You should get a Slack message within a minute or two. Click **Reject** and
   confirm the rejection notice arrives. Run again and click **Approve**; in stub mode a notice with
   the render payload appears and nothing else happens.
5. Switch `render_mode` to `creatomate` only after the template exists and a placeholder render has
   been downloaded successfully.
6. Enable the **Weekday Schedule** trigger (06:00 Mon–Fri server time) once 5–10 outputs have been
   reviewed, per the launch plan.

The workflow keeps its own publish history in workflow static data (last 60 entries: format family,
theme, palette, mood, title, status) and feeds the last eight into every concept request so the
model can avoid repeating itself. Static data persists across runs on both Cloud and self-hosted.

### Hosting

| Concern | n8n Cloud | Self-hosted |
|---|---|---|
| Slack approval callbacks | Works out of the box (public HTTPS). | Needs a public HTTPS origin and `WEBHOOK_URL` set. |
| Creatomate webhook to `$execution.resumeUrl` | Works. | Same public-origin requirement. |
| Downloading the MP4 and streaming it to YouTube | Pilot 5–10 min (roughly 100–400 MB): probably fine. Launch 30–60 min (1–3 GB): **likely to fail**, binary data is held in memory and Cloud plans cap execution memory. | Set `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` and give the container disk; the YouTube node streams from the binary in chunks. |
| Waiting executions (hours for approval and render) | Fine. | Fine; make sure `EXECUTIONS_DATA_SAVE_ON_PROGRESS` / `saveExecutionProgress` is on (it is set in the workflow). |

If you want to stay on Cloud, the pragmatic split is: keep concept, metadata and the Slack gate in
n8n, and move "download render → upload to YouTube" to a small script or a second workflow on a
self-hosted worker that n8n calls by webhook. The workflow's node boundaries are laid out so that
`Download Render` → `YouTube: Upload (Private)` → `YouTube: Flag Synthetic Media` can be lifted out as a unit.

## Test harness

```sh
cd harness
npm install                      # @anthropic-ai/sdk only
node run.mjs all --dry-run       # prints both request bodies; no API call
export ANTHROPIC_API_KEY=sk-ant-...
node run.mjs concept             # live: writes out/<timestamp>/concept.{request,response}.json + concept.json
node run.mjs metadata --concept out/<timestamp>/concept.json
node run.mjs all                 # both, chained
PIPELINE_MODEL=claude-sonnet-5 PIPELINE_EFFORT=medium node run.mjs all   # cheaper iteration
```

Successive live runs feed each other: each run appends its concept and final title to
`harness/out/history.json`, and the next run merges that into `recent_videos` and `recent_titles`,
exactly as the workflow does with its own publish history. So three runs in a row should give three
different format families and three differently shaped titles; if they do not, the variety rules
in the prompts need work. `--no-history` ignores the file, `--reset-history` clears it.

Every live run prints token usage (including cache reads, so you can see the system-prompt cache
working on the second call) and a PASS/FAIL validation block using the same rules as the workflow's
Parse nodes. Change a prompt, run the harness, read the concept, adjust; only then sync:

```sh
node run.mjs sync-workflow       # embeds prompts/*.md, schemas and lib/validate.js into the workflow JSON
node run.mjs check-workflow      # fails if the workflow and the files have drifted, or a connection is dangling
```

Then re-import the workflow JSON (or paste the two prompt strings into the `Prompts` node).
Bump the `version:` in the prompt header on every meaningful change; the version string is stored
in `Prompts.prompt_versions` so the running workflow tells you what it is executing.

Brief inputs live in `harness/fixtures/brief.example.json`; keep it in step with `Pipeline Config`
(the harness cannot read the workflow's config, by design: the fixture is where you try variations).

## Compliance posture

- **Variety per video** is enforced at prompt level (format families, mandatory `variation_rationale`
  against the last eight uploads) and surfaced to the reviewer. It is a prompt, not a guarantee; the
  human gate is the guarantee.
- **Audio** must be original or licensed; the concept prompt forbids referencing artists or tracks,
  and `compliance_checklist.audio_is_original_or_licensed` must be true or the run fails validation.
  The pipeline cannot verify a licence; that lives with whichever audio source you choose.
- **Visuals**: no real people, brands, trademarks, or recognisable copyrighted subjects; a
  `negative_prompt` is produced per video for image generation.
- **Health claims**: both prompts prohibit them and the validator warns on cure/treat/heal wording.
- **Audience**: `made_for_kids` is forced to false and validated.
- **AI disclosure**: decided per video by the metadata stage, shown in Slack, applied by API.

## Operational notes

- Failures in a Claude call retry three times with a 10 s gap; a validation failure stops the run
  with the list of errors in the execution log (no Slack message). Add an n8n Error Workflow if you
  want failures in Slack too.
- A refusal (`stop_reason: refusal`) or a truncated output (`max_tokens`) fails the Parse node
  with a clear message rather than passing garbage downstream.
- The Slack review text is capped at 2,900 characters (Slack block limit is 3,000).
- History is stored per workflow. Duplicating the workflow starts a fresh history.
