// BTS Video — smart tools: beat detection + auto-cut to beats, scene edit detection, transcript → timed captions
// (FFmpeg silencedetect + energy envelope), censor list / bleep and project templates.
'use strict';

// =====================================================================  helpers
const tmpPath = async name => (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/') + '/' + name;
const ffEsc = p => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
async function readText(p) { try { return await (await fetch(fileUrl(p) + '?' + Date.now())).text(); } catch { return ''; } }
// reads a float32 mono WAV written by FFmpeg (pcm_f32le)
function parseWavF32(buf) {
  const dv = new DataView(buf); let o = 12; let sr = 16000, data = null;
  while (o + 8 <= dv.byteLength) { const id = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); let sz = dv.getUint32(o + 4, true);
    if (id === 'fmt ') sr = dv.getUint32(o + 12, true); if (id === 'data') { if (!sz || o + 8 + sz > dv.byteLength) sz = dv.byteLength - o - 8; data = new Float32Array(buf.slice(o + 8, o + 8 + (sz - sz % 4))); break; } o += 8 + sz + (sz % 2); }
  return { sr, data: data || new Float32Array(0) };
}
async function extractPcm(path, sIn, dur, sr = 22050) {
  const out = await tmpPath(`pcm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.wav`);
  const r = await bts.ffmpeg.run(['-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, sIn)), '-t', String(dur), '-i', path, '-vn', '-ac', '1', '-ar', String(sr), '-c:a', 'pcm_f32le', '-f', 'wav', out]);
  if (!r.ok) throw new Error('Could not read the audio: ' + String(r.log).split('\n').filter(Boolean).slice(-1)[0]);
  return parseWavF32(await (await fetch(fileUrl(out))).arrayBuffer());
}
function fft(re, im) { // in-place radix-2
  const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], k = i + j + len / 2; const vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[k] = ur - vr; im[k] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
}

// =====================================================================  beat detection
// spectral-flux onsets → tempo by autocorrelation → beat phase → beats snapped to nearby onset peaks
function detectBeats(pcm, sr) {
  const N = 1024, hop = 256, win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); const frames = Math.max(0, Math.floor((pcm.length - N) / hop));
  const env = new Float32Array(frames), low = new Float32Array(frames); let prev = new Float32Array(N / 2); const re = new Float32Array(N), im = new Float32Array(N); const kLow = Math.max(2, Math.round(250 / (sr / N)));
  for (let f = 0; f < frames; f++) { for (let i = 0; i < N; i++) { re[i] = pcm[f * hop + i] * win[i]; im[i] = 0; } fft(re, im); let flux = 0, lf = 0;
    for (let k = 1; k < N / 2; k++) { const mag = Math.log1p(Math.hypot(re[k], im[k]) * 10); const d = mag - prev[k]; if (d > 0) { flux += d; if (k <= kLow) lf += d; } prev[k] = mag; } env[f] = flux; low[f] = lf; }
  const rate = sr / hop; if (frames < rate * 2) return { bpm: 0, beats: [], onsets: [] };
  // normalise & remove the moving average
  const m = new Float32Array(frames); const w = Math.round(rate * 0.25); let acc = 0; for (let i = 0; i < frames; i++) { acc += env[i]; if (i >= 2 * w) acc -= env[i - 2 * w]; m[i] = acc / Math.min(i + 1, 2 * w); }
  const on = new Float32Array(frames); for (let i = 0; i < frames; i++) { const j = Math.max(0, i - w); on[i] = Math.max(0, env[i] - (m[Math.min(frames - 1, i + w)] || m[i]) * 1.0); }
  // tempo: autocorrelation over 60..190 BPM with a preference around 120
  let best = { s: -1, lag: 0 }; const lo = Math.floor(rate * 60 / 190), hi = Math.ceil(rate * 60 / 60);
  for (let lag = lo; lag <= hi; lag++) { let s = 0; for (let i = lag; i < frames; i++) s += on[i] * on[i - lag]; const bpm = 60 * rate / lag; s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2)); if (s > best.s) best = { s, lag }; }
  // refine the period with the neighbours (parabolic)
  const ac = lag => { let s = 0; for (let i = lag; i < frames; i++) s += on[i] * on[i - lag]; return s; };
  const a0 = ac(best.lag - 1), a1 = ac(best.lag), a2 = ac(best.lag + 1); const d = a0 - 2 * a1 + a2; const period = best.lag + (Math.abs(d) > 1e-9 ? clamp(0.5 * (a0 - a2) / d, -0.5, 0.5) : 0);
  // phase: the offset whose beat grid collects the most onset energy — bass (kick) onsets count most, so cuts land on the downbeat
  let lmax = 0, omax = 0; for (let i = 0; i < frames; i++) { lmax = Math.max(lmax, low[i]); omax = Math.max(omax, on[i]); } const lw = lmax > 0 ? omax / lmax * 1.5 : 0;
  let ph = { s: -1, o: 0 }; for (let o = 0; o < period; o += 0.5) { let s = 0; for (let t = o; t < frames; t += period) { const i = Math.round(t); s += (on[i] || 0) + (low[i] || 0) * lw; } if (s > ph.s) ph = { s, o }; }
  const beats = []; const tol = Math.round(period * 0.12);
  for (let t = ph.o; t < frames; t += period) { const c = Math.round(t); let bi = c, bv = -1; for (let i = Math.max(0, c - tol); i <= Math.min(frames - 1, c + tol); i++) if (on[i] > bv) { bv = on[i]; bi = i; } beats.push((bv > 0 ? bi * 0.6 + c * 0.4 : c) / rate + N / 2 / sr); }
  const onsets = []; for (let i = 1; i < frames - 1; i++) if (on[i] > on[i - 1] && on[i] >= on[i + 1] && on[i] > 0.5 * (m[i] || 1)) onsets.push(i / rate);
  return { bpm: Math.round(60 * rate / period * 10) / 10, beats, onsets };
}
async function beatDetect(c, opts = {}) {
  c = c || selected().find(x => hasAudioOf(x) && x.type !== 'nest') || PJ.clips.find(x => x.type === 'audio'); if (!c) return toast('Select a music clip (or put one on an audio track)', 'err');
  if (!ST.ffmpeg) return toast('Beat detection needs FFmpeg', 'err'); const m = mediaById(c.mediaId); if (!m || m.missing) return toast('The media is offline', 'err');
  setStatus('Analysing beats…'); const sr = 22050; const dur = c.out - c.in;
  const { data } = await extractPcm(m.proxy || m.path, c.in, dur, sr); const res = detectBeats(data, sr);
  if (!res.beats.length) { setStatus('Ready'); return toast('No steady beat found in this clip', 'err'); }
  PJ.markers = PJ.markers.filter(mk => !(mk.beat && mk.src === c.id)); const every = opts.every || 1; let n = 0;
  res.beats.forEach((b, i) => { if (i % every) return; const t = c.start + b / spd(c); if (t < c.start || t > cEnd(c)) return; const bar = i % 4 === 0; PJ.markers.push({ id: uid('k'), t: frameSnap(t), label: bar ? `Bar ${i / 4 + 1}` : '', color: bar ? '#f97316' : '#eab308', beat: true, src: c.id }); n++; });
  PJ.markers.sort((a, b) => a.t - b.t); ST.snap = true; commit('Detect beats'); renderTimeline(); renderHead(); setStatus(`${res.bpm} BPM`);
  if (!opts.silent) toast(`${n} beat markers added (${res.bpm} BPM) — snapping to beats is on`, 'ok', 5000); return { bpm: res.bpm, beats: n };
}
function clearBeatMarkers() { const n = PJ.markers.length; PJ.markers = PJ.markers.filter(mk => !mk.beat); commit('Clear beat markers'); renderTimeline(); toast(`Removed ${n - PJ.markers.length} beat markers`); }
// lays the selected visual clips out back-to-back, each cut to `every` beats
async function autoCutToBeats({ every = 2, repeat = false, from } = {}) {
  let beats = PJ.markers.filter(mk => mk.beat).map(mk => mk.t); if (beats.length < 2) { const r = await beatDetect(null, { silent: true }); if (!r) return; beats = PJ.markers.filter(mk => mk.beat).map(mk => mk.t); }
  const sel = selected().filter(c => isVisual(c) && c.type !== 'adjust').sort((a, b) => a.start - b.start); if (!sel.length) return toast('Select the clips to cut to the beat', 'err');
  const track = sel[0].track; const start = from ?? sel[0].start; let bi = beats.findIndex(b => b >= start - 1e-3); if (bi < 0) return toast('No beats after the first selected clip', 'err');
  const partners = new Map(sel.map(c => [c.id, c.link ? PJ.clips.filter(o => o.link === c.link && o !== c && !isVisual(o)) : []]));
  const drop = new Set([...sel.map(c => c.id), ...[...partners.values()].flat().map(c => c.id)]); PJ.clips = PJ.clips.filter(c => !drop.has(c.id));
  const placed = []; let i = 0, pass = 0;
  while (bi < beats.length - 1) {
    const src = sel[i % sel.length]; if (i >= sel.length && !repeat) break; const nb = Math.min(beats.length - 1, bi + every); let len = beats[nb] - beats[bi];
    const avail = src.type === 'video' || src.type === 'nest' ? (srcMax(src) - src.in) / spd(src) : Infinity; let k = nb; while (len > avail + 1e-3 && k > bi + 1) { k--; len = beats[k] - beats[bi]; } if (len > avail + 1e-3) len = avail;
    const c = i < sel.length ? src : JSON.parse(JSON.stringify(src)); if (c !== src) { c.id = uid('c'); c.link = null; }
    c.track = track; c.start = beats[bi]; c.out = c.in + len * spd(c); c.props.fadeIn = c.props.fadeOut = 0; overwrite(c); PJ.clips.push(c); placed.push(c);
    (i < sel.length ? partners.get(src.id) : []).forEach(a => { a.start = c.start; a.in = c.in; a.out = c.out; overwrite(a); PJ.clips.push(a); });
    bi = k; i++; if (i % sel.length === 0) pass++; if (pass > 200) break;
  }
  select(placed.map(c => c.id)); commit('Auto-cut to beats'); drawFrame(); toast(`Cut ${placed.length} clip(s) to the beat (every ${every} beat${every > 1 ? 's' : ''})`, 'ok'); return placed.length;
}
async function autoCutDialog() { const v = await form({ title: 'Auto-cut to beats', fields: [{ key: 'every', label: 'Cut every', type: 'select', value: '2', options: [{ value: '1', label: '1 beat' }, { value: '2', label: '2 beats' }, { value: '4', label: '4 beats (1 bar)' }, { value: '8', label: '8 beats (2 bars)' }] }, { key: 'repeat', label: 'Repeat the clips until the beats run out', type: 'checkbox', value: false }] }); if (!v) return; return autoCutToBeats({ every: +v.every, repeat: v.repeat }); }

