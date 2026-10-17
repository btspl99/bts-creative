# vendor/vosk

Offline speech recognition for BTS Video (Captions › Auto-transcribe). Run from the main
process via koffi in a utilityProcess (`stt-worker.js`); no WebAssembly or eval in renderers.

- `win/` — `libvosk.dll` + MinGW runtime DLLs from `vosk-win64-0.3.45.zip`
- `linux/` — `libvosk.so` from `vosk-linux-x86_64-0.3.45.zip`
- `model-en-us/` — `vosk-model-small-en-us-0.15`

Shipped as electron-builder `extraResources` to `resources/vosk/`. Licences: see NOTICE.txt.
