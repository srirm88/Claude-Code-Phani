// Section 1: Hook (0:00 - 0:29.2). Estimated timing at 150 wpm (no narration supplied).
const SHOTS = [];
const CAPTIONS = [];
function shot(o) { SHOTS.push(o); }
function cap(start, end, text) { CAPTIONS.push({ start, end, text }); }

// ---- shared hook pieces ----
function payPhone(x, y, w, h, status, o = {}) {
  return phone(x, y, w, h, (sw, sh) => {
    let s = kicker(sw / 2, sh * 0.16, 'UPI', { size: 28, anchor: 'middle', op: 0.55 });
    s += T(sw / 2, sh * 0.36, '₹4,000', { size: Math.round(sw * 0.24), w: 700, anchor: 'middle' });
    s += T(sw / 2, sh * 0.45, 'To: Tidewalk', { mono: true, size: Math.round(sw * 0.085), anchor: 'middle', op: 0.75 });
    if (status === 'paid') {
      const p = o.tickP != null ? o.tickP : 1;
      s += `<circle cx="${sw / 2}" cy="${f1(sh * 0.66)}" r="${f1(sw * 0.17)}" fill="${C.chalk}" opacity="${f1(0.12 * p)}"/>` + tick(sw / 2, sh * 0.66, sw * 0.2, p);
      s += T(sw / 2, sh * 0.84, 'Paid', { size: Math.round(sw * 0.13), w: 600, anchor: 'middle', op: clamp(p * 2) });
    } else if (status === 'paying') {
      s += `<circle cx="${sw / 2}" cy="${f1(sh * 0.66)}" r="${f1(sw * 0.17)}" fill="${C.chalk}" opacity="0.06"/>`;
      s += T(sw / 2, sh * 0.84, 'Paying', { size: Math.round(sw * 0.13), w: 600, anchor: 'middle', op: 0.45 });
    } else if (status === 'pending') {
      const pulse = o.pulse || 0;
      s += clockFace(sw / 2, sh * 0.64, sw * 0.15, 10, 10, { face: '#2B4357', rim: C.grey, ink: C.chalk });
      s += `<rect x="${f1(sw * 0.16)}" y="${f1(sh * 0.78)}" width="${f1(sw * 0.68)}" height="${f1(sh * 0.09)}" rx="${f1(sh * 0.045)}" fill="${C.grey}" opacity="${f1(0.35 + pulse * 0.35)}"/>`;
      s += T(sw / 2, sh * 0.845, 'PENDING', { mono: true, w: 700, size: Math.round(sw * 0.085), anchor: 'middle', ls: '0.12em' });
    }
    return s;
  }, o);
}
function receiver(x, y) {
  return `<g filter="url(#shS)"><rect x="${x - 120}" y="${y - 38}" width="240" height="64" rx="8" fill="url(#paper)"/></g>
    ${T(x, y + 6, 'TIDEWALK', { mono: true, w: 700, size: 30, fill: C.ink, anchor: 'middle', ls: '0.2em' })}
    <rect x="${x - 4}" y="${y + 26}" width="8" height="40" fill="#1E3F57"/>`;
}
const TUBE = { x1: 470, x2: 1790, y: 610, h: 230 };
function outScene(coinX, coinOp, extra = '') {
  return `${tubeStand(860, TUBE.y, TUBE.h, 890)}${tubeStand(1480, TUBE.y, TUBE.h, 890)}
    ${tubeBack(TUBE.x1, TUBE.x2, TUBE.y, TUBE.h)}${extra}`;
}