// =====================================================================  scene edit detection
async function detectScenes(c, thr = 0.3) {
  const m = mediaById(c.mediaId); const out = await tmpPath(`scenes-${Date.now().toString(36)}.txt`);
  const r = await bts.ffmpeg.run(['-hide_banner', '-loglevel', 'error', '-ss', c.in.toFixed(3), '-t', (c.out - c.in).toFixed(3), '-i', m.proxy || m.path, '-an', '-vf', `select='gt(scene,${thr})',metadata=mode=print:file=${ffEsc(out)}`, '-f', 'null', '-']);
  if (!r.ok) throw new Error('FFmpeg could not analyse the clip');
  const txt = await readText(out); return [...txt.matchAll(/pts_time:([\d.]+)/g)].map(x => c.in + +x[1]).filter(t => t > c.in + 0.1 && t < c.out - 0.1);
}
async function sceneDetect(c, thr = 0.3) {
  c = c || selected().find(x => x.type === 'video'); if (!c) return toast('Select a video clip', 'err'); if (!ST.ffmpeg) return toast('Scene detection needs FFmpeg', 'err');
  setStatus('Detecting scene changes…'); const cuts = await detectScenes(c, thr); setStatus('Ready');
  if (!cuts.length) { toast('No scene changes found'); return 0; }
  const group = c.link ? PJ.clips.filter(o => o.link === c.link) : [c]; const sp = spd(c); let n = 0;
  cuts.map(st => c.start + (st - c.in) / sp).sort((a, b) => b - a).forEach(t => { const parts = PJ.clips.filter(o => group.some(g => g.mediaId === o.mediaId && g.track === o.track) && o.start < t - 1e-3 && cEnd(o) > t + 1e-3); parts.forEach(p => { if (splitClip(p, frameSnap(t))) n++; }); PJ.markers.push({ id: uid('k'), t: frameSnap(t), label: 'Scene', color: '#06b6d4' }); });
  PJ.markers.sort((a, b) => a.t - b.t); commit('Scene edit detection'); renderTimeline(); drawFrame(); toast(`Found ${cuts.length} scene change(s) — the clip was cut at each one`, 'ok', 5000); return cuts.length;
}
async function sceneDetectDialog() { const c = selected().find(x => x.type === 'video'); if (!c) return toast('Select a video clip', 'err'); const v = await form({ title: 'Scene edit detection', fields: [{ key: 'thr', label: 'Sensitivity (lower finds more cuts)', type: 'range', value: 30, min: 5, max: 80 }] }); if (!v) return; return sceneDetect(c, +v.thr / 100); }

