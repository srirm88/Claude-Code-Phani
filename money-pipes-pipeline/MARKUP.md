# Money Pipes pipeline — mark-up of `youtube-ambient-pipeline`

Source: branch `claude/youtube-ambient-pipeline-ecs2d4`, commit `1418704`. Target: a sibling folder `money-pipes-pipeline/` on a new branch, built by copying and editing, not by forking the ambient flow in place (the ambient channel may still want its own).

Verdict first: **about 60% of the pipeline carries over untouched, 25% is rewritten inside existing nodes, 15% is new.** The skeleton, the approval discipline, the storage, the render contract, the upload path and the harness are all right for this channel. What changes is the *content stage*, because the ambient flow generates a whole video from nothing, and this channel's whole value is a human writing the middle of the script.

---

## 1. The one structural change: two workflows, not one

The ambient flow is one straight line with a Slack Approve/Reject gate. That works when the reviewer's only power is yes or no. Here the reviewer *rewrites the script* — that's the moat — and a Slack button can't carry an edit.

So the flow splits at the script:

```
WF-A  DRAFT     Notion row (Status = Research) ─► Claude: research brief ─► Claude: script draft + storyboard spec
                ─► write both into the Notion page ─► set Status = Script ─► Slack: "draft ready"
                                                                                   │
                                        ── you edit the script in Notion, tick "Anonymisation reviewed", set Status = Record ──
                                                                                   │
WF-B  PRODUCE   Notion poll (Status = Record, Anonymisation reviewed = true)
                ─► read final script + storyboard ─► ElevenLabs TTS per section (with timestamps) ─► S3
                ─► Frame service: render storyboard frames ─► S3
                ─► Build RenderScript (frames cut on narration timestamps) ─► Render: Start / Wait / Get
                ─► Slack: Approve/Reject (watch the MP4 first)
                ─► YouTube: Upload (PRIVATE) + thumbnail ─► Notion: Status = Published, URL, date ─► Slack notice
```

Notion is already the content board, and n8n's Notion node reads and writes properties, so it replaces the workflow's static-data history as the source of truth. The Slack gate moves to *after* the render, where a yes/no is the right question again ("does the video look right?").

---

## 2. Node-by-node

### Keep as-is (no edits)

| Node(s) | Why |
|---|---|
| `Manual Run` | Still the way to run one video on demand |
| `Pipeline Config` / `Prompts` pattern | Same pattern; values change (§4) |
| `Claude: *` HTTP nodes with `output_config.format` | Structured output is exactly what the script/storyboard stage needs |
| `Parse *` nodes + `harness/lib/validate.js` as single source | Rules change (§5), mechanism stays |
| `Slack: Request Approval`, `Approved?`, `Record Rejection`, `Slack: Rejected Notice` | Moves later in the flow, otherwise identical |
| `S3: Upload *`, `Asset Storage (S3)` credential, `asset_key_prefix` layout | Frames and narration land at `runs/<run_id>/frame-01.png`, `narration-01.mp3` |
| `Render: Start`, `Parse Render Start`, `Wait for Render`, `Render: Get`, `Render succeeded?`, `Slack: Render Failed`, `Download Render` | The Creatomate-shaped contract is unchanged; the RenderScript inside it changes |
| `YouTube: Upload (Private)`, `Record Publish`, `Slack: Uploaded (Private)` | Unchanged |
| `render-service/` | Keep; extend (§6) |
| `harness/run.mjs` incl. `sync-workflow`, `check-workflow` | Keep; fixtures change |

### Remove

| Node(s) | Why |
|---|---|
| `Weekday Schedule` | Cadence is one video per ~10 days, human-paced. A schedule trigger produces drafts nobody asked for. Replace with a Notion poll (every 30 min) filtered on Status |
| `Load Recent Videos` (static-data history) | Notion holds history now; the draft prompt gets the last 8 published titles/hooks by a Notion query instead |
| `Build Image Prompts`, `OpenAI: Generate Scene Image`, `Image to Binary` | No generated imagery. Diagrams come from the frame service |
| `Build Music Request`, `ElevenLabs: Compose Music`, `Music URL` | No music track. (Optional later: a fixed licensed ambient bed at −30 dB, same file every video — one config URL, no generation) |
| `Generate assets?` + `Placeholder Assets` branch | Replaced by `asset_mode = stub` on the frame and TTS nodes (§6) — same idea, simpler |
| `AI disclosure needed?`, `YouTube: Flag Synthetic Media` | Diagrams are obviously not real footage, so YouTube's altered-content flag does not apply. The honest disclosure ("narration generated from the author's voice clone") goes in the description template instead. Keep the node code in the repo in case policy shifts; don't wire it |

### Rewrite inside the node

