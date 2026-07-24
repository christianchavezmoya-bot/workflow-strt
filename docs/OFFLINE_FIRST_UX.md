# Offline-First UX Guide

**Audience:** Installers, field supervisors, PMs, QA, and support.  
**Platforms:** Web browser (office) · Phone app (Capacitor native, iOS/Android)  
**Last updated:** 2026-07-24 · Repo: `main` @ offline-first Phases A–D + release ops

---

## One-minute summary

| Surface | Offline? | What it is for |
|---------|----------|----------------|
| **Web app** | No — needs API | Project setup, approvals, admin, analytics, closing projects |
| **Phone app (online)** | Yes — caches everything for later | Field work + silent background download of your jobs |
| **Phone app (offline)** | Yes — full field execution on cached data | Resume workflows, capture steps/photos/signatures; syncs when back online |

**Golden rule for installers:** Log in on phone **once with good signal** before going to the field. After that, airplane mode is OK for assigned work that was downloaded.

---

## Platform matrix

| Capability | Web (browser) | Phone online | Phone offline |
|------------|---------------|--------------|---------------|
| Login / first setup | ✅ Required | ✅ Required once | ❌ Needs prior login |
| Create / approve projects | ✅ | ⚠️ Limited | ❌ |
| Assign users to assets | ✅ | ⚠️ Needs network | ❌ |
| View Dashboard | ✅ Live | ✅ Cache → refresh | ✅ Cached snapshot |
| My Jobs Today (installer) | ✅ | ✅ | ✅ Assigned jobs only |
| Projects list | ✅ Live | ✅ Cached | ✅ Cached (may be stale) |
| Project detail / close project | ✅ | ⚠️ Read cached; actions need network | ❌ Read-only cached |
| Assets / Installations page | ✅ Table UI | ✅ Card UI + refresh | ✅ Card UI from cache |
| Start / resume workflow | ✅ | ✅ ≤1s target (cached) | ✅ ≤1s target (cached) |
| Save step answers | ✅ Instant to server | ✅ Instant or queued | ✅ Queued locally |
| Capture photos / video | ✅ | ✅ Upload or queue | ✅ Stored locally, queued |
| Flag / resolve run issues | ✅ | ✅ | ✅ Queued |
| Pause / time tracking | ✅ | ✅ | ✅ Queued |
| Complete run | ✅ | ✅ | ✅ Queued |
| Field sign-off (on device) | ✅ | ✅ | ✅ Queued |
| Customer sign-off (email link) | ✅ | ✅ Needs network | ❌ |
| Documents (browse) | ✅ All | ✅ Cached index + files | ✅ Cached only |
| Issues board | ✅ Live | ⚠️ Cached open issues | ⚠️ Cached; new resolve queues |
| Sync Center / conflicts | N/A | ✅ | ✅ Review when online |
| Admin / Users / Settings | ✅ | ⚠️ Most need network | ❌ |
| Inspection runs (project asset) | ✅ | ⚠️ Partial | ❌ *Planned* |
| Real-time push (SSE) | ✅ | ✅ When online | ❌ Catches up on sync |

**Legend:** ✅ Works · ⚠️ Partial or stale · ❌ Not available

---

## Lifecycle journeys

### Journey A — Web only (Admin / PM)

Office setup from project creation to monitoring.

1. **Login** → Dashboard (PM portfolio, analytics, attention widgets).
2. **Projects** → New project → customer, job number, products, workflow mode.
3. **Approve** → **Start Work** on project detail page.
4. Add assets, link workflow configs, **assign installer** to each asset.
5. Monitor Dashboard attention items (blocking issues, pending sign-offs, missing photos).
6. Review completed assets on **Installations / Assets** page.
7. **Mark project as Closed** when all assets are done.

*Web always talks to the server. No offline queue.*

---

### Journey B — Phone online only (Installer)

Field work with continuous connectivity.

1. **Login** → biometric/PIN → silent **bootstrap** downloads projects, assets, configs, runs, media.
2. **Dashboard → My Jobs Today** → tap asset card → **Resume** or **Start**.
3. **Workflow runner** opens quickly from cache; background sync confirms with server.
4. Complete steps, photos, signatures → badge shows **Synced**.
5. **Assets page** card list mirrors dashboard; pull-to-refresh updates data.
6. At end of day: all runs confirmed on server; no pending queue.

---

### Journey C — Phone offline only (Installer)

Field work with no signal (after at least one prior online session).