// ---------------- s1-f1 ----------------
shot({
  defs: `<clipPath id="tubeClip"><rect x="${TUBE.x1}" y="${TUBE.y - TUBE.h / 2 - 60}" width="${TUBE.x2 - TUBE.x1}" height="${TUBE.h + 120}"/></clipPath>`,
  tout: { type: 'whip', dx: -1, dy: 0, dur: 0.5 }, id: 's1-f1', screen: 's1-f1', section: 1, start: 0.0, end: 3.6,
  what: 'Coin streaks through a glass tube from the phone; stopwatch runs 00:00 to 00:02 and stops; phone ticks Paid.',
  events: [0, 2.0, 2.3],
  draw(t, d) {
    const p = seg(t, 0, 2.0);
    const x = lerp(690, 1590, easeOut(p));
    const v = t < 2.0 ? (1 - p) * (1 - p) * 3 : 0;          // speed proxy for streak length
    const settle = t >= 2.0 ? Math.sin(seg(t, 2.0, 2.4) * Math.PI) * 10 : 0;
    const coinS = coin(x - settle, TUBE.y, 84) + streak(x - 30, TUBE.y, 84, 120 + v * 260);
    const done = t >= 2.0;
    return `<g transform="${cam(t / d, { s0: 1, s1: 1.035, fx: 980, fy: 560 })}">
      <ellipse cx="1130" cy="905" rx="760" ry="40" fill="#020910" opacity="0.35"/>
      ${outScene()}
      ${receiver(1650, 430)}
      <g clip-path="url(#tubeClip)">${coinS}</g>
      ${tubeFront(TUBE.x1, TUBE.x2, TUBE.y, TUBE.h)}
      ${payPhone(150, 185, 380, 720, done ? 'paid' : 'paying', { tickP: E(t, 2.0, 2.45), glow: 0.5 })}
      ${stopwatch(1300, 292, 140, Math.min(t, 2.0), { stopped: done })}
    </g>`;
  },
});
cap(0, 3.6, 'Your UPI payment leaves your account in two seconds,');

// ---------------- s1-f2 ----------------
shot({
  tin: { type: 'whip', dx: -1, dy: 0, dur: 0.45 }, id: 's1-f2', screen: 's1-f2', section: 1, start: 3.6, end: 6.0,
  what: 'Thumbnail split: 2 SEC / OUT with streaking coin vs 5 DAYS / BACK over five blank tiles, tile 5 copper.',
  events: [0, 0.25, 0.57, 1.5],
  defs: `<linearGradient id="splitL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0E2436"/><stop offset="1" stop-color="#081520"/></linearGradient>
         <linearGradient id="splitR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4161"/><stop offset="1" stop-color="#11293D"/></linearGradient>`,
  draw(t, d) {
    const cx = lerp(300, 660, t / d);
    const hp = E(t, 0, 0.4, easeOut);
    let tiles = '';
    for (let i = 0; i < 5; i++) {
      const tp = 0.35 + 0.65 * E(t, 0.25 + i * 0.08, 0.55 + i * 0.08, easeOut);
      const lit = i === 4 && t >= 1.5;
      tiles += `<g transform="translate(0,${f1((1 - tp) * 50)})" opacity="${f1(tp)}">${tile(1020 + i * 156, 640, 136, 210, lit ? { solid: true, glow: E(t, 1.5, 1.9) } : { band: 'grey' })}</g>`;
    }
    return `<g transform="${cam(t / d, { s0: 1.0, s1: 1.03, fx: 960, fy: 540, dx: -12 })}">
      <path d="M-1200,-60 L1080,-60 L870,1140 L-1200,1140 Z" fill="url(#splitL)"/>
      <path d="M1080,-60 L3100,-60 L3100,1140 L870,1140 Z" fill="url(#splitR)"/>
      <path d="M1080,-60 L870,1140" stroke="#000" stroke-opacity="0.35" stroke-width="16" filter="url(#blur8)"/>
      ${kicker(170, 330, 'OUT', { size: 44 })}
      ${T(160, 540, '2 SEC', { size: 210, w: 700 })}
      ${streak(cx - 20, 735, 74, 420)}${coin(cx, 735, 74)}
      ${kicker(1110, 300, 'BACK', { size: 44 })}
      <g opacity="${f1(0.55 + 0.45 * hp)}" transform="translate(1100,500) scale(${f1(lerp(1.12, 1, hp))}) translate(-1100,-500)">${T(1090, 500, '5 DAYS', { size: 180, w: 700, fill: C.copper })}</g>
      ${tiles}
    </g>`;
  },
});
cap(3.6, 6.0, 'and the refund takes five days.');

