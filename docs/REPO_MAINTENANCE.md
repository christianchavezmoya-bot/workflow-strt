# Repository maintenance

Periodic cleanup for branches, pull requests, and documentation. Last audit: **2026-08-13** (`main` @ `2c85427+`).

---

## Quick commands (Mac / Linux)

```bash
git fetch origin --prune
git checkout main
git pull --no-rebase origin main   # this repo has no default pull strategy

# Merged branches safe to delete locally
git branch --merged main | grep -v 'main' | xargs -r git branch -d

# Remote merged branches (maintainers)
git branch -r --merged origin/main | grep 'origin/cursor/' | sed 's|origin/||' | while read b; do
  git push origin --delete "$b"
done
```

**Windows:** use `git pull --no-rebase origin main` (same divergent-branch fix as Mac agents).

---

## Branch policy

| Pattern | When to delete |
|---------|----------------|
| `cursor/*-cd21` merged to `main` | After PR merge (GitHub often auto-deletes; prune stale remotes with `git fetch --prune`) |
| `cursor/*-cd21` open PR abandoned | Close PR, then delete branch |
| `codex/*`, `fix/*`, `test/*` | Review individually; delete if >30 days stale and superseded |

### Audit snapshot (2026-08-13)

| Metric | Count |
|--------|------:|
| Remote branches total | ~112 |
| Merged into `main` (deletable) | ~86 |
| Not merged (review before delete) | ~24 |
| Open PRs | 22 |

**Safe bulk action:** delete all `origin/*` branches that are `--merged origin/main` (except `main`).

**Do not delete without review:** branches with open PRs that still have unique commits ahead of `main` (see table below).

---

## Open PR triage (2026-08-13)

### Close — superseded (content already on `main`)

| PR | Branch | Reason |
|----|--------|--------|
| #12 | `cursor/offline-first-docs-plan-cd21` | Offline-first docs merged via later PRs |
| #16–#21 | `cursor/phase5-*` … `phase10-*` | Phases 5–10 shipped on `main`; branches only behind |
| #81 | `cursor/web-perf-polish-cd21` | Merged via **#72** |

### Review — unique commits, stale base (rebase or close)

| PR | Branch | Ahead | Notes |
|----|--------|------:|-------|
| #141 | `cursor/signature-deep-link-report-preview-cd21` | 1 | Signature deep-link + multi-page preview — **candidate to rebase + merge** |
| #124 | `cursor/false-offline-fix-cd21` | 1 | Native false-offline fix |
| #116 | `cursor/offline-ready-indicator-cd21` | 1 | Offline-ready dot semantics |
| #110 | `cursor/native-bootstrap-pending-fix-cd21` | 1 | Bootstrap blocked by pending uploads |
| #109 | `cursor/native-offline-sync-investigation-cd21` | 1 | Investigation **doc only** — cherry-pick or merge doc |
| #44 | `cursor/search-performance-fixes-cd21` | 1 | Search + asset typing perf |
| #26 | `cursor/jwt-expiry-retest-windows-cd21` | 1 | JWT=1 min test config (Windows only) |

### Review — experimental / old

| PR | Branch | Notes |
|----|--------|-------|
| #2 | `codex/workflow-inspection-reaudit` | May 2026; 15 commits ahead — likely stale (closed) |
| #8 | `cursor/workflow-capture-columns-845f` | Capture columns from workflow steps |
| #9–#10 | `cursor/dashboard-*-3e6f` | Dashboard perf / skeleton loading |

---

## Documentation policy

### Keep in `docs/` (active)

- **Cloud / staging:** `CLOUD_HOSTING_*`, `MAC_AGENT_DOCKER_STAGING_PROMPT.md`, `WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md`
- **Offline ops:** `OFFLINE_*`, `RELEASE_CHECKLIST.md`, `BUG_TRIAGE.md`, `MOBILE_BUILD.md`
- **Generated:** `ARCHITECTURE.md` (via `npm run docs:update` — do not hand-edit)
- **Agent index:** `AGENT_RETEST_INDEX.md`
- **Code quality:** `EXCELLENCE_PROGRAMME.md` (**start here** — the ordered programme, the UX
  divergence protocol and the divergence register), `S2_PRODUCT_DECISIONS.md` (product verdicts from
  stage S2), `S3_TEST_FOUNDATION.md` (S3 coverage tracker), backed by `CODE_QUALITY_ASSESSMENT.md` and
  `CODE_QUALITY_BUG_SWEEP.md` (dated snapshots — re-run rather than edit) plus
  `CODE_QUALITY_REMEDIATION_PLAN.md` and `MODERNIZATION_PLAN.md` (living; update status as work lands)

### Archived → `docs/archive/`

Superseded prompts and Aug 2026 field-test snapshots. See [`archive/README.md`](./archive/README.md).

### Removed as junk

- `public/# Code Citations.md` — accidental third-party citation dump in web root (2026-08-13)

### Stale but kept (for now)

| File | Why |
|------|-----|
| `.github/copilot-instructions.md` | Marked stale in `CLAUDE.md`; replace when Copilot config is updated |
| `docs/WEB_PERF_IMPLEMENTATION_PLAN.md` | Phases largely shipped; keep until perf work formally closed |
| `docs/schema.md` | Legacy schema notes — verify against EF migrations before delete |

---

## Suggested quarterly checklist

1. `git fetch origin --prune`
2. Delete merged remote branches
3. Close open PRs whose branches are fully merged
4. Move superseded prompts to `docs/archive/prompts/`
5. Update `AGENT_RETEST_INDEX.md` current-round table
6. Refresh this audit date + PR table
