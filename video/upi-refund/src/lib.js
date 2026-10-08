// Shared kit: palette, easing, text, and the recurring motifs.
// Every function returns an SVG string and depends only on its arguments.

const C = {
  navy: '#10273A', navyHi: '#1A3B55', navyLo: '#071521',
  chalk: '#EAE4D6', copper: '#B8722C', grey: '#5F6B76', red: '#D64545',
  paperA: '#F1ECE0', paperB: '#DCD3C0', ink: '#203446',
  copperHi: '#E0A15A', copperLo: '#7E4A1A',
};
const SANS = "'IBM Plex Sans'";
const MONO = "'IBM Plex Mono'";

// ---------- maths ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeIn = p => p * p * p;
const easeOutBack = p => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const E = (t, a, b, f = easeInOut) => f(seg(t, a, b));
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const f1 = n => (Math.round(n * 10) / 10).toString();

// ---------- text ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function T(x, y, s, o = {}) {
  const fam = o.mono ? MONO : SANS;
  const w = o.w || (o.mono ? 500 : 700);
  const ls = o.ls != null ? `letter-spacing="${o.ls}"` : '';
  const anchor = o.anchor ? `text-anchor="${o.anchor}"` : '';
  const op = o.op != null ? `opacity="${o.op}"` : '';
  const extra = o.attrs || '';
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="${fam}" font-weight="${w}" font-size="${o.size || 40}" fill="${o.fill || C.chalk}" ${anchor} ${ls} ${op} ${extra}>${esc(s)}</text>`;
}
const kicker = (x, y, s, o = {}) => T(x, y, s.toUpperCase(), { mono: true, size: o.size || 30, ls: o.ls || '0.22em', fill: o.fill || C.chalk, op: o.op != null ? o.op : 0.78, anchor: o.anchor, attrs: o.attrs });

const _mc = document.createElement('canvas').getContext('2d');
function measure(s, size, o = {}) {
  _mc.font = `${o.w || (o.mono ? 500 : 700)} ${size}px ${o.mono ? MONO : SANS}`;
  let w = _mc.measureText(s).width;
  if (o.lsEm) w += s.length * o.lsEm * size;
  return w;
}

// ---------- static defs (gradients, filters, grain) ----------
function staticDefs() {
  return `
  <radialGradient id="bgGrad" cx="50%" cy="48%" r="75%">
    <stop offset="0" stop-color="${C.navyHi}"/><stop offset="0.5" stop-color="${C.navy}"/><stop offset="1" stop-color="${C.navyLo}"/>
  </radialGradient>
  <radialGradient id="vig" cx="50%" cy="50%" r="72%">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.42"/>
  </radialGradient>
  <linearGradient id="paper" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="${C.paperA}"/><stop offset="1" stop-color="${C.paperB}"/>
  </linearGradient>
  <linearGradient id="paperDim" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#C9C2B3"/><stop offset="1" stop-color="#B0A794"/>
  </linearGradient>
  <linearGradient id="card" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#F3EEE3"/><stop offset="1" stop-color="#D8CEB9"/>
  </linearGradient>
  <linearGradient id="carton" x1="0" y1="0" x2="0.2" y2="1">
    <stop offset="0" stop-color="#D9CDB4"/><stop offset="1" stop-color="#BFB194"/>
  </linearGradient>
  <radialGradient id="coinFace" cx="38%" cy="34%" r="70%">
    <stop offset="0" stop-color="${C.copperHi}"/><stop offset="0.55" stop-color="${C.copper}"/><stop offset="1" stop-color="${C.copperLo}"/>
  </radialGradient>
  <linearGradient id="coinRim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#C98A45"/><stop offset="1" stop-color="#5E3512"/>
  </linearGradient>
  <radialGradient id="copperGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${C.copper}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.copper}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="chalkGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#9FC3DE" stop-opacity="0.38"/><stop offset="1" stop-color="#9FC3DE" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="copperTile" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#D08A43"/><stop offset="1" stop-color="#9A5B21"/>
  </linearGradient>
  <linearGradient id="chalkCoin" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F2EDE2"/><stop offset="1" stop-color="#BFB7A6"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#CFE3F2" stop-opacity="0.22"/><stop offset="0.18" stop-color="#CFE3F2" stop-opacity="0.07"/>
    <stop offset="0.75" stop-color="#CFE3F2" stop-opacity="0.04"/><stop offset="1" stop-color="#CFE3F2" stop-opacity="0.16"/>
  </linearGradient>
  <linearGradient id="phoneBody" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#22425B"/><stop offset="1" stop-color="#0A1823"/>
  </linearGradient>
  <linearGradient id="phoneScreen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#16344D"/><stop offset="1" stop-color="#0C1F2E"/>
  </linearGradient>
  <linearGradient id="iron" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3E4F5C"/><stop offset="0.45" stop-color="#26333D"/><stop offset="1" stop-color="#1A242C"/>
  </linearGradient>
  <linearGradient id="streak" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.copper}" stop-opacity="0"/><stop offset="1" stop-color="${C.copperHi}" stop-opacity="0.75"/>
  </linearGradient>
  <filter id="sh" x="-30%" y="-30%" width="170%" height="180%">
    <feDropShadow dx="18" dy="30" stdDeviation="22" flood-color="#020910" flood-opacity="0.55"/>
  </filter>
  <filter id="shS" x="-30%" y="-30%" width="170%" height="180%">
    <feDropShadow dx="6" dy="12" stdDeviation="9" flood-color="#020910" flood-opacity="0.5"/>
  </filter>
  <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="blur20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
  `;
}

let GRAIN = [];
function makeGrain() {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); const im = g.createImageData(256, 256); const r = rng(1000 + k * 77);
    for (let i = 0; i < 256 * 256; i++) { const v = Math.floor(r() * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); out.push(cv.toDataURL('image/png'));
  }
  GRAIN = out;
}
function grainDefs() {
  return GRAIN.map((u, k) => `<pattern id="grain${k}" patternUnits="userSpaceOnUse" width="256" height="256"><image href="${u}" width="256" height="256"/></pattern>`).join('');
}
function overlays(frame) {
  const k = frame % 4; const r = rng(frame * 13 + 7);
  const ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
  return `<rect width="1920" height="1080" fill="url(#vig)"/>
  <g transform="translate(${-ox},${-oy})"><rect width="2200" height="1400" fill="url(#grain${k})" opacity="0.075" style="mix-blend-mode:overlay"/></g>`;
}

// ---------- camera ----------
// slow push (s0 -> s1) around a focal point, plus optional drift
function cam(p, o = {}) {
  const s = lerp(o.s0 || 1, o.s1 || 1.04, p);
  const fx = o.fx || 960, fy = o.fy || 540;
  const dx = lerp(0, o.dx || 0, p), dy = lerp(0, o.dy || 0, p);
  return `translate(${f1(fx + dx)},${f1(fy + dy)}) scale(${s.toFixed(4)}) translate(${-fx},${-fy})`;
}

// ---------- motifs ----------
// The viewer's coin: copper disc, darker rim, embossed envelope, soft glow.
function coin(x, y, r, o = {}) {
  const glow = o.glow !== false ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.9)}" fill="url(#copperGlow)" opacity="${o.glowOp || 0.9}"/>` : '';
  const ew = r * 0.92, eh = r * 0.6, ex = x - ew / 2, ey = y - eh / 2 + r * 0.02;
  const env = (dx, dy, col, sw) => `<g transform="translate(${dx},${dy})" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">
      <rect x="${f1(ex)}" y="${f1(ey)}" width="${f1(ew)}" height="${f1(eh)}" rx="${f1(r * 0.06)}"/>
      <path d="M${f1(ex + r * 0.04)},${f1(ey + r * 0.05)} L${f1(x)},${f1(ey + eh * 0.62)} L${f1(ex + ew - r * 0.04)},${f1(ey + r * 0.05)}"/></g>`;
  const sw = Math.max(1.5, r * 0.055);
  const cracked = o.crack ? `<path d="M${f1(x - r * 0.1)},${f1(y - r * 0.95)} l${f1(r * 0.12)},${f1(r * 0.4)} l${f1(-r * 0.16)},${f1(r * 0.3)} l${f1(r * 0.2)},${f1(r * 0.35)}" stroke="#4a2a0c" stroke-width="${f1(sw)}" fill="none"/>` : '';
  return `<g opacity="${o.op != null ? o.op : 1}">${glow}
    <g ${o.noShadow ? '' : 'filter="url(#shS)"'}>
      <circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#coinRim)"/>
      <circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.86)}" fill="url(#coinFace)"/>
      <circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.78)}" fill="none" stroke="#8C531C" stroke-opacity="0.55" stroke-width="${f1(sw * 0.7)}"/>
      ${env(sw * 0.6, sw * 0.6, '#6A3B12', sw)}${env(-sw * 0.35, -sw * 0.35, '#F3C48C', sw * 0.8)}
      <path d="M${f1(x - r * 0.62)},${f1(y - r * 0.38)} A${f1(r * 0.74)},${f1(r * 0.74)} 0 0 1 ${f1(x + r * 0.1)},${f1(y - r * 0.73)}" stroke="#FBE0BC" stroke-opacity="0.55" stroke-width="${f1(sw * 0.9)}" fill="none" stroke-linecap="round"/>
      ${cracked}
    </g></g>`;
}

