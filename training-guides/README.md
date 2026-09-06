# Strata N-Go Training Guides

Standalone step-by-step documentation for Commtrac / Strata N-Go. **Not bundled** with the frontend, backend, or mobile apps.

## Contents

| Guide | Interactive HTML | PDF |
|-------|------------------|-----|
| Hub | [index.html](./index.html) | [00-training-guides-index.pdf](./pdf/00-training-guides-index.pdf) |
| 1 · Customers & sites | [guides/01-customers-and-sites.html](./guides/01-customers-and-sites.html) | [01-customers-and-sites.pdf](./pdf/01-customers-and-sites.pdf) |
| 2 · Catalog setup | [guides/02-catalog-setup.html](./guides/02-catalog-setup.html) | [02-catalog-setup.pdf](./pdf/02-catalog-setup.pdf) |
| 3 · Projects | [guides/03-projects.html](./guides/03-projects.html) | [03-projects.pdf](./pdf/03-projects.pdf) |
| 4 · Workflows & builder | [guides/04-workflows-builder.html](./guides/04-workflows-builder.html) | [04-workflows-builder.pdf](./pdf/04-workflows-builder.pdf) |

## How to use

### Interactive web (recommended for learning)

1. Open `training-guides/index.html` in a browser (double-click or serve locally).
2. Pick a guide from the hub.
3. Toggle **Read** (documentation only) or **Try it** (click mock UI buttons to simulate actions).
4. Use the step list in the left sidebar to jump between sections.

No server or login required — all UI recreations are static HTML/CSS with lightweight JavaScript.

### PDF (print / offline)

From the repository root (requires `npm install` and Playwright browsers):

```bash
node training-guides/scripts/generate-pdfs.mjs
```

PDFs are written to `training-guides/pdf/`. Regenerate after editing any guide HTML.

Alternatively, open a guide in the browser and use **Print → Save as PDF** (enable background graphics).

## Structure

```
training-guides/
  index.html              # Hub page
  assets/                 # Logo and static assets
  shared/
    guide.css             # App-matched theme (Strata colours)
    guide.js              # Read/Try-it mode, step navigation
  guides/                 # Four interactive guides
  pdf/                    # Generated PDFs
  scripts/
    generate-pdfs.mjs     # Playwright print-to-PDF
```

## Theme

Colours match the live app (`#0b1d24` background, `#2dd4bf` primary, `#ff9f45` accent). Mock screens recreate Admin, Settings, Projects, and Workflows layouts without calling the API.

## Relationship map

```
Customer → Site → Project → Assets / Inspections
Division → Product → Features → Workflow
Project team members → Workflow "User select" inputs
Product → Workflow configs (per product tab)
```