// ---------------- s1-f3 ----------------
function skyline() {
  const r = rng(42); let s = ''; let x = 1100;
  while (x < 1690) {
    const w = 40 + r() * 70, h = 90 + r() * 230, top = 600 - h;
    s += `<rect x="${f1(x)}" y="${f1(top)}" width="${f1(w)}" height="${f1(h)}" fill="${r() > 0.5 ? '#0B1C29' : '#0F2434'}"/>`;
    for (let wy = top + 14; wy < 590; wy += 26) for (let wx = x + 8; wx < x + w - 12; wx += 18) if (r() > 0.72) s += `<rect x="${f1(wx)}" y="${f1(wy)}" width="8" height="12" fill="${C.chalk}" opacity="${f1(0.25 + r() * 0.35)}"/>`;
    x += w + 6;
  }
  return s;
}
const SKY = skyline();
shot({
  tout: { type: 'push', fx: 1505, fy: 676, dur: 0.5 }, id: 's1-f3', screen: 's1-f3', section: 1, start: 6.0, end: 8.4,
  what: 'Dark living room, Saturday night: calendar SAT 10, clock 9:14, city window; phone on the sofa arm is the only light; Pay button pulses.',
  events: [0, 1.2],
  defs: `<radialGradient id="roomShade" gradientUnits="userSpaceOnUse" cx="1505" cy="640" r="1300">
      <stop offset="0" stop-color="#030A11" stop-opacity="0"/><stop offset="0.28" stop-color="#030A11" stop-opacity="0.2"/><stop offset="1" stop-color="#030A11" stop-opacity="0.62"/></radialGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A1D2C"/><stop offset="1" stop-color="#1D4262"/></linearGradient>`,
  draw(t, d) {
    const pulse = Math.max(0, Math.sin(seg(t, 1.2, 1.75) * Math.PI));
    // phone lying screen-up on the sofa arm, foreshortened; no text at this size
    const pw = 120, phh = 230;
    const flat = `<g transform="translate(1505,676) scale(1,0.42) rotate(-62)"><g transform="translate(${-pw / 2},${-phh / 2})">
      <rect width="${pw}" height="${phh}" rx="18" fill="#0A1823"/><rect x="8" y="10" width="${pw - 16}" height="${phh - 20}" rx="12" fill="#2C5878"/>
      <rect x="20" y="40" width="${pw - 40}" height="16" rx="8" fill="${C.chalk}" opacity="0.8"/>
      <rect x="30" y="70" width="${pw - 60}" height="10" rx="5" fill="${C.chalk}" opacity="0.45"/>
      <rect x="${f1(16 - pulse * 5)}" y="${f1(150 - pulse * 4)}" width="${f1(pw - 32 + pulse * 10)}" height="${f1(40 + pulse * 8)}" rx="12" fill="${C.copper}"/></g></g>`;
    const beam = `<ellipse cx="1500" cy="470" rx="${f1(330 + pulse * 30)}" ry="430" fill="url(#chalkGlow)" opacity="${f1(0.75 + pulse * 0.25)}"/>
      <ellipse cx="1505" cy="676" rx="150" ry="40" fill="#9FC3DE" opacity="${f1(0.18 + pulse * 0.1)}" filter="url(#blur8)"/>
      <ellipse cx="1505" cy="676" rx="${f1(70 + pulse * 30)}" ry="${f1(26 + pulse * 10)}" fill="${C.copper}" opacity="${f1(0.15 + pulse * 0.4)}" filter="url(#blur8)"/>`;
    return `<g transform="${cam(t / d, { s0: 1.0, s1: 1.05, fx: 1480, fy: 600 })}">
      <rect x="-40" y="-40" width="2000" height="1160" fill="#10273A"/>
      <rect x="-40" y="880" width="2000" height="300" fill="#0A1824"/>
      <rect x="980" y="110" width="700" height="500" rx="6" fill="#1A3650" filter="url(#sh)"/>
      <rect x="1000" y="130" width="660" height="460" fill="url(#sky)"/>
      <circle cx="1560" cy="215" r="70" fill="url(#chalkGlow)"/><circle cx="1560" cy="215" r="24" fill="${C.chalk}" opacity="0.55"/>
      <g transform="translate(-80,-10)">${SKY}</g>
      <rect x="1323" y="130" width="14" height="460" fill="#1A3650"/><rect x="1000" y="352" width="660" height="14" fill="#1A3650"/>
      <rect x="975" y="600" width="710" height="22" rx="4" fill="#1F4260"/>
      <circle cx="350" cy="160" r="7" fill="#7D8894"/><path d="M350,160 L280,205 M350,160 L420,205" stroke="#7D8894" stroke-width="3"/>
      ${tile(245, 200, 210, 250, { band: 'ink', day: 'SAT', date: '10', paperDim: true })}
      ${clockFace(700, 300, 100, 9, 14, { face: 'url(#paperDim)' })}
      <g filter="url(#sh)">
        <path d="M200,840 L200,620 Q200,560 260,560 L1340,560 Q1400,560 1400,620 L1400,840 Z" fill="#15304A"/>
        <rect x="120" y="650" width="190" height="270" rx="56" fill="#1B3A54"/>
        <rect x="1380" y="640" width="250" height="280" rx="60" fill="#1B3A54"/></g>
      <rect x="132" y="656" width="166" height="44" rx="22" fill="#24496A"/>
      <rect x="1394" y="646" width="222" height="56" rx="28" fill="#24496A"/>
      <rect x="290" y="600" width="530" height="170" rx="36" fill="#1A3851"/><rect x="840" y="600" width="530" height="170" rx="36" fill="#1A3851"/>
      <rect x="280" y="740" width="1110" height="110" rx="30" fill="#1E405B"/>
      <rect x="290" y="830" width="1090" height="80" rx="22" fill="#132C41"/>
      <rect x="200" y="910" width="26" height="30" fill="#081420"/><rect x="1560" y="910" width="26" height="30" fill="#081420"/>
      <rect x="-40" y="-40" width="2000" height="1160" fill="url(#roomShade)"/>
      ${beam}${flat}
    </g>`;
  },
});
cap(6.0, 8.4, 'Saturday night, you buy shoes online.');

