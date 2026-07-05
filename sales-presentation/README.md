# Strata Workflow App — Sales Presentation

Interactive, customer-facing sales demonstration for the Strata Workflow App field operations platform.

## Download ready-to-use build

Download and unzip **`strata-workflow-presentation.zip`**, then:

1. **Windows:** double-click **`Start-Presentation.bat`**
2. **Mac/Linux:** double-click **`Start-Presentation.sh`**
3. Click **Start Presentation** on the opening screen

> If you see a blank page, use the launcher instead of opening `index.html` directly.

## Run from source

```bash
cd sales-presentation
npm install
npm run dev
npm run build
npm run pack    # creates strata-workflow-presentation.zip
```

## Narration

- Voice: **es-AR-ElenaNeural** (female, Argentine accent, English script)
- Script: [`NARRATION_SCRIPT.md`](./NARRATION_SCRIPT.md)
- Regenerate: `npm run narration:force`
