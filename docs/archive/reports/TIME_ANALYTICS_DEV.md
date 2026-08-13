# Time Analytics — local development guide

Time Analytics is a **web-only** dashboard (sidebar → **Time Analytics**) backed by
`GET /api/time-analytics/snapshot`. It aggregates workflow runs, project assets,
projects, customers, products, and users already in Commtrac.

## Critical: use your real database

The API resolves `commtrac.db` **relative to the API project folder** unless you
override the connection string. A fresh checkout creates a **new tiny seed DB**
(~1 MB) with almost no data — Admin, Dashboard, and Analytics will look empty.

### Always work in your primary repo

Use your main workspace (e.g. Windows: `C:\Users\<you>\Documents\Commtrac\Codex\915`),
**not** a temp clone under `C:\tmp\`.

### Point the API at the populated DB

Check startup log when running `dotnet run`:

```
[DB] Resolved path: ...\commtrac.db
[DB] File size: 369.86 MB
```

| Size | Meaning |
|------|---------|
| **100 MB+** | Likely your real workflow history |
| **< 5 MB** | Fresh seed DB — wrong file (API prints a yellow warning) |

**Windows — user secrets (recommended, per checkout):**

```powershell
cd server\Commtrac.Api
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Data Source=C:\FULL\PATH\TO\YOUR\commtrac.db"
dotnet run --urls http://0.0.0.0:4000
```

**One-session override:**

```powershell
$env:ConnectionStrings__DefaultConnection = "Data Source=C:\FULL\PATH\TO\YOUR\commtrac.db"
dotnet run --urls http://0.0.0.0:4000
```

Do **not** copy the large DB into every temp folder — reference the existing file.

## Branch and checkout

Feature branch: **`cursor/time-analytics-consolidated-cd21`**

```powershell
cd C:\Users\<you>\Documents\Commtrac\Codex\915
git fetch origin
git checkout cursor/time-analytics-consolidated-cd21
git pull origin cursor/time-analytics-consolidated-cd21
```

Verify files exist:

```powershell
Test-Path src\features\timeAnalytics
Test-Path server\Commtrac.Api\Controllers\TimeAnalyticsController.cs
```

## Run stack

```powershell
# Terminal 1 — API (rebuild after checkout so controller is included)
cd server\Commtrac.Api
dotnet build
dotnet run --urls http://0.0.0.0:4000

# Terminal 2 — Frontend
cd <repo-root>
npm install
npm run dev
```

Open **http://localhost:5173** → sign in → **Time Analytics**.

## Frontend API host

| Scenario | `VITE_API_BASE` |
|----------|-----------------|
| Browser on same PC as API | `http://localhost:4000/api` (default on localhost) |
| Phone / another PC on LAN | `http://<LAN-IP>:4000/api` in untracked `.env.production.local`, then `npm run dev` |

Confirm **API Debug** panel shows **reachable** and the same host as the running API.

## Fetch mode (dev vs production)

| Environment | Default mode | Behavior |
|-------------|--------------|----------|
| **Development** (`npm run dev`) | `auto` | Live API first; falls back to mock if endpoint fails |
| **Production build** | `api` | Live API only; shows error if snapshot unavailable |

In dev, use the filter-bar mode picker to force **Live API** or **Mock** when testing.

## Smoke test

After login:

```powershell
# Replace TOKEN after POST /api/auth/login
curl -H "Authorization: Bearer TOKEN" "http://localhost:4000/api/time-analytics/snapshot?from=2025-01-01&to=2026-12-31"
```

Expect **200** with `projects`, `customers`, and `kpis` arrays — not **404**.

## Empty charts but real project names?

The snapshot is working. Charts/KPIs stay at zero until workflow runs have
**completed time-tracking entries** (`ProductiveSeconds`, `DowntimeSeconds`,
`TimeTrackingJson`). That is a data gap, not a wiring bug.

## Temp clones (`C:\tmp\workflow-time-analytics*`)

Safe to ignore or delete after testing. They do not affect your primary repo unless
you run the API from those folders (which creates a separate small `commtrac.db`).

## Roll back to main (no analytics)

```powershell
git checkout main
dotnet build server/Commtrac.Api
npm run dev
```

`main` has no Time Analytics routes; the rest of the app is unchanged.