// Motion streak behind a moving coin (soft copper smear, never an arrow).
function streak(x, y, r, len, o = {}) {
  if (len < 4) return '';
  return `<g opacity="${o.op != null ? o.op : 1}">
    <rect x="${f1(x - len)}" y="${f1(y - r * 0.62)}" width="${f1(len)}" height="${f1(r * 1.24)}" rx="${f1(r * 0.62)}" fill="url(#streak)"/>
    <rect x="${f1(x - len * 0.75)}" y="${f1(y - r * 0.95)}" width="${f1(len * 0.55)}" height="3" rx="1.5" fill="${C.chalk}" opacity="0.18"/>
    <rect x="${f1(x - len * 0.9)}" y="${f1(y + r * 0.9)}" width="${f1(len * 0.6)}" height="3" rx="1.5" fill="${C.chalk}" opacity="0.14"/></g>`;
}

// Chalk penalty coin, seen edge-on in a stack.
function chalkCoinStacked(x, y, rx, ry, h) {
  const ridges = [];
  for (let i = -8; i <= 8; i++) { const a = i / 8.6; const px = x + rx * a; ridges.push(`<line x1="${f1(px)}" y1="${f1(y + ry * Math.sqrt(1 - a * a))}" x2="${f1(px)}" y2="${f1(y + h + ry * Math.sqrt(1 - a * a))}" stroke="#8F887A" stroke-opacity="0.35" stroke-width="2"/>`); }
  return `<g>
    <path d="M${f1(x - rx)},${f1(y)} L${f1(x - rx)},${f1(y + h)} A${rx},${ry} 0 0 0 ${f1(x + rx)},${f1(y + h)} L${f1(x + rx)},${f1(y)} Z" fill="#A69E8D"/>
    ${ridges.join('')}
    <ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${rx}" ry="${ry}" fill="url(#chalkCoin)"/>
    <ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx * 0.78)}" ry="${f1(ry * 0.74)}" fill="none" stroke="#9C9483" stroke-width="3"/>
    ${T(x, y + ry * 0.3, '₹100', { mono: true, w: 700, size: Math.round(ry * 0.95), fill: '#8A8272', anchor: 'middle', attrs: `transform="translate(${f1(x)},${f1(y)}) scale(1,0.55) translate(${f1(-x)},${f1(-y)})"` })}
  </g>`;
}

