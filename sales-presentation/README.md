# Strata Workflow App — Sales Presentation v5

State-of-the-art interactive demo: **full-view screenshots**, **recorded journey videos**, **interactive architecture & work-tree diagrams**, **20-scene narration**.

## Download

**[Release presentation-v5](https://github.com/christianchavezmoya-bot/workflow-strt/releases/tag/presentation-v5)** → `strata-workflow-presentation.zip` (~7 MB)

Unzip, then run **`Start-Presentation.bat`** (Windows) or **`Start-Presentation.sh`** (Mac/Linux). See [DOWNLOAD.md](./DOWNLOAD.md).

## What's new in v5

- **Journey videos** — real screen recordings: create a project, run a workflow (Start Run → runner steps), mobile QR upload
- **Interactive work-tree** — 8-step journey diagram; the active step glows, click any node to jump
- **Architecture graph** — clickable layered diagram (Web/Android/iOS → React → API → SQLite + offline branch)
- **Full-view screenshots** with `object-fit: contain` (no cropped, blurry tiles)
- **20 scenes** across Welcome · Product Overview · Live User Journey · Platform & Architecture · Next Steps
- Hero, compare (desktop + phone), and 2×2 grid layouts per scene

## Regenerate assets (API :4000 + Vite :5173 running)

```bash
# 1. Seed a workflow + assignments so Start Run works
node scripts/seed-workflow.mjs

# 2. Record the journey MP4 videos
node scripts/record-videos.mjs          # ONLY=run|create|mobile to redo one

# 3. Capture full-view hero screenshots
npx playwright test --config playwright.hero.config.ts

# 4. Narration + package
npm run narration:force
npm run pack   # → dist-ready/strata-workflow-presentation.zip
```

## Run from source

```bash
cd sales-presentation
npm install
npm run dev
npm run pack
```

## Refresh screenshots (API + Vite must be running)

```bash
# From repo root — seed data first if assets table is empty
npx playwright test --config sales-presentation/playwright.capture.config.ts
npm run narration:force --prefix sales-presentation
npm run pack --prefix sales-presentation
```

## Narration

- Voice: **en-US-AndrewNeural**
- Script: [`NARRATION_SCRIPT.md`](./NARRATION_SCRIPT.md)
- Regenerate: `npm run narration:force`
