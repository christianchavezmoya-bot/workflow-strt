# Download Strata Workflow Presentation (v4 · 20 scenes)

## ⚠️ Still seeing 13 scenes?

You are running an **old copy**. Do this:

1. **Delete** your old unzipped folder and any old ZIP files
2. **Do not** use `commtrac-sales-presentation.zip` (that is the ancient 13-scene build)
3. Download **v4 only** (~12 MB):

**[presentation-v4 release](https://github.com/christianchavezmoya-bot/workflow-strt/releases/download/presentation-v4/strata-workflow-presentation.zip)**

4. Unzip to a **new folder** (e.g. `Strata-Presentation-v4`)
5. Run `Start-Presentation.bat` or `.sh`
6. Confirm opening screen says **"v4"** and counter shows **"1 / 20"**

| File | Size | Scenes |
|------|------|--------|
| `commtrac-sales-presentation.zip` | ~1.2 MB | ❌ OLD — 13 |
| `strata-workflow-presentation.zip` (v3) | ~7.8 MB | ❌ OLD — 13 |
| **v4 release ZIP** | **~12 MB** | ✅ **20** |

## Option A — GitHub Release (recommended)

https://github.com/christianchavezmoya-bot/workflow-strt/releases/tag/presentation-v4

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
