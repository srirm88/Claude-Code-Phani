#!/usr/bin/env node
// Local test harness for the ambient-pipeline Claude prompts.
//
//   node run.mjs concept  [--brief fixtures/brief.example.json] [--dry-run] [--out out/]
//   node run.mjs metadata --concept out/<run>/concept.json [--settings fixtures/channel-settings.example.json]
//   node run.mjs all      [--brief ...] [--dry-run] [--no-history] [--reset-history]
//                         Successive runs feed each other's concept into recent_videos via out/history.json,
//                         the same way the n8n workflow feeds its own publish history.
//   node run.mjs sync-workflow    # paste prompts, schemas and validate.js into ../n8n/ambient-pipeline.workflow.json
//   node run.mjs check-workflow   # verify the workflow JSON is in sync and structurally sane
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
const WORKFLOW = path.join(ROOT, 'n8n', 'ambient-pipeline.workflow.json');

const MODEL = process.env.PIPELINE_MODEL || 'claude-opus-5';
const EFFORT = process.env.PIPELINE_EFFORT || 'high';
const MAX_TOKENS = { concept: 12000, metadata: 6000 };

// ---------- shared validation (same file the n8n Code nodes carry) ----------
const validateSrc = fs.readFileSync(path.join(here, 'lib', 'validate.js'), 'utf8').replace(/\r\n/g, '\n');
const V = new Function(validateSrc + '\n; return { extractJsonText, parseJsonStrict, validateConcept, validateMetadata, fmtTimestamp };')();

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
// produce, so a dry-run here is a faithful preview of the workflow's HTTP call.
function buildRequest(kind, userPayload) {
  const { system, schema } = loadPrompt(kind);
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS[kind],
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema } },
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
  // Streaming so a slow concept generation never trips the HTTP timeout.
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
  console.log(`\n[${label}] validation: ${status}`);
  for (const e of result.errors) console.log('  error:   ' + e);
  for (const w of result.warnings) console.log('  warning: ' + w);
}

function usageLine(msg) {
  const u = msg.usage || {};
  return `tokens in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} stop=${msg.stop_reason}`;
}

// ---------- commands ----------
// out/history.json mirrors the workflow's static-data history so repeated harness runs exercise the
// variety rules the way n8n does. --no-history ignores it; --reset-history clears it first.
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
const historyToRecent = (h) => h.map((e) => ({ published: e.date, status: e.status, format_family: e.format_family, theme: e.theme, palette: e.palette, mood: e.mood, title: e.title }));

async function runConcept(dir) {
  const brief = readJson(arg('brief', path.join(here, 'fixtures', 'brief.example.json')));
  const history = loadHistory();
  brief.recent_videos = [...(brief.recent_videos || []), ...historyToRecent(history)].slice(-8);
  console.log(`recent_videos: ${brief.recent_videos.length} (${history.length} from prior harness runs)`);
  const body = buildRequest('concept', brief);
  fs.writeFileSync(path.join(dir, 'concept.request.json'), JSON.stringify(body, null, 2));
  if (flag('dry-run')) {
    console.log(JSON.stringify(body, null, 2));
    console.log(`\n[dry-run] concept request written to ${dir}/concept.request.json (prompt v${promptVersion(body.system[0].text)})`);
    return null;
  }
  console.log(`Calling ${MODEL} for concept (effort=${EFFORT})...`);
  const msg = await callClaude(body);
  fs.writeFileSync(path.join(dir, 'concept.response.json'), JSON.stringify(msg, null, 2));
  console.log(usageLine(msg));
  const concept = V.parseJsonStrict(V.extractJsonText(msg), 'concept');
  fs.writeFileSync(path.join(dir, 'concept.json'), JSON.stringify(concept, null, 2));
  report('concept', V.validateConcept(concept, brief.format_spec));
  console.log(`concept -> ${dir}/concept.json`);
  console.log(`  ${concept.format_family} | ${concept.working_title} | ${concept.scenes.length} scenes`);
  return concept;
}

