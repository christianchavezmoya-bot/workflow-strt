# Clean data reset (seed profiles)

What a database contains on boot is controlled by `SeedProfile`.

| `SeedProfile` | Users | Catalog | Sample project |
|---|---|---|---|
| _(unset)_ | admin + project manager | Strata Connect / Strata Protect / Strata AI divisions, no products | none |
| `Minimal` | admin + installer | same three divisions, no products | none |
| `Demo` (or `SeedDemoData=true`) | admin + project manager | legacy Mining / Safety / Technology divisions + 6 products | `JOB-4021` + `INST-01` |
| `StrataNgo` | admin + project manager | Strata divisions + staging products + Chambers workflow | none |

The `JOB-4021` sample project and the demo product catalog are **opt-in only**. A database
created without a profile starts empty apart from users and the three default divisions.

## Resetting a field-test machine

```bash
# keep users + SMTP settings, drop the demo project/catalog
scripts/reset-minimal-db.sh --clean

# start completely fresh (SMTP settings are lost)
scripts/reset-minimal-db.sh --wipe
```

`--clean` works because the Minimal profile runs a clean-catalog pass on **every** boot, not
just the first one: it removes the seeded `JOB-4021` project, its `INST-01` installation and
the legacy demo divisions/products, then restores the three default divisions if none remain.
It only touches rows that match the seeded demo data, leaves the catalog alone once any
project/asset/workflow exists, never resurrects a division you deleted, and never touches
notification/SMTP settings.

After a reset, check **Settings → Notifications → Frontend Base URL** points at the machine
serving the web app (e.g. `http://192.168.1.102:5173`) so invite and signature links work.

The `e2e-full` and `e2e-web-perf` Playwright configs boot the API with `SeedProfile=Demo`,
because those specs need a product/project fixture to drive.

## Running with a profile

```bash
# Windows / PowerShell
$env:SeedProfile="Minimal"; dotnet run --project server/Commtrac.Api

# or use the launch profile
dotnet run --project server/Commtrac.Api --launch-profile Minimal
```
