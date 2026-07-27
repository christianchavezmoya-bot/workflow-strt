# Windows agent — JWT expiry retest (matrix row 9 shortcut)

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `main` @ **`6dfffec`** or newer (PR #25 merged)

**API host:** This PC (`172.20.8.16:4000`) — Mac/iPhone cannot edit your config remotely.

**Goal:** Set JWT lifetime to **1 minute** on the **Development** API so the Mac agent can verify PR #25 without waiting 12 hours. Mac agent has already installed the fixed N-go build on the physical iPhone.

**After sign-off:** Revert `ExpiresMinutes` back to **720** in `appsettings.Development.json` and restart the API.

---

## PROMPT START

You are the **Windows API agent** for the JWT expiry retest.

**Rules:**
- Change **only** `server/Commtrac.Api/appsettings.Development.json` (or use env override below)
- Do **not** change production `appsettings.json` (stays 720)
- Do **not** commit machine-specific LAN IPs
- Restart the API after the change

---

## Part 1 — Enable 1-minute JWT (pick one)

### Option A — Config file (committed on `main`)

`appsettings.Development.json` should have:

```json
"Jwt": {
  ...
  "ExpiresMinutes": 1
}
```

If your local `main` still shows `720`, pull latest or set it to `1` manually.

### Option B — Env override (no file edit)

Before starting the API:

```powershell
$env:Jwt__ExpiresMinutes = "1"
cd server\Commtrac.Api
dotnet run
```

---

## Part 2 — Restart API

Stop any running API process, then:

```powershell
cd C:\Users\cchavez\Documents\Commtrac\Codex\915\server\Commtrac.Api   # adjust path
dotnet run
```

Confirm:

```powershell
curl http://172.20.8.16:4000/api/health
```

Swagger should show **Development** environment.

---

## Part 3 — Tell Mac agent / phone tester

Reply with: **"JWT test mode on — ExpiresMinutes=1, API restarted at \<time\>"**

Mac agent (or you on iPhone) runs:

1. Log in fresh on N-go (online)
2. Wait **~2 minutes** (token expires)
3. Force-quit N-go, reopen while **online**
4. **PASS:** Login screen (not Face ID)
5. Log in again → Sync Now
6. **PASS:** Conflicts load or show *"Session expired — sign in again…"* — not the old generic *"Could not load the current server version."*

---

## Part 4 — Revert after sign-off

Set `ExpiresMinutes` back to **720** in `appsettings.Development.json`, restart API, confirm health.

| Step | Done |
|------|------|
| ExpiresMinutes = 1 (Development only) | |
| API restarted, health OK | |
| Mac notified | |
| Retest pass/fail recorded | |
| Reverted to 720 | |

---

## PROMPT END