// Paper day tile from the week strip.
// o: band 'copper'|'grey'|'ink'|'paper'; day; date; badge; dim; struck; solid; glow; note
function tile(x, y, w, h, o = {}) {
  const r = Math.min(18, w * 0.07);
  const bandH = h * 0.2;
  const bandCol = { copper: C.copper, grey: C.grey, ink: C.ink, paper: '#CFC6B2' }[o.band || 'grey'];
  const op = o.dim ? 0.4 : (o.op != null ? o.op : 1);
  const body = o.solid ? 'url(#copperTile)' : (o.paperDim ? 'url(#paperDim)' : 'url(#paper)');
  const ink = o.solid ? C.chalk : C.ink;
  let s = `<g opacity="${op}">`;
  if (o.glow) s += `<rect x="${f1(x - w * 0.35)}" y="${f1(y - h * 0.3)}" width="${f1(w * 1.7)}" height="${f1(h * 1.6)}" fill="url(#copperGlow)" opacity="${o.glow}"/>`;
  s += `<g filter="url(#sh)"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}" fill="${body}"/></g>`;
  if (!o.solid) s += `<path d="M${f1(x)},${f1(y + bandH)} L${f1(x)},${f1(y + r)} Q${f1(x)},${f1(y)} ${f1(x + r)},${f1(y)} L${f1(x + w - r)},${f1(y)} Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + r)} L${f1(x + w)},${f1(y + bandH)} Z" fill="${bandCol}"/>`;
  if (o.day) s += T(x + w / 2, y + bandH * 0.68, o.day, { mono: true, w: 700, size: Math.round(bandH * 0.5), fill: o.solid ? C.chalk : (o.band === 'paper' ? C.ink : C.chalk), anchor: 'middle', ls: '0.12em' });
  if (o.date) s += T(x + w / 2, y + bandH + (h - bandH) * 0.6, o.date, { mono: true, w: 700, size: Math.round(h * 0.34), fill: ink, anchor: 'middle' });
  if (o.note) s += T(x + w / 2, y + h - h * 0.1, o.note, { mono: true, w: 700, size: Math.max(24, Math.round(h * 0.075)), fill: o.solid ? C.chalk : C.ink, anchor: 'middle', ls: '0.14em', op: 0.85 });
  if (o.struck) s += `<line x1="${f1(x + w * 0.12)}" y1="${f1(y + h * 0.85)}" x2="${f1(x + w * 0.88)}" y2="${f1(y + bandH + h * 0.12)}" stroke="${C.grey}" stroke-width="${f1(w * 0.035)}" stroke-linecap="round"/>`;
  if (o.badge) s += `<circle cx="${f1(x + w - w * 0.12)}" cy="${f1(y + bandH + w * 0.13)}" r="${f1(w * 0.1)}" fill="${C.copper}"/>` + T(x + w - w * 0.12, y + bandH + w * 0.13 + w * 0.045, String(o.badge), { mono: true, w: 700, size: Math.max(24, Math.round(w * 0.12)), fill: C.chalk, anchor: 'middle' });
  return s + '</g>';
}