1. Open app → Dashboard shows cached **My Jobs Today**; strip shows **No signal**.
2. Tap **Resume** → runner opens in **≤1 second** with last saved progress.
3. Every save updates the screen immediately; badge shows **Offline · ↑N pending**.
4. Photos stored on device; uploads wait for signal.
5. Complete run + field sign-off → queued locally; asset shows **Complete** locally.
6. Force-quit and reopen → all data still present.
7. **Cannot:** download a workflow never cached, send customer email link, or log in fresh.

---

### Journey D — Web setup → field phone (offline + online)

The standard production flow.

| Phase | Where | Who | What happens |
|-------|-------|-----|--------------|
| **1. Setup** | Web | Admin/PM | Create project, assets, assignments, publish workflows |
| **2. First phone login** | Phone online | Installer | Bootstrap caches all assigned work; field-ready |
| **3. Field offline** | Phone offline | Installer | Resume, capture, queue writes |
| **4. Reconnect** | Phone online | Installer | Auto-sync; temp IDs remap; conflicts in Sync Center |
| **5. Sign-off** | Phone/web online | Installer / customer | Customer signature link or on-device capture |
| **6. Close-out** | Web | Admin/PM | Verify server state; close project |

---

## Per-screen cheat sheet: online vs offline (phone)

### Global chrome (every screen)

| Element | Online | Offline |
|---------|--------|---------|
| Top bar sync badge | Synced / Syncing / ↑N pending | **Offline · ↑N** |
| Connectivity strip (below top bar) | Has signal · Server reachable | **No signal** and/or **Server not responding** |
| Biometric lock | Works | Works (session cached) |
| Bottom tabs | All navigate | All navigate (cached screens load) |

---

### Dashboard (`/`)

| | Online | Offline |
|--|--------|---------|
| **Admin / PM view** | Live analytics + attention | Cached summaries; analytics may be stale |
| **Installer: My Jobs Today** | Live assigned assets | Cached assigned assets |
| **Card actions** | Start / Resume / Sign-off / Missing photos | Same on cached assets |
| **Resume workflow** | ≤1s from cache + background reconcile | ≤1s from local run |
| **Quick action dialog** | Loads docs count from API | Skips or shows cached count |
| **What you'll see** | Green sync, fresh timestamps | Orange offline badge, last-known status chips |

---

### Projects list (`/projects`)

| | Online | Offline |
|--|--------|---------|
| **List** | Server list | Cached project names/status |
| **New / Edit project** | Works | ❌ Not available |
| **Open project detail** | Live | Cached overview only |
| **What you'll see** | Full portfolio | Subset from last bootstrap |

---

### Project detail (`/projects/:id`)

| | Online | Offline |
|--|--------|---------|
| **Overview / status stepper** | Live | Cached snapshot |
| **Start Work / Approve / Close** | Works (role permitting) | ❌ Needs network |
| **Inspection inbox tab** | Live findings | Cached if previously loaded |
| **What you'll see** | Current server status | "Last synced" data; stale banner if >4h |

---

### Installations / Assets (`/installations/assets`)

| | Online | Offline |
|--|--------|---------|
| **Layout** | Mobile cards (native) / table (web) | Mobile cards from IndexedDB |
| **Scope filter** | My assets / all (role-based) | My assets default on phone |
| **Start workflow** | Creates server run or uses cache | Creates **local run** + queue if offline |
| **Resume workflow** | Opens runner | Opens runner from local run |
| **Assign user** | Works | ❌ Needs network |
| **Issues / documents on asset** | Live | Cached issues; cached docs only |
| **Export / reports** | Full | ⚠️ Local PDF may use cached run data |
| **Pull to refresh** | Fetches server | ❌ Shows stale warning instead |
| **What you'll see** | "Last updated: Xm ago" | Yellow stale alert if cache >4h; tap refresh disabled offline |

---

### Workflow runner (popup / full-screen)

| | Online | Offline |
|--|--------|---------|
| **Open time** | ≤1s target (cached config) | ≤1s target |
| **Step navigation** | Full | Full |
| **Text / checkbox inputs** | Saves to server | Queued locally |
| **Photos / video** | Upload or queue | Local blob + queue |
| **Flag issue on step** | Creates issue | Queued on run |
| **Pause / time entries** | Synced | Queued |
| **Complete run** | Server validates | Local lock + queue (`RUN_COMPLETE`) |
| **Field sign-off pad** | Submits or queues | Queued (`SIGNATURE_SUBMIT`) |
| **Blocking issues at complete** | Server 422 if unresolved | Queued; server validates on sync |
| **What you'll see** | "Syncing…" then clear | "↑N queued actions" in runner footer |

