# Download Strata Workflow Presentation

## Option A — GitHub Actions artifact (recommended)

1. Open the repo on GitHub → **Actions** tab.
2. Click the latest **Presentation pack** workflow run (green check).
3. Scroll to **Artifacts** at the bottom of the run page.
4. Download **`strata-workflow-presentation-with-launchers`** (ZIP + `Start-Presentation.bat` / `.sh`).

## Option B — Direct file link (feature branch)

While [PR #5](https://github.com/christianchavezmoya-bot/workflow-strt/pull/5) is open, download the committed ZIP:

**[strata-workflow-presentation.zip](https://github.com/christianchavezmoya-bot/workflow-strt/raw/cursor/sales-presentation-7022/sales-presentation/dist-ready/strata-workflow-presentation.zip)**

Also grab the launchers from the same folder:

- [Start-Presentation.bat](https://github.com/christianchavezmoya-bot/workflow-strt/raw/cursor/sales-presentation-7022/sales-presentation/dist-ready/Start-Presentation.bat)
- [Start-Presentation.sh](https://github.com/christianchavezmoya-bot/workflow-strt/raw/cursor/sales-presentation-7022/sales-presentation/dist-ready/Start-Presentation.sh)

## Option C — GitHub Releases

Check **Releases** on the repo for a tagged build with the presentation ZIP attached.

## After download

1. Unzip everything into one folder.
2. Run **`Start-Presentation.bat`** (Windows) or **`Start-Presentation.sh`** (Mac/Linux).
3. Click **Start Presentation** in the browser.

If the page is blank, use the launcher scripts — do not rely on double-clicking `index.html` alone.

## Build locally

```bash
cd sales-presentation
npm install
npm run pack
# Output: dist-ready/strata-workflow-presentation.zip
```
