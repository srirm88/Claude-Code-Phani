// Shared validation for Claude outputs. This file has NO imports and NO exports on purpose:
// the harness loads it with `new Function`, and `run.mjs sync-workflow` pastes it verbatim
// into the "Parse Concept" and "Parse Metadata" Code nodes of the n8n workflow between the
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

function fmtTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

// Word-bounded so "retreat", "healthy" and "wholesome" do not trip it.
var HEALTH_CLAIM = /\b(cure|cures|cured|treat|treats|treatment|heal|heals|healing|therapy|therapeutic|clinically|guaranteed|insomnia cure|anxiety relief)\b/i;

// Returns { ok, errors: [], warnings: [] }. Errors block the run; warnings go to the reviewer.
function validateConcept(concept, formatSpec) {
  const errors = [];
  const warnings = [];
  const spec = formatSpec || {};
  const scenes = Array.isArray(concept.scenes) ? concept.scenes : [];

  if (scenes.length === 0) errors.push('no scenes');
  const total = scenes.reduce((a, s) => a + (Number(s.duration_seconds) || 0), 0);
  const rangeMin = Number(spec.duration_minutes_min) || 0;
  const rangeMax = Number(spec.duration_minutes_max) || 0;
  if (rangeMin > 0 && rangeMax > 0) {
    // format_spec gives a range: the model picks the length, the total must land inside it.
    if (total < rangeMin * 60 || total > rangeMax * 60) errors.push('scene durations sum to ' + total + 's, outside the ' + rangeMin + '-' + rangeMax + ' min range');
  } else {
    const targetMin = Number(spec.duration_minutes) || Number(concept.duration_minutes) || 0;
    if (targetMin > 0) {
      const drift = Math.abs(total - targetMin * 60) / (targetMin * 60);
      if (drift > 0.05) errors.push('scene durations sum to ' + total + 's, target ' + targetMin * 60 + 's (' + Math.round(drift * 100) + '% off)');
    }
  }
  if (Math.round(total / 60) !== Number(concept.duration_minutes)) {
    warnings.push('duration_minutes (' + concept.duration_minutes + ') does not match scene total (' + Math.round(total / 60) + ' min)');
  }
  const minScene = Number(spec.min_scene_seconds) || 90;
  scenes.forEach((s, i) => {
    if (Number(s.index) !== i + 1) errors.push('scene ' + (i + 1) + ' has index ' + s.index);
    if (!(Number(s.duration_seconds) >= minScene)) errors.push('scene ' + (i + 1) + ' is shorter than ' + minScene + 's');
    if (!s.visual_description || s.visual_description.length < 40) errors.push('scene ' + (i + 1) + ' visual_description too thin');
    if (!Array.isArray(s.palette) || s.palette.length < 3) warnings.push('scene ' + (i + 1) + ' palette has fewer than 3 colours');
  });
  if (spec.scene_count_min && scenes.length < spec.scene_count_min) errors.push('fewer scenes than format_spec.scene_count_min');
  if (spec.scene_count_max && scenes.length > spec.scene_count_max) errors.push('more scenes than format_spec.scene_count_max');

  const intro = concept.spoken_intro || {};
  if (spec.spoken_intro === false && intro.enabled) errors.push('spoken intro produced but format_spec forbids it');
  if (intro.enabled && (!intro.script || intro.script.split(/\s+/).length > 170)) errors.push('spoken intro script missing or longer than ~60s spoken');

  const cc = concept.compliance_checklist || {};
  ['no_real_people', 'no_brands_or_trademarks', 'no_copyrighted_subjects', 'audio_is_original_or_licensed', 'no_health_claims', 'adult_audience'].forEach((k) => {
    if (cc[k] !== true) errors.push('compliance_checklist.' + k + ' is not true');
  });
  const scan = JSON.stringify([concept.working_title, concept.alternate_titles, concept.theme, intro.script]);
  const hit = scan.match(HEALTH_CLAIM);
  if (hit) warnings.push('possible health-claim wording in titles/intro ("' + hit[0] + '"): review');
  if (!concept.variation_rationale || concept.variation_rationale.length < 60) warnings.push('variation_rationale is thin; check against recent videos');

  return { ok: errors.length === 0, errors: errors, warnings: warnings, total_seconds: total };
}

function validateMetadata(meta, concept) {
  const errors = [];
  const warnings = [];
  const title = String(meta.title || '');
  if (!title.trim()) errors.push('empty title');
  if (title.length > 100) errors.push('title longer than 100 chars (' + title.length + ')');
  if (/[A-Z]{5,}/.test(title)) warnings.push('title contains an ALL-CAPS run');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(title)) errors.push('title contains emoji');

  const desc = String(meta.description || '');
  if (desc.length > 5000) errors.push('description longer than 5000 chars');
  if (desc.length < 200) warnings.push('description is short (' + desc.length + ' chars)');
  if (/[<>]/.test(desc)) errors.push('description contains < or > which YouTube rejects');

  const tags = Array.isArray(meta.tags) ? meta.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (tags.length < 8) warnings.push('fewer than 8 tags');
  if (tags.length > 20) warnings.push('more than 20 tags');
  const joined = tags.join(',');
  if (joined.length > 480) errors.push('tags total ' + joined.length + ' chars; YouTube limit is 500 including separators');
  if (tags.some((t) => t.length > 100)) errors.push('a single tag exceeds 100 chars');
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  if (lower.size !== tags.length) warnings.push('duplicate tags');

  if (meta.made_for_kids !== false) errors.push('made_for_kids must be false');
  if (!/^\d+$/.test(String(meta.category_id))) errors.push('category_id must be a numeric string');

  // Chapters must match the concept's scene timeline exactly.
  const scenes = concept && Array.isArray(concept.scenes) ? concept.scenes : [];
  const chapters = Array.isArray(meta.chapters) ? meta.chapters : [];
  if (chapters.length < 3) errors.push('fewer than 3 chapters');
  let cursor = 0;
  scenes.forEach((s, i) => {
    const ch = chapters[i];
    if (!ch) { errors.push('missing chapter for scene ' + (i + 1)); cursor += Number(s.duration_seconds) || 0; return; }
    if (Number(ch.start_seconds) !== cursor) errors.push('chapter ' + (i + 1) + ' starts at ' + ch.start_seconds + 's, scene timeline says ' + cursor + 's');
    const expected = fmtTimestamp(cursor);
    if (ch.timestamp !== expected) errors.push('chapter ' + (i + 1) + ' timestamp "' + ch.timestamp + '" should be "' + expected + '"');
    if (!desc.includes(ch.timestamp + ' ')) errors.push('chapter timestamp ' + ch.timestamp + ' not present in description');
    cursor += Number(s.duration_seconds) || 0;
  });
  if (chapters.length > scenes.length) warnings.push('more chapters than scenes');
  if (!desc.startsWith('0:00') && !desc.includes('\n0:00 ')) errors.push('description must contain a "0:00" chapter line');

  const hit = title.match(HEALTH_CLAIM) || desc.match(HEALTH_CLAIM);
  if (hit) warnings.push('possible health-claim wording ("' + hit[0] + '"); review');
  const hashtags = (desc.match(/#\w+/g) || []).length;
  if (hashtags > 3) warnings.push(hashtags + ' hashtags in description; keep to 3');
  if (String(meta.thumbnail_text || '').split(/\s+/).filter(Boolean).length > 4) warnings.push('thumbnail_text longer than 4 words');

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}