| Node | Change |
|---|---|
| `Build Concept Request` → **Build Draft Request** | Input is a Notion row (title, hook, pillar, notes, anonymisation risk) plus `brand_voice`, `anonymisation_rules`, `diagram_grammar`, `last_8_published`. Output request asks for the five-part script draft **and** a storyboard spec in one call |
| `Claude: Concept` → **Claude: Draft** | Same node; new system prompt `prompts/draft.system.md`, new schema `draft.schema.json` (§3). Effort `high`, model as configured |
| `Parse Concept` → **Parse Draft** | Runs the new validator rules (§5); on pass, writes script and storyboard into the Notion page body and sets Status = Script. **Never proceeds past this point in WF-A** |
| `Build Metadata Request` / `Claude: Metadata` / `Parse Metadata` | Move to WF-B, after TTS, so chapters use *real* section timestamps. Prompt rewritten: description template from the brand sheet, "Simplifications made in this video", pinned comment, three title variants, tags. Schema loses `ai_disclosure` decision, gains `pinned_comment`, `simplifications[]`, `title_variants[3]` |
| `Assemble Review Package` | Now assembles for the post-render gate: MP4 link, title variants, three thumbnail PNGs, description, chapters |
| `Build Render Request` | New RenderScript (§6). Scene = one frame, duration from narration timestamps, **cut** not cross-fade, slow push-in only, narration audio track, optional punch-line text cards |

### New

| Node | What |
|---|---|
| **Notion: Poll for work** (WF-A trigger) | Query Videos DB, Status = Research, take oldest by Order |
| **Notion: Get page** (WF-B trigger) | Status = Record and Anonymisation reviewed = true; read page body (script + storyboard) |
| **Notion: Write draft** / **Notion: Set status** / **Notion: Record publish** | Property writes; page-body write for the draft |
| **Split Sections** | Splits the final script on the five headings → 5 items |
| **ElevenLabs: Narrate section** | `POST /v1/text-to-speech/{voice_id}/with-timestamps`, voice = your clone, one call per section, `model_id` = the multilingual v2 or whatever the clone was trained on. Returns audio + character-level timestamps. Retries ×3, 1.5 s spacing like the image node |
| **Narration to Binary** → `S3: Upload Narration` | Same shape as the removed image path |
| **Cue Timings** (code) | For each storyboard frame, find its `narration_cue` phrase in the timestamped transcript → start time. Produces the scene timeline. Falls back to even spacing within the section if a cue isn't found, and flags it in the review package |
| **Frame service: Render frames** | `POST http://<vps>:8788/v1/frames` with the storyboard spec (grammar objects + positions) → returns PNG per frame. This is `gen_frames.py` from today's work, wrapped as an HTTP service on the same VPS as the render service (§6) |
| **Frame service: Render thumbnails** | Same service, 3 variants from `title_variants` × thumbnail template |
| **YouTube: Set thumbnail** | `videos.thumbnails.set`, 50 quota units, after upload, using the variant you pick in Slack |

---

## 3. Draft prompt and schema (replaces concept)

