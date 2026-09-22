// Shared validation for Claude outputs (The Money Pipes). NO imports and NO exports on purpose:
// the harness loads it with `new Function`, and `run.mjs sync-workflow` pastes it verbatim into
// the "Parse Draft" and "Parse Metadata" Code nodes of the n8n workflow between the
// `// ---- shared validation` markers. Keep it plain ES2020.

function extractJsonText(apiResponse) {
  if (!apiResponse || typeof apiResponse !== 'object') throw new Error('Empty API response');
  if (apiResponse.stop_reason === 'refusal') {
    const cat = apiResponse.stop_details && apiResponse.stop_details.category;
    throw new Error('Claude refused the request' + (cat ? ' (category: ' + cat + ')' : ''));
  }
  if (apiResponse.stop_reason === 'max_tokens') {
    throw new Error('Output truncated at max_tokens; raise max_tokens in the request builder');
  }
  const blocks = Array.isArray(apiResponse.content) ? apiResponse.content : [];
  const text = blocks.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  if (!text.trim()) throw new Error('No text block in API response (stop_reason=' + apiResponse.stop_reason + ')');
  return text;
}

function parseJsonStrict(text, label) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(label + ': output is not valid JSON: ' + e.message + '\n' + text.slice(0, 400));
  }
}

// The API's structured-output mode accepts a subset of JSON Schema: no minItems above 1, no maxItems,
// no string/number bounds, no pattern, no const. Strip those for the request; validateDraft/validateMetadata
// enforce the same limits after the fact, and the full schema stays on disk for the harness's own checks.
function apiSchema(schema) {
  const DROP = ['maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', '$schema', 'title'];
  function walk(node) {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const k of Object.keys(node)) {
      if (DROP.indexOf(k) >= 0) continue;
      if (k === 'minItems') { if (node[k] === 0 || node[k] === 1) out[k] = node[k]; continue; }
      if (k === 'const') { out.enum = [node[k]]; continue; }
      out[k] = walk(node[k]);
    }
    return out;
  }
  return walk(schema);
}

function fmtTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

var HEADINGS = ['Hook', 'What everyone gets wrong', 'The mechanism', 'Where it breaks', 'The takeaway'];

// Phrases the channel never says. Word-bounded, case-insensitive.
var BANNED_PHRASES = [
  /\bin this video\b/i, /\blet'?s dive in\b/i, /\bsmash (that|the) like\b/i, /\bhey guys\b/i, /\bguys\b/i,
  /\byou won'?t believe\b/i, /\bmind[- ]?blowing\b/i, /\bgame[- ]?changer\b/i, /\bwithout further ado\b/i,
  /\bdon'?t forget to subscribe\b/i, /\bwelcome back\b/i,
];
// Recommendation language the channel avoids (it explains machinery, it does not advise).
var RECOMMENDATION = /\b(you should (invest|buy|sell|move your money|switch banks)|best (bank|card|account) for you|financial advice)\b/i;
// A number long enough to be an account, volume or identifier; years are handled separately.
var LONG_NUMBER = /\b\d{6,}\b|\b\d{1,3}(,\d{3}){2,}\b/;
var SPECIFIC_DATE = /\b(\d{1,2}(st|nd|rd|th)?\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2},?\s+)?(19|20)\d{2}\b/i;

function wordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Builds a case-insensitive, word-bounded matcher for a list of names; tolerant of possessives.
function nameMatcher(names) {
  const list = (Array.isArray(names) ? names : []).map((n) => String(n).trim()).filter(Boolean);
  if (list.length === 0) return null;
  return new RegExp('\\b(' + list.map(escapeRe).join('|') + ")('s)?\\b", 'i');
}

