#!/usr/bin/env node
// Local test harness for the Money Pipes pipeline Claude prompts.
//
//   node run.mjs draft     [--brief fixtures/brief.example.json] [--dry-run] [--out out/]
//   node run.mjs metadata  --script out/<run>/draft.json [--timings fixtures/timings.example.json]
//                          [--settings fixtures/channel-settings.example.json]
//                          `--script` is the FINAL script (author-edited; same shape as a draft). In production the
//                          timings come from the narration audio; the fixture stands in for that.
//   node run.mjs validate  --script <file> [--brief ...]      # run the draft validator on any script file, no API call
//   node run.mjs all       [--brief ...] [--dry-run]
//   node run.mjs sync-workflow    # paste prompts, schemas and validate.js into ../n8n/*.workflow.json
//   node run.mjs check-workflow   # verify the workflow JSONs are in sync and structurally sane
//
// --dry-run prints the exact request body that n8n will send and exits without calling the API.
// Live calls need ANTHROPIC_API_KEY (or an `ant auth login` profile). Model via PIPELINE_MODEL
// (default claude-opus-5), effort via PIPELINE_EFFORT (default high).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PROMPTS = path.join(ROOT, 'prompts');
// Two workflows: A drafts into Notion and stops; B produces from the edited script.
const WORKFLOWS = ['a-draft', 'b-produce'].map((n) => path.join(ROOT, 'n8n', `money-pipes-${n}.workflow.json`)).filter((p) => fs.existsSync(p));

const MODEL = process.env.PIPELINE_MODEL || 'claude-opus-5';
const EFFORT = process.env.PIPELINE_EFFORT || 'high';
const MAX_TOKENS = { draft: 32000, metadata: 8000 }; // effort=high spends reasoning tokens inside this budget

// ---------- shared validation (same file the n8n Code nodes carry) ----------
const validateSrc = fs.readFileSync(path.join(here, 'lib', 'validate.js'), 'utf8').replace(/\r\n/g, '\n');
const V = new Function(validateSrc + '\n; return { extractJsonText, parseJsonStrict, validateDraft, validateMetadata, fmtTimestamp, apiSchema };')();

// ---------- helpers ----------
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes('--' + name);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
// CRLF checkouts (Windows autocrlf) must not change the bytes sent to the API or embedded in the workflow.
const readText = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function promptVersion(md) {
  const m = md.match(/version:\s*([0-9.]+)/);
  return m ? m[1] : 'unknown';
}

function loadPrompt(name) {
  return {
    system: readText(path.join(PROMPTS, `${name}.system.md`)),
    schema: readJson(path.join(PROMPTS, 'schemas', `${name}.schema.json`)),
  };
}

// The request shape is deliberately identical to what the n8n "Build ... Request" Code nodes
// produce, so a dry-run here is a faithful preview of the workflow's HTTP call. The schema is passed
// through apiSchema() (shared with the workflow) because the API accepts only a subset of JSON Schema.
function buildRequest(kind, userPayload) {
  const { system, schema } = loadPrompt(kind);
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS[kind],
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: V.apiSchema(schema) } },
  };
}

function preflightKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return; // the SDK may still find an `ant auth login` profile or ANTHROPIC_AUTH_TOKEN
  const masked = key.slice(0, 10) + '...' + key.slice(-4) + ' (' + key.length + ' chars)';
  console.log('Using ANTHROPIC_API_KEY ' + masked);
  const problems = [];
  if (/^["']|["']$/.test(key)) problems.push('starts or ends with a quote: on Windows use  set ANTHROPIC_API_KEY=sk-ant-...  with no quotes');
  if (/\s/.test(key)) problems.push('contains whitespace: check for a trailing space or a line break in the copied key');
  if (!key.startsWith('sk-ant-')) problems.push('does not start with sk-ant-: keys come from console.anthropic.com > API Keys, not from claude.ai');
  if (key.length < 60) problems.push('looks truncated');
  for (const p of problems) console.log('  key problem: ' + p);
}

async function callClaude(body) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  preflightKey();
  const client = new Anthropic();
  // Streaming so a slow draft generation never trips the HTTP timeout.
  const stream = client.messages.stream(body);
  const message = await stream.finalMessage();
  return message;
}

