// BTS Video — app shell: menus (which also feed the Ctrl+K command palette), Premiere-style shortcuts,
// options bar, sequence settings & auto-reframe, preferences, voice-over recording, autosave and boot.
'use strict';

// =====================================================================  sequence settings / aspect ratios
const SEQ_SIZES = [['3840x2160', '4K UHD · 16:9'], ['2560x1440', '1440p · 16:9'], ['1920x1080', '1080p HD · 16:9'], ['1280x720', '720p HD · 16:9'], ['854x480', '480p SD · 16:9'],
  ['1080x1920', 'Vertical 9:16 · 1080×1920 (Reels / Shorts)'], ['720x1280', 'Vertical 9:16 · 720×1280'], ['2160x3840', 'Vertical 9:16 · 4K'], ['1080x1080', 'Square 1:1 · 1080'], ['1080x1350', 'Portrait 4:5 · 1080×1350'], ['2560x1080', 'Ultrawide 21:9 · 2560×1080'], ['3840x1646', 'Cinema 21:9 · 4K']];
const ASPECTS = [['16:9', 1920, 1080], ['9:16', 1080, 1920], ['1:1', 1080, 1080], ['4:5', 1080, 1350], ['21:9', 2560, 1080], ['4:3', 1440, 1080]];
const FPS_LIST = [24, 25, 30, 50, 60];
// Changes the frame size and adapts existing clips. mode: 'keep' (keep each clip's fit), 'fit' (letterbox), 'fill' (crop centre), 'blur' (fit + blurred background)
function changeSequence(w, hh, fps, mode = 'keep', bg) {
  const ow = PJ.seq.w, oh = PJ.seq.h; const sx = w / ow, sy = hh / oh, k = Math.min(sx, sy);
  PJ.clips.forEach(c => {
    if (!isVisual(c)) return; const p = c.props;
    p.x *= sx; p.y *= sy; if (c.kf.x) c.kf.x.forEach(kk => kk.v *= sx); if (c.kf.y) c.kf.y.forEach(kk => kk.v *= sy);
    if (c.type === 'title') p.size = Math.max(8, Math.round(p.size * k)); if (c.type === 'shape') { p.w *= k; p.h *= k; }
    if (['video', 'image'].includes(c.type) && mode !== 'keep') { p.fit = mode === 'blur' ? 'fit' : mode; p.bgFill = mode === 'blur' ? 'blur' : 'none'; }
  });
  PJ.seq = { ...PJ.seq, w, h: hh, fps: fps || PJ.seq.fps, bg: bg || PJ.seq.bg };
  commit('Sequence settings'); layoutMonitor(); renderTimeline(); renderFx(); renderOptions(); drawFrame();
}
async function seqSettings() {
  const cur = `${PJ.seq.w}x${PJ.seq.h}`; const opts = SEQ_SIZES.some(s => s[0] === cur) ? SEQ_SIZES : [[cur, `Custom · ${PJ.seq.w}×${PJ.seq.h}`], ...SEQ_SIZES];
  const v = await form({ title: 'Sequence settings', width: 440, fields: [{ key: 'preset', label: 'Frame size', type: 'select', value: cur, options: opts.map(([value, label]) => ({ value, label })) },
    { key: 'fps', label: 'Frame rate', type: 'select', value: String(PJ.seq.fps), options: FPS_LIST.map(String) }, { key: 'bg', label: 'Background colour', type: 'color', value: PJ.seq.bg },
    { key: 'mode', label: 'Existing clips', type: 'select', value: 'keep', options: [{ value: 'keep', label: 'Keep each clip’s fit setting' }, { value: 'fit', label: 'Fit whole picture (letterbox)' }, { value: 'fill', label: 'Fill frame (crop centre — auto reframe)' }, { value: 'blur', label: 'Fit with blurred background (social)' }] }] });
  if (!v) return; const [w, hh] = v.preset.split('x').map(Number); changeSequence(w, hh, +v.fps, v.mode, v.bg);
}
async function autoReframe() {
  const v = await form({ title: 'Auto reframe for social', width: 420, fields: [{ key: 'a', label: 'Target aspect ratio', type: 'select', value: '9:16', options: ASPECTS.map(([a, w, hh]) => ({ value: a, label: `${a} (${w}×${hh})` })) },
    { key: 'mode', label: 'Reframe', type: 'select', value: 'fill', options: [{ value: 'fill', label: 'Crop centre (fill the frame)' }, { value: 'blur', label: 'Keep whole picture, blurred background' }, { value: 'fit', label: 'Keep whole picture, letterbox' }] }] });
  if (!v) return; const A = ASPECTS.find(a => a[0] === v.a); const long = Math.max(PJ.seq.w, PJ.seq.h) >= 1900 ? 1 : 2 / 3; changeSequence(Math.round(A[1] * long / 2) * 2, Math.round(A[2] * long / 2) * 2, PJ.seq.fps, v.mode); toast(`Reframed to ${v.a}`, 'ok');
}
async function preferences() {
  const v = await form({ title: 'Preferences', width: 420, fields: [{ key: 'imgDur', label: 'Still image default duration (s)', type: 'number', value: PREFS.imgDur, min: 0.1, step: 0.5 }, { key: 'trDur', label: 'Default transition duration (s)', type: 'number', value: PREFS.trDur, min: 0.1, step: 0.1 }, { key: 'autosave', label: 'Autosave every (seconds, 0 = off)', type: 'number', value: PREFS.autosave, min: 0, step: 15 }, { key: 'rs', label: 'Playback resolution', type: 'select', value: String(ST.rs), options: [{ value: '1', label: 'Full' }, { value: '0.5', label: 'Half' }, { value: '0.25', label: 'Quarter' }] }] });
  if (!v) return; Object.assign(PREFS, { imgDur: Math.max(0.1, +v.imgDur || 5), trDur: Math.max(0.04, +v.trDur || 1), autosave: Math.max(0, +v.autosave || 0) }); savePrefs(); setPreviewScale(+v.rs); startAutosave();
}
function setPreviewScale(rs) { ST.rs = rs; PREFS.rs = rs; savePrefs(); layoutMonitor(); }

