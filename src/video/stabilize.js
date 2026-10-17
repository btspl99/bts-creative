// BTS Video — Clip › Stabilize…: two-pass FFmpeg vid.stab (vidstabdetect → motion file, vidstabtransform → stabilised
// media) with a deshake fallback for FFmpeg builds without vid.stab. The clip is switched to the stabilised media (the
// original stays in the Project panel, and Undo or “Remove stabilisation” switches back).
'use strict';
let stabCapsCache = null;
async function stabCaps() {
  if (stabCapsCache) return stabCapsCache; if (!ST.ffmpeg) return (stabCapsCache = { vidstab: false, deshake: false });
  const dir = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/'); const trf = `${dir}/stab-probe-${Date.now().toString(36)}.trf`;
  const probe = async vf => (await bts.ffmpeg.run(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10:duration=0.5', '-vf', vf, '-f', 'null', '-'])).ok;
  stabCapsCache = { vidstab: await probe(`vidstabdetect=result=${ffEsc(trf)}`), deshake: await probe('deshake') };
  return stabCapsCache;
}
// runs one FFmpeg job (killable) and reports progress by polling FFmpeg's -progress file
async function ffJob(args, durSec, onProg, cancelRef) {
  const prog = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/') + `/job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.progress`;
  const id = await bts.ffmpeg.start(['-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', prog, ...args]); cancelRef.id = id;
  let stop = false; const poll = (async () => { while (!stop) { await UI.sleep(250); const t = await readText(prog); const m = [...t.matchAll(/out_time_(?:us|ms)=(\d+)/g)].pop(); if (m && durSec > 0) onProg(Math.min(1, +m[1] / 1e6 / durSec)); } })();
  const r = await bts.ffmpeg.end(id); stop = true; await poll; cancelRef.id = null; return r;
}
async function stabilizeDialog() {
  const c = selected().find(x => x.type === 'video'); if (!c) return toast('Select a video clip to stabilise', 'err');
  if (!ST.ffmpeg) return toast('Stabilisation needs FFmpeg', 'err'); if (c.props.freeze != null) return toast('Release the frame hold first', 'err');
  const caps = await stabCaps(); if (!caps.vidstab && !caps.deshake) return toast('This FFmpeg build has no stabilisation filters', 'err');
  const v = await form({ title: 'Stabilize clip', width: 460, fields: [
    { key: 'smooth', label: 'Smoothing (frames to average — higher is steadier)', type: 'range', value: PREFS.stabSmooth ?? 15, min: 1, max: 60 },
    { key: 'shake', label: 'Shakiness of the footage (1 = slight, 10 = very shaky)', type: 'range', value: PREFS.stabShake ?? 5, min: 1, max: 10 },
    { key: 'edges', label: 'Edges', type: 'select', value: PREFS.stabEdges || 'zoom', options: [{ value: 'zoom', label: 'Zoom in to hide the moving edges (crop)' }, { value: 'black', label: 'Keep framing, black edges' }, { value: 'keep', label: 'Keep framing, fill edges from earlier frames' }] },
    { key: 'zoom', label: 'Extra zoom %', type: 'range', value: PREFS.stabZoom ?? 0, min: 0, max: 30 },
    { key: 'tripod', label: 'Tripod mode (lock the camera completely)', type: 'checkbox', value: false }], ok: 'Stabilize' });
  if (!v) return; Object.assign(PREFS, { stabSmooth: +v.smooth, stabShake: +v.shake, stabEdges: v.edges, stabZoom: +v.zoom }); savePrefs();
  return stabilizeClip(c, { smooth: +v.smooth, shake: +v.shake, edges: v.edges, zoom: +v.zoom, tripod: !!v.tripod });
}
async function stabilizeClip(c, o = {}) {
  o = { smooth: 15, shake: 5, edges: 'zoom', zoom: 0, tripod: false, ...o };
  const caps = await stabCaps(); const m = mediaById(c.mediaId); if (!m || m.missing) { toast('The clip’s media is offline', 'err'); return null; }
  const orig = c.props.stabOf ? mediaById(c.props.stabOf) || m : m; // always analyse the ORIGINAL media
  const off = c.props.stabOf ? (+c.props.stabOff || 0) : 0; const srcIn = c.in + off, srcOut = c.out + off;
  const s0 = Math.max(0, srcIn - 1), s1 = Math.min(orig.dur || srcOut + 1, srcOut + 1), D = s1 - s0;
  const dir = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/'); const base = `${dir}/${orig.id}-stab-${Date.now().toString(36)}`; const trf = base + '.trf', out = base + '.mp4';
  const cancel = { id: null, on: false }; const bar = h('div'), txt = h('div', { class: 'muted', style: { marginTop: '8px', fontSize: '12px' } }, 'Analysing motion…');
  const back = h('div', { class: 'modal-back exp' }, h('div', { class: 'modal', style: { width: '440px' } }, h('div', { class: 'm-h' }, 'Stabilize clip'), h('div', { class: 'm-b' }, h('div', { class: 'progress' }, bar), txt),
    h('div', { class: 'm-f' }, h('button', { class: 'btn', onclick: () => { cancel.on = true; txt.textContent = 'Cancelling…'; if (cancel.id) bts.ffmpeg.kill(cancel.id); } }, 'Cancel')))); document.body.append(back);
  const set = (p, t) => { bar.style.width = Math.round(p * 100) + '%'; if (t) txt.textContent = t; };
  const inArgs = ['-ss', s0.toFixed(3), '-t', D.toFixed(3), '-i', orig.path];
  try {
    let vf;
    if (caps.vidstab) {
      set(0, 'Pass 1 of 2 · analysing camera motion…');
      const r1 = await ffJob([...inArgs, '-an', '-vf', `vidstabdetect=shakiness=${o.shake}:accuracy=15:stepsize=6:result=${ffEsc(trf)}`, '-f', 'null', '-'], D, p => set(p * 0.45, `Pass 1 of 2 · analysing camera motion… ${Math.round(p * 100)}%`), cancel);
      if (cancel.on) throw Object.assign(new Error('Stabilisation cancelled'), { cancelled: true }); if (!r1.ok) throw new Error('Motion analysis failed: ' + (r1.log || '').split('\n').filter(Boolean).slice(-1)[0]);
      vf = `vidstabtransform=input=${ffEsc(trf)}:smoothing=${o.smooth}:optzoom=${o.edges === 'zoom' ? 1 : 0}:zoom=${o.zoom}:crop=${o.edges === 'keep' ? 'keep' : 'black'}:interpol=bicubic${o.tripod ? ':tripod=1' : ''},unsharp=5:5:0.6:3:3:0.3`;
    } else vf = `deshake=rx=48:ry=48:edge=${o.edges === 'keep' ? 'original' : 'blank'}${o.edges === 'zoom' || o.zoom ? `,scale=iw*${(1 + Math.max(o.edges === 'zoom' ? 8 : 0, o.zoom) / 100).toFixed(3)}:-2,crop=${m.w || 'iw'}:${m.h || 'ih'}` : ''}`;
    set(caps.vidstab ? 0.45 : 0, caps.vidstab ? 'Pass 2 of 2 · rendering the stabilised clip…' : 'Stabilising (deshake)…');
    const r2 = await ffJob([...inArgs, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf + ',pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', out], D,
      p => set((caps.vidstab ? 0.45 : 0) + p * (caps.vidstab ? 0.55 : 1), `${caps.vidstab ? 'Pass 2 of 2 · rendering' : 'Stabilising'}… ${Math.round(p * 100)}%`), cancel);
    if (cancel.on) throw Object.assign(new Error('Stabilisation cancelled'), { cancelled: true }); if (!r2.ok) throw new Error('Rendering the stabilised clip failed: ' + (r2.log || '').split('\n').filter(Boolean).slice(-1)[0]);
    set(1, 'Importing…');
    const nm = orig.name.replace(/\.[^.]+$/, '') + ' (stabilised).mp4'; const sm = await importPath(out, nm); if (!sm || sm.missing) throw new Error('Could not import the stabilised clip');
    sm.gen = 'stabilised';
    // swap the source: same timeline position, same in/out (relative to the new media's start)
    c.mediaId = sm.id; c.in = srcIn - s0; c.out = srcOut - s0; c.props.stabOf = orig.id; c.props.stabOff = s0; c.props.stab = { smooth: o.smooth, shake: o.shake, edges: o.edges, zoom: o.zoom, tripod: o.tripod, method: caps.vidstab ? 'vidstab' : 'deshake' };
    els.delete(c.id); commit('Stabilize'); renderTimeline(); renderFx(); renderBin(); drawFrame(); back.remove();
    toast(`Stabilised ${c.name} (${caps.vidstab ? 'vid.stab' : 'deshake'}) — the original stays in the Project panel`, 'ok', 6000); return { media: sm.id, method: caps.vidstab ? 'vidstab' : 'deshake', out };
  } catch (e) { back.remove(); if (e.cancelled) toast('Stabilisation cancelled'); else toast(e.message, 'err', 7000); return null; }
}
function removeStabilization() {
  const cs = selected().filter(c => c.type === 'video' && c.props.stabOf); if (!cs.length) return toast('Select a stabilised clip');
  cs.forEach(c => { const sm = mediaById(c.mediaId), orig = mediaById(c.props.stabOf); if (!orig) return; const off = +c.props.stabOff || 0; c.mediaId = orig.id; c.in += off; c.out += off; delete c.props.stabOf; delete c.props.stabOff; delete c.props.stab; els.delete(c.id); });
  commit('Remove stabilisation'); renderTimeline(); renderFx(); drawFrame(); toast('Switched back to the original media', 'ok');
}