---

### Sync Center (tap sync badge)

| | Online | Offline |
|--|--------|---------|
| **Pending queue list** | Shows all queued ops | Same — review what will flush |
| **Retry / flush** | Sends to server | ❌ Waits for signal |
| **Conflicts** | Resolve keep/discard | View only until online |
| **API debug log** | Live request history | Last session + skipped requests |

---

### Issues board (`/issues`)

| | Online | Offline |
|--|--------|---------|
| **Open issues list** | Live from server | Cached via run/asset sync |
| **Resolve with photo** | Immediate | ⚠️ Queued (implementation in progress) |
| **Link to asset repair** | Works | Works if asset cached |

---

### Documents (`/documents`)

| | Online | Offline |
|--|--------|---------|
| **Index / search** | Full library | Cached index from bootstrap |
| **Open file** | Download / stream | ✅ If prefetched; ❌ if not |
| **Upload** | Works | ❌ Queued N/A — needs network to start |

---

### Project asset inspections (`/projects/:id/assets/:assetId/inspections`)

| | Online | Offline |
|--|--------|---------|
| **Inspection runner** | Works | ⚠️ **Planned** — currently needs network to start |
| **Inspection inbox** | Live | Cached if visited before |

---

### Settings / Admin / Profile

| | Online | Offline |
|--|--------|---------|
| **Profile / biometric** | Works | View cached profile |
| **User admin / roles** | Works | ❌ |
| **Brand / office settings** | Works | Cached read-only |
| **Manual offline mode toggle** | Works | Forces offline skip even if radio on |

---

## Data available offline (after bootstrap)

Everything below is downloaded silently after login (and refreshed on reconnect / every ~4h):

| Data | Used on | Sync back when online? |
|------|---------|------------------------|
| Projects list | Dashboard, Projects, Assets filters | Read-only cache; admin edits need web |
| Project assets | Dashboard, Assets page | Status updates from local runs sync up |
| Workflow configs + steps | Runner | Read-only |
| Workflow reference media (photos in steps) | Runner | Read-only |
| Workflow assignments | Start/resume picker | Read-only |
| Workflow runs + step results | Runner, history | ✅ All mutations queue |
| Run issues | Runner, Issues board | ✅ Queued |
| Asset issues (on asset record) | Assets page, runner | ✅ Via asset/run patches |
| Signatures (installer + customer pad) | Runner, sign-off | ✅ Queued separately |
| Time entries | Runner | ✅ Queued |
| Work instructions (linked) | Runner / assets | ✅ Queued |
| Asset document links + uploads | Assets / runner | ✅ Queued |
| Captured media blobs | Runner | ✅ `MEDIA_UPLOAD` queue |
| Documents index + prefetched files | Documents page | Read-only |
| Users / products / features / brand | Labels, dropdowns | Read-only |
| Dashboard summaries | Dashboard cards | Read-only cache |

---

## Sync behavior when back online

1. App detects radio + server reachable.
2. **Sync engine** flushes queue in dependency order (create run → steps → complete → signatures).
3. Offline temp IDs (e.g. `offline-run-…`) remap to server IDs automatically.
4. **Bootstrap** may re-run to pull changes made on web while you were offline.
5. Badge goes **Syncing…** → **Synced**.
6. If someone else edited the same run: **Conflict** appears in Sync Center — choose keep yours or accept server.

---

## Installer quick reference card

```
BEFORE FIELD
  □ Log in on phone with Wi‑Fi or good cell
  □ Wait until sync badge shows Synced (bootstrap finishes in background)
  □ Open each new assignment once OR confirm it appears in My Jobs Today

IN FIELD (OFFLINE OK)
  □ Resume from Dashboard or Assets — do not need signal
  □ Orange "Offline · ↑N" is normal — your work is saved on the phone
  □ Take all photos; they upload later

BACK ONLINE
  □ Open app — sync starts automatically
  □ Check Sync Center if badge stays orange >5 min
  □ Customer email sign-off still needs signal

NEVER OFFLINE
  ✗ First login · new workflow not yet downloaded · customer email link · admin setup
```

---

## Related docs

- Engineering plan: [`OFFLINE_FIRST_IMPLEMENTATION_PLAN.md`](./OFFLINE_FIRST_IMPLEMENTATION_PLAN.md)
- Release QA: [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) (offline section)
- Field permissions: [`FIELD_RUN_QA_CHECKLIST.md`](./FIELD_RUN_QA_CHECKLIST.md)
- Mobile build: [`MOBILE_BUILD.md`](./MOBILE_BUILD.md)
