// BTS Creative — offline speech-to-text worker (Electron utilityProcess, started from main.js).
// Runs the Vosk speech recogniser (Apache-2.0, https://alphacephei.com/vosk) through koffi FFI, so no
// WebAssembly / eval is needed in any renderer. FFmpeg decodes the audio to 16 kHz mono s16le PCM on stdout,
// which is fed to vosk_recognizer_accept_waveform with per-word timings enabled.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const port = process.parentPort;
const send = m => { try { port.postMessage(m); } catch {} };
let ff = null;

function loadVosk(libDir) {
  const koffi = require('koffi');
  if (process.platform === 'win32') {
    // libvosk.dll is a MinGW build: load its runtime DLLs first so Windows resolves them by name
    process.env.PATH = libDir + path.delimiter + (process.env.PATH || '');
    for (const dep of ['libwinpthread-1.dll', 'libgcc_s_seh-1.dll', 'libstdc++-6.dll']) {
      const p = path.join(libDir, dep); if (fs.existsSync(p)) koffi.load(p);
    }
  }
  const lib = koffi.load(path.join(libDir, process.platform === 'win32' ? 'libvosk.dll' : process.platform === 'darwin' ? 'libvosk.dylib' : 'libvosk.so'));
  return {
    setLogLevel: lib.func('void vosk_set_log_level(int level)'),
    modelNew: lib.func('void *vosk_model_new(const char *path)'),
    modelFree: lib.func('void vosk_model_free(void *model)'),
    recNew: lib.func('void *vosk_recognizer_new(void *model, float sample_rate)'),
    recFree: lib.func('void vosk_recognizer_free(void *rec)'),
    setWords: lib.func('void vosk_recognizer_set_words(void *rec, int words)'),
    accept: lib.func('int vosk_recognizer_accept_waveform(void *rec, const uint8_t *data, int length)'),
    result: lib.func('const char *vosk_recognizer_result(void *rec)'),
    finalResult: lib.func('const char *vosk_recognizer_final_result(void *rec)'),
  };
}

function run(job) {
  const t0 = Date.now();
  send({ type: 'progress', phase: 'loading', progress: 0, message: 'Loading the speech model…' });
  const V = loadVosk(job.libDir);
  V.setLogLevel(-1);
  const model = V.modelNew(job.modelDir);
  if (!model) throw new Error('Could not load the speech model');
  const rec = V.recNew(model, 16000);
  if (!rec) { V.modelFree(model); throw new Error('Could not create the recogniser'); }
  V.setWords(rec, 1);

  const words = []; const texts = [];
  const take = s => {
    if (!s) return; let j; try { j = JSON.parse(s); } catch { return; }
    if (Array.isArray(j.result)) j.result.forEach(w => words.push({ word: w.word, start: +w.start, end: +w.end, conf: +w.conf }));
    if (j.text) texts.push(j.text);
  };

  const dur = Math.max(0.1, +job.duration || 0);
  const BPS = 32000; // 16 kHz × 2 bytes
  const CHUNK = 8000; // 0.25 s per accept call
  let pending = Buffer.alloc(0), fed = 0, lastSent = 0;
  const feed = buf => {
    for (let o = 0; o + 1 < buf.length; o += CHUNK) {
      const part = buf.subarray(o, Math.min(buf.length, o + CHUNK));
      if (V.accept(rec, part, part.length)) take(V.result(rec));
      fed += part.length;
    }
    const now = Date.now();
    if (now - lastSent > 150) { lastSent = now; send({ type: 'progress', phase: 'recognising', progress: Math.min(0.99, fed / BPS / dur), seconds: fed / BPS, words: words.length, partial: texts.slice(-1)[0] || '' }); }
  };

  send({ type: 'progress', phase: 'recognising', progress: 0, message: 'Listening…' });
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...job.ffArgs, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1'];
    ff = spawn(job.ffmpeg, args, { windowsHide: true });
    let err = '';
    ff.stderr.on('data', d => { err += d.toString(); if (err.length > 20000) err = err.slice(-8000); });
    ff.stdout.on('data', d => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      const n = pending.length - (pending.length % CHUNK);
      if (n > 0) { feed(pending.subarray(0, n)); pending = Buffer.from(pending.subarray(n)); }
    });
    ff.on('error', e => reject(new Error('FFmpeg could not start: ' + e.message)));
    ff.on('close', code => {
      try {
        if (pending.length >= 2) feed(pending.subarray(0, pending.length - (pending.length % 2)));
        take(V.finalResult(rec));
      } finally { V.recFree(rec); V.modelFree(model); }
      if (code !== 0 && !fed) return reject(new Error('FFmpeg could not decode the audio' + (err ? ': ' + err.trim().split('\n').slice(-2).join(' ') : '')));
      resolve({ ok: true, words, text: texts.join(' ').trim(), audioSeconds: fed / BPS, elapsed: (Date.now() - t0) / 1000 });
    });
  });
}

port.on('message', async e => {
  const m = e.data || {};
  if (m.cmd === 'run') {
    try { send({ type: 'done', result: await run(m.job) }); }
    catch (err) { send({ type: 'done', result: { ok: false, error: String(err && err.message || err) } }); }
  } else if (m.cmd === 'cancel') {
    try { ff && ff.kill(); } catch {}
    process.exit(0);
  }
});
