#!/usr/bin/env node
// Local test harness for the ambient-pipeline Claude prompts.
//
//   node run.mjs concept  [--brief fixtures/brief.example.json] [--dry-run] [--out out/]
//   node run.mjs metadata --concept out/<run>/concept.json [--settings fixtures/channel-settings.example.json]
//   node run.mjs all      [--brief ...] [--dry-run]
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
const validateSrc = fs.readFileSync(path.join(here, 'lib', 'validate.js'), 'utf8');
const V = new Function(validateSrc + '\n; return { extractJsonText, parseJsonStrict, validateConcept, validateMetadata, fmtTimestamp };')();

// ---------- helpers ----------
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes('--' + name);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readText = (p) => fs.readFileSync(p, 'utf8');

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

async function callClaude(body) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
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
async function runConcept(dir) {
  const brief = readJson(arg('brief', path.join(here, 'fixtures', 'brief.example.json')));
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
    creds.set(type, c.name);
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
    for (const [t, n] of creds) console.log(`  ${t.padEnd(18)} -> "${n}"`);
    if (problems.length) { console.log('\nproblems:'); problems.forEach((p) => console.log('  - ' + p)); process.exit(1); }
    console.log('\nworkflow OK');
    return;
  }
  console.log(readText(fileURLToPath(import.meta.url)).split('\n').slice(1, 13).join('\n'));
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => { console.error('\n' + (e.stack || e.message)); process.exit(1); });