// ---------------- s1-f4 ----------------
shot({
  tin: { type: 'push', fx: 960, fy: 300, dur: 0.45 }, id: 's1-f4', screen: 's1-f4', section: 1, start: 8.4, end: 10.0,
  what: "Full-frame iron letter slot in the store's door, TIDEWALK engraved; coin drops through; −₹4,000 rolls up in copper.",
  events: [0, 0.45, 0.6],
  defs: `<clipPath id="slotClip"><rect x="0" y="0" width="1920" height="348"/></clipPath>
         <clipPath id="rollClip"><rect x="200" y="660" width="1520" height="240"/></clipPath>
         <linearGradient id="door" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1A3D58"/><stop offset="1" stop-color="#0F283B"/></linearGradient>`,
  draw(t, d) {
    const cy = lerp(110, 520, E(t, 0, 0.5, easeIn));
    const flap = Math.sin(seg(t, 0.32, 0.75) * Math.PI);
    const roll = E(t, 0.6, 0.95, easeOut);
    let rivets = '';
    for (const [rx, ry] of [[500, 250], [1420, 250], [500, 540], [1420, 540]]) rivets += `<circle cx="${rx}" cy="${ry}" r="13" fill="#4C5E6C"/><circle cx="${rx - 3}" cy="${ry - 3}" r="6" fill="#71838F"/>`;
    return `<g transform="${cam(t / d, { s0: 1.0, s1: 1.03, fx: 960, fy: 420 })}">
      <rect x="-40" y="-40" width="2000" height="1160" fill="url(#door)"/>
      <rect x="150" y="640" width="1620" height="460" rx="12" fill="#0E2639"/><rect x="172" y="662" width="1576" height="440" rx="10" fill="#173852"/>
      <rect x="172" y="662" width="1576" height="10" fill="#22496A" opacity="0.6"/>
      <g filter="url(#sh)"><rect x="460" y="210" width="1000" height="370" rx="26" fill="url(#iron)"/></g>
      <rect x="470" y="216" width="980" height="8" rx="4" fill="#6F8392" opacity="0.5"/>
      ${rivets}
      <rect x="560" y="300" width="800" height="96" rx="16" fill="#03080C"/>
      <rect x="572" y="${f1(304 + flap * 20)}" width="776" height="${f1(Math.max(4, 40 - flap * 30))}" rx="10" fill="#33434F"/>
      ${T(962, 494, 'TIDEWALK', { mono: true, w: 700, size: 72, fill: '#5C7080', anchor: 'middle', ls: '0.32em' })}
      ${T(960, 491, 'TIDEWALK', { mono: true, w: 700, size: 72, fill: '#0C141A', anchor: 'middle', ls: '0.32em' })}
      <g clip-path="url(#slotClip)">${coin(960, cy, 120)}</g>
      <g clip-path="url(#rollClip)"><g transform="translate(0,${f1((1 - roll) * 200)})">${T(960, 840, '−₹4,000', { mono: true, w: 700, size: 180, fill: C.copper, anchor: 'middle' })}</g></g>
    </g>`;
  },
});
cap(8.4, 10.0, 'Four thousand rupees, gone.');

