// Ambient render service: a Creatomate-shaped HTTP API in front of ffmpeg.
//   POST /v1/renders        {source, metadata, webhook_url}  -> {id, status:'planned'}   (Authorization: Bearer RENDER_SECRET)
//   GET  /v1/renders/:id                                     -> {id, status, url, width, height, duration, error_message}
//   GET  /files/:id.mp4                                      -> the rendered file (unguessable id, no auth, so n8n can download it)
//   GET  /healthz
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { planFromSource, buildFfmpegArgs } from './render.mjs';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.RENDER_SECRET;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const WORK_DIR = process.env.WORK_DIR || '/var/lib/ambient-render';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 7);
if (!SECRET) { console.error('RENDER_SECRET is not set'); process.exit(1); }
fs.mkdirSync(path.join(WORK_DIR, 'out'), { recursive: true });
// Which optional filters this ffmpeg build has. drawtext needs libfreetype; without it the title card is skipped.
const caps = { drawtext: false };
try {
  const list = execFileSync(FFMPEG, ['-hide_banner', '-filters'], { encoding: 'utf8' });
  caps.drawtext = /\bdrawtext\b/.test(list);
  if (!caps.drawtext) console.warn('ffmpeg has no drawtext filter: Title-Card will be skipped');
} catch (e) { console.error('cannot run ffmpeg: ' + e.message); process.exit(1); }
fs.mkdirSync(path.join(WORK_DIR, 'jobs'), { recursive: true });

const jobs = new Map();
const jobFile = (id) => path.join(WORK_DIR, 'jobs', id + '.json');
function saveJob(job) { jobs.set(job.id, job); fs.writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2)); }
for (const f of fs.readdirSync(path.join(WORK_DIR, 'jobs'))) { try { const j = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'jobs', f))); jobs.set(j.id, j); } catch {} }

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
  await pipeline(res.body, fs.createWriteStream(dest));
}

let running = false;
const queue = [];
async function runJob(job) {
  const dir = path.join(WORK_DIR, 'tmp', job.id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    job.status = 'rendering'; job.started_at = new Date().toISOString(); saveJob(job);
    const plan = planFromSource(job.source);
    const files = {};
    const urls = [...new Set([...plan.scenes.map((s) => s.source), plan.audio.source])];
    for (const [i, url] of urls.entries()) {
      const ext = path.extname(new URL(url).pathname) || '.bin';
      const dest = path.join(dir, `asset-${i}${ext}`);
      await download(url, dest);
      files[url] = dest;
    }
    const out = path.join(WORK_DIR, 'out', job.id + '.mp4');
    const args = buildFfmpegArgs(plan, files, out, caps);
    job.ffmpeg = args.join(' ').slice(0, 4000);
    await new Promise((resolve, reject) => {
      const p = spawn(FFMPEG, args, { stdio: ['ignore', 'inherit', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-1500)))));
    });
    job.status = 'succeeded'; job.url = `${PUBLIC_BASE_URL}/files/${job.id}.mp4`;
    job.width = plan.width; job.height = plan.height; job.duration = plan.total; job.frame_rate = plan.fps;
    job.file_size = fs.statSync(out).size; job.finished_at = new Date().toISOString();
  } catch (e) {
    job.status = 'failed'; job.error_message = String(e.message || e); job.finished_at = new Date().toISOString();
    console.error(`[${job.id}] failed: ${job.error_message}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    saveJob(job);
    if (job.webhook_url) {
      try {
        const r = await fetch(job.webhook_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(publicJob(job)) });
        console.log(`[${job.id}] webhook ${r.status}`);
      } catch (e) { console.error(`[${job.id}] webhook failed: ${e.message}`); }
    }
  }
}
async function pump() {
  if (running) return;
  running = true;
  while (queue.length) { const job = queue.shift(); console.log(`[${job.id}] start (${queue.length} queued)`); await runJob(job); console.log(`[${job.id}] ${job.status}`); }
  running = false;
}
const publicJob = (j) => ({ id: j.id, status: j.status, url: j.url || null, width: j.width, height: j.height, duration: j.duration, frame_rate: j.frame_rate, file_size: j.file_size, error_message: j.error_message || null, metadata: j.metadata || null, created_at: j.created_at, started_at: j.started_at, finished_at: j.finished_at });

function cleanup() {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const f of fs.readdirSync(path.join(WORK_DIR, 'out'))) {
    const p = path.join(WORK_DIR, 'out', f);
    if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
  }
}
setInterval(cleanup, 6 * 3600000).unref();

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const authed = (req) => req.headers.authorization === `Bearer ${SECRET}`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, queued: queue.length, running });
    const file = url.pathname.match(/^\/files\/([0-9a-f-]{36})\.mp4$/);
    if (req.method === 'GET' && file) {
      const p = path.join(WORK_DIR, 'out', file[1] + '.mp4');
      if (!fs.existsSync(p)) return json(res, 404, { error: 'not found' });
      const size = fs.statSync(p).size;
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': size, 'content-disposition': `inline; filename="${file[1]}.mp4"` });
      return fs.createReadStream(p).pipe(res);
    }
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST' && url.pathname === '/v1/renders') {
      let body = ''; for await (const c of req) body += c;
      const req_ = JSON.parse(body || '{}');
      if (!req_.source) return json(res, 400, { error: 'source (RenderScript) is required; template_id is not supported by this service' });
      planFromSource(req_.source); // validate before accepting
      const job = { id: randomUUID(), status: 'planned', source: req_.source, webhook_url: req_.webhook_url || null, metadata: req_.metadata || null, created_at: new Date().toISOString() };
      saveJob(job); queue.push(job); pump();
      return json(res, 200, publicJob(job));
    }
    const get = url.pathname.match(/^\/v1\/renders\/([0-9a-f-]{36})$/);
    if (req.method === 'GET' && get) {
      const job = jobs.get(get[1]);
      return job ? json(res, 200, publicJob(job)) : json(res, 404, { error: 'not found' });
    }
    return json(res, 404, { error: 'no such route' });
  } catch (e) {
    return json(res, 400, { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`ambient-render listening on :${PORT}, files served from ${PUBLIC_BASE_URL}/files/`));
