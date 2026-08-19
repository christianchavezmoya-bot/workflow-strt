# Cloud staging seed — wishlist

Fill this in **before** we re-run Docker/AWS staging with a fresh database. Implementation goes into `StrataNgoSeeder.cs` (profile `SeedProfile=StrataNgo`).

**Today (baseline):** see [`CLEAN_DATA_RESET.md`](./CLEAN_DATA_RESET.md) and `server/Commtrac.Api/Data/StrataNgoSeeder.cs`.

---

## Users

| Role | Email (staging) | Password | Notes |
|------|-----------------|----------|-------|
| Admin | `admin@StrataNgo.local` | `Admin123!` | Change for AWS via secrets |
| Project Manager | `project.manager@StrataNgo.local` | `Pm123!` | |
| Installer | _none today_ | | Add? Y/N: |
| Engineer | | | Add? Y/N: |
| Other | | | |

**First-login / force password change on staging?** Y/N:

---

## Offices

| Keep? | Office | Country / region |
|-------|--------|------------------|
| ✓ | Newcastle | Australia / NSW |
| ✓ | Perth | Australia / WA |
| | _add/remove rows_ | |

---

## Customers

| Keep? | Customer name | Notes |
|-------|---------------|-------|
| ✓ | BHP Mining (example) | |
| ✓ | Second demo customer | Rename to: |
| | | |

---

## Divisions (product categories)

| Keep? | Division name |
|-------|---------------|
| ✓ | Strata Connect |
| ✓ | Strata Protect |
| ✓ | Strata AI |
| | _changes_ |

---

## Products

List each product that should exist on **fresh** staging (name, division, linked workflow config):

| Product name | Division | Workflow config | Keep/remove/change |
|--------------|----------|-----------------|-------------------|
| _(current: 6 products — list what you want)_ | | | |

---

## Workflows

| Config | Source file | Published? | Notes |
|--------|-------------|------------|-------|
| Chambers_default | `SeedData/chambers-default-workflow.json` | Yes | Update steps? Y/N |

**Additional published workflows needed?**

---

## Sample project (optional)

Fresh staging currently has **no** project/assets.

| Question | Your answer |
|----------|-------------|
| Include a starter project? | Y/N |
| Job number | |
| # of assets | |
| Assigned workflow | |
| Purpose (demo only / training) | |

---

## Brand / settings

| Setting | Desired value |
|---------|---------------|
| Company name | |
| Logo | default / upload path |
| Frontend base URL | set in Settings after deploy |
| Email / SMTP | Resend keys in secrets only |

---

## Explicitly exclude from fresh seed

Things that must **not** appear on wipe + standup:

- [ ] Legacy Demo profile data (`JOB-4021`, etc.)
- [ ] Tips library documents
- [ ] Pre-loaded document library files
- [ ] _other:_

---

## Sign-off

When this wishlist is complete, ping the agent/dev to implement Phase 1B in [`CLOUD_MOVE_EXECUTION_PLAN.md`](./CLOUD_MOVE_EXECUTION_PLAN.md).

**Completed by:** _______________  
**Date:** _______________