async function runMetadata(dir, conceptIn) {
  const concept = conceptIn || readJson(arg('concept'));
  if (!concept) throw new Error('metadata needs --concept <file> or a preceding concept run');
  const settings = readJson(arg('settings', path.join(here, 'fixtures', 'channel-settings.example.json')));
  const history = loadHistory();
  settings.recent_titles = [...(settings.recent_titles || []), ...history.map((e) => e.title).filter(Boolean)].slice(-8);
  const body = buildRequest('metadata', { concept, channel_settings: settings });
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
  report('metadata', V.validateMetadata(meta, concept));
  console.log(`metadata -> ${dir}/metadata.json`);
  console.log(`  title (${meta.title.length}): ${meta.title}`);
  console.log(`  tags (${meta.tags.join(',').length} chars): ${meta.tags.join(', ')}`);
  console.log(`  ai_disclosure: ${meta.ai_disclosure.required} - ${meta.ai_disclosure.reason}`);
  appendHistory({
    date: new Date().toISOString().slice(0, 10), status: 'harness', run: path.basename(dir),
    format_family: concept.format_family, theme: concept.theme,
    palette: concept.visual_style && concept.visual_style.global_palette, mood: concept.audio_brief && concept.audio_brief.mood,
    title: meta.title,
  });
  return meta;
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
  const concept = loadPrompt('concept');
  const metadata = loadPrompt('metadata');
  const prompts = wf.nodes.find((n) => n.name === 'Prompts');
  if (!prompts) throw new Error('workflow has no "Prompts" node');
  const set = (name, value) => {
    const a = prompts.parameters.assignments.assignments.find((x) => x.name === name);
    if (!a) throw new Error(`Prompts node has no assignment "${name}"`);
    a.value = value;
  };
  set('concept_system', concept.system);
  set('concept_schema', JSON.stringify(concept.schema));
  set('metadata_system', metadata.system);
  set('metadata_schema', JSON.stringify(metadata.schema));
  set('prompt_versions', `concept ${promptVersion(concept.system)} / metadata ${promptVersion(metadata.system)}`);
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
  if (cmd === 'concept') { await runConcept(outDir()); return; }
  if (cmd === 'metadata') { await runMetadata(outDir()); return; }
  if (cmd === 'all') {
    const dir = outDir();
    const concept = await runConcept(dir);
    if (flag('dry-run')) {
      // Use a stub concept so the metadata request can still be previewed.
      const stub = readJson(path.join(here, 'fixtures', 'concept.stub.json'));
      await runMetadata(dir, stub);
    } else {
      await runMetadata(dir, concept);
    }
    return;
  }
  if (cmd === 'sync-workflow') {
    const wf = syncedWorkflow(readJson(WORKFLOW));
    fs.writeFileSync(WORKFLOW, JSON.stringify(wf, null, 2) + '\n');
    console.log('workflow synced: ' + path.relative(process.cwd(), WORKFLOW));
    return;
  }
  if (cmd === 'check-workflow') {
    const { problems, creds } = checkWorkflow(readJson(WORKFLOW));
    console.log('credentials referenced by name:');
    for (const [k, n] of creds) console.log(`  ${k}  (${n} node${n > 1 ? 's' : ''})`);
    if (problems.length) { console.log('\nproblems:'); problems.forEach((p) => console.log('  - ' + p)); process.exit(1); }
    console.log('\nworkflow OK');
    return;
  }
  console.log(readText(fileURLToPath(import.meta.url)).split('\n').slice(1, 13).join('\n'));
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => {
  console.error('\n' + (e.status ? 'API error ' + e.status + ': ' + e.message : e.stack || e.message));
  if (e.status === 401) console.error('401 means the key was rejected. Check the "Using ANTHROPIC_API_KEY" line above and the notes next to it.');
  process.exitCode = 1; // not process.exit(): that trips a libuv assertion on Windows while the SDK's sockets close
});
