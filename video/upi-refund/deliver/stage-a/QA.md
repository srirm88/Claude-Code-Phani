# Stage A QA: hook (0:00–0:29.2)

## Inputs
No narration WAV, music, hero frames or `hook-animatic.mp4` arrived with the brief, only the markdown. So this is the **no-narration path**. Timings are the §7 estimates (150 wpm), preview captions are burned in, the file and its metadata title are labelled `PREVIEW (estimated timing)`, and there is **no audio track**. Composition follows the written descriptions, not the hero frames.

## What I checked
- **Fonts:** Chrome DevTools (`CSS.getPlatformFontsForNode`) shows ₹, •, − and · rendering in IBM Plex Sans Bold/Regular and IBM Plex Mono Medium, with no fallback font. ₹ is only in Plex's latin-ext subset, which is loaded explicitly.
- **File (ffprobe):** 1920×1080, 30/1 fps, H.264 High, yuv420p, bt709 primaries/transfer/matrix, tv range, 876 frames, 29.200 s, no audio (so no LUFS check).
- **Pacing (`pacing.txt`):** all 11 shots pass the hook tier (a new event at least every 3 s, a cut at least every 5 s). The longest shot is 3.6 s, the shortest 1.6 s, and the largest gap between events is 2.0 s.
- **Dates and amounts:** SAT 10 (calendar), 9:14 (wall clock), WED 14 (sent back), ₹4,000 and ₹100 match §6. I checked that 10 Oct 2026 is a Saturday and 14 Oct a Wednesday.
- **Colour:** no red and no yellow anywhere in the hook. Copper appears only on the coin, the PAY button, 5 DAYS, tile 5, the WED 14 band, the "working" marker ring and −₹4,000.
- **Banned items:** no arrows, no faces or hands, no logos. The only names on screen are Tidewalk and UPI (as plain text).
- **First frame after every cut:** I viewed each one. Something is on screen in all of them.

## What failed and how I fixed it
1. The rule card's ₹100 tag hung off the bottom of the frame (s1-f8b). It now hangs inside the card's lower-right corner.
2. The PENDING state used a dashed ring on the phone, which reads as a spinner (banned). It is now a static grey clock face. The dashed grey ring stays on the coin only, as the brief asks.
3. The marker ring around "working" overlapped "5" and "days". I tightened it and moved the headline up.
4. In the living room (s1-f3) the phone looked stuck to the window, and the sofa had no form. I redrew the sofa and laid the phone flat on the arm, screen up, with its light rising onto the wall.
5. The shoe silhouette read as an iron. I redrew it as a running-shoe profile with a midsole, and moved the RETURN slip so it no longer covers the shoe.
6. The stopwatch's hand covered its readout, and the top-middle of s1-f1 was dead space. The stopwatch is now bigger and sits top-centre-right, with the readout drawn above the hand.
7. In s1-f9 the day counter collided with the falling coins. The counter is now right-aligned above the stack.
8. A door-panel seam ran through −₹4,000 (s1-f4). The lower door is now one wide panel.
9. First frames after cuts:
   - s1-f1: the coin's streak stuck out past the phone. It is now clipped to the tube.
   - s1-f2: the right half was empty at the cut. 5 DAYS and the tiles are now partly in at frame 0.
   - s1-f6: the printout started mostly below the frame. It now starts higher.

## Deviations and open points for you to decide
- **s1-f2 has four text elements** (OUT, 2 SEC, BACK, 5 DAYS) against the cap of three. The brief's own screen description asks for all four, so I kept them. Drop the kickers if the cap is strict.
- **s1-f3 phone:** "phone small on the sofa arm" makes any on-screen text smaller than 24 px, so the phone shows UI blocks and the copper PAY button, with no words.
- **s1-f8a stopwatch:** it keeps running past 00:02 (00:04 to 00:06) to sell "stuck". The brief doesn't ask for this; tell me if you'd rather it stay frozen at 00:02.
- **s1-f7:** one coin moves from line to line and leaves grey ghost rings where it was ("past" = grey), rather than three coins, which would read as three payments.
- **Dates rule contradiction in the brief:** s1-f2 says dates are "saved for s3-f15", while s1-f5 says "until s3-f8" and itself shows WED 14. I followed each screen's own description.
- **Captions and the PREVIEW tag** sit outside the y 100–930 content box. They are scaffolding and don't count toward the text cap.

## Cost note for Stage B
A render takes about 0.8 s per frame on this 4-core box (large SVG blur filters plus grain). The full 8:10 is about 14,700 frames, so roughly 3+ hours. Before Stage B I'll cut that, for example by pre-rasterising shadows.
