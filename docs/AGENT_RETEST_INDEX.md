# Agent retest prompts — index

Use this index when field agents need to **install, verify, and sign off** on `main`.

---

## Current active prompts (Aug 2026)

| Round | Branch | Mac prompt | Windows prompt |
|-------|--------|------------|----------------|
| **Docker cloud-shaped staging** | `main` including **#185** (Postgres bool + MinIO tag) | [`MAC_AGENT_DOCKER_STAGING_PROMPT.md`](./MAC_AGENT_DOCKER_STAGING_PROMPT.md) | [`WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md`](./WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md) |
| **Full device test (web + iPhone + Android)** | `main` after staging sign-off | [`MAC_AGENT_DEVICE_TEST_PROMPT.md`](./MAC_AGENT_DEVICE_TEST_PROMPT.md) | — (needs Xcode/Android Studio) |
| Standup guide | | [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md) | same |
| Pre-deploy gate | | [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md) | same |
| **Cloud hosting AWS prep** | `main` @ `c4b4125+` | [`IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](./IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md) | [`WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md`](./WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md) |
| **Native N-go sanity** | `main` (latest) | [`IOS_MAC_AGENT_NGO_LATEST_PROMPT.md`](./IOS_MAC_AGENT_NGO_LATEST_PROMPT.md) | — (API on Windows `:4000` or Docker `:8080`) |

**Strata NGO Docker login:** `admin@StrataNgo.local` / `Admin123!`

**Copy:** PROMPT START → PROMPT END into Cursor on the target machine.

---

## Which agent does what

| Agent | Machine | Scope |
|-------|---------|--------|
| **Mac Docker staging agent** | Mac + Docker Desktop | Postgres/MinIO/API `:8080`, web `:5174`, Strata seed, BOM |
| **Mac iOS agent** | Mac + Xcode + iPhone | Native **N-go** build, offline/sync on device |
| **Windows agent** | Windows PC | API + web verification, JWT/config, Docker staging |

**Rule:** Mac iOS agent does **not** change `server/` unless assigned. Windows agent does **not** build iOS.

---

## How to run a retest

1. Cloud agent merges to `main` and points field agents at the row above.
2. **Mac Docker agent** runs first for staging stack (executable prompt — agent runs all commands).
3. **Windows agent** optional for Sqlite dev `:4000` regression.
4. **Mac iOS agent** after API confirmed — physical iPhone, same Strata logins against LAN `:8080` or dev `:4000`.

### Migration failures are cloud-agent work, not field-agent work

Field agents must **not** patch `server/Commtrac.Api/Migrations/` locally to get a stack running. A local patch means the run proves nothing and the next machine hits the same wall. The agent reports the migration name, Postgres error code, and column; the cloud agent fixes it on `main`; the field agent re-pulls and retries with `down -v`.

Postgres/SQLite differences belong in [`MigrationSql`](../server/Commtrac.Api/Data/MigrationSql.cs) — `Q()` for identifiers, `BoolTrue`/`BoolFalse`/`BoolCase` for boolean literals.

---

## Archived prompts (do not use for new runs)

Superseded rounds live under [`archive/prompts/`](./archive/prompts/) — Phase 0 time-tracker, connectivity UI, offline UX, session sync, etc.

Historical field reports: [`archive/reports/`](./archive/reports/).

Maintenance policy: [`REPO_MAINTENANCE.md`](./REPO_MAINTENANCE.md).

---

## Shared constants

| Item | Docker staging | Default dev |
|------|----------------|-------------|
| Web URL | http://localhost:**5174** | http://localhost:**5173** |
| API | http://localhost:**8080**/api | http://localhost:**4000**/api |
| Native app name | **N-go** | **N-go** |
| Admin (Strata seed) | `admin@StrataNgo.local` / `Admin123!` | `admin@commtrac.local` / `Admin123!` |

Device LAN IP → **untracked** `.env.production.local` on Mac — never commit.

---

## Related docs

- [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) — native device matrix
- [`BUG_TRIAGE.md`](./BUG_TRIAGE.md) — severity + support bundle
- [`NATIVE_SESSION_SYNC_RESOLUTION_PLAN.md`](./NATIVE_SESSION_SYNC_RESOLUTION_PLAN.md) — auth/session findings
