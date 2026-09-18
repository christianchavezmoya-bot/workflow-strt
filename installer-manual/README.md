# Strata N-Go — Installer Field Guide

Simplified PDF training manual for **Installer** role users.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Manual source (browser-readable) |
| `Strata-NGo-Installer-Field-Guide.pdf` | Print / share PDF (generated) |
| `screenshots/` | Real webapp captures |
| `scripts/setup-and-capture.mjs` | Seed demo data + capture screenshots |
| `scripts/generate-pdf.mjs` | HTML → PDF |

## Regenerate (local)

```bash
# Terminal 1 — API with StrataNgo seed (fresh DB recommended)
rm -f server/Commtrac.Api/commtrac.db*
export PATH="$HOME/.dotnet:$PATH"
SeedProfile=StrataNgo dotnet run --project server/Commtrac.Api --urls http://0.0.0.0:4000

# Terminal 2 — frontend
npm run dev

# Terminal 3 — capture + PDF
node installer-manual/scripts/setup-and-capture.mjs
node installer-manual/scripts/generate-pdf.mjs
```

Optional env vars: `MANUAL_API`, `MANUAL_WEB`, `MANUAL_ADMIN_EMAIL`, `MANUAL_ADMIN_PASSWORD`.

## Staging capture

Point at staging instead of localhost:

```bash
MANUAL_API=https://api.staging.strata-ngo.com/api \
MANUAL_WEB=https://staging.strata-ngo.com \
MANUAL_ADMIN_EMAIL=your-admin@example.com \
MANUAL_ADMIN_PASSWORD=your-password \
node installer-manual/scripts/setup-and-capture.mjs
```

Use an Installer account for dashboard screenshots (adjust script to skip setup when using real staging data).