// Returns { ok, errors: [], warnings: [], word_count }. Errors block; warnings go to the reviewer.
function validateDraft(draft, brief) {
  const errors = [];
  const warnings = [];
  const spec = (brief && brief.format_spec) || {};
  const grammar = (brief && brief.diagram_grammar && brief.diagram_grammar.objects) || null;
  const bannedNames = nameMatcher(brief && brief.banned_names);
  const vendorNames = nameMatcher(brief && brief.vendor_names);
  const sections = Array.isArray(draft.sections) ? draft.sections : [];

  // Structure
  if (sections.length !== 5) errors.push('expected 5 sections, got ' + sections.length);
  sections.forEach((s, i) => {
    if (Number(s.index) !== i + 1) errors.push('section ' + (i + 1) + ' has index ' + s.index);
    if (s.heading !== HEADINGS[i]) errors.push('section ' + (i + 1) + ' heading is "' + s.heading + '", expected "' + HEADINGS[i] + '"');
  });

  // Word count
  const words = sections.reduce((a, s) => a + wordCount(s.narration), 0);
  const wmin = Number(spec.words_min) || 0;
  const wmax = Number(spec.words_max) || 0;
  if (wmin && words < wmin) errors.push('narration is ' + words + ' words, under words_min ' + wmin);
  if (wmax && words > wmax) errors.push('narration is ' + words + ' words, over words_max ' + wmax);
  const mech = sections[2];
  if (mech && wordCount(mech.narration) < words * 0.3) warnings.push('"The mechanism" is under 30% of the script; it should be the longest section');

  // Text rules per section
  const allText = sections.map((s) => s.narration).join('\n');
  sections.forEach((s, i) => {
    const t = String(s.narration || '');
    BANNED_PHRASES.forEach((re) => {
      const m = t.match(re);
      if (m) errors.push('section ' + (i + 1) + ' uses a banned phrase: "' + m[0] + '"');
    });
    if (/!/.test(t)) warnings.push('section ' + (i + 1) + ' contains an exclamation mark');
    if (bannedNames) {
      const m = t.match(bannedNames);
      if (m) errors.push('section ' + (i + 1) + ' names a banned institution: "' + m[0] + '"');
    }
    if (vendorNames) {
      const m = t.match(vendorNames);
      if (m && i !== 2) errors.push('section ' + (i + 1) + ' names a vendor product ("' + m[0] + '"); vendors may appear only in "The mechanism", in a neutral list');
      if (m && i === 2 && /\b(fail|failed|failing|broke|broken|crash|crashed|outage|bug)\b/i.test(t)) warnings.push('"The mechanism" names a vendor and also uses failure language; check the vendor is not being blamed');
    }
    const ln = t.match(LONG_NUMBER);
    if (ln) warnings.push('section ' + (i + 1) + ' contains a long number ("' + ln[0] + '"); could it identify an institution?');
    const dt = t.match(SPECIFIC_DATE);
    if (dt && i === 3) warnings.push('"Where it breaks" contains a specific date ("' + dt[0] + '"); a dated outage can identify a bank');
    const rec = t.match(RECOMMENDATION);
    if (rec) errors.push('section ' + (i + 1) + ' contains recommendation language: "' + rec[0] + '"');
  });
  if (sections[0] && /^\s*(in this video|today|hi|hello|welcome)/i.test(sections[0].narration)) errors.push('Hook opens with a greeting or announcement');
  if (sections[4] && !/money is a message/i.test(sections[4].narration)) warnings.push('"The takeaway" does not use the channel line "Money is a message"');

  // Frames
  let cards = 0;
  sections.forEach((s, i) => {
    const frames = Array.isArray(s.frames) ? s.frames : [];
    if (frames.length === 0) errors.push('section ' + (i + 1) + ' has no frames');
    const narration = String(s.narration || '');
    let lastCuePos = -1;
    frames.forEach((f, j) => {
      const tag = 'section ' + (i + 1) + ' frame ' + (j + 1);
      const cue = String(f.narration_cue || '');
      const pos = narration.indexOf(cue);
      if (!cue || pos < 0) errors.push(tag + ': narration_cue is not a verbatim substring of the section narration');
      else {
        if (pos <= lastCuePos) errors.push(tag + ': narration_cue appears before the previous frame\'s cue; frames must be in narration order');
        // ~2.6 words/second; 12 s minimum on screen ≈ 31 words between cues
        if (lastCuePos >= 0 && wordCount(narration.slice(lastCuePos, pos)) < 28) warnings.push(tag + ': cue is under ~12 s after the previous frame');
        lastCuePos = pos;
      }
      const objs = Array.isArray(f.objects) ? f.objects : [];
      if (objs.length === 0) errors.push(tag + ': no objects');
      if (objs.length > 7) errors.push(tag + ': ' + objs.length + ' objects; maximum is 7');
      if (grammar) objs.forEach((o) => { if (grammar.indexOf(o.kind) < 0) errors.push(tag + ': object kind "' + o.kind + '" is not in the diagram grammar'); });
      objs.forEach((o) => { if (o.label && wordCount(o.label) > 4) warnings.push(tag + ': label "' + o.label + '" is over four words'); });
      if (f.fault === true && i !== 3) errors.push(tag + ': fault=true outside "Where it breaks"');
      if (f.fault !== true && objs.some((o) => o.state === 'fault')) errors.push(tag + ': an object has state=fault but the frame is not marked fault');
      if (['none', 'dots_flow', 'push_in'].indexOf(f.motion) < 0) errors.push(tag + ': motion "' + f.motion + '" is not allowed');
      if (f.text_card) { cards += 1; if (wordCount(f.text_card) > 6) errors.push(tag + ': text_card is over six words'); }
    });
  });
  if (cards > 3) warnings.push(cards + ' text cards; keep to three per video');

  // Glossary: any grammar jargon term used in narration should be in the glossary
  const jargon = (brief && Array.isArray(brief.jargon_terms)) ? brief.jargon_terms : [];
  const glossary = Array.isArray(draft.glossary) ? draft.glossary.map((g) => String(g.term || '').toLowerCase()) : [];
  jargon.forEach((term) => {
    const re = new RegExp('\\b' + escapeRe(term) + '\\b', 'i');
    if (re.test(allText) && glossary.indexOf(String(term).toLowerCase()) < 0) warnings.push('term "' + term + '" is used but not in glossary');
  });

  // Lists
  if (!Array.isArray(draft.open_questions_for_author) || draft.open_questions_for_author.length < 3) errors.push('open_questions_for_author has fewer than 3 items; the draft is overconfident');
  if (!Array.isArray(draft.simplifications) || draft.simplifications.length < 2) errors.push('simplifications has fewer than 2 items');

  // Compliance flags (the model's self-report; errors above are the real check)
  const cc = draft.compliance || {};
  ['no_bank_named', 'no_vendor_blamed', 'no_identifying_numbers', 'no_banned_phrases', 'no_recommendations'].forEach((k) => {
    if (cc[k] !== true) errors.push('compliance.' + k + ' is not true');
  });

  return { ok: errors.length === 0, errors: errors, warnings: warnings, word_count: words };
}