// ---------------- s1-f5 ----------------
shot({
  tout: { type: 'whip', dx: 0, dy: -1, dur: 0.5 }, id: 's1-f5', screen: 's1-f5', section: 1, start: 10.0, end: 13.2,
  what: 'Doorstep: shoe box on a mat; a paper RETURN stamp slaps on; a single WED 14 · SENT BACK tile fades in and lights copper.',
  events: [0, 1.0, 1.8, 2.0],
  defs: `<linearGradient id="wall5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A3B55"/><stop offset="1" stop-color="#132E44"/></linearGradient>`,
  draw(t, d) {
    const shake = t > 1.0 && t < 1.2 ? Math.sin((t - 1.0) * 90) * (1 - seg(t, 1.0, 1.2)) * 6 : 0;
    const tp = E(t, 1.8, 2.0);
    const lit = t >= 2.0;
    let planks = '';
    for (let i = 0; i < 6; i++) planks += `<line x1="-40" y1="${700 + i * 70}" x2="1960" y2="${700 + i * 70}" stroke="#0A1C29" stroke-width="3"/>`;
    let mat = '';
    for (let i = 0; i < 9; i++) mat += `<line x1="${620 + i * 85}" y1="700" x2="${585 + i * 92}" y2="840" stroke="#2E4A5E" stroke-width="10" opacity="0.6"/>`;
    return `<g transform="translate(0,${f1(shake)})"><g transform="${cam(t / d, { s0: 1.0, s1: 1.04, fx: 900, fy: 600, dx: -10 })}">
      <rect x="-40" y="-40" width="2000" height="700" fill="url(#wall5)"/>
      <rect x="-40" y="640" width="2000" height="1600" fill="#0D2232"/>${planks}
      <rect x="-40" y="610" width="2000" height="36" fill="#1E4560"/>
      <rect x="140" y="90" width="430" height="560" fill="#0C2131"/>
      <rect x="170" y="110" width="370" height="530" fill="#1C3F5A" filter="url(#sh)"/>
      <rect x="200" y="140" width="310" height="200" rx="6" fill="#163650"/><rect x="200" y="370" width="310" height="240" rx="6" fill="#163650"/>
      <circle cx="500" cy="380" r="12" fill="#3B5468"/>
      <path d="M560,840 L1360,840 L1300,690 L620,690 Z" fill="#22394A" filter="url(#sh)"/>${mat}
      <g filter="url(#sh)">
        <path d="M660,480 L1180,480 L1260,420 L740,420 Z" fill="#E6DCC7"/>
        <path d="M1180,480 L1260,420 L1260,720 L1180,790 Z" fill="#A89A7D"/>
        <rect x="660" y="480" width="520" height="310" fill="url(#carton)"/></g>
      <rect x="660" y="480" width="520" height="44" fill="#000" opacity="0.07"/>
      ${shoe(770, 610, 1.0, '#3A4E60', '#5F6B76')}
      ${stamp(1010, 500, 'RETURN', 54, E(t, 1.0, 1.22, x => x), { paper: true, rot: -7 })}
      <g opacity="${f1(tp)}" transform="translate(0,${f1((1 - tp) * 30)})">
        ${tile(1400, 210, 330, 430, { band: lit ? 'copper' : 'grey', day: 'WED', date: '14', note: 'SENT BACK', glow: lit ? E(t, 2.0, 2.5) * 0.9 : 0 })}</g>
    </g></g>`;
  },
});
cap(10.0, 13.2, 'They arrive. Too small. You send them back.');

