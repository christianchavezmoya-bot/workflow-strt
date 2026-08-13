# Archived documentation

Historical agent prompts, field-test reports, and planning docs **superseded by work merged to `main`**. Kept for audit trail — do not copy into new agent runs unless you explicitly need that round.

## Active prompts (use these instead)

| Purpose | File |
|---------|------|
| **Mac Docker staging** (current) | [`../MAC_AGENT_DOCKER_STAGING_PROMPT.md`](../MAC_AGENT_DOCKER_STAGING_PROMPT.md) |
| **Windows Docker staging** | [`../WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md`](../WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md) |
| **Mac native / cloud hosting** | [`../IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](../IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md) |
| **Windows cloud hosting** | [`../WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md`](../WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md) |
| **Mac N-go sanity** | [`../IOS_MAC_AGENT_NGO_LATEST_PROMPT.md`](../IOS_MAC_AGENT_NGO_LATEST_PROMPT.md) |
| **Index** | [`../AGENT_RETEST_INDEX.md`](../AGENT_RETEST_INDEX.md) |

## Archive layout

| Folder | Contents |
|--------|----------|
| [`prompts/`](./prompts/) | Superseded Mac/Windows agent copy-paste prompts (pre–Aug 2026 rounds) |
| [`reports/`](./reports/) | Field-test snapshots, time-tracker handover, perf smoke reports (Aug 2026) |

## When to archive (policy)

Move docs here when **all** of the following are true:

1. The work described is merged to `main` (or explicitly abandoned).
2. A newer prompt or runbook replaces it for field agents.
3. No active doc links to it except this index and historical cross-refs.

See [`../REPO_MAINTENANCE.md`](../REPO_MAINTENANCE.md) for branch/PR cleanup.
