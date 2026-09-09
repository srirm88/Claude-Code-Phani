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
        └─ approved ─► Generate assets?
              ├─ placeholder ─► Placeholder Assets ─────────────────────────┐
              └─ generate ─┬─► Build Image Prompts ─► OpenAI image (per scene) ─► S3 ─► Collect ─┐
                           └─► Build Music Request ─► ElevenLabs music ─► S3 ─► Music URL ───────┴─► Merge ─► Assemble Assets
                                                                                                        └─► Build Render Request
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
| `n8n/creatomate-renderscript.example.json` | One generated Creatomate RenderScript, for reference or for pasting into their editor. |
| `n8n/ambient-pipeline.workflow.json` | Importable workflow. Credentials referenced by name only: `Anthropic API`, `Slack Bot (yt-approvals)`, `OpenAI API`, `ElevenLabs API`, `Asset Storage (S3)`, `Creatomate API`, `YouTube (channel)`. |
| `prompts/concept.system.md` | Claude system prompt: brief → video concept. Versioned in its header comment. |
| `prompts/metadata.system.md` | Claude system prompt: concept → title, description, tags, chapters, disclosure. |
| `prompts/schemas/*.schema.json` | JSON schemas enforced through the API's structured output (`output_config.format`). |
| `harness/run.mjs` | Local test harness: dry-run or live-run the prompts, validate output, sync prompts into the workflow. |
| `harness/lib/validate.js` | Validation rules shared by the harness and the workflow's Parse nodes (single source). |
| `harness/fixtures/` | Example brief, channel settings, and a hand-written concept used for dry runs. |

## Decisions still open (the workflow is parameterised, not opinionated, on these)

Three of the four are now decided and wired. Hosting is still open. `asset_mode` and `render_mode` in
`Pipeline Config` let you run the whole flow for free (`placeholder` + `stub`) until the accounts exist.

| Decision | Where it lives | Placeholder today | What changes when decided |
|---|---|---|---|
| Audio source | `Pipeline Config.audio_source`, `Build Music Request` → `ElevenLabs: Compose Music` | **Decided: music generator.** ElevenLabs Eleven Music, one instrumental track for the full duration. | Provider swap = one HTTP node. See **Why not Suno/Udio** below. |
| Visual source | `Pipeline Config.visual_source`, `Build Image Prompts` → `OpenAI: Generate Scene Image` | **Decided: generated stills with template motion.** One still per scene, animated in the Creatomate template. | Provider swap = one HTTP node. |
| AI disclosure | `Pipeline Config.ai_disclosure_policy` | **Decided:** every description states the visuals and music are generated; the platform flag is set only when the visuals could pass for real footage. | The metadata stage applies this per video with a written reason. |
| Format spec (length, scene count, spoken intro) | `Pipeline Config.format_spec` and `harness/fixtures/brief.example.json` | **Pilot:** 5–10 min range, 3–6 scenes, no intro, scenes ≥ 60 s, 1080p25, −16 LUFS, no title card | Update both places, bump the prompt version, re-run the harness. The concept prompt treats `format_spec` as binding; give it either `duration_minutes` (exact) or `duration_minutes_min`/`_max` (a range the model picks inside). |
| n8n hosting (Cloud vs self-hosted) | Not in the workflow | – | See **Hosting** below. The Slack gate needs public HTTPS either way; the download/upload stage almost certainly needs self-hosted. |

Things to weigh before deciding, because they interact:

- **Why not Suno or Udio.** Neither has an official public API; the third-party wrappers scrape a consumer product and break or breach terms without notice. Suno is also mid-transition after its Warner settlement, with current models slated for deprecation and a German court ruling against it in 2026. ElevenLabs Eleven Music has a documented API, instrumental-only generation, and commercial clearance on paid plans. That is the difference between a pipeline and a hobby.
- **YouTube's line on AI music.** Since July 2025, fully AI-generated, unmodified, audio-only uploads are ineligible for monetisation. These videos are not audio-only, the music is one element of an original composition with per-video visuals and structure, and every upload discloses generation. Keep it that way: never publish the music track on its own, and never reuse a track across videos.
- **Two limits to verify on the first live asset run.** ElevenLabs' API reference allows up to 600,000 ms per prompt-based request while the product overview says five minutes; `music_max_ms` is set to 600,000 and the `Build Music Request` node fails loudly if the piece is longer. If the API refuses anything over five minutes, the fix is two generations with a crossfade in the template, and I will add it then. Image generation returns 1536×1024 (3:2); the template crops to 16:9, which the push-in needs anyway.
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

That is all. With `creatomate_mode = source` (the default) there is **no template to build**: the
`Build Render Request` node writes the complete RenderScript for each video and posts it as
`source`. Per video it produces:

