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
  sceneEl.innerHTML = (sh.defs ? `<defs>${sh.defs}</defs>` : '') + sh.draw(t, d);
  ovlEl.innerHTML = overlays(frame) + (opts.noCaptions ? '' : captionSvg(now) + previewTag());
  return sh.id;
};

window.timeline = () => SHOTS.map(s => ({ id: s.id, start: s.start, end: s.end, screen: s.screen, what: s.what, events: s.events, payoff: !!s.payoff, section: s.section }));

window.READY = (async () => {
  const faces = ['700 100px "IBM Plex Sans"', '600 100px "IBM Plex Sans"', '400 100px "IBM Plex Sans"', '700 100px "IBM Plex Mono"', '500 100px "IBM Plex Mono"'];
  for (const f of faces) await document.fonts.load(f, 'Aa₹4,000·−');
  await document.fonts.ready;
  setup();
  return document.fonts.size;
})();