// =====================================================================  transcript → timed captions
// Auto-captions: no small, permissively licensed speech-recognition model could be enabled here, so BTS Video
// aligns a transcript the user pastes: FFmpeg renders the timeline audio (mono 16 kHz), silencedetect finds the pauses,
// and the energy envelope places the word boundaries. Every caption keeps per-word timings (used by the bleep).
async function timelineSpeech(t0, t1) {
  const bl = PJ.censor.bleep; PJ.censor.bleep = false; let A; try { A = buildAudio(t0, t1, 0); } finally { PJ.censor.bleep = bl; } if (!A.n) throw new Error('There is no audio in this range');
  const wav = await tmpPath(`speech-${Date.now().toString(36)}.wav`), sil = wav.replace(/\.wav$/, '-silence.txt');
  const ga = await graphArgs(A.graph.replace(/,apad\[aout\]/, '[aout]'));
  let r = await bts.ffmpeg.run([...A.inputs, ...ga, '-map', '[aout]', '-t', (t1 - t0).toFixed(3), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_f32le', '-f', 'wav', wav]); if (!r.ok) throw new Error('Could not render the audio');
  const { sr, data } = parseWavF32(await (await fetch(fileUrl(wav))).arrayBuffer()); const dur = data.length / sr;
  const rate = 100, hop = Math.round(sr / rate); const env = new Float32Array(Math.ceil(data.length / hop)); for (let i = 0; i < env.length; i++) { let s = 0; const a = i * hop, b = Math.min(data.length, a + hop); for (let j = a; j < b; j++) s += data[j] * data[j]; env[i] = Math.sqrt(s / Math.max(1, b - a)); }
  // silence threshold adapts to the recording: noise floor (10th percentile of the energy) + 9 dB
  const db = Array.from(env, v => 20 * Math.log10(v + 1e-7)).sort((a, b) => a - b); const floor = db[Math.floor(db.length * 0.1)] ?? -60; const thr = clamp(Math.round(floor + 9), -55, -18);
  r = await bts.ffmpeg.run(['-hide_banner', '-i', wav, '-af', `silencedetect=n=${thr}dB:d=0.18,ametadata=mode=print:file=${ffEsc(sil)}`, '-f', 'null', '-']);
  const txt = await readText(sil); const silences = []; let s0 = null; txt.split('\n').forEach(l => { let mm = l.match(/silence_start=(-?[\d.]+)/); if (mm) s0 = Math.max(0, +mm[1]); mm = l.match(/silence_end=([\d.]+)/); if (mm) { silences.push([s0 ?? 0, +mm[1]]); s0 = null; } }); if (s0 != null) silences.push([s0, dur]);
  const speech = []; let pos = 0; silences.forEach(([a, b]) => { if (a - pos > 0.05) speech.push([t0 + pos, t0 + a]); pos = b; }); if (dur - pos > 0.05) speech.push([t0 + pos, t0 + dur]);
  return { speech, env, rate, thr };
}
async function autoTimeTranscript(text, { t0 = 0, t1 = seqDuration(), replace = true, maxWords = 7 } = {}) {
  if (!ST.ffmpeg) throw new Error('Needs FFmpeg'); text = String(text || '').trim(); if (!text) throw new Error('Paste the transcript first');
  setStatus('Timing transcript…'); const { speech, env, rate } = await timelineSpeech(t0, t1);
  const caps = VCAP.alignTranscript(text, speech, env, rate, t0, t1, { maxWords }); setStatus('Ready'); if (!caps.length) throw new Error('Nothing to align');
  if (replace) PJ.captions = PJ.captions.filter(cp => cp.end <= t0 || cp.start >= t1);
  caps.forEach(c => PJ.captions.push({ id: uid('cc'), ...c })); PJ.captions.sort((a, b) => a.start - b.start); commit('Auto-time transcript'); showLeft('captions'); renderTimeline(); drawFrame();
  return { captions: caps.length, words: caps.reduce((s, c) => s + c.words.length, 0), speech: speech.length, segments: speech.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]) };
}
async function transcriptDialog() {
  if (!PJ.clips.some(hasAudioOf)) return toast('Add a clip with speech first', 'err');
  const io = ST.inP != null || ST.outP != null; const v = await form({ title: 'Auto-time a transcript (offline captions)', width: 560, fields: [
    { key: 'text', label: 'Paste what is said (one block of text; punctuation helps place the line breaks)', type: 'textarea', rows: 9, value: '' },
    { key: 'range', label: 'Audio to align', type: 'select', value: io ? 'io' : 'all', options: [{ value: 'all', label: 'Whole sequence' }, ...(io ? [{ value: 'io', label: 'In to Out' }] : []), ...(selected().length ? [{ value: 'sel', label: 'Selected clips' }] : [])] },
    { key: 'maxWords', label: 'Max words per caption', type: 'number', value: 7, min: 2, max: 16 }, { key: 'replace', label: 'Replace captions in that range', type: 'checkbox', value: true }] });
  if (!v) return; const [t0, t1] = exportRange(v.range);
  const pm = progressModal('Timing the transcript'); pm.set(0.3, 'Rendering audio, detecting pauses and word boundaries…');
  try { const r = await autoTimeTranscript(v.text, { t0, t1, replace: v.replace, maxWords: +v.maxWords || 7 }); pm.close(); toast(`Created ${r.captions} timed captions (${r.words} words) — edit them in the Captions panel`, 'ok', 6000); }
  catch (e) { pm.close(); setStatus('Ready'); toast(e.message, 'err', 6000); }
}