function outDir() {
  const dir = arg('out', path.join(here, 'out', new Date().toISOString().replace(/[:.]/g, '-')));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function report(label, result) {
  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(`\n[${label}] validation: ${status}` + (result.word_count ? ` (${result.word_count} words)` : ''));
  for (const e of result.errors) console.log('  error:   ' + e);
  for (const w of result.warnings) console.log('  warning: ' + w);
}

function usageLine(msg) {
  const u = msg.usage || {};
  return `tokens in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} stop=${msg.stop_reason}`;
}

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// ---------- commands ----------
// out/history.json stands in for the Notion "last 8 published" query that the workflow makes.
const HISTORY = path.join(here, 'out', 'history.json');
function loadHistory() {
  if (flag('reset-history')) { try { fs.unlinkSync(HISTORY); } catch {} }
  if (flag('no-history')) return [];
  try { return readJson(HISTORY); } catch { return []; }
}
function appendHistory(entry) {
  if (flag('no-history')) return;
  const h = loadHistory();
  h.push(entry);
  fs.mkdirSync(path.dirname(HISTORY), { recursive: true });
  fs.writeFileSync(HISTORY, JSON.stringify(h.slice(-60), null, 2));
}

async function runDraft(dir) {
  const brief = readJson(arg('brief', path.join(here, 'fixtures', 'brief.example.json')));
  const history = loadHistory();
  // Exclude prior harness runs of this same video: they are drafts of it, not other videos to avoid repeating.
  const own = String((brief.video || {}).title || '').toLowerCase();
  brief.recent_videos = [...(brief.recent_videos || []), ...history.filter((e) => String(e.title || '').toLowerCase() !== own).map((e) => ({ title: e.title, hook: e.hook }))].slice(-8);
  console.log(`recent_videos: ${brief.recent_videos.length} (${history.length} from prior harness runs)`);
  const body = buildRequest('draft', brief);
  fs.writeFileSync(path.join(dir, 'draft.request.json'), JSON.stringify(body, null, 2));
  if (flag('dry-run')) {
    console.log(JSON.stringify(body, null, 2));
    console.log(`\n[dry-run] draft request written to ${dir}/draft.request.json (prompt v${promptVersion(body.system[0].text)})`);
    return null;
  }
  console.log(`Calling ${MODEL} for draft (effort=${EFFORT})...`);
  const msg = await callClaude(body);
  fs.writeFileSync(path.join(dir, 'draft.response.json'), JSON.stringify(msg, null, 2));
  console.log(usageLine(msg));
  const draft = V.parseJsonStrict(V.extractJsonText(msg), 'draft');
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(draft, null, 2));
  report('draft', V.validateDraft(draft, brief));
  console.log(`draft -> ${dir}/draft.json`);
  console.log(`  ${draft.title_working} | ${draft.sections.reduce((a, s) => a + s.frames.length, 0)} frames | ${draft.open_questions_for_author.length} open questions`);
  appendHistory({ date: new Date().toISOString().slice(0, 10), status: 'harness', run: path.basename(dir), title: draft.title_working, hook: draft.sections[0].narration.split(/(?<=[.!?])\s/)[0] });
  return draft;
}

// Section timings normally come from the narration audio (ElevenLabs with-timestamps). The fixture
// estimates them from word count at 2.6 words/second so metadata can be exercised without audio.
function estimateTimings(script) {
  let t = 0;
  return script.sections.map((s) => { const start = Math.round(t); t += wordCount(s.narration) / 2.6; return { index: s.index, start_seconds: start }; });
}

async function runMetadata(dir, scriptIn) {
  const script = scriptIn || readJson(arg('script'));
  if (!script) throw new Error('metadata needs --script <file> or a preceding draft run');
  const settings = readJson(arg('settings', path.join(here, 'fixtures', 'channel-settings.example.json')));
  const timingsPath = arg('timings');
  const timings = timingsPath ? readJson(timingsPath) : estimateTimings(script);
  const payload = {
    script: { title_working: script.title_working, title_alternates: script.title_alternates, sections: script.sections.map((s) => ({ index: s.index, heading: s.heading, narration: s.narration })), simplifications: script.simplifications },
    section_timings: timings.map((t) => ({ ...t, timestamp: V.fmtTimestamp(t.start_seconds) })),
    channel_settings: settings,
    next_video: (readJson(arg('brief', path.join(here, 'fixtures', 'brief.example.json'))).video || {}).next_video || null,
  };
  const body = buildRequest('metadata', payload);
  fs.writeFileSync(path.join(dir, 'metadata.request.json'), JSON.stringify(body, null, 2));
  if (flag('dry-run')) {
    console.log(JSON.stringify(body, null, 2));
    console.log(`\n[dry-run] metadata request written to ${dir}/metadata.request.json`);
    return null;
  }
  console.log(`Calling ${MODEL} for metadata (effort=${EFFORT})...`);
  const msg = await callClaude(body);
  fs.writeFileSync(path.join(dir, 'metadata.response.json'), JSON.stringify(msg, null, 2));
  console.log(usageLine(msg));
  const meta = V.parseJsonStrict(V.extractJsonText(msg), 'metadata');
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(meta, null, 2));
  report('metadata', V.validateMetadata(meta, timings, settings));
  console.log(`metadata -> ${dir}/metadata.json`);
  console.log(`  titles: ${meta.title_variants.join(' | ')}`);
  console.log(`  tags (${meta.tags.join(',').length} chars): ${meta.tags.join(', ')}`);
  return meta;
}