// =====================================================================  voice-over recording
async function recordVoiceOver() {
  if (ST.recording) return stopRecording();
  if (!navigator.mediaDevices?.getUserMedia) return toast('Recording is not supported here', 'err');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch (e) { return toast('Microphone not available: ' + e.message, 'err', 6000); }
  const track = freeTrack('audio', ST.t, 3600, 'A2'); const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime }); const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => rec.onstop = r);
  ST.recording = { rec, stream, start: ST.t, track, chunks, stopped, wall: performance.now() }; rec.start(250);
  document.body.classList.add('recording'); setStatus(`● Recording voice-over on ${track} — press Space or click Stop to finish`);
  if (PJ.clips.length) play(1); else updateRecording(true);
  renderOptions(); return ST.recording;
}
function updateRecording(standalone) { const R = ST.recording; if (!R) return; const s = (performance.now() - R.wall) / 1000; const el = $('#recInd'); if (el) el.textContent = '● REC ' + fmtTime(s).slice(0, 5); if (standalone) requestAnimationFrame(() => updateRecording(!ST.playing)); }
async function stopRecording() {
  const R = ST.recording; if (!R) return; ST.recording = null; document.body.classList.remove('recording'); pause();
  R.rec.stop(); await R.stopped; R.stream.getTracks().forEach(t => t.stop()); renderOptions();
  const blob = new Blob(R.chunks, { type: 'audio/webm' }); if (!blob.size) return toast('Nothing was recorded', 'err');
  const n = PJ.media.filter(m => /^Voice-over/.test(m.name)).length + 1; const base = `voiceover-${Date.now().toString(36)}`;
  setStatus('Saving voice-over…');
  let path = await bts.ffmpeg.tmpWrite(base + '.webm', await UI.blobToU8(blob));
  if (ST.ffmpeg) { const wav = path.replace(/\.webm$/, '.wav'); const id = await bts.ffmpeg.start(['-i', path, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', wav]); const r = await bts.ffmpeg.end(id); if (r.ok) path = wav; }
  const m = await importPath(path, `Voice-over ${n}.${path.endsWith('.wav') ? 'wav' : 'webm'}`); if (!m || m.missing) return; m.gen = 'voiceover';
  const c = clipFromMedia(m, R.track, R.start); c.name = m.name; placeClip(c, 'overwrite'); trackById(R.track).voice = true; select([c.id]); commit('Record voice-over'); drawFrame(); toast(`Voice-over saved to ${R.track} (${m.dur.toFixed(1)} s)`, 'ok');
  return c;
}

// =====================================================================  menus
const EXP_MENU = () => EXPORT_PRESETS.filter(p => ST.ffmpeg || ['webm', 'png'].includes(p.fmt)).map(p => ({ label: p.label, action: () => exportWithPreset(p.id) }));
function exportWithPreset(id) { return id === 'png' ? exportFrame() : exportDialog(id); }
const tools = () => TOOLS.map(([id, , label, k]) => ({ label, kbd: k, checked: () => ST.tool === id, action: () => setTool(id) }));
UI.titlebar({ logo: 'Vd', menus: [
  { label: 'File', items: () => [
    { label: 'New project', kbd: 'Ctrl+Alt+N', action: newProject }, { label: 'Open project…', kbd: 'Ctrl+O', action: openProject }, { label: 'Recover autosaved project…', action: () => recoverAutosave(true), disabled: !hasRecoverable() }, { label: 'New from template', sub: TEMPLATES.map(([k, l]) => ({ label: l, action: () => newFromTemplate(k) })) }, '-',
    { label: 'Import media…', kbd: 'Ctrl+I', action: importDialog }, { label: 'Import image sequence…', action: importImageSequence }, { label: 'Import captions (SRT / VTT)…', action: importCaptions }, '-',
    { label: 'Save project', kbd: 'Ctrl+S', action: () => saveProject(false) }, { label: 'Save project as…', kbd: 'Ctrl+Shift+S', action: () => saveProject(true) }, '-',
    { label: 'Export…', kbd: 'Ctrl+M', action: exportDialog }, { label: 'Export with preset', sub: EXP_MENU() }, { label: 'Export current frame (PNG)…', kbd: 'Ctrl+Shift+E', action: exportFrame }, { label: 'Export captions as SRT…', action: () => exportCaptions('srt') }, { label: 'Export captions as WebVTT…', action: () => exportCaptions('vtt') }, '-',
    { label: 'Preferences…', action: preferences }, { label: 'BTS Creative home', action: () => bts.openApp('home') }, { label: 'Close window', kbd: 'Ctrl+W', action: closeWindow }] },
  { label: 'Edit', items: () => [
    { label: 'Undo', kbd: 'Ctrl+Z', action: undo, disabled: hi <= 0 }, { label: 'Redo', kbd: 'Ctrl+Shift+Z', action: redo, disabled: hi >= hist.length - 1 }, { label: 'History panel', action: () => showLeft('history') }, '-',
    { label: 'Cut', kbd: 'Ctrl+X', action: cutClips }, { label: 'Copy', kbd: 'Ctrl+C', action: copyClips }, { label: 'Paste at playhead', kbd: 'Ctrl+V', action: pasteClips },
    { label: 'Duplicate', kbd: 'Ctrl+Shift+D', action: duplicateClips }, { label: 'Clear (delete)', kbd: 'Del', action: () => deleteClips(false) }, { label: 'Ripple delete', kbd: 'Shift+Del', action: () => deleteClips(true) }, '-',
    { label: 'Select all', kbd: 'Ctrl+A', action: selectAll }, { label: 'Deselect all', kbd: 'Ctrl+Shift+A', action: () => select([]) }, '-', { label: 'Preferences…', action: preferences }] },
  { label: 'Clip', items: () => [
    { label: 'Add edit (split at playhead)', kbd: 'Ctrl+Shift+K', action: splitAtPlayhead }, { label: 'Speed / duration…', kbd: 'Ctrl+R', action: speedDialog }, { label: 'Speed ramp…', action: speedRampDialog }, { label: 'Reverse clip', action: reverseClip },
    { label: 'Add frame hold segment (freeze frame)…', kbd: 'Shift+F', action: freezeFrame }, { label: 'Frame hold (whole clip)', action: frameHold }, '-',
    { label: 'Nest… (selected clips → nested sequence)', kbd: 'Alt+N', action: () => nestSelected() }, { label: 'Open nested sequence', action: () => openNest(), disabled: !selected().some(c => c.type === 'nest') }, { label: 'Match nest to sequence length', action: () => matchNestLength(), disabled: !selected().some(c => c.type === 'nest') }, '-',
    { label: 'Masks', sub: [...MASK_TYPES.map(([k, l]) => ({ label: 'Add ' + l.toLowerCase() + ' mask', action: () => addMask(k) })), { label: 'Draw pen mask on monitor…', action: startPenMask }, '-', { label: 'Track mask forward', kbd: 'Ctrl+Alt+→', action: () => trackSelected(1, { target: 'mask' }) }, { label: 'Track mask backward', kbd: 'Ctrl+Alt+←', action: () => trackSelected(-1, { target: 'mask' }) }, '-', { label: 'Remove all masks', action: () => { selected().forEach(c => (c.masks || []).slice().forEach(m => removeMask(c, m.id))); } }] },
    { label: 'Face blur', sub: [{ label: 'Add face blur (pixelate)', action: () => addEffect('mosaic') }, { label: 'Add face blur (soft)', action: () => addEffect('mosaic', { mode: 'blur', size: 30 }) }, { label: 'Track face-blur region forward', action: () => trackSelected(1, { target: 'blur' }) }, { label: 'Track face-blur region backward', action: () => trackSelected(-1, { target: 'blur' }) }] },
    { label: 'Scene edit detection…', action: sceneDetectDialog }, { label: 'Check transition handles', action: checkTransitionHandles }, '-',
    { label: 'Link / unlink', kbd: 'Ctrl+L', action: toggleLink }, { label: 'Unlink audio to an A track', action: unlinkAudio }, { label: 'Group', kbd: 'Ctrl+G', action: groupClips }, { label: 'Ungroup', kbd: 'Ctrl+Shift+G', action: ungroupClips }, '-',
    { label: 'Video effects', sub: Object.entries(VFX.EFFECTS).map(([k, d]) => ({ label: d.name, action: () => addEffect(k) })) },
    { label: 'Effect presets', sub: VFX.FX_PRESETS.map(([n, k, o]) => ({ label: n, action: () => addEffect(k, o) })) },
    { label: 'Lumetri look', sub: [{ label: 'None', action: () => applyLook('') }, ...Object.keys(VFX.LOOKS).map(n => ({ label: n, action: () => applyLook(n) }))] },
    { label: 'Motion presets (keyframes)', sub: KF_PRESETS.map(([n]) => ({ label: n, action: () => applyKfPreset(n) })) },
    { label: 'Picture-in-picture & split screen', sub: LAYOUTS.map(([k, n]) => ({ label: n, action: () => applyLayout(k) })) },
    { label: 'Video transition', sub: [{ label: 'Apply default (cross dissolve)', kbd: 'Ctrl+D', action: () => applyTransition('cross') }, '-', ...VFX.TRANSITIONS.map(([k, l]) => ({ label: l, action: () => applyTransition(k) }))] }, '-',
    { label: 'Keyframes', sub: [{ label: 'Add motion keyframes at playhead', action: () => addKeyframesAtPlayhead() }, { label: 'Add crop keyframes at playhead', action: () => addKeyframesAtPlayhead(['cropL', 'cropR', 'cropT', 'cropB']) }, { label: 'Add volume keyframe at playhead', action: () => addKeyframesAtPlayhead(['volume']) }, '-', { label: 'Previous keyframe', action: () => jumpKeyframe(-1) }, { label: 'Next keyframe', action: () => jumpKeyframe(1) }, '-', ...VFX.EASES.map(([k, l]) => ({ label: 'Interpolation at playhead: ' + l, action: () => setEaseAtPlayhead(k) })), '-', { label: 'Remove all keyframes', action: removeAllKeyframes }] },
    { label: 'Effects on / off (bypass)', action: toggleAllEffects }, { label: 'Show Lumetri Color controls', action: () => showInspectorGroup('Lumetri Color') }, { label: 'Show Effect controls › Effects', action: () => showInspectorGroup('Effects') }, '-',
    { label: 'Fit to frame', action: () => setProp('fit', 'fit') }, { label: 'Fill frame', action: () => setProp('fit', 'fill') }, { label: 'Fade in / out (0.5 s)', action: quickFades }, { label: 'Reset effects', action: resetEffects }] },
  { label: 'Sequence', items: () => [
    { label: 'New sequence…', action: newSequenceDialog }, { label: 'Switch to sequence', sub: PJ.sequences.map(sq => ({ label: sq.name, checked: sq.id === PJ.activeSeq, action: () => switchSequence(sq.id) })) }, { label: 'Rename sequence…', action: () => renameSequence() }, { label: 'Duplicate sequence', action: () => duplicateSequence() }, { label: 'Delete sequence', action: () => deleteSequence(), disabled: PJ.sequences.length < 2 }, { label: 'Insert sequence as nest', sub: PJ.sequences.filter(sq => sq.id !== PJ.activeSeq).map(sq => ({ label: sq.name, action: () => insertSequenceAsNest(sq.id) })).concat(PJ.sequences.length < 2 ? [{ label: '(no other sequences)', disabled: true }] : []) }, '-',
    { label: 'Sequence settings…', action: seqSettings }, { label: 'Aspect ratio', sub: ASPECTS.map(([a, w, hh]) => ({ label: `${a} (${w}×${hh})`, checked: PJ.seq.w * hh === PJ.seq.h * w, action: () => changeSequence(w, hh) })) },
    { label: 'Frame size', sub: SEQ_SIZES.map(([s, l]) => { const [w, hh] = s.split('x').map(Number); return { label: l, checked: PJ.seq.w === w && PJ.seq.h === hh, action: () => changeSequence(w, hh) }; }) },
    { label: 'Frame rate', sub: FPS_LIST.map(f => ({ label: f + ' fps', checked: PJ.seq.fps === f, action: () => changeSequence(PJ.seq.w, PJ.seq.h, f) })) }, { label: 'Auto reframe for social…', action: autoReframe }, { label: 'Smart reframe (follow subject)…', action: smartReframeDialog }, '-',
    { label: 'Detect beats → markers', action: () => beatDetect() }, { label: 'Auto-cut selected clips to beats…', action: autoCutDialog }, { label: 'Clear beat markers', action: clearBeatMarkers }, '-',
    { label: 'Playback', sub: [{ label: 'Play / pause', kbd: 'Space', action: togglePlay }, { label: 'Shuttle reverse', kbd: 'J', action: () => shuttle(-1) }, { label: 'Stop', kbd: 'K', action: () => shuttle(0) }, { label: 'Shuttle forward', kbd: 'L', action: () => shuttle(1) }, { label: 'Step back one frame', kbd: '←', action: () => seek(ST.t - 1 / PJ.seq.fps) }, { label: 'Step forward one frame', kbd: '→', action: () => seek(ST.t + 1 / PJ.seq.fps) }, { label: 'Back 5 frames', kbd: 'Shift+←', action: () => seek(ST.t - 5 / PJ.seq.fps) }, { label: 'Forward 5 frames', kbd: 'Shift+→', action: () => seek(ST.t + 5 / PJ.seq.fps) }, { label: 'Previous edit point', kbd: '↑', action: () => jumpEdit(-1) }, { label: 'Next edit point', kbd: '↓', action: () => jumpEdit(1) }, { label: 'Go to start', kbd: 'Home', action: () => seek(0) }, { label: 'Go to end', kbd: 'End', action: () => seek(seqDuration()) }, { label: 'Loop In/Out playback', checked: () => !!ST.loopIO, action: () => { ST.loopIO = !ST.loopIO; } }] },
    { label: 'Tools', sub: tools() }, '-',
    { label: 'Mark In', kbd: 'I', action: () => setIn() }, { label: 'Mark Out', kbd: 'O', action: () => setOut() }, { label: 'Mark clip', kbd: 'X', action: markClip }, { label: 'Clear In and Out', kbd: 'Ctrl+Shift+X', action: clearIO }, { label: 'Go to In', kbd: 'Shift+I', action: () => ST.inP != null && seek(ST.inP) }, { label: 'Go to Out', kbd: 'Shift+O', action: () => ST.outP != null && seek(ST.outP) },
    { label: 'Lift (leave gap)', kbd: ';', action: () => liftExtract(false) }, { label: 'Extract (ripple)', kbd: "'", action: () => liftExtract(true) }, '-',
    { label: 'Insert from Project panel', kbd: ',', action: () => editFromBin('insert') }, { label: 'Overwrite from Project panel', kbd: '.', action: () => editFromBin('overwrite') },
    { label: 'Edit mode', sub: [{ label: 'Overwrite', checked: () => ST.editMode === 'overwrite', action: () => { ST.editMode = 'overwrite'; renderHead(); } }, { label: 'Insert (ripple)', checked: () => ST.editMode === 'insert', action: () => { ST.editMode = 'insert'; renderHead(); } }] },
    { label: 'Ripple trim previous edit to playhead', kbd: 'Q', action: () => rippleTrimToPlayhead('prev') }, { label: 'Ripple trim next edit to playhead', kbd: 'W', action: () => rippleTrimToPlayhead('next') }, { label: 'Close gaps', action: closeGaps }, '-',
    { label: 'Add marker', kbd: 'M', action: () => addMarker() }, { label: 'Edit marker at playhead…', action: () => { const mk = markerAtPlayhead(); mk ? editMarker(mk) : toast('No marker at the playhead'); } }, { label: 'Next marker', kbd: 'Shift+M', action: () => jumpMarker(1) }, { label: 'Previous marker', kbd: 'Ctrl+Shift+M', action: () => jumpMarker(-1) },
    { label: 'Go to marker', sub: PJ.markers.length ? PJ.markers.map(mk => ({ label: `${tc(mk.t)}  ${mk.label || 'Marker'}`, action: () => seek(mk.t) })) : [{ label: '(no markers)', disabled: true }] }, { label: 'Clear all markers', action: () => { PJ.markers = []; commit('Clear markers'); renderTimeline(); } }, '-',
    { label: 'Snapping', kbd: 'S', checked: () => ST.snap, action: toggleSnap }, { label: 'Linked selection', checked: () => ST.linkedSel, action: () => { ST.linkedSel = !ST.linkedSel; renderHead(); } }, { label: 'Add video track', action: () => addTrack('video') }, { label: 'Add audio track', action: () => addTrack('audio') }] },
  { label: 'Graphics', items: () => [
    { label: 'Add title', kbd: 'Ctrl+T', action: () => addTitle('Big title') }, { label: 'Text templates', sub: Object.keys(TITLE_TPL).map(k => ({ label: k, action: () => addTitle(k) })) },
    { label: 'Shapes', sub: SHAPES.map(([k, l]) => ({ label: l, action: () => addShape({ shape: k }) })) }, { label: 'Stickers', sub: STICKERS.map(s => ({ label: s + '  sticker', action: () => addShape({ shape: 'emoji', text: s }) })) }, '-',
    { label: 'Colour matte / solid', action: () => addGenerator('color') }, { label: 'Gradient background', action: () => addGenerator('gradient') }, { label: 'Black video', action: () => addGenerator('black') }, { label: 'Adjustment layer', action: () => addGenerator('adjust') }, { label: 'Countdown leader', action: () => addGenerator('countdown') }, '-',
    { label: 'Text animation', sub: ANIMS.map(([k, l]) => ({ label: l, action: () => setTextAnim(k) })) }, '-',
    { label: 'Captions menu…', action: () => showLeft('captions') }] },
  { label: 'Captions', items: () => [
    { label: 'Add caption at playhead', kbd: 'Ctrl+Alt+C', action: () => addCaption(ST.t) }, { label: 'Auto-transcribe…', action: autoTranscribeDialog }, { label: 'Auto-time transcript (paste text, offline)…', action: transcriptDialog }, { label: 'Import captions (SRT / VTT)…', action: importCaptions }, { label: 'Export captions as SRT…', action: () => exportCaptions('srt') }, { label: 'Export captions as WebVTT…', action: () => exportCaptions('vtt') }, '-',
    { label: 'Filter censored words…', action: censorDialog }, { label: 'Mask censored words (f***)', checked: () => PJ.censor.on, action: () => setCensor({ on: !PJ.censor.on }) }, { label: 'Bleep censored words', checked: () => PJ.censor.bleep, action: () => setCensor({ bleep: !PJ.censor.bleep }) }, '-',
    { label: 'Caption list', action: () => showLeft('captions') }, { label: 'Caption style…', action: captionStyleDialog }, { label: 'Caption style preset', sub: Object.keys(VCAP.PRESETS).map(k => ({ label: k, checked: PJ.capStyle.preset === k, action: () => { PJ.capStyle = { ...PJ.capStyle, preset: k, ...VCAP.PRESETS[k] }; commit('Caption style'); drawFrame(); renderLeft(); } })) },
    { label: 'Burn captions into export', checked: () => PJ.capBurn, action: () => { PJ.capBurn = !PJ.capBurn; commit('Caption burn-in'); renderTimeline(); renderLeft(); } }, { label: 'Show captions in preview', checked: () => ST.capShow !== false, action: () => { ST.capShow = ST.capShow === false; drawFrame(); renderTimeline(); } }] },
  { label: 'Audio', items: () => [
    { label: ST.recording ? 'Stop recording voice-over' : 'Record voice-over…', kbd: 'Shift+R', action: recordVoiceOver }, { label: 'Detect beats in music → markers', action: () => beatDetect() }, { label: 'Auto-cut to beats…', action: autoCutDialog }, { label: 'Auto-duck music under voice…', action: autoDuckDialog }, { label: 'Remove auto-ducking', action: removeDucking }, '-',
    { label: 'Normalize', action: () => toggleAudioFx('normalize') }, { label: 'Noise reduction', action: () => toggleAudioFx('denoise') }, { label: 'Voice enhance', action: () => toggleAudioFx('voice') }, { label: 'Bake audio effects (hear them now)', action: () => { const c = selected()[0]; c ? bakeAudio(c) : toast('Select a clip'); } }, '-',
    { label: 'Clip volume & pan…', action: clipVolumeDialog }, { label: 'Fade in / out (0.5 s)', action: quickFades }, { label: 'Unlink audio to an A track', action: unlinkAudio }, { label: 'Mute clip', action: () => setProp('volume', 0) }, { label: 'Pan left', action: () => setProp('pan', -100) }, { label: 'Pan centre', action: () => setProp('pan', 0) }, { label: 'Pan right', action: () => setProp('pan', 100) }] },
  { label: 'View', items: () => [
    { label: 'Zoom timeline in', kbd: '=', action: () => zoomTl(1.4) }, { label: 'Zoom timeline out', kbd: '-', action: () => zoomTl(1 / 1.4) }, { label: 'Fit timeline', kbd: '\\', action: fitTl }, '-',
    { label: 'Playback resolution', sub: [[1, 'Full'], [0.5, 'Half'], [0.25, 'Quarter']].map(([v, l]) => ({ label: l, checked: ST.rs === v, action: () => setPreviewScale(v) })) },
    { label: 'Use proxies for playback', checked: () => ST.useProxies, action: () => { ST.useProxies = !ST.useProxies; resetElements(); layoutMonitor(); syncMedia(false); } }, { label: 'Create proxies for all video', action: () => createProxies() }, '-',
    { label: 'Audio meters', checked: () => !$('#meters').classList.contains('hidden'), action: () => { $('#meters').classList.toggle('hidden'); layoutMonitor(); } }, { label: 'Search media in Project panel', action: () => { showLeft('media'); setTimeout(() => document.querySelector('#lbody .search')?.focus(), 30); } },
    { label: 'Safe margins', checked: () => ST.safe, action: () => { ST.safe = !ST.safe; layoutMonitor(); } }, { label: 'Show captions in preview', checked: () => ST.capShow !== false, action: () => { ST.capShow = ST.capShow === false; drawFrame(); renderTimeline(); } }, '-',
    { label: 'Panels', sub: LTABS.map(([k, l]) => ({ label: l, checked: ltab === k, action: () => showLeft(k) })) }, '-',
    { label: 'Appearance…', action: UI.appearanceDialog }, { label: 'Skin', sub: UI.SKINS.map(s => ({ label: s.name, checked: (UI.getSettings().skin || 'dark') === s.id, action: () => UI.setSettings({ skin: s.id }) })) }] },
  { label: 'Help', items: [{ label: 'Keyboard shortcuts', kbd: 'Ctrl+/', action: UI.shortcutSheet }, { label: 'Search all features', kbd: 'Ctrl+K', action: UI.commandPalette }, { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'store' ? 'Updates are delivered by the Microsoft Store.' : r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) }, { label: 'About BTS Video', action: () => modal({ title: 'BTS Video', body: 'Part of BTS Creative — free and open source for students.<br>Video export uses FFmpeg (bundled, GPL).<br>Auto-transcribe uses the Vosk speech recogniser and its small English model (Apache-2.0), offline.<br>Not affiliated with Adobe Inc.' }) }] },
]});
window.addEventListener('bts:close', closeWindow);
function jumpEdit(dir) { const edges = [0, ...PJ.clips.flatMap(c => [c.start, cEnd(c)])]; const list = edges.filter(v => dir > 0 ? v > ST.t + 1e-3 : v < ST.t - 1e-3).sort((a, b) => dir > 0 ? a - b : b - a); if (list.length) seek(list[0]); }

// =====================================================================  shortcuts (Premiere-like)
const S = (k, fn) => UI.shortcut(k, fn);
S('ctrl+i', importDialog); S('ctrl+o', openProject); S('ctrl+alt+n', newProject); S('ctrl+s', () => saveProject(false)); S('ctrl+shift+s', () => saveProject(true)); S('ctrl+m', exportDialog); S('ctrl+shift+e', exportFrame); S('ctrl+w', closeWindow);
S('ctrl+z', undo); S('ctrl+shift+z', redo); S('ctrl+y', redo);
S('ctrl+c', copyClips); S('ctrl+x', cutClips); S('ctrl+v', pasteClips); S('ctrl+shift+d', duplicateClips); S('ctrl+a', selectAll); S('ctrl+shift+a', () => select([]));
S('delete', () => deleteClips(false)); S('backspace', () => deleteClips(false)); S('shift+delete', () => deleteClips(true)); S('shift+backspace', () => deleteClips(true));
S('ctrl+shift+k', splitAtPlayhead); S('ctrl+r', speedDialog); S('ctrl+d', () => applyTransition('cross')); S('ctrl+t', () => addTitle('Big title')); S('ctrl+l', toggleLink); S('ctrl+g', groupClips); S('ctrl+shift+g', ungroupClips); S('shift+f', freezeFrame); S('ctrl+alt+c', () => addCaption(ST.t));
S(' ', () => ST.recording ? stopRecording() : togglePlay()); S('j', () => shuttle(-1)); S('k', () => shuttle(0)); S('l', () => shuttle(1)); S('shift+r', recordVoiceOver);
S('arrowleft', () => seek(ST.t - 1 / PJ.seq.fps)); S('arrowright', () => seek(ST.t + 1 / PJ.seq.fps)); S('shift+arrowleft', () => seek(ST.t - 5 / PJ.seq.fps)); S('shift+arrowright', () => seek(ST.t + 5 / PJ.seq.fps));
S('arrowup', () => jumpEdit(-1)); S('arrowdown', () => jumpEdit(1)); S('home', () => seek(0)); S('end', () => seek(seqDuration()));
S('=', () => zoomTl(1.4)); S('+', () => zoomTl(1.4)); S('shift+=', () => zoomTl(1.4)); S('-', () => zoomTl(1 / 1.4)); S('\\', fitTl);
TOOLS.forEach(([id, , , k]) => S(k.toLowerCase(), () => setTool(id))); S('s', toggleSnap);
S('i', () => setIn()); S('o', () => setOut()); S('x', markClip); S('ctrl+shift+x', clearIO); S('shift+i', () => ST.inP != null && seek(ST.inP)); S('shift+o', () => ST.outP != null && seek(ST.outP));
S(';', () => liftExtract(false)); S("'", () => liftExtract(true)); S(',', () => editFromBin('insert')); S('.', () => editFromBin('overwrite')); S('q', () => rippleTrimToPlayhead('prev')); S('w', () => rippleTrimToPlayhead('next'));
S('alt+n', () => nestSelected()); S('ctrl+alt+arrowright', () => trackSelected(1)); S('ctrl+alt+arrowleft', () => trackSelected(-1));
S('m', () => { const mk = markerAtPlayhead(); mk ? editMarker(mk) : addMarker(); }); S('shift+m', () => jumpMarker(1)); S('ctrl+shift+m', () => jumpMarker(-1));

// =====================================================================  options bar & transport
function renderOptions() {
  const ob = $('#optbar'); ob.innerHTML = '';
  const btn = (ic, label, fn, tip) => h('button', { class: 'btn ghost sm', 'data-tip': tip || label, html: (ic ? icon(ic) : '') + (label ? `<span>${label}</span>` : ''), onclick: fn });
  const asp = h('select', { class: 'asp', 'data-tip': 'Sequence aspect ratio' }, ...ASPECTS.map(([a, w, hh]) => h('option', { value: a, selected: PJ.seq.w * hh === PJ.seq.h * w }, a)), ...(ASPECTS.some(([, w, hh]) => PJ.seq.w * hh === PJ.seq.h * w) ? [] : [h('option', { selected: true, value: '' }, 'Custom')]));
  asp.onchange = () => { const A = ASPECTS.find(a => a[0] === asp.value); if (A) changeSequence(A[1], A[2]); renderOptions(); };
  ob.append(btn('folder', 'Import', importDialog), btn('save', 'Save', () => saveProject(false)), h('div', { class: 'vsep' }), btn('undo', '', undo, 'Undo (Ctrl+Z)'), btn('redo', '', redo, 'Redo (Ctrl+Shift+Z)'), h('div', { class: 'vsep' }),
    btn('text', 'Title', () => addTitle('Big title'), 'Add title (Ctrl+T)'), btn('scissors', 'Split', splitAtPlayhead, 'Add edit at playhead (Ctrl+Shift+K)'), btn('transition', 'Transition', () => applyTransition('cross'), 'Cross dissolve at the nearest cut (Ctrl+D)'), btn('fx', 'Effects', () => showLeft('effects')), btn('note', 'Captions', () => showLeft('captions')), h('div', { class: 'vsep' }),
    h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Aspect'), asp, btn('sliders', '', seqSettings, 'Sequence settings'), h('div', { class: 'vsep' }),
    h('button', { class: 'btn ghost sm rec-btn' + (ST.recording ? ' on' : ''), 'data-tip': 'Record a voice-over from the microphone (Shift+R)', onclick: recordVoiceOver, html: `<span class="rec-dot"></span><span>${ST.recording ? 'Stop' : 'Voice-over'}</span>` }),
    h('div', { style: { flex: 1 } }), h('button', { class: 'btn primary sm', html: icon('export') + 'Export', onclick: exportDialog }));
}
function wireTransport() {
  ['bStart:skipB', 'bPrev:chevL', 'bPlay:play', 'bNext:chevR', 'bEnd:skipF'].forEach(s => { const [id, ic] = s.split(':'); $('#' + id).innerHTML = icon(ic); });
  $('#bStart').onclick = () => seek(0); $('#bEnd').onclick = () => seek(seqDuration()); $('#bPrev').onclick = () => seek(ST.t - 1 / PJ.seq.fps); $('#bNext').onclick = () => seek(ST.t + 1 / PJ.seq.fps); $('#bPlay').onclick = togglePlay;
  $('#bIn').onclick = () => setIn(); $('#bOut').onclick = () => setOut(); $('#bMark').onclick = () => addMarker();
  $('#ltabs').innerHTML = ''; LTABS.forEach(([k, l]) => $('#ltabs').append(h('div', { class: 'tab' + (k === ltab ? ' active' : ''), 'data-t': k, onclick: () => showLeft(k) }, l)));
  new ResizeObserver(() => { layoutMonitor(); drawOverlay(); }).observe($('#monView'));
  $('#tlScroll').addEventListener('scroll', () => { drawRuler(); $('#tlTracksH').scrollTop = $('#tlScroll').scrollTop; });
  $('#ruler').addEventListener('pointerdown', e => {
    const sc = $('#tlScroll'); const r = sc.getBoundingClientRect(); const tAt = ev => Math.max(0, (ev.clientX - r.left + sc.scrollLeft) / ST.pps);
    const mk = PJ.markers.find(m => Math.abs(m.t - tAt(e)) * ST.pps < 6 && e.offsetY > 14); if (mk) { seek(mk.t); if (e.detail >= 2) editMarker(mk); return; }
    const go = ev => seek(tAt(ev)); go(e); const mv = ev => go(ev); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
  });
  $('#ruler').addEventListener('contextmenu', e => { const sc = $('#tlScroll'); const r = sc.getBoundingClientRect(); const t = Math.max(0, (e.clientX - r.left + sc.scrollLeft) / ST.pps); contextMenu(e, [{ label: 'Add marker here', action: () => addMarker(t) }, { label: 'Mark In here', action: () => setIn(t) }, { label: 'Mark Out here', action: () => setOut(t) }, { label: 'Clear In and Out', action: clearIO }]); });
  $('#tlRows').addEventListener('pointerdown', e => { if (e.target.closest('.clip,.trx,.ccx')) return; if (!e.shiftKey) select([]); const sc = $('#tlScroll'); const r = sc.getBoundingClientRect(); seek(Math.max(0, (e.clientX - r.left + sc.scrollLeft) / ST.pps)); });
  $('#tlScroll').addEventListener('wheel', e => { if (e.ctrlKey || e.altKey) { e.preventDefault(); zoomTl(e.deltaY < 0 ? 1.2 : 1 / 1.2); } }, { passive: false });
  window.addEventListener('bts:settings', () => { drawRuler(); drawMeters($('#meters')); });
}

// =====================================================================  project lifecycle
async function newProject() {
  if (PJ.dirty && !(await confirm('Discard changes?', 'The current project has unsaved changes.', 'Discard'))) return;
  pause(); resetElements(); Object.assign(PJ, { name: 'Untitled project', path: null, media: [], clips: [], transitions: [], markers: [], captions: [], tracks: newTracks(), capStyle: { ...VCAP.DEFAULT_STYLE }, capBurn: true, sequences: [{ id: 'S1', name: 'Sequence 01' }], activeSeq: 'S1', censor: { words: [], on: true, bleep: false, estimate: true } });
  ST.sel.clear(); ST.selTr = ST.selCap = null; ST.t = 0; ST.inP = ST.outP = null; hist = []; hi = -1; commit('New'); PJ.dirty = false; clearAutosave(); UI.setDocTitle(PJ.name, 'BTS Video'); renderAll();
}
async function closeWindow() {
  if (ST.recording) await stopRecording();
  if (PJ.dirty) { const r = await modal({ title: 'Save changes?', body: `Save changes to “${PJ.name}” before closing?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] }); if (r === null) return; if (r === 'yes') { await saveProject(false); if (PJ.dirty) return; } else clearAutosave(); }
  bts.win.close();
}
let autosaveTimer = null;
function startAutosave() { clearInterval(autosaveTimer); if (PREFS.autosave > 0) autosaveTimer = setInterval(() => { if (PJ.dirty && !EXP.on) autosaveNow(); }, PREFS.autosave * 1000); }
function renderAll() { renderOptions(); renderHead(); renderLeft(); renderTimeline(); renderFx(); layoutMonitor(); renderSeqTabs(); }
function checkTransitionHandles() {
  const bad = PJ.transitions.map(tr => ({ tr, hd: trHandles(tr) })).filter(x => x.hd && x.hd.short);
  if (!bad.length) return toast(`All ${PJ.transitions.length} transition(s) have enough media`, 'ok');
  selectTransition(bad[0].tr.id); const I = trInfo(bad[0].tr); if (I) seek(I.t0); toast(`${bad.length} transition(s) don't have enough media (marked ⚠ on the timeline) — the edge frames are held`, 'err', 6000); return bad.length;
}
UI.fileDrop(async files => { for (const f of files) { const p = bts.fs.pathOf(f); if (!p) continue; if (/\.btsvid$/i.test(p)) { const r = await bts.fs.read(p); await loadProject({ ...r, data: new Uint8Array(r.data) }); } else if (/\.(srt|vtt)$/i.test(p)) { const r = await bts.fs.read(p); addCaptionsFromList(VCAP.parse(new TextDecoder().decode(new Uint8Array(r.data))), !PJ.captions.length); } else { const m = await importPath(p, f.name); if (m && !m.missing && PJ.clips.length === 0) appendMedia(m); } } }, 'Drop media, captions or projects to import');
(async () => {
  wireTransport(); if (PREFS.rs) ST.rs = PREFS.rs;
  ST.ffmpeg = await bts.ffmpeg.available();
  renderAll(); commit('New'); PJ.dirty = false; UI.setDocTitle(PJ.name, 'BTS Video'); setTool('select');
  if (!ST.ffmpeg) setStatus('FFmpeg not found — exporting uses built-in WebM');
  const qf = UI.queryFile();
  if (qf) { if (/\.btsvid$/i.test(qf)) { const r = await bts.fs.read(qf); loadProject({ ...r, data: new Uint8Array(r.data) }); } else { const m = await importPath(qf); if (m && !m.missing) appendMedia(m); } }
  else if (hasRecoverable()) setTimeout(() => recoverAutosave(true), 400);
  startAutosave(); drawMeters($('#meters'));
})();
window.__bts = { PJ, ST, autoTranscribe, autoTranscribeDialog, nestSelected, switchSequence, addMask, trackSelected, beatDetect, autoCutToBeats, sceneDetect, autoTimeTranscript, setCensor, newFromTemplate, smartReframe, importPath, appendMedia, addTitle, seek, renderAt, splitAtPlayhead, applyTransition, exportFFmpeg, select, renderTimeline, drawFrame, applyLook, commit, get EXP() { return EXP; } };
