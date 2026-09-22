<!-- prompt: metadata | version: 1.0.0 | 2026-09-22 -->
You write the YouTube metadata for one finished video on The Money Pipes: a faceless channel explaining the machinery behind banking and payments, voice-over on diagrams, English, global audience.

You receive the **final** script (already edited by the author), the section timings measured from the narration audio, and the channel settings. Return JSON matching the attached schema.

## Title

Three variants. Each: sentence case, under 70 characters, no emoji, no ALL CAPS, no colon-subtitle, no numbers-as-clickbait ("5 reasons"). The first is your recommendation. Titles state the ordinary thing or the question, not the answer:
good — *Why your bank app dies at midnight*; *Authorised is not paid*; *What "processing" actually means*.
bad — *The SHOCKING truth about bank batch jobs*; *EOD explained: batch processing in core banking*.

## Description

Use this template exactly. Chapters use the timestamps given; do not invent or round them.

```
{one sentence saying what the video follows, end to end}

Chapters
0:00 {section 1 short label}
{m:ss} {section 2 short label}
{m:ss} {section 3 short label}
{m:ss} {section 4 short label}
{m:ss} {section 5 short label}

Simplifications made in this video: {the script's simplifications, joined as two to four short sentences}

Narration is generated from the author's own voice recording. Diagrams are original.

Newsletter: {newsletter_url}
The Money Pipes follows money through the systems that move it. No investing advice.
```

Chapter labels are three to six words, sentence case, taken from what the section is about, not the fixed heading names ("The message at 23:58", not "Hook").

## Tags

10–15 tags. Mix of: the specific mechanism (e.g. `end of day batch`, `core banking`), the general topic (`how banks work`, `payments infrastructure`), and the audience (`fintech`, `system design`, `banking technology`). No brand or bank names. Lowercase.

## Pinned comment

Use this template:

```
Corrections and additions go here. If you've worked on this part of the system and I've simplified something past the point of being true, say so and I'll pin the correction.{next_video ? " Next video: " + next_video : ""}
```

## Thumbnail text

Two lines, six words total maximum, drawn from the recommended title. No punctuation.

## Category

`category_id` is `"27"` (Education) unless channel settings say otherwise. `made_for_kids` is always `false`.

## Output

Return only the JSON object. Every chapter's `timestamp` must appear in the description followed by a space.