function runValidate() {
  const script = readJson(arg('script'));
  const brief = readJson(arg('brief', path.join(here, 'fixtures', 'brief.example.json')));
  const r = V.validateDraft(script, brief);
  report('validate', r);
  process.exitCode = r.ok ? 0 : 1;
}

// ---------- workflow sync ----------
const MARK_START = '// ---- shared validation (synced from harness/lib/validate.js; do not edit here) ----';
const MARK_END = '// ---- end shared validation ----';

function spliceValidation(code) {
  const a = code.indexOf(MARK_START);
  const b = code.indexOf(MARK_END);
  if (a === -1 || b === -1) return code;
  return code.slice(0, a) + MARK_START + '\n' + validateSrc.trim() + '\n' + code.slice(b);
}

function syncedWorkflow(wf) {
  const draft = loadPrompt('draft');
  const metadata = loadPrompt('metadata');
  const prompts = wf.nodes.find((n) => n.name === 'Prompts');
  if (prompts) {
    const set = (name, value) => {
      const a = prompts.parameters.assignments.assignments.find((x) => x.name === name);
      if (a) a.value = value; // a workflow carries only the prompts it uses
    };
    set('draft_system', draft.system);
    set('draft_schema', JSON.stringify(draft.schema));
    set('metadata_system', metadata.system);
    set('metadata_schema', JSON.stringify(metadata.schema));
    set('prompt_versions', `draft ${promptVersion(draft.system)} / metadata ${promptVersion(metadata.system)}`);
  }
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.code' && typeof n.parameters?.jsCode === 'string') {
      n.parameters.jsCode = spliceValidation(n.parameters.jsCode);
    }
  }
  return wf;
}

function checkWorkflow(wf) {
  const problems = [];
  const names = new Set(wf.nodes.map((n) => n.name));
  if (names.size !== wf.nodes.length) problems.push('duplicate node names');
  for (const [from, outs] of Object.entries(wf.connections)) {
    if (!names.has(from)) problems.push(`connection from unknown node "${from}"`);
    for (const branch of outs.main || []) for (const c of branch || []) {
      if (!names.has(c.node)) problems.push(`"${from}" connects to unknown node "${c.node}"`);
    }
  }
  const creds = new Map();
  for (const n of wf.nodes) for (const [type, c] of Object.entries(n.credentials || {})) {
    if (!c.name) problems.push(`node "${n.name}" has ${type} credential without a name`);
    creds.set(type + ' "' + c.name + '"', (creds.get(type + ' "' + c.name + '"') || 0) + 1);
  }
  const synced = JSON.stringify(syncedWorkflow(structuredClone(wf))) === JSON.stringify(wf);
  if (!synced) problems.push('prompts/schemas/validate.js differ from what is embedded; run `node run.mjs sync-workflow`');
  return { problems, creds };
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'draft') { await runDraft(outDir()); return; }
  if (cmd === 'metadata') { await runMetadata(outDir()); return; }
  if (cmd === 'validate') { runValidate(); return; }
  if (cmd === 'all') {
    const dir = outDir();
    const draft = await runDraft(dir);
    if (flag('dry-run')) {
      await runMetadata(dir, readJson(path.join(here, 'fixtures', 'draft.stub.json')));
    } else {
      await runMetadata(dir, draft);
    }
    return;
  }
  if (cmd === 'sync-workflow') {
    if (!WORKFLOWS.length) { console.log('no n8n/money-pipes-*.workflow.json yet'); return; }
    for (const w of WORKFLOWS) {
      const wf = syncedWorkflow(readJson(w));
      fs.writeFileSync(w, JSON.stringify(wf, null, 2) + '\n');
      console.log('workflow synced: ' + path.relative(process.cwd(), w));
    }
    return;
  }
  if (cmd === 'check-workflow') {
    if (!WORKFLOWS.length) { console.log('no n8n/money-pipes-*.workflow.json yet'); return; }
    let bad = false;
    for (const w of WORKFLOWS) {
      const { problems, creds } = checkWorkflow(readJson(w));
      console.log(path.basename(w) + ' credentials referenced by name:');
      for (const [k, n] of creds) console.log(`  ${k}  (${n} node${n > 1 ? 's' : ''})`);
      if (problems.length) { bad = true; console.log('  problems:'); problems.forEach((p) => console.log('    - ' + p)); }
    }
    if (bad) process.exit(1);
    console.log('\nworkflows OK');
    return;
  }
  console.log(readText(fileURLToPath(import.meta.url)).split('\n').slice(1, 15).join('\n'));
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => {
  console.error('\n' + (e.status ? 'API error ' + e.status + ': ' + e.message : e.stack || e.message));
  if (e.status === 401) console.error('401 means the key was rejected. Check the "Using ANTHROPIC_API_KEY" line above and the notes next to it.');
  process.exitCode = 1; // not process.exit(): that trips a libuv assertion on Windows while the SDK's sockets close
});
