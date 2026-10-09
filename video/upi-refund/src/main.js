// Timeline + renderer. renderAt(T) is a pure function of T.
const FPS = 30;
const PREVIEW = true; // no narration WAV supplied: estimated timing + burned-in captions

function shotAt(T) {
  for (let i = 0; i < SHOTS.length; i++) if (T >= SHOTS[i].start - 1e-6 && T < SHOTS[i].end - 1e-6) return SHOTS[i];
  return SHOTS[SHOTS.length - 1];
}

function captionSvg(now) {
  const c = CAPTIONS.find(c => now >= c.start - 1e-6 && now < c.end - 1e-6);
  if (!c) return '';
  const size = 36; const w = measure(c.text, size, { w: 600 }) + 56;
  return `<rect x="${f1(960 - w / 2)}" y="958" width="${f1(w)}" height="64" rx="10" fill="#050F18" opacity="0.78"/>
    ${T(960, 1002, c.text, { size, w: 600, anchor: 'middle', fill: C.chalk })}`;
}

function previewTag() {
  return PREVIEW ? kicker(40, 58, 'PREVIEW (estimated timing)', { size: 24, op: 0.55, ls: '0.14em' }) : '';
}

// Motion-carried cuts. The cut point never moves; the outgoing shot accelerates
// into the move over its last frames and the incoming shot settles out of it.
//   whip: {type:'whip', dx, dy, dur}  content travels along (dx,dy) with directional blur
//   push: {type:'push', fx, fy, dur}  camera drives forward through (fx,fy)
function transition(sh, t, d) {
  let tx = 0, ty = 0, sc = 1, fx = 960, fy = 540, bx = 0, by = 0;
  const apply = (o, amt, incoming) => {
    if (o.type === 'whip') {
      // outgoing flies far; incoming starts only 420 px back so the cut never lands on an empty frame
      const k = incoming ? -420 : 1300;
      tx += k * (o.dx || 0) * amt; ty += k * (o.dy || 0) * amt;
      bx += Math.abs(o.dx || 0) * 110 * amt; by += Math.abs(o.dy || 0) * 110 * amt;
    } else if (o.type === 'push') {
      sc *= 1 + (incoming ? 0.6 : 1.2) * amt; fx = o.fx; fy = o.fy;
      bx += 26 * amt; by += 26 * amt;
    }
  };
  if (sh.tout && t > d - sh.tout.dur) apply(sh.tout, easeIn(seg(t, d - sh.tout.dur, d)), false);
  if (sh.tin && t < sh.tin.dur) apply(sh.tin, 1 - easeOut(seg(t, 0, sh.tin.dur)), true);
  const parts = [];
  if (tx || ty || sc !== 1) parts.push(`transform="translate(${f1(tx + fx)},${f1(ty + fy)}) scale(${sc.toFixed(4)}) translate(${-fx},${-fy})"`);
  let defs = '';
  if (bx > 0.3 || by > 0.3) {
    defs = `<defs><filter id="trBlur" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${f1(bx)} ${f1(by)}" edgeMode="duplicate"/></filter></defs>`;
    parts.push('filter="url(#trBlur)"');
  }
  return { defs, attrs: parts.join(' ') };
}

let sceneEl, ovlEl;
function setup() {
  makeGrain();
  const st = document.getElementById('stage');
  st.innerHTML = `<defs>${staticDefs()}${grainDefs()}</defs><rect width="1920" height="1080" fill="url(#bgGrad)"/><g id="scene"></g><g id="ovl"></g>`;
  sceneEl = document.getElementById('scene'); ovlEl = document.getElementById('ovl');
}

window.renderAt = function (now, opts = {}) {
  const frame = Math.round(now * FPS);
  const sh = shotAt(now);
  const t = now - sh.start, d = sh.end - sh.start;
  const tr = transition(sh, t, d);
  sceneEl.innerHTML = (sh.defs ? `<defs>${sh.defs}</defs>` : '') + tr.defs + `<g ${tr.attrs}>${sh.draw(t, d)}</g>`;
  ovlEl.innerHTML = overlays(frame) + (opts.noCaptions ? '' : captionSvg(now) + previewTag());
  return sh.id;
};

window.timeline = () => SHOTS.map(s => ({ id: s.id, start: s.start, end: s.end, screen: s.screen, what: s.what, events: s.events, tin: s.tin ? s.tin.type : 'cut', tout: s.tout ? s.tout.type : 'cut', payoff: !!s.payoff, section: s.section }));

window.READY = (async () => {
  const faces = ['700 100px "IBM Plex Sans"', '600 100px "IBM Plex Sans"', '400 100px "IBM Plex Sans"', '700 100px "IBM Plex Mono"', '500 100px "IBM Plex Mono"'];
  for (const f of faces) await document.fonts.load(f, 'Aa₹4,000·−');
  await document.fonts.ready;
  setup();
  return document.fonts.size;
})();
