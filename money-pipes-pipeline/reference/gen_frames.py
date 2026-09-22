#!/usr/bin/env python3
"""Generate the 20 storyboard frames for Video 1 as SVGs in The Money Pipes diagram grammar."""
import os

NAVY, CHALK, COPPER, RED, GREY = "#10273A", "#EAE4D6", "#B8722C", "#D64545", "#5F6B76"
W, H = 1920, 1080
MONO = "IBM Plex Mono, JetBrains Mono, monospace"
SANS = "IBM Plex Sans, Inter, sans-serif"
OUT = "/mnt/user-data/outputs/video-01-frames"
os.makedirs(OUT, exist_ok=True)


def label(x, y, text, size=30, fill=CHALK, anchor="middle", font=MONO, weight="500"):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{font}" font-weight="{weight}" font-size="{size}" fill="{fill}">{text}</text>'


def pipe(x1, y1, x2, y2, color=COPPER, w=28):
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="{w}" stroke-linecap="round" fill="none"/>'


def dot(x, y, r=12, fill=CHALK):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


def tank(x, y, w, h, name=None, level=None, color=CHALK, dashed=False, fill_active=None):
    dash = ' stroke-dasharray="14 10"' if dashed else ""
    fill = fill_active if fill_active else "none"
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{fill}" stroke="{color}" stroke-width="8"{dash}/>'
    if level is not None:
        ly = y + h - h * level
        s += f'<path d="M{x+14} {ly} H{x+w-14}" stroke="{CHALK}" stroke-width="5" stroke-linecap="round"/>'
    if name:
        s += label(x + w / 2, y + h + 46, name)
    return s


def valve(x, y, name=None, r=34):
    s = f'<circle cx="{x}" cy="{y}" r="{r}" fill="{NAVY}" stroke="{CHALK}" stroke-width="8"/>'
    k = r * 0.5
    s += f'<path d="M{x-k} {y-k} L{x+k} {y+k} M{x+k} {y-k} L{x-k} {y+k}" stroke="{CHALK}" stroke-width="7" stroke-linecap="round"/>'
    if name:
        s += label(x, y + r + 44, name)
    return s


def gate(x, y, closed=True, name=None):
    """Vertical gate across a horizontal pipe centred at (x,y)."""
    if closed:
        s = f'<rect x="{x-12}" y="{y-70}" width="24" height="140" rx="6" fill="{CHALK}"/>'
    else:
        s = f'<rect x="{x-12}" y="{y-150}" width="24" height="70" rx="6" fill="{CHALK}"/>'
    s += f'<rect x="{x-40}" y="{y-160}" width="80" height="16" rx="4" fill="{GREY}"/>'
    if name:
        s += label(x, y + 110, name)
    return s


def clock(x, y, text, r=54, color=CHALK):
    s = f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{color}" stroke-width="6"/>'
    s += f'<path d="M{x} {y} V{y-r*0.6}" stroke="{color}" stroke-width="7" stroke-linecap="round"/>'
    s += f'<path d="M{x} {y} L{x+r*0.4} {y}" stroke="{color}" stroke-width="7" stroke-linecap="round"/>'
    s += label(x, y + r + 40, text)
    return s


def phone(x, y, text=None):
    s = f'<rect x="{x}" y="{y}" width="120" height="220" rx="20" fill="none" stroke="{CHALK}" stroke-width="8"/>'
    s += f'<rect x="{x+48}" y="{y+190}" width="24" height="8" rx="4" fill="{CHALK}"/>'
    if text:
        s += label(x + 60, y + 118, text, size=22, fill=RED if "unavail" in text else CHALK)
    return s


def drip(x, y):
    return f'<path d="M{x} {y} q0 22 -16 34 q-16 -12 -16 -34 q16 -18 32 0z" fill="{RED}"/>'


def frame(n, title, body, footer=None):
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
           f'<rect width="{W}" height="{H}" fill="{NAVY}"/>']
    svg.append(label(80, 90, f"{n:02d}", size=28, fill=GREY, anchor="start"))
    svg.append(label(140, 90, title, size=28, fill=GREY, anchor="start"))
    svg.append(label(W - 80, H - 50, "the money pipes", size=26, fill=COPPER, anchor="end"))
    svg.extend(body)
    if footer:
        svg.append(label(W / 2, H - 120, footer, size=44, font=SANS, weight="700"))
    svg.append("</svg>")
    with open(f"{OUT}/frame-{n:02d}.svg", "w") as f:
        f.write("\n".join(svg))


# Shared layout: phone at left, pipe across the middle, ledger tank at right
PY = 540
PX = 220
LX, LY, LW, LH = 1420, 400, 320, 280
GX = 1100

