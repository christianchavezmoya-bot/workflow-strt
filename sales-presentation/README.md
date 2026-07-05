# Commtrac Sales Presentation

Interactive, customer-facing sales demonstration for Commtrac field operations platform.

## Features

- 12-scene guided presentation (~3 minutes)
- Professional female narration (MP3 per scene)
- **Start Presentation** unlocks audio and auto-advances scenes
- **Start without audio** for silent/kiosk playback
- Mute toggle, pause, manual navigation, swipe support
- Fully static — no backend required
- Works offline after files are downloaded
- Responsive: desktop, tablet, mobile

## Quick start

### Download ready-to-use build (no install)

Download and unzip **`commtrac-sales-presentation.zip`**, then:

1. **Windows:** double-click **`Start-Presentation.bat`**
2. **Mac/Linux:** double-click **`Start-Presentation.sh`** (or run `bash Start-Presentation.sh`)
3. **Or** open **`index.html`** directly in Chrome or Edge

Your browser opens at `http://localhost:8765` when using the launcher. Fully offline — no Node.js required.

> **Blank white screen?** Browsers often block local HTML apps. Use `Start-Presentation.bat` / `.sh` instead of double-clicking `index.html`.

### Run from source

```bash
cd sales-presentation
npm install
npm run narration   # generate MP3 files (requires edge-tts + ffmpeg)
npm run dev         # local preview at http://localhost:5173
npm run build       # production build in dist/
npm run preview     # serve dist/ locally
```

## Deploy

Upload the contents of `dist/` to any static host (S3, Azure Static Web Apps, GitHub Pages, nginx, etc.).

Because `vite.config.ts` uses `base: "./"`, the build works when opened from a folder or subpath.

## Narration

- Script: [`NARRATION_SCRIPT.md`](./NARRATION_SCRIPT.md)
- Audio: `public/audio/scene-01.mp3` … `scene-12.mp3`
- Voice: Microsoft Edge `en-US-AriaNeural` via [edge-tts](https://github.com/rany2/edge-tts)
- Regenerate: `npm run narration`

## Controls

| Action | Input |
|---|---|
| Start with narration | **Start Presentation** |
| Silent mode | **Start without audio** |
| Next / previous scene | Arrow keys, swipe, or ← → buttons |
| Pause / resume | ❚❚ button or `P` |
| Mute / unmute | Mute button or `M` |
| Jump to scene | Click scene dots |
| Explore hotspots | Click pulsing dots on select slides |
| Restart | Restart or Replay at end |

## Offline use

1. Run `npm run build`
2. Copy the entire `dist/` folder (including `audio/`) to the target device
3. Open `index.html` in a browser, or serve via any static file server

No internet connection is required after build.
