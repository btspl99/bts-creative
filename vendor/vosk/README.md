# vendor/vosk

Offline speech recognition for BTS Video (Captions › Auto-transcribe). Run from the main
process via koffi in a utilityProcess (`stt-worker.js`); no WebAssembly or eval in renderers.

- `win/` — `libvosk.dll` + MinGW runtime DLLs from `vosk-win64-0.3.45.zip`
- `linux/` — `libvosk.so` from `vosk-linux-x86_64-0.3.45.zip`
- `model-en-us/` — `vosk-model-small-en-us-0.15`
- `model-hi/` — `vosk-model-small-hi-0.22` (Hindi, Devanagari output; md5 of the zip 80f1265262c9a8a515f2707498e1b485)

Shipped as electron-builder `extraResources` to `resources/vosk/`. Licences: see NOTICE.txt.
