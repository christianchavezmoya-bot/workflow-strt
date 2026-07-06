# Strata Workflow App — Sales Presentation v2

Interactive customer demo with **real app screenshots**, **13-scene narration**, and a **75% screenshot layout**.

## Download

Unzip **`strata-workflow-presentation.zip`**, then run **`Start-Presentation.bat`** (Windows) or **`Start-Presentation.sh`** (Mac/Linux).

## What's new in v2

- **13 scenes** covering projects, assets, workflows, dashboard, issues, offline, architecture, and enterprise
- **Real screenshots** captured from today's app data (JOB-4021 project, live assets)
- **Screenshot panel = 75%** of the presentation viewport
- **Male English narrator** (Andrew, neutral, medium pace)
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