// sectionTimings: [{index, start_seconds}] measured from the narration audio (5 entries).
function validateMetadata(meta, sectionTimings, settings) {
  const errors = [];
  const warnings = [];
  const cfg = settings || {};
  const titles = Array.isArray(meta.title_variants) ? meta.title_variants : [];
  if (titles.length !== 3) errors.push('expected 3 title variants');
  titles.forEach((t, i) => {
    const title = String(t || '');
    if (!title.trim()) errors.push('title ' + (i + 1) + ' is empty');
    if (title.length > 70) errors.push('title ' + (i + 1) + ' longer than 70 chars');
    if (/[A-Z]{4,}/.test(title.replace(/\b(UPI|SWIFT|ATM|EOD|API|ACH|RTGS|NEFT|IMPS|ISO|MQ|DR)\b/g, ''))) warnings.push('title ' + (i + 1) + ' contains an ALL-CAPS run');
    if (/[\u{1F300}-\u{1FAFF}]/u.test(title)) errors.push('title ' + (i + 1) + ' contains emoji');
    if (/:\s/.test(title)) warnings.push('title ' + (i + 1) + ' has a colon subtitle');
    BANNED_PHRASES.forEach((re) => { if (re.test(title)) errors.push('title ' + (i + 1) + ' uses a banned phrase'); });
  });

  const desc = String(meta.description || '');
  if (desc.length > 5000) errors.push('description longer than 5000 chars');
  if (desc.length < 200) warnings.push('description is short (' + desc.length + ' chars)');
  if (/[<>]/.test(desc)) errors.push('description contains < or > which YouTube rejects');
  if (!/\nChapters\n/.test(desc)) errors.push('description is missing the "Chapters" block');
  if (!/Simplifications made in this video:/.test(desc)) errors.push('description is missing the simplifications line');
  if (!/Narration is generated from the author'?s own voice recording\./.test(desc)) errors.push('description is missing the narration disclosure line');
  if (!/No investing advice\./.test(desc)) errors.push('description is missing the channel footer');
  if (cfg.newsletter_url && desc.indexOf(cfg.newsletter_url) < 0) warnings.push('newsletter URL not present in description');
  const bannedNames = nameMatcher(cfg.banned_names);
  if (bannedNames) { const m = (desc + ' ' + titles.join(' ')).match(bannedNames); if (m) errors.push('metadata names a banned institution: "' + m[0] + '"'); }

  const tags = Array.isArray(meta.tags) ? meta.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (tags.length < 10) warnings.push('fewer than 10 tags');
  if (tags.length > 15) warnings.push('more than 15 tags');
  const joined = tags.join(',');
  if (joined.length > 480) errors.push('tags total ' + joined.length + ' chars; YouTube limit is 500');
  if (tags.some((t) => t !== t.toLowerCase())) warnings.push('tags should be lowercase');
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  if (lower.size !== tags.length) warnings.push('duplicate tags');

  if (meta.made_for_kids !== false) errors.push('made_for_kids must be false');
  if (!/^\d+$/.test(String(meta.category_id))) errors.push('category_id must be a numeric string');

  // Chapters must match the measured section timings exactly.
  const timings = Array.isArray(sectionTimings) ? sectionTimings : [];
  const chapters = Array.isArray(meta.chapters) ? meta.chapters : [];
  if (chapters.length !== 5) errors.push('expected 5 chapters, got ' + chapters.length);
  timings.forEach((tm, i) => {
    const ch = chapters[i];
    const start = Math.round(Number(tm.start_seconds) || 0);
    if (!ch) { errors.push('missing chapter for section ' + (i + 1)); return; }
    if (Number(ch.start_seconds) !== start) errors.push('chapter ' + (i + 1) + ' starts at ' + ch.start_seconds + 's, narration says ' + start + 's');
    const expected = fmtTimestamp(start);
    if (ch.timestamp !== expected) errors.push('chapter ' + (i + 1) + ' timestamp "' + ch.timestamp + '" should be "' + expected + '"');
    if (desc.indexOf(ch.timestamp + ' ') < 0) errors.push('chapter timestamp ' + ch.timestamp + ' not present in description');
    if (HEADINGS.indexOf(String(ch.label)) >= 0) warnings.push('chapter ' + (i + 1) + ' label is the fixed heading name; use a topical label');
  });
  if (!/\n0:00 /.test(desc)) errors.push('description must contain a "0:00" chapter line');

  const pin = String(meta.pinned_comment || '');
  if (!/Corrections and additions go here/.test(pin)) errors.push('pinned_comment does not use the template');
  if (wordCount(meta.thumbnail_text) > 6) errors.push('thumbnail_text longer than 6 words');
  const hashtags = (desc.match(/#\w+/g) || []).length;
  if (hashtags > 3) warnings.push(hashtags + ' hashtags in description; keep to 3');

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}
