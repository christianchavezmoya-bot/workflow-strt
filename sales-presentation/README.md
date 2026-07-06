# Strata Workflow App — Sales Presentation v3

Interactive customer demo: **4 views per scene**, **region-specific screenshots**, **13-scene narration**.

## Download

See **[DOWNLOAD.md](./DOWNLOAD.md)** for all options. Quick links:

| Method | Link |
|--------|------|
| **GitHub Actions artifact** | Repo → Actions → **Presentation pack** → Artifacts |
| **Direct ZIP** (PR branch) | [strata-workflow-presentation.zip](https://github.com/christianchavezmoya-bot/workflow-strt/raw/cursor/sales-presentation-7022/sales-presentation/dist-ready/strata-workflow-presentation.zip) (~7.8 MB) |
| **Local build** | `npm run pack` in this folder |

Unzip, then run **`Start-Presentation.bat`** (Windows) or **`Start-Presentation.sh`** (Mac/Linux).

## What's new in v3

- **4 interactive panels per scene** — auto-cycle with narration; click to focus
- **Region clips** — dashboard cards, asset rows, workflow builder, mobile tabs (not just page headers)
- **52 scene screenshots** under `public/screenshots/scenes/`
- Male English narrator (Andrew), reliable pre-loaded audio

## What's in v2

- **13 scenes** covering projects, assets, workflows, dashboard, issues, offline, architecture, and enterprise
- **Real screenshots** captured from today's app data (JOB-4021 project, live assets)
- **Screenshot panel = 75%** of the presentation viewport
- **Reliable audio** — pre-loaded tracks fix silent scene 2/3 transitions

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