`prompts/draft.system.md` — the shape, not the full text (I'll write the full text as the next deliverable):

- Role: research assistant and first-draft writer for a banking-infrastructure explainer. **It is not the author.** The draft's job is to be corrected.
- Inputs: the Notion row, the brand voice rules (§6 of the brand sheet), the anonymisation rules (all seven, verbatim), the diagram grammar table, the last 8 published hooks.
- Output: five sections with headings fixed; each section has `narration` and `frames[]`. Each frame: `narration_cue` (a short verbatim phrase from the narration where the frame cuts in), `objects[]` (from the grammar only: tank, pipe, dot, valve, gate, clock, phone, job_column, text_card, label), `motion` (one of: none, dots_flow, push_in), `fault` (bool — red allowed only if true).
- Hard rules carried from the ambient prompt and adapted: no bank named as subject, no vendor named as failing, no number that identifies an institution, no "in this video I will / let's dive in / guys", every technical term gets one plain-English translation on first use, target 1,400–1,900 words, at most 7 objects per frame, fault red only in section 4.
- `assumptions[]` and `open_questions_for_author[]`: the model must list where it was guessing about how a real bank does something. That list is what you read first when editing.

`draft.schema.json` keys: `title_working`, `sections[5]{heading, narration, frames[]}`, `glossary[]{term, plain}`, `simplifications[]`, `open_questions_for_author[]`, `assumptions[]`, `compliance{no_bank_named, no_vendor_blamed, no_identifying_numbers, no_banned_phrases}`.

---

## 4. Pipeline Config changes

Remove: `audio_source`, `visual_source`, `image_*`, `music_*`, `ai_disclosure_policy`, `creatomate_mode/template_id`, `format_spec.scene_count_*`, `min_scene_seconds`, `spoken_intro`.

Add:

```
notion_database_id, notion_status_property = "Status"
elevenlabs_voice_id, elevenlabs_model_id, elevenlabs_stability = 0.5, similarity = 0.8
frame_service_base = http://<vps>:8788/v1
brand_voice (string, from brand sheet §6)
anonymisation_rules (string, brand sheet §7, verbatim)
diagram_grammar (JSON, the object vocabulary)
format_spec = { target_minutes_min: 9, target_minutes_max: 13, words_min: 1400, words_max: 1900,
                delivery: { resolution: 1920x1080, fps: 25, lufs: -16, title_card: none } }
punchline_cards = true          # full-screen text cards for one-line punches
ambient_bed_url = ""            # optional fixed licensed bed; empty = none
asset_mode = stub | live        # stub skips TTS + frames, uses placeholder narration/frames
render_mode = stub | render     # unchanged semantics
```

---

## 5. Validator rules (`harness/lib/validate.js`)

Drop: health-claim check, made_for_kids, variety/format-family rules, scene-duration sums.

Add:
- **Banned-name scan**: a configurable list (start with your employer, prior employers, and the major GCC/Indian bank names) — any hit in narration = FAIL.
- **Vendor-blame scan**: vendor list (Finacle, Temenos, T24, Flexcube, IBM MQ, ACE, etc.) allowed only in section 3 in a list construction; in section 4 = FAIL.
- **Identifying-number scan**: any number ≥ 6 digits, any date with a year in section 4 = WARN.
- **Banned phrases**: "in this video", "let's dive in", "smash", "guys", "COBOL" jokes = FAIL.
- **Structure**: exactly five sections with the fixed headings; word count in range; each frame has ≤ 7 objects; `fault=true` frames only in section 4; every frame's `narration_cue` is a substring of its section's narration.
- **Glossary**: every term in the grammar's jargon list that appears in narration appears in `glossary[]`.

The harness dry-run fixture becomes `fixtures/video-01.brief.json` (the Notion row for video 1) and `fixtures/draft.stub.json` (today's approved script, converted to the schema — a real, reviewed example the model can be compared against).

---

## 6. Render side

**Frame service (new, `frame-service/`, port 8788, same VPS).** `gen_frames.py` refactored: the grammar functions become a library; an HTTP endpoint accepts `{frames:[{objects:[...], motion, fault}], size}` and returns PNGs (cairosvg, already proven today). Second endpoint for thumbnails. Bearer auth like the render service. Installer is the render-service installer with a second unit.

**RenderScript changes in `Build Render Request`:**
- One `Scene-N` per frame; `time` = cue timestamp, `duration` = next cue − this cue. **No `fade` transition** (brand rule: cut in). Keep `pan` push-in, 100→103 %, slower than ambient's 106.
- Optional `Card-N` text elements (Plex Sans Bold, chalk on navy) for punch lines, 2.5 s, when the storyboard marks a frame `text_card`.
- `Audio` = concatenated narration. Either the render service concatenates the five section files (add `sources[]` support) or a small n8n code node builds a single file first. I'd put it in the render service — one place that knows ffmpeg.
- Optional `Bed` audio element at `volume: '8%'` from `ambient_bed_url`, `loop: true`.
- `Fade-Out` shrinks from 20 s to 2 s; the end screen frame is the last scene.

**Render service edits (`render.mjs`):** support `transition: none` (currently always cross-fades), `sources[]` concat for the audio element, a second audio track mixed at volume, and `text` elements with a font path for Plex (install the two Plex families in `install.sh`). `planFromSource` is where all of that lands. The drawtext capability flag already exists.

**Dot motion along pipes** — the signature animation — is *not* in v1. Static frames + push-in + cuts ships first. Dots become an SVG `animateMotion` rendered to a short clip by the frame service in v2, once ten videos exist and you know it's worth it.

---

## 7. What this buys, honestly

Per video after the pipeline exists: draft in minutes, TTS and frames in ~10 minutes unattended, render ~real-time, upload automatic. Your hours go to: editing the draft (the real work, 2–4 h), checking frames in Slack, watching the MP4 once. Roughly 15 h → 6 h per video. The pipeline itself: ~20 h to adapt, mostly the draft prompt, the validator, the frame service, and the render.mjs edits. It pays back around video 4.

What it does **not** buy: better scripts. The draft prompt will produce a competent, slightly generic, occasionally wrong explanation every time. The correction is the channel.

---

## 8. Suggested build order

1. Copy folder → `money-pipes-pipeline/`, new branch `claude/money-pipes-pipeline`. Strip the removed nodes; keep everything green in `check-workflow`.
2. `prompts/draft.system.md` + schema + validator + fixtures. Harness dry-run against today's approved script until the validator passes on it (it should — it was written to the rules).
3. Frame service from `gen_frames.py`; deploy next to the render service; smoke-test with video 1's storyboard.
4. Render edits: `transition: none`, audio concat, text cards, Plex fonts. Render video 1 from stub narration.
5. WF-A end to end with Notion; WF-B in `asset_mode = stub`; then live TTS once the clone exists.
6. Metadata prompt, thumbnails, `thumbnails.set`, Notion write-back. First private upload.

Video 1 is still produced by hand this week — the pipeline is built against it as the reference, not used to make it.