// Phone: layered body, inset screen; `inner` is drawn in screen-local coords (w x h).
function phone(x, y, w, h, inner, o = {}) {
  const sx = 18, sy = 22, sw = w - 36, sh = h - 44;
  const glow = o.glow ? `<ellipse cx="${f1(x + w / 2)}" cy="${f1(y + h / 2)}" rx="${f1(w * 1.4)}" ry="${f1(h * 0.9)}" fill="url(#chalkGlow)" opacity="${o.glow}"/>` : '';
  return `<g>${glow}<g filter="url(#sh)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${f1(w * 0.13)}" fill="url(#phoneBody)"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="${f1(w * 0.12)}" fill="#0B1924"/></g>
    <rect x="${x + sx}" y="${y + sy}" width="${sw}" height="${sh}" rx="${f1(w * 0.085)}" fill="url(#phoneScreen)"/>
    <rect x="${f1(x + w / 2 - w * 0.12)}" y="${y + sy + 12}" width="${f1(w * 0.24)}" height="${f1(w * 0.045)}" rx="${f1(w * 0.022)}" fill="#071019"/>
    <g transform="translate(${x + sx},${y + sy})">${inner(sw, sh)}</g>
    <path d="M${x + sx + 10},${y + sy + 6} L${f1(x + sx + sw * 0.55)},${y + sy + 6} L${f1(x + sx + sw * 0.15)},${f1(y + sy + sh * 0.5)} L${x + sx + 10},${f1(y + sy + sh * 0.5)} Z" fill="#fff" opacity="0.025"/>
  </g>`;
}

// Chalk tick (never green).
function tick(x, y, s, p = 1, col = C.chalk) {
  const d = `M${f1(x - s * 0.5)},${f1(y)} L${f1(x - s * 0.12)},${f1(y + s * 0.38)} L${f1(x + s * 0.55)},${f1(y - s * 0.42)}`;
  const L = s * 1.55;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(s * 0.16)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${f1(L)}" stroke-dashoffset="${f1(L * (1 - p))}"/>`;
}

