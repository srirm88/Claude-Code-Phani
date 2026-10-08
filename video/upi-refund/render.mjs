// Frame renderer: headless Chromium sets t, screenshots 1920x1080 PNGs.
// usage: node render.mjs frames <from> <to> <outDir> [workers]
//        node render.mjs stills <outDir> t1 t2 ...
//        node render.mjs timeline
//        node render.mjs fontcheck
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('PAGEERROR', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${port}/src/index.html`);
  await page.evaluate(() => window.READY);
  return page;
}

const [mode, ...args] = process.argv.slice(2);
const srv = await serve();
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
try {
  if (mode === 'timeline') {
    const page = await openPage(browser, port);
    console.log(JSON.stringify(await page.evaluate(() => window.timeline())));
  } else if (mode === 'fontcheck') {
    const page = await openPage(browser, port);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', `<div id="fc">
        <p id="a" style="font:700 60px 'IBM Plex Sans'">₹4,000 Tidewalk</p>
        <p id="b" style="font:500 60px 'IBM Plex Mono'">₹100 ••••4821 −₹4,000 ·</p>
        <p id="c" style="font:400 60px 'IBM Plex Sans'">We've received your return.</p></div>`);
    });
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    for (const id of ['a', 'b', 'c']) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#' + id });
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      console.log(id, JSON.stringify(fonts));
    }
    // glyphs inside the SVG stage too
    await page.evaluate(() => renderAt(9.6));
    const ids = await page.evaluate(() => { const ts = [...document.querySelectorAll('#scene text')]; ts.forEach((t, i) => t.id = 'svgt' + i); return ts.map(t => t.id + ':' + t.textContent); });
    for (const s of ids) {
      const id = s.split(':')[0];
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#' + id });
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      console.log(s, JSON.stringify(fonts));
    }
  } else if (mode === 'stills') {
    const [out, ...ts] = args; fs.mkdirSync(out, { recursive: true });
    const page = await openPage(browser, port);
    for (const t of ts) {
      const id = await page.evaluate(t => renderAt(t), Number(t));
      await page.screenshot({ path: path.join(out, `${id}_${Number(t).toFixed(2)}.png`) });
    }
  } else if (mode === 'frames') {
    const [from, to, out, w = '4'] = args; fs.mkdirSync(out, { recursive: true });
    const F0 = Math.round(Number(from) * 30), F1 = Math.round(Number(to) * 30);
    const W = Number(w); const t0 = Date.now();
    await Promise.all([...Array(W)].map(async (_, k) => {
      const page = await openPage(browser, port);
      for (let f = F0 + k; f < F1; f += W) {
        await page.evaluate(t => renderAt(t), f / 30);
        await page.screenshot({ path: path.join(out, `f${String(f).padStart(5, '0')}.png`) });
        if (k === 0 && (f - F0) % 120 === 0) console.log(`frame ${f} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }));
    console.log(`done ${F1 - F0} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally {
  await browser.close(); srv.close();
}