// =====================================================================  censor list
async function censorDialog() {
  const c = PJ.censor; const v = await form({ title: 'Filter censored words', width: 460, fields: [
    { key: 'words', label: 'Words to censor (comma or new line; end with * to match endings, e.g. damn*)', type: 'textarea', rows: 5, value: c.words.join(', ') },
    { key: 'on', label: 'Mask them in captions (e.g. f***) — preview, burn-in and SRT/VTT export', type: 'checkbox', value: c.on },
    { key: 'bleep', label: 'Bleep: mute the audio and play a 1 kHz tone over each censored word', type: 'checkbox', value: c.bleep },
    { key: 'estimate', label: 'Estimate word timings for captions without them (imported SRT)', type: 'checkbox', value: c.estimate }] });
  if (!v) return; setCensor({ words: v.words, on: v.on, bleep: v.bleep, estimate: v.estimate });
}
function setCensor(o) {
  const words = Array.isArray(o.words) ? o.words : String(o.words || '').split(/[,\n;]+/); PJ.censor = { ...PJ.censor, ...o, words: [...new Set(words.map(w => w.trim().toLowerCase()).filter(Boolean))] };
  commit('Censor words'); drawFrame(); renderLeft(); const n = VCAP.bleepRanges(PJ.captions, PJ.censor.words, PJ.censor.estimate).length; toast(`${PJ.censor.words.length} word(s) in the censor list · ${n} occurrence(s) in the captions${PJ.censor.bleep ? ' will be bleeped' : ''}`, 'ok'); return n;
}