// Glass tube (back layer and front highlights are separate so things can sit inside).
function tubeBack(x1, x2, y, h) {
  return `<g filter="url(#sh)"><rect x="${x1}" y="${f1(y - h / 2)}" width="${x2 - x1}" height="${h}" rx="${f1(h / 2)}" fill="#0B1E2D" opacity="0.55"/></g>
  <rect x="${x1}" y="${f1(y - h / 2)}" width="${x2 - x1}" height="${h}" rx="${f1(h / 2)}" fill="url(#glass)"/>`;
}
function tubeFront(x1, x2, y, h) {
  return `<rect x="${x1 + h * 0.4}" y="${f1(y - h / 2 + h * 0.1)}" width="${f1(x2 - x1 - h * 0.8)}" height="${f1(h * 0.07)}" rx="${f1(h * 0.035)}" fill="#E8F2FA" opacity="0.32"/>
  <rect x="${x1 + h * 0.6}" y="${f1(y + h / 2 - h * 0.14)}" width="${f1(x2 - x1 - h * 1.2)}" height="${f1(h * 0.035)}" rx="2" fill="#E8F2FA" opacity="0.12"/>
  <rect x="${x1}" y="${f1(y - h / 2)}" width="${x2 - x1}" height="${h}" rx="${f1(h / 2)}" fill="none" stroke="#BCD6EA" stroke-opacity="0.22" stroke-width="3"/>
  ${[x1 + h * 0.18, x2 - h * 0.18].map(cx => `<ellipse cx="${f1(cx)}" cy="${y}" rx="${f1(h * 0.13)}" ry="${f1(h * 0.52)}" fill="#2A4A63"/><ellipse cx="${f1(cx)}" cy="${y}" rx="${f1(h * 0.07)}" ry="${f1(h * 0.42)}" fill="#162F43"/>`).join('')}`;
}
function tubeStand(x, y, h, floorY) {
  return `<g filter="url(#shS)"><rect x="${f1(x - 14)}" y="${f1(y + h / 2)}" width="28" height="${f1(floorY - y - h / 2)}" fill="#18344A"/>
    <rect x="${f1(x - 60)}" y="${f1(floorY - 10)}" width="120" height="20" rx="8" fill="#1E3F57"/>
    <rect x="${f1(x - 34)}" y="${f1(y + h / 2 - 8)}" width="68" height="24" rx="6" fill="#1E3F57"/></g>`;
}

// Stopwatch: paper face, ink ticks, copper hand while running; one revolution per second.
function stopwatch(x, y, r, secs, o = {}) {
  const ticks = [];
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; const r1 = r * (i % 5 === 0 ? 0.7 : 0.78), r2 = r * 0.86; ticks.push(`<line x1="${f1(x + Math.sin(a) * r1)}" y1="${f1(y - Math.cos(a) * r1)}" x2="${f1(x + Math.sin(a) * r2)}" y2="${f1(y - Math.cos(a) * r2)}" stroke="${C.ink}" stroke-width="${i % 5 === 0 ? 5 : 2.5}" stroke-linecap="round"/>`); }
  const a = (secs % 1) * Math.PI * 2;
  const handCol = o.stopped ? C.ink : C.copper;
  const s = Math.floor(secs);
  const label = `00:${String(s).padStart(2, '0')}`;
  return `<g filter="url(#sh)">
    <rect x="${f1(x - r * 0.14)}" y="${f1(y - r * 1.28)}" width="${f1(r * 0.28)}" height="${f1(r * 0.24)}" rx="6" fill="#B9AF9B"/>
    <rect x="${f1(x - r * 0.22)}" y="${f1(y - r * 1.38)}" width="${f1(r * 0.44)}" height="${f1(r * 0.14)}" rx="6" fill="#CFC6B2"/>
    <g transform="rotate(40 ${x} ${y})"><rect x="${f1(x - r * 0.08)}" y="${f1(y - r * 1.18)}" width="${f1(r * 0.16)}" height="${f1(r * 0.2)}" rx="4" fill="#B9AF9B"/></g>
    <circle cx="${x}" cy="${y}" r="${r * 1.06}" fill="#C8BEA9"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#paper)"/></g>
    ${ticks.join('')}
    <line x1="${x}" y1="${y}" x2="${f1(x + Math.sin(a) * r * 0.72)}" y2="${f1(y - Math.cos(a) * r * 0.72)}" stroke="${handCol}" stroke-width="${f1(r * 0.05)}" stroke-linecap="round"/>
    <circle cx="${x}" cy="${y}" r="${f1(r * 0.07)}" fill="${handCol}"/>
    <rect x="${f1(x - r * 0.42)}" y="${f1(y + r * 0.24)}" width="${f1(r * 0.84)}" height="${f1(r * 0.34)}" rx="8" fill="${C.ink}"/>
    ${T(x, y + r * 0.51, label, { mono: true, w: 700, size: Math.round(r * 0.26), fill: C.chalk, anchor: 'middle' })}`;
}