// ---------------- s1-f6 ----------------
shot({
  tin: { type: 'whip', dx: 0, dy: -1, dur: 0.45 }, id: 's1-f6', screen: 's1-f6', section: 1, start: 13.2, end: 16.0,
  what: "The store's email printout (thin, curled) slides up full frame; a copper marker rings 'working'.",
  events: [0, 1.1],
  draw(t, d) {
    const p = E(t, 0, 0.75, easeOut);
    const rot = lerp(-4, -1.5, p);
    return `<g transform="${cam(t / d, { s0: 1.0, s1: 1.04, fx: 760, fy: 760 })}">
      <g transform="translate(0,${f1((1 - p) * 120)}) rotate(${f1(rot)} 960 560)">
        ${printout(250, 160, 1420, 760, { ringP: E(t, 1.1, 1.75) })}</g>
    </g>`;
  },
});
cap(13.2, 16.0, "The store's email says five working days.");

// ---------------- s1-f7 ----------------
const SAME = ['SAME APP.', 'SAME MONEY.', 'SAME SYSTEM.'];
shot({
  id: 's1-f7', screen: 's1-f7', section: 1, start: 16.0, end: 18.4,
  what: 'Kinetic type SAME APP. / SAME MONEY. / SAME SYSTEM.; the copper coin slides in beside each line as it lands.',
  events: [0, 0.8, 1.6, 2.0],
  draw(t, d) {
    const ys = [350, 570, 790], size = 150;
    const beats = [-0.2, 0.8, 1.6];
    let s = '';
    const pos = SAME.map((w, i) => [170 + measure(w, size) + 120, ys[i] - 52]);
    SAME.forEach((w, i) => {
      const p = E(t, beats[i], beats[i] + 0.3, easeOut);
      if (p > 0) s += `<g opacity="${f1(p)}" transform="translate(${f1((1 - p) * -60)},0)">${T(170, ys[i], w, { size, w: 700 })}</g>`;
    });
    // single coin travels line to line; grey ghost rings mark where it was
    let idx = 0; for (let i = 0; i < 3; i++) if (t >= beats[i]) idx = i;
    let cx, cy;
    if (idx === 0) { const q = E(t, -0.2, 0.25, easeOut); cx = lerp(1900, pos[0][0], q); cy = pos[0][1]; }
    else { const q = E(t, beats[idx], beats[idx] + 0.35); cx = lerp(pos[idx - 1][0], pos[idx][0], q); cy = lerp(pos[idx - 1][1], pos[idx][1], q); }
    for (let i = 0; i < idx; i++) s += `<circle cx="${f1(pos[i][0])}" cy="${f1(pos[i][1])}" r="62" fill="none" stroke="${C.grey}" stroke-width="6" opacity="0.5"/>`;
    // f8a draws its coin at (1140, 610) r84 under cam s=1.02 about (1000,580); undo this shot's end camera
    const m = E(t, d - 0.4, d, easeInOut);
    const gx = 700 + (1000 + 140 * 1.02 - 700) / 1.035, gy = 560 + (580 + 30 * 1.02 - 560) / 1.035;
    cx = lerp(cx, gx, m); cy = lerp(cy, gy, m);
    s = `<g opacity="${f1(1 - 0.55 * m)}">${s}</g>` + coin(cx, cy, lerp(70, 84 * 1.02 / 1.035, m), { glowOp: lerp(0.9, 0.4, m) });
    return `<g transform="${cam(t / d, { s0: 1.0, s1: 1.035, fx: 700, fy: 560 })}">
      ${s}</g>`;
  },
});
cap(16.0, 18.4, 'Same app. Same money. Same system.');

