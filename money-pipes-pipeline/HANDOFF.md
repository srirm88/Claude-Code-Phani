# HANDOFF — The Money Pipes pipeline

Read this first. It is the state of the work as of 2026-09-22 and the brief for continuing it.

## What this is

An n8n + Claude pipeline for **The Money Pipes**, a faceless YouTube channel explaining the machinery behind banking and payments (voice-over on diagrams, English, global audience). It is adapted from `../youtube-ambient-pipeline` (branch `claude/youtube-ambient-pipeline-ecs2d4`), which is the reference for the parts that carry over unchanged. Full node-by-node mark-up of what to keep, remove, rewrite and add: `MARKUP.md` in this folder.

## Non-negotiables (do not relitigate)

- **Two workflows, not one.** WF-A drafts a script into the Notion page and stops. The author edits the script in Notion and flips Status to `Record` with "Anonymisation reviewed" ticked. WF-B picks it up, narrates with the author's ElevenLabs voice clone, renders diagram frames, builds the video, then asks for Slack approve/reject on the MP4, then uploads **private**. Notion is the source of truth; a Slack button cannot carry a script edit.
- **The draft is a draft.** The model is not the author. Its job is to be a good thing to correct and to list what it guessed in `open_questions_for_author`. Do not "improve" the prompt toward producing a final script.
- **Anonymisation rules** (brand sheet §7, embedded in `prompts/draft.system.md`) are enforced by `harness/lib/validate.js`. No bank named as subject, no vendor blamed, no identifying numbers. The validator is shared with the n8n Parse nodes via `node run.mjs sync-workflow`.
- **Visuals are only the diagram grammar** (phone, pipe, dot, tank, valve, gate, clock, job_column, label, external_tank, gauge, calendar). Colours: navy `#10273A`, chalk `#EAE4D6`, copper `#B8722C`, fault red `#D64545` (section 4 only), grey `#5F6B76`. Fonts IBM Plex Sans / Plex Mono. Frames **cut** in; only dots move along pipes; optional slow push-in. No stock footage, no cross-fades, no generated imagery.
- Uploads are always private; flipping to public is manual.

## Done and tested

| Piece | File | State |
|---|---|---|
| Draft prompt | `prompts/draft.system.md` v1.1.0 | Two live Opus runs; run 1 PASSed the validator with 10 good open questions (`harness/out/2026-09-22T03-03-22-599Z/draft.json`). v1.1.0 adds: frames in narration order, glossary must cover `jargon_terms`, four-word label cap. Not yet re-run after the bump. |
| Draft schema | `prompts/schemas/draft.schema.json` | Full schema on disk; `apiSchema()` in validate.js strips keywords the API's structured-output subset rejects (`minItems>1`, `maxItems`, string/number bounds, `pattern`, `const`). |
| Metadata prompt + schema | `prompts/metadata.system.md`, `schemas/metadata.schema.json` | Written, dry-run only. Chapters come from measured narration timings, not estimates. |
| Validator | `harness/lib/validate.js` | `validateDraft`, `validateMetadata`, `apiSchema`. Positive test: video 1 script PASSes. Negative test: planted bank name, blamed vendor, dated outage, "guys", fault frame outside §4, unknown object, bad cue — all caught. |
| Harness | `harness/run.mjs` | `draft`, `metadata`, `validate`, `all`, `sync-workflow`, `check-workflow`. `MAX_TOKENS.draft = 32000` (effort=high spends reasoning tokens inside it; 16k truncated). |
| Fixtures | `harness/fixtures/` | `brief.example.json` = video 1's Notion row + channel + grammar + banned/vendor lists. `draft.stub.json` = the author-approved video 1 script converted to the schema (1,240 words, 20 frames) — the reference the model is judged against. |

Superseded ambient files were moved to `_to_delete/` (deletion was blocked from the authoring session); delete that folder.

## Not built yet — build order