// Analogue clock (wall clock / post clock). h, m in clock time.
function clockFace(x, y, r, h, m, o = {}) {
  const ticks = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ticks.push(`<line x1="${f1(x + Math.sin(a) * r * 0.74)}" y1="${f1(y - Math.cos(a) * r * 0.74)}" x2="${f1(x + Math.sin(a) * r * 0.86)}" y2="${f1(y - Math.cos(a) * r * 0.86)}" stroke="${o.ink || C.ink}" stroke-width="${f1(r * (i % 3 === 0 ? 0.06 : 0.035))}" stroke-linecap="round"/>`); }
  const am = m / 60 * Math.PI * 2, ah = ((h % 12) + m / 60) / 12 * Math.PI * 2;
  return `<g opacity="${o.op != null ? o.op : 1}"><g filter="url(#shS)"><circle cx="${x}" cy="${y}" r="${f1(r * 1.08)}" fill="${o.rim || '#B5AB96'}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${o.face || 'url(#paper)'}"/></g>
    ${o.wedge || ''}${ticks.join('')}
    <line x1="${x}" y1="${y}" x2="${f1(x + Math.sin(ah) * r * 0.48)}" y2="${f1(y - Math.cos(ah) * r * 0.48)}" stroke="${o.ink || C.ink}" stroke-width="${f1(r * 0.08)}" stroke-linecap="round"/>
    <line x1="${x}" y1="${y}" x2="${f1(x + Math.sin(am) * r * 0.72)}" y2="${f1(y - Math.cos(am) * r * 0.72)}" stroke="${o.ink || C.ink}" stroke-width="${f1(r * 0.05)}" stroke-linecap="round"/>
    <circle cx="${x}" cy="${y}" r="${f1(r * 0.07)}" fill="${o.ink || C.ink}"/></g>`;
}

// Hand-drawn marker ring around a box, drawn progressively (p 0..1).
function markerRing(cx, cy, rx, ry, p, o = {}) {
  const pts = []; const r = rng(o.seed || 5); const n = 90; const turns = 1.12;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI * 0.95 + (i / n) * Math.PI * 2 * turns;
    const k = 1 + (r() - 0.5) * 0.02 + (i / n) * 0.04;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k + (i / n) * ry * 0.05]);
  }
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const d = 'M' + pts.map(q => q.map(f1).join(',')).join(' L');
  return `<path d="${d}" fill="none" stroke="${o.col || C.copper}" stroke-width="${o.sw || 9}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" stroke-dasharray="${f1(L)}" stroke-dashoffset="${f1(L * (1 - p))}"/>`;
}

