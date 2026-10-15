# BTS Office

Free, open-source creative suite for students by **Bhoomiputra Tech Solutions Pvt Ltd**.

| App | What it does |
|---|---|
| **BTS PDF Pro** | View, highlight, comment, sign, fill and create forms, edit text, redact, merge, split, compress, export PDFs |
| **BTS Photo** | Layers, masks, blend modes, brushes, clone/heal, selections, levels/curves, filters, text, shapes, PSD open/save |
| **BTS Vector** | Pen, shapes, type, gradients, pathfinder, clipping masks, align, SVG / PNG / vector PDF export |
| **BTS Video** | Multi-track timeline, razor/trim, titles, transitions, color looks, MP4/MOV/GIF/MP3 export (FFmpeg) |

Website and auto-updates: <https://office.btspl.tech>

## Build

```bash
npm install
# place ffmpeg.exe + LICENSE.txt in vendor/ffmpeg (see vendor/ffmpeg/README.md)
npm start            # run in development
npm run dist         # build dist/BTS-Office-Setup-<version>.exe + latest.yml
```

## Releasing an update

1. Bump `"version"` in `package.json` (e.g. 1.0.1) and run `npm run dist`.
2. Upload `BTS-Office-Setup-<version>.exe`, its `.blockmap` and `latest.yml` to `public_html/updates/` on office.btspl.tech.
3. Installed copies check `https://office.btspl.tech/updates/latest.yml` at launch and every 4 hours, download the update in the background, and install it on restart.

## License

MIT. FFmpeg is bundled as a separate GPL executable. BTS Office is not affiliated with Adobe Inc.
