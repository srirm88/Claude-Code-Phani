// Turns the workflow's RenderScript (the same JSON the Creatomate path sends) into one ffmpeg command.
// Supported subset: scene compositions on track 1 with an image child (pan animation start/end scale),
// a fade transition into each scene, a full-frame Fade-Out shape, an optional Title-Card text, and one
// audio element with audio_fade_out and optional loop. Anything else is ignored.
import path from 'node:path';

const pct = (v, fallback) => (v == null ? fallback : Number(String(v).replace('%', '')) / 100);

export function planFromSource(source) {
  const width = Number(source.width) || 1920;
  const height = Number(source.height) || 1080;
  const fps = Number(source.frame_rate) || 25;
  const scenes = [];
  let audio = null;
  let fadeOut = null;
  let title = null;
  for (const el of source.elements || []) {
    if (el.type === 'composition') {
      const img = (el.elements || []).find((c) => c.type === 'image');
      if (!img) continue;
      const pan = (img.animations || []).find((a) => a.type === 'pan') || {};
      const xfade = (el.animations || []).find((a) => a.type === 'fade' && a.transition);
      scenes.push({
        name: el.name, duration: Number(el.duration), source: img.source,
        startScale: pct(pan.start_scale, 1), endScale: pct(pan.end_scale, 1),
        startX: pct(pan.start_x, 0.5), endX: pct(pan.end_x, 0.5),
        xfade: xfade ? Number(xfade.duration) || 0 : 0,
      });
    } else if (el.type === 'audio') {
      audio = { source: el.source, fadeOut: Number(el.audio_fade_out) || 0, loop: !!el.loop, volume: pct(el.volume, 1) };
    } else if (el.type === 'shape' && el.name === 'Fade-Out') {
      fadeOut = { time: Number(el.time), duration: Number(el.duration) };
    } else if (el.type === 'text' && el.name === 'Title-Card' && el.visible !== false) {
      title = { text: el.text, time: Number(el.time) || 0, duration: Number(el.duration) || 8 };
    }
  }
  if (!scenes.length) throw new Error('RenderScript has no scene compositions');
  if (!audio || !audio.source) throw new Error('RenderScript has no audio element');
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  return { width, height, fps, scenes, audio, fadeOut, title, total };
}

// Builds the ffmpeg argument list. `files` maps each asset URL to a local path.
export function buildFfmpegArgs(plan, files, outPath, caps = { drawtext: true }) {
  const { width, height, fps, scenes, audio, fadeOut, title, total } = plan;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-stats'];
  // Each scene image is a looped still. Scenes that are cross-faded INTO by the next scene are extended
  // by that transition length so the overlap does not shorten the total (matches the Creatomate result).
  const inputs = [];
  scenes.forEach((s, i) => {
    const next = scenes[i + 1];
    const extend = next ? next.xfade : 0;
    inputs.push({ dur: s.duration + extend, path: files[s.source] });
    args.push('-loop', '1', '-framerate', String(fps), '-t', String(s.duration + extend), '-i', files[s.source]);
  });
  const audioIndex = scenes.length;
  if (audio.loop) args.push('-stream_loop', '-1');
  args.push('-i', files[audio.source]);

  const filters = [];
  // Per-scene: cover-scale to a 2x canvas, then a slow zoom/drift through zoompan, then a plain fade-in
  // for the very first scene only (later scenes arrive through xfade).
  const bigW = width * 2, bigH = height * 2;
  scenes.forEach((s, i) => {
    const frames = Math.round(inputs[i].dur * fps);
    const z0 = s.startScale, z1 = s.endScale;
    const dz = (z1 - z0) / Math.max(1, frames - 1);
    // x drift as a fraction of the pannable width
    const dx = (s.endX - s.startX);
    const zoomExpr = `${z0}+${dz}*on`;
    const xExpr = `(iw-iw/zoom)/2+(iw-iw/zoom)*(${dx})*on/${Math.max(1, frames - 1)}`;
    filters.push(
      `[${i}:v]scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH},setsar=1,` +
      `zoompan=z='${zoomExpr}':x='${xExpr}':y='(ih-ih/zoom)/2':d=1:s=${width}x${height}:fps=${fps},` +
      `format=yuv420p[v${i}]`
    );
  });
  // Chain cross-fades.
  let last = 'v0';
  let offset = 0;
  for (let i = 1; i < scenes.length; i++) {
    const d = scenes[i].xfade;
    offset += scenes[i - 1].duration; // scene i starts at the cumulative duration of the previous scenes
    const out = i === scenes.length - 1 ? 'vchain' : `x${i}`;
    if (d > 0) filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${d}:offset=${offset - d}[${out}]`);
    else filters.push(`[${last}][v${i}]concat=n=2:v=1:a=0[${out}]`);
    last = out;
  }
  if (scenes.length === 1) filters.push(`[v0]copy[vchain]`);
  // Fade to black, then optional title card.
  let v = 'vchain';
  if (fadeOut) { filters.push(`[${v}]fade=t=out:st=${fadeOut.time}:d=${fadeOut.duration}[vfade]`); v = 'vfade'; }
  if (title && title.text && caps.drawtext) {
    const safe = String(title.text).replace(/\\/g, '\\\\').replace(/'/g, "\\\\'").replace(/:/g, '\\:');
    filters.push(`[${v}]drawtext=text='${safe}':fontsize=h/30:fontcolor=white@0.85:x=(w-text_w)/2:y=h*0.88:` +
      `enable='between(t,${title.time},${title.time + title.duration})':alpha='if(lt(t,${title.time + 1.5}),(t-${title.time})/1.5,if(gt(t,${title.time + title.duration - 1.5}),(${title.time + title.duration}-t)/1.5,1))'[vtitle]`);
    v = 'vtitle';
  }
  filters.push(`[${v}]trim=duration=${total},setpts=PTS-STARTPTS[vout]`);
  // Audio: trim to the piece, fade out, volume.
  const afade = audio.fadeOut > 0 ? `,afade=t=out:st=${Math.max(0, total - audio.fadeOut)}:d=${audio.fadeOut}` : '';
  filters.push(`[${audioIndex}:a]atrim=duration=${total},asetpts=PTS-STARTPTS,volume=${audio.volume}${afade}[aout]`);

  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'faster', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(total), outPath);
  return args;
}