// The store's email: thin curled printout. ringP = progress of copper ring on "working".
function printout(x, y, w, h, o = {}) {
  const curl = w * 0.11;
  const pad = w * 0.075;
  const hs = o.headSize || Math.round(w * 0.085);
  const bs = o.bodySize || Math.round(w * 0.033);
  const line3y = y + h * 0.7;
  const w5 = measure('5 ', hs); const ww = measure('working', hs);
  let s = `<g filter="url(#sh)"><path d="M${x},${y} L${x + w},${y} L${x + w},${f1(y + h - curl)} L${f1(x + w - curl)},${y + h} L${x},${y + h} Q${f1(x + w * 0.02)},${f1(y + h * 0.5)} ${x},${y} Z" fill="url(#paper)"/></g>
  <path d="M${x + w},${f1(y + h - curl)} L${f1(x + w - curl)},${y + h} Q${f1(x + w - curl * 0.85)},${f1(y + h - curl * 0.8)} ${f1(x + w - curl * 1.1)},${f1(y + h - curl * 1.15)} Q${f1(x + w - curl * 0.5)},${f1(y + h - curl * 1.05)} ${x + w},${f1(y + h - curl)} Z" fill="#C2B79F"/>
  <path d="M${x},${y} L${f1(x + w * 0.4)},${y} L${x},${f1(y + h * 0.25)} Z" fill="#fff" opacity="0.18"/>
  ${T(x + pad, y + pad + w * 0.02, 'TIDEWALK · RETURN #4417', { mono: true, w: 700, size: Math.max(26, Math.round(w * 0.024)), fill: C.ink, ls: '0.18em' })}
  <rect x="${x + pad}" y="${f1(y + pad + w * 0.045)}" width="${f1(w - pad * 2)}" height="3" fill="${C.ink}" opacity="0.5"/>
  ${T(x + pad, y + h * 0.36, "We've received your return.", { size: bs, w: 400, fill: C.ink })}
  ${T(x + pad, y + h * 0.36 + bs * 1.45, 'Your refund will reach you in', { size: bs, w: 400, fill: C.ink })}
  ${T(x + pad, line3y, '5 working days.', { size: hs, w: 700, fill: C.ink })}`;
  if (o.ringP > 0) s += markerRing(x + pad + w5 + ww / 2, line3y - hs * 0.3, ww / 2 + hs * 0.07, hs * 0.6, o.ringP, { sw: Math.max(7, hs * 0.075) });
  return s;
}

// The regulator's rule card: heavy, double border, solid ink seal, hanging ₹100 tag.
// o.lines: [kicker, headline, support]; o.sealP, o.tagP, o.tagSwing (deg)
function ruleCard(x, y, w, h, o = {}) {
  const k = w / 1200;
  const L = o.lines || ['IF A PAYMENT FAILS', '₹100', "for every day it's late"];
  let s = `<g filter="url(#sh)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${f1(10 * k)}" fill="url(#card)"/>
    <rect x="${x}" y="${f1(y + h - 18 * k)}" width="${w}" height="${f1(18 * k)}" rx="${f1(8 * k)}" fill="#B9AD93"/></g>
    <rect x="${f1(x + 26 * k)}" y="${f1(y + 26 * k)}" width="${f1(w - 52 * k)}" height="${f1(h - 70 * k)}" rx="4" fill="none" stroke="${C.ink}" stroke-width="${f1(5 * k)}"/>
    <rect x="${f1(x + 42 * k)}" y="${f1(y + 42 * k)}" width="${f1(w - 84 * k)}" height="${f1(h - 102 * k)}" rx="2" fill="none" stroke="${C.ink}" stroke-opacity="0.55" stroke-width="${f1(2.5 * k)}"/>
    ${T(x + 100 * k, y + 140 * k, L[0], { mono: true, w: 700, size: Math.max(24, Math.round(38 * k)), fill: C.ink, ls: '0.2em' })}
    ${T(x + 92 * k, y + (200 + (o.headSize || 230) * 0.87) * k, L[1], { size: Math.round((o.headSize || 230) * k), w: 700, fill: C.ink })}
    ${T(x + 100 * k, y + (300 + (o.headSize || 230) * 0.87) * k, L[2], { size: Math.max(24, Math.round(52 * k)), w: 400, fill: C.ink })}`;
  // seal
  const sp = o.sealP != null ? o.sealP : 1;
  if (sp > 0) {
    const sc = lerp(1.7, 1, easeOutBack(sp)); const scx = x + w - 190 * k, scy = y + 175 * k;
    s += `<g opacity="${clamp(sp * 3)}" transform="translate(${f1(scx)},${f1(scy)}) scale(${sc.toFixed(3)}) rotate(-12)">
      <circle r="${f1(96 * k)}" fill="${C.ink}"/>
      <circle r="${f1(80 * k)}" fill="none" stroke="${C.chalk}" stroke-opacity="0.65" stroke-width="${f1(3 * k)}" stroke-dasharray="${f1(6 * k)} ${f1(5 * k)}"/>
      ${T(0, 15 * k, 'RULE', { mono: true, w: 700, size: Math.max(24, Math.round(44 * k)), fill: C.chalk, anchor: 'middle', ls: '0.1em' })}</g>`;
  }
  // tag
  const tp = o.tagP != null ? o.tagP : 1;
  if (tp > 0) {
    const ax = x + w - 170 * k, ay = y + h - 250 * k;
    const sw = o.tagSwing || 0;
    s += `<g transform="rotate(${f1(sw)} ${f1(ax)} ${f1(ay)})" opacity="${clamp(tp * 2)}">
      <path d="M${f1(ax)},${f1(ay)} C${f1(ax + 10 * k)},${f1(ay + 40 * k)} ${f1(ax - 6 * k)},${f1(ay + 60 * k)} ${f1(ax)},${f1(ay + 92 * k)}" stroke="${C.ink}" stroke-width="${f1(3 * k)}" fill="none"/>
      <g filter="url(#shS)"><path d="M${f1(ax - 120 * k)},${f1(ay + 120 * k)} L${f1(ax - 30 * k)},${f1(ay + 86 * k)} L${f1(ax + 30 * k)},${f1(ay + 86 * k)} L${f1(ax + 120 * k)},${f1(ay + 120 * k)} L${f1(ax + 120 * k)},${f1(ay + 300 * k)} L${f1(ax - 120 * k)},${f1(ay + 300 * k)} Z" fill="url(#paper)"/></g>
      <circle cx="${f1(ax)}" cy="${f1(ay + 104 * k)}" r="${f1(9 * k)}" fill="#8E846F"/>
      ${T(ax, ay + 205 * k, '₹100', { mono: true, w: 700, size: Math.round(70 * k), fill: C.ink, anchor: 'middle' })}
      ${T(ax, ay + 262 * k, 'A DAY, LATE', { mono: true, w: 700, size: Math.max(24, Math.round(30 * k)), fill: C.ink, anchor: 'middle', ls: '0.1em' })}</g>`;
  }
  return s;
}

