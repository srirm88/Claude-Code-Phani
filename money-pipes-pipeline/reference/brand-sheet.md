# The Money Pipes — Brand Sheet v1

Status: draft for approval. Nothing here is checked for handle, domain or trademark availability.

---

## 1. Identity

**Name:** The Money Pipes

**Tagline (locked):** Money is a message.

**One-line promise (for the banner and the About page):**
Money doesn't move. Messages do. This channel follows them through the pipes — card networks, clearing houses, core banking, batch windows, queues — and shows where they wait, where they leak, and why they sometimes get stuck.

**Channel description (YouTube About, under 1,000 characters):**
Every tap, transfer and salary credit is a message travelling through a network of pipes that almost nobody has seen. The Money Pipes opens the floor. Each video takes one thing you do with money and follows it end to end: the card tap, the month-end freeze, the international transfer that took three days, the app that went down at midnight. No investing advice, no product reviews. Just how the machine is built, explained by someone who has spent fifteen years inside it. New video roughly every ten days.

**Handle candidates (check in this order):** @themoneypipes · @moneypipes · @money.pipes · @themoneypipes_

**Positioning in one sentence:** Practical Engineering for banking. The channel is about the pipes, not the money.

**What it is not:** personal finance, investing, fintech news, product tutorials, career advice.

---

## 2. The 30-second intro (for the channel trailer, and reusable as the standard cold-open template)

> When you tap your card, nothing moves. No money leaves your account and arrives at the shop. What actually happens is a message — about two hundred bytes — leaves the terminal, crosses four companies you've never heard of, gets an answer, and comes back. Four seconds. Your balance changes because a ledger somewhere was told to change it.
>
> That's the whole system. Messages, pipes, ledgers. And the pipes are old, complicated, and occasionally on fire.
>
> This channel opens the floor. I've spent years building and fixing the pipes inside banks. I'm not going to tell you what to do with your money. I'm going to show you where it goes.

(Recording note: read it flat, slightly amused. The line "occasionally on fire" is the only place to let the voice smile.)

---

## 3. Visual system

### Colour tokens

| Token | Hex | Use |
|---|---|---|
| Vault navy | `#10273A` | Every background. Never gradients. |
| Chalk | `#EAE4D6` | All primary text and diagram outlines on navy. |
| Copper | `#B8722C` | The one accent: pipes carrying flow, the channel wordmark, the active element in a diagram. |
| Fault red | `#D64545` | Only where something breaks. If a video has no fault, this colour does not appear. |
| Pipe grey | `#5F6B76` | Inactive pipes, secondary lines, dimmed labels. |

Rules: one accent, not two. Copper is the brand; red is a signal. A thumbnail that uses red with nothing broken in it is lying.

### Typography

One family, two cuts, both free on Google Fonts:

- **IBM Plex Sans, Bold / SemiBold** — titles, thumbnails, section headers.
- **IBM Plex Mono, Regular / Medium** — diagram labels, timestamps, numbers, the wordmark.

Why Plex: it was designed for IBM, which is the company whose machines still run most of the pipes in the video. The audience who knows will smile; the audience who doesn't gets a clean, slightly technical face. Fallbacks: Inter for sans, JetBrains Mono for mono.

Scale (for on-screen use at 1920×1080): title 96–120px, subtitle 48px, diagram label 28–32px mono, footnote 24px mono. Nothing smaller than 24px ever reaches the screen; it will not survive a phone.

### Diagram grammar — the fixed vocabulary

Every video draws the same objects the same way. This is what makes the channel recognisable and the diagrams cheap.

| System concept | Drawn as |
|---|---|
| Account / ledger | Tank (rounded rectangle, level line showing balance) |
| Message in transit | Chalk dot moving through a pipe |
| Pipe / rail / network | Thick line, copper when active, grey when idle |
| Queue | Pipe with a visible column of dots stacked inside |
| Gateway / switch / router | Valve (circle with a cross) |
| Batch window / cut-off | Gate that closes across a pipe, with a clock |
| Limit / throttle | Narrowing in the pipe |
| Failure | Pipe turns fault red at the break point; a small drip |
| External party (network, scheme, other bank) | Tank drawn with a dashed outline |
| Time passing | Pressure gauge that moves, never a spinner |

Rules: left-to-right flow always. Money never flows upward. Maximum seven objects on screen at once. Labels in mono, sentence case, under four words.

### Motion

One kind of movement: dots travelling through pipes. Everything else appears by cutting in, not fading or sliding. When something breaks, the dot stops and the pipe segment turns red. That is the entire animation language, and it is deliberately small enough to produce in DaVinci Resolve or Figma without an animator.