// ---------------- s1-f8 (two shots) ----------------
shot({
  id: 's1-f8a', screen: 's1-f8', section: 1, start: 18.4, end: 21.0,
  what: 'Phone PENDING ₹4,000; the coin frozen mid-tube inside a dashed grey ring; stopwatch keeps running past 00:02.',
  events: [0, 0.5, 1.6],
  draw(t, d) {
    const ringP = E(t, 0.5, 1.0);
    const L = 2 * Math.PI * 128;
    const ring = `<circle cx="1140" cy="${TUBE.y}" r="128" fill="none" stroke="${C.grey}" stroke-width="9" stroke-dasharray="26 18" opacity="${f1(0.4 + ringP * 0.6)}" transform="rotate(-90 1140 ${TUBE.y})"/>`;
    return `<g transform="${cam(t / d, { s0: 1.02, s1: 1.05, fx: 1000, fy: 580 })}">
      <ellipse cx="1130" cy="905" rx="760" ry="40" fill="#020910" opacity="0.35"/>
      ${outScene()}
      ${receiver(1650, 430)}
      ${coin(1140, TUBE.y, 84, { glowOp: 0.4 })}
      ${ringP > 0 ? `<g opacity="${f1(ringP)}">${ring}</g>` : ''}
      ${tubeFront(TUBE.x1, TUBE.x2, TUBE.y, TUBE.h)}
      ${payPhone(150, 185, 380, 720, 'pending', { pulse: Math.max(0, Math.sin(seg(t, 1.6, 2.2) * Math.PI)), glow: 0.35 })}
      ${stopwatch(1300, 292, 140, 4 + t, {})}
    </g>`;
  },
});
shot({
  tout: { type: 'push', fx: 700, fy: 460, dur: 0.5 }, id: 's1-f8b', screen: 's1-f8', section: 1, start: 21.0, end: 23.6,
  what: 'The rule card (IF A PAYMENT FAILS · ₹100 · for every day it\'s late) slides in over the stalled tube; RULE seal lands, ₹100 tag swings.',
  events: [0, 0.9, 1.5],
  draw(t, d) {
    const p = E(t, 0, 0.7, easeOut);
    const swing = t > 1.5 ? 14 * Math.exp(-(t - 1.5) * 2.6) * Math.cos((t - 1.5) * 9) : 14;
    const held = payPhone(150, 185, 380, 720, 'pending', { glow: 0.35 });
    const ring = `<circle cx="1140" cy="${TUBE.y}" r="128" fill="none" stroke="${C.grey}" stroke-width="9" stroke-dasharray="26 18" transform="rotate(-90 1140 ${TUBE.y})"/>`;
    const bg = `<g transform="${cam(1, { s0: 1.02, s1: 1.05, fx: 1000, fy: 580 })}" opacity="${f1(lerp(1, 0.22, E(t, 0, 0.6)))}">
      <ellipse cx="1130" cy="905" rx="760" ry="40" fill="#020910" opacity="0.35"/>${outScene()}${receiver(1650, 430)}
      ${coin(1140, TUBE.y, 84, { glowOp: 0.4 })}${ring}${tubeFront(TUBE.x1, TUBE.x2, TUBE.y, TUBE.h)}${held}${stopwatch(1300, 292, 140, 6.6, {})}</g>`;
    return `${bg}<g transform="${cam(t / d, { s0: 1.0, s1: 1.03, fx: 960, fy: 480 })}">
      <g transform="translate(${f1((1 - p) * 760)},0) rotate(${f1((1 - p) * 4)} 960 470)">
        ${ruleCard(360, 140, 1200, 650, { sealP: E(t, 0.9, 1.15, x => x), tagP: E(t, 1.5, 1.7, x => x), tagSwing: swing })}</g>
    </g>`;
  },
});
cap(18.4, 23.6, 'If a payment fails instead, the rule says a bank can owe you');

