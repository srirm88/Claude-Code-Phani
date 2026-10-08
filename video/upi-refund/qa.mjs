// Pacing check + shots.json + contact sheet from the timeline and rendered frames.
// usage: node qa.mjs <framesDir> <outDir>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [framesDir, outDir] = process.argv.slice(2);
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const tl = JSON.parse(execFileSync('node', [path.join(ROOT, 'render.mjs'), 'timeline']).toString());
const r2 = n => Math.round(n * 100) / 100;
const tc = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// --- pacing (brief section 4) ---
let fail = 0; const rows = [];
for (const s of tl) {
  const hook = s.end <= 29.2 + 1e-6;
  const maxGap = hook ? 3 : 4, maxShot = s.payoff ? 10 : (hook ? 5 : 8);
  const len = s.end - s.start;
  const ev = [...s.events, len].sort((a, b) => a - b);
  let gap = 0; for (let i = 1; i < ev.length; i++) gap = Math.max(gap, ev[i] - ev[i - 1]);
  const bad = [];
  if (len < 1.5) bad.push('shorter than 1.5 s');
  if (len > maxShot + 1e-6) bad.push(`longer than ${maxShot} s`);
  if (gap > maxGap + 1e-6) bad.push(`event gap ${r2(gap)} s > ${maxGap} s`);
  if (bad.length) fail++;
  rows.push(`${s.id.padEnd(8)} ${tc(s.start)}-${tc(s.end)}  len ${len.toFixed(1).padStart(4)}s  max gap ${gap.toFixed(2)}s  ${bad.length ? 'FAIL: ' + bad.join('; ') : 'ok'}`);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pacing.txt'), rows.join('\n') + `\n\n${fail ? fail + ' FAIL' : 'all shots pass'}\n`);
console.log(rows.join('\n')); console.log(fail ? `${fail} FAIL` : 'pacing: all shots pass');

// --- shots.json ---
fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(tl.map(s => ({ id: s.id, start: r2(s.start), end: r2(s.end), screen: s.screen, what: s.what })), null, 2));

// --- contact sheet: one still per shot at ~65% through ---
const cells = tl.map(s => { const t = s.start + (s.end - s.start) * 0.65; const f = Math.round(t * 30); return { s, t, file: path.resolve(framesDir, `f${String(f).padStart(5, '0')}.png`) }; });
const cols = 4, W = 456, H = 256;
const html = `<html><body style="margin:0;background:#071521;font-family:monospace">
<div style="display:grid;grid-template-columns:repeat(${cols},${W}px);gap:16px;padding:24px">
${cells.map(c => `<div><img src="file://${c.file}" width="${W}" height="${H}" style="display:block">
<div style="color:#EAE4D6;font:600 18px monospace;padding:6px 0 0">${c.s.id} · ${tc(c.t)}</div></div>`).join('')}
</div></body></html>`;
const hp = path.join(outDir, 'contact-sheet.html'); fs.writeFileSync(hp, html);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: cols * (W + 16) + 32, height: 400 } });
await p.goto('file://' + path.resolve(hp)); await p.waitForTimeout(500);
await p.screenshot({ path: path.join(outDir, 'contact-sheet.png'), fullPage: true });
await b.close(); fs.unlinkSync(hp);
console.log('contact sheet + shots.json written');