---

## 4. Thumbnail system

**Canvas:** 1280×720. Design at that size, then check it at 168×94 (mobile feed size). If the title is unreadable at 168 wide, it is wrong.

**One layout, three variants.**

```
+------------------------------------------------+
|                                                |
|  Big title line one                            |
|  Big title line two          [diagram element] |
|                                                |
|  the money pipes                               |
+------------------------------------------------+
```

- Title: IBM Plex Sans Bold, chalk, left-aligned, two lines maximum, six words maximum across both lines. No punctuation.
- Diagram element: one object from the grammar, copper, occupying the right third. Never a stock photo, never a face, never a logo of a real bank.
- Wordmark: "the money pipes" in Plex Mono, copper, bottom-left, small. Present on every thumbnail so a row of them reads as one channel.
- Background: vault navy, flat.

**Variant A — Flow.** Copper pipe with dots moving. For "how X works" videos.
**Variant B — Fault.** Same pipe, one segment fault red with a drip. For outage, failure and "why it broke" videos. Red appears in thumbnails only for this variant.
**Variant C — Gate.** Closed gate across the pipe with a clock. For batch, cut-off and month-end videos.

Rules: no arrows pointing at things, no circled elements, no "shocked" anything, no yellow. The channel's thumbnails should look like someone competent made them, not like someone is shouting.

---

## 5. Channel assets

**Avatar (locked):** a copper four-way pipe cross on vault navy with a chalk coin at the hub carrying a $ — money at the switch. Provided as `the-money-pipes-avatar-final.svg`. Export at 800×800 PNG for YouTube; the $ glyph should be converted to outlines before export so it does not depend on the font being installed.

**Banner (2560×1440, safe area 1546×423):** vault navy; a single horizontal copper pipe running the full width through the safe area with three chalk dots in it; wordmark left, tagline right, both in Plex Mono. Nothing else.

**End screen (last 20 seconds):** two slots — the previous video in the series, and subscribe. Both sit inside tank shapes from the grammar, so the end screen looks like part of the diagram rather than a bolted-on card.

**Pinned comment template:**
> Corrections and additions go here. If you've worked on this part of the system and I've simplified something past the point of being true, say so and I'll pin the correction. Next video: [title].

**Video description template:**
> [One sentence saying what the video follows, end to end.]
>
> Chapters
> 0:00 [hook]
> ...
>
> Simplifications made in this video: [two or three lines, honest]
>
> Newsletter: [link]
> The Money Pipes follows money through the systems that move it. No investing advice.

---

## 6. Voice and tone

**Who is talking:** someone who has been inside the machine and finds it more interesting than infuriating. Calm, precise, dry. Never breathless, never "you won't believe."

**How a video is structured (every time):**
1. The hook — the ordinary thing you did (tapped, transferred, checked the app).
2. The thing everyone gets wrong about it.
3. The mechanism — the pipes, in order, left to right.
4. Where it breaks — the fault, and why the design allows it.
5. The takeaway — one sentence you can repeat to a colleague.

**Jargon rule:** every technical term gets one plain-English translation the first time it appears, then is used freely. "Settlement — the moment the banks actually move the money between themselves, usually hours later."

**Numbers rule:** use them, and say where they come from. "Roughly" is allowed; invented precision is not.

**Things the narration never says:** "in this video I will," "let's dive in," "smash that like button," "guys." No jokes about COBOL being old; that is the one cliché of the genre and the audience has heard it.

---

## 7. Anonymisation rules (non-negotiable, applied to every script before recording)

1. No bank is named as the subject of a story, ever. Not the employer, not a previous employer, not a client.
2. No vendor or product is named in a war story. Products may be named in neutral explainers ("core banking systems such as Finacle, Temenos and T24 exist") but never as the thing that failed.
3. No number that could identify an institution: transaction volumes, customer counts, dates of specific outages, internal system names.
4. Stories are told as patterns: "a bank," "a payments team," "a queue." Composite stories are fine and should be labelled as such in the description.
5. Nothing that is in a current or former employer's internal documents, incident reports, or architecture diagrams, in any form.
6. Public incidents (widely reported outages) may be discussed using only public sources, cited in the description.
7. When in doubt, the line is out. Reviewer question before every recording: "Could a colleague watch this and know which system I mean?" If yes, rewrite.

---

## 8. Open items for approval

- Palette and type as specified above, or adjust.
- Avatar and thumbnail mockups (attached as SVG) — approve the direction, not the pixels.
- Tagline: locked — "Money is a message."
- Intro line: changed to "years" (recommended; revert if you prefer the number).