# 01 — hook
frame(1, "It's 11:58 at night", [
    phone(PX, PY - 110), pipe(PX + 140, PY, LX - 20, PY), tank(LX, LY, LW, LH, "ledger", level=0.55),
    dot(560, PY), clock(1700, 160, "23:58"),
])

# 02 — gate drops
frame(2, "temporarily unavailable", [
    phone(PX, PY - 110, "unavailable"), pipe(PX + 140, PY, GX - 20, PY), pipe(GX + 20, PY, LX - 20, PY, GREY),
    gate(GX, PY, closed=True), tank(LX, LY, LW, LH, "ledger", level=0.55, color=GREY),
    dot(GX - 60, PY), clock(1700, 160, "23:58"),
])

# 03 — clock ticks
frame(3, "a gate closed, on a schedule", [
    phone(PX, PY - 110), pipe(PX + 140, PY, GX - 20, PY), pipe(GX + 20, PY, LX - 20, PY, GREY),
    gate(GX, PY, closed=True), tank(LX, LY, LW, LH, "ledger", level=0.55, color=GREY),
    dot(GX - 60, PY), clock(1700, 160, "00:00", color=COPPER),
])

# 04 — two kinds of system
frame(4, "two very different kinds of system", [
    f'<path d="M{W/2} 180 V900" stroke="{GREY}" stroke-width="4" stroke-dasharray="12 12"/>',
    label(480, 200, "always on", size=40, font=SANS, weight="700"),
    label(1440, 200, "the ledger", size=40, font=SANS, weight="700"),
    valve(300, 520, "app"), valve(480, 520, "card"), valve(660, 520, "ATM"),
    tank(1240, 380, 400, 300, "one big tank", level=0.55),
])

# 05 — business date label
frame(5, "the bank has a date", [
    tank(760, 340, 400, 300, None, level=0.55),
    f'<rect x="700" y="690" width="520" height="70" rx="10" fill="{COPPER}"/>',
    label(960, 737, "business date: today", size=32, fill=NAVY),
])

# 06 — follow it, gate open
frame(6, "Let's follow it", [
    phone(PX, PY - 110), pipe(PX + 140, PY, LX - 20, PY), gate(GX, PY, closed=False),
    tank(LX, LY, LW, LH, "ledger", level=0.55),
    dot(500, PY), dot(700, PY), dot(900, PY), clock(1700, 160, "22:00"),
])

# 07 — cut-off
frame(7, "there is a cut-off", [
    phone(PX, PY - 110), pipe(PX + 140, PY, GX - 20, PY), pipe(GX + 20, PY, LX - 20, PY, GREY),
    gate(GX, PY, closed=True, name="day closed"), tank(LX, LY, LW, LH, "ledger", level=0.55, color=GREY),
    clock(1700, 160, "cut-off", color=COPPER),
])

# 08 / 09 — job chain column
JOBS = ["close day", "accrue interest", "fees &amp; instructions", "general ledger", "outputs", "backup", "roll date", "open day"]


def job_column(active=None, failed=None, extra=None):
    items = list(JOBS)
    if extra:
        items = items[:3] + extra + items[3:]
    n = len(items)
    top, bottom = 170, 950
    step = (bottom - top) / (n - 1)
    body = []
    x = 900
    for i, name in enumerate(items):
        y = top + i * step
        if i < n - 1:
            col = GREY if (failed is not None and i >= failed) else COPPER
            body.append(pipe(x, y + 30, x, y + step - 30, col, 14))
        if failed is not None and i == failed:
            col, fill = RED, None
        elif failed is not None and i > failed:
            col, fill = GREY, None
        elif active is not None and i == active:
            col, fill = COPPER, COPPER
        elif active is not None and i < active:
            col, fill = COPPER, None
        else:
            col, fill = GREY if active is not None else CHALK, None
        body.append(f'<rect x="{x-140}" y="{y-30}" width="280" height="60" rx="14" fill="{fill or "none"}" stroke="{col}" stroke-width="6"/>')
        body.append(label(x + 200, y + 10, name, size=28, anchor="start", fill=NAVY if fill else CHALK))
        if fill:
            body.append(label(x, y + 10, name, size=26, fill=NAVY))
        if failed is not None and i == failed:
            body.append(drip(x + 170, y + 30))
    return body


frame(8, "a chain of jobs", job_column())
frame(9, "each job in turn (accrue interest active)", job_column(active=1))

# 10 — requests waiting
frame(10, "the app's request lands at a closed gate", [
    phone(PX, PY - 110), pipe(PX + 140, PY, GX - 20, PY), pipe(GX + 20, PY, LX - 20, PY, GREY),
    gate(GX, PY, closed=True), tank(LX, LY, LW, LH, "ledger", level=0.55, color=GREY),
    dot(GX - 60, PY), dot(GX - 110, PY), dot(GX - 160, PY),
])

