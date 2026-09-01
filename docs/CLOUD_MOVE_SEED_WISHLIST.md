# Cloud staging seed — wishlist

Fill this in **before** we re-run Docker/AWS staging with a fresh database. Implementation goes into `StrataNgoSeeder.cs` (profile `SeedProfile=StrataNgo`).

**Today (baseline):** see [`CLEAN_DATA_RESET.md`](./CLEAN_DATA_RESET.md) and `server/Commtrac.Api/Data/StrataNgoSeeder.cs`.

**Status:** Signed off — implemented in `StrataNgoSeeder` (Phase 1B).

---

## Users

| Role | Email (staging) | Password | Notes |
|------|-----------------|----------|-------|
| Admin | `admin@StrataNgo.local` | `Admin123!` | Change for AWS via secrets |
| Project Manager | `project.manager@StrataNgo.local` | `Pm123!` | |
| Installer | — | — | **Do not add** |
| Engineer | — | — | **Do not add** |

**First-login / force password change on staging?** **Yes** — `IsFirstLogin=true` for Admin and PM.

---

## Offices

| Keep? | Office | Country / region |
|-------|--------|------------------|
| ✓ | Newcastle | Australia / NSW |
| ✓ | Perth | Australia / WA |

---

## Customers

| Keep? | Customer name | Notes |
|-------|---------------|-------|
| ✓ | BHP/Mining | unchanged |
| ✓ | Strata Demo Mining | unchanged (second demo customer) |

---

## Divisions (product categories)

| Keep? | Division name |
|-------|---------------|
| ✓ | Strata Connect |
| ✓ | Strata Protect |
| ✓ | Strata AI |
| ✓ | HazardAvert-Coal | *(product catalog)* |

---

## Products

| Product name | Division | Workflow config | Notes |
|--------------|----------|-----------------|-------|
| **AIM-100** | Strata AI | — | AI Proximity Detection; AIM-100 features patched on boot via `EnsureAim100Features` |
| **HA-Coal** | HazardAvert-Coal | — | 8 inventory features from `SeedData/ha-coal-features.json` (source: `features_HA_coal_2778.xlsx`) |
| **Chambers** | Strata Protect | Chambers_default | Underground refuge chamber |

---

## Workflows

| Config | Source file | Published? | Product | Notes |
|--------|-------------|------------|---------|-------|
| Chambers_default | `SeedData/chambers-default-workflow.json` | Yes | **Chambers** | **Do not** change steps JSON |

**Additional published workflows:** None.

---

## Sample project (optional)

| Question | Your answer |
|----------|-------------|
| Include a starter project? | **No** |
| Job number | — |
| # of assets | None |
| Assigned workflow | None |

---

## Brand / settings

| Setting | Desired value |
|---------|---------------|
| Company name | Strata N-Go (default) |
| Logo | default |
| Frontend base URL | set in Settings after deploy |
| Email / SMTP | Resend keys in secrets only |

---

## Explicitly exclude from fresh seed

- [x] Legacy Demo profile data (`JOB-4021`, etc.)
- [x] Tips library documents
- [x] Pre-loaded document library files
- [x] Starter project / assets

---

## Sign-off

**Completed by:** Product owner  
**Date:** 2026-08-19