1. **Frame service** (`frame-service/`, port 8788, same VPS as `render-service/`). HTTP endpoint that takes `{frames:[{objects, motion, fault, text_card}]}` in the draft schema's frame shape and returns 1920×1080 PNGs; second endpoint renders thumbnail variants (1280×720). Bearer auth like the render service. A working Python generator of exactly these frames for video 1 exists as `gen_frames.py` in the author's authoring session outputs (20 frames, cairosvg) — port its drawing functions; the object→drawing mapping is: tank=rounded rect with level line, external_tank=dashed, pipe=thick line copper/grey/red, dot=chalk circle, valve=circle with X, gate=vertical bar across pipe (closed) or raised (open), clock=circle with hands + value label, job_column=vertical chain of boxes with `items[]`, `state=active` highlights `value`, `state=fault` reds `value` and greys everything below, gauge=dial, calendar=grid with one cell red, phone=rounded rect with optional label, label=text. Install Plex fonts on the VPS.
2. **Render service edits** (`render-service/render.mjs`, `planFromSource`): support `transition: none` (currently always cross-fades), `sources[]` concatenation for the narration audio, a second audio track at low volume (optional bed), `text` elements for punch-line cards with a Plex font path. Fade-out shrinks to ~2 s.
3. **WF-A** `n8n/money-pipes-a-draft.workflow.json`: Notion poll (Status=Research) → Build Draft Request → Claude: Draft (HTTP, structured output, `apiSchema`) → Parse Draft (validator spliced between the `// ---- shared validation` markers) → Notion: write script + storyboard into the page, set Status=Script → Slack "draft ready". Keep the `Pipeline Config` / `Prompts` node pattern from the ambient workflow so `sync-workflow` works.
4. **WF-B** `n8n/money-pipes-b-produce.workflow.json`: Notion poll (Status=Record, Anonymisation reviewed=true) → read page → Split Sections (5) → ElevenLabs TTS per section with timestamps (`/v1/text-to-speech/{voice_id}/with-timestamps`) → S3 → Cue Timings (find each frame's `narration_cue` in the timestamped transcript) → Frame service → S3 → Build Render Request (one scene per frame, `time` from cue, cut not fade, narration audio) → Render: Start/Wait/Get/Download (unchanged from ambient) → Build Metadata Request → Claude: Metadata → Parse Metadata → Assemble Review Package (MP4 link, 3 titles, 3 thumbnails, description) → Slack approve/reject → YouTube Upload (private) + thumbnails.set → Notion: Status=Published, URL, date → Slack notice. Set `asset_mode = stub` and `render_mode = stub` first so the whole flow runs for free.
5. Metadata prompt live test; thumbnails; Notion write-back; first private upload.

Video 1 is being produced **by hand** in parallel; the pipeline is built against it as the reference, not used to make it.

## Config the workflows need (values, not secrets)

`notion_database_id`, `elevenlabs_voice_id` (the author's clone, not yet trained), `frame_service_base`, `render_api_base`, `asset_bucket` / `asset_public_base_url`, `newsletter_url` (placeholder `https://themoneypipes.substack.com` in fixtures — not yet real), `slack_channel` `#yt-approvals`. Credentials by name only: `Anthropic API`, `Slack Bot (yt-approvals)`, `ElevenLabs API`, `Asset Storage (S3)`, `Render Service`, `Frame Service`, `YouTube (channel)`, `Notion`.

## Open questions for the author (from the draft run, still unanswered)

See `open_questions_for_author` in `harness/out/2026-09-22T03-03-22-599Z/draft.json`. The two that affect frames for every EOD-type video: is "stand-in" the right word for the bank-side switch (vs scheme-side), and is the job order close to a real chain. Answers belong in the video's Notion `notes` and in `harness/fixtures/brief.example.json`.

## Working conventions

- Bump the `version:` in a prompt header on every meaningful change; the workflow's `Prompts.prompt_versions` records what is running.
- Change prompts → run the harness → only then `sync-workflow` → re-import.
- LF line endings in pipeline files (see `.gitattributes` in the ambient folder; copy it).
- Nothing auto-publishes. Ever.