# 11 — reject
frame(11, "Option one: reject", [
    phone(PX, PY - 110, "unavailable"), pipe(PX + 140, PY, GX - 20, PY), pipe(GX + 20, PY, LX - 20, PY, GREY),
    gate(GX, PY, closed=True), tank(LX, LY, LW, LH, "ledger", level=0.55, color=GREY),
    dot(GX - 60, PY), f'<path d="M{GX-100} {PY-60} L{GX-300} {PY-60}" stroke="{CHALK}" stroke-width="6" stroke-dasharray="14 12" marker-end="url(#a)"/>',
    f'<defs><marker id="a" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12z" fill="{CHALK}"/></marker></defs>',
], footer="reject")

# 12 — queue
frame(12, "Option two: queue", [
    phone(PX, PY - 110), pipe(PX + 140, PY, LX - 20, PY), gate(GX, PY, closed=False),
    tank(LX, LY, LW, LH, "ledger · dated tomorrow", level=0.6),
    dot(GX + 80, PY), dot(GX + 140, PY), dot(GX + 200, PY), dot(GX + 260, PY),
], footer="queue")

# 13 — stand-in
frame(13, "Option three: stand-in", [
    phone(PX, PY - 110), pipe(PX + 140, PY, GX - 20, PY), pipe(GX + 20, PY, LX - 20, PY, GREY),
    gate(GX, PY, closed=True), tank(LX, LY, LW, LH, "ledger", level=0.55, color=GREY),
    pipe(600, PY, 600, 260), pipe(600, 260, 760, 260),
    tank(780, 190, 260, 140, "stand-in balance", dashed=True, level=0.55),
    dot(700, 260, fill=COPPER), label(1060, 270, "✓", size=54, fill=COPPER),
    dot(GX - 60, PY), label(GX - 60, PY + 70, "transfer waits", size=24, fill=GREY),
    label(700, 220, "card", size=24, fill=GREY),
], footer="stand-in")

# 14 — month-end
frame(14, "month-end is worse", job_column(extra=["capitalise interest", "monthly fees", "statements"]))

# 15 — stuck job
frame(15, "The stuck job", job_column(failed=3))

# 16 — half-open gate
frame(16, "The half-open gate", [
    phone(PX, PY - 110), pipe(PX + 140, PY, LX - 20, PY), gate(GX, PY, closed=False),
    tank(LX, LY, LW, LH, "ledger · open", level=0.55),
    pipe(LX + LW / 2, LY + LH + 60, LX + LW / 2, 900, GREY), pipe(LX + LW / 2, 780, LX + LW / 2, 900, RED),
    label(LX + LW / 2, 960, "alerts", size=28, fill=RED), drip(LX + LW / 2 + 40, 900),
])

# 17 — date rolled twice
frame(17, "The date that rolled twice", [
    tank(760, 300, 400, 300, None, level=0.55, color=RED),
    f'<rect x="640" y="650" width="640" height="70" rx="10" fill="{RED}"/>',
    label(960, 697, "today → tomorrow → day after", size=30, fill=NAVY),
])

# 18 — not a design flaw
frame(18, "not a design flaw", [
    tank(420, 340, 400, 300, "single business date", level=0.55),
    tank(1100, 340, 400, 300, "continuous ledger", level=0.55, dashed=True),
])

# 19 — takeaway
frame(19, "the rule of thumb", [
    valve(320, 420, "card"), pipe(360, 420, 560, 420), tank(580, 350, 220, 140, "stand-in", dashed=True), label(830, 435, "✓", size=54, fill=COPPER),
    valve(320, 720, "transfer"), pipe(360, 720, 560, 720), gate(620, 720, closed=True), pipe(680, 720, 800, 720, GREY),
    f'<rect x="1200" y="330" width="440" height="440" rx="20" fill="none" stroke="{CHALK}" stroke-width="8"/>',
    f'<path d="M1200 420 H1640" stroke="{CHALK}" stroke-width="6"/>',
    *[f'<rect x="{1240+ (i%7)*57}" y="{450 + (i//7)*70}" width="40" height="40" rx="6" fill="none" stroke="{GREY}" stroke-width="3"/>' for i in range(28)],
    f'<rect x="{1240+6*57}" y="{450+3*70}" width="40" height="40" rx="6" fill="{RED}"/>',
    label(1420, 385, "month", size=30),
])

# 20 — end screen
frame(20, "Money is a message", [
    label(W / 2, 420, "The Money Pipes", size=110, font=SANS, weight="700"),
    label(W / 2, 510, "Money is a message.", size=48, fill=COPPER),
    tank(380, 640, 500, 280, "next video", dashed=True),
    tank(1040, 640, 500, 280, "subscribe", dashed=True),
])

print(f"wrote {len(os.listdir(OUT))} frames to {OUT}")