// A rubber stamp label that slaps onto a surface. p: 0..1 landing progress.
function stamp(cx, cy, label, size, p, o = {}) {
  if (p <= 0) return '';
  const sc = lerp(1.8, 1, easeOutBack(clamp(p))); const w = measure(label, size, { mono: true, w: 700, lsEm: 0.12 }) + size * 1.1; const h = size * 1.7;
  return `<g opacity="${clamp(p * 4)}" transform="translate(${f1(cx)},${f1(cy)}) rotate(${o.rot || -8}) scale(${sc.toFixed(3)})">
    ${o.paper ? `<g filter="url(#shS)"><rect x="${f1(-w / 2 - size * 0.3)}" y="${f1(-h / 2 - size * 0.25)}" width="${f1(w + size * 0.6)}" height="${f1(h + size * 0.5)}" rx="4" fill="url(#paper)"/></g>` : ''}
    <rect x="${f1(-w / 2)}" y="${f1(-h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(size * 0.12)}" fill="none" stroke="${o.col || C.ink}" stroke-width="${f1(size * 0.1)}"/>
    ${T(0, size * 0.36, label, { mono: true, w: 700, size, fill: o.col || C.ink, anchor: 'middle', ls: '0.12em' })}</g>`;
}

// Plain running-shoe silhouette, ~300 x 120 at s=1 (heel left, toe right).
function shoe(x, y, s, col, sole) {
  return `<g transform="translate(${x},${y}) scale(${s})">
    <path fill="${col}" d="M6,98 C2,80 2,52 8,34 C10,26 16,22 24,24 C36,28 46,40 62,40 C76,40 82,22 92,10 C96,5 104,4 110,8 C130,22 156,38 192,52 C230,66 270,72 290,84 C300,90 302,100 296,104 L10,104 C8,104 6,102 6,98 Z"/>
    <path fill="${sole || col}" opacity="0.85" d="M2,102 L300,102 C304,108 302,118 292,120 L14,120 C4,120 0,112 2,102 Z"/>
    <path d="M112,22 L150,44 M104,32 L140,52 M98,44 L128,60" stroke="${sole || '#E6DCC7'}" stroke-opacity="0.5" stroke-width="6" stroke-linecap="round"/></g>`;
}