// ---------------- s1-f9 ----------------
shot({
  tin: { type: 'push', fx: 560, fy: 420, dur: 0.45 }, id: 's1-f9', screen: 's1-f9', section: 1, start: 23.6, end: 26.8,
  what: "Close on the rule card's ₹100; a stack of chalk coins counts up beside it, one per late day.",
  events: [0, 0.25, 0.7, 1.15, 1.6, 2.05, 2.5],
  draw(t, d) {
    const n = clamp(Math.floor((t - 0.25) / 0.45) + 1, 0, 6);
    let stack = '';
    const bx = 1540, by = 830, step = 40;
    for (let i = 0; i < n; i++) {
      const lt = 0.25 + i * 0.45;
      const dp = E(t, lt, lt + 0.2, easeIn);
      const y = by - i * step - (1 - dp) * 260;
      stack += `<g opacity="${f1(clamp(dp * 3))}">${chalkCoinStacked(bx, y, 165, 44, 32)}</g>`;
    }
    const counter = n > 0 ? T(1760, 300, `DAY ${n} · ₹${n * 100}`, { mono: true, w: 700, size: 52, anchor: 'end', fill: C.chalk }) : '';
    return `<g transform="${cam(t / d, { s0: 1.0, s1: 1.045, fx: 640, fy: 480 })}">
      <g transform="translate(-180,-40)">${ruleCard(300, 150, 1240, 790, { headSize: 330, lines: ['IF A PAYMENT FAILS', '₹100', "for every day it's late"], tagP: 0 })}</g>
      <ellipse cx="${bx}" cy="${by + 60}" rx="210" ry="34" fill="#020910" opacity="0.45"/>
      ${stack}
      ${counter}
    </g>`;
  },
});
cap(23.6, 26.8, "a hundred rupees for every day it's late.");

// ---------------- s1-f10 ----------------
shot({
  tout: { type: 'push', fx: 1630, fy: 620, dur: 0.5 }, id: 's1-f10', screen: 's1-f10', section: 1, start: 26.8, end: 29.2,
  what: 'Five blank hook tiles fill the frame width, tile 5 copper; the question types on above; push into tile 5.',
  events: [0, 0.3, 1.4],
  draw(t, d) {
    const q = 'Where do the five days go?';
    const n = Math.round(clamp(t / 1.3) * q.length);
    const typed = q.slice(0, n);
    const caret = t < 1.6 && Math.floor(t * 4) % 2 === 0 ? `<rect x="${f1(150 + measure(typed, 100) + 8)}" y="218" width="8" height="96" fill="${C.chalk}"/>` : '';
    const ps = lerp(1, 1.12, E(t, 0.3, d, easeInOut));
    let tiles = '';
    for (let i = 0; i < 5; i++) tiles += tile(140 + i * 335, 400, 300, 440, i === 4 ? { solid: true, glow: 0.8 + 0.2 * Math.sin(t * 3) } : { band: 'grey' });
    return `<g transform="translate(1630,620) scale(${ps.toFixed(4)}) translate(-1630,-620)">${tiles}</g>
      ${T(150, 300, typed, { size: 100, w: 700 })}${caret}`;
  },
});
cap(26.8, 29.2, 'Where do the five days go?');
