# Download Strata Workflow Presentation (v5 · 20 scenes + videos)

## ⚠️ Seeing an old version (13 scenes / cropped images)?

You are running an **old copy**. Do this:

1. **Delete** your old unzipped folder and any old ZIP files
2. Download **v5 only** (~7 MB):

**[presentation-v5 release](https://github.com/christianchavezmoya-bot/workflow-strt/releases/download/presentation-v5/strata-workflow-presentation.zip)**

3. Unzip to a **new folder** (e.g. `Strata-Presentation-v5`)
4. Run `Start-Presentation.bat` or `.sh`
5. Confirm opening screen says **"v5"**, counter shows **"1 / 20"**, and journey scenes play videos

## Option A — GitHub Release (recommended)

https://github.com/christianchavezmoya-bot/workflow-strt/releases/tag/presentation-v5

Download **`strata-workflow-presentation.zip`** under Assets.

## Option B — GitHub Actions artifact

Repo → Actions → **Presentation pack** → Artifacts → `strata-workflow-presentation-with-launchers`

## After download

1. Unzip to a **new** folder (delete any old folder first)
2. Run **`Start-Presentation.bat`** (Windows) or **`Start-Presentation.sh`** (Mac/Linux)
3. Click **Start Presentation** or **Jump to User Journey**

## Build locally

```bash
cd sales-presentation
npm install
npm run pack
# Output: dist-ready/strata-workflow-presentation.zip (~12 MB, 20 scenes)
```