// =====================================================================  project templates
const TEMPLATES = [['vlog', 'Vlog intro'], ['reels', 'Reels / Shorts (9:16)'], ['youtube', 'YouTube with lower thirds'], ['slideshow', 'Slideshow from photos…']];
function resetProject(seq) {
  pause(); resetElements(); Object.assign(PJ, { name: 'Untitled project', path: null, media: [], clips: [], transitions: [], markers: [], captions: [], tracks: newTracks(), capStyle: { ...VCAP.DEFAULT_STYLE }, capBurn: true, sequences: [{ id: 'S1', name: 'Sequence 01' }], activeSeq: 'S1', censor: { words: [], on: true, bleep: false, estimate: true } });
  PJ.seq = { w: 1920, h: 1080, fps: 30, bg: '#000000', ...(seq || {}) }; ST.sel.clear(); ST.selTr = ST.selCap = null; ST.t = 0; ST.inP = ST.outP = null; hist = []; hi = -1;
}
const tset = (c, o) => { Object.assign(c.props, o); return c; };
async function newFromTemplate(kind, opts = {}) {
  if (!opts.force && PJ.dirty && !(await confirm('Discard changes?', 'The current project has unsaved changes.', 'Discard'))) return;
  if (kind === 'slideshow') return slideshowFromPhotos(opts);
  const vert = kind === 'reels'; resetProject(vert ? { w: 1080, h: 1920 } : {}); const W = PJ.seq.w, H = PJ.seq.h, k = Math.min(W, H) / 1080;
  const gen = (at, len, o, tr = 'V1') => { const c = newClip('color', tr, at, len, { name: o.name || 'Background', props: { grad: 'linear', color: '#1d4ed8', color2: '#9333ea', angle: 135, ...o } }); placeClip(c); return c; };
  const title = (tpl, at, len, o, tr) => { const c = makeTitle(tpl, at, tr || 'V2'); c.out = c.in + len; if (o) tset(c, o); c.name = c.props.text.split('\n')[0]; return c; };
  if (kind === 'vlog') {
    PJ.name = 'Vlog intro'; const bg = gen(0, 5, { color: '#0f172a', color2: '#7c3aed', angle: 120 }); bg.kf.scale = [{ t: 0, v: 100, e: 'easeInOut' }, { t: 5, v: 112 }];
    title('Big title', 0.3, 4.4, { text: 'MY VLOG', size: Math.round(170 * k), weight: 900, anim: 'trackIn', y: -40 * k });
    title('Subtitle', 1.0, 3.7, { text: 'Episode 1 · a day in my city', size: Math.round(52 * k), anim: 'words', box: false, y: 110 * k }, 'V3');
    const ph = gen(5, 10, { grad: 'none', color: '#111827', name: 'Placeholder — replace with your footage' }); title('Subtitle', 5, 10, { text: 'Drop your footage here (replace this placeholder)', anim: 'fade', y: 0 });
    PJ.transitions.push({ id: uid('t'), track: 'V1', a: bg.id, b: ph.id, kind: 'lightLeak', dur: 1 });
    PJ.markers.push({ id: uid('k'), t: 5, label: 'Your footage starts here', color: '#22c55e' });
  } else if (kind === 'reels') {
    PJ.name = 'Reels / Shorts'; const bg = gen(0, 15, { color: '#111827', color2: '#db2777', angle: 160, name: 'Placeholder background' });
    title('Big title', 0.2, 3.3, { text: 'WAIT FOR IT…', anim: 'bounce', y: -620 * k, size: Math.round(120 * k) });
    title('Subtitle', 3.5, 8.5, { text: 'Put your clip on V1 — 9:16, 1080×1920', anim: 'words', y: 0 }, 'V3');
    title('Subscribe button', 12, 3, { y: 640 * k });
    PJ.capStyle = { ...PJ.capStyle, preset: 'Social bold', ...VCAP.PRESETS['Social bold'] }; PJ.captions.push({ id: uid('cc'), start: 3.5, end: 6, text: 'Your captions appear here' }, { id: uid('cc'), start: 6, end: 9, text: 'Big, bold and centred' });
    [[0, 'Hook'], [3.5, 'Content'], [12, 'Call to action']].forEach(([t, l]) => PJ.markers.push({ id: uid('k'), t, label: l, color: '#a855f7' })); void bg;
  } else if (kind === 'youtube') {
    PJ.name = 'YouTube video'; gen(0, 40, { grad: 'none', color: '#1f2937', name: 'Placeholder — replace with your footage' });
    title('Lower third', 2, 5, { text: 'Your Name\nCreator · Channel name' }); title('Lower third', 20, 5, { text: 'Guest name\nWhat they do' });
    title('Title card', 34, 6, { text: 'THANKS FOR WATCHING\nSubscribe for more', anim: 'blurIn' }); title('Subscribe button', 35.5, 4.5, { y: 380 * k }, 'V3');
    [[0, 'Intro'], [8, 'Part 1'], [20, 'Part 2'], [34, 'Outro / end screen']].forEach(([t, l]) => PJ.markers.push({ id: uid('k'), t, label: l, color: '#ef4444' }));
  }
  fixTransitions(); hist = []; hi = -1; commit('Template: ' + kind); PJ.dirty = true; UI.setDocTitle(PJ.name + ' •', 'BTS Video'); renderAll(); renderSeqTabs(); fitTl(); seek(0); toast(`Started from the “${(TEMPLATES.find(t => t[0] === kind) || [, kind])[1]}” template`, 'ok');
}
// Slideshow: images with alternating Ken Burns moves, cross dissolves and music fitted to the length
async function slideshowFromPhotos(opts = {}) {
  let imgs = opts.images, music = opts.music;
  if (!imgs) { const f = await bts.fs.open({ multi: true, filters: [{ name: 'Photos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] }); if (!f || !f.length) return; imgs = f.map(x => x.path); }
  if (music === undefined && !opts.images) { const ok = await confirm('Add music?', 'Pick a music file — the slideshow length is fitted to it.', 'Pick music'); if (ok) { const f = await bts.fs.open({ filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'] }] }); music = f && f[0] ? f[0].path : null; } }
  resetProject(opts.seq || {}); PJ.name = 'Slideshow'; renderAll();
  const pm = progressModal('Building slideshow'); const media = [];
  for (const [i, p] of imgs.entries()) { pm.set(i / (imgs.length + 1), `Importing photo ${i + 1} of ${imgs.length}…`); const m = await importPath(p); if (m && !m.missing) media.push(m); }
  let mus = null; if (music) { pm.set(0.95, 'Importing music…'); mus = await importPath(music); if (mus && mus.missing) mus = null; }
  pm.close(); if (!media.length) return toast('No photos could be imported', 'err');
  const tr = opts.transition || 'cross', trd = opts.trDur ?? 1; let per = opts.per || 4; if (mus && !opts.per) per = clamp(mus.dur / media.length, 1.5, 10);
  const moves = ['Ken Burns zoom in', 'Pan left', 'Ken Burns zoom out', 'Pan right']; let at = 0; const clips = [];
  media.forEach((m, i) => { const c = clipFromMedia(m, 'V1', at); c.out = c.in + per; c.props.fit = 'fill'; placeClip(c); clips.push(c); at += per; });
  clips.forEach((c, i) => applyKfPresetQuiet(moves[i % moves.length], c));
  for (let i = 1; i < clips.length; i++) PJ.transitions.push({ id: uid('t'), track: 'V1', a: clips[i - 1].id, b: clips[i].id, kind: Array.isArray(tr) ? tr[i % tr.length] : tr, dur: Math.min(trd, per * 0.8) });
  PJ.transitions.push({ id: uid('t'), track: 'V1', a: null, b: clips[0].id, kind: 'dipBlack', dur: Math.min(1, per / 3) }, { id: uid('t'), track: 'V1', a: clips[clips.length - 1].id, b: null, kind: 'dipBlack', dur: Math.min(1.2, per / 3) });
  if (mus) { const a = clipFromMedia(mus, 'A1', 0); a.out = Math.min(mus.dur, at); a.props.fadeIn = 0.5; a.props.fadeOut = Math.min(2, at / 4); placeClip(a); }
  if (opts.title !== false) { const t = makeTitle('Big title', 0.2, 'V2'); t.out = Math.min(per * 1.6, at) - 0.2; Object.assign(t.props, { text: opts.title || 'My slideshow', anim: 'blurIn' }); t.name = t.props.text; }
  fixTransitions(); hist = []; hi = -1; commit('Slideshow from photos'); PJ.dirty = true; UI.setDocTitle(PJ.name + ' •', 'BTS Video'); renderAll(); renderSeqTabs(); fitTl(); seek(0);
  toast(`Slideshow: ${clips.length} photos × ${per.toFixed(1)} s${mus ? ' fitted to the music' : ''}`, 'ok', 5000); return { photos: clips.length, per, length: at };
}
function applyKfPresetQuiet(name, c) { const pr = KF_PRESETS.find(p => p[0] === name); if (!pr) return; const D = tlDur(c); const def = pr[1](c, D); for (const [k, keys] of Object.entries(def)) { c.kf[k] = keys.map(([t, v, e]) => ({ t, v, e: e || 'linear' })); if (keys.length === 1) { c.props[k] = keys[0][1]; delete c.kf[k]; } } }