| Element | What it does |
|---|---|
| `Scene-N` (composition, one per concept scene) | Exact scene duration; 3 s cross-fade in from the previous scene. |
| `Scene-N-Image` | The generated still, `fit: cover`, with a linear `pan` over the whole scene: 100→106 % push-in on odd scenes, 106→100 % pull-back on even scenes, plus a 1.5 % lateral drift. |
| `Scene-N-Label` | Scene name, hidden (`visible: false`) unless you want captions. |
| `Fade-Out` | Full-frame black shape, opacity 0→100 % over the last 20 s, matching the format rule. |
| `Title-Card` | Title text for the first 8 s, hidden unless `delivery.title_card` is not `none`. |
| `Audio` | The music track for the full output length with a 20 s `audio_fade_out`. |

`n8n/creatomate-renderscript.example.json` is one generated example (the dry-run concept), useful to
paste into Creatomate's editor if you want to see or tweak the look by hand. Frame rate and
resolution come from `format_spec.delivery`.

If you would rather design in the editor, set `creatomate_mode = template`, build a template with
the element names above (up to `scene_count_max` scenes) and put its ID in `creatomate_template_id`;
the node then sends `modifications` instead, hiding unused scenes.

The render request passes `webhook_url = $execution.resumeUrl`, so the Wait node resumes the moment
Creatomate finishes; the node also times out after `render_timeout_hours` and re-checks status, so a
missed webhook is not fatal.

With `asset_mode = placeholder`, the `Placeholder Assets` node feeds `placeholder_audio_url` and
`placeholder_image_url` from config into every scene. Point those at any public MP3 and JPG to
smoke-test the render and upload path without spending generation credits.

### 5. Image generation (OpenAI Images API)

1. Create an API key at <https://platform.openai.com/api-keys>.
2. In n8n: **Credentials → New → OpenAI**, name **`OpenAI API`**.
3. `Pipeline Config`: `image_model` (default `gpt-image-1`), `image_size` (`1536x1024`), `image_quality` (`high`).

The `OpenAI: Generate Scene Image` node runs once per scene, one request every 1.5 s, three retries.
Cost at `high` quality is roughly $0.15–0.20 per image, so under $1.50 per pilot video. Drop to
`medium` while iterating on prompts. To change provider, replace the URL and body of that one node;
`Image to Binary` expects `data[0].b64_json`, adjust `sourceProperty` if the new provider differs.

### 6. Music generation (ElevenLabs Eleven Music)

1. Paid ElevenLabs plan (commercial rights for music require a paid tier; check the music terms for your
   plan before the first public upload). Create an API key under **Profile → API keys**.
2. In n8n: **Credentials → New → Header Auth**, name **`ElevenLabs API`**, header name `xi-api-key`,
   value the key.
3. `Pipeline Config`: `music_model_id` (`music_v2`), `music_output_format` (`mp3_44100_128`),
   `music_max_ms` (600000).

`ElevenLabs: Compose Music` sends `audio_brief.generation_prompt` with `force_instrumental: true` and
the exact piece length; the response body is the MP3. Generation credits are billed per track minute.

### 7. Asset storage (any S3-compatible bucket)

Creatomate fetches assets by URL, and both generators return bytes, so the pipeline needs one bucket.
Cloudflare R2 is the cheapest fit (no egress fees, free tier covers a pilot); AWS S3, Backblaze B2
or MinIO work the same way.

1. Create a bucket (for example `ambient-assets`) and enable **public read** at bucket level:
   R2 → bucket → Settings → Public access (r2.dev subdomain or a custom domain); S3 → a bucket policy
   granting `s3:GetObject` on `arn:aws:s3:::ambient-assets/*`. No per-object ACL is sent.
2. Create S3 API credentials for the bucket (R2: **Manage R2 API Tokens → Object Read & Write**).
3. In n8n: **Credentials → New → S3**, name **`Asset Storage (S3)`**. R2 endpoint is
   `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, force path style on. AWS: leave the
   endpoint empty and set the region.
4. `Pipeline Config`: `asset_bucket`, `asset_public_base_url` (the public origin, no trailing slash),
   `asset_key_prefix` (`runs`). Objects land at `runs/<run_id>/scene-01.jpg …` and `runs/<run_id>/music.mp3`.

Set a lifecycle rule to expire objects after 30–60 days; once a video is uploaded the assets are only
useful for re-renders.

### 8. Import the workflow

1. n8n → **Workflows → Import from file** → `n8n/ambient-pipeline.workflow.json`.
2. Open each node that shows a credential warning and pick the credential of the same name
   (the JSON carries names, not ids; n8n binds them on first selection).
3. Edit **Pipeline Config**: channel description, `slack_channel`, `format_spec`, and leave
   `asset_mode = placeholder` and `render_mode = stub` for the first runs.
4. Run **Manual Run**. You should get a Slack message within a minute or two. Click **Reject** and
   confirm the rejection notice arrives. Run again and click **Approve**; in stub mode a notice with
   the render payload appears and nothing else happens.
5. Switch `asset_mode` to `generate` once the OpenAI, ElevenLabs and bucket credentials exist; the stub
   notice in Slack will then show real asset URLs. Switch `render_mode` to `creatomate` only after the
   template exists and a placeholder render has been downloaded successfully.
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
